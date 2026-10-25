import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Streamgraph } from "@/components/charts/streamgraph";
import { PageHeader } from "@/components/page-header";
import { BlockSkeleton, EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { categoryColor } from "@/lib/format";
import { cachedFronts } from "@/server/cached";

export const metadata: Metadata = { title: "Research fronts" };

async function Fronts() {
  await connection();
  const fronts = await cachedFronts();
  if (fronts.length === 0)
    return <EmptyState title="No research fronts yet">Run pnpm graph:analytics.</EmptyState>;
  return (
    <div className="space-y-10">
      <div className="rounded-xl border bg-card p-4">
        <Streamgraph series={fronts.map((f) => ({ key: f.community, label: f.label, byYear: f.by_year }))} />
      </div>
      <ol className="grid gap-4 md:grid-cols-2">
        {fronts.map((f, i) => (
          <li key={f.community} className="rounded-xl border p-5">
            <div className="flex items-start gap-3">
              <span
                className="mt-1.5 size-3 shrink-0 rounded-full"
                style={{ background: categoryColor(f.community) }}
                aria-hidden
              />
              <div className="flex-1">
                <p className="font-mono text-xs text-muted-foreground">
                  #{i + 1} by growth · front {f.community}
                </p>
                <h2 className="mt-1 text-xl">{f.label}</h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {f.papers} papers · {f.recent_share}% from 2023 on · growth index {f.growth}
                </p>
              </div>
              {f.emerging ? <Badge>Emerging</Badge> : null}
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {f.anchors.map((a) => (
                <li key={a.paper_id}>
                  <Link href={`/papers/${a.paper_id}`} className="hover:underline">
                    {a.title}
                  </Link>{" "}
                  <span className="font-mono text-xs text-muted-foreground">{a.year}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function FrontsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Explore · Research fronts"
        title="Where the field is moving"
        description="Communities found by the Leiden algorithm on the citation graph (Neo4j Graph Data Science), ranked by how much of their work is recent. Anchor papers are each front's highest ArticleRank."
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <Suspense fallback={<BlockSkeleton className="h-96" />}>
          <Fronts />
        </Suspense>
      </div>
    </>
  );
}
