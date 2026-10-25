import { Globe, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { relativeTime } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/dal";
import { graphDriver } from "@/server/graph/driver";
import { listTrails } from "@/server/graph/trails";
import { withNames } from "@/server/services/people";
import { NewTrailButton } from "./trail-forms";

export const metadata: Metadata = { title: "Reading trails" };

async function Trails() {
  const user = await getCurrentUser();
  try {
    const trails = await withNames(await listTrails(graphDriver(), user?.userId ?? null), "ownerId");
    return (
      <div className="space-y-4">
        {user ? (
          <div className="flex justify-end">
            <NewTrailButton />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link href="/login?next=/trails" className="underline">
              Sign in
            </Link>{" "}
            to make your own trails.
          </p>
        )}
        {trails.length === 0 ? (
          <EmptyState title="No trails yet" />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {trails.map((t) => (
              <li key={t.trailId}>
                <Link
                  href={`/trails/${t.trailId}`}
                  className="block h-full rounded-xl border p-5 hover:border-primary/50"
                  data-testid="trail-card"
                >
                  <div className="flex items-center gap-2">
                    {t.visibility === "PUBLIC" ? (
                      <Globe className="size-4 text-muted-foreground" aria-label="Public" />
                    ) : (
                      <Lock className="size-4 text-muted-foreground" aria-label="Private" />
                    )}
                    <h2 className="text-lg font-medium">{t.title}</h2>
                  </div>
                  {t.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                  ) : null}
                  <p className="mt-3 font-mono text-xs text-muted-foreground">
                    {t.steps} stops ·{" "}
                    {t.ownerId === user?.userId ? "yours" : `by ${t.ownerIdName ?? "a former member"}`} ·
                    updated {relativeTime(t.updatedAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  } catch {
    return <ErrorState title="The graph database is not reachable" />;
  }
}

export default function TrailsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Reading trails"
        title="Curated routes through the literature"
        description="A trail is an ordered route through papers with a note at each stop. Trails live only in Neo4j, with full read, update and delete."
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <Suspense fallback={<ListSkeleton />}>
          <Trails />
        </Suspense>
      </div>
    </>
  );
}
