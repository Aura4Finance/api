import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Service } from "typedi";
import { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { getFullnodeUrl, SuiClient, SuiObjectChange } from "@mysten/sui/client";
import coinMarketClient from "@/config/coinMarketClient-config";
import { deriveWallet } from "@/utils/wallet/derive-wallet";
import { SystemRepository } from "@/repositories/system.repository";
import { Mode, Token } from "../../generated/prisma";
import { getCoinDecimal, getCoinType } from "@/constants/tokens.constants";
import { getSmartContractId } from "@/constants/networks.constant";
import logger from "@/utils/logger";
import { SevenKAggService } from "./7k-agg.service";
import { CetusService } from "./cetus.service";

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
  private client!: SuiClient;
  admin_secret_key: string;
  constructor(
    private readonly systemRepository: SystemRepository,
    private readonly sevenKAggService: SevenKAggService,
    private readonly cetusService: CetusService
  ) {
    this.admin_secret_key = process.env.ADMIN_SECRET_KEY as string;
  }

  private async setActiveNetwork(mode: Mode) {
    this.client = new SuiClient({ url: getFullnodeUrl(`${mode == "live" ? "mainnet" : "testnet"}`) });
    return getSmartContractId(mode === "live" ? "mainnet" : "testnet");
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
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
    
    const createdWallet = (result.objectChanges as SuiObjectChange[]).find((change) =>
      change.type === "created" && change.objectType.includes("::main::Wallet")
    );

    if (createdWallet && createdWallet.type === "created") {
      return createdWallet.objectId;
    }

    logger.error(`Failed to create payment wallet. Transaction result: ${JSON.stringify(result)}`);
    throw new APIError("Deposit wallet creation failed!.", STATUS.unprocessableEntity);
  }

   async sponsoredTransaction(
    tx: Transaction,
    merchantSecretKey: string,
    client?: SuiClient
  ) {
    if(client){
      this.client = client;
    }
    // Merchant builds the transaction kind (no gas)
    const merchant_keypair = Ed25519Keypair.fromSecretKey(merchantSecretKey);
    const merchant_address = merchant_keypair.getPublicKey().toSuiAddress();
    tx.setSender(merchant_address);

    // Build unsigned transaction (no gas)
    const kindBytes = await tx.build({
      client: this.client,
      onlyTransactionKind: true,
    });
    // Sponsor adds gas payment  // Sponsor setup
    const sponsor_keypair = Ed25519Keypair.fromSecretKey(this.admin_secret_key);
    const sponsor_address = sponsor_keypair.getPublicKey().toSuiAddress();

    const sponsorCoins = await this.client.getAllCoins({ owner: sponsor_address });
    if (sponsorCoins.data.length === 0) {
      throw new APIError("Service temporarily unavailable. Please try again.", STATUS.serverUnavailable);
    }

    const sponsorCoin = sponsorCoins.data[0];
    if (!sponsorCoin) {
      logger.error(`No sponsor gas coin found for address: ${sponsor_address}`);
      throw new APIError("Unable to retrieve sponsor gas coin.", STATUS.serverError);
    }

    const sponsoredTx = Transaction.fromKind(kindBytes);
    sponsoredTx.setSender(merchant_address);
    sponsoredTx.setGasPayment([
      {
        objectId: sponsorCoin.coinObjectId.toString(),
        version: sponsorCoin.version.toString(),
        digest: sponsorCoin.digest.toString(),
      },
    ]);
    sponsoredTx.setGasOwner(sponsor_address);
    sponsoredTx.setGasBudget(100000000);

    // Build transaction bytes
    const txBytes = await sponsoredTx.build({ client: this.client });

    // Sign with both parties
    const merchantSignature = (await merchant_keypair.signTransaction(txBytes)).signature;
    const sponsorSignature = (await sponsor_keypair.signTransaction(txBytes)).signature;

    // Execute transaction once with both signatures
    const result = await this.client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: [merchantSignature, sponsorSignature],
      options: {
        showEffects: true,
        showObjectChanges: true,
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

    // Fetch the latest coin objects with current versions to avoid stale version errors
    const primaryCoin = await this.client.getObject({
      id: primaryCoinObjectId,
      options: { showOwner: true, showContent: true, showType: true }
    });

    if (!primaryCoin.data) {
      logger.info(`Primary coin object not found for ID: ${primaryCoinObjectId}`);
      throw new APIError("Primary coin not found or unavailable.", STATUS.bad);
    }

    // Fetch all merge target coins with current versions
    const mergeTargets = await Promise.all(
      mergeTargetsObjectIds.map((id) =>
        this.client.getObject({
          id,
          options: { showOwner: true, showContent: true, showType: true }
        })
      )
    );

    const validMergeTargets = mergeTargets
      .filter((target) => target.data)
      .map((target) => target.data!.objectId);

    if (validMergeTargets.length === 0) {
      logger.info(`No valid merge targets found for IDs: ${mergeTargetsObjectIds.join(", ")}`);
      throw new APIError("No additional coin objects available to merge.", STATUS.bad);
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${smart_contract_address}::main::merge_all_usdc`,
      arguments: [
        tx.object(primaryCoin.data.objectId),
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

    // Fetch the latest coin object with current version to avoid stale version errors
    const coinObject = await this.client.getObject({
      id: primaryCoinObjectId,
      options: { showOwner: true, showContent: true, showType: true }
    });

    if (!coinObject.data) {
      logger.info(`Coin object not found for ID: ${primaryCoinObjectId}`);
      throw new APIError("Coin object not found or unavailable.", STATUS.bad);
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${smart_contract_address}::main::withdraw_to_merchant`,
      arguments: [
        tx.object(coinObject.data.objectId),
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
  mode: Mode
) {
  await this.setActiveNetwork(mode);

  const coinObject = await this.client.getObject({
    id: primaryCoinObjectId,
    options: { showOwner: true, showContent: true, showType: true },
  });

  if (!coinObject.data) {
    throw new APIError(`Coin object not found for ID: ${primaryCoinObjectId}`, STATUS.bad);
  }

  const amountU64 = BigInt(Math.round(amount * 1_000_000));
  const tx = new Transaction();
  const [splitCoin] = tx.splitCoins(coinObject.data.objectId, [tx.pure.u64(amountU64)]);
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

  const coinObject = await this.client.getObject({
    id: primaryCoinObjectId,
    options: { showOwner: true, showContent: true, showType: true },
  });

  if (!coinObject.data) {
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
    coinOut = tx.object(coinObject.data.objectId);
    totalUsdcAmount = totalAmount;
  } else {
    const swapResult = await this.resolveSwap(
      totalAmount,
      coinTypeIn,
      coinTypeOut,
      coinObject.data.objectId,
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

private async resolveSwap(
  totalAmount: bigint,
  coinTypeIn: string,
  coinTypeOut: string,
  coinObjectId: string,
  signer: string,
  tx: Transaction
): Promise<{ coinOut: TransactionObjectArgument; amountOut: string }> {
  const sevenKAgg = await this.sevenKAggService.swapTokens(
    totalAmount,
    coinTypeIn,
    coinTypeOut,
    signer,
    tx
  );

  if (sevenKAgg) {
    return {
      coinOut: sevenKAgg.coinOut,
      amountOut: sevenKAgg.bestQuote.amountOut,
    };
  }

  const cetus = await this.cetusService.swapTokens(
    totalAmount,
    coinTypeIn,
    coinTypeOut,
    tx.object(coinObjectId),
    tx
  );

  if (cetus) {
    return {
      coinOut: cetus.coinOut,
      amountOut: cetus.bestQuote.amountOut,
    };
  }

  throw new APIError("Failed to swap token: no route found via 7K or Cetus", STATUS.serverError);
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
