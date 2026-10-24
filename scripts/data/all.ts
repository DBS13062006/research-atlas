// pnpm data:all — the whole data pipeline, in order, each step an idempotent package script.
// Stops at the first failing step; timings are printed and merged into data/ingest-report.json.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const STEPS = [
  "ingest:topics",
  "ingest:works",
  "ingest:expand",
  "ingest:load",
  "ingest:methods",
  "ingest:retractions",
  "embed:papers",
  "layout:umap",
  "graph:schema",
  "graph:rebuild",
  "graph:analytics",
  "seed:demo",
  "data:report",
];

const timings: Record<string, number> = {};
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
for (const step of STEPS) {
  if (!pkg.scripts[step] || pkg.scripts[step].includes("stub.mjs")) {
    console.log(`── ${step}: not available yet, skipped`);
    continue;
  }
  console.log(`── ${step}`);
  const started = Date.now();
  const res = spawnSync("pnpm", ["--silent", step], { stdio: "inherit" });
  timings[step] = Math.round((Date.now() - started) / 100) / 10;
  if (res.status !== 0) {
    console.error(`${step} failed (exit ${res.status})`);
    process.exit(res.status ?? 1);
  }
}
if (existsSync("data/ingest-report.json")) {
  const report = JSON.parse(readFileSync("data/ingest-report.json", "utf8")) as Record<string, unknown>;
  writeFileSync(
    "data/ingest-report.json",
    `${JSON.stringify({ ...report, timings_seconds: timings }, null, 2)}\n`,
  );
}
console.log("timings (s):", timings);
