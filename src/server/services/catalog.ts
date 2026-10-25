import "server-only";

import { type DbContext, withDb } from "@/server/db/client";
import type { PaperCard } from "./papers";

const CARD = `paper_id::INT, title, publication_year::INT, cited_by_count, local_citation_count, venue_name, author_names,
  primary_topic_name, retraction_status, open_access`;

export async function getAuthor(ctx: DbContext, authorId: number) {
  return withDb(ctx, async (tx) => {
    const [author] = await tx`
      SELECT a.author_id::INT, a.author_name, a.orcid, a.openalex_id, i.institution_name, i.country_code,
             s.papers, s.citations::INT, s.h_index, s.first_year, s.last_year
      FROM author a
      LEFT JOIN institution i ON i.institution_id = a.institution_id
      LEFT JOIN mv_author_stats s ON s.author_id = a.author_id
      WHERE a.author_id = ${authorId}`;
    if (!author) return null;
    const [papers, perYear, topics] = await Promise.all([
      tx<PaperCard[]>`SELECT ${tx.unsafe(CARD)} FROM v_paper_card WHERE paper_id IN
                      (SELECT paper_id FROM paper_author WHERE author_id = ${authorId}) ORDER BY cited_by_count DESC LIMIT 50`,
      tx`SELECT p.publication_year::INT AS year, count(*)::INT AS papers, sum(p.cited_by_count)::INT AS citations
         FROM paper_author pa JOIN paper p USING (paper_id)
         WHERE pa.author_id = ${authorId} AND p.publication_date IS NOT NULL GROUP BY 1 ORDER BY 1`,
      tx`SELECT t.topic_id::INT, t.topic_name, count(*)::INT AS papers
         FROM paper_author pa JOIN paper_topic pt USING (paper_id) JOIN topic t USING (topic_id)
         WHERE pa.author_id = ${authorId} AND t.topic_level = 3 GROUP BY t.topic_id ORDER BY papers DESC LIMIT 8`,
    ]);
    return { ...author, papers, per_year: perYear, topics };
  });
}

export async function mergeAuthors(ctx: DbContext, keepId: number, duplicateId: number) {
  return withDb(ctx, async (tx) => {
    await tx`CALL sp_merge_authors(${keepId}, ${duplicateId})`;
    return { kept: keepId, merged: duplicateId };
  });
}

export type TopicNode = {
  topic_id: number;
  topic_name: string;
  topic_level: number;
  parent_topic_id: number | null;
  papers: number;
};

// The topic tree down to subfields, with paper counts over each subtree (from mv_topic_year_stats).
export async function topicTree(ctx: DbContext): Promise<TopicNode[]> {
  return withDb(
    ctx,
    (tx) => tx<TopicNode[]>`
      SELECT t.topic_id::INT, t.topic_name, t.topic_level, t.parent_topic_id::INT,
             coalesce((SELECT sum(papers) FROM mv_topic_year_stats s WHERE s.topic_id = t.topic_id), 0)::INT AS papers
      FROM topic t
      ORDER BY t.topic_level, papers DESC, t.topic_name`,
  );
}

