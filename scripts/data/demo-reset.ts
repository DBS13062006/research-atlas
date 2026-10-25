// pnpm demo:reset — puts the atlas back into its demo state after a walkthrough:
//   · papers the demo accounts imported through the app are removed (found through audit_log),
//     and so are retractions they recorded by hand
//   · throwaway accounts on the research-atlas.test domain (sign-up demos, test runs) are removed
//   · seed:demo restores the four demo accounts, their roles, libraries, notes, trails and relations
//   · the graph outbox is drained, analytics refreshed, expired sessions purged
// A running server keeps its page caches; restart it (or use Admin → Sync graph now) afterwards.
import { spawnSync } from "node:child_process";
import postgres from "postgres";
import { ownerUrl } from "../db/urls";
import { DEMO_USERS } from "./demo-users";

function run(script: string): void {
  const res = spawnSync("pnpm", ["--silent", script], { stdio: "inherit" });
  if (res.status !== 0) throw new Error(`${script} failed (exit ${res.status})`);
}

async function main(): Promise<void> {
  const started = Date.now();
  const sql = postgres(`${ownerUrl()}?sslmode=disable`, { max: 1, onnotice: () => {} });
  const emails = DEMO_USERS.map((u) => u.email);
  try {
    await sql.begin(async (tx) => {
      const demoIds = (
        await tx<{ user_id: string }[]>`SELECT user_id::TEXT FROM user_account WHERE email = ANY(${emails})`
      ).map((r) => r.user_id);
      const imported = await tx`
        DELETE FROM paper p
        USING audit_log a
        WHERE a.table_name = 'paper' AND a.operation = 'I'
          AND a.actor_user_id = ANY(${demoIds}::BIGINT[])
          AND p.paper_id = (a.row_pk ->> 'paper_id')::BIGINT
        RETURNING p.paper_id`;
      const retractions = await tx`
        DELETE FROM retraction WHERE source = 'MANUAL' AND recorded_by = ANY(${demoIds}::BIGINT[])
        RETURNING retraction_id`;
      const accounts = await tx`
        DELETE FROM user_account
        WHERE email LIKE '%@research-atlas.test' AND NOT (email = ANY(${emails}))
        RETURNING user_id`;
      console.log(
        `removed ${imported.length} imported papers, ${retractions.length} manual retractions, ${accounts.length} throwaway accounts`,
      );
    });
  } finally {
    await sql.end();
  }
  run("seed:demo");
  run("graph:sync");
  const after = postgres(`${ownerUrl()}?sslmode=disable`, { max: 1, onnotice: () => {} });
  try {
    await after`CALL sp_refresh_analytics()`;
    const [{ p_deleted }] = await after`CALL sp_purge_expired_sessions(NULL)`;
    console.log(`analytics refreshed; ${p_deleted} expired sessions purged`);
  } finally {
    await after.end();
  }
  console.log(`demo:reset finished in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
