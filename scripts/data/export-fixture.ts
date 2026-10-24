// pnpm data:fixture — exports a connected 200-paper slice of the loaded corpus to db/seed/fixture.sql,
// so CI and a fresh clone can run the whole app without an OpenAlex key. The slice keeps every
// retracted paper with its citers (the Integrity Radar stays real), the most-cited papers, and enough
// of their citers to keep the citation graph connected; all linked rows come along.
import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { ownerUrl } from "../db/urls";

const TARGET = 200;

// Per table: the column list to export (generated columns excluded) and the subset filter.
const TABLES: { table: string; columns: string; where: string; order: string; identity?: string }[] = [
  {
    table: "institution",
    columns: "institution_id, openalex_id, ror_id, institution_name, country_code, institution_type, website",
    where:
      "institution_id IN (SELECT institution_id FROM author WHERE author_id IN (SELECT author_id FROM paper_author WHERE paper_id IN (SELECT id FROM fx)) UNION SELECT affiliation_institution_id FROM paper_author WHERE paper_id IN (SELECT id FROM fx))",
    order: "institution_id",
    identity: "institution_id",
  },
  {
    table: "venue",
    columns: "venue_id, openalex_id, venue_name, venue_type, publisher, issn_l",
    where: "venue_id IN (SELECT venue_id FROM paper WHERE paper_id IN (SELECT id FROM fx))",
    order: "venue_id",
    identity: "venue_id",
  },
  {
    table: "author",
    columns: "author_id, openalex_id, orcid, author_name, institution_id, profile_url",
    where: "author_id IN (SELECT author_id FROM paper_author WHERE paper_id IN (SELECT id FROM fx))",
    order: "author_id",
    identity: "author_id",
  },
  {
    table: "topic",
    columns: "topic_id, openalex_id, topic_name, topic_level, description, parent_topic_id",
    where:
      "topic_id IN (SELECT a.topic_id FROM paper_topic pt, LATERAL (WITH RECURSIVE up AS (SELECT t.topic_id, t.parent_topic_id FROM topic t WHERE t.topic_id = pt.topic_id UNION ALL SELECT t.topic_id, t.parent_topic_id FROM up JOIN topic t ON t.topic_id = up.parent_topic_id) SELECT topic_id FROM up) a WHERE pt.paper_id IN (SELECT id FROM fx))",
    order: "topic_level, topic_id",
    identity: "topic_id",
  },
  {
    table: "paper",
    columns:
      "paper_id, openalex_id, doi, arxiv_id, title, abstract, publication_date, venue_id, work_type, open_access, oa_status, cited_by_count, paper_url",
    where: "paper_id IN (SELECT id FROM fx)",
    order: "paper_id",
    identity: "paper_id",
  },
  {
    table: "paper_author",
    columns: "paper_id, author_id, author_order, is_corresponding, affiliation_institution_id",
    where: "paper_id IN (SELECT id FROM fx)",
    order: "paper_id, author_order",
  },
  {
    table: "citation",
    columns: "citing_paper_id, cited_paper_id",
    where: "citing_paper_id IN (SELECT id FROM fx) AND cited_paper_id IN (SELECT id FROM fx)",
    order: "citing_paper_id, cited_paper_id",
  },
  {
    table: "paper_topic",
    columns: "paper_id, topic_id, relevance_score, is_primary",
    where: "paper_id IN (SELECT id FROM fx)",
    order: "paper_id, topic_id",
  },
  {
    table: "method",
    columns: "method_id, method_name, method_category, description, introduced_year, pwc_slug",
    where: "method_id IN (SELECT method_id FROM paper_method WHERE paper_id IN (SELECT id FROM fx))",
    order: "method_id",
    identity: "method_id",
  },
  {
    table: "paper_method",
    columns: "paper_id, method_id, usage_type",
    where: "paper_id IN (SELECT id FROM fx)",
    order: "paper_id, method_id",
  },
  {
    table: "dataset",
    columns: "dataset_id, dataset_name, modality, domain, dataset_url, description, pwc_slug",
    where: "dataset_id IN (SELECT dataset_id FROM paper_dataset WHERE paper_id IN (SELECT id FROM fx))",
    order: "dataset_id",
    identity: "dataset_id",
  },
  {
    table: "paper_dataset",
    columns: "paper_id, dataset_id, usage_type",
    where: "paper_id IN (SELECT id FROM fx)",
    order: "paper_id, dataset_id",
  },
  {
    table: "resource",
    columns: "resource_id, paper_id, resource_type, resource_url",
    where: "paper_id IN (SELECT id FROM fx)",
    order: "resource_id",
    identity: "resource_id",
  },
  {
    table: "retraction",
    columns: "retraction_id, paper_id, retraction_date, reason, notice_url, status, source, rw_record_id",
    where: "paper_id IN (SELECT id FROM fx)",
    order: "retraction_id",
    identity: "retraction_id",
  },
];

