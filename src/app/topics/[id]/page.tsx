import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { YearChart } from "@/components/charts/bar-line";
import { PageHeader, Section } from "@/components/page-header";
import { PaperCard } from "@/components/paper/paper-card";
import { EmptyState, ListSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import { cachedTopic } from "@/server/cached";
import type { PaperCard as Card } from "@/server/services/papers";

type Topic = {
  topic_id: number;
  topic_name: string;
  topic_level: number;
  description: string | null;
  path: string;
  parent_topic_id: number | null;
  children: { topic_id: number; topic_name: string; papers: number }[];
  growth: { year: number; papers: number; yoy_pct: number | null }[];
  top_papers: Card[];
  methods: { method_id: number; method_name: string; papers: number }[];
  datasets: { dataset_id: number; dataset_name: string; papers: number }[];
};

const LEVEL = ["Domain", "Field", "Subfield", "Topic"];

export async function generateMetadata({ params }: PageProps<"/topics/[id]">): Promise<Metadata> {
  const t = (await cachedTopic(Number((await params).id)).catch(() => null)) as Topic | null;
  return { title: t?.topic_name ?? "Topic" };
}

async function TopicView({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const t = (await cachedTopic(id)) as Topic | null;
  if (!t) notFound();
  const withAvg = t.growth.map((g, i, arr) => {
    const window = arr.slice(Math.max(0, i - 2), i + 1);
    return {
      ...g,
      moving_avg: Math.round((window.reduce((s, x) => s + x.papers, 0) / window.length) * 10) / 10,
    };
  });
  return (
    <>
      <PageHeader
        eyebrow={`${LEVEL[t.topic_level]} · ${t.path}`}
        title={t.topic_name}
        description={t.description ?? undefined}
      />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-10">
          <Section
            title="Growth"
            description="Papers per year across this topic's whole subtree (fn_topic_growth), with a three-year moving average."
          >
            {t.growth.some((g) => g.papers > 0) ? (
              <YearChart
                data={withAvg}
                barKey="papers"
                barLabel="Papers"
                lineKey="moving_avg"
                lineLabel="3-year average"
              />
            ) : (
              <EmptyState title="No dated papers under this topic" />
            )}
          </Section>
          <Section title="Most cited papers">
            <div className="space-y-3">
              {t.top_papers.length === 0 ? (
                <EmptyState title="No papers under this topic yet" />
              ) : (
                t.top_papers.map((p) => <PaperCard key={p.paper_id} paper={p} />)
              )}
            </div>
          </Section>
        </div>
        <aside className="space-y-8">
          {t.children.length ? (
            <div>
              <h2 className="text-xl">{LEVEL[t.topic_level + 1] ?? "Children"}s</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {t.children
                  .filter((c) => c.papers > 0)
                  .slice(0, 30)
                  .map((c) => (
                    <li key={c.topic_id} className="flex justify-between gap-2">
                      <Link href={`/topics/${c.topic_id}`} className="hover:underline">
                        {c.topic_name}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatNumber(c.papers)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          {t.methods.length ? (
            <div>
              <h2 className="text-xl">Methods used here</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.methods.map((m) => (
                  <Badge key={m.method_id} variant="secondary">
                    {m.method_name} · {m.papers}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          {t.datasets.length ? (
            <div>
              <h2 className="text-xl">Datasets</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.datasets.map((d) => (
                  <Badge key={d.dataset_id} variant="outline">
                    {d.dataset_name} · {d.papers}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          {t.parent_topic_id ? (
            <Link href={`/topics/${t.parent_topic_id}`} className="text-sm underline">
              Up one level
            </Link>
          ) : null}
        </aside>
      </div>
    </>
  );
}

export default function TopicPage({ params }: PageProps<"/topics/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-10">
          <ListSkeleton />
        </div>
      }
    >
      <TopicView params={params} />
    </Suspense>
  );
}
