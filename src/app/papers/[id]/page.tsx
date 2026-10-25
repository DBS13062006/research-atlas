import { ExternalLink, FileText, GitFork, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PaperActions } from "@/components/paper/paper-actions";
import { Coordinates } from "@/components/paper/paper-card";
import { PaperTabs } from "@/components/paper/paper-tabs";
import { BlockSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatNumber, label } from "@/lib/format";
import { dbContext, getCurrentUser } from "@/server/auth/dal";
import { cachedPaper } from "@/server/cached";
import { myCollections } from "@/server/services/library";

function parseId(raw: string) {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({ params }: PageProps<"/papers/[id]">): Promise<Metadata> {
  const id = parseId((await params).id);
  const paper = id ? await cachedPaper(id).catch(() => null) : null;
  return { title: paper?.title ?? "Paper" };
}

async function Actions({ paperId }: { paperId: number }) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link href={`/login?next=/papers/${paperId}`} className="underline">
          Sign in
        </Link>{" "}
        to save this paper, write notes or relate it to another.
      </p>
    );
  }
  const collections = (await myCollections(dbContext(user))) as unknown as {
    collection_id: number;
    collection_name: string;
  }[];
  return <PaperActions paperId={paperId} role={user.role} collections={collections} />;
}

async function Tabs({ root }: { root: { paper_id: number; title: string; year: number | null } }) {
  const user = await getCurrentUser();
  return <PaperTabs root={root} viewer={user ? { userId: user.userId, role: user.role } : null} />;
}

