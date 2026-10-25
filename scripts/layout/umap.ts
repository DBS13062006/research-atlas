// pnpm layout:umap — projects the paper embeddings to 2-D with umap-js (15 neighbours, minimum
// distance 0.1) and stores umapX / umapY on each Paper. A seeded random generator makes the map
// identical on every rebuild, so screenshots and the demo script stay valid.
import { UMAP } from "umap-js";
import { closeGraphDriver, graphDriver } from "../../src/server/graph/driver";

// mulberry32: a tiny deterministic PRNG.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main(): Promise<void> {
  const driver = graphDriver();
  const session = driver.session();
  const started = Date.now();
  try {
    const res = await session.run(
      "MATCH (p:Paper) WHERE p.embedding IS NOT NULL RETURN p.paperId AS id, p.embedding AS e ORDER BY p.paperId",
    );
    const ids = res.records.map((r) => r.get("id") as number);
    const data = res.records.map((r) => r.get("e") as number[]);
    if (data.length < 20) throw new Error("not enough embeddings: run pnpm embed:papers first");
    console.log(`projecting ${data.length} embeddings…`);
    const umap = new UMAP({ nComponents: 2, nNeighbors: 15, minDist: 0.1, random: seeded(20261025) });
    const coords = umap.fit(data);
    // Normalise to [-1, 1] on the longer axis using the 0.5–99.5 percentile range, so one far-away
    // island cannot squeeze the rest of the map; the few outliers are clamped to the edge.
    const pct = (values: number[], q: number) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
    };
    const xs = coords.map((c) => c[0]);
    const ys = coords.map((c) => c[1]);
    const [x0, x1, y0, y1] = [pct(xs, 0.005), pct(xs, 0.995), pct(ys, 0.005), pct(ys, 0.995)];
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const half = Math.max(x1 - x0, y1 - y0) / 2;
    const clamp = (v: number) => Math.max(-1.05, Math.min(1.05, v));
    const rows = ids.map((id, i) => ({
      id,
      x: Math.round(clamp((coords[i][0] - cx) / half) * 1e5) / 1e5,
      y: Math.round(clamp((coords[i][1] - cy) / half) * 1e5) / 1e5,
    }));
    for (let i = 0; i < rows.length; i += 1000) {
      await session.executeWrite((tx) =>
        tx.run("UNWIND $rows AS r MATCH (p:Paper {paperId: r.id}) SET p.umapX = r.x, p.umapY = r.y", {
          rows: rows.slice(i, i + 1000),
        }),
      );
    }
    console.log(
      `layout:umap wrote ${rows.length} coordinates in ${((Date.now() - started) / 1000).toFixed(1)} s`,
    );
  } finally {
    await session.close();
    await closeGraphDriver();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
