import "server-only";

import type { Driver } from "neo4j-driver";
import type { Sql } from "postgres";

// How each PostgreSQL table is projected into the graph. The same idempotent Cypher serves the
// outbox replay (pnpm graph:sync, curator actions) and the full rebuild (pnpm graph:rebuild).
// UPSERT rows are the table row as JSON (to_jsonb), DELETE rows are the primary key.

type Projection = { upsert: string; delete: string };

export const PROJECTIONS: Record<string, Projection> = {
  institution: {
    upsert: `UNWIND $rows AS r
      MERGE (i:Institution {institutionId: toInteger(r.institution_id)})
      SET i.name = r.institution_name, i.countryCode = r.country_code, i.type = r.institution_type`,
    delete: `UNWIND $rows AS r MATCH (i:Institution {institutionId: toInteger(r.institution_id)}) DETACH DELETE i`,
  },
  venue: {
    upsert: `UNWIND $rows AS r
      MERGE (v:Venue {venueId: toInteger(r.venue_id)})
      SET v.name = r.venue_name, v.type = r.venue_type, v.publisher = r.publisher`,
    delete: `UNWIND $rows AS r MATCH (v:Venue {venueId: toInteger(r.venue_id)}) DETACH DELETE v`,
  },
  topic: {
    upsert: `UNWIND $rows AS r
      MERGE (t:Topic {topicId: toInteger(r.topic_id)})
      SET t.name = r.topic_name, t.level = toInteger(r.topic_level)
      WITH t, r
      OPTIONAL MATCH (t)-[old:SUBTOPIC_OF]->()
      DELETE old
      WITH t, r
      OPTIONAL MATCH (parent:Topic {topicId: toInteger(r.parent_topic_id)})
      FOREACH (_ IN CASE WHEN parent IS NULL THEN [] ELSE [1] END | MERGE (t)-[:SUBTOPIC_OF]->(parent))`,
    delete: `UNWIND $rows AS r MATCH (t:Topic {topicId: toInteger(r.topic_id)}) DETACH DELETE t`,
  },
  method: {
    upsert: `UNWIND $rows AS r
      MERGE (m:Method {methodId: toInteger(r.method_id)})
      SET m.name = r.method_name, m.category = r.method_category`,
    delete: `UNWIND $rows AS r MATCH (m:Method {methodId: toInteger(r.method_id)}) DETACH DELETE m`,
  },
  dataset: {
    upsert: `UNWIND $rows AS r
      MERGE (d:Dataset {datasetId: toInteger(r.dataset_id)})
      SET d.name = r.dataset_name, d.modality = r.modality, d.domain = r.domain`,
    delete: `UNWIND $rows AS r MATCH (d:Dataset {datasetId: toInteger(r.dataset_id)}) DETACH DELETE d`,
  },
  author: {
    upsert: `UNWIND $rows AS r
      MERGE (a:Author {authorId: toInteger(r.author_id)})
      SET a.name = r.author_name, a.hIndex = coalesce(toInteger(r.h_index), a.hIndex)
      WITH a, r
      OPTIONAL MATCH (a)-[old:AFFILIATED_WITH]->()
      DELETE old
      WITH a, r
      OPTIONAL MATCH (i:Institution {institutionId: toInteger(r.institution_id)})
      FOREACH (_ IN CASE WHEN i IS NULL THEN [] ELSE [1] END | MERGE (a)-[:AFFILIATED_WITH]->(i))`,
    delete: `UNWIND $rows AS r MATCH (a:Author {authorId: toInteger(r.author_id)}) DETACH DELETE a`,
  },
  // Embedding, map coordinates and analytics scores are owned by the graph jobs and are kept here.
  paper: {
    upsert: `UNWIND $rows AS r
      MERGE (p:Paper {paperId: toInteger(r.paper_id)})
      SET p.title = r.title,
          p.year = CASE WHEN r.publication_date IS NULL THEN null ELSE toInteger(left(r.publication_date, 4)) END,
          p.publicationDate = r.publication_date,
          p.citedByCount = toInteger(r.cited_by_count),
          p.localCitations = toInteger(r.local_citation_count),
          p.openalexId = r.openalex_id, p.doi = r.doi, p.workType = r.work_type, p.openAccess = r.open_access,
          p.isRetracted = coalesce(p.isRetracted, false)
      WITH p, r
      OPTIONAL MATCH (p)-[old:PUBLISHED_IN]->()
      DELETE old
      WITH p, r
      OPTIONAL MATCH (v:Venue {venueId: toInteger(r.venue_id)})
      FOREACH (_ IN CASE WHEN v IS NULL THEN [] ELSE [1] END | MERGE (p)-[:PUBLISHED_IN]->(v))`,
    delete: `UNWIND $rows AS r MATCH (p:Paper {paperId: toInteger(r.paper_id)}) DETACH DELETE p`,
  },
  paper_author: {
    upsert: `UNWIND $rows AS r
      MATCH (a:Author {authorId: toInteger(r.author_id)}), (p:Paper {paperId: toInteger(r.paper_id)})
      MERGE (a)-[x:AUTHORED]->(p)
      SET x.order = toInteger(r.author_order), x.corresponding = r.is_corresponding`,
    delete: `UNWIND $rows AS r
      MATCH (:Author {authorId: toInteger(r.author_id)})-[x:AUTHORED]->(:Paper {paperId: toInteger(r.paper_id)}) DELETE x`,
  },
  citation: {
    upsert: `UNWIND $rows AS r
      MATCH (a:Paper {paperId: toInteger(r.citing_paper_id)}), (b:Paper {paperId: toInteger(r.cited_paper_id)})
      MERGE (a)-[:CITES]->(b)`,
    delete: `UNWIND $rows AS r
      MATCH (:Paper {paperId: toInteger(r.citing_paper_id)})-[x:CITES]->(:Paper {paperId: toInteger(r.cited_paper_id)}) DELETE x`,
  },
  paper_topic: {
    upsert: `UNWIND $rows AS r
      MATCH (p:Paper {paperId: toInteger(r.paper_id)}), (t:Topic {topicId: toInteger(r.topic_id)})
      MERGE (p)-[x:BELONGS_TO_TOPIC]->(t)
      SET x.score = toFloat(r.relevance_score), x.primary = r.is_primary`,
    delete: `UNWIND $rows AS r
      MATCH (:Paper {paperId: toInteger(r.paper_id)})-[x:BELONGS_TO_TOPIC]->(:Topic {topicId: toInteger(r.topic_id)}) DELETE x`,
  },
  paper_method: {
    upsert: `UNWIND $rows AS r
      MATCH (p:Paper {paperId: toInteger(r.paper_id)}), (m:Method {methodId: toInteger(r.method_id)})
      MERGE (p)-[x:USES_METHOD]->(m)
      SET x.usage = r.usage_type`,
    delete: `UNWIND $rows AS r
      MATCH (:Paper {paperId: toInteger(r.paper_id)})-[x:USES_METHOD]->(:Method {methodId: toInteger(r.method_id)}) DELETE x`,
  },
  paper_dataset: {
    upsert: `UNWIND $rows AS r
      MATCH (p:Paper {paperId: toInteger(r.paper_id)}), (d:Dataset {datasetId: toInteger(r.dataset_id)})
      MERGE (p)-[x:USES_DATASET]->(d)
      SET x.usage = r.usage_type`,
    delete: `UNWIND $rows AS r
      MATCH (:Paper {paperId: toInteger(r.paper_id)})-[x:USES_DATASET]->(:Dataset {datasetId: toInteger(r.dataset_id)}) DELETE x`,
  },
  retraction: {
    upsert: `UNWIND $rows AS r
      MATCH (p:Paper {paperId: toInteger(r.paper_id)})
      SET p.isRetracted = r.status <> 'REINSTATED', p.retractionStatus = r.status`,
    delete: `UNWIND $rows AS r
      MATCH (p:Paper {paperId: toInteger(r.paper_id)})
      SET p.isRetracted = false, p.retractionStatus = null`,
  },
};

