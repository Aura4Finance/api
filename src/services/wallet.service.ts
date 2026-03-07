import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Service } from "typedi";
import { Transaction } from "@mysten/sui/transactions";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { SuiClient } from "@mysten/sui/client";
import coinMarketClient from "@/config/coinMarketClient-config";
import { deriveWallet } from "@/utils/wallet/derive-wallet";

type ConversionDirection = 'to_USDT' | 'from_USDT';
@Service()
export class WalletService {
  private smart_contract_address: any;
  //private USDC_COIN_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"; 
  //private PAYFRICA_ID = "0xe945ec6c4e688d654025d375e321d709f67ed6935ccbd21e94abb66af63ea7b1";
  admin_secret_key: string;
  constructor() {
    this.admin_secret_key = process.env.ADMIN_SECRET_KEY as string;
    this.smart_contract_address = process.env.ORAFI_SMART_CONTRACT_ADDRESS as string;
  }

  async createWallet() {
    const { derived, index } = await deriveWallet();
    const keypair = Ed25519Keypair.fromSecretKey(derived);
    const address = keypair.getPublicKey().toSuiAddress();
    return {
      address,
      derivationIndex: index
    }
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

  
  // async offRampSmartContractCall( 
  //   amount: bigint, 
  //   cryptoAsset: string, 
  //   coinType: string = this.USDC_COIN_TYPE 
  // ){
  //    const CRYPTO_DECIMALS: Record<string, number> = { SUI: 1e9, USDC: 1e6, }; 
  //    const upperCrypto = cryptoAsset.toUpperCase(); 
  //    const decimals = CRYPTO_DECIMALS[upperCrypto] || 1e6; 
  //    const tx = new Transaction(); // Use BigInt for all fee calculations to avoid precision issues 
  //    const fee = (amount * BigInt(5)) / BigInt(1000); 

  //    if (upperCrypto === "SUI") { // Set explicit gas budget of 0.01 SUI (10,000,000 MIST)
  //     tx.setGasBudget(10_000_000);
  //    } 
     
  //   let coin; // Safety check for userBalance to avoid NaN 
  //   const safeUserBalance = Number(userBalance) || 0; 
  //   if ( BigInt(Math.floor(Number(amount))) == BigInt(Math.floor(safeUserBalance * decimals)) ) { 
  //     coin = await handleMergeSplit( client, tx, amount - fee, fee, coinType, address ); 
  //   } else { 
  //     coin = await handleMergeSplit(client, tx, amount, fee, coinType, address); 
  //   } if (coin.feeSplit) { 
  //     tx.transferObjects( [coin.feeSplit], 
  //     tx.pure.address( "0xdcfd7fd641a0d74b8fb83ae9949c560eb6c183a3d8c3b975e697527eada62b45" ) ); 
  //   } tx.moveCall({ 
  //     target: `${PAYFRICA_ID}::payfrica::off_ramp`, 
  //     arguments: [ 
  //       coin.split, tx.pure.string(sessionState?.to || "NGN"), 
  //       tx.object.clock(), 
  //     ], 
  //     typeArguments: [coinType] }); 
  //     try { 
  //       const result = await signAndExecuteTransaction({ transaction: tx, }); // Return transaction digest (hash) return 
  //       result.digest; 
  //     } 
  //       catch (error) { 
  //         throw error; 
  //       } 
  //     };


}
