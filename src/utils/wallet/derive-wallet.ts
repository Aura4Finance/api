import { mnemonicToSeedSync } from "bip39";
import { derivePath } from "ed25519-hd-key";
import { systemRepository } from "@/repositories/system.repository";
import { decryptSeed } from "@/utils/wallet/crypto";
import { wipeSensitive } from "@/utils/wallet/wipe";
import { SystemConfig } from "@/generated/prisma/client";

export const deriveWallet = async (index: number) => {
    const seedData = await systemRepository.findConfig("master_seed");
    const mnemonic = decryptSeed(
        seedData as SystemConfig,
        <string>process.env.KEY_PASSWORD);
    const seed = mnemonicToSeedSync(mnemonic);
    const path = `m/44'/784'/0'/0'/${index}'`;
    const derived = derivePath(path, seed.toString("hex")).key;

    // Copy the derived key before wiping source buffers
    const result = Buffer.alloc(derived.length);
    derived.copy(result);

    // Wipe all sensitive intermediates
    wipeSensitive(mnemonic, seed, derived);

    return result;
}