// Rebuild order: nodes before the relationships that need them.
export const REBUILD_ORDER: { aggregate: string; query: string }[] = [
  { aggregate: "institution", query: "SELECT to_jsonb(t) AS row FROM institution t ORDER BY institution_id" },
  { aggregate: "venue", query: "SELECT to_jsonb(t) AS row FROM venue t ORDER BY venue_id" },
  { aggregate: "topic", query: "SELECT to_jsonb(t) AS row FROM topic t ORDER BY topic_level, topic_id" },
  { aggregate: "method", query: "SELECT to_jsonb(t) AS row FROM method t ORDER BY method_id" },
  { aggregate: "dataset", query: "SELECT to_jsonb(t) AS row FROM dataset t ORDER BY dataset_id" },
  {
    aggregate: "author",
    query: `SELECT to_jsonb(t) || jsonb_build_object('h_index', s.h_index) AS row
            FROM author t LEFT JOIN mv_author_stats s USING (author_id) ORDER BY t.author_id`,
  },
  {
    aggregate: "paper",
    query: "SELECT to_jsonb(t) - 'abstract' - 'search_vector' AS row FROM paper t ORDER BY paper_id",
  },
  {
    aggregate: "paper_author",
    query: "SELECT to_jsonb(t) AS row FROM paper_author t ORDER BY paper_id, author_id",
  },
  {
    aggregate: "citation",
    query: "SELECT to_jsonb(t) AS row FROM citation t ORDER BY citing_paper_id, cited_paper_id",
  },
  {
    aggregate: "paper_topic",
    query: "SELECT to_jsonb(t) AS row FROM paper_topic t ORDER BY paper_id, topic_id",
  },
  {
    aggregate: "paper_method",
    query: "SELECT to_jsonb(t) AS row FROM paper_method t ORDER BY paper_id, method_id",
  },
  {
    aggregate: "paper_dataset",
    query: "SELECT to_jsonb(t) AS row FROM paper_dataset t ORDER BY paper_id, dataset_id",
  },
  { aggregate: "retraction", query: "SELECT to_jsonb(t) AS row FROM retraction t ORDER BY paper_id" },
];

