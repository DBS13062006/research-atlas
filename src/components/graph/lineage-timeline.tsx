"use client";

import { scaleLinear, scaleSqrt } from "d3";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

// "Where did this idea come from, and where did it go?" Each paper sits at its publication year
// (x) in the lane for its citation depth (y); a curve joins it to the paper it was reached through.

export type TimelineNode = {
  paper_id: number;
  depth: number;
  title: string;
  year: number | null;
  cited_by_count: number;
  via: number | null;
};

export function LineageTimeline({
  root,
  nodes,
  direction,
}: {
  root: { paper_id: number; title: string; year: number | null };
  nodes: TimelineNode[];
  direction: "ancestors" | "descendants";
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = useMemo(() => nodes.filter((n) => n.year !== null).slice(0, 160), [nodes]);
  const maxDepth = Math.max(1, ...shown.map((n) => n.depth));
  const laneH = 90;
  const height = (maxDepth + 1) * laneH + 40;
  const years = [root.year ?? 2020, ...shown.map((n) => n.year as number)];
  const x = scaleLinear()
    .domain([Math.min(...years) - 1, Math.max(...years) + 1])
    .range([40, width - 30]);
  const r = scaleSqrt()
    .domain([0, Math.max(10, ...shown.map((n) => n.cited_by_count))])
    .range([3, 13]);

  // Spread papers that share a lane and year vertically so they do not overlap.
  const pos = useMemo(() => {
    const m = new Map<number, { x: number; y: number }>();
    m.set(root.paper_id, { x: x(root.year ?? 2020), y: 30 });
    const slots = new Map<string, number>();
    for (const n of shown) {
      const key = `${n.depth}:${n.year}`;
      const k = slots.get(key) ?? 0;
      slots.set(key, k + 1);
      const offset = ((k % 5) - 2) * 14;
      m.set(n.paper_id, { x: x(n.year as number) + (k > 4 ? 6 : 0), y: 30 + n.depth * laneH + offset });
    }
    return m;
  }, [shown, root, x]);

  const ticks = x.ticks(Math.min(12, Math.floor(width / 70)));
  const hovered = hover !== null ? (shown.find((n) => n.paper_id === hover) ?? null) : null;

  return (
    <div ref={wrap} className="relative w-full overflow-hidden rounded-xl border bg-card">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Timeline of ${shown.length} ${direction} by year and citation depth`}
      >
        {Array.from({ length: maxDepth + 1 }, (_, d) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lanes are positional
          <g key={d}>
            <line
              x1={0}
              x2={width}
              y1={30 + d * laneH + laneH / 2}
              y2={30 + d * laneH + laneH / 2}
              stroke="var(--border)"
            />
            <text x={6} y={30 + d * laneH - 10} className="fill-muted-foreground font-mono text-[10px]">
              {d === 0
                ? "this paper"
                : `${d} hop${d > 1 ? "s" : ""} ${direction === "ancestors" ? "back" : "forward"}`}
            </text>
          </g>
        ))}
        {ticks.map((t) => (
          <text
            key={t}
            x={x(t)}
            y={height - 6}
            textAnchor="middle"
            className="fill-muted-foreground font-mono text-[10px]"
          >
            {t}
          </text>
        ))}
        {shown.map((n) => {
          const a = pos.get(n.via ?? root.paper_id) ?? pos.get(root.paper_id);
          const b = pos.get(n.paper_id);
          if (!a || !b) return null;
          const midY = (a.y + b.y) / 2;
          const active = hover === null || hover === n.paper_id || hover === n.via;
          return (
            <path
              key={`e-${n.paper_id}`}
              d={`M${a.x},${a.y} C${a.x},${midY} ${b.x},${midY} ${b.x},${b.y}`}
              fill="none"
              stroke="var(--primary)"
              strokeOpacity={active ? 0.35 : 0.06}
            />
          );
        })}
        {[{ paper_id: root.paper_id, title: root.title, cited_by_count: 0 }, ...shown].map((n) => {
          const p = pos.get(n.paper_id);
          if (!p) return null;
          const isRoot = n.paper_id === root.paper_id;
          return (
            <a
              key={n.paper_id}
              href={`/papers/${n.paper_id}`}
              aria-label={n.title}
              onMouseEnter={() => setHover(n.paper_id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(n.paper_id)}
              onBlur={() => setHover(null)}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={isRoot ? 9 : r(n.cited_by_count)}
                fill={isRoot ? "var(--brass)" : "var(--chart-2)"}
                stroke="var(--background)"
                strokeWidth={1.5}
                fillOpacity={hover === null || hover === n.paper_id ? 0.9 : 0.45}
              />
            </a>
          );
        })}
      </svg>
      {hovered ? (
        <div className="pointer-events-none absolute right-3 top-3 max-w-xs rounded-md border bg-popover px-3 py-2 text-xs shadow">
          <p className="font-medium">{hovered.title}</p>
          <p className="mt-0.5 font-mono text-muted-foreground">
            {hovered.year} · {hovered.depth} hop{hovered.depth > 1 ? "s" : ""} · {hovered.cited_by_count}{" "}
            citations
          </p>
        </div>
      ) : null}
      <details className="border-t px-4 py-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          Show as a list ({shown.length} papers)
        </summary>
        <ol className="mt-2 space-y-1">
          {shown.map((n) => (
            <li key={n.paper_id}>
              <span className="font-mono text-xs text-muted-foreground">
                {n.year} · {n.depth}h ·{" "}
              </span>
              <Link href={`/papers/${n.paper_id}`} className="hover:underline">
                {n.title}
              </Link>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
