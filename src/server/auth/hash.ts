// Argon2id password hashing with the OWASP minimum parameters (m = 19 MiB, t = 2, p = 1).
// Kept free of `server-only` so the seed scripts can hash demo passwords with the same settings.
import { hash, verify } from "@node-rs/argon2";

const ARGON2ID = 2; // @node-rs/argon2 Algorithm.Argon2id

export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
