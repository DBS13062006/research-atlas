import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { BlockSkeleton } from "@/components/states";
import { ANONYMOUS } from "@/server/db/client";
import { getPaperCards } from "@/server/services/papers";
import { LineageExplorer } from "./lineage-explorer";

export const metadata: Metadata = { title: "Lineage" };

async function Explorer({ searchParams }: { searchParams: Promise<{ paper?: string }> }) {
  const id = Number((await searchParams).paper);
  const card =
    Number.isSafeInteger(id) && id > 0 ? (await getPaperCards(ANONYMOUS, [id])).get(id) : undefined;
  return (
    <LineageExplorer
      initial={
        card ? { paper_id: card.paper_id, title: card.title, publication_year: card.publication_year } : null
      }
    />
  );
}

export default function LineagePage({ searchParams }: PageProps<"/explore/lineage">) {
  return (
    <>
      <PageHeader
        eyebrow="Explore · Lineage"
        title="Where did this idea come from, and where did it go?"
        description="Each paper sits at its year, in the lane for how many citation hops it is from the one you chose. The same walk runs in PostgreSQL and in Neo4j, with both timings shown."
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <Suspense fallback={<BlockSkeleton className="h-96" />}>
          <Explorer searchParams={searchParams as Promise<{ paper?: string }>} />
        </Suspense>
      </div>
    </>
  );
}
