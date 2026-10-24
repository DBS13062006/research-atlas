// pnpm queries:run — executes every catalog file in db/queries the way the Query Lab does: inside a
// transaction, as the file's database role, with default parameters, and always rolled back.
//   --test           run against the test database
//   --require-rows   fail if any read query (Q-file) returns no rows
//   --only Q15       run a single file
import { createReadStream, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import postgres from "postgres";
import {
  type CatalogEntry,
  maxPlaceholder,
  parseCatalogFile,
  splitSqlStatements,
} from "../../src/lib/query-catalog";
import { ownerUrl } from "../db/urls";

const args = process.argv.slice(2);
const test = args.includes("--test");
const requireRows = args.includes("--require-rows");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;

const ROOT = "db/queries";
const ROLLBACK = Symbol("rollback");

function loadCatalog(): CatalogEntry[] {
  const files = [
    ...readdirSync(ROOT).filter((f) => f.endsWith(".sql")),
    ...readdirSync(join(ROOT, "dml"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => join("dml", f)),
  ];
  return files
    .map((f) => parseCatalogFile(f, readFileSync(join(ROOT, f), "utf8")))
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
}

type Outcome = { id: string; title: string; rows: number; ms: number; error?: string };

async function main(): Promise<void> {
  const sql = postgres(`${ownerUrl({ test })}?sslmode=disable`, { max: 1, onnotice: () => {} });
  const outcomes: Outcome[] = [];
  try {
    for (const entry of loadCatalog()) {
      if (only && entry.id !== only) continue;
      const started = performance.now();
      let rows = 0;
      try {
        await sql.begin(async (tx) => {
          // Tag the request with a real user of that role, like the web app does.
          const [user] = await tx<{ user_id: string }[]>`
            SELECT u.user_id FROM user_account u JOIN role r ON r.role_id = u.role_id
            WHERE r.db_role_name = ${entry.role} AND u.is_active ORDER BY u.user_id LIMIT 1`;
          await tx`SELECT set_config('app.user_id', ${user?.user_id ?? ""}, true)`;
          const params: string[] = [];
          for (const p of entry.params) {
            const [row] = await tx.unsafe(p.defaultSql);
            const value = row ? Object.values(row)[0] : null;
            if (value === null || value === undefined)
              throw new Error(`no default value for @param ${p.name}`);
            params.push(String(value));
          }
          await tx.unsafe(`SET LOCAL ROLE ${entry.role}`); // role comes from the validated header allow-list
          for (const statement of splitSqlStatements(entry.body)) {
            if (/\bFROM\s+STDIN\b/i.test(statement)) {
              if (!entry.stdin) throw new Error("COPY FROM STDIN needs an @stdin file");
              const writable = await tx.unsafe(statement).writable();
              await pipeline(createReadStream(join(ROOT, entry.stdin)), writable);
              continue;
            }
            const result = await tx.unsafe(statement, params.slice(0, maxPlaceholder(statement)));
            rows = result.count ?? result.length;
          }
          throw ROLLBACK;
        });
      } catch (err) {
        if (err !== ROLLBACK) {
          outcomes.push({
            id: entry.id,
            title: entry.title,
            rows: 0,
            ms: performance.now() - started,
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        }
      }
      outcomes.push({ id: entry.id, title: entry.title, rows, ms: performance.now() - started });
    }
  } finally {
    await sql.end();
  }

  let failed = 0;
  for (const o of outcomes) {
    const empty = requireRows && o.id.startsWith("Q") && o.rows === 0;
    const status = o.error ? "FAIL" : empty ? "EMPTY" : "ok";
    if (o.error || empty) failed++;
    console.log(
      `${status.padEnd(5)} ${o.id.padEnd(4)} ${String(o.rows).padStart(6)} rows ${o.ms.toFixed(0).padStart(6)} ms  ${o.title}${o.error ? `\n        ${o.error}` : ""}`,
    );
  }
  console.log(
    `\n${outcomes.length - failed}/${outcomes.length} catalog files passed${test ? " (test database)" : ""}.`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
