"use client";

import type { PlanNode } from "@/server/services/lab";

// An EXPLAIN ANALYZE (PostgreSQL) or PROFILE (Neo4j) plan as a collapsible tree. The bar under each
// operator shows its share of the work: exclusive time for PostgreSQL, db hits for Neo4j.

function formatMs(ms: number | null) {
  if (ms === null) return null;
  return ms < 1 ? `${ms.toFixed(3)} ms` : `${ms.toFixed(1)} ms`;
}

function misestimate(node: PlanNode) {
  if (node.rows === null || node.estimate === null || node.estimate === 0 || node.rows === 0) return null;
  const ratio = node.rows / node.estimate;
  if (ratio >= 10) return `${Math.round(ratio)}× more rows than estimated`;
  if (ratio <= 0.1) return `${Math.round(1 / ratio)}× fewer rows than estimated`;
  return null;
}

function Node({ node, depth }: { node: PlanNode; depth: number }) {
  const off = misestimate(node);
  const body = (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="font-medium">{node.label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {[
            node.rows !== null ? `${node.rows.toLocaleString("en-IN")} rows` : null,
            node.estimate !== null ? `est. ${node.estimate.toLocaleString("en-IN")}` : null,
            formatMs(node.selfMs) ? `self ${formatMs(node.selfMs)}` : null,
            node.hits,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {off ? <span className="text-xs text-amber-600 dark:text-amber-400">{off}</span> : null}
      </div>
      <div className="mt-1 h-1 w-full max-w-64 rounded-full bg-muted" aria-hidden>
        <div className="h-1 rounded-full bg-primary" style={{ width: `${Math.max(2, node.share * 100)}%` }} />
      </div>
      {node.detail.length ? (
        <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-muted-foreground">
          {node.detail.map((d) => (
            <li key={d} className="break-all">
              {d}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
  if (node.children.length === 0) return <li className="border-l py-1.5 pl-3">{body}</li>;
  return (
    <li className="border-l py-1.5 pl-3">
      <details open={depth < 4}>
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{body}</summary>
        <ul className="mt-1 ml-1">
          {node.children.map((c, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: plan children have no identity besides position
            <Node key={i} node={c} depth={depth + 1} />
          ))}
        </ul>
      </details>
    </li>
  );
}

export function PlanTree({
  plan,
  timing,
  raw,
}: {
  plan: PlanNode;
  timing: { planningMs: number | null; executionMs: number | null } | null;
  raw: unknown;
}) {
  return (
    <div className="space-y-3">
      {timing ? (
        <p className="font-mono text-xs text-muted-foreground">
          planning {formatMs(timing.planningMs)} · execution {formatMs(timing.executionMs)}
        </p>
      ) : null}
      <ul className="text-sm" aria-label="Query plan">
        <Node node={plan} depth={0} />
      </ul>
      <details className="rounded-lg border">
        <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground">Raw plan JSON</summary>
        <pre className="max-h-80 overflow-auto px-3 pb-3 font-mono text-[11px]">
          {JSON.stringify(raw, null, 2)}
        </pre>
      </details>
    </div>
  );
}
