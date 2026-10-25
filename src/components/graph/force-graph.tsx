"use client";

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
  select,
  zoom,
  zoomIdentity,
} from "d3";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

// A small force-directed graph in SVG: every node is a focusable link, so the graph works by
// keyboard and screen reader too. Layout is computed once (fixed seed via deterministic start).

export type FGNode = {
  id: string;
  label: string;
  color: string;
  size?: number;
  href?: string;
  ring?: string;
  title?: string;
};
export type FGEdge = {
  source: string;
  target: string;
  color?: string;
  dashed?: boolean;
  label?: string;
  directed?: boolean;
};

type SimNode = FGNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & FGEdge;

export function ForceGraph({
  nodes,
  edges,
  height = 460,
  ariaLabel,
}: {
  nodes: FGNode[];
  edges: FGEdge[];
  height?: number;
  ariaLabel: string;
}) {
  const wrap = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<string | null>(null);
  const router = useRouter();
  const captionId = useId();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const simNodes: SimNode[] = nodes.map((n, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
      return { ...n, x: Math.cos(angle) * 120, y: Math.sin(angle) * 120 };
    });
    const ids = new Set(simNodes.map((n) => n.id));
    const simLinks: SimLink[] = edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ ...e }));
    const sim = forceSimulation(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(70)
          .strength(0.6),
      )
      .force("charge", forceManyBody().strength(-220))
      .force("center", forceCenter(0, 0))
      .force(
        "collide",
        forceCollide<SimNode>().radius((d) => (d.size ?? 6) + 6),
      )
      .stop();
    for (let i = 0; i < 300; i++) sim.tick();
    return { simNodes, simLinks };
  }, [nodes, edges]);

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = select(svgRef.current);
    const g = select(gRef.current);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event) => g.attr("transform", event.transform.toString()));
    svg.call(z);
    // Fit the layout into view, labels included: a label runs to the right of its node, about
    // 6 px per character at 11 px, so it widens the box on that side only.
    const left = layout.simNodes.map((n) => (n.x ?? 0) - (n.size ?? 6));
    const right = layout.simNodes.map((n) => {
      const r = n.size ?? 6;
      const labelled = r >= 9;
      return (n.x ?? 0) + r + (labelled ? 4 + Math.min(n.label.length, 48) * 6 : 0);
    });
    const ys = layout.simNodes.map((n) => n.y ?? 0);
    const x0 = Math.min(...left);
    const x1 = Math.max(...right);
    const w = x1 - x0 + 40;
    const h = Math.max(...ys) - Math.min(...ys) + 80;
    const k = Math.min(1.2, Math.min(width / w, height / h));
    const cx = (x0 + x1) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    svg.call(z.transform, zoomIdentity.translate(width / 2 - cx * k, height / 2 - cy * k).scale(k));
    return () => {
      svg.on(".zoom", null);
    };
  }, [layout, width, height]);

  const neighbours = useMemo(() => {
    if (!hover) return null;
    const s = new Set([hover]);
    for (const l of layout.simLinks) {
      const a = (l.source as SimNode).id;
      const b = (l.target as SimNode).id;
      if (a === hover) s.add(b);
      if (b === hover) s.add(a);
    }
    return s;
  }, [hover, layout]);

  return (
    <figure ref={wrap} className="m-0 w-full overflow-hidden rounded-xl border bg-card">
      <figcaption id={captionId} className="sr-only">
        {ariaLabel}
      </figcaption>
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: labelled with aria-labelledby; must keep its interactive children */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        aria-labelledby={captionId}
        className="block cursor-grab active:cursor-grabbing"
      >
        <defs>
          <marker
            id="fg-arrow"
            viewBox="0 -4 8 8"
            refX="14"
            refY="0"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0,-4L8,0L0,4" fill="currentColor" className="text-muted-foreground" />
          </marker>
        </defs>
        <g ref={gRef}>
          {layout.simLinks.map((l, i) => {
            const s = l.source as SimNode;
            const t = l.target as SimNode;
            const dim = neighbours && !(neighbours.has(s.id) && neighbours.has(t.id));
            return (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: edges may repeat between the same pair with different types
                key={i}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke={l.color ?? "var(--muted-foreground)"}
                strokeOpacity={dim ? 0.08 : 0.45}
                strokeWidth={l.color ? 2 : 1}
                strokeDasharray={l.dashed ? "4 3" : undefined}
                markerEnd={l.directed ? "url(#fg-arrow)" : undefined}
              >
                {l.label ? <title>{l.label}</title> : null}
              </line>
            );
          })}
          {layout.simNodes.map((n) => {
            const dim = neighbours && !neighbours.has(n.id);
            const r = n.size ?? 6;
            const at = `translate(${n.x},${n.y})`;
            const circle = (
              <circle
                r={r}
                fill={n.color}
                fillOpacity={dim ? 0.25 : 0.95}
                stroke={n.ring ?? "var(--background)"}
                strokeWidth={n.ring ? 2.5 : 1.5}
              />
            );
            // The visible label sits outside the link and is hidden from assistive technology: the
            // link's accessible name is the full title, which a truncated label could not match.
            const label =
              r >= 9 || hover === n.id ? (
                <text
                  x={r + 4}
                  y={4}
                  aria-hidden
                  className="pointer-events-none fill-foreground text-[11px]"
                  opacity={dim ? 0.3 : 1}
                >
                  {n.label.length > 48 ? `${n.label.slice(0, 47)}…` : n.label}
                </text>
              ) : null;
            return (
              <g key={n.id} transform={at}>
                {n.href ? (
                  <a
                    href={n.href}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(n.id)}
                    onBlur={() => setHover(null)}
                    onClick={(e) => {
                      e.preventDefault();
                      if (n.href) router.push(n.href);
                    }}
                    className="focus:outline-none [&:focus-visible_circle]:stroke-[var(--ring)] [&:focus-visible_circle]:stroke-[3px]"
                    aria-label={n.title ?? n.label}
                  >
                    {circle}
                    <title>{n.title ?? n.label}</title>
                  </a>
                ) : (
                  <>
                    {circle}
                    <title>{n.title ?? n.label}</title>
                  </>
                )}
                {label}
              </g>
            );
          })}
        </g>
      </svg>
    </figure>
  );
}
