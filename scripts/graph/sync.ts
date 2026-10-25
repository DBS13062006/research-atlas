// pnpm graph:sync — drains pending graph_outbox rows into Neo4j. With --watch it keeps listening for
// NOTIFY graph_outbox and drains within a second of each change (development mode).
import { closeGraphDriver, graphDriver } from "../../src/server/graph/driver";
import { drainOutbox, type InTransaction } from "../../src/server/graph/projection";
import { ownerSql } from "./common";

async function main(): Promise<void> {
  const sql = ownerSql();
  const driver = graphDriver();
  const started = Date.now();
  const inTx: InTransaction = (fn) => sql.begin(fn) as ReturnType<typeof fn>;
  const { processed } = await drainOutbox(inTx, driver);
  console.log(
    `graph:sync processed ${processed} outbox rows in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
  if (!process.argv.includes("--watch")) {
    await sql.end();
    await closeGraphDriver();
    return;
  }
  let pending: NodeJS.Timeout | undefined;
  await sql.listen("graph_outbox", () => {
    clearTimeout(pending);
    pending = setTimeout(async () => {
      try {
        const r = await drainOutbox(inTx, driver);
        if (r.processed > 0) console.log(`synced ${r.processed}`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
      }
    }, 300);
  });
  console.log("listening for graph_outbox notifications…");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
