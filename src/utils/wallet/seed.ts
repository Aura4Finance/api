import * as bip39 from "bip39";
import { systemRepository } from "@/repositories/system.repository";
import { encryptSeed } from "@/utils/wallet/crypto";
import logger from "../logger";

export const initializeSeed = async () => {
  const existing = await systemRepository.findConfig("master_seed");

  if (existing) {
    logger.info("Master seed already exists");
    return;
  }

  const mnemonic = bip39.generateMnemonic(256);

  const encrypted = encryptSeed(
    mnemonic,
    <string>process.env.KEY_PASSWORD
  );

  await systemRepository.createConfig({
    key: "master_seed",
    encryptedSeedPhrase: encrypted.encrypted,
    iv: encrypted.iv,
    authTag: encrypted.tag
  });

  logger.info("Master seed generated");
}


