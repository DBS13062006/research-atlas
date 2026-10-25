// pnpm docs:brand — renders the README and repository artwork into docs/assets/ with Chromium:
//   banner.png             the README header: the real atlas (every paper at its UMAP position,
//                          coloured by research front) beside the title and live corpus counts
//   social-preview.png     the same at 1280×640, for the GitHub repository's social preview
//   architecture-{dark,light}.png   the system diagram in both themes
// Fonts are the app's own (Instrument Serif, Geist, Geist Mono) from Google Fonts.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { closeGraphDriver, graphDriver } from "../../src/server/graph/driver";
import { ownerSql } from "../graph/common";

const OUT = "docs/assets";
const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Instrument+Serif&display=block" rel="stylesheet">';
// Okabe-Ito based category colours from globals.css; red is reserved for retractions.
const CATS = ["#e69f00", "#56b4e9", "#009e73", "#f0e442", "#0072b2", "#cc79a7", "#44aa99", "#b8a07e"];

const COMPASS = (size: number) => `
<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" style="color:#e8edf5">
  <circle cx="16" cy="16" r="14.5" stroke="currentColor" stroke-opacity="0.35"/>
  <circle cx="16" cy="16" r="10" stroke="currentColor" stroke-opacity="0.2" stroke-dasharray="1.5 2.5"/>
  <path d="M16 2.5 L18.6 13.4 L16 16 L13.4 13.4 Z" fill="#e3b75f"/>
  <path d="M16 29.5 L13.4 18.6 L16 16 L18.6 18.6 Z" fill="currentColor" fill-opacity="0.55"/>
  <path d="M2.5 16 L13.4 13.4 L16 16 L13.4 18.6 Z" fill="currentColor" fill-opacity="0.35"/>
  <path d="M29.5 16 L18.6 18.6 L16 16 L18.6 13.4 Z" fill="currentColor" fill-opacity="0.35"/>
  <circle cx="16" cy="16" r="1.6" fill="#0d1424" stroke="currentColor"/>
</svg>`;

type Point = { x: number; y: number; c: number; r: boolean; w: number };
type Stats = { papers: number; citations: number; authors: number; fronts: number };

const fmt = (n: number) => n.toLocaleString("en-US");

