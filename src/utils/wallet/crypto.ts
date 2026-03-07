import crypto from "crypto";

const ALGO = "aes-256-gcm";

const deriveKey = (password: string) => {
  return crypto.pbkdf2Sync(password, "orafi-salt", 100000, 32, "sha256");
}

export const encryptSeed = (seed: string, password: string) => {
  const iv = crypto.randomBytes(16);
  const key = deriveKey(password);

  const cipher = crypto.createCipheriv(ALGO, key, iv);

  let encrypted = cipher.update(seed, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

export const decryptSeed = (data: any, password: string) => {
  const key = deriveKey(password);

  const decipher = crypto.createDecipheriv(
    ALGO,
    key,
    Buffer.from(data.iv, "hex")
  );

  decipher.setAuthTag(Buffer.from(data.authTag, "hex"));

  let decrypted = decipher.update(data.encryptedSeed, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
