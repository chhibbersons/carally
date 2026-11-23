import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../../src/lib/crypto";

const key = Buffer.alloc(32, 7).toString("base64");
const otherKey = Buffer.alloc(32, 8).toString("base64");

describe("encryptSecret", () => {
  it("round-trips and never stores the plain text", () => {
    const stored = encryptSecret("EAAG-secret-token", key);
    expect(stored).not.toContain("EAAG");
    expect(stored.startsWith("v1:")).toBe(true);
    expect(decryptSecret(stored, key)).toBe("EAAG-secret-token");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same", key)).not.toBe(encryptSecret("same", key));
  });

  it("fails with the wrong key or a tampered value", () => {
    const stored = encryptSecret("token", key);
    expect(() => decryptSecret(stored, otherKey)).toThrow();
    const parts = stored.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
  });

  it("rejects a key that isn't 32 bytes", () => {
    expect(() => encryptSecret("x", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