async function main(): Promise<void> {
  const sql = postgres(`${ownerUrl()}?sslmode=disable`, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      // Choose the slice.
      await tx`CREATE TEMP TABLE fx (id BIGINT PRIMARY KEY) ON COMMIT DROP`;
      await tx`INSERT INTO fx SELECT paper_id FROM (SELECT paper_id FROM retraction WHERE status = 'RETRACTED' ORDER BY paper_id LIMIT 6) r`;
      await tx`INSERT INTO fx SELECT DISTINCT c.citing_paper_id FROM citation c WHERE c.cited_paper_id IN (SELECT id FROM fx)
               ORDER BY 1 LIMIT 20 ON CONFLICT DO NOTHING`;
      await tx`INSERT INTO fx SELECT paper_id FROM paper ORDER BY local_citation_count DESC, paper_id LIMIT 110 ON CONFLICT DO NOTHING`;
      const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::INT AS n FROM fx`;
      await tx`
        INSERT INTO fx
        SELECT c.citing_paper_id FROM citation c
        WHERE c.cited_paper_id IN (SELECT id FROM fx) AND c.citing_paper_id NOT IN (SELECT id FROM fx)
        GROUP BY c.citing_paper_id ORDER BY count(*) DESC, c.citing_paper_id
        LIMIT ${TARGET - n}
        ON CONFLICT DO NOTHING`;

      const parts: string[] = [
        "-- Fixture: a connected 200-paper slice of the real corpus (OpenAlex, CC0; Retraction Watch via Crossref;",
        "-- Papers with Code archive). Generated by `pnpm data:fixture`; load with `pnpm db:seed:fixture`.",
        "BEGIN;",
      ];
      for (const t of TABLES) {
        const [{ doc }] = await tx.unsafe<{ doc: string | null }[]>(
          `SELECT jsonb_agg(to_jsonb(x) ORDER BY ${t.order})::TEXT AS doc FROM (SELECT ${t.columns} FROM ${t.table} WHERE ${t.where}) x`,
        );
        if (!doc) continue;
        if (doc.includes("$fx$")) throw new Error(`${t.table}: data contains the dollar-quote tag`);
        const overriding = t.identity ? " OVERRIDING SYSTEM VALUE" : "";
        parts.push(
          `INSERT INTO ${t.table} (${t.columns})${overriding}\nSELECT ${t.columns} FROM jsonb_populate_recordset(NULL::${t.table}, $fx$${doc}$fx$);`,
        );
      }
      for (const t of TABLES.filter((x) => x.identity)) {
        parts.push(
          `SELECT setval(pg_get_serial_sequence('${t.table}', '${t.identity}'), coalesce((SELECT max(${t.identity}) FROM ${t.table}), 1));`,
        );
      }
      parts.push("COMMIT;", "");
      writeFileSync("db/seed/fixture.sql", parts.join("\n"));
      const [{ papers, citations }] = await tx<{ papers: number; citations: number }[]>`
        SELECT (SELECT count(*) FROM fx)::INT AS papers,
               (SELECT count(*) FROM citation WHERE citing_paper_id IN (SELECT id FROM fx) AND cited_paper_id IN (SELECT id FROM fx))::INT AS citations`;
      console.log(`db/seed/fixture.sql: ${papers} papers, ${citations} citations among them`);
    });
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
