import { mnemonicToSeedSync } from "bip39";
import { derivePath } from "ed25519-hd-key";
import db from "@/config/db-config";
import { decryptSeed } from "./crypto";

export const deriveWallet = async () => {
    const seedData = await db.systemConfig.findUnique({
        where: { key: "master_seed" }
    });
    const mnemonic = decryptSeed(
        seedData,
        <string>process.env.KEY_PASSWORD);
    const index = await getNextWalletIndex();

    const seed = mnemonicToSeedSync(mnemonic);
    const path = `m/44'/784'/0'/0'/${index}'`;
    const derived = derivePath(path, seed.toString("hex")).key;
    return { derived, index };
}

export const getNextWalletIndex = async () => {
    const counter = await db.walletCounter.upsert({
        where: { id: 1 },
        update: { currentIndex: { increment: 1 } },
        create: { id: 1, currentIndex: 1 }
    });

    return counter.currentIndex;
}
