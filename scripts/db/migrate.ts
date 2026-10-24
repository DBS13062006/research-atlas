// Migration runner around dbmate.
//   tsx scripts/db/migrate.ts up            apply pending migrations
//   tsx scripts/db/migrate.ts reset         drop, create and migrate from zero
//   tsx scripts/db/migrate.ts down-all      roll back every migration, one at a time
//   tsx scripts/db/migrate.ts status
// Add --test to target the separate test database (POSTGRES_DB + "_test").
import { spawnSync } from "node:child_process";
import postgres from "postgres";
import { env } from "../../src/server/env";
import { ownerUrl } from "./urls";

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith("--")) ?? "up";
const test = args.includes("--test");
const url = ownerUrl({ test });

function dbmate(...cmd: string[]): void {
  const res = spawnSync(
    "dbmate",
    ["--url", `${url}?sslmode=disable`, "--migrations-dir", "db/migrations", "--no-dump-schema", ...cmd],
    { stdio: "inherit" },
  );
  if (res.error) throw res.error;
  if (res.status !== 0) process.exit(res.status ?? 1);
}

// The ra_app login password lives only in .env.local, so it is applied after migrating rather
// than written into a migration file. The value travels as a bind parameter, never as SQL text.
async function applyAppPassword(): Promise<void> {
  const password = env().APP_DB_PASSWORD;
  if (!password) return;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const [row] = await sql`SELECT 1 AS present FROM pg_roles WHERE rolname = 'ra_app'`;
    if (!row) return;
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('ra.app_password', ${password}, true)`;
      await tx`
        DO $$ BEGIN
          EXECUTE format('ALTER ROLE ra_app PASSWORD %L', current_setting('ra.app_password'));
        END $$`;
    });
  } finally {
    await sql.end();
  }
}

async function countApplied(): Promise<number> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const [row] = await sql<{ n: number }[]>`
      SELECT CASE WHEN to_regclass('public.schema_migrations') IS NULL THEN 0
                  ELSE (SELECT count(*)::int FROM schema_migrations) END AS n`;
    return row?.n ?? 0;
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  switch (command) {
    case "up":
      dbmate("up"); // creates the database first when it does not exist
      await applyAppPassword();
      break;
    case "reset":
      dbmate("drop");
      dbmate("up");
      await applyAppPassword();
      break;
    case "down-all": {
      let n = await countApplied();
      while (n > 0) {
        dbmate("rollback");
        n = await countApplied();
      }
      console.log("All migrations rolled back.");
      break;
    }
    case "status":
      dbmate("status");
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(2);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