function hero(points: Point[], stats: Stats, width: number, height: number, compact: boolean): string {
  const chips = [
    [fmt(stats.papers), "papers"],
    [fmt(stats.citations), "citations"],
    [fmt(stats.authors), "authors"],
    [String(stats.fronts), "research fronts"],
  ]
    .map(([n, l]) => `<div class="chip"><b>${n}</b><span>${l}</span></div>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${width}px; height: ${height}px; overflow: hidden; font-family: Geist, sans-serif; color: #e8edf5;
    background:
      radial-gradient(1200px 520px at 78% 50%, #16233d 0%, transparent 70%),
      linear-gradient(135deg, #0b1220 0%, #0f1828 55%, #0b1220 100%); }
  .topo { position: absolute; inset: 0; opacity: .55;
    background-image:
      radial-gradient(circle at 12% 18%, transparent 0 58px, rgba(140,180,230,.07) 59px 60px, transparent 61px 118px,
        rgba(140,180,230,.07) 119px 120px, transparent 121px 178px, rgba(140,180,230,.06) 179px 180px, transparent 181px),
      radial-gradient(circle at 30% 108%, transparent 0 98px, rgba(140,180,230,.06) 99px 100px, transparent 101px 178px,
        rgba(140,180,230,.06) 179px 180px, transparent 181px 258px, rgba(140,180,230,.05) 259px 260px, transparent 261px); }
  canvas { position: absolute; right: 0; top: 0; }
  .fade { position: absolute; inset: 0; background: linear-gradient(90deg, #0c1322 0%, #0c1322 ${compact ? 46 : 38}%, rgba(12,19,34,.6) ${compact ? 54 : 50}%, transparent ${compact ? 62 : 64}%); }
  .text { position: absolute; left: ${compact ? 64 : 72}px; top: 50%; transform: translateY(-50%); width: ${compact ? 620 : 640}px; }
  .brand { display: flex; align-items: center; gap: 18px; }
  h1 { font-family: "Instrument Serif", serif; font-weight: 400; font-size: ${compact ? 84 : 78}px; letter-spacing: -.01em; line-height: 1; }
  .eyebrow { font-family: "Geist Mono", monospace; font-size: 13px; letter-spacing: .28em; text-transform: uppercase; color: #8fa0b8; margin-bottom: 18px; }
  .tag { font-family: "Instrument Serif", serif; font-size: ${compact ? 40 : 34}px; color: #e3b75f; margin-top: 14px; }
  .sub { font-size: ${compact ? 19 : 17}px; line-height: 1.55; color: #b7c3d6; margin-top: 12px; max-width: 560px; }
  .chips { display: flex; gap: 10px; margin-top: ${compact ? 34 : 26}px; flex-wrap: wrap; }
  .chip { display: flex; align-items: baseline; gap: 7px; padding: 8px 13px; border-radius: 999px;
    border: 1px solid rgba(232,237,245,.14); background: rgba(232,237,245,.04); font-size: 14px; color: #9fb0c6; }
  .chip b { font-family: "Geist Mono", monospace; font-weight: 500; color: #e8edf5; font-size: 15px; }
  .legend { position: absolute; right: 28px; bottom: 20px; font-family: "Geist Mono", monospace; font-size: 11px; color: #6f8098; letter-spacing: .06em; }
</style></head><body>
<div class="topo"></div>
<canvas id="map" width="${width * 2}" height="${height * 2}" style="width:${width}px;height:${height}px"></canvas>
<div class="fade"></div>
<div class="text">
  <div class="eyebrow">Postgres 18 · Neo4j · Next.js 16</div>
  <div class="brand">${COMPASS(compact ? 76 : 68)}<h1>Research Atlas</h1></div>
  <div class="tag">See how an idea travelled.</div>
  <div class="sub">Real research papers placed by meaning, linked by citation, traced through their lineage and checked against retractions — with every rule enforced inside the database.</div>
  <div class="chips">${chips}</div>
</div>
<div class="legend">each dot is a paper · colour = research front (Leiden)</div>
<script>
  const pts = ${JSON.stringify(points.map((p) => [Math.round(p.x * 1000), Math.round(p.y * 1000), p.c, p.r ? 1 : 0, p.w]))};
  const cats = ${JSON.stringify(CATS)};
  const cv = document.getElementById("map"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height, s = 2;
  const left = W * ${compact ? 0.56 : 0.44}, pad = 40 * s;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const q = (a, f) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(f * (b.length - 1))]; };
  const x0 = q(xs, .01), x1 = q(xs, .99), y0 = q(ys, .01), y1 = q(ys, .99);
  const k = Math.min((W - left - pad * 2) / (x1 - x0), (H - pad * 2) / (y1 - y0));
  const ox = left + pad + ((W - left - pad * 2) - (x1 - x0) * k) / 2, oy = pad + ((H - pad * 2) - (y1 - y0) * k) / 2;
  const sizes = {};
  for (const p of pts) sizes[p[2]] = (sizes[p[2]] || 0) + 1;
  const rank = Object.entries(sizes).sort((a, b) => b[1] - a[1]).map(e => Number(e[0]));
  const colour = c => rank.indexOf(c) >= 0 && rank.indexOf(c) < 8 ? cats[rank.indexOf(c)] : "#5c6b82";
  for (const p of pts) {
    const x = ox + (p[0] - x0) * k, y = oy + (p[1] - y0) * k;
    const r = (1.2 + Math.min(4, Math.sqrt(p[4]) * 0.45)) * s;
    ctx.fillStyle = p[3] ? "#ff5a4f" : colour(p[2]);
    ctx.globalAlpha = p[3] ? 1 : .78;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
</script></body></html>`;
}

function architecture(theme: "dark" | "light"): string {
  const t =
    theme === "dark"
      ? {
          bg: "#0d1424",
          card: "#141e33",
          border: "rgba(232,237,245,.14)",
          fg: "#e8edf5",
          muted: "#93a3ba",
          accent: "#e3b75f",
          line: "#6d7f99",
          pill: "#1b2740",
          pg: "#5b9bd5",
          neo: "#4fc08d",
          next: "#e8edf5",
          jobs: "#c792ea",
        }
      : {
          bg: "#faf7f0",
          card: "#ffffff",
          border: "rgba(20,30,50,.14)",
          fg: "#172033",
          muted: "#56627a",
          accent: "#9a6b14",
          line: "#7d889c",
          pill: "#f1ece1",
          pg: "#2f6db3",
          neo: "#1f8f5f",
          next: "#172033",
          jobs: "#7b4bb5",
        };
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    title: string,
    sub: string,
    items: string[],
  ) => `
    <div class="box" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-top:3px solid ${color}">
      <div class="title">${title}</div><div class="sub">${sub}</div>
      <ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>
    </div>`;
  const label = (x: number, y: number, text: string) =>
    `<div class="label" style="left:${x}px;top:${y}px">${text}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1280px; height: 700px; background: ${t.bg}; color: ${t.fg}; font-family: Geist, sans-serif; position: relative; overflow: hidden; }
  h2 { position: absolute; left: 48px; top: 30px; font-family: "Instrument Serif", serif; font-weight: 400; font-size: 34px; }
  .lede { position: absolute; left: 48px; top: 76px; color: ${t.muted}; font-size: 15px; }
  .box { position: absolute; background: ${t.card}; border: 1px solid ${t.border}; border-radius: 14px; padding: 16px 18px; }
  .title { font-weight: 600; font-size: 17px; }
  .sub { font-family: "Geist Mono", monospace; font-size: 11.5px; color: ${t.muted}; margin-top: 3px; letter-spacing: .02em; }
  ul { list-style: none; margin-top: 12px; display: grid; gap: 6px; }
  li { font-size: 13px; line-height: 1.35; padding-left: 14px; position: relative; }
  li::before { content: ""; position: absolute; left: 0; top: 7px; width: 5px; height: 5px; border-radius: 50%; background: ${t.accent}; }
  .label { position: absolute; transform: translate(-50%, -50%); font-family: "Geist Mono", monospace; font-size: 11px; color: ${t.fg};
    background: ${t.pill}; border: 1px solid ${t.border}; border-radius: 999px; padding: 4px 10px; white-space: nowrap; }
  svg { position: absolute; inset: 0; }
  .foot { position: absolute; left: 48px; bottom: 26px; font-size: 12.5px; color: ${t.muted}; }
  .foot b { color: ${t.accent}; font-weight: 500; }
</style></head><body>
<h2>How Research Atlas fits together</h2>
<div class="lede">One door in, one system of record, and a graph that is always rebuilt from it.</div>
<svg width="1280" height="700"><defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${t.line}"/></marker></defs>
  <g stroke="${t.line}" stroke-width="1.6" fill="none" marker-end="url(#a)">
    <path d="M200 382 L262 382"/>
    <path d="M552 240 C 600 240, 600 200, 648 200"/>
    <path d="M552 400 C 610 400, 600 540, 648 540"/>
    <path d="M800 340 L800 446"/>
    <path d="M1040 230 C 1000 230, 1000 210, 958 210"/>
    <path d="M1040 440 C 1000 440, 1000 540, 958 540"/>
  </g>
</svg>
${box(40, 306, 160, 152, t.fg, "Browser", "any visitor", ["22 pages", "⌘K palette", "Query Lab"])}
${box(266, 150, 286, 282, t.next, "Next.js 16.4", "the only door in", [
  "<code>proxy.ts</code> redirects only",
  "Server Components, <code>'use cache'</code> by tag",
  "Data access layer: session → role",
  "<code>/api/v1</code>: 66 endpoints from one registry",
  "Zod validation, RFC 9457 errors, OpenAPI",
  "Query Lab: catalog runs as your role",
])}
${box(652, 112, 306, 228, t.pg, "PostgreSQL 18", "system of record", [
  "24 tables · 125 named constraints",
  "18 functions · 8 procedures · 30 triggers",
  "GRANTs + forced row-level security",
  "audit_log (monthly partitions)",
  "graph_outbox written in the same transaction",
])}
${box(652, 450, 306, 184, t.neo, "Neo4j 2026.09 + GDS", "knowledge graph and vectors", [
  "property graph projected from PostgreSQL",
  "768-d vector index, SEARCH with filters",
  "ArticleRank · Leiden · betweenness",
  "trails and curated relations (graph-native)",
])}
${box(1044, 150, 200, 322, t.jobs, "Pipeline", "pnpm scripts", [
  "OpenAlex works, authors, topics",
  "Papers with Code archive",
  "Retraction Watch (Crossref)",
  "Ollama EmbeddingGemma",
  "UMAP map layout",
  "graph analytics",
  "verify:all · demo:reset",
])}
${label(231, 362, "HTTPS")}
${label(600, 184, "SET LOCAL ROLE ra_*")}
${label(600, 492, "Cypher · SEARCH")}
${label(870, 393, "outbox → UNWIND drain")}
${label(1000, 196, "load")}
${label(1000, 492, "embed · analyse")}
<div class="foot">Every request runs under the caller's PostgreSQL role, so <b>the database itself</b> refuses what a role may not do. Neo4j is fed only from the outbox and rebuilt from PostgreSQL in seconds.</div>
</body></html>`;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const sql = ownerSql();
  const driver = graphDriver();
  try {
    const session = driver.session({ defaultAccessMode: "READ" });
    const res = await session.run(
      `MATCH (p:Paper) WHERE p.umapX IS NOT NULL
       RETURN p.umapX AS x, p.umapY AS y, coalesce(p.community, -1) AS c,
              coalesce(p.isRetracted, false) AS r, coalesce(p.localCitations, 0) AS w`,
    );
    const fronts = await session.run("MATCH (p:Paper) RETURN count(DISTINCT p.community) AS n");
    await session.close();
    const points = res.records.map((r) => r.toObject() as Point);
    const [counts] = await sql<{ papers: number; citations: number; authors: number }[]>`
      SELECT (SELECT count(*) FROM paper)::INT AS papers, (SELECT count(*) FROM citation)::INT AS citations,
             (SELECT count(*) FROM author)::INT AS authors`;
    const stats: Stats = { ...counts, fronts: Number(fronts.records[0].get("n")) };

    const browser = await chromium.launch();
    try {
      const shots: [string, string, number, number][] = [
        ["banner.png", hero(points, stats, 1280, 400, false), 1280, 400],
        ["social-preview.png", hero(points, stats, 1280, 640, true), 1280, 640],
        ["architecture-dark.png", architecture("dark"), 1280, 700],
        ["architecture-light.png", architecture("light"), 1280, 700],
      ];
      for (const [file, html, width, height] of shots) {
        const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `${OUT}/${file}` });
        await page.close();
        console.log(`wrote ${OUT}/${file}`);
      }
    } finally {
      await browser.close();
    }
  } finally {
    await sql.end();
    await closeGraphDriver();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
