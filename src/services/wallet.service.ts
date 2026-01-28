import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Service } from "typedi";
import { Transaction } from "@mysten/sui/transactions";
import axios from "axios";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { SuiClient } from "@mysten/sui/client";

type ConversionDirection = 'NGN_TO_USDT' | 'USDT_TO_NGN';
@Service()
export class WalletService {
  private smart_contract_address: any;
  admin_secret_key: string;
  constructor() {
    this.admin_secret_key = process.env.ADMIN_SECRET_KEY as string;
    this.smart_contract_address = process.env.ORAFI_SMART_CONTRACT_ADDRESS as string;
  }

  async createWallet() {
    const keypair = new Ed25519Keypair();
    const privateKey = keypair.getSecretKey();
    const publicKey = keypair.getPublicKey().toSuiAddress();

    return { privateKey, publicKey };
  }

  async generatePaymentWallet(merchantAddress: string, amount: number, client: any) {
    const admin_keypair = Ed25519Keypair.fromSecretKey(this.admin_secret_key);

    const tx = new Transaction();

    tx.moveCall({
      target: `${this.smart_contract_address}::main::generatePaymentWallet`,
      arguments: [
        tx.pure.address(merchantAddress),
        tx.pure.u64(Math.round(amount * 1000000)) // USDC has 6 decimals
      ],
    });

    const result = await client.signAndExecuteTransaction({
      signer: admin_keypair,
      transaction: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    const createdWallet = result.objectChanges?.find(
      (change: { type: string; objectType: string | string[] }) =>
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
    client: SuiClient
  ) {
    // Merchant builds the transaction kind (no gas)
    const merchant_keypair = Ed25519Keypair.fromSecretKey(merchantSecretKey);
    const merchant_address = merchant_keypair.getPublicKey().toSuiAddress();
    tx.setSender(merchant_address);

    // Build unsigned transaction (no gas)
    const kindBytes = await tx.build({
      client,
      onlyTransactionKind: true,
    });
    // Sponsor adds gas payment  // Sponsor setup
    const sponsor_keypair = Ed25519Keypair.fromSecretKey(this.admin_secret_key);
    const sponsor_address = sponsor_keypair.getPublicKey().toSuiAddress();

    const sponsorCoins = await client.getAllCoins({ owner: sponsor_address });
    if (sponsorCoins.data.length === 0) {
      throw new Error("Sponsor has no SUI coins for gas.");
    }

    const sponsorCoin = sponsorCoins.data[0];
    if(!sponsorCoin) {
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
    const txBytes = await sponsoredTx.build({ client });

    // Sign with both parties
    const merchantSignature = (await merchant_keypair.signTransaction(txBytes)).signature;
    const sponsorSignature = (await sponsor_keypair.signTransaction(txBytes)).signature;

    // Execute transaction once with both signatures
    const result = await client.executeTransactionBlock({
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
    client: SuiClient
  ) {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.smart_contract_address}::main::merge_all_usdc`,
      arguments: [
        tx.object(primaryCoinObjectId),
        tx.makeMoveVec({
          elements: mergeTargetsObjectIds.map((id) => tx.object(id)),
        }),
      ],
    });
    const result = await this.sponsoredTransaction(tx, secret_key, client);
    return result;

  }


  async withdrawlToMerchant(
    secret_key: string,
    primaryCoinObjectId: string,
    amount: number,
    to: string,
    client: SuiClient
  ) {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.smart_contract_address}::main::withdraw_to_merchant`,
      arguments: [
        tx.object(primaryCoinObjectId),
        tx.pure.u64(amount * 1000000),
        tx.pure.address(to),
      ],
    });
    const result = await this.sponsoredTransaction(tx, secret_key, client);
    return result;
  }

  async splitAndSend(
    secret_key: string,
    primaryCoinObjectId: string,
    amount: number,
    to: string,
    client: any
  ) {

    const tx = new Transaction();
    const [new_coin] = tx.splitCoins(primaryCoinObjectId, [tx.pure.u64(Math.round(amount * 1000000))]);
    tx.transferObjects([new_coin], tx.pure.address(to));

    const result = await this.sponsoredTransaction(tx, secret_key, client);
    return result;
  }

async splitSendToMerchantsAndAdmin(
  secret_key: string,
  primaryCoinObjectId: string,
  amount: string, // amount in smallest unit (u64)
  to: string,
  client: SuiClient
) {
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

  const result = await this.sponsoredTransaction(tx, secret_key, client);
  return result;
}


async convertBetweenNGNAndUSDT(
  amount: number,
  direction: ConversionDirection
) {
  const res = await axios.get(
    'https://pro-api.coinmarketcap.com/v1/tools/price-conversion',
    {
      params: {
        amount: 1,
        symbol: 'USDT',
        convert: 'NGN',
      },
      headers: {
        Accept: 'application/json',
        'X-CMC_PRO_API_KEY': process.env.CMC_API_KEY!,
      },
    }
  );

  if (
    res.status !== 200 ||
    res.data?.status?.error_code !== 0 ||
    !res.data?.data?.quote?.NGN?.price
  ) {
    throw new APIError(
      'Unable to resolve USDT price',
      STATUS.serverError
    );
  }

  const usdtPriceInNGN = res.data.data.quote.NGN.price;

  if (direction === 'NGN_TO_USDT') {
    return amount / usdtPriceInNGN;
  }

  // USDT_TO_NGN
  return amount * usdtPriceInNGN;
}



}
