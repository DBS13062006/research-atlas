// pnpm graph:export-native — JSON backup of the data that lives only in Neo4j (reading trails and
// curated relations). Restore with --import <file>. Backups go to data/backup/ (git-ignored).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { closeGraphDriver, graphDriver } from "../../src/server/graph/driver";

const CURATED = ["EXTENDS", "IMPROVES_UPON", "CONTRADICTS", "REPLICATES", "RELATED_TO"];

async function main(): Promise<void> {
  const session = graphDriver().session();
  try {
    const importIdx = process.argv.indexOf("--import");
    if (importIdx > -1) {
      const data = JSON.parse(readFileSync(process.argv[importIdx + 1], "utf8"));
      for (const t of data.trails) {
        await session.run(
          `MERGE (t:Trail {trailId: $t.trailId}) SET t += $props
           WITH t UNWIND $t.steps AS s MATCH (p:Paper {paperId: s.paperId})
           MERGE (t)-[st:STEP {position: s.position}]->(p) SET st.annotation = s.annotation`,
          { t, props: t.props },
        );
      }
      for (const r of data.relations) {
        await session.run(
          `MATCH (a:Paper {paperId: $r.from}), (b:Paper {paperId: $r.to})
           CALL apoc.merge.relationship(a, $r.type, {relationId: $r.props.relationId}, $r.props, b, {}) YIELD rel RETURN rel`,
          { r },
        );
      }
      console.log(`imported ${data.trails.length} trails and ${data.relations.length} curated relations`);
      return;
    }
    const trails = await session.run(
      `MATCH (t:Trail) OPTIONAL MATCH (t)-[s:STEP]->(p:Paper)
       WITH t, s, p ORDER BY s.position
       RETURN t.trailId AS trailId, properties(t) AS props,
              collect(CASE WHEN p IS NULL THEN null ELSE {paperId: p.paperId, position: s.position, annotation: s.annotation} END) AS steps`,
    );
    const relations = await session.run(
      `MATCH (a:Paper)-[r]->(b:Paper) WHERE type(r) IN $types
       RETURN type(r) AS type, a.paperId AS from, b.paperId AS to, properties(r) AS props`,
      { types: CURATED },
    );
    const data = {
      exported_at: new Date().toISOString(),
      trails: trails.records.map((r) => ({
        trailId: r.get("trailId"),
        props: r.get("props"),
        steps: r.get("steps"),
      })),
      relations: relations.records.map((r) => r.toObject()),
    };
    mkdirSync("data/backup", { recursive: true });
    const file = `data/backup/graph-native-${data.exported_at.replace(/[:.]/g, "-")}.json`;
    writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`wrote ${file}: ${data.trails.length} trails, ${data.relations.length} curated relations`);
  } finally {
    await session.close();
    await closeGraphDriver();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
