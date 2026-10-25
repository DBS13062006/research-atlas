// pnpm ingest:load — loads the corpus into PostgreSQL through sp_import_paper, 200 works per
// transaction with a savepoint per work (one malformed work never sinks its batch). A second pass
// inserts every in-corpus citation in one INSERT … SELECT, so the statement-level counter trigger
// fires once. A handful of citation pairs are held back into db/queries/dml/D10_citations.csv so the
// COPY demo (D10) has real rows to load.
import { mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { toPayload } from "../../src/lib/openalex-transform";
import { ownerUrl } from "../db/urls";
import { readCorpus } from "./lib/corpus";

const BATCH = 200;
const HELD_BACK = 25;

async function main(): Promise<void> {
  const corpus = readCorpus();
  if (corpus.size === 0) throw new Error("corpus is empty: run ingest:works first");
  const sql = postgres(`${ownerUrl()}?sslmode=disable`, { max: 1, onnotice: () => {} });
  const started = Date.now();
  const failures: { id: string; error: string }[] = [];
  let loaded = 0;
  const entries = [...corpus.values()];
  try {
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      await sql.begin(async (tx) => {
        for (const entry of batch) {
          const payload = toPayload(entry.work);
          if (!payload) {
            failures.push({ id: entry.work.id, error: "no id or title" });
            continue;
          }
          // Citations are added in the second pass; keep the per-work call cheap.
          const { referenced_works: _refs, ...rest } = payload;
          try {
            await tx.savepoint(
              (sp) => sp`CALL sp_import_paper(${sp.json(rest as postgres.JSONValue)}, NULL)`,
            );
            loaded++;
          } catch (err) {
            failures.push({ id: entry.work.id, error: err instanceof Error ? err.message : String(err) });
          }
        }
      });
      process.stdout.write(`\rloaded ${loaded}/${entries.length}`);
    }
    process.stdout.write("\n");

    // Second pass: in-corpus citation pairs.
    const pairs: [string, string][] = [];
    const ids = new Set([...corpus.keys()].map((u) => u.split("/").pop() as string));
    for (const { work } of entries) {
      const citing = work.id.split("/").pop() as string;
      for (const ref of work.referenced_works ?? []) {
        const cited = ref.split("/").pop() as string;
        if (cited !== citing && ids.has(cited)) pairs.push([citing, cited]);
      }
    }
    // Hold back a deterministic sample for the D10 bulk-load demo.
    const held = pairs.filter((_, idx) => idx % 997 === 0).slice(0, HELD_BACK);
    const heldKeys = new Set(held.map(([a, b]) => `${a}>${b}`));
    const toLoad = pairs.filter(([a, b]) => !heldKeys.has(`${a}>${b}`));
    const [{ inserted }] = await sql<{ inserted: number }[]>`
      WITH src AS (
        SELECT * FROM unnest(${toLoad.map((p) => p[0])}::TEXT[], ${toLoad.map((p) => p[1])}::TEXT[]) AS s(citing, cited)
      ), ins AS (
        INSERT INTO citation (citing_paper_id, cited_paper_id)
        SELECT a.paper_id, b.paper_id
        FROM src JOIN paper a ON a.openalex_id = src.citing JOIN paper b ON b.openalex_id = src.cited
        WHERE a.paper_id <> b.paper_id
        ON CONFLICT DO NOTHING
        RETURNING 1)
      SELECT count(*)::INT AS inserted FROM ins`;
    mkdirSync("db/queries/dml", { recursive: true });
    writeFileSync(
      "db/queries/dml/D10_citations.csv",
      `citing_openalex_id,cited_openalex_id\n${held.map(([a, b]) => `${a},${b}`).join("\n")}\n`,
    );
    console.log(`citations inserted: ${inserted} (held back ${held.length} for D10)`);
    console.log(`failures: ${failures.length}`);
    for (const f of failures.slice(0, 10)) console.log(`  ${f.id}: ${f.error}`);
    mkdirSync("data/cache", { recursive: true });
    writeFileSync("data/cache/load-failures.json", JSON.stringify(failures, null, 2));
    console.log(`took ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