export async function getTopic(ctx: DbContext, topicId: number) {
  return withDb(ctx, async (tx) => {
    const [topic] = await tx`
      SELECT topic_id::INT, topic_name, topic_level, description, parent_topic_id::INT, fn_topic_path(topic_id) AS path
      FROM topic WHERE topic_id = ${topicId}`;
    if (!topic) return null;
    const thisYear = new Date().getFullYear();
    const [children, growth, top, methods, datasets] = await Promise.all([
      tx`SELECT t.topic_id::INT, t.topic_name, t.topic_level,
                coalesce((SELECT sum(papers) FROM mv_topic_year_stats s WHERE s.topic_id = t.topic_id), 0)::INT AS papers
         FROM topic t WHERE t.parent_topic_id = ${topicId} ORDER BY papers DESC, t.topic_name`,
      tx`SELECT year, papers::INT, yoy_pct::FLOAT FROM fn_topic_growth(${topicId}, 2012, ${thisYear})`,
      tx<PaperCard[]>`
        SELECT ${tx.unsafe(CARD)} FROM v_paper_card WHERE paper_id IN (
          SELECT pt.paper_id FROM paper_topic pt JOIN fn_topic_descendants(${topicId}) d USING (topic_id))
        ORDER BY cited_by_count DESC LIMIT 12`,
      tx`SELECT m.method_id::INT, m.method_name, count(DISTINCT pm.paper_id)::INT AS papers
         FROM paper_topic pt JOIN fn_topic_descendants(${topicId}) d USING (topic_id)
         JOIN paper_method pm ON pm.paper_id = pt.paper_id JOIN method m USING (method_id)
         GROUP BY m.method_id ORDER BY papers DESC LIMIT 10`,
      tx`SELECT ds.dataset_id::INT, ds.dataset_name, count(DISTINCT pd.paper_id)::INT AS papers
         FROM paper_topic pt JOIN fn_topic_descendants(${topicId}) d USING (topic_id)
         JOIN paper_dataset pd ON pd.paper_id = pt.paper_id JOIN dataset ds USING (dataset_id)
         GROUP BY ds.dataset_id ORDER BY papers DESC LIMIT 10`,
    ]);
    return { ...topic, children, growth, top_papers: top, methods, datasets };
  });
}

// Method × dataset co-usage (the Q03 shape) for the observatory heatmap.
export async function observatory(ctx: DbContext, limitMethods = 18, limitDatasets = 16) {
  return withDb(ctx, async (tx) => {
    const cells = await tx<
      { method_id: number; method_name: string; dataset_id: number; dataset_name: string; papers: number }[]
    >`
      WITH top_methods AS (
        SELECT pm.method_id FROM paper_method pm JOIN method m USING (method_id)
        WHERE m.method_category IS DISTINCT FROM 'Building block'
          AND EXISTS (SELECT 1 FROM paper_dataset pd WHERE pd.paper_id = pm.paper_id)
        GROUP BY pm.method_id ORDER BY count(*) DESC LIMIT ${limitMethods}
      ), top_datasets AS (
        SELECT dataset_id FROM paper_dataset GROUP BY dataset_id ORDER BY count(*) DESC LIMIT ${limitDatasets}
      )
      SELECT m.method_id::INT, m.method_name, d.dataset_id::INT, d.dataset_name, count(DISTINCT pm.paper_id)::INT AS papers
      FROM top_methods tm JOIN method m USING (method_id)
      CROSS JOIN top_datasets td JOIN dataset d ON d.dataset_id = td.dataset_id
      LEFT JOIN paper_method pm ON pm.method_id = m.method_id
        AND EXISTS (SELECT 1 FROM paper_dataset pd WHERE pd.paper_id = pm.paper_id AND pd.dataset_id = d.dataset_id)
      GROUP BY m.method_id, d.dataset_id
      ORDER BY m.method_name, d.dataset_name`;
    const unpaired = await tx<{ kind: string; name: string; papers: number }[]>`
      SELECT 'method' AS kind, m.method_name AS name, count(*)::INT AS papers
      FROM method m JOIN paper_method pm USING (method_id)
      WHERE m.method_category IS DISTINCT FROM 'Building block' AND NOT EXISTS (SELECT 1 FROM paper_dataset pd WHERE pd.paper_id = pm.paper_id)
      GROUP BY m.method_id ORDER BY papers DESC LIMIT 8`;
    return { cells, unpaired };
  });
}

export async function integrityOverview(ctx: DbContext) {
  return withDb(ctx, async (tx) => {
    const retracted = await tx`
      SELECT * FROM (
        SELECT r.paper_id::INT, p.title, p.publication_year::INT AS year, r.status, r.retraction_date::TEXT, r.reason,
               r.source, r.notice_url,
               count(e.paper_id) FILTER (WHERE e.hops = 1)::INT AS direct,
               count(e.paper_id) FILTER (WHERE e.hops = 2)::INT AS indirect
        FROM retraction r
        JOIN paper p USING (paper_id)
        LEFT JOIN v_retraction_exposure e ON e.retracted_paper_id = r.paper_id
        GROUP BY r.retraction_id, p.paper_id
      ) x
      ORDER BY direct + indirect DESC, retraction_date DESC`;
    const [totals] = await tx`
      SELECT count(DISTINCT paper_id)::INT AS exposed,
             count(DISTINCT paper_id) FILTER (WHERE hops = 1)::INT AS direct
      FROM v_retraction_exposure`;
    return { retracted, totals };
  });
}

