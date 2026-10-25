// pnpm seed:demo — four demo accounts (admin, curator, two researchers) with collections and notes on
// real papers, so every screen looks lived-in. Passwords come from SEED_PASSWORD; nothing is hard-coded.
// Idempotent: re-running refreshes passwords and recreates the demo content.
import postgres from "postgres";
import { hashPassword } from "../../src/server/auth/hash";
import { env } from "../../src/server/env";
import { closeGraphDriver, graphDriver } from "../../src/server/graph/driver";
import { createRelation } from "../../src/server/graph/relations";
import { addStep, createTrail } from "../../src/server/graph/trails";
import { ownerUrl } from "../db/urls";

export const DEMO_USERS = [
  { email: "admin@research-atlas.test", name: "Asha Admin", role: "ADMIN" },
  { email: "curator@research-atlas.test", name: "Cyrus Curator", role: "CURATOR" },
  { email: "rhea@research-atlas.test", name: "Rhea Researcher", role: "RESEARCHER" },
  { email: "ravi@research-atlas.test", name: "Ravi Researcher", role: "RESEARCHER" },
] as const;

type Pick = { paper_id: string };

async function main(): Promise<void> {
  const password = env().SEED_PASSWORD;
  if (!password) throw new Error("SEED_PASSWORD is not set in .env.local");
  const test = process.argv.includes("--test");
  const sql = postgres(`${ownerUrl({ test })}?sslmode=disable`, { max: 1, onnotice: () => {} });
  try {
    const hash = await hashPassword(password);
    const ids: Record<string, string> = {};
    await sql.begin(async (tx) => {
      for (const u of DEMO_USERS) {
        const [row] = await tx<{ user_id: string }[]>`
          INSERT INTO user_account (name, email, password_hash, role_id)
          VALUES (${u.name}, ${u.email}, ${hash}, (SELECT role_id FROM role WHERE role_code = ${u.role}))
          ON CONFLICT (email) DO UPDATE
            SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role_id = EXCLUDED.role_id,
                is_active = TRUE, failed_login_count = 0, locked_until = NULL
          RETURNING user_id::TEXT`;
        ids[u.email] = row.user_id;
      }
      const demoIds = Object.values(ids);
      await tx`DELETE FROM note WHERE user_id = ANY(${demoIds}::BIGINT[])`;
      await tx`DELETE FROM collection WHERE user_id = ANY(${demoIds}::BIGINT[])`;

      const pick = (pattern: string, limit: number) => tx<Pick[]>`
        SELECT paper_id::TEXT FROM paper
        WHERE title ~* ${pattern} AND abstract IS NOT NULL
        ORDER BY cited_by_count DESC, paper_id LIMIT ${limit}`;
      const snn = await pick("spiking|neuromorphic", 7);
      const transformers = await pick("transformer|attention|language model", 6);
      const clinical = await pick("clinical|health record|intensive care|ICU|patient", 5);
      const rl = await pick("reinforcement learning", 4);
      // A paper that cites retracted work, so "Check my library" has something real to find.
      const exposed = await tx<Pick[]>`
        SELECT e.paper_id::TEXT FROM v_retraction_exposure e
        JOIN paper p ON p.paper_id = e.paper_id
        ORDER BY e.hops, p.cited_by_count DESC LIMIT 1`;

      const collection = async (
        owner: string,
        name: string,
        description: string | null,
        isPublic: boolean,
      ) => {
        const [c] = await tx<{ collection_id: string }[]>`
          INSERT INTO collection (user_id, collection_name, description, is_public)
          VALUES (${owner}, ${name}, ${description}, ${isPublic}) RETURNING collection_id::TEXT`;
        return c.collection_id;
      };
      const add = async (collectionId: string, papers: Pick[], statuses: string[], priorities: string[]) => {
        for (const [i, p] of papers.entries()) {
          await tx`
            INSERT INTO collection_paper (collection_id, paper_id, reading_status, priority, position)
            VALUES (${collectionId}, ${p.paper_id}, ${statuses[i % statuses.length]}, ${priorities[i % priorities.length]}, ${i})
            ON CONFLICT DO NOTHING`;
        }
      };
      const note = (owner: string, paper: Pick | undefined, text: string, isPrivate = true) =>
        paper
          ? tx`INSERT INTO note (user_id, paper_id, note_text, is_private) VALUES (${owner}, ${paper.paper_id}, ${text}, ${isPrivate})`
          : Promise.resolve();

      const rhea = ids["rhea@research-atlas.test"];
      const ravi = ids["ravi@research-atlas.test"];
      const cyrus = ids["curator@research-atlas.test"];

      const c1 = await collection(
        rhea,
        "Spiking networks survey",
        "Reading for the SNN survey chapter",
        false,
      );
      await add(c1, snn, ["READ", "READ", "READING", "NOT_READ"], ["HIGH", "MEDIUM", "HIGH", "LOW"]);
      const c2 = await collection(
        rhea,
        "Transformer classics",
        "Papers everyone in the lab should read",
        true,
      );
      await add(c2, transformers, ["READ", "READING", "NOT_READ"], ["HIGH", "MEDIUM"]);
      await note(
        rhea,
        snn[0],
        "Surrogate gradients make this trainable end to end. Compare energy numbers with the hardware papers.",
      );
      await note(rhea, snn[1], "Good baseline for the conversion experiments.");
      await note(
        rhea,
        transformers[0],
        "**Key idea:** attention replaces recurrence entirely. Section 3.2 has the scaling argument.",
        false,
      );
      await note(rhea, transformers[2], "Check whether the retrieval results hold on longer contexts.");
      // A note on a paper not filed in any collection yet (Q12 finds these).
      await note(
        rhea,
        rl[1],
        "Came up in the reading group; might connect to the neuromorphic control work.",
      );

      const c3 = await collection(
        ravi,
        "Clinical ML baselines",
        "Baselines for the ICU mortality project",
        false,
      );
      await add(c3, [...clinical, ...exposed], ["READING", "NOT_READ", "READ"], ["HIGH", "MEDIUM"]);
      const c4 = await collection(ravi, "RL reading group", null, true);
      await add(c4, rl, ["NOT_READ", "READING"], ["MEDIUM", "LOW"]);
      await note(ravi, clinical[0], "Uses MIMIC; cohort definition differs from ours.");
      await note(
        ravi,
        exposed[0],
        "Cited by our related-work section. Double-check the sources it builds on.",
      );
      await note(ravi, rl[0], "Discuss in the reading group on Thursday.", false);

      const c5 = await collection(
        cyrus,
        "Needs metadata review",
        "Papers with missing venues or abstracts",
        false,
      );
      const review = await tx<
        Pick[]
      >`SELECT paper_id::TEXT FROM paper WHERE venue_id IS NULL OR abstract IS NULL ORDER BY cited_by_count DESC LIMIT 5`;
      await add(c5, review, ["NOT_READ"], ["MEDIUM"]);
    });
    await seedGraph(sql, ids);
    const [s] = await sql<{ users: number; collections: number; entries: number; notes: number }[]>`
      SELECT (SELECT count(*) FROM user_account)::INT AS users, (SELECT count(*) FROM collection)::INT AS collections,
             (SELECT count(*) FROM collection_paper)::INT AS entries, (SELECT count(*) FROM note)::INT AS notes`;
    console.log(
      `demo seed: ${s.users} users, ${s.collections} collections, ${s.entries} entries, ${s.notes} notes`,
    );
    console.log(
      `accounts: ${DEMO_USERS.map((u) => `${u.email} (${u.role})`).join(", ")}; password = SEED_PASSWORD`,
    );
  } finally {
    await sql.end();
  }
}

