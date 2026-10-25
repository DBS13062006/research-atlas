// pnpm cypher:run — runs every file in graph/queries inside a transaction that is always rolled
// back, with default parameters computed from the data. --require-rows fails on an empty result.
import { readdirSync, readFileSync } from "node:fs";
import neo4j from "neo4j-driver";
import { parseCatalogFile } from "../../src/lib/query-catalog";
import { closeGraphDriver, graphDriver } from "../../src/server/graph/driver";

const requireRows = process.argv.includes("--require-rows");

function cast(type: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (type === "int") return neo4j.int(Number(value));
  if (type === "float") return Number(value);
  if (type === "boolean") return Boolean(value);
  return String(value);
}

async function main(): Promise<void> {
  const files = readdirSync("graph/queries")
    .filter((f) => f.endsWith(".cypher"))
    .sort();
  const session = graphDriver().session();
  let failed = 0;
  try {
    for (const file of files) {
      const entry = parseCatalogFile(file, readFileSync(`graph/queries/${file}`, "utf8"));
      const started = performance.now();
      const tx = session.beginTransaction();
      try {
        const params: Record<string, unknown> = {};
        for (const p of entry.params) {
          const r = await tx.run(p.defaultSql);
          const raw = r.records[0]?.get(0);
          if (raw === undefined || raw === null) throw new Error(`no default value for $${p.name}`);
          params[p.name] = cast(p.type, raw);
        }
        const res = await tx.run(entry.body, params);
        const rows = res.records.length;
        const empty = requireRows && rows === 0;
        if (empty) failed++;
        console.log(
          `${empty ? "EMPTY" : "ok   "} ${entry.id} ${String(rows).padStart(5)} rows ${(performance.now() - started).toFixed(0).padStart(5)} ms  ${entry.title}`,
        );
      } catch (err) {
        failed++;
        console.log(`FAIL  ${entry.id}  ${entry.title}\n        ${err instanceof Error ? err.message : err}`);
      } finally {
        await tx.rollback();
      }
    }
  } finally {
    await session.close();
    await closeGraphDriver();
  }
  console.log(`\n${files.length - failed}/${files.length} Cypher catalog files passed.`);
  if (failed) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
