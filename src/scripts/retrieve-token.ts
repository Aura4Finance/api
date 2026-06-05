import { deriveWallet } from "@/utils/wallet/derive-wallet";
import { WalletService } from "@/services/wallet.service";
import { Container } from "typedi";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { getCoinType } from "@/constants/tokens.constants";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

const claimToken = async (paymentWallet: { derivationIndex: number }) => {
    const walletService = Container.get(WalletService);
    const derivedWalletBuffer = await deriveWallet(paymentWallet.derivationIndex);
    const secretKey = await walletService.serializeDerivedKeyToSuiSecretKey(derivedWalletBuffer);
    console.log(secretKey);
    const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
    const coinObject = await client.getCoins({
        coinType: getCoinType('LOFI', 'mainnet'),
        owner: Ed25519Keypair.fromSecretKey(secretKey).getPublicKey().toSuiAddress()
    });
    console.log(`Total Coins Retrieved: ${coinObject.data.length}`);
    const tx = new Transaction()
    for (const coin of coinObject.data) {
        tx.transferObjects([coin.coinObjectId], "0xc9f89b41c8e9a4f1d1cf16477500cc303fe9720f5c3b55211d4694a5ebcd1ad9");
    }
    walletService.sponsoredTransaction(tx, secretKey, client).then(() => {
        console.log("Transaction successful!");
    }).catch((error) => {
        console.error("Transaction failed:", error);
    });
}

claimToken({ derivationIndex: 5 }).catch(console.error);
