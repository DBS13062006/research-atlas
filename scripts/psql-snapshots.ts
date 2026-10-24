// pnpm docs:ddl — saves `\d+` for every table (as text) and renders each one as a terminal-style
// PNG for the report, so the DDL figures are always regenerated from the real database.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const OUT = "docs/report/assets/ddl";
const envFile = existsSync(".env.local") ? ["--env-file", ".env.local"] : [];
const db = process.env.POSTGRES_DB ?? "researchatlas";

function psql(command: string): string {
  const res = spawnSync(
    "docker",
    [
      "compose",
      ...envFile,
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "postgres",
      "-d",
      db,
      "-P",
      "pager=off",
      "-c",
      command,
    ],
    { encoding: "utf8" },
  );
  if (res.status !== 0) throw new Error(res.stderr || `psql failed: ${command}`);
  return res.stdout;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const tables = psql(
    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace " +
      "WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relispartition " +
      "AND c.relname <> 'schema_migrations' ORDER BY 1",
  )
    .split("\n")
    .slice(2)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("("));

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  for (const table of tables) {
    const text = psql(`\\d+ ${table}`);
    writeFileSync(`${OUT}/${table}.txt`, text);
    await page.setContent(`<!doctype html><html><head><style>
      body { margin: 0; background: #0f172a; }
      .term { display: inline-block; margin: 0; padding: 0; background: #0b1220; border-radius: 10px;
              box-shadow: 0 0 0 1px #1e293b; font: 12.5px/1.45 "SF Mono", Menlo, monospace; color: #e2e8f0; }
      .bar { padding: 8px 12px; background: #111827; border-radius: 10px 10px 0 0; color: #94a3b8; font-size: 11px; }
      .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
      pre { margin: 0; padding: 14px 18px 18px; white-space: pre; }
      .prompt { color: #fbbf24; }
    </style></head><body><div class="term" id="t">
      <div class="bar"><span class="dot" style="background:#f87171"></span><span class="dot" style="background:#fbbf24"></span><span class="dot" style="background:#34d399"></span>&nbsp;psql — ${db}</div>
      <pre><span class="prompt">${db}=# </span>\\d+ ${table}\n${escapeHtml(text)}</pre></div></body></html>`);
    await page.locator("#t").screenshot({ path: `${OUT}/${table}.png` });
  }
  await browser.close();
  console.log(`Saved ${tables.length} DDL snapshots to ${OUT}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
