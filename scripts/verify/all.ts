// pnpm verify:all — every gate in one command, without touching the data in the dev database:
//   static checks · migrations from zero and back on the test database · pgTAP · the SQL and Cypher
//   catalogs on both databases · a graph rebuild with a drift check · Vitest · a production build
//   served on its own port · Playwright (smoke, roles, Lab, accessibility) · Lighthouse.
// Run with `next dev` stopped: the build and the dev server would compete for memory.
import { type ChildProcess, spawn } from "node:child_process";
import { pnpm, runSteps, type Step } from "../lib-steps";

const PORT = 3101;
const BASE = `http://localhost:${PORT}`;
let server: ChildProcess | null = null;

const startServer: Step = {
  label: `next start on port ${PORT}`,
  run: async () => {
    server = spawn("pnpm", ["exec", "next", "start", "-p", String(PORT)], {
      stdio: "ignore",
      detached: true,
    });
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(BASE)).ok) return 0;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    return 1;
  },
};

function stopServer(): void {
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
}

runSteps(
  "verify:all",
  [
    pnpm("lint"),
    pnpm("typecheck"),
    pnpm("db:migrate"),
    {
      // On an empty database: with rows present, RESTRICT rules rightly stop the seed rollback.
      label: "migrations: fresh test database, roll back to zero, migrate up again",
      run: async () =>
        (await pnpm("db:reset", ["--test"]).run()) ||
        (await pnpm("db:rollback-all", ["--test"]).run()) ||
        pnpm("db:migrate", ["--test"]).run(),
    },
    { ...pnpm("db:test"), label: "db:test (test database rebuilt from zero, seeded, pgTAP)" },
    pnpm("queries:run", ["--test"]),
    pnpm("queries:run", ["--require-rows"]),
    pnpm("graph:rebuild"),
    pnpm("graph:check"),
    pnpm("cypher:run", ["--require-rows"]),
    pnpm("test"),
    pnpm("build"),
    startServer,
    pnpm("test:e2e", [], { E2E_BASE_URL: BASE }),
    pnpm("perf:lighthouse", ["--base", BASE]),
  ],
  stopServer,
).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
