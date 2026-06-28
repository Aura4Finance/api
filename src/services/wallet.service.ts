import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Service } from "typedi";
import { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { SuiJsonRpcClient, JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc';
import coinMarketClient from "@/config/coinMarketClient-config";
import { deriveWallet } from "@/utils/wallet/derive-wallet";
import { SystemRepository } from "@/repositories/system.repository";
import { Mode, Token } from "@/generated/prisma/client";
import { getCoinDecimal, getCoinType } from "@/constants/tokens.constants";
import { getSmartContractId } from "@/constants/networks.constant";
import logger from "@/utils/logger";
import { QuoteService } from "@/services/quote.service";
import { decimalToBigInt } from "@/utils/decimal-to-big-int";

type CoinMarketPriceConversionResponse = {
  status: {
    error_code: number;
  };
  data: {
    quote: Record<string, { price: number }>;
  };
};

type ConversionDirection = 'to_USDT' | 'from_USDT';

// Ref shape the SDK needs to skip object resolution at build time
type ObjectRef = { objectId: string; version: string; digest: string };

@Service()
export class WalletService {
  private PAYFRICA_ID = "0x4378b5bf4c21d313150634d529218ea11166ca113a2869a31c88deb4bb8c2417";
  private PAYFRICA_CONFIG_ID = "0x50eee353064aa82f120bfc212486acf9bd9acf5b3a3b5aadea8284ce30a20f84";
  private client!: SuiJsonRpcClient;
  admin_secret_key: string;

  constructor(
    private readonly systemRepository: SystemRepository,
    private readonly quoteService: QuoteService,
  ) {
    this.admin_secret_key = process.env.ADMIN_SECRET_KEY as string;
  }

  private async setActiveNetwork(mode: Mode) {
    const network = mode == "live" ? "mainnet" : "testnet";
    this.client = new SuiJsonRpcClient({
      network,
      transport: new JsonRpcHTTPTransport({
        url: String(mode === "test" ? "https://sui-testnet.gateway.tatum.io" : "https://sui-mainnet.gateway.tatum.io"),
        rpc: {
          headers: {
            "x-api-key": String(mode === "test" ? process.env.TATUM_TESTNET_KEY : process.env.TATUM_MAINNET_KEY),
          },
        },
      }),
    });
    return getSmartContractId(network);
  }

  // Fetches a full objectRef (id + version + digest) — use this instead of tx.object(id)
  // to prevent the SDK from making extra RPC calls at tx.build() time
  private async getObjectRef(id: string): Promise<ObjectRef> {
    const obj = await this.client.getObject({ id });
    if (obj.error || !obj.data) {
      throw new APIError(`Object not found: ${id}`, STATUS.bad);
    }
    return {
      objectId: obj.data.objectId,
      version: obj.data.version,
      digest: obj.data.digest,
    };
  }

  // Fetches sponsor gas coins — one call, returns the ref needed for setGasPayment
  private async getSponsorGasRef(sponsorAddress: string): Promise<ObjectRef> {
    const { data: gasCoins } = await this.client.getCoins({
      owner: sponsorAddress,
      coinType: "0x2::sui::SUI",
    });
    if (!gasCoins.length || !gasCoins[0]) {
      throw new APIError("Sponsor has no SUI for gas", STATUS.serverError);
    }
    const c = gasCoins[0];
    return { objectId: c.coinObjectId, version: c.version, digest: c.digest };
  }

  async createWallet() {
    const index = await this.systemRepository.getNextWalletIndex();
    const derived = await deriveWallet(index);
    const keypair = Ed25519Keypair.fromSecretKey(derived);
    const address = keypair.getPublicKey().toSuiAddress();
    return { address, derivationIndex: index };
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
        tx.pure.u64(decimalToBigInt(amount, getCoinDecimal(token))),
        tx.pure.string(indexerIdentifier),
      ],
      typeArguments: [getCoinType(token, mode === "live" ? "mainnet" : "testnet")!],
    });
    tx.setGasBudget(10_000_000);

    const result = await this.client.signAndExecuteTransaction({
      signer: admin_keypair,
      transaction: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    if (result.effects?.status.status === "failure") {
      logger.error(
        `Unexpected transaction result digest: ${result.digest}. Full result: ${JSON.stringify(result)}`
      );
      throw new APIError("Deposit wallet creation failed.", STATUS.unprocessableEntity);
    }

    const objectTypes = result.effects?.created;
    const createdWalletId = objectTypes?.find(
      (object) => object.reference.objectId.includes("::main::Wallet")
    );

    if (!createdWalletId) {
      logger.error(
        `Wallet object not found in transaction objectTypes: ${JSON.stringify(objectTypes)}`
      );
      throw new APIError("Deposit wallet creation failed.", STATUS.unprocessableEntity);
    }

    return createdWalletId.reference.objectId;
  }

  async sponsoredTransaction(
    tx: Transaction,
    merchantSecretKey: string,
    client?: SuiJsonRpcClient
  ) {
    if (client) {
      this.client = client;
    }

    const merchant_keypair = Ed25519Keypair.fromSecretKey(merchantSecretKey);
    const merchant_address = merchant_keypair.getPublicKey().toSuiAddress();
    const sponsor_keypair = Ed25519Keypair.fromSecretKey(this.admin_secret_key);
    const sponsor_address = sponsor_keypair.getPublicKey().toSuiAddress();

    tx.setSender(merchant_address);
    tx.setGasOwner(sponsor_address);

    // Explicit gas ref — prevents SDK from calling getReferenceGasPrice + getCheckpoint
    const gasRef = await this.getSponsorGasRef(sponsor_address);
    tx.setGasPayment([gasRef]);
    tx.setGasPrice(1000n);
    tx.setGasBudget(10_000_000n);

    // No client passed to build() — SDK won't make any resolution RPC calls
    const txBytes = await tx.build({ client: this.client });

    const { signature: merchantSignature } = await merchant_keypair.signTransaction(txBytes);
    const { signature: sponsorSignature } = await sponsor_keypair.signTransaction(txBytes);

    return this.client.core.executeTransaction({
      transaction: txBytes,
      signatures: [merchantSignature, sponsorSignature],
      include: {
        effects: true,
        objectTypes: true,
      },
    });
  }

  async mergeCoinObjects(
    secret_key: string,
    primaryCoinObjectId: string,
    mergeTargetsObjectIds: string[],
    mode: Mode,
  ) {
    const smart_contract_address = await this.setActiveNetwork(mode);

    const objects = await this.client.core.getObjects({
      objectIds: [primaryCoinObjectId, ...mergeTargetsObjectIds],
    });

    const [primaryObj, ...targetObjs] = objects.objects;

    if (primaryObj instanceof Error || !primaryObj) {
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
        tx.objectRef({ objectId: primaryObj.objectId, version: primaryObj.version!, digest: primaryObj.digest! }),
        tx.makeMoveVec({
          elements: validMergeTargets.map((id) => tx.object(id)),
        }),
      ],
    });

    return this.sponsoredTransaction(tx, secret_key);
  }

  async withdrawlToMerchant(
    secret_key: string,
    amount: number,
    to: string,
    mode: Mode,
  ) {
    const smart_contract_address = await this.setActiveNetwork(mode);
    const balance = decimalToBigInt(amount, getCoinDecimal("USDC"));
    const network = mode === "live" ? "mainnet" : "testnet";

    const tx = new Transaction();
    tx.moveCall({
      target: `${smart_contract_address}::main::withdraw_to_merchant`,
      arguments: [
        tx.coin({
          balance,
          type: getCoinType("USDC", network)!
        }),
        tx.pure.u64(balance),
        tx.pure.address(to),
      ],
    });

    return this.sponsoredTransaction(tx, secret_key);
  }

  async splitAndSend(
    secret_key: string,
    amount: number,
    to: string,
    mode: Mode,
  ) {
    await this.setActiveNetwork(mode);
    const network = mode === "live" ? "mainnet" : "testnet";
    const balance = decimalToBigInt(amount, getCoinDecimal("USDC"));

    const tx = new Transaction();
    tx.transferObjects(
      tx.coin({
        balance,
        type: getCoinType("USDC", network)!
      }),
      tx.pure.address(to));

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
    const coinRef = await this.getObjectRef(primaryCoinObjectId);
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
      coinOut = tx.objectRef(coinRef);
      totalUsdcAmount = totalAmount;
    } else {
      const swapResult = await this.quoteService.swap(
        totalAmount,
        coinTypeIn,
        coinTypeOut,
        primaryCoinObjectId,
        signer,
        tx
      );
      coinOut = swapResult.coinOut;
      totalUsdcAmount = BigInt(swapResult.amountOut);
    }

    const platformFee = totalUsdcAmount / 100n;
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

    const isToUSDT = direction === 'to_USDT';
    const symbol = isToUSDT ? currency : 'USDT';
    const convert = isToUSDT ? 'USDT' : currency;

    const res = await coinMarketClient.get<CoinMarketPriceConversionResponse>(
      "/tools/price-conversion",
      { params: { amount, symbol, convert } }
    );

    if (
      res.status !== 200 ||
      res.data?.status?.error_code !== 0 ||
      !res.data?.data?.quote?.[convert]?.price
    ) {
      throw new APIError("Unable to resolve conversion rate. Please try again.", STATUS.serverError);
    }

    return res.data.data.quote[convert].price;
  }

  async offrampSmartContractCall(
    amount: number,
    secret_key: string,
    mode: Mode
  ) {
    if (mode == "test") {
      throw new APIError("Fiat payouts are not available in test mode.", STATUS.bad);
    }
    await this.setActiveNetwork(mode);

    const tx = new Transaction();
    const coinType = getCoinType(Token.USDC, "mainnet")!;
    const balance = decimalToBigInt(amount, getCoinDecimal(Token.USDC));
    const payfrica_config_ref = await this.getObjectRef(this.PAYFRICA_CONFIG_ID);

    tx.moveCall({
      target: `${this.PAYFRICA_ID}::payfrica_lite_v2::off_ramp`,
      arguments: [
        tx.objectRef(payfrica_config_ref),
        tx.coin({
          type: coinType,
          balance
        }),
        tx.pure.string("NGN"),
        tx.object.clock(),
      ],
      typeArguments: [coinType],
    });

    return this.sponsoredTransaction(tx, secret_key);
  }
}