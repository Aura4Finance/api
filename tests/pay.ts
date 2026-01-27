import { Transaction } from "@mysten/sui/transactions";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

const USDC_TYPE =
  "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";

const PACKAGE_ID = "0x15149164d86a1b58ed8f0031a685c33533ec6cd0431b12736f0ee6c58bf736d8";
const MODULE = "main";
const FUNCTION = "pay";

const pay = async (
    amount: number,
    WALLET_OBJECT_ID: string
) => {
  const PRIVATE_KEY =
    "suiprivkey1qqjg32h8ke4elvym3qzx0arwh4xe3xqlu048u6k3s8ks3cmrke9dzx7uwmp";

  const client = new SuiClient({ url: getFullnodeUrl("testnet") });

  const keypair = Ed25519Keypair.fromSecretKey(
    decodeSuiPrivateKey(PRIVATE_KEY).secretKey
  );

  console.log(keypair.getPublicKey().toSuiAddress());

  const sender = keypair.getPublicKey().toSuiAddress();

  // 1️⃣ Find a USDC coin with enough balance
  const coins = await client.getCoins({
    owner: sender,
    coinType: USDC_TYPE,
  });

  const coin = coins.data.find(
    (c) => BigInt(c.balance) >= BigInt(amount)
  );

  if (!coin) {
    throw new Error("Insufficient USDC balance");
  }

  // 2️⃣ Build transaction
  const tx = new Transaction();

  // Split exact payment amount
  const [paymentCoin] = tx.splitCoins(
    tx.object(coin.coinObjectId),
    [tx.pure.u64(amount)]
  );

  // 3️⃣ Call your Move function
  tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE}::${FUNCTION}`,
    arguments: [
      paymentCoin,                 // Coin<USDC>
      tx.object(WALLET_OBJECT_ID), // Wallet
    ],
  });

  // 4️⃣ Sign and execute
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });

  console.log("Payment successful:", result.digest);
};

pay(140416, "0xace9ee05e0004c379f88fe8ed93df0224398f15789af4ea51c4c0cb19cccdfd8" );