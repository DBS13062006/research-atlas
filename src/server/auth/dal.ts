import "server-only";

import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { atLeast, can, DB_ROLE, type RoleCode } from "@/lib/roles";
import type { DbContext } from "@/server/db/client";
import type { GraphActor } from "@/server/graph/errors";
import { SESSION_COOKIE, type SessionUser, validateSessionToken } from "./session";

// Data Access Layer: the one place pages, actions and route handlers learn who is calling.
// Authorization is decided here and again by PostgreSQL (GRANTs + RLS), never by the proxy alone.

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

// Reads the session cookie once per request (React cache).
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // A session check compares expiry with the clock, so it always happens at request time.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await validateSessionToken(token);
  return result?.user ?? null;
});

export function roleOf(user: SessionUser | null): RoleCode {
  return user?.role ?? "ANONYMOUS";
}

export function dbContext(user: SessionUser | null): DbContext {
  return { role: DB_ROLE[roleOf(user)], userId: user?.userId ?? null };
}

export function graphActor(user: SessionUser): GraphActor {
  return { userId: user.userId, isCurator: atLeast(user.role, "CURATOR"), isAdmin: user.role === "ADMIN" };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401, "Sign in to continue.");
  return user;
}

export async function requireRole(minimum: RoleCode): Promise<SessionUser> {
  const user = await requireUser();
  if (!atLeast(user.role, minimum)) throw new AuthError(403, `This needs the ${minimum.toLowerCase()} role.`);
  return user;
}

export async function requirePermission(permission: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) throw new AuthError(403, `This needs the ${permission} permission.`);
  return user;
}
