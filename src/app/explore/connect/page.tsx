import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { BlockSkeleton } from "@/components/states";
import { ANONYMOUS } from "@/server/db/client";
import { getPaperCards } from "@/server/services/papers";
import { ConnectExplorer } from "./connect-explorer";

export const metadata: Metadata = { title: "Connect" };

async function Explorer({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const id = Number((await searchParams).from);
  const card =
    Number.isSafeInteger(id) && id > 0 ? (await getPaperCards(ANONYMOUS, [id])).get(id) : undefined;
  return (
    <ConnectExplorer
      initialFrom={
        card ? { paper_id: card.paper_id, title: card.title, publication_year: card.publication_year } : null
      }
    />
  );
}

export default function ConnectPage({ searchParams }: PageProps<"/explore/connect">) {
  return (
    <>
      <PageHeader
        eyebrow="Explore · Connect"
        title="How are these two papers connected?"
        description="Neo4j answers with a SHORTEST path pattern; PostgreSQL answers the same question with a breadth-first recursive CTE carrying the path as an array."
      />
      <div className="mx-auto max-w-7xl px-4 py-8 *:max-w-4xl">
        <Suspense fallback={<BlockSkeleton className="h-64" />}>
          <Explorer searchParams={searchParams as Promise<{ from?: string }>} />
        </Suspense>
      </div>
    </>
  );
}
