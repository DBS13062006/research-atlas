// pnpm db:test — rebuilds the test database from zero, loads the test seed and the pgTAP helpers,
// then runs every db/tests/*.sql file with pg_prove inside the database container.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const envFile = existsSync(".env.local") ? ["--env-file", ".env.local"] : [];
const testDb = `${process.env.POSTGRES_DB ?? "researchatlas"}_test`;

function run(cmd: string, args: string[]): void {
  const res = spawnSync(cmd, args, { stdio: "inherit" });
  if (res.error) throw res.error;
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function inDb(...args: string[]): string[] {
  return ["compose", ...envFile, "exec", "-T", "db", ...args];
}

function psqlFile(file: string): void {
  run(
    "docker",
    inDb(
      "psql",
      "-q",
      "-U",
      "postgres",
      "-d",
      testDb,
      "-v",
      "ON_ERROR_STOP=1",
      "-o",
      "/dev/null",
      "-f",
      `/workspace/${file}`,
    ),
  );
}

run("pnpm", ["exec", "tsx", "--env-file-if-exists=.env.local", "scripts/db/migrate.ts", "reset", "--test"]);
psqlFile("db/tests/helpers/setup.sql");
psqlFile("db/seed/test_seed.sql");
run(
  "docker",
  inDb("sh", "-c", `pg_prove -U postgres -d ${testDb} --failures --comments /workspace/db/tests/*.sql`),
);
