import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TrailEditor } from "@/app/trails/trail-forms";
import { PageHeader } from "@/components/common/page-header";
import { BlockSkeleton } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/server/auth/dal";
import { ANONYMOUS, withDb } from "@/server/db/client";
import { graphDriver } from "@/server/graph/driver";
import { GraphNotFoundError } from "@/server/graph/errors";
import { getTrail } from "@/server/graph/trails";
import { displayNames } from "@/server/services/people";

export const metadata: Metadata = { title: "Reading trail" };

async function TrailView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await getCurrentUser();
  let trail: Awaited<ReturnType<typeof getTrail>>;
  try {
    trail = await getTrail(graphDriver(), id, {
      userId: user?.userId ?? null,
      isAdmin: user?.role === "ADMIN",
    });
  } catch (err) {
    if (err instanceof GraphNotFoundError) notFound();
    throw err;
  }
  const ids = trail.stepsList.map((s) => s.paperId);
  const cites = await withDb(
    ANONYMOUS,
    (tx) => tx<{ citing: number; cited: number }[]>`
      SELECT citing_paper_id::INT AS citing, cited_paper_id::INT AS cited FROM citation
      WHERE citing_paper_id = ANY(${ids}::BIGINT[]) AND cited_paper_id = ANY(${ids}::BIGINT[])`,
  );
  const owner = (await displayNames([trail.ownerId])).get(trail.ownerId);
  const editable = Boolean(user && (user.userId === trail.ownerId || user.role === "ADMIN"));
  return (
    <>
      <PageHeader
        eyebrow={trail.visibility === "PUBLIC" ? "Public trail" : "Private trail"}
        title={trail.title}
        description={trail.description ?? undefined}
        actions={
          editable ? (
            <Badge>{user?.userId === trail.ownerId ? "Your trail" : "Moderating"}</Badge>
          ) : (
            <Badge variant="secondary">By {owner ?? "a former member"}</Badge>
          )
        }
      />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <TrailEditor trail={trail} editable={editable} cites={cites} />
      </div>
    </>
  );
}

export default function TrailPage({ params }: PageProps<"/trails/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl min-h-svh px-4 py-8">
          <BlockSkeleton className="h-96" />
        </div>
      }
    >
      <TrailView params={params} />
    </Suspense>
  );
}
