import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { YearChart } from "@/components/charts/bar-line";
import { CoauthorGraph } from "@/components/graph/coauthor-graph";
import { PageHeader, Section } from "@/components/page-header";
import { PaperCard } from "@/components/paper/paper-card";
import { BlockSkeleton, EmptyState, ListSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import { cachedAuthor, cachedCoauthors } from "@/server/cached";
import type { PaperCard as Card } from "@/server/services/papers";

type Author = {
  author_id: number;
  author_name: string;
  orcid: string | null;
  institution_name: string | null;
  country_code: string | null;
  papers: number | null;
  citations: number | null;
  h_index: number | null;
  first_year: number | null;
  last_year: number | null;
  papers_list?: never;
};

export async function generateMetadata({ params }: PageProps<"/authors/[id]">): Promise<Metadata> {
  const a = (await cachedAuthor(Number((await params).id)).catch(() => null)) as Author | null;
  if (!a) return { title: "Author" };
  const facts = [
    a.institution_name,
    a.papers ? `${a.papers} papers in the atlas` : null,
    a.h_index ? `h-index ${a.h_index}` : null,
  ].filter(Boolean);
  return { title: a.author_name, description: `${a.author_name}: ${facts.join(", ")}.` };
}

async function Coauthors({ id, name }: { id: number; name: string }) {
  const list = await cachedCoauthors(id).catch(() => []);
  if (list.length === 0) return <EmptyState title="No co-authors in the atlas" />;
  return <CoauthorGraph center={{ id, name }} coauthors={list} />;
}

async function AuthorView({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const data = await cachedAuthor(id);
  if (!data) notFound();
  const a = data as unknown as Author & {
    papers: number;
    per_year: { year: number; papers: number; citations: number }[];
    topics: { topic_id: number; topic_name: string; papers: number }[];
  };
  const papers = (data as unknown as { papers: Card[] }).papers;
  const stats = [
    { label: "papers in atlas", value: (data as unknown as { papers: Card[] }).papers.length },
    { label: "h-index", value: a.h_index },
    { label: "citations", value: a.citations },
    { label: "active", value: a.first_year ? `${a.first_year}–${a.last_year}` : "—" },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Author"
        title={a.author_name}
        description={
          <>
            {a.institution_name ?? "No current affiliation recorded"}
            {a.country_code ? ` · ${a.country_code}` : ""}
            {a.orcid ? (
              <a
                className="ml-2 font-mono text-sm underline"
                href={`https://orcid.org/${a.orcid}`}
                target="_blank"
                rel="noreferrer"
              >
                ORCID {a.orcid}
              </a>
            ) : null}
          </>
        }
      />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border p-4">
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                <dd className="font-mono text-2xl">
                  {typeof s.value === "number" ? formatNumber(s.value) : s.value}
                </dd>
              </div>
            ))}
          </dl>
          <Section
            title="Output over time"
            description="Papers in the atlas per year, with their total citations."
          >
            <YearChart
              data={a.per_year}
              barKey="papers"
              barLabel="Papers"
              lineKey="citations"
              lineLabel="Citations"
            />
          </Section>
          <Section
            title="Co-author network"
            description="Weighted by shared papers (COAUTHOR edges computed in Neo4j)."
          >
            <Suspense fallback={<BlockSkeleton className="h-[420px]" />}>
              <Coauthors id={a.author_id} name={a.author_name} />
            </Suspense>
          </Section>
          <Section title="Papers" description="Most cited first.">
            <div className="space-y-3">
              {papers.map((p) => (
                <PaperCard key={p.paper_id} paper={p} />
              ))}
            </div>
          </Section>
        </div>
        <aside className="space-y-4">
          <h2 className="text-xl">Top topics</h2>
          <ul className="space-y-2">
            {a.topics.map((t) => (
              <li key={t.topic_id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/topics/${t.topic_id}`} className="hover:underline">
                  {t.topic_name}
                </Link>
                <Badge variant="secondary">{t.papers}</Badge>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}

export default function AuthorPage({ params }: PageProps<"/authors/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl min-h-svh px-4 py-10">
          <ListSkeleton />
        </div>
      }
    >
      <AuthorView params={params} />
    </Suspense>
  );
}
