// pnpm graph:schema — applies graph/schema.cypher and waits for the indexes to come online.
import { readFileSync } from "node:fs";
import { closeGraphDriver, graphDriver } from "../../src/server/graph/driver";

async function main(): Promise<void> {
  const statements = readFileSync("graph/schema.cypher", "utf8")
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*\/\/.*$/gm, "").trim())
    .filter(Boolean);
  const session = graphDriver().session();
  try {
    for (const statement of statements) await session.run(statement);
    await session.run("CALL db.awaitIndexes(300)");
    const res = await session.run(
      "SHOW INDEXES YIELD name, type, state RETURN name, type, state ORDER BY type, name",
    );
    for (const r of res.records)
      console.log(`${String(r.get("type")).padEnd(9)} ${String(r.get("state")).padEnd(7)} ${r.get("name")}`);
    console.log(`applied ${statements.length} statements`);
  } finally {
    await session.close();
    await closeGraphDriver();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
