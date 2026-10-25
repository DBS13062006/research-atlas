import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PaperCard } from "@/components/paper/paper-card";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { searchQuery } from "@/lib/schemas";
import { dbContext, getCurrentUser } from "@/server/auth/dal";
import { cachedTopicTree } from "@/server/cached";
import { listPapers } from "@/server/services/papers";
import { search } from "@/server/services/search";
import { SearchForm } from "./search-form";

export const metadata: Metadata = { title: "Search" };

type SP = Record<string, string | string[] | undefined>;
const MODES = [
  {
    mode: "lexical",
    label: "Lexical",
    hint: "PostgreSQL full-text search: tsvector, websearch_to_tsquery, ts_rank_cd",
  },
  { mode: "semantic", label: "Semantic", hint: "EmbeddingGemma vectors in the Neo4j vector index" },
  { mode: "hybrid", label: "Hybrid", hint: "Reciprocal Rank Fusion of both lists: Σ 1 / (60 + rank)" },
] as const;

async function Results({ searchParams }: { searchParams: Promise<SP> }) {
  await connection();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const user = await getCurrentUser();
  const ctx = dbContext(user);
  const q = one("q")?.trim();
  const mode = (one("mode") ?? "hybrid") as "lexical" | "semantic" | "hybrid";

  const tabs = (
    <nav className="flex flex-wrap gap-2" aria-label="Search mode">
      {MODES.map((m) => {
        const next = new URLSearchParams(
          Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
        );
        next.set("mode", m.mode);
        return (
          <Link
            key={m.mode}
            href={`/search?${next.toString()}`}
            aria-current={mode === m.mode ? "page" : undefined}
            className={`rounded-lg border px-3 py-1.5 text-sm ${mode === m.mode ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted"}`}
            title={m.hint}
          >
            {m.label}
          </Link>
        );
      })}
    </nav>
  );

  // Without a query, browse the catalog with the facets (keyset-paginated list).
  if (!q) {
    const yearFrom = Number(one("year_from")) || undefined;
    const topicId = Number(one("topic_id")) || undefined;
    const list = await listPapers(ctx, {
      limit: 20,
      year_from: yearFrom,
      topic_id: topicId,
      open_access: one("open_access") === "true" ? "true" : undefined,
      cursor: one("cursor"),
    });
    const next = new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
    );
    if (list.next_cursor) next.set("cursor", list.next_cursor);
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Most-cited papers matching the filters. Type a query to rank by relevance.
        </p>
        {list.items.length === 0 ? (
          <EmptyState title="No papers match these filters" />
        ) : (
          list.items.map((p) => <PaperCard key={p.paper_id} paper={p} />)
        )}
        {list.next_cursor ? (
          <Link
            href={`/search?${next.toString()}`}
            className="inline-block text-sm underline underline-offset-4"
          >
            Next page
          </Link>
        ) : null}
      </div>
    );
  }

  const parsed = searchQuery.safeParse({
    q,
    mode,
    limit: 25,
    year_from: one("year_from") || undefined,
    topic_id: one("topic_id") || undefined,
    open_access: one("open_access") || undefined,
  });
  if (!parsed.success)
    return <ErrorState title="That search could not be run">{parsed.error.issues[0]?.message}</ErrorState>;
  try {
    const result = await search(ctx, parsed.data);
    const hits = result.hits;
    return (
      <div className="space-y-4">
        {tabs}
        <p className="font-mono text-xs text-muted-foreground">
          {hits.length} results · {result.took_ms} ms · {MODES.find((m) => m.mode === mode)?.hint}
        </p>
        {hits.length === 0 ? (
          <EmptyState title={`Nothing found for "${q}"`}>
            Try the semantic tab: it finds papers that mean the same thing in other words.
          </EmptyState>
        ) : (
          hits.map((h) => (
            <PaperCard
              key={h.paper_id}
              paper={h}
              snippet={h.headline && h.headline !== h.title ? h.headline : null}
              extra={
                mode === "hybrid" ? (
                  <span className="flex gap-1">
                    <Badge variant="outline" className="font-mono">
                      lexical #{h.lexical_rank ?? "–"}
                    </Badge>
                    <Badge variant="outline" className="font-mono">
                      semantic #{h.semantic_rank ?? "–"}
                    </Badge>
                  </span>
                ) : (
                  <Badge variant="outline" className="font-mono">
                    score {h.score.toFixed(3)}
                  </Badge>
                )
              }
            />
          ))
        )}
      </div>
    );
  } catch (err) {
    return (
      <div className="space-y-4">
        {tabs}
        <ErrorState title="That search mode is unavailable right now">
          {err instanceof Error ? err.message : "The search service did not respond."} Lexical search still
          works.
        </ErrorState>
      </div>
    );
  }
}

async function Filters() {
  await connection();
  const tree = await cachedTopicTree().catch(() => []);
  return <SearchForm topics={tree.filter((t) => t.topic_level === 1 && t.papers > 0)} />;
}

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <>
      <PageHeader
        eyebrow="Search"
        title="Find papers three ways"
        description="Compare keyword matching in PostgreSQL with meaning-based search in Neo4j, and the fused ranking of both."
      />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 *:max-w-5xl">
        <Suspense fallback={<div className="h-16" />}>
          <Filters />
        </Suspense>
        <Suspense fallback={<ListSkeleton />}>
          <Results searchParams={searchParams as Promise<SP>} />
        </Suspense>
      </div>
    </>
  );
}
