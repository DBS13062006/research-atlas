import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { BlockSkeleton, EmptyState, ListSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber, label } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/dal";
import { cachedExposure, cachedIntegrity } from "@/server/cached";
import { CheckLibrary } from "./check-library";

export const metadata: Metadata = { title: "Integrity Radar" };

async function Exposure({ id }: { id: number }) {
  const rows = (await cachedExposure(id)) as unknown as {
    paper_id: number;
    hops: number;
    title: string;
    year: number | null;
  }[];
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing in the atlas cites it.</p>;
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {rows.slice(0, 8).map((r) => (
        <li key={r.paper_id}>
          <Badge variant={r.hops === 1 ? "destructive" : "outline"} className="mr-2 font-mono">
            {r.hops} hop{r.hops > 1 ? "s" : ""}
          </Badge>
          <Link href={`/papers/${r.paper_id}`} className="hover:underline">
            {r.title}
          </Link>
        </li>
      ))}
      {rows.length > 8 ? <li className="text-xs text-muted-foreground">and {rows.length - 8} more</li> : null}
    </ul>
  );
}

async function Radar() {
  await connection();
  const { retracted, totals } = (await cachedIntegrity()) as unknown as {
    retracted: {
      paper_id: number;
      title: string;
      year: number | null;
      status: string;
      retraction_date: string;
      reason: string | null;
      source: string;
      notice_url: string | null;
      direct: number;
      indirect: number;
    }[];
    totals: { exposed: number; direct: number };
  };
  if (retracted.length === 0)
    return <EmptyState title="No retractions recorded">Run pnpm ingest:retractions.</EmptyState>;
  return (
    <div className="space-y-8">
      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <dt className="text-xs text-muted-foreground">Retracted or flagged papers</dt>
          <dd className="font-mono text-3xl">{formatNumber(retracted.length)}</dd>
        </div>
        <div className="rounded-xl border p-4">
          <dt className="text-xs text-muted-foreground">Papers citing them directly</dt>
          <dd className="font-mono text-3xl text-retracted">{formatNumber(totals.direct)}</dd>
        </div>
        <div className="rounded-xl border p-4">
          <dt className="text-xs text-muted-foreground">Papers within two hops</dt>
          <dd className="font-mono text-3xl">{formatNumber(totals.exposed)}</dd>
        </div>
      </dl>
      <ol className="space-y-4">
        {retracted.map((r) => (
          <li key={r.paper_id} className="rounded-xl border p-5">
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1">
                <Link href={`/papers/${r.paper_id}`} className="font-medium hover:underline">
                  {r.title}
                </Link>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  published {r.year ?? "—"} · {label(r.status).toLowerCase()} {formatDate(r.retraction_date)}{" "}
                  · source {label(r.source).toLowerCase()}
                </p>
                {r.reason ? <p className="mt-1 text-sm text-muted-foreground">{r.reason}</p> : null}
              </div>
              <div className="flex gap-2">
                <Badge variant="destructive">{r.direct} direct</Badge>
                <Badge variant="outline">{r.indirect} indirect</Badge>
              </div>
            </div>
            <Suspense fallback={<BlockSkeleton className="mt-2 h-12" />}>
              <Exposure id={r.paper_id} />
            </Suspense>
            {r.notice_url ? (
              <a
                href={r.notice_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs underline"
              >
                Retraction notice <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

async function LibraryCheck() {
  const user = await getCurrentUser();
  return <CheckLibrary signedIn={Boolean(user)} />;
}

export default function IntegrityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Integrity Radar"
        title="Retracted work, and what leans on it"
        description="Real Retraction Watch records matched to the atlas, with every paper that cites them directly (1 hop) or through one intermediate paper (2 hops) — a recursive CTE over the citation table."
      />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Suspense fallback={<ListSkeleton />}>
            <Radar />
          </Suspense>
        </div>
        <aside className="space-y-3">
          <h2 className="text-xl">Your library</h2>
          <p className="text-sm text-muted-foreground">
            The check runs under your own database role, so row-level security limits it to your collections.
          </p>
          <Suspense fallback={<BlockSkeleton className="h-10" />}>
            <LibraryCheck />
          </Suspense>
        </aside>
      </div>
    </>
  );
}
