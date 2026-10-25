import "server-only";

import neo4j from "neo4j-driver";
import { type DbContext, withDb } from "@/server/db/client";
import { graphDriver } from "@/server/graph/driver";

// Read models that come from the graph (or compare SQL with Cypher): lineage, shortest paths,
// neighbourhoods, similar papers, research fronts, hidden gems, the atlas map and co-authors.

const int = (n: number) => neo4j.int(n);

async function readGraph<T>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const session = graphDriver().session({ defaultAccessMode: "READ" });
  try {
    const res = await session.run(cypher, params);
    return res.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}

export type LineageNode = {
  paper_id: number;
  depth: number;
  title: string;
  year: number | null;
  cited_by_count: number;
  via: number | null;
};

export async function lineage(
  ctx: DbContext,
  paperId: number,
  opts: { direction: "ancestors" | "descendants"; depth: number; engine: "sql" | "graph" },
) {
  const started = performance.now();
  let nodes: LineageNode[];
  if (opts.engine === "sql") {
    nodes = await withDb(
      ctx,
      (tx) => tx<LineageNode[]>`
        SELECT l.paper_id::INT, l.depth, p.title, p.publication_year::INT AS year, p.cited_by_count,
               l.path[array_length(l.path, 1) - 1]::INT AS via
        FROM fn_paper_lineage(${paperId}, ${opts.direction}, ${opts.depth}) l
        JOIN paper p ON p.paper_id = l.paper_id
        ORDER BY l.depth, p.cited_by_count DESC
        LIMIT 300`,
    );
  } else {
    const pattern =
      opts.direction === "ancestors"
        ? "(:Paper {paperId: $id})-[:CITES]->{1,4}(n:Paper)"
        : "(:Paper {paperId: $id})<-[:CITES]-{1,4}(n:Paper)";
    nodes = await readGraph<LineageNode>(
      `MATCH path = ${pattern}
       WHERE length(path) <= $depth
       WITH n, min(length(path)) AS depth, collect(path) AS paths
       WITH n, depth, [p IN paths WHERE length(p) = depth][0] AS shortest
       RETURN n.paperId AS paper_id, depth, n.title AS title, n.year AS year, n.citedByCount AS cited_by_count,
              nodes(shortest)[-2].paperId AS via
       ORDER BY depth, cited_by_count DESC LIMIT 300`,
      { id: int(paperId), depth: int(opts.depth) },
    );
  }
  return {
    engine: opts.engine,
    direction: opts.direction,
    depth: opts.depth,
    nodes,
    took_ms: Math.round(performance.now() - started),
  };
}

export async function shortestPath(ctx: DbContext, from: number, to: number) {
  const t0 = performance.now();
  const graph = await readGraph<{ hops: number; ids: number[]; titles: string[]; years: (number | null)[] }>(
    `MATCH path = SHORTEST 1 (a:Paper {paperId: $from})-[:CITES]-+(b:Paper {paperId: $to})
     RETURN length(path) AS hops, [n IN nodes(path) | n.paperId] AS ids, [n IN nodes(path) | n.title] AS titles,
            [n IN nodes(path) | n.year] AS years`,
    { from: int(from), to: int(to) },
  );
  const graphMs = Math.round(performance.now() - t0);
  const t1 = performance.now();
  // The same question in SQL: breadth-first over citations in either direction, up to 4 hops.
  const sql = await withDb(
    ctx,
    (tx) => tx<{ hops: number; ids: number[] }[]>`
      WITH RECURSIVE edges(a, b) AS (
        SELECT citing_paper_id, cited_paper_id FROM citation
        UNION ALL SELECT cited_paper_id, citing_paper_id FROM citation
      ), walk(paper_id, depth, path) AS (
        SELECT ${from}::BIGINT, 0, ARRAY[${from}::BIGINT]
        UNION ALL
        SELECT e.b, w.depth + 1, w.path || e.b
        FROM walk w JOIN edges e ON e.a = w.paper_id
        WHERE w.depth < 3 AND NOT e.b = ANY (w.path) AND w.paper_id <> ${to}
      )
      SELECT depth AS hops, path::INT[] AS ids FROM walk WHERE paper_id = ${to} ORDER BY depth LIMIT 1`,
  );
  const sqlMs = Math.round(performance.now() - t1);
  return { graph: graph[0] ?? null, graph_ms: graphMs, sql: sql[0] ?? null, sql_ms: sqlMs };
}

export type GraphNode = {
  id: number;
  label: string;
  kind: "paper" | "author" | "topic";
  year: number | null;
  community: number | null;
  weight: number;
};
export type GraphEdge = { source: number; target: number; kind: string };

// One-hop citation neighbourhood plus curated relations, for the paper page's graph tab.
export async function neighbourhood(paperId: number) {
  const rows = await readGraph<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
    `MATCH (p:Paper {paperId: $id})
     OPTIONAL MATCH (p)-[r:CITES|EXTENDS|IMPROVES_UPON|CONTRADICTS|REPLICATES|RELATED_TO]-(n:Paper)
     WITH p, n, r ORDER BY n.citedByCount DESC LIMIT 60
     WITH p, collect(DISTINCT n) AS ns, collect(r) AS rs
     RETURN [x IN [p] + ns WHERE x IS NOT NULL | {id: x.paperId, label: x.title, kind: 'paper', year: x.year,
             community: x.community, weight: coalesce(x.localCitations, 0)}] AS nodes,
            [e IN rs WHERE e IS NOT NULL | {source: startNode(e).paperId, target: endNode(e).paperId, kind: type(e)}] AS edges`,
    { id: int(paperId) },
  );
  return rows[0] ?? { nodes: [], edges: [] };
}