// Reading trails and curated relations live only in Neo4j. Skipped (with a message) when the graph is down.
async function seedGraph(sql: postgres.Sql, ids: Record<string, string>): Promise<void> {
  const driver = graphDriver();
  try {
    await driver.verifyConnectivity();
  } catch {
    console.log("Neo4j is not reachable: demo trails and relations skipped");
    return;
  }
  try {
    const demo = Object.values(ids).map(Number);
    const session = driver.session();
    await session.run("MATCH (t:Trail) WHERE t.ownerId IN $ids DETACH DELETE t", { ids: demo });
    await session.run(
      "MATCH (:Paper)-[r]->(:Paper) WHERE r.createdBy IN $ids AND r.relationId IS NOT NULL DELETE r",
      { ids: demo },
    );
    await session.close();
    const actor = (email: string, role: "RESEARCHER" | "CURATOR") => ({
      userId: Number(ids[email]),
      isCurator: role === "CURATOR",
      isAdmin: false,
    });
    const rhea = actor("rhea@research-atlas.test", "RESEARCHER");
    const ravi = actor("ravi@research-atlas.test", "RESEARCHER");
    const cyrus = actor("curator@research-atlas.test", "CURATOR");

    // A trail along a real citation chain: the most locally cited SNN paper, then papers that build on it.
    const [anchor] = await sql<{ paper_id: number }[]>`
      SELECT paper_id::INT FROM paper WHERE title ~* 'spiking' ORDER BY local_citation_count DESC LIMIT 1`;
    const chain = await sql<{ paper_id: number; title: string }[]>`
      SELECT l.paper_id::INT, p.title FROM fn_paper_lineage(${anchor.paper_id}, 'descendants', 2) l
      JOIN paper p USING (paper_id) ORDER BY l.depth, p.cited_by_count DESC LIMIT 4`;
    const t1 = await createTrail(
      driver,
      {
        title: "How spiking networks learned to train",
        description: "From early learning rules to surrogate gradients and deep SNNs.",
        visibility: "PUBLIC",
      },
      rhea,
    );
    await addStep(
      driver,
      t1,
      anchor.paper_id,
      "Start here: the paper the rest of this trail builds on.",
      rhea,
    );
    for (const [i, c] of chain.entries()) {
      await addStep(driver, t1, c.paper_id, i === 0 ? "Builds directly on the first stop." : null, rhea);
    }
    const rag = await sql<{ paper_id: number }[]>`
      SELECT paper_id::INT FROM paper WHERE title ~* 'retrieval-augmented|retrieval augmented' ORDER BY cited_by_count DESC LIMIT 4`;
    const t2 = await createTrail(driver, { title: "Getting started with RAG", visibility: "PRIVATE" }, ravi);
    for (const r of rag) await addStep(driver, t2, r.paper_id, null, ravi);

    const pairs = await sql<{ citing: number; cited: number }[]>`
      SELECT c.citing_paper_id::INT AS citing, c.cited_paper_id::INT AS cited
      FROM citation c JOIN paper a ON a.paper_id = c.citing_paper_id
      WHERE a.title ~* 'spiking|attention|graph|reinforcement'
      ORDER BY a.cited_by_count DESC LIMIT 4`;
    const kinds = ["EXTENDS", "IMPROVES_UPON", "REPLICATES", "RELATED_TO"] as const;
    for (const [i, p] of pairs.entries()) {
      await createRelation(
        driver,
        {
          fromPaperId: p.citing,
          toPaperId: p.cited,
          type: kinds[i],
          note: i === 0 ? "Same architecture, larger scale." : null,
          confidence: 3 + (i % 3),
        },
        i === 3 ? cyrus : i % 2 === 0 ? rhea : ravi,
      );
    }
    console.log(`graph seed: 2 trails, ${pairs.length} curated relations`);
  } finally {
    await closeGraphDriver();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