export async function exposureFor(ctx: DbContext, retractedPaperId: number) {
  return withDb(
    ctx,
    (tx) => tx`
      SELECT e.paper_id::INT, e.hops, p.title, p.publication_year::INT AS year, e.path::INT[]
      FROM v_retraction_exposure e JOIN paper p ON p.paper_id = e.paper_id
      WHERE e.retracted_paper_id = ${retractedPaperId}
      ORDER BY e.hops, p.cited_by_count DESC LIMIT 100`,
  );
}

// "Check my library": papers in the caller's collections within two hops of retracted work.
// Runs under the caller's role, so row-level security limits it to their own collections.
export async function checkMyLibrary(ctx: DbContext) {
  return withDb(
    ctx,
    (tx) => tx`
      SELECT DISTINCT ON (cp.paper_id, x.retracted_paper_id)
             c.collection_name, cp.paper_id::INT, p.title, x.retracted_paper_id::INT, rp.title AS retracted_title, x.hops
      FROM collection c
      JOIN collection_paper cp ON cp.collection_id = c.collection_id
      JOIN paper p ON p.paper_id = cp.paper_id
      CROSS JOIN LATERAL fn_retraction_exposure(cp.paper_id) x
      JOIN paper rp ON rp.paper_id = x.retracted_paper_id
      WHERE c.user_id = app_current_user_id()
      ORDER BY cp.paper_id, x.retracted_paper_id, x.hops`,
  );
}

export async function listMethods(ctx: DbContext) {
  return withDb(
    ctx,
    (tx) => tx`
      SELECT m.method_id::INT, m.method_name, m.method_category, count(pm.paper_id)::INT AS papers
      FROM method m LEFT JOIN paper_method pm USING (method_id)
      GROUP BY m.method_id ORDER BY m.method_name`,
  );
}

export async function listDatasets(ctx: DbContext) {
  return withDb(
    ctx,
    (tx) => tx`
      SELECT d.dataset_id::INT, d.dataset_name, d.modality, d.domain, count(pd.paper_id)::INT AS papers
      FROM dataset d LEFT JOIN paper_dataset pd USING (dataset_id)
      GROUP BY d.dataset_id ORDER BY d.dataset_name`,
  );
}

export async function linkMethod(ctx: DbContext, paperId: number, methodId: number, usage: string) {
  return withDb(ctx, async (tx) => {
    await tx`
      INSERT INTO paper_method (paper_id, method_id, usage_type) VALUES (${paperId}, ${methodId}, ${usage})
      ON CONFLICT (paper_id, method_id) DO UPDATE SET usage_type = EXCLUDED.usage_type`;
    return { paper_id: paperId, method_id: methodId, usage_type: usage };
  });
}

export async function unlinkMethod(ctx: DbContext, paperId: number, methodId: number) {
  return withDb(
    ctx,
    async (tx) =>
      (await tx`DELETE FROM paper_method WHERE paper_id = ${paperId} AND method_id = ${methodId}`).count > 0,
  );
}

export async function linkDataset(ctx: DbContext, paperId: number, datasetId: number, usage: string) {
  return withDb(ctx, async (tx) => {
    await tx`
      INSERT INTO paper_dataset (paper_id, dataset_id, usage_type) VALUES (${paperId}, ${datasetId}, ${usage})
      ON CONFLICT (paper_id, dataset_id) DO UPDATE SET usage_type = EXCLUDED.usage_type`;
    return { paper_id: paperId, dataset_id: datasetId, usage_type: usage };
  });
}

export async function unlinkDataset(ctx: DbContext, paperId: number, datasetId: number) {
  return withDb(
    ctx,
    async (tx) =>
      (await tx`DELETE FROM paper_dataset WHERE paper_id = ${paperId} AND dataset_id = ${datasetId}`).count >
      0,
  );
}
