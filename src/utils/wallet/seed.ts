import bip39 from "bip39";
import db from "@/config/db-config";
import { encryptSeed } from "@/utils/wallet/crypto";
import logger from "../logger";

export const initializeSeed = async () => {
  const existing = await db.systemConfig.findUnique({
    where: { key: "master_seed" }
  });

  if (existing) {
    logger.info("Master seed already exists");
    return;
  }

  const mnemonic = bip39.generateMnemonic(256);

  const encrypted = encryptSeed(
    mnemonic,
    <string>process.env.KEY_PASSWORD
  );

  await db.systemConfig.create({
    data: {
      key: "master_seed",
      encryptedSeedPhrase: encrypted.encrypted,
      iv: encrypted.iv,
      authTag: encrypted.tag
    }
  });

 logger.info("Master seed generated");
}


