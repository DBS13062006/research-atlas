// Incremental sync keeps derived COAUTHOR edges right: an authorship added in PostgreSQL creates the
// co-author edges once the outbox is drained, and removing it takes them away again. Uses one real
// paper and author and restores both, so the dev data ends where it started.
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/server/env";
import { closeGraphDriver, graphDriver } from "@/server/graph/driver";
import { drainOutbox } from "@/server/graph/projection";

const owner = postgres(`${env().DATABASE_OWNER_URL}?sslmode=disable`, { max: 1, onnotice: () => {} });
const drain = () => drainOutbox((fn) => owner.begin(fn) as never, graphDriver());
let paperId: number;
let coauthor: number;
let newcomer: number;

async function edge(a: number, b: number): Promise<number | null> {
  const s = graphDriver().session({ defaultAccessMode: "READ" });
  try {
    const r = await s.run(
      "MATCH (x:Author {authorId: $a})-[c:COAUTHOR]-(y:Author {authorId: $b}) RETURN c.papers AS n",
      { a, b },
    );
    return r.records.length ? Number(r.records[0].get("n")) : null;
  } finally {
    await s.close();
  }
}

beforeAll(async () => {
  await drain();
  // A paper with an author, and an author who has never written with that author.
  const [row] = await owner<{ paper_id: number; coauthor: number; newcomer: number }[]>`
    SELECT pa.paper_id::INT, pa.author_id::INT AS coauthor,
           (SELECT a.author_id::INT FROM author a
            WHERE NOT EXISTS (SELECT 1 FROM paper_author x JOIN paper_author y USING (paper_id)
                              WHERE x.author_id = a.author_id AND y.author_id = pa.author_id)
            ORDER BY a.author_id LIMIT 1) AS newcomer
    FROM paper_author pa WHERE pa.author_order = 1 ORDER BY pa.paper_id LIMIT 1`;
  ({ paper_id: paperId, coauthor, newcomer } = row);
});

afterAll(async () => {
  await owner`DELETE FROM paper_author WHERE paper_id = ${paperId} AND author_id = ${newcomer}`;
  await drain();
  await owner.end();
  await closeGraphDriver();
});

describe("incremental sync of derived co-authorship", () => {
  it("adds a COAUTHOR edge when an authorship is added", async () => {
    expect(await edge(coauthor, newcomer)).toBeNull();
    await owner`
      INSERT INTO paper_author (paper_id, author_id, author_order)
      SELECT ${paperId}, ${newcomer}, max(author_order) + 1 FROM paper_author WHERE paper_id = ${paperId}`;
    await drain();
    expect(await edge(coauthor, newcomer)).toBe(1);
  });

  it("removes it again when the authorship goes", async () => {
    await owner`DELETE FROM paper_author WHERE paper_id = ${paperId} AND author_id = ${newcomer}`;
    await drain();
    expect(await edge(coauthor, newcomer)).toBeNull();
  });
});
