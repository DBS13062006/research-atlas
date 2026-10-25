import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ListSkeleton } from "@/components/common/states";
import { formatNumber } from "@/lib/format";
import { cachedGems } from "@/server/cached";

export const metadata: Metadata = { title: "Hidden gems" };

async function Gems() {
  await connection();
  const gems = await cachedGems();
  if (gems.length === 0)
    return <EmptyState title="No hidden gems found">Run pnpm graph:analytics.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Papers whose influence percentile far exceeds their citation-count percentile
        </caption>
        <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">
              Paper
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Year
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Citations
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Influence vs citations (percentile)
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {gems.map((g) => (
            <tr key={g.paper_id}>
              <td className="px-4 py-3">
                <Link href={`/papers/${g.paper_id}`} className="hover:underline">
                  {g.title}
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-xs">{g.year}</td>
              <td className="px-4 py-3 text-right font-mono text-xs">{formatNumber(g.cited_by_count)}</td>
              <td className="px-4 py-3">
                <div
                  className="flex items-center gap-2"
                  role="img"
                  aria-label={`influence ${Math.round(g.influence_pct * 100)}th percentile, citations ${Math.round(g.citation_pct * 100)}th`}
                >
                  <div className="relative h-2 w-40 rounded-full bg-muted">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-chart-2/60"
                      style={{ width: `${g.citation_pct * 100}%` }}
                    />
                    <span
                      className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-primary"
                      style={{ left: `calc(${g.influence_pct * 100}% - 6px)` }}
                    />
                  </div>
                  <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {Math.round(g.influence_pct * 100)} vs {Math.round(g.citation_pct * 100)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GemsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Explore · Hidden gems"
        title="Influence the raw count misses"
        description="ArticleRank (Graph Data Science) weighs who cites a paper, not only how often. These papers are in the top 15% by influence but below the 60th percentile by citation count. The dot is influence; the bar is citation count."
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <Suspense fallback={<ListSkeleton />}>
          <Gems />
        </Suspense>
      </div>
    </>
  );
}
