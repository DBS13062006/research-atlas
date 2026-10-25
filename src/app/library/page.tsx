import { Globe, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Section } from "@/components/common/page-header";
import { EmptyState, ListSkeleton, SignInPrompt } from "@/components/common/states";
import { NewCollectionButton } from "@/components/library/collection-forms";
import { relativeTime } from "@/lib/format";
import { dbContext, getCurrentUser } from "@/server/auth/dal";
import { listNotes, myCollections } from "@/server/services/library";

export const metadata: Metadata = { title: "Library" };

type Row = {
  collection_id: number;
  collection_name: string;
  description: string | null;
  is_public: boolean;
  updated_at: Date;
  papers: number;
  not_read: number;
  reading: number;
  read: number;
};
type NoteRow = {
  note_id: number;
  paper_id: number;
  paper_title: string;
  note_text: string;
  is_private: boolean;
  updated_at: Date;
};

async function Library() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt next="/library" what="your library" />;
  const ctx = dbContext(user);
  const [collections, notes] = (await Promise.all([myCollections(ctx), listNotes(ctx)])) as unknown as [
    Row[],
    NoteRow[],
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-12 px-4 py-8">
      <Section title="Collections" action={<NewCollectionButton />}>
        {collections.length === 0 ? (
          <EmptyState title="No collections yet">
            Create one, then save papers to it from any paper page or the Atlas.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {collections.map((c) => (
              <li key={c.collection_id}>
                <Link
                  href={`/library/${c.collection_id}`}
                  className="block h-full rounded-xl border p-5 transition-colors hover:border-primary/50"
                  data-testid="collection-card"
                >
                  <div className="flex items-center gap-2">
                    {c.is_public ? (
                      <Globe className="size-4 text-muted-foreground" aria-label="Public" />
                    ) : (
                      <Lock className="size-4 text-muted-foreground" aria-label="Private" />
                    )}
                    <h3 className="text-lg font-medium">{c.collection_name}</h3>
                  </div>
                  {c.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
                  ) : null}
                  <div
                    className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted"
                    aria-label={`${c.read} read, ${c.reading} reading, ${c.not_read} not read`}
                    role="img"
                  >
                    <span
                      className="bg-chart-3"
                      style={{ width: `${(c.read / Math.max(c.papers, 1)) * 100}%` }}
                    />
                    <span
                      className="bg-chart-1"
                      style={{ width: `${(c.reading / Math.max(c.papers, 1)) * 100}%` }}
                    />
                  </div>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    {c.papers} papers · {c.read} read · {c.reading} reading · updated{" "}
                    {relativeTime(c.updated_at)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section
        title="Your notes"
        description="Private notes are visible only to you; public ones show on the paper page for everyone."
      >
        {notes.length === 0 ? (
          <EmptyState title="No notes yet">Open a paper and use the Notes tab.</EmptyState>
        ) : (
          <ul className="divide-y rounded-xl border">
            {notes.slice(0, 30).map((n) => (
              <li key={n.note_id} className="px-4 py-3 text-sm">
                <Link href={`/papers/${n.paper_id}`} className="font-medium hover:underline">
                  {n.paper_title}
                </Link>
                <p className="mt-1 line-clamp-2 text-muted-foreground">{n.note_text}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {n.is_private ? "private" : "public"} · {relativeTime(n.updated_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

export default function LibraryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Library"
        title="Your reading, organised"
        description="Collections as boards — Not read, Reading, Read — with priorities and notes. Everything here is protected by row-level security."
      />
      <Suspense
        fallback={
          <div className="mx-auto max-w-7xl px-4 py-8">
            <ListSkeleton />
          </div>
        }
      >
        <Library />
      </Suspense>
    </>
  );
}