// Labels and relationship types that are projections (safe to wipe); everything else in the graph
// (Trail, STEP, curated relations, SIMILAR_TO, COAUTHOR, EmbeddingMeta) is graph-native or derived.
export const PROJECTED_LABELS = ["Author", "Institution", "Venue", "Topic", "Method", "Dataset"];
export const PROJECTED_RELS = [
  "CITES",
  "AUTHORED",
  "AFFILIATED_WITH",
  "PUBLISHED_IN",
  "BELONGS_TO_TOPIC",
  "SUBTOPIC_OF",
  "USES_METHOD",
  "USES_DATASET",
];

export async function applyRows(
  driver: Driver,
  aggregate: string,
  operation: "UPSERT" | "DELETE",
  rows: unknown[],
) {
  const projection = PROJECTIONS[aggregate];
  if (!projection) throw new Error(`no graph projection for ${aggregate}`);
  const cypher = operation === "UPSERT" ? projection.upsert : projection.delete;
  const session = driver.session();
  try {
    for (let i = 0; i < rows.length; i += 1000) {
      await session.executeWrite((tx) => tx.run(cypher, { rows: rows.slice(i, i + 1000) }));
    }
  } finally {
    await session.close();
  }
}

type OutboxRow = {
  outbox_id: string;
  aggregate: string;
  operation: "UPSERT" | "DELETE";
  aggregate_key: unknown;
  payload: unknown;
};

