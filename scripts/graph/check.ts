// pnpm graph:check — fails loudly when the graph has drifted from PostgreSQL.
import { closeGraphDriver, graphDriver } from "../../src/server/graph/driver";
import { compareCounts } from "../../src/server/graph/projection";
import { ownerSql } from "./common";

async function main(): Promise<void> {
  const sql = ownerSql();
  try {
    const rows = await compareCounts(sql, graphDriver());
    // Derived edges are checked too: COAUTHOR must match the author pairs that share a paper.
    const [{ pairs }] = await sql<{ pairs: number }[]>`
      SELECT count(*)::INT AS pairs FROM (
        SELECT DISTINCT a.author_id, b.author_id FROM paper_author a
        JOIN paper_author b ON b.paper_id = a.paper_id AND a.author_id < b.author_id) x`;
    const session = graphDriver().session({ defaultAccessMode: "READ" });
    try {
      const res = await session.run("MATCH ()-[c:COAUTHOR]->() RETURN count(c) AS n");
      rows.push({ item: "COAUTHOR (derived)", postgres: pairs, graph: Number(res.records[0].get("n")) });
    } finally {
      await session.close();
    }
    const [{ pending }] = await sql<
      { pending: number }[]
    >`SELECT count(*)::INT AS pending FROM graph_outbox WHERE processed_at IS NULL`;
    let drift = 0;
    for (const r of rows) {
      const ok = r.postgres === r.graph;
      if (!ok) drift++;
      console.log(
        `${ok ? "ok   " : "DRIFT"} ${r.item.padEnd(18)} postgres ${String(r.postgres).padStart(7)}  graph ${String(r.graph).padStart(7)}`,
      );
    }
    console.log(`pending outbox rows: ${pending}`);
    if (drift > 0) {
      console.error(`${drift} item(s) drifted; run pnpm graph:sync, or pnpm graph:rebuild`);
      process.exitCode = 1;
    } else {
      console.log("graph:check passed: 0 drift");
    }
  } finally {
    await sql.end();
    await closeGraphDriver();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
