// pnpm db:seed:fixture — loads db/seed/fixture.sql into a freshly migrated database.
import postgres from "postgres";
import { ownerUrl } from "./urls";

async function main(): Promise<void> {
  const test = process.argv.includes("--test");
  const sql = postgres(`${ownerUrl({ test })}?sslmode=disable`, { max: 1, onnotice: () => {} });
  try {
    const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::INT AS n FROM paper`;
    if (n > 0) {
      console.log(
        `paper already has ${n} rows; run pnpm db:reset first to load the fixture into an empty database`,
      );
      return;
    }
    await sql.file("db/seed/fixture.sql");
    const [s] = await sql<{ papers: number; citations: number }[]>`
      SELECT (SELECT count(*) FROM paper)::INT AS papers, (SELECT count(*) FROM citation)::INT AS citations`;
    await sql`CALL sp_refresh_analytics()`;
    console.log(`fixture loaded: ${s.papers} papers, ${s.citations} citations`);
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
