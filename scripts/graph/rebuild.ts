// pnpm graph:rebuild — wipes the projected part of the graph and reloads it from PostgreSQL in batches
// of 1,000. Graph-native data (trails, curated relations) and job-owned paper properties (embedding,
// map coordinates, analytics scores) are kept; only papers that no longer exist in PostgreSQL go.
// COAUTHOR edges hang off the recreated Author nodes, so they are derived again at the end.
// Outbox rows written before the rebuild started are marked processed, later ones stay pending.
import { closeGraphDriver, graphDriver } from "../../src/server/graph/driver";
import {
  applyRows,
  PROJECTED_LABELS,
  PROJECTED_RELS,
  REBUILD_ORDER,
} from "../../src/server/graph/projection";
import { deriveCoauthors } from "./coauthors";
import { ownerSql } from "./common";

async function main(): Promise<void> {
  const sql = ownerSql();
  const driver = graphDriver();
  const started = Date.now();
  try {
    const [{ max }] = await sql<
      { max: string | null }[]
    >`SELECT max(outbox_id)::TEXT AS max FROM graph_outbox`;
    const session = driver.session();
    try {
      for (const rel of PROJECTED_RELS) {
        await session.run(`MATCH ()-[x:${rel}]->() CALL (x) { DELETE x } IN TRANSACTIONS OF 10000 ROWS`);
      }
      for (const label of PROJECTED_LABELS) {
        await session.run(`MATCH (n:${label}) CALL (n) { DETACH DELETE n } IN TRANSACTIONS OF 5000 ROWS`);
      }
      const ids = (await sql<{ paper_id: number }[]>`SELECT paper_id::INT FROM paper`).map((r) => r.paper_id);
      await session.run(
        "MATCH (p:Paper) WHERE NOT p.paperId IN $ids CALL (p) { DETACH DELETE p } IN TRANSACTIONS OF 5000 ROWS",
        { ids },
      );
      await session.run("MATCH (p:Paper) SET p.isRetracted = false, p.retractionStatus = null");
    } finally {
      await session.close();
    }
    for (const step of REBUILD_ORDER) {
      let n = 0;
      for await (const rows of sql.unsafe<{ row: unknown }[]>(step.query).cursor(1000)) {
        await applyRows(
          driver,
          step.aggregate,
          "UPSERT",
          rows.map((r) => r.row),
        );
        n += rows.length;
      }
      console.log(`${step.aggregate.padEnd(14)} ${n}`);
    }
    const derived = driver.session();
    try {
      console.log(`${"coauthor".padEnd(14)} ${await deriveCoauthors(derived)} (re-derived)`);
    } finally {
      await derived.close();
    }
    if (max) {
      const r =
        await sql`UPDATE graph_outbox SET processed_at = now() WHERE processed_at IS NULL AND outbox_id <= ${max}::BIGINT`;
      console.log(`marked ${r.count} outbox rows as covered by the rebuild`);
    }
    console.log(`graph:rebuild done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } finally {
    await sql.end();
    await closeGraphDriver();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