export async function similarPapers(paperId: number) {
  return readGraph<{ paper_id: number; title: string; year: number | null; score: number }>(
    `MATCH (:Paper {paperId: $id})-[s:SIMILAR_TO]->(q:Paper)
     RETURN q.paperId AS paper_id, q.title AS title, q.year AS year, s.score AS score ORDER BY s.score DESC`,
    { id: int(paperId) },
  );
}

export type AtlasPoint = {
  id: number;
  x: number;
  y: number;
  c: number;
  y_: number | null;
  t: string;
  r: boolean;
  w: number;
};

// Every paper as a point: map coordinates, research front and year. Compact keys keep the payload small.
export async function atlasPoints(): Promise<AtlasPoint[]> {
  return readGraph<AtlasPoint>(
    `MATCH (p:Paper) WHERE p.umapX IS NOT NULL
     RETURN p.paperId AS id, p.umapX AS x, p.umapY AS y, coalesce(p.community, -1) AS c, p.year AS y_,
            left(p.title, 110) AS t, coalesce(p.isRetracted, false) AS r, coalesce(p.localCitations, 0) AS w`,
  );
}

export type Front = {
  community: number;
  papers: number;
  recent_share: number;
  growth: number;
  emerging: boolean;
  label: string;
  anchors: { paper_id: number; title: string; year: number | null }[];
  by_year: { year: number; papers: number }[];
};

// Leiden communities ranked by growth: share of papers from the last three years versus the corpus.
export async function researchFronts(limit = 12): Promise<Front[]> {
  const rows = await readGraph<Omit<Front, "emerging" | "growth" | "label"> & { topics: string[] }>(
    `MATCH (p:Paper) WHERE p.community IS NOT NULL
     WITH p.community AS community, collect(p) AS members
     WHERE size(members) >= 25
     WITH community, members, size(members) AS papers,
          toFloat(size([m IN members WHERE m.year >= 2023])) / size(members) AS recent_share
     CALL (members) {
       UNWIND members AS m
       MATCH (m)-[b:BELONGS_TO_TOPIC {primary: true}]->(t:Topic)
       WITH t.name AS topic, count(*) AS n ORDER BY n DESC LIMIT 3
       RETURN collect(topic) AS topics
     }
     CALL (members) {
       UNWIND members AS m
       WITH m ORDER BY m.articleRank DESC LIMIT 3
       RETURN collect({paper_id: m.paperId, title: m.title, year: m.year}) AS anchors
     }
     CALL (members) {
       UNWIND members AS m
       WITH m.year AS year, count(*) AS n WHERE year IS NOT NULL
       ORDER BY year
       RETURN collect({year: year, papers: n}) AS by_year
     }
     RETURN community, papers, recent_share, topics, anchors, by_year
     ORDER BY papers DESC`,
  );
  const overall =
    rows.reduce((s, r) => s + r.recent_share * r.papers, 0) /
    Math.max(
      rows.reduce((s, r) => s + r.papers, 0),
      1,
    );
  return rows
    .map((r) => ({
      community: r.community,
      papers: r.papers,
      recent_share: Math.round(r.recent_share * 1000) / 10,
      growth: Math.round((r.recent_share / Math.max(overall, 0.01)) * 100) / 100,
      emerging: r.recent_share > overall * 1.4,
      label: r.topics.slice(0, 2).join(" · ") || `Front ${r.community}`,
      anchors: r.anchors,
      by_year: r.by_year,
    }))
    .sort((a, b) => b.growth - a.growth)
    .slice(0, limit);
}

export async function hiddenGems(limit = 25) {
  return readGraph<{
    paper_id: number;
    title: string;
    year: number | null;
    cited_by_count: number;
    influence_pct: number;
    citation_pct: number;
  }>(
    `MATCH (p:Paper) WHERE p.articleRank IS NOT NULL
     WITH p ORDER BY p.articleRank
     WITH collect(p) AS byInfluence
     UNWIND range(0, size(byInfluence) - 1) AS i
     WITH byInfluence[i] AS p, toFloat(i) / size(byInfluence) AS influence_pct
     ORDER BY p.citedByCount
     WITH collect({p: p, inf: influence_pct}) AS byCitations
     UNWIND range(0, size(byCitations) - 1) AS j
     WITH byCitations[j].p AS p, byCitations[j].inf AS influence_pct, toFloat(j) / size(byCitations) AS citation_pct
     WHERE influence_pct >= 0.85 AND citation_pct < 0.6
     RETURN p.paperId AS paper_id, p.title AS title, p.year AS year, p.citedByCount AS cited_by_count,
            influence_pct, citation_pct
     ORDER BY influence_pct - citation_pct DESC LIMIT $limit`,
    { limit: int(limit) },
  );
}

export async function coauthors(authorId: number) {
  return readGraph<{ author_id: number; name: string; papers: number }>(
    `MATCH (:Author {authorId: $id})-[c:COAUTHOR]-(o:Author)
     RETURN o.authorId AS author_id, o.name AS name, c.papers AS papers ORDER BY papers DESC, name LIMIT 30`,
    { id: int(authorId) },
  );
}

export async function graphStats() {
  const [row] = await readGraph<{
    nodes: number;
    relationships: number;
    communities: number;
    similar: number;
  }>(
    `CALL () { MATCH (n) RETURN count(n) AS nodes }
     CALL () { MATCH ()-[r]->() RETURN count(r) AS relationships }
     CALL () { MATCH (p:Paper) WHERE p.community IS NOT NULL RETURN count(DISTINCT p.community) AS communities }
     CALL () { MATCH ()-[s:SIMILAR_TO]->() RETURN count(s) AS similar }
     RETURN nodes, relationships, communities, similar`,
  );
  return row;
}
