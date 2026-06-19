import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Service } from "typedi";
import { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc"
import coinMarketClient from "@/config/coinMarketClient-config";
import { deriveWallet } from "@/utils/wallet/derive-wallet";
import { SystemRepository } from "@/repositories/system.repository";
import { Mode, Token } from "../../generated/prisma";
import { getCoinDecimal, getCoinType } from "@/constants/tokens.constants";
import { getSmartContractId } from "@/constants/networks.constant";
import logger from "@/utils/logger";
import { QuoteService } from "./quote.service";


type CoinMarketPriceConversionResponse = {
  status: {
    error_code: number;
  };
  data: {
    quote: Record<string, { price: number }>;
  };
};
type ConversionDirection = 'to_USDT' | 'from_USDT';
@Service()
export class WalletService {
  private PAYFRICA_ID = "0x4378b5bf4c21d313150634d529218ea11166ca113a2869a31c88deb4bb8c2417";
  private PAYFRICA_CONFIG_ID = "0x50eee353064aa82f120bfc212486acf9bd9acf5b3a3b5aadea8284ce30a20f84";
  private client!: SuiGrpcClient;
  admin_secret_key: string;
  constructor(
    private readonly systemRepository: SystemRepository,
    private readonly quoteService: QuoteService
  ) {
    this.admin_secret_key = process.env.ADMIN_SECRET_KEY as string;
  }

  private async setActiveNetwork(mode: Mode) {
    const network = mode == "live" ? "mainnet" : "testnet";
    this.client = new SuiGrpcClient({
      network,
      baseUrl: getJsonRpcFullnodeUrl(network)
    });
    return getSmartContractId(network);
  }

  async createWallet() {
    const index = await this.systemRepository.getNextWalletIndex();
    const derived = await deriveWallet(index);
    const keypair = Ed25519Keypair.fromSecretKey(derived);
    const address = keypair.getPublicKey().toSuiAddress();
    return {
      address,
      derivationIndex: index
    }
  }

  async serializeDerivedKeyToSuiSecretKey(derived: Buffer<ArrayBuffer>) {
    const keypair = Ed25519Keypair.fromSecretKey(derived);
    return keypair.getSecretKey();
  }

  async generatePaymentWallet(
    merchantAddress: string,
    amount: number,
    indexerIdentifier: string,
    token: Token,
    mode: Mode
  ) {
    const smart_contract_address = await this.setActiveNetwork(mode);
    const admin_keypair = Ed25519Keypair.fromSecretKey(this.admin_secret_key);

    const tx = new Transaction();

    tx.moveCall({
      target: `${smart_contract_address}::main::generatePaymentWallet`,
      arguments: [
        tx.pure.address(merchantAddress),
        tx.pure.u64(Math.round(amount * getCoinDecimal(token))),
        tx.pure.string(indexerIdentifier),
      ],
      typeArguments: [getCoinType(token, mode === "live" ? "mainnet" : "testnet")!],
    });
    tx.setGasBudget(10_000_000);

    const result = await this.client.signAndExecuteTransaction({
      signer: admin_keypair,
      transaction: tx,
      include: {
        effects: true,
        objectTypes: true,
      },
    });

    if (result.$kind !== "Transaction") {
      logger.error(
        `Unexpected transaction result kind: ${result.$kind}. Full result: ${JSON.stringify(result)}`
      );
      throw new APIError("Deposit wallet creation failed.", STATUS.unprocessableEntity);
    }

    const objectTypes = result.Transaction?.objectTypes ?? {};

    const createdWalletId = Object.entries(objectTypes).find(
      ([_id, type]) => type.includes("::main::Wallet")
    )?.[0] ?? null;

    if (!createdWalletId) {
      logger.error(
        `Wallet object not found in transaction objectTypes: ${JSON.stringify(objectTypes)}`
      );
      throw new APIError("Deposit wallet creation failed.", STATUS.unprocessableEntity);
    }

    return createdWalletId;
  }

  async sponsoredTransaction(
    tx: Transaction,
    merchantSecretKey: string,
    client?: SuiGrpcClient
  ) {
    if (client) {
      this.client = client;
    }

    const merchant_keypair = Ed25519Keypair.fromSecretKey(merchantSecretKey);
    const merchant_address = merchant_keypair.getPublicKey().toSuiAddress();
    const sponsor_keypair = Ed25519Keypair.fromSecretKey(this.admin_secret_key);
    const sponsor_address = sponsor_keypair.getPublicKey().toSuiAddress();

    // Build transaction kind bytes (no gas info) from merchant's perspective
    tx.setSender(merchant_address);
    tx.setGasOwner(sponsor_address);
    tx.setGasPayment([]); // empty = use sponsor's address balance

    const txBytes = await tx.build({ client: this.client });

    // Merchant signs first (can sign before sponsor since no coin refs to coordinate)
    const { signature: merchantSignature } = await merchant_keypair.signTransaction(txBytes);

    // Sponsor signs
    const { signature: sponsorSignature } = await sponsor_keypair.signTransaction(txBytes);

    // Execute with both signatures
    const result = await this.client.executeTransaction({
      transaction: txBytes,
      signatures: [merchantSignature, sponsorSignature],
      include: {
        effects: true,
        objectTypes: true,
      },
    });

    return result;
  }

  async mergeCoinObjects(
    secret_key: string,
    primaryCoinObjectId: string,
    mergeTargetsObjectIds: string[],
    mode: Mode,
  ) {
    const smart_contract_address = await this.setActiveNetwork(mode);

    // Batch fetch primary + all merge targets in one call
    const { objects } = await this.client.getObjects({
      objectIds: [primaryCoinObjectId, ...mergeTargetsObjectIds],
    });

    const [primaryObj, ...targetObjs] = objects;

    if (!primaryObj || primaryObj instanceof Error) {
      logger.info(`Primary coin object not found for ID: ${primaryCoinObjectId}`);
      throw new APIError("Primary coin not found or unavailable.", STATUS.bad);
    }

    const validMergeTargets = targetObjs
      .filter((obj): obj is Exclude<typeof obj, Error> => !(obj instanceof Error))
      .map((obj) => obj.objectId);

    if (validMergeTargets.length === 0) {
      logger.info(`No valid merge targets found for IDs: ${mergeTargetsObjectIds.join(", ")}`);
      throw new APIError("No additional coin objects available to merge.", STATUS.bad);
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${smart_contract_address}::main::merge_all_usdc`,
      arguments: [
        tx.object(primaryObj.objectId),
        tx.makeMoveVec({
          elements: validMergeTargets.map((id) => tx.object(id)),
        }),
      ],
    });

    const result = await this.sponsoredTransaction(tx, secret_key);
    return result;
  }


  async withdrawlToMerchant(
    secret_key: string,
    primaryCoinObjectId: string,
    amount: number,
    to: string,
    mode: Mode,
  ) {
    const smart_contract_address = await this.setActiveNetwork(mode);

    const { object: coinObject } = await this.client.getObject({
      objectId: primaryCoinObjectId,
    });

    if (!coinObject || coinObject instanceof Error) {
      logger.info(`Coin object not found for ID: ${primaryCoinObjectId}`);
      throw new APIError("Coin object not found or unavailable.", STATUS.bad);
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${smart_contract_address}::main::withdraw_to_merchant`,
      arguments: [
        tx.object(coinObject.objectId),
        tx.pure.u64(amount * 1000000),
        tx.pure.address(to),
      ],
    });

    const result = await this.sponsoredTransaction(tx, secret_key);
    return result;
  }

  async splitAndSend(
    secret_key: string,
    primaryCoinObjectId: string,
    amount: number,
    to: string,
    mode: Mode,
  ) {
    await this.setActiveNetwork(mode);

    const { object: coinObject } = await this.client.getObject({
      objectId: primaryCoinObjectId,
    });

    if (!coinObject || coinObject instanceof Error) {
      logger.info(`Coin object not found for ID: ${primaryCoinObjectId}`);
      throw new APIError(`Coin object not found for ID: ${primaryCoinObjectId}`, STATUS.bad);
    }

    const amountU64 = BigInt(Math.round(amount * 1_000_000));
    const tx = new Transaction();
    const [splitCoin] = tx.splitCoins(coinObject.objectId, [tx.pure.u64(amountU64)]);
    tx.transferObjects([splitCoin], tx.pure.address(to));

    return this.sponsoredTransaction(tx, secret_key);
  }

  async splitSendToMerchantsAndAdmin(
    secret_key: string,
    primaryCoinObjectId: string,
    amount: string,
    to: string,
    coinTypeIn: string,
    mode: Mode
  ) {
    await this.setActiveNetwork(mode);

    const { object: coinObject } = await this.client.getObject({
      objectId: primaryCoinObjectId,
    });

    if (!coinObject || coinObject instanceof Error) {
      throw new APIError(`Coin object not found for ID: ${primaryCoinObjectId}`, STATUS.bad);
    }

    const network = mode === "live" ? "mainnet" : "testnet";
    const coinTypeOut = getCoinType(Token.USDC, network);
    if (!coinTypeOut) {
      throw new APIError(`Could not resolve USDC coin type for network: ${network}`, STATUS.serverError);
    }

    const totalAmount = BigInt(amount);
    const tx = new Transaction();
    const signer = Ed25519Keypair.fromSecretKey(secret_key).getPublicKey().toSuiAddress();

    let coinOut: TransactionObjectArgument;
    let totalUsdcAmount: bigint;

    if (coinTypeIn === coinTypeOut) {
      coinOut = tx.object(coinObject.objectId);
      totalUsdcAmount = totalAmount;
    } else {
      const swapResult = await this.quoteService.swap(
        totalAmount,
        coinTypeIn,
        coinTypeOut,
        coinObject.objectId,
        signer,
        tx
      );
      coinOut = swapResult.coinOut;
      totalUsdcAmount = BigInt(swapResult.amountOut);
    }

    const platformFee = totalUsdcAmount / 100n; // 1%
    const platformKey = process.env.PLATFORM_PUBLIC_KEY;
    if (!platformKey) {
      throw new APIError("PLATFORM_PUBLIC_KEY is not configured", STATUS.serverError);
    }

    const [platformCoin] = tx.splitCoins(coinOut, [tx.pure.u64(platformFee)]);
    tx.transferObjects([platformCoin], tx.pure.address(platformKey));
    tx.transferObjects([coinOut], tx.pure.address(to));

    return this.sponsoredTransaction(tx, secret_key);
  }

  async convertBetweenCurrencyAndUSDT(
    amount: number,
    currency: string,
    direction: ConversionDirection
  ): Promise<number> {
    if (!amount || amount <= 0) {
      throw new APIError("Amount must be greater than 0.", STATUS.bad);
    }

    // Determine base and convert symbols dynamically
    const isToUSDT = direction === 'to_USDT';

    const symbol = isToUSDT ? currency : 'USDT';
    const convert = isToUSDT ? 'USDT' : currency;


    const res = await coinMarketClient.get<CoinMarketPriceConversionResponse>(
      "/tools/price-conversion",
      {
        params: {
          amount,
          symbol,
          convert,
        },
      }
    );

    if (
      res.status !== 200 ||
      res.data?.status?.error_code !== 0 ||
      !res.data?.data?.quote?.[convert]?.price
    ) {
      throw new APIError(
        "Unable to resolve conversion rate. Please try again.",
        STATUS.serverError
      );
    }

    return res.data.data.quote[convert].price;
  }


  async offrampSmartContractCall(
    amount: bigint,
    primaryCoinObjectId: string,
    secret_key: string,
    mode: Mode
  ) {
    if (mode == "test") {
      throw new APIError("Fiat payouts are not available in test mode.", STATUS.bad)
    }
    const tx = new Transaction();
    const coinType = getCoinType(Token.USDC, "mainnet")!; // or SUI_COIN_TYPE

    // Split the coin to cover amount + fee, then pass to off_ramp
    const [splitCoin] = tx.splitCoins(tx.object(primaryCoinObjectId), [amount]);

    tx.moveCall({
      target: `${this.PAYFRICA_ID}::payfrica_lite_v2::off_ramp`,
      arguments: [
        tx.object(this.PAYFRICA_CONFIG_ID), // Shared config object
        splitCoin,                      // Coin covering amount + fee
        tx.pure.string("NGN"),          // Target fiat currency
        tx.object.clock(),              // Sui clock (0x6)
      ],
      typeArguments: [coinType],
    });
    await this.setActiveNetwork(mode);
    const result = await this.sponsoredTransaction(tx, secret_key)
    return result;
  }

}
