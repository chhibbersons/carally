import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { requireEnv } from "./env";

/**
 * Encrypts secrets we store in the database, such as a dealer's WhatsApp
 * access token (§10). AES-256-GCM with ENCRYPTION_KEY (32 bytes, base64).
 *
 * Stored format: "v1:<iv>:<auth tag>:<ciphertext>", each part base64.
 */

const VERSION = "v1";

function keyFrom(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
  }
  return key;
}

export function encryptSecret(plaintext: string, keyBase64: string = requireEnv("ENCRYPTION_KEY")): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(keyBase64), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string, keyBase64: string = requireEnv("ENCRYPTION_KEY")): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new Error("Unrecognised encrypted value");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(keyBase64), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
