import "server-only";

import postgres from "postgres";
import { type DbRole, isDbRole } from "@/lib/query-catalog";
import { env } from "@/server/env";

// The web app logs in as ra_app, which has no data privileges of its own. Every request runs in a
// transaction that switches to the caller's database role and tags the application user, so
// PostgreSQL's GRANTs and row-level security make the final access decision.

const globalForDb = globalThis as unknown as { atlasSql?: postgres.Sql };

export function appSql(): postgres.Sql {
  globalForDb.atlasSql ??= postgres(env().DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return globalForDb.atlasSql;
}

export type DbContext = { role: DbRole; userId: number | null };
export type Tx = postgres.TransactionSql;

export const ANONYMOUS: DbContext = { role: "ra_anon", userId: null };

export async function withDb<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  // Defence in depth: the role always comes from the fixed allow-list, never from input.
  if (!isDbRole(ctx.role)) throw new Error(`refusing unknown database role ${String(ctx.role)}`);
  return appSql().begin(async (tx) => {
    // set_config('role', …, true) is SET LOCAL ROLE with a bound parameter.
    await tx`SELECT set_config('role', ${ctx.role}, true), set_config('app.user_id', ${ctx.userId === null ? "" : String(ctx.userId)}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

// The authentication service runs as ra_app itself (no SET ROLE): only ra_app may execute the
// session-writing functions, after it has verified the password.
export async function withAuthDb<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return appSql().begin(async (tx) => fn(tx)) as Promise<T>;
}
