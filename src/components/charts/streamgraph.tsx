"use client";

import { area, curveBasis, scaleLinear, stack, stackOffsetWiggle, stackOrderInsideOut } from "d3";
import { useEffect, useRef, useState } from "react";
import { categoryColor } from "@/lib/format";

// Papers per year for each research front, stacked around a moving centre line (a streamgraph).
export function Streamgraph({
  series,
}: {
  series: { key: number; label: string; byYear: { year: number; papers: number }[] }[];
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const height = 300;
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const years = [...new Set(series.flatMap((s) => s.byYear.map((b) => b.year)))]
    .filter((y) => y >= 2012)
    .sort();
  const rows = years.map((year) =>
    Object.fromEntries([
      ["year", year],
      ...series.map((s) => [String(s.key), s.byYear.find((b) => b.year === year)?.papers ?? 0]),
    ]),
  );
  const stacked = stack<Record<string, number>>()
    .keys(series.map((s) => String(s.key)))
    .offset(stackOffsetWiggle)
    .order(stackOrderInsideOut)(rows);
  const x = scaleLinear()
    .domain([years[0] ?? 2012, years.at(-1) ?? 2026])
    .range([30, width - 10]);
  const ys = stacked.flatMap((l) => l.flatMap((p) => [p[0], p[1]]));
  const y = scaleLinear()
    .domain([Math.min(...ys), Math.max(...ys)])
    .range([height - 24, 8]);
  const shape = area<[number, number] & { data: Record<string, number> }>()
    .x((d) => x(d.data.year))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(curveBasis);
  return (
    <div ref={wrap} className="w-full">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Streamgraph of papers per year in each research front"
      >
        <title>Papers per year in each research front</title>
        {stacked.map((layer) => {
          const s = series.find((x) => String(x.key) === layer.key);
          return (
            <path
              key={layer.key}
              d={shape(layer as never) ?? ""}
              fill={categoryColor(Number(layer.key))}
              fillOpacity={0.8}
              stroke="var(--background)"
              strokeWidth={0.5}
            >
              <title>{s?.label}</title>
            </path>
          );
        })}
        {x.ticks(8).map((t) => (
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
      </svg>
    </div>
  );
}
