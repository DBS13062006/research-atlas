import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { RoleCode } from "@/lib/roles";
import { withAuthDb } from "@/server/db/client";
import { env } from "@/server/env";

// Sessions follow the Copenhagen Book: a 256-bit random token lives only in the browser cookie;
// the database stores its SHA-256 digest, so a leaked session table cannot be replayed.

export const SESSION_COOKIE = "ra_session";
const SESSION_DAYS = 30;
const RENEW_WHEN_DAYS_LEFT = 15;
const DAY_MS = 86_400_000;

export type SessionUser = {
  userId: number;
  publicId: string;
  name: string;
  email: string;
  role: RoleCode;
  expiresAt: Date;
};

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env().SESSION_COOKIE_SECURE,
    path: "/",
    expires: expiresAt,
  };
}

export async function createSession(userId: number, ip: string | null, userAgent: string | null) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await withAuthDb(
    (tx) =>
      tx`SELECT fn_record_login_success(${userId}, ${hashToken(token)}, ${expiresAt}, ${ip}::INET, ${userAgent})`,
  );
  return { token, expiresAt };
}

type SessionRow = {
  user_id: string;
  public_id: string;
  name: string;
  email: string;
  role_code: RoleCode;
  expires_at: Date;
};

// Returns the user for a cookie token, extending the session when fewer than 15 days remain.
export async function validateSessionToken(
  token: string,
): Promise<{ user: SessionUser; renewedUntil: Date | null } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const hash = hashToken(token);
  return withAuthDb(async (tx) => {
    const [row] = await tx<SessionRow[]>`SELECT * FROM fn_session_user(${hash})`;
    if (!row) return null;
    let renewedUntil: Date | null = null;
    if (row.expires_at.getTime() - Date.now() < RENEW_WHEN_DAYS_LEFT * DAY_MS) {
      renewedUntil = new Date(Date.now() + SESSION_DAYS * DAY_MS);
      await tx`SELECT fn_session_extend(${hash}, ${renewedUntil})`;
    }
    return {
      user: {
        userId: Number(row.user_id),
        publicId: row.public_id,
        name: row.name,
        email: row.email,
        role: row.role_code,
        expiresAt: renewedUntil ?? row.expires_at,
      },
      renewedUntil,
    };
  });
}

export async function invalidateSession(token: string, everywhere = false): Promise<number> {
  const [row] = await withAuthDb(
    (tx) => tx<{ n: number }[]>`SELECT fn_session_delete(${hashToken(token)}, ${everywhere}) AS n`,
  );
  return row?.n ?? 0;
}
