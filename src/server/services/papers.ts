import "server-only";

import type { z } from "zod";
import type { paperCreate, paperListQuery, paperUpdate } from "@/lib/schemas";
import { type DbContext, withDb } from "@/server/db/client";

export type PaperCard = {
  paper_id: number;
  title: string;
  doi: string | null;
  publication_date: string | null;
  publication_year: number | null;
  work_type: string;
  open_access: boolean;
  cited_by_count: number;
  local_citation_count: number;
  venue_name: string | null;
  author_names: string | null;
  author_count: number | null;
  primary_topic_id: number | null;
  primary_topic_name: string | null;
  primary_topic_path: string | null;
  retraction_status: string | null;
};

const cardColumns = (a = "v_paper_card") =>
  [
    "paper_id::INT AS paper_id",
    "title",
    "doi",
    "publication_date::TEXT AS publication_date",
    "publication_year::INT AS publication_year",
    "work_type",
    "open_access",
    "cited_by_count",
    "local_citation_count",
    "venue_name",
    "author_names",
    "author_count",
    "primary_topic_id::INT AS primary_topic_id",
    "primary_topic_name",
    "primary_topic_path",
    "retraction_status",
  ]
    .map((c) => `${a}.${c}`)
    .join(", ");
const CARD_COLUMNS = cardColumns();

export async function listPapers(ctx: DbContext, q: z.infer<typeof paperListQuery>) {
  const [cursorCount, cursorId] = q.cursor ? q.cursor.split(":").map(Number) : [null, null];
  return withDb(ctx, async (tx) => {
    const rows = await tx<PaperCard[]>`
      SELECT ${tx.unsafe(cardColumns("c"))}
      FROM v_paper_card c
      WHERE TRUE
        ${q.q ? tx`AND c.paper_id IN (SELECT paper_id FROM paper WHERE search_vector @@ websearch_to_tsquery('english', ${q.q}))` : tx``}
        ${q.year_from ? tx`AND c.publication_date >= make_date(${q.year_from}, 1, 1)` : tx``}
        ${q.year_to ? tx`AND c.publication_date < make_date(${q.year_to + 1}, 1, 1)` : tx``}
        ${q.topic_id ? tx`AND c.paper_id IN (SELECT pt.paper_id FROM paper_topic pt JOIN fn_topic_descendants(${q.topic_id}) d USING (topic_id))` : tx``}
        ${q.open_access ? tx`AND c.open_access = ${q.open_access === "true"}` : tx``}
        ${cursorId !== null ? tx`AND (c.cited_by_count, c.paper_id) < (${cursorCount}, ${cursorId})` : tx``}
      ORDER BY c.cited_by_count DESC, c.paper_id DESC
      LIMIT ${q.limit + 1}`;
    const items = rows.slice(0, q.limit);
    const last = items.at(-1);
    return {
      items,
      next_cursor: rows.length > q.limit && last ? `${last.cited_by_count}:${last.paper_id}` : null,
    };
  });
}

export async function getPaperCards(ctx: DbContext, ids: number[]): Promise<Map<number, PaperCard>> {
  if (ids.length === 0) return new Map();
  const rows = await withDb(
    ctx,
    (tx) =>
      tx<
        PaperCard[]
      >`SELECT ${tx.unsafe(CARD_COLUMNS)} FROM v_paper_card WHERE paper_id = ANY(${ids}::BIGINT[])`,
  );
  return new Map(rows.map((r) => [r.paper_id, r]));
}

export type PaperDetail = PaperCard & {
  abstract: string | null;
  arxiv_id: string | null;
  openalex_id: string | null;
  paper_url: string | null;
  oa_status: string | null;
  venue_id: number | null;
  venue_type: string | null;
  retraction_date: string | null;
  retraction: { reason: string | null; notice_url: string | null; source: string } | null;
  authors: {
    author_id: number;
    author_name: string;
    author_order: number;
    is_corresponding: boolean;
    institution_name: string | null;
  }[];
  topics: {
    topic_id: number;
    topic_name: string;
    path: string;
    relevance_score: number | null;
    is_primary: boolean;
  }[];
  methods: { method_id: number; method_name: string; usage_type: string }[];
  datasets: { dataset_id: number; dataset_name: string; usage_type: string }[];
  resources: { resource_type: string; resource_url: string }[];
  references_count: number;
  exposure: { retracted_paper_id: number; hops: number; title: string }[];
};

