"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/components/paper/api";
import { PaperPicker, type PickedPaper } from "@/components/paper/paper-picker";
import { BlockSkeleton, EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";

type PathResult = {
  graph: { hops: number; ids: number[]; titles: string[]; years: (number | null)[] } | null;
  graph_ms: number;
  sql: { hops: number; ids: number[] } | null;
  sql_ms: number;
};

export function ConnectExplorer({ initialFrom }: { initialFrom: PickedPaper | null }) {
  const [from, setFrom] = useState<PickedPaper | null>(initialFrom);
  const [to, setTo] = useState<PickedPaper | null>(null);
  const [state, setState] = useState<{ data?: PathResult; error?: string; loading: boolean }>({
    loading: false,
  });

  useEffect(() => {
    if (!from || !to) return;
    setState({ loading: true });
    api<PathResult>(`/graph/path?from=${from.paper_id}&to=${to.paper_id}`)
      .then((data) => setState({ data, loading: false }))
      .catch((err) => setState({ error: err instanceof Error ? err.message : "Failed", loading: false }));
  }, [from, to]);

  const g = state.data?.graph;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <PaperPicker label="From" value={from} onChange={setFrom} />
        <PaperPicker label="To" value={to} onChange={setTo} />
      </div>
      {!from || !to ? (
        <EmptyState title="Pick two papers">
          The shortest chain of citations linking them, followed in either direction.
        </EmptyState>
      ) : state.loading ? (
        <BlockSkeleton className="h-64" />
      ) : state.error ? (
        <ErrorState>{state.error}</ErrorState>
      ) : state.data ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-mono">
              Neo4j SHORTEST · {g ? `${g.hops} hops` : "no path"} · {state.data.graph_ms} ms
            </Badge>
            <Badge variant="outline" className="font-mono">
              PostgreSQL breadth-first CTE (≤ 3 hops) ·{" "}
              {state.data.sql ? `${state.data.sql.hops} hops` : "no path within 3"} · {state.data.sql_ms} ms
            </Badge>
          </div>
          {g ? (
            <ol className="relative space-y-4 border-l-2 border-primary/40 pl-6" aria-label="Citation chain">
              {g.ids.map((id, i) => (
                <li key={id} className="relative">
                  <span className="absolute -left-[31px] top-1 flex size-4 items-center justify-center rounded-full border-2 border-primary bg-background text-[9px]">
                    {i}
                  </span>
                  <Link href={`/papers/${id}`} className="font-medium hover:underline">
                    {g.titles[i]}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{g.years[i] ?? ""}</span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="These papers are not connected by citations in the atlas" />
          )}
        </div>
      ) : null}
    </div>
  );
}
