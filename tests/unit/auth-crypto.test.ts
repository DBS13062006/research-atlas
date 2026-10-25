import { describe, expect, it } from "vitest";
import { ARGON2_OPTIONS, hashPassword, verifyPassword } from "@/server/auth/hash";
import { generateSessionToken, hashToken } from "@/server/auth/session";

describe("password hashing", () => {
  it("produces Argon2id hashes with the OWASP minimum parameters", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).toContain(
      `m=${ARGON2_OPTIONS.memoryCost},t=${ARGON2_OPTIONS.timeCost},p=${ARGON2_OPTIONS.parallelism}`,
    );
  });

  it("verifies the right password and rejects a wrong one or a malformed hash", async () => {
    const hash = await hashPassword("s3cret-passphrase");
    expect(await verifyPassword(hash, "s3cret-passphrase")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
});

describe("session tokens", () => {
  it("are 256-bit random values in base64url", () => {
    const t = generateSessionToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(t, "base64url")).toHaveLength(32);
    expect(generateSessionToken()).not.toBe(t);
  });

  it("are stored only as a SHA-256 hex digest", () => {
    const h = hashToken("abc");
    expect(h).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
