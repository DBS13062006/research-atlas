// pnpm graph:check — fails loudly when the graph has drifted from PostgreSQL.
import { closeGraphDriver, graphDriver } from "../../src/server/graph/driver";
import { compareCounts } from "../../src/server/graph/projection";
import { ownerSql } from "./common";

async function main(): Promise<void> {
  const sql = ownerSql();
  try {
    const rows = await compareCounts(sql, graphDriver());
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
