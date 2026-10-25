import type { Metadata } from "next";
import { Suspense } from "react";
import { CurateWorkbench } from "@/app/curate/curate-workbench";
import { PageHeader } from "@/components/common/page-header";
import { AccessDenied, BlockSkeleton, SignInPrompt } from "@/components/common/states";
import { atLeast } from "@/lib/roles";
import { getCurrentUser } from "@/server/auth/dal";
import { ANONYMOUS } from "@/server/db/client";
import { getPaperCards } from "@/server/services/papers";

export const metadata: Metadata = { title: "Curate" };

async function Workbench({ searchParams }: { searchParams: Promise<{ paper?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt next="/curate" what="the curation workbench" />;
  if (!atLeast(user.role, "CURATOR")) return <AccessDenied need="curator" />;
  const id = Number((await searchParams).paper);
  const card =
    Number.isSafeInteger(id) && id > 0 ? (await getPaperCards(ANONYMOUS, [id])).get(id) : undefined;
  return (
    <>
      <PageHeader
        eyebrow="Curate"
        title="Keep the catalog right"
        description="Import papers, correct metadata, link methods and datasets, and moderate curated relations. Every write runs as your curator role in PostgreSQL."
      />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <CurateWorkbench
          initial={
            card
              ? { paper_id: card.paper_id, title: card.title, publication_year: card.publication_year }
              : null
          }
        />
      </div>
    </>
  );
}

export default function CuratePage({ searchParams }: PageProps<"/curate">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-8">
          <BlockSkeleton className="h-96" />
        </div>
      }
    >
      <Workbench searchParams={searchParams as Promise<{ paper?: string }>} />
    </Suspense>
  );
}
