// pnpm embed:papers — embeds every paper's "title: … | text: …" in batches of 64, caches vectors in
// data/cache/ (keyed by model and a hash of the text), writes them to Neo4j as Paper.embedding and
// records the model in an EmbeddingMeta node. Ollama is told to unload the model afterwards.
// --probe runs the five probe queries from the plan and prints the top hits.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  documentText,
  EMBEDDING_DIMENSIONS,
  embeddingProvider,
  queryText,
} from "../../src/server/embeddings/provider";
import { closeGraphDriver, graphDriver } from "../../src/server/graph/driver";
import { ownerSql } from "../graph/common";

const BATCH = 64;
export const PROBES = [
  "spiking neurons energy efficiency",
  "retrieval augmented generation",
  "graph attention",
  "ICU mortality prediction",
  "offline reinforcement learning",
];

async function probe(): Promise<void> {
  const provider = embeddingProvider();
  const session = graphDriver().session({ defaultAccessMode: "READ" });
  try {
    for (const q of PROBES) {
      const [vector] = await provider.embed([queryText(q)]);
      const res = await session.run(
        `CYPHER 25 MATCH (p:Paper) SEARCH p IN (VECTOR INDEX paper_embedding FOR $q LIMIT 5) SCORE AS score
         RETURN p.title AS title, p.year AS year, score ORDER BY score DESC`,
        { q: vector },
      );
      console.log(`\n"${q}"`);
      for (const r of res.records) {
        console.log(
          `  ${(r.get("score") as number).toFixed(3)}  ${r.get("year")}  ${String(r.get("title")).slice(0, 90)}`,
        );
      }
    }
  } finally {
    await session.close();
    await provider.unload();
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--probe")) {
    await probe();
    await closeGraphDriver();
    return;
  }
  const provider = embeddingProvider();
  const cacheFile = `data/cache/embeddings-${provider.model}.json.gz`;
  const cache: Record<string, number[]> = existsSync(cacheFile)
    ? JSON.parse(gunzipSync(readFileSync(cacheFile)).toString("utf8"))
    : {};
  const sql = ownerSql();
  const driver = graphDriver();
  const started = Date.now();
  let embedded = 0;
  try {
    const papers = await sql<{ paper_id: number; title: string; abstract: string | null }[]>`
      SELECT paper_id::INT, title, abstract FROM paper ORDER BY paper_id`;
    const items = papers.map((p) => {
      const text = documentText(p.title, p.abstract).slice(0, 6000);
      return { id: p.paper_id, text, key: createHash("sha1").update(text).digest("hex") };
    });
    const missing = items.filter((i) => !cache[i.key]);
    console.log(
      `${items.length} papers, ${missing.length} need embedding with ${provider.name}/${provider.model}`,
    );
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH);
      const vectors = await provider.embed(batch.map((b) => b.text));
      for (const [j, v] of vectors.entries()) {
        if (v.length !== EMBEDDING_DIMENSIONS)
          throw new Error(`expected ${EMBEDDING_DIMENSIONS} dimensions, got ${v.length}`);
        cache[batch[j].key] = v.map((x) => Math.round(x * 1e6) / 1e6);
      }
      embedded += batch.length;
      process.stdout.write(`\rembedded ${embedded}/${missing.length}`);
      if (embedded % 1024 === 0) writeFileSync(cacheFile, gzipSync(JSON.stringify(cache)));
    }
    if (missing.length) process.stdout.write("\n");
    mkdirSync("data/cache", { recursive: true });
    writeFileSync(cacheFile, gzipSync(JSON.stringify(cache)));

    const session = driver.session();
    try {
      for (let i = 0; i < items.length; i += 500) {
        const rows = items.slice(i, i + 500).map((it) => ({ id: it.id, embedding: cache[it.key] }));
        await session.executeWrite((tx) =>
          tx.run("UNWIND $rows AS r MATCH (p:Paper {paperId: r.id}) SET p.embedding = r.embedding", { rows }),
        );
      }
      await session.run(
        `MERGE (e:EmbeddingMeta {name: 'paper_embedding'})
         SET e.model = $model, e.provider = $provider, e.dimensions = $dims, e.createdAt = datetime(),
             e.documentTemplate = 'title: {title} | text: {abstract}', e.queryTemplate = 'task: search result | query: {q}'`,
        { model: provider.model, provider: provider.name, dims: EMBEDDING_DIMENSIONS },
      );
      await session.run("CALL db.awaitIndex('paper_embedding', 300)");
    } finally {
      await session.close();
    }
    console.log(`embed:papers done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } finally {
    await provider.unload();
    await sql.end();
    await closeGraphDriver();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
