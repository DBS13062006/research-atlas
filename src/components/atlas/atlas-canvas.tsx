"use client";

import { contourDensity } from "d3";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { categoryColor } from "@/lib/format";
import type { AtlasPoint } from "@/server/services/graph-views";

// The Atlas: every paper as a point placed by meaning (UMAP of its embedding), coloured by research
// front (Leiden community), over density contours. Pan by dragging, zoom with the wheel or +/-,
// arrows to move, Enter to open the focused paper. Rendered on a 2-D canvas: 6,000 points is light.

type Props = {
  points: AtlasPoint[];
  height?: number;
  interactive?: boolean;
  highlight?: string;
  maxYear?: number | null;
  selected?: Set<number>;
  onSelect?: (ids: number[]) => void;
  ariaLabel?: string;
};

type View = { scale: number; tx: number; ty: number };

export function AtlasCanvas({
  points,
  height = 640,
  interactive = true,
  highlight = "",
  maxYear = null,
  selected,
  onSelect,
  ariaLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const [hover, setHover] = useState<AtlasPoint | null>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [lasso, setLasso] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; lasso: boolean } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Data space is [-1, 1] on the longer axis; map it to the canvas with padding.
  const base = useMemo(() => {
    const pad = 24;
    const s = (Math.min(width, height) - pad * 2) / 2;
    return { s, cx: width / 2, cy: height / 2 };
  }, [width, height]);

  const toScreen = useCallback(
    (p: { x: number; y: number }) => ({
      x: base.cx + (p.x * base.s * view.scale + view.tx),
      y: base.cy + (p.y * base.s * view.scale + view.ty),
    }),
    [base, view],
  );

  const contours = useMemo(() => {
    if (points.length < 50) return [];
    const size = 220;
    return contourDensity<AtlasPoint>()
      .x((p) => (p.x + 1) * (size / 2))
      .y((p) => (p.y + 1) * (size / 2))
      .size([size, size])
      .bandwidth(5)
      .thresholds(9)(points)
      .map((c) => ({
        value: c.value,
        polygons: c.coordinates.map((poly) =>
          poly.map((ring) => ring.map(([x, y]) => ({ x: x / (size / 2) - 1, y: y / (size / 2) - 1 }))),
        ),
      }));
  }, [points]);

  const needle = highlight.trim().toLowerCase();
  const matches = useMemo(
    () =>
      needle.length >= 2
        ? new Set(points.filter((p) => p.t.toLowerCase().includes(needle)).map((p) => p.id))
        : null,
    [points, needle],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const styles = getComputedStyle(canvas);
    const contourColor = styles.getPropertyValue("--contour").trim() || "rgba(120,140,170,0.08)";
    const fg = styles.getPropertyValue("--foreground").trim() || "#ddd";

    // density contours
    ctx.lineWidth = 1;
    for (const band of contours) {
      ctx.strokeStyle = contourColor;
      ctx.fillStyle = contourColor;
      for (const poly of band.polygons) {
        ctx.beginPath();
        for (const ring of poly) {
          ring.forEach((pt, i) => {
            const s = toScreen(pt);
            if (i === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
          });
          ctx.closePath();
        }
        ctx.fill("evenodd");
        ctx.stroke();
      }
    }

    // points: dimmed when filtered out, red ring when retracted
    const radius = Math.max(1.6, Math.min(4, 1.6 * Math.sqrt(view.scale)));
    for (const p of points) {
      const visibleYear = maxYear === null || (p.y_ ?? 0) <= maxYear;
      const isMatch = matches ? matches.has(p.id) : true;
      const isSel = selected?.has(p.id);
      const s = toScreen(p);
      if (s.x < -10 || s.y < -10 || s.x > width + 10 || s.y > height + 10) continue;
      ctx.globalAlpha = !visibleYear ? 0.05 : matches && !isMatch ? 0.12 : 0.85;
      ctx.fillStyle = categoryColor(p.c);
      const r = radius + Math.min(3, Math.log1p(p.w) * 0.45) + (matches && isMatch ? 1.5 : 0);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (p.r) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#e5484d";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (isSel) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = fg;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    const focus = focusIdx !== null ? points[focusIdx] : hover;
    if (focus) {
      const s = toScreen(focus);
      ctx.strokeStyle = fg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (lasso) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = fg;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.min(lasso.x0, lasso.x1),
        Math.min(lasso.y0, lasso.y1),
        Math.abs(lasso.x1 - lasso.x0),
        Math.abs(lasso.y1 - lasso.y0),
      );
      ctx.setLineDash([]);
    }
  }, [points, contours, width, height, view, toScreen, matches, maxYear, hover, focusIdx, lasso, selected]);

  const nearest = useCallback(
    (mx: number, my: number) => {
      let best: AtlasPoint | null = null;
      let bestD = 64;
      for (const p of points) {
        if (maxYear !== null && (p.y_ ?? 0) > maxYear) continue;
        const s = toScreen(p);
        const d = (s.x - mx) ** 2 + (s.y - my) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      return best;
    },
    [points, toScreen, maxYear],
  );

  function localXY(e: React.PointerEvent | React.WheelEvent) {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }

  function onWheel(e: React.WheelEvent) {
    if (!interactive) return;
    e.preventDefault();
    const { x, y } = localXY(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    setView((v) => {
      const scale = Math.min(40, Math.max(0.7, v.scale * factor));
      const k = scale / v.scale;
      return {
        scale,
        tx: (v.tx - (x - base.cx)) * k + (x - base.cx),
        ty: (v.ty - (y - base.cy)) * k + (y - base.cy),
      };
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!interactive) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const { x, y } = localXY(e);
    drag.current = { x, y, tx: view.tx, ty: view.ty, lasso: e.shiftKey && Boolean(onSelect) };
    if (drag.current.lasso) setLasso({ x0: x, y0: y, x1: x, y1: y });
  }

  function onPointerMove(e: React.PointerEvent) {
    const { x, y } = localXY(e);
    if (drag.current) {
      if (drag.current.lasso) setLasso((l) => (l ? { ...l, x1: x, y1: y } : l));
      else {
        const d = drag.current;
        setView((v) => ({ ...v, tx: d.tx + (x - d.x), ty: d.ty + (y - d.y) }));
      }
      return;
    }
    setHover(nearest(x, y));
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    const { x, y } = localXY(e);
    if (d?.lasso && lasso && onSelect) {
      const [x0, x1] = [Math.min(lasso.x0, lasso.x1), Math.max(lasso.x0, lasso.x1)];
      const [y0, y1] = [Math.min(lasso.y0, lasso.y1), Math.max(lasso.y0, lasso.y1)];
      onSelect(
        points
          .filter((p) => {
            const s = toScreen(p);
            return (
              s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1 && (maxYear === null || (p.y_ ?? 0) <= maxYear)
            );
          })
          .map((p) => p.id),
      );
      setLasso(null);
      return;
    }
    if (d && Math.abs(x - d.x) + Math.abs(y - d.y) < 4) {
      const p = nearest(x, y);
      if (p) router.push(`/papers/${p.id}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!interactive) return;
    const step = 40;
    const zoom = (f: number) =>
      setView((v) => ({ scale: Math.min(40, Math.max(0.7, v.scale * f)), tx: v.tx * f, ty: v.ty * f }));
    switch (e.key) {
      case "+":
      case "=":
        zoom(1.25);
        break;
      case "-":
        zoom(0.8);
        break;
      case "ArrowLeft":
        setView((v) => ({ ...v, tx: v.tx + step }));
        break;
      case "ArrowRight":
        setView((v) => ({ ...v, tx: v.tx - step }));
        break;
      case "ArrowUp":
        setView((v) => ({ ...v, ty: v.ty + step }));
        break;
      case "ArrowDown":
        setView((v) => ({ ...v, ty: v.ty - step }));
        break;
      case "n":
      case "]": {
        // step through papers by influence so keyboard users can reach individual points
        const order = [...points.keys()].sort((a, b) => points[b].w - points[a].w);
        const pos = focusIdx === null ? 0 : (order.indexOf(focusIdx) + 1) % order.length;
        setFocusIdx(order[pos]);
        break;
      }
      case "Enter":
        if (focusIdx !== null) router.push(`/papers/${points[focusIdx].id}`);
        break;
      case "0":
        setView({ scale: 1, tx: 0, ty: 0 });
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  const shown = focusIdx !== null ? points[focusIdx] : hover;
  const shownPos = shown ? toScreen(shown) : null;

  return (
    <div
      ref={wrapRef}
      className="relative w-full select-none overflow-hidden rounded-xl border bg-card"
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width,
          height,
          cursor: interactive ? (drag.current ? "grabbing" : "grab") : "default",
          touchAction: "none",
        }}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas is keyboard-operable (see onKeyDown)
        tabIndex={interactive ? 0 : -1}
        role="img"
        aria-label={
          ariaLabel ?? `Map of ${points.length} papers placed by meaning and coloured by research front`
        }
        className="block focus-visible:outline-2 focus-visible:outline-ring"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
      />
      {shown && shownPos ? (
        <div
          className="pointer-events-none absolute z-10 max-w-xs rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
          style={{
            left: Math.min(shownPos.x + 12, width - 260),
            top: Math.min(shownPos.y + 12, height - 70),
          }}
        >
          <p className="font-medium text-popover-foreground">{shown.t}</p>
          <p className="mt-0.5 font-mono text-muted-foreground">
            {shown.y_ ?? "—"} · front {shown.c} · {shown.w} local citations{shown.r ? " · retracted" : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
