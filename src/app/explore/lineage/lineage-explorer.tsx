"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BlockSkeleton, EmptyState, ErrorState } from "@/components/common/states";
import type { TimelineNode } from "@/components/graph/lineage-timeline";
import { PaperPicker, type PickedPaper } from "@/components/paper/paper-picker";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/api-client";

const LineageTimeline = dynamic(
  () => import("@/components/graph/lineage-timeline").then((m) => m.LineageTimeline),
  {
    ssr: false,
    loading: () => <BlockSkeleton className="h-80" />,
  },
);

type Result = { took_ms: number; nodes: TimelineNode[] };

export function LineageExplorer({ initial }: { initial: PickedPaper | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [paper, setPaper] = useState<PickedPaper | null>(initial);
  const [direction, setDirection] = useState<"ancestors" | "descendants">(
    (params.get("direction") as "ancestors") ?? "ancestors",
  );
  const [results, setResults] = useState<{ sql?: Result; graph?: Result; error?: string; loading: boolean }>({
    loading: false,
  });

  useEffect(() => {
    if (!paper) return;
    let cancelled = false;
    setResults({ loading: true });
    const base = `/papers/${paper.paper_id}/lineage?direction=${direction}&depth=3`;
    // Run both engines on the same question so their timings can be compared.
    Promise.all([api<Result>(`${base}&engine=sql`), api<Result>(`${base}&engine=graph`)])
      .then(([sql, graph]) => !cancelled && setResults({ sql, graph, loading: false }))
      .catch(
        (err) =>
          !cancelled && setResults({ error: err instanceof Error ? err.message : "Failed", loading: false }),
      );
    return () => {
      cancelled = true;
    };
  }, [paper, direction]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <PaperPicker
          label="Paper"
          value={paper}
          onChange={(p) => {
            setPaper(p);
            if (p) router.replace(`/explore/lineage?paper=${p.paper_id}`, { scroll: false });
          }}
        />
        <ToggleGroup
          value={[direction]}
          onValueChange={(v) => v[0] && setDirection(v[0] as typeof direction)}
          aria-label="Direction"
        >
          <ToggleGroupItem value="ancestors">Where it came from</ToggleGroupItem>
          <ToggleGroupItem value="descendants">Where it went</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {!paper ? (
        <EmptyState title="Choose a paper to trace">
          Its ancestors (what it cites, and what those cite) or descendants, three hops deep.
        </EmptyState>
      ) : results.loading ? (
        <BlockSkeleton className="h-80" />
      ) : results.error ? (
        <ErrorState>{results.error}</ErrorState>
      ) : results.sql ? (
        <>
          <div className="flex flex-wrap gap-2" data-testid="engine-timings">
            <Badge variant="outline" className="font-mono">
              PostgreSQL recursive CTE · {results.sql.nodes.length} papers · {results.sql.took_ms} ms
            </Badge>
            {results.graph ? (
              <Badge variant="outline" className="font-mono">
                Neo4j variable-length path · {results.graph.nodes.length} papers · {results.graph.took_ms} ms
              </Badge>
            ) : null}
          </div>
          {results.sql.nodes.length === 0 ? (
            <EmptyState title="No lineage in this direction" />
          ) : (
            <LineageTimeline
              root={{ paper_id: paper.paper_id, title: paper.title, year: paper.publication_year ?? null }}
              nodes={results.sql.nodes}
              direction={direction}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
