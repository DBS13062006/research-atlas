// Writes data/ingest-report.json: what the pipeline loaded, checked against the plan's gate.
import { mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { ownerUrl } from "../db/urls";

async function main(): Promise<void> {
  const sql = postgres(`${ownerUrl()}?sslmode=disable`, { max: 1, onnotice: () => {} });
  try {
    const [c] = await sql<Record<string, number>[]>`
      SELECT (SELECT count(*) FROM paper)::INT AS papers,
             (SELECT count(*) FROM citation)::INT AS citations,
             (SELECT count(*) FROM author)::INT AS authors,
             (SELECT count(*) FROM institution)::INT AS institutions,
             (SELECT count(*) FROM venue)::INT AS venues,
             (SELECT count(*) FROM topic)::INT AS topics,
             (SELECT count(*) FROM method)::INT AS methods,
             (SELECT count(*) FROM dataset)::INT AS datasets,
             (SELECT count(*) FROM paper_method)::INT AS paper_methods,
             (SELECT count(*) FROM paper_dataset)::INT AS paper_datasets,
             (SELECT count(*) FROM resource)::INT AS resources,
             (SELECT count(*) FROM retraction)::INT AS retractions,
             (SELECT count(*) FROM paper WHERE abstract IS NOT NULL)::INT AS papers_with_abstract,
             round(100.0 * (SELECT count(*) FROM paper p WHERE EXISTS (SELECT 1 FROM paper_method x WHERE x.paper_id = p.paper_id)
                                OR EXISTS (SELECT 1 FROM paper_dataset y WHERE y.paper_id = p.paper_id))
                   / greatest((SELECT count(*) FROM paper), 1), 1)::FLOAT AS method_or_dataset_pct`;
    const gate = {
      papers_at_least_2000: c.papers >= 2000,
      citations_at_least_6000: c.citations >= 6000,
      retractions_at_least_25: c.retractions >= 25,
      method_or_dataset_on_40pct: c.method_or_dataset_pct >= 40,
    };
    const report = {
      generated_at: new Date().toISOString(),
      counts: c,
      gate,
      gate_passed: Object.values(gate).every(Boolean),
    };
    mkdirSync("data", { recursive: true });
    writeFileSync("data/ingest-report.json", `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