// Replays pending outbox rows in id order, grouping consecutive rows with the same aggregate and
// operation into one UNWIND batch. A failing group records the error and stops the drain, so later
// changes never overtake an earlier one that has not reached the graph yet.
export async function drainOutbox(sql: Sql, driver: Driver, { batchSize = 2000 } = {}) {
  let processed = 0;
  for (;;) {
    const done = await sql.begin(async (tx) => {
      const rows = await tx<OutboxRow[]>`
        SELECT outbox_id::TEXT, aggregate, operation, aggregate_key, payload
        FROM graph_outbox WHERE processed_at IS NULL
        ORDER BY outbox_id LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED`;
      if (rows.length === 0) return true;
      let start = 0;
      while (start < rows.length) {
        let end = start + 1;
        while (
          end < rows.length &&
          rows[end].aggregate === rows[start].aggregate &&
          rows[end].operation === rows[start].operation
        )
          end++;
        const group = rows.slice(start, end);
        const ids = group.map((r) => r.outbox_id);
        try {
          await applyRows(
            driver,
            group[0].aggregate,
            group[0].operation,
            group.map((r) => (r.operation === "UPSERT" ? r.payload : r.aggregate_key)),
          );
          await tx`UPDATE graph_outbox SET processed_at = now(), last_error = NULL WHERE outbox_id = ANY(${ids}::BIGINT[])`;
          processed += group.length;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await tx`UPDATE graph_outbox SET attempts = attempts + 1, last_error = ${message.slice(0, 2000)}
                   WHERE outbox_id = ANY(${ids}::BIGINT[])`;
          throw Object.assign(new Error(`graph sync failed on ${group[0].aggregate}: ${message}`), {
            processed,
          });
        }
        start = end;
      }
      return rows.length < batchSize;
    });
    if (done) return { processed };
  }
}

export type DriftRow = { item: string; postgres: number; graph: number };

// Counts in PostgreSQL versus the graph, one row per projected label or relationship type.
export async function compareCounts(sql: Sql, driver: Driver): Promise<DriftRow[]> {
  const [pg] = await sql<Record<string, number>[]>`
    SELECT (SELECT count(*) FROM paper)::INT AS "Paper",
           (SELECT count(*) FROM author)::INT AS "Author",
           (SELECT count(*) FROM institution)::INT AS "Institution",
           (SELECT count(*) FROM venue)::INT AS "Venue",
           (SELECT count(*) FROM topic)::INT AS "Topic",
           (SELECT count(*) FROM method)::INT AS "Method",
           (SELECT count(*) FROM dataset)::INT AS "Dataset",
           (SELECT count(*) FROM citation)::INT AS "CITES",
           (SELECT count(*) FROM paper_author)::INT AS "AUTHORED",
           (SELECT count(*) FROM author WHERE institution_id IS NOT NULL)::INT AS "AFFILIATED_WITH",
           (SELECT count(*) FROM paper WHERE venue_id IS NOT NULL)::INT AS "PUBLISHED_IN",
           (SELECT count(*) FROM paper_topic)::INT AS "BELONGS_TO_TOPIC",
           (SELECT count(*) FROM topic WHERE parent_topic_id IS NOT NULL)::INT AS "SUBTOPIC_OF",
           (SELECT count(*) FROM paper_method)::INT AS "USES_METHOD",
           (SELECT count(*) FROM paper_dataset)::INT AS "USES_DATASET",
           (SELECT count(*) FROM retraction WHERE status <> 'REINSTATED')::INT AS "retracted papers"`;
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const out: DriftRow[] = [];
    for (const label of ["Paper", ...PROJECTED_LABELS]) {
      const r = await session.run(`MATCH (n:${label}) RETURN count(n) AS n`);
      out.push({ item: label, postgres: pg[label], graph: r.records[0].get("n") as number });
    }
    for (const rel of PROJECTED_RELS) {
      const r = await session.run(`MATCH ()-[x:${rel}]->() RETURN count(x) AS n`);
      out.push({ item: rel, postgres: pg[rel], graph: r.records[0].get("n") as number });
    }
    const r = await session.run("MATCH (p:Paper {isRetracted: true}) RETURN count(p) AS n");
    out.push({
      item: "retracted papers",
      postgres: pg["retracted papers"],
      graph: r.records[0].get("n") as number,
    });
    return out;
  } finally {
    await session.close();
  }
}
