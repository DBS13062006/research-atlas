// pnpm graph:analytics — graph algorithms whose results are written back onto the graph:
//   ArticleRank (influence) → Paper.articleRank        Leiden (research fronts) → Paper.community
//   betweenness, sampled → Paper.betweenness            co-authorship → (:Author)-[:COAUTHOR {papers}]->(:Author)
//   top-10 vector neighbours with score ≥ 0.75 → (:Paper)-[:SIMILAR_TO {score, model}]->(:Paper)
// Seeds are fixed so the results are the same on every run.
import { closeGraphDriver, graphDriver } from "../../src/server/graph/driver";

async function main(): Promise<void> {
  const session = graphDriver().session();
  const t0 = Date.now();
  const step = (label: string) =>
    console.log(`${label.padEnd(26)} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  try {
    for (const name of ["atlas-citations", "atlas-citations-undirected"]) {
      await session.run("CALL gds.graph.drop($name, false) YIELD graphName RETURN graphName", { name });
    }
    await session.run("MATCH (p:Paper) REMOVE p.articleRank, p.community, p.betweenness");

    await session.run("CALL gds.graph.project('atlas-citations', 'Paper', 'CITES')");
    const ar = await session.run(
      `CALL gds.articleRank.write('atlas-citations', {writeProperty: 'articleRank', maxIterations: 40, dampingFactor: 0.85})
       YIELD nodePropertiesWritten, ranIterations RETURN nodePropertiesWritten, ranIterations`,
    );
    step(`ArticleRank (${ar.records[0].get("nodePropertiesWritten")} papers)`);

    const bt = await session.run(
      `CALL gds.betweenness.write('atlas-citations', {writeProperty: 'betweenness', samplingSize: 1000, samplingSeed: 42})
       YIELD nodePropertiesWritten RETURN nodePropertiesWritten`,
    );
    step(`betweenness (${bt.records[0].get("nodePropertiesWritten")})`);

    await session.run(
      "CALL gds.graph.project('atlas-citations-undirected', 'Paper', {CITES: {orientation: 'UNDIRECTED'}})",
    );
    const ld = await session.run(
      `CALL gds.leiden.write('atlas-citations-undirected', {writeProperty: 'community', randomSeed: 19, concurrency: 1,
                                                            maxLevels: 10, gamma: 1.0, theta: 0.01})
       YIELD communityCount, modularity RETURN communityCount, modularity`,
    );
    step(
      `Leiden (${ld.records[0].get("communityCount")} communities, modularity ${(ld.records[0].get("modularity") as number).toFixed(3)})`,
    );
    for (const name of ["atlas-citations", "atlas-citations-undirected"]) {
      await session.run("CALL gds.graph.drop($name, false) YIELD graphName RETURN graphName", { name });
    }

    await session.run("MATCH ()-[c:COAUTHOR]->() CALL (c) { DELETE c } IN TRANSACTIONS OF 10000 ROWS");
    await session.run(
      `MATCH (a1:Author)-[:AUTHORED]->(p:Paper)<-[:AUTHORED]-(a2:Author)
       WHERE a1.authorId < a2.authorId
       WITH a1, a2, count(DISTINCT p) AS papers
       CALL (a1, a2, papers) { MERGE (a1)-[c:COAUTHOR]->(a2) SET c.papers = papers } IN TRANSACTIONS OF 5000 ROWS`,
    );
    const co = await session.run("MATCH ()-[c:COAUTHOR]->() RETURN count(c) AS n");
    step(`co-authorship (${co.records[0].get("n")} pairs)`);

    await session.run("MATCH ()-[s:SIMILAR_TO]->() CALL (s) { DELETE s } IN TRANSACTIONS OF 10000 ROWS");
    const meta = await session.run(
      "MATCH (e:EmbeddingMeta {name: 'paper_embedding'}) RETURN e.model AS model",
    );
    const model = (meta.records[0]?.get("model") as string | undefined) ?? "unknown";
    await session.run(
      `CYPHER 25
       MATCH (p:Paper) WHERE p.embedding IS NOT NULL
       CALL (p) {
         MATCH (q:Paper)
           SEARCH q IN (VECTOR INDEX paper_embedding FOR p.embedding LIMIT 11) SCORE AS score
         WITH p, q, score WHERE q <> p AND score >= 0.75
         MERGE (p)-[s:SIMILAR_TO]->(q) SET s.score = score, s.model = $model
       } IN TRANSACTIONS OF 200 ROWS`,
      { model },
    );
    const sim = await session.run(
      "MATCH ()-[s:SIMILAR_TO]->() RETURN count(s) AS n, round(avg(s.score), 3) AS avg",
    );
    step(`similarity (${sim.records[0].get("n")} edges, mean ${sim.records[0].get("avg")})`);
  } finally {
    await session.close();
    await closeGraphDriver();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
