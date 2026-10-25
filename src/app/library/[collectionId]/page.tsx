import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import { BlockSkeleton, EmptyState } from "@/components/common/states";
import { CollectionSettings } from "@/components/library/collection-forms";
import { type Item, Kanban } from "@/components/library/kanban";
import { Badge } from "@/components/ui/badge";
import { dbContext, getCurrentUser } from "@/server/auth/dal";
import { getCollection } from "@/server/services/library";

export const metadata: Metadata = { title: "Collection" };

async function CollectionView({ params }: { params: Promise<{ collectionId: string }> }) {
  const id = Number((await params).collectionId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const user = await getCurrentUser();
  // Row-level security decides: a private collection of someone else simply is not found.
  const c = (await getCollection(dbContext(user), id)) as unknown as {
    collection_id: number;
    collection_name: string;
    description: string | null;
    is_public: boolean;
    is_owner: boolean;
    items: Item[];
  } | null;
  if (!c) notFound();
  return (
    <>
      <PageHeader
        eyebrow={c.is_public ? "Public collection" : "Private collection"}
        title={c.collection_name}
        description={c.description ?? undefined}
        actions={
          c.is_owner ? (
            <CollectionSettings
              id={c.collection_id}
              name={c.collection_name}
              description={c.description}
              isPublic={c.is_public}
            />
          ) : (
            <Badge variant="secondary">Read only</Badge>
          )
        }
      />
      <div className="mx-auto max-w-7xl px-4 py-8">
        {c.items.length === 0 ? (
          <EmptyState title="This collection is empty">
            Save papers from a{" "}
            <Link href="/search" className="underline">
              search
            </Link>{" "}
            or the{" "}
            <Link href="/atlas" className="underline">
              Atlas
            </Link>
            .
          </EmptyState>
        ) : (
          <Kanban collectionId={c.collection_id} initial={c.items} editable={c.is_owner} />
        )}
        {c.is_owner ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Drag cards between columns, or use each card's menu. Moving a card to Read stamps its read date
            (trigger).
          </p>
        ) : null}
      </div>
    </>
  );
}

export default function CollectionPage({ params }: PageProps<"/library/[collectionId]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl min-h-svh px-4 py-8">
          <BlockSkeleton className="h-96" />
        </div>
      }
    >
      <CollectionView params={params} />
    </Suspense>
  );
}
