"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { categoryColor } from "@/lib/format";
import type { RoleCode } from "@/lib/roles";
import { BlockSkeleton, EmptyState, ErrorState } from "../states";
import { api } from "./api";
import { NotesPanel } from "./notes-panel";
import { RelationsPanel } from "./relations-panel";

const LineageTimeline = dynamic(() => import("../graph/lineage-timeline").then((m) => m.LineageTimeline), {
  ssr: false,
  loading: () => <BlockSkeleton className="h-72" />,
});
const ForceGraph = dynamic(() => import("../graph/force-graph").then((m) => m.ForceGraph), {
  ssr: false,
  loading: () => <BlockSkeleton className="h-[460px]" />,
});

type Viewer = { userId: number; role: RoleCode } | null;
type Root = { paper_id: number; title: string; year: number | null };

function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({
    loading: Boolean(path),
  });
  const load = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      setState({ data: await api<T>(path), loading: false });
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : "Request failed", loading: false });
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

type LineageResult = {
  engine: "sql" | "graph";
  took_ms: number;
  nodes: {
    paper_id: number;
    depth: number;
    title: string;
    year: number | null;
    cited_by_count: number;
    via: number | null;
  }[];
};

function LineagePanel({ root }: { root: Root }) {
  const [direction, setDirection] = useState<"ancestors" | "descendants">("ancestors");
  const [engine, setEngine] = useState<"sql" | "graph">("sql");
  const { data, error, loading } = useApi<LineageResult>(
    `/papers/${root.paper_id}/lineage?direction=${direction}&depth=3&engine=${engine}`,
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          value={[direction]}
          onValueChange={(v) => v[0] && setDirection(v[0] as typeof direction)}
          aria-label="Direction"
        >
          <ToggleGroupItem value="ancestors">Where it came from</ToggleGroupItem>
          <ToggleGroupItem value="descendants">Where it went</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          value={[engine]}
          onValueChange={(v) => v[0] && setEngine(v[0] as typeof engine)}
          aria-label="Engine"
        >
          <ToggleGroupItem value="sql">SQL · recursive CTE</ToggleGroupItem>
          <ToggleGroupItem value="graph">Cypher · variable-length path</ToggleGroupItem>
        </ToggleGroup>
        {data ? (
          <Badge variant="outline" className="font-mono" data-testid="lineage-timing">
            {data.nodes.length} papers · {data.took_ms} ms in {data.engine === "sql" ? "PostgreSQL" : "Neo4j"}
          </Badge>
        ) : null}
      </div>
      {loading ? (
        <BlockSkeleton className="h-72" />
      ) : error ? (
        <ErrorState>{error}</ErrorState>
      ) : data && data.nodes.length === 0 ? (
        <EmptyState
          title={
            direction === "ancestors"
              ? "This paper cites nothing else in the atlas"
              : "Nothing in the atlas cites this paper yet"
          }
        />
      ) : data ? (
        <LineageTimeline root={root} nodes={data.nodes} direction={direction} />
      ) : null}
    </div>
  );
}

type Neighbourhood = {
  nodes: { id: number; label: string; year: number | null; community: number | null; weight: number }[];
  edges: { source: number; target: number; kind: string }[];
};
const RELATION_COLOR: Record<string, string> = {
  EXTENDS: "#56b4e9",
  IMPROVES_UPON: "#009e73",
  CONTRADICTS: "#e69f00",
  REPLICATES: "#cc79a7",
  RELATED_TO: "#b8a07e",
};

function NeighbourhoodPanel({ root }: { root: Root }) {
  const { data, error, loading } = useApi<Neighbourhood>(`/papers/${root.paper_id}/neighbourhood`);
  if (loading) return <BlockSkeleton className="h-[460px]" />;
  if (error) return <ErrorState>{error}</ErrorState>;
  if (!data || data.nodes.length <= 1) return <EmptyState title="No neighbours in the graph yet" />;
  return (
    <div className="space-y-2">
      <ForceGraph
        ariaLabel={`Citation neighbourhood of ${root.title}`}
        nodes={data.nodes.map((n) => ({
          id: String(n.id),
          label: n.label,
          color: n.id === root.paper_id ? "var(--brass)" : categoryColor(n.community ?? -1),
          size: n.id === root.paper_id ? 12 : 5 + Math.min(8, Math.log1p(n.weight)),
          href: `/papers/${n.id}`,
          title: `${n.label}${n.year ? ` (${n.year})` : ""}`,
        }))}
        edges={data.edges.map((e) => ({
          source: String(e.source),
          target: String(e.target),
          directed: true,
          color: RELATION_COLOR[e.kind],
          dashed: e.kind !== "CITES",
          label: e.kind,
        }))}
      />
      <p className="text-xs text-muted-foreground">
        Grey arrows are citations; coloured dashed edges are curated relations. Node colour is the research
        front, size the local citation count. Click a node to open the paper.
      </p>
    </div>
  );
}

function SimilarPanel({ root }: { root: Root }) {
  const { data, error, loading } = useApi<{
    items: { paper_id: number; title: string; year: number | null; score: number }[];
  }>(`/papers/${root.paper_id}/similar`);
  if (loading) return <BlockSkeleton className="h-60" />;
  if (error) return <ErrorState>{error}</ErrorState>;
  if (!data?.items.length)
    return (
      <EmptyState title="No close neighbours by meaning">
        Similarity edges keep only scores of 0.75 and above.
      </EmptyState>
    );
  return (
    <ol className="divide-y rounded-xl border">
      {data.items.map((s) => (
        <li key={s.paper_id} className="flex items-center gap-3 px-4 py-2.5">
          <span className="w-12 font-mono text-xs text-muted-foreground">{s.score.toFixed(3)}</span>
          <Link href={`/papers/${s.paper_id}`} className="flex-1 text-sm hover:underline">
            {s.title}
          </Link>
          <span className="font-mono text-xs text-muted-foreground">{s.year}</span>
        </li>
      ))}
    </ol>
  );
}

export function PaperTabs({ root, viewer }: { root: Root; viewer: Viewer }) {
  return (
    <Tabs defaultValue="lineage" className="w-full">
      <TabsList className="flex-wrap">
        <TabsTrigger value="lineage">Lineage</TabsTrigger>
        <TabsTrigger value="graph">Neighbourhood</TabsTrigger>
        <TabsTrigger value="similar">Similar</TabsTrigger>
        <TabsTrigger value="relations">Curated relations</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
      </TabsList>
      <TabsContent value="lineage" className="pt-4">
        <LineagePanel root={root} />
      </TabsContent>
      <TabsContent value="graph" className="pt-4">
        <NeighbourhoodPanel root={root} />
      </TabsContent>
      <TabsContent value="similar" className="pt-4">
        <SimilarPanel root={root} />
      </TabsContent>
      <TabsContent value="relations" className="pt-4">
        <RelationsPanel root={root} viewer={viewer} />
      </TabsContent>
      <TabsContent value="notes" className="pt-4">
        <NotesPanel paperId={root.paper_id} viewer={viewer} />
      </TabsContent>
    </Tabs>
  );
}
