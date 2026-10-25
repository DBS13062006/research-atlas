// pnpm perf:lighthouse — Lighthouse against a running production server (pnpm build && pnpm start).
// Scores the home page and one paper page with the mobile (default) and desktop presets and fails
// if performance, accessibility, best practices or SEO is below 90 in any of them.
//   --base http://localhost:3000   server to test
import { chromium } from "@playwright/test";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;
const THRESHOLD = 90;

async function paperPath(): Promise<string> {
  const res = await fetch(`${base}/api/v1/search?q=attention&mode=lexical&limit=1`);
  const { hits } = (await res.json()) as { hits: { paper_id: number }[] };
  return `/papers/${hits[0].paper_id}`;
}

async function main(): Promise<void> {
  const pages = ["/", await paperPath()];
  const chrome = await chromeLauncher.launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless=new", "--no-first-run"],
  });
  let failed = false;
  try {
    for (const preset of ["mobile", "desktop"] as const) {
      for (const path of pages) {
        const result = await lighthouse(
          `${base}${path}`,
          { port: chrome.port, output: "json", logLevel: "error", onlyCategories: [...CATEGORIES] },
          preset === "desktop" ? desktopConfig : undefined,
        );
        if (!result) throw new Error(`no Lighthouse result for ${path}`);
        const { categories, audits } = result.lhr;
        const scores = CATEGORIES.map((c) => Math.round((categories[c]?.score ?? 0) * 100));
        const lcp = audits["largest-contentful-paint"]?.displayValue ?? "?";
        const tbt = audits["total-blocking-time"]?.displayValue ?? "?";
        const cls = audits["cumulative-layout-shift"]?.displayValue ?? "?";
        const low = scores.some((s) => s < THRESHOLD);
        if (low) failed = true;
        console.log(
          `${low ? "FAIL" : "ok  "} ${preset.padEnd(7)} ${path.padEnd(14)} ` +
            CATEGORIES.map((c, i) => `${c} ${scores[i]}`).join("  ") +
            `   LCP ${lcp}  TBT ${tbt}  CLS ${cls}`,
        );
        if (process.env.LH_DUMP) {
          const { writeFileSync } = await import("node:fs");
          writeFileSync(
            `${process.env.LH_DUMP}/${preset}${path.replaceAll("/", "_")}.json`,
            JSON.stringify(result.lhr),
          );
        }
        if (low) {
          const opportunities = Object.values(audits)
            .filter((a) => a.score !== null && a.score < 0.9 && a.details?.type === "opportunity")
            .map((a) => `      ${a.title}${a.displayValue ? ` (${a.displayValue})` : ""}`);
          if (opportunities.length) console.log(opportunities.join("\n"));
        }
      }
    }
  } finally {
    chrome.kill();
  }
  if (failed) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
