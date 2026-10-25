import "server-only";

import neo4j from "neo4j-driver";
import { reciprocalRankFusion } from "@/lib/rrf";
import { type DbContext, withDb } from "@/server/db/client";
import { embeddingProvider, queryText } from "@/server/embeddings/provider";
import { graphDriver } from "@/server/graph/driver";
import { getPaperCards, type PaperCard } from "./papers";

// Three ways to search the same corpus, so the difference is visible side by side:
//   lexical  — PostgreSQL full-text search (fn_search_papers), with a trigram fallback for typos
//   semantic — EmbeddingGemma query vector against the Neo4j vector index
//   hybrid   — Reciprocal Rank Fusion of both: score = Σ 1 / (60 + rank)

export type SearchHit = PaperCard & {
  score: number;
  lexical_rank: number | null;
  semantic_rank: number | null;
  headline: string | null;
};

async function lexical(ctx: DbContext, q: string, limit: number) {
  return withDb(
    ctx,
    (tx) => tx<{ paper_id: number; rank: number; headline: string; matched_by: string }[]>`
      SELECT paper_id::INT, rank, headline, matched_by FROM fn_search_papers(${q}, ${limit}, 0)`,
  );
}

export class EmbeddingModelMismatchError extends Error {
  readonly status = 503;
}

async function semantic(q: string, limit: number, yearFrom?: number) {
  const provider = embeddingProvider();
  const session = graphDriver().session({ defaultAccessMode: "READ" });
  try {
    const meta = await session.run(
      "MATCH (e:EmbeddingMeta {name: 'paper_embedding'}) RETURN e.model AS model",
    );
    const model = meta.records[0]?.get("model") as string | undefined;
    if (!model)
      throw new EmbeddingModelMismatchError("The semantic index has not been built yet (pnpm embed:papers).");
    // Never compare vectors from different models: the index records which model built it.
    if (model !== provider.model) {
      throw new EmbeddingModelMismatchError(
        `The index was built with ${model}, but queries would use ${provider.model}.`,
      );
    }
    const [vector] = await provider.embed([queryText(q)]);
    const res = await session.run(
      `CYPHER 25
       MATCH (p:Paper)
         SEARCH p IN (VECTOR INDEX paper_embedding FOR $vector WHERE p.year >= $yearFrom LIMIT $limit) SCORE AS score
       RETURN p.paperId AS paperId, score ORDER BY score DESC`,
      { vector, yearFrom: neo4j.int(yearFrom ?? 0), limit: neo4j.int(limit) },
    );
    return res.records.map((r) => ({
      paper_id: r.get("paperId") as number,
      score: r.get("score") as number,
    }));
  } finally {
    await session.close();
  }
}

export async function search(
  ctx: DbContext,
  {
    q,
    mode,
    limit,
    year_from,
    topic_id,
    open_access,
  }: {
    q: string;
    mode: "lexical" | "semantic" | "hybrid";
    limit: number;
    year_from?: number;
    topic_id?: number;
    open_access?: "true" | "false";
  },
) {
  const started = performance.now();
  const pool = Math.min(limit * 3, 100);
  const [lex, sem] = await Promise.all([
    mode === "semantic" ? Promise.resolve([]) : lexical(ctx, q, pool),
    mode === "lexical" ? Promise.resolve([]) : semantic(q, pool, year_from),
  ]);
  const headlines = new Map(lex.map((h) => [h.paper_id, h.headline]));
  const rawScore = new Map<number, number>([
    ...lex.map((h) => [h.paper_id, h.rank] as [number, number]),
    ...sem.map((h) => [h.paper_id, h.score] as [number, number]),
  ]);
  const fused = reciprocalRankFusion([lex.map((h) => h.paper_id), sem.map((h) => h.paper_id)]);
  const cards = await getPaperCards(
    ctx,
    fused.map((f) => f.id),
  );
  // Facets: a field filter keeps papers anywhere in that topic's subtree.
  const inTopic = topic_id
    ? new Set(
        (
          await withDb(
            ctx,
            (tx) => tx<{ paper_id: number }[]>`
              SELECT DISTINCT pt.paper_id::INT FROM paper_topic pt JOIN fn_topic_descendants(${topic_id}) d USING (topic_id)
              WHERE pt.paper_id = ANY(${fused.map((f) => f.id)}::BIGINT[])`,
          )
        ).map((r) => r.paper_id),
      )
    : null;
  const hits: SearchHit[] = [];
  for (const f of fused) {
    const card = cards.get(f.id);
    if (!card) continue;
    if (year_from && (card.publication_year ?? 0) < year_from) continue;
    if (inTopic && !inTopic.has(f.id)) continue;
    if (open_access && card.open_access !== (open_access === "true")) continue;
    hits.push({
      ...card,
      // Single-engine modes report that engine's own score; hybrid reports the fused RRF score.
      score: mode === "hybrid" ? f.score : (rawScore.get(f.id) ?? 0),
      lexical_rank: f.ranks[0],
      semantic_rank: f.ranks[1],
      headline: headlines.get(f.id) ?? null,
    });
    if (hits.length >= limit) break;
  }
  return { mode, q, hits, took_ms: Math.round(performance.now() - started) };
}
