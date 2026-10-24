// pnpm seed:demo — four demo accounts (admin, curator, two researchers) with collections and notes on
// real papers, so every screen looks lived-in. Passwords come from SEED_PASSWORD; nothing is hard-coded.
// Idempotent: re-running refreshes passwords and recreates the demo content.
import postgres from "postgres";
import { hashPassword } from "../../src/server/auth/hash";
import { env } from "../../src/server/env";
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

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
