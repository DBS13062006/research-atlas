import type { Session } from "neo4j-driver";

// (:Author)-[:COAUTHOR {papers}]->(:Author) is derived from AUTHORED, so it is recomputed rather than
// projected: by graph:analytics, and by graph:rebuild, which recreates the Author nodes it hangs off.
export async function deriveCoauthors(session: Session): Promise<number> {
  await session.run("MATCH ()-[c:COAUTHOR]->() CALL (c) { DELETE c } IN TRANSACTIONS OF 10000 ROWS");
  await session.run(
    `MATCH (a1:Author)-[:AUTHORED]->(p:Paper)<-[:AUTHORED]-(a2:Author)
     WHERE a1.authorId < a2.authorId
     WITH a1, a2, count(DISTINCT p) AS papers
     CALL (a1, a2, papers) { MERGE (a1)-[c:COAUTHOR]->(a2) SET c.papers = papers } IN TRANSACTIONS OF 5000 ROWS`,
  );
  const res = await session.run("MATCH ()-[c:COAUTHOR]->() RETURN count(c) AS n");
  return Number(res.records[0].get("n"));
}