export async function getPaper(ctx: DbContext, paperId: number): Promise<PaperDetail | null> {
  return withDb(ctx, async (tx) => {
    const [card] = await tx<(PaperCard & Record<string, unknown>)[]>`
      SELECT ${tx.unsafe(cardColumns("c"))}, c.venue_id::INT, c.venue_type, c.retraction_date::TEXT, c.oa_status,
             p.abstract, p.arxiv_id, p.openalex_id, p.paper_url
      FROM v_paper_card c JOIN paper p USING (paper_id)
      WHERE c.paper_id = ${paperId}`;
    if (!card) return null;
    const [authors, topics, methods, datasets, resources, retraction, refs, exposure] = await Promise.all([
      tx`SELECT a.author_id::INT, a.author_name, pa.author_order, pa.is_corresponding, i.institution_name
         FROM paper_author pa JOIN author a USING (author_id)
         LEFT JOIN institution i ON i.institution_id = pa.affiliation_institution_id
         WHERE pa.paper_id = ${paperId} ORDER BY pa.author_order`,
      tx`SELECT t.topic_id::INT, t.topic_name, fn_topic_path(t.topic_id) AS path, pt.relevance_score::FLOAT, pt.is_primary
         FROM paper_topic pt JOIN topic t USING (topic_id)
         WHERE pt.paper_id = ${paperId} ORDER BY pt.is_primary DESC, pt.relevance_score DESC NULLS LAST`,
      tx`SELECT m.method_id::INT, m.method_name, pm.usage_type FROM paper_method pm JOIN method m USING (method_id)
         WHERE pm.paper_id = ${paperId} ORDER BY pm.usage_type = 'PROPOSED' DESC, m.method_name`,
      tx`SELECT d.dataset_id::INT, d.dataset_name, pd.usage_type FROM paper_dataset pd JOIN dataset d USING (dataset_id)
         WHERE pd.paper_id = ${paperId} ORDER BY d.dataset_name`,
      tx`SELECT resource_type, resource_url FROM resource WHERE paper_id = ${paperId} ORDER BY resource_type, resource_id`,
      tx`SELECT reason, notice_url, source FROM retraction WHERE paper_id = ${paperId}`,
      tx<{ n: number }[]>`SELECT count(*)::INT AS n FROM citation WHERE citing_paper_id = ${paperId}`,
      tx`SELECT e.retracted_paper_id::INT, e.hops, p.title FROM fn_retraction_exposure(${paperId}) e
         JOIN paper p ON p.paper_id = e.retracted_paper_id ORDER BY e.hops`,
    ]);
    return {
      ...(card as unknown as PaperCard),
      ...(card as Record<string, unknown>),
      authors,
      topics,
      methods,
      datasets,
      resources,
      retraction: (retraction[0] as PaperDetail["retraction"]) ?? null,
      references_count: refs[0]?.n ?? 0,
      exposure,
    } as unknown as PaperDetail;
  });
}

export async function createPaper(ctx: DbContext, input: z.infer<typeof paperCreate>) {
  return withDb(ctx, async (tx) => {
    const [row] = await tx<{ paper_id: number }[]>`
      INSERT INTO paper (title, abstract, doi, publication_date, venue_id, work_type, open_access, oa_status, paper_url)
      VALUES (${input.title}, ${input.abstract ?? null}, ${input.doi ?? null}, ${input.publication_date ?? null},
              ${input.venue_id ?? null}, ${input.work_type}, ${input.open_access}, ${input.oa_status ?? null},
              ${input.paper_url ?? null})
      RETURNING paper_id::INT`;
    return row.paper_id;
  });
}

const UPDATABLE = [
  "title",
  "abstract",
  "doi",
  "publication_date",
  "venue_id",
  "work_type",
  "open_access",
  "oa_status",
  "paper_url",
] as const;

export async function updatePaper(ctx: DbContext, paperId: number, input: z.infer<typeof paperUpdate>) {
  const changes = Object.fromEntries(
    UPDATABLE.filter((k) => input[k] !== undefined).map((k) => [k, input[k] ?? null]),
  );
  if (Object.keys(changes).length === 0) return getPaper(ctx, paperId);
  return withDb(ctx, async (tx) => {
    // Column names come from the fixed UPDATABLE list; values are bound parameters.
    const res =
      await tx`UPDATE paper SET ${tx(changes, ...Object.keys(changes))} WHERE paper_id = ${paperId} RETURNING paper_id`;
    return res.count > 0;
  });
}

export async function deletePaper(ctx: DbContext, paperId: number): Promise<boolean> {
  return withDb(ctx, async (tx) => (await tx`DELETE FROM paper WHERE paper_id = ${paperId}`).count > 0);
}

export async function retractPaper(
  ctx: DbContext,
  paperId: number,
  input: { retraction_date: string; status: string; reason?: string | null; notice_url?: string | null },
) {
  return withDb(ctx, async (tx) => {
    await tx`CALL sp_retract_paper(${paperId}, ${input.retraction_date}::DATE, ${input.status}, ${input.reason ?? null}, ${input.notice_url ?? null})`;
    const [row] = await tx`SELECT status, retraction_date::TEXT FROM retraction WHERE paper_id = ${paperId}`;
    return row;
  });
}

export async function corpusStats(ctx: DbContext) {
  const [row] = await withDb(
    ctx,
    (tx) => tx<
      {
        papers: number;
        citations: number;
        authors: number;
        topics: number;
        retractions: number;
        years: string;
      }[]
    >`
      SELECT (SELECT count(*) FROM paper)::INT AS papers, (SELECT count(*) FROM citation)::INT AS citations,
             (SELECT count(*) FROM author)::INT AS authors, (SELECT count(*) FROM topic WHERE topic_level = 3)::INT AS topics,
             (SELECT count(*) FROM retraction WHERE status = 'RETRACTED')::INT AS retractions,
             (SELECT min(publication_year) || '–' || max(publication_year) FROM paper) AS years`,
  );
  return row;
}
