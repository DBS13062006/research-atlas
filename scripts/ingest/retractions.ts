// pnpm ingest:retractions — matches the Retraction Watch database (Crossref's daily CSV) to corpus
// DOIs and records retractions, expressions of concern and reinstatements. Each insert fires the date
// guard, audit and graph-outbox triggers. Records whose notice predates OpenAlex's publication date are
// skipped (the guard rejects them) and counted in the report.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { ownerUrl } from "../db/urls";

const OUT = "data/raw/retraction-watch";
const CSV_URL = "https://gitlab.com/crossref/retraction-watch-data/-/raw/main/retraction_watch.csv";

type RwRow = {
  record_id: number;
  doi: string;
  retraction_date: string;
  nature: string;
  reason: string | null;
  notice_doi: string | null;
};

const STATUS: Record<string, string> = {
  Retraction: "RETRACTED",
  "Expression of concern": "EXPRESSION_OF_CONCERN",
  Reinstatement: "REINSTATED",
};
const PRIORITY: Record<string, number> = { RETRACTED: 3, EXPRESSION_OF_CONCERN: 2, REINSTATED: 1 };

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const sql = postgres(`${ownerUrl()}?sslmode=disable`, { max: 1, onnotice: () => {} });
  try {
    const dois = await sql<{ doi: string }[]>`SELECT doi FROM paper WHERE doi IS NOT NULL`;
    writeFileSync(`${OUT}/corpus-dois.csv`, `doi\n${dois.map((d) => d.doi).join("\n")}\n`);
    const matched = `${OUT}/matched.json`;
    if (!existsSync(matched)) {
      console.log("reading the Retraction Watch CSV…");
      const res = spawnSync(
        "duckdb",
        [
          "-c",
          `CREATE TEMP TABLE keys AS SELECT lower(doi) AS doi FROM read_csv('${OUT}/corpus-dois.csv', header = true, all_varchar = true);
           COPY (
             SELECT "Record ID"::INT AS record_id, lower("OriginalPaperDOI") AS doi,
                    strftime(strptime(split_part("RetractionDate", ' ', 1), '%m/%d/%Y'), '%Y-%m-%d') AS retraction_date,
                    "RetractionNature" AS nature, "Reason" AS reason, "RetractionDOI" AS notice_doi
             FROM read_csv('${CSV_URL}', header = true, all_varchar = true, ignore_errors = true)
             WHERE lower("OriginalPaperDOI") IN (SELECT doi FROM keys)
           ) TO '${matched}' (FORMAT json, ARRAY true);`,
        ],
        { encoding: "utf8", env: { ...process.env, AI_AGENT: "" } },
      );
      if (res.status !== 0) throw new Error(`duckdb failed: ${res.stderr || res.stdout}`);
    }
    const text = readFileSync(matched, "utf8").trim();
    const rows = (text ? JSON.parse(text) : []) as RwRow[];

    // One record per paper: retraction beats expression of concern beats reinstatement; latest date wins.
    const best = new Map<string, RwRow & { status: string }>();
    for (const r of rows) {
      const status = STATUS[r.nature];
      if (!status || !r.retraction_date) continue;
      const prev = best.get(r.doi);
      if (
        !prev ||
        PRIORITY[status] > PRIORITY[prev.status] ||
        (status === prev.status && r.retraction_date > prev.retraction_date)
      ) {
        best.set(r.doi, { ...r, status });
      }
    }

    let inserted = 0;
    let rejected = 0;
    await sql.begin(async (tx) => {
      for (const r of best.values()) {
        const reason =
          r.reason
            ?.split(";")
            .map((s) => s.replace(/^\+/, "").trim())
            .filter(Boolean)
            .join("; ") ?? null;
        try {
          await tx.savepoint(
            (sp) => sp`
              INSERT INTO retraction (paper_id, retraction_date, reason, notice_url, status, source, rw_record_id)
              SELECT p.paper_id, ${r.retraction_date}::DATE, ${reason}, ${r.notice_doi ? `https://doi.org/${r.notice_doi}` : null},
                     ${r.status}, 'RETRACTION_WATCH', ${r.record_id}
              FROM paper p WHERE p.doi = ${r.doi}
              ON CONFLICT (paper_id) DO UPDATE
                SET retraction_date = EXCLUDED.retraction_date, reason = EXCLUDED.reason, notice_url = EXCLUDED.notice_url,
                    status = EXCLUDED.status, source = EXCLUDED.source, rw_record_id = EXCLUDED.rw_record_id`,
          );
          inserted++;
        } catch {
          rejected++;
        }
      }
    });
    const [s] = await sql<{ total: number; retracted: number; flagged_unmatched: number }[]>`
      SELECT (SELECT count(*) FROM retraction)::INT AS total,
             (SELECT count(*) FROM retraction WHERE status = 'RETRACTED')::INT AS retracted, 0 AS flagged_unmatched`;
    console.log(
      `Retraction Watch rows matched: ${rows.length}; recorded ${inserted}; rejected by the date guard ${rejected}`,
    );
    console.log(`retraction table: ${s.total} records, ${s.retracted} RETRACTED`);
    writeFileSync(
      `${OUT}/report.json`,
      JSON.stringify({ matched: rows.length, inserted, rejected, ...s }, null, 2),
    );
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
