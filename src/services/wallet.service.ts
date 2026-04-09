import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Service } from "typedi";
import { Transaction } from "@mysten/sui/transactions";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { getFullnodeUrl, SuiClient, SuiObjectChange } from "@mysten/sui/client";
import coinMarketClient from "@/config/coinMarketClient-config";
import { deriveWallet } from "@/utils/wallet/derive-wallet";
import { SystemRepository } from "@/repositories/system.repository";
import { Mode } from "../../generated/prisma";

type ConversionDirection = 'to_USDT' | 'from_USDT';
@Service()
export class WalletService {
  private TESTNET_SMART_CONTRACT_ADDRESS: string;
  private MAINNET_SMART_CONTRACT_ADDRESS: string;
  private PAYFRICA_ID = "0x4378b5bf4c21d313150634d529218ea11166ca113a2869a31c88deb4bb8c2417";
  private PAYFRICA_CONFIG_ID = "0x50eee353064aa82f120bfc212486acf9bd9acf5b3a3b5aadea8284ce30a20f84";
  private USDC_COIN_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
  private client!: SuiClient;
  admin_secret_key: string;
  constructor(
    private readonly systemRepository: SystemRepository
  ) {
    this.admin_secret_key = process.env.ADMIN_SECRET_KEY as string;
    this.TESTNET_SMART_CONTRACT_ADDRESS = process.env.ORAFI_SMART_CONTRACT_ADDRESS_TESTNET as string;
    this.MAINNET_SMART_CONTRACT_ADDRESS = process.env.ORAFI_SMART_CONTRACT_ADDRESS_MAIN as string;
  }

    private async setActiveNetwork(mode: Mode) {
        this.client = new SuiClient({ url: getFullnodeUrl(`${mode == "live" ? "mainnet" : "testnet"}`) });
        return mode === "live" ? this.MAINNET_SMART_CONTRACT_ADDRESS : this.TESTNET_SMART_CONTRACT_ADDRESS;
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

  async generatePaymentWallet(merchantAddress: string, amount: number, mode: Mode) {
    const smart_contract_address = await this.setActiveNetwork(mode);
    const admin_keypair = Ed25519Keypair.fromSecretKey(this.admin_secret_key);

    const tx = new Transaction();

    tx.moveCall({
      target: `${smart_contract_address}::main::generatePaymentWallet`,
      arguments: [
        tx.pure.address(merchantAddress),
        tx.pure.u64(Math.round(amount * 1000000)) // USDC has 6 decimals
      ],
    });

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

    throw new Error("Wallet creation failed");
  }

  private async sponsoredTransaction(
    tx: Transaction,
    merchantSecretKey: string,
  ) {
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
      throw new Error("Sponsor has no SUI coins for gas.");
    }

    const sponsorCoin = sponsorCoins.data[0];
    if (!sponsorCoin) {
      throw new APIError("Unable to retrieve sponsor coin", STATUS.serverError);
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
    const smart_contract_address = this.setActiveNetwork(mode);
    const tx = new Transaction();
    tx.moveCall({
      target: `${smart_contract_address}::main::merge_all_usdc`,
      arguments: [
        tx.object(primaryCoinObjectId),
        tx.makeMoveVec({
          elements: mergeTargetsObjectIds.map((id) => tx.object(id)),
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
    const smart_contract_address = this.setActiveNetwork(mode);
    const tx = new Transaction();
    tx.moveCall({
      target: `${smart_contract_address}::main::withdraw_to_merchant`,
      arguments: [
        tx.object(primaryCoinObjectId),
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
    this.setActiveNetwork(mode);
    const tx = new Transaction();
    const [new_coin] = tx.splitCoins(primaryCoinObjectId, [tx.pure.u64(Math.round(amount * 1000000))]);
    tx.transferObjects([new_coin], tx.pure.address(to));

    const result = await this.sponsoredTransaction(tx, secret_key);
    return result;
  }

  async splitSendToMerchantsAndAdmin(
    secret_key: string,
    primaryCoinObjectId: string,
    amount: string, // amount in smallest unit (u64)
    to: string,
    mode: Mode
  ) {
    await this.setActiveNetwork(mode);
    const tx = new Transaction();
    // Normalize amount
    const totalAmount = BigInt(amount);

    // 1% platform fee
    const platformFee = totalAmount / 100n;

    // Split out platform fee
    const [platformCoin] = tx.splitCoins(
      tx.object(primaryCoinObjectId),
      [tx.pure.u64(platformFee.toString())]
    );

    // Send platform fee
    tx.transferObjects(
      [platformCoin],
      tx.pure.address(String(process.env.PLATFORM_PUBLIC_KEY))
    );

    // Send remaining balance to merchant
    tx.transferObjects(
      [tx.object(primaryCoinObjectId)],
      tx.pure.address(to)
    );

    const result = await this.sponsoredTransaction(tx, secret_key);
    return result;
  }


  async convertBetweenCurrencyAndUSDT(
    amount: number,
    currency: string,
    direction: ConversionDirection
  ) {
    if (!amount || amount <= 0) {
      throw new APIError('Invalid amount', STATUS.bad);
    }

    // Determine base and convert symbols dynamically
    const isToUSDT = direction === 'to_USDT';

    const symbol = isToUSDT ? currency : 'USDT';
    const convert = isToUSDT ? 'USDT' : currency;

    const res = await coinMarketClient.get("/tools/price-conversion", {
      params: {
        amount,
        symbol,
        convert,
      },
    });

    if (
      res.status !== 200 ||
      res.data?.status?.error_code !== 0 ||
      !res.data?.data?.quote?.[convert]?.price
    ) {
      throw new APIError(
        'Unable to resolve conversion rate',
        STATUS.serverError
      );
    }

    return res.data.data.quote[convert].price;
  }


  async offrampSmartContractCall(
    amount: bigint,
    secret_key: string,
    mode: Mode
  ) {
    // Fee: 0.5% flat for amounts 1–500 USDC or 1–500 SUI
    const fee = (amount * 5n) / 1000n; // 0.5%

    const tx = new Transaction();
    const coinType = this.USDC_COIN_TYPE; // or SUI_COIN_TYPE

    // Split the coin to cover amount + fee, then pass to off_ramp
    const [splitCoin] = tx.splitCoins(tx.gas, [amount + fee]);

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