async function Paper({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const p = await cachedPaper(id);
  if (!p) notFound();
  const retracted = p.retraction_status && p.retraction_status !== "REINSTATED";
  return (
    <article>
      <header className="topo border-b">
        <div className="mx-auto max-w-7xl px-4 py-10">
          {p.topics[0] ? (
            <nav aria-label="Topic path" className="font-mono text-xs text-muted-foreground">
              {p.topics[0].path}
            </nav>
          ) : null}
          <h1 className="mt-3 max-w-4xl text-3xl leading-tight md:text-4xl">{p.title}</h1>
          <p className="mt-3 text-muted-foreground">
            {p.authors.slice(0, 12).map((a, i) => (
              <span key={a.author_id}>
                {i > 0 ? ", " : ""}
                <Link href={`/authors/${a.author_id}`} className="hover:text-foreground hover:underline">
                  {a.author_name}
                </Link>
                {a.is_corresponding ? <sup title="Corresponding author">✉</sup> : null}
              </span>
            ))}
            {p.authors.length > 12 ? ` and ${p.authors.length - 12} more` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Coordinates paper={p} />
            {p.venue_name ? <span className="text-xs text-muted-foreground">· {p.venue_name}</span> : null}
            <Badge variant="outline">{label(p.work_type)}</Badge>
            {p.open_access ? (
              <Badge variant="outline">Open access{p.oa_status ? ` · ${label(p.oa_status)}` : ""}</Badge>
            ) : null}
          </div>
        </div>
      </header>

      {retracted ? (
        <div role="alert" className="border-b border-retracted/40 bg-retracted/10">
          <div className="mx-auto flex max-w-7xl gap-3 px-4 py-4">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-retracted" aria-hidden />
            <div className="text-sm">
              <p className="font-medium text-retracted">
                {label(p.retraction_status)} on {formatDate(p.retraction_date)}
              </p>
              {p.retraction?.reason ? (
                <p className="mt-1 text-muted-foreground">{p.retraction.reason}</p>
              ) : null}
              {p.retraction?.notice_url ? (
                <a
                  href={p.retraction.notice_url}
                  className="mt-1 inline-flex items-center gap-1 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Retraction notice <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {!retracted && p.exposure.length > 0 ? (
        <div className="border-b bg-chart-1/10">
          <div className="mx-auto max-w-7xl px-4 py-3 text-sm">
            <span className="font-medium">Builds on retracted work:</span>{" "}
            {p.exposure.slice(0, 3).map((e, i) => (
              <span key={e.retracted_paper_id}>
                {i > 0 ? "; " : ""}
                <Link href={`/papers/${e.retracted_paper_id}`} className="underline">
                  {e.title}
                </Link>{" "}
                ({e.hops} hop{e.hops > 1 ? "s" : ""})
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-10">
          <section>
            <h2 className="text-2xl">Abstract</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              {p.abstract ?? "OpenAlex has no abstract for this paper."}
            </p>
          </section>
          <section aria-labelledby="explore-heading">
            <h2 id="explore-heading" className="sr-only">
              Explore this paper
            </h2>
            <Suspense fallback={<BlockSkeleton className="h-96" />}>
              <Tabs root={{ paper_id: p.paper_id, title: p.title, year: p.publication_year }} />
            </Suspense>
          </section>
        </div>
        <aside className="space-y-6">
          <div className="rounded-xl border p-4">
            <Suspense fallback={<Skeleton className="h-16" />}>
              <Actions paperId={p.paper_id} />
            </Suspense>
          </div>
          <dl className="grid grid-cols-2 gap-4 rounded-xl border p-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Cited by (OpenAlex)</dt>
              <dd className="font-mono text-lg">{formatNumber(p.cited_by_count)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cited in this atlas</dt>
              <dd className="font-mono text-lg">{formatNumber(p.local_citation_count)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">References in atlas</dt>
              <dd className="font-mono text-lg">{formatNumber(p.references_count)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Published</dt>
              <dd className="font-mono text-lg">
                {p.publication_date ? formatDate(p.publication_date) : "—"}
              </dd>
            </div>
          </dl>
          {p.topics.length ? (
            <div>
              <h3 className="text-sm font-medium">Topics</h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {p.topics.map((t) => (
                  <li key={t.topic_id}>
                    <Link href={`/topics/${t.topic_id}`} className="hover:underline">
                      {t.topic_name}
                    </Link>
                    {t.is_primary ? (
                      <Badge variant="secondary" className="ml-2">
                        primary
                      </Badge>
                    ) : null}
                    {t.relevance_score !== null ? (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {t.relevance_score.toFixed(2)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {p.methods.length || p.datasets.length ? (
            <div>
              <h3 className="text-sm font-medium">Methods and datasets</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.methods.map((m) => (
                  <Badge
                    key={`m${m.method_id}`}
                    variant={m.usage_type === "PROPOSED" ? "default" : "secondary"}
                  >
                    {m.method_name}
                    {m.usage_type === "PROPOSED" ? " · proposed" : ""}
                  </Badge>
                ))}
                {p.datasets.map((d) => (
                  <Badge key={`d${d.dataset_id}`} variant="outline">
                    {d.dataset_name}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          <div>
            <h3 className="text-sm font-medium">Links</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {p.doi ? (
                <li>
                  <a
                    className="inline-flex items-center gap-1 hover:underline"
                    href={`https://doi.org/${p.doi}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-3.5" aria-hidden /> doi.org/{p.doi}
                  </a>
                </li>
              ) : null}
              {p.arxiv_id ? (
                <li>
                  <a
                    className="inline-flex items-center gap-1 hover:underline"
                    href={`https://arxiv.org/abs/${p.arxiv_id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-3.5" aria-hidden /> arXiv {p.arxiv_id}
                  </a>
                </li>
              ) : null}
              {p.resources.map((r) => (
                <li key={r.resource_url}>
                  <a
                    className="inline-flex items-center gap-1 hover:underline"
                    href={r.resource_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.resource_type === "CODE" ? (
                      <GitFork className="size-3.5" aria-hidden />
                    ) : (
                      <FileText className="size-3.5" aria-hidden />
                    )}
                    {r.resource_type === "CODE"
                      ? "Code"
                      : r.resource_type === "PDF"
                        ? "PDF"
                        : label(r.resource_type)}
                  </a>
                </li>
              ))}
              {p.openalex_id ? (
                <li>
                  <a
                    className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
                    href={`https://openalex.org/${p.openalex_id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-3.5" aria-hidden /> OpenAlex {p.openalex_id}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            nativeButton={false}
            render={<Link href={`/explore/connect?from=${p.paper_id}`} />}
          >
            Connect to another paper
          </Button>
        </aside>
      </div>
    </article>
  );
}

function PaperSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-10" aria-busy="true">
      <Skeleton className="h-4 w-80" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
      <BlockSkeleton className="mt-8 h-96" />
    </div>
  );
}

export default function PaperPage({ params }: PageProps<"/papers/[id]">) {
  return (
    <Suspense fallback={<PaperSkeleton />}>
      <Paper params={params} />
    </Suspense>
  );
}
