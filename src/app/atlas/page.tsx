import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AtlasExplorer } from "@/components/atlas/atlas-explorer";
import { PageHeader } from "@/components/page-header";
import { BlockSkeleton, ErrorState } from "@/components/states";
import { getCurrentUser } from "@/server/auth/dal";
import { cachedAtlasPoints, cachedFronts } from "@/server/cached";

export const metadata: Metadata = { title: "Atlas" };

async function Atlas() {
  await connection();
  try {
    const [points, fronts, user] = await Promise.all([cachedAtlasPoints(), cachedFronts(), getCurrentUser()]);
    if (points.length === 0) {
      return (
        <ErrorState title="The map has not been drawn yet">
          Run pnpm embed:papers and pnpm layout:umap.
        </ErrorState>
      );
    }
    return <AtlasExplorer points={points} fronts={fronts} signedIn={Boolean(user)} />;
  } catch {
    return (
      <ErrorState title="The graph database is not reachable">
        Start Neo4j with pnpm db:up and reload.
      </ErrorState>
    );
  }
}

export default function AtlasPage() {
  return (
    <>
      <PageHeader
        eyebrow="The Atlas"
        title="Every dot is a paper, placed by meaning"
        description="Papers close together say similar things. Colour shows the research front a paper belongs to; drag the year slider to watch fields being born."
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <Suspense fallback={<BlockSkeleton className="h-[640px]" />}>
          <Atlas />
        </Suspense>
      </div>
    </>
  );
}
