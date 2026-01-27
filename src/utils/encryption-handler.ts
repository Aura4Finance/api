import crypto from "crypto";

type EncResult = {
  encryptedData: string; // hex
  iv: string;            // hex
  tag: string;           // hex
  key: string;           // hex
};

export const encrypt = (text: string): EncResult => {
  // 256-bit key for AES-256-GCM
  const key = crypto.randomBytes(32);        // 32 bytes
  const iv = crypto.randomBytes(12);         // 12 bytes recommended for GCM

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Convert to hex for storage/transport
  const out = {
    encryptedData: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    key: key.toString("hex"),
  };

  // zero the key buffer in memory (best effort)
  key.fill(0);

  return out;
};

export const decrypt = (encryptedHex: string, keyHex: string, ivHex: string, tagHex: string): string => {
  const encrypted = Buffer.from(encryptedHex, "hex");
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  // zero key buffer
  key.fill(0);

  return decrypted.toString("utf8");
};
