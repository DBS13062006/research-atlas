"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/components/paper/api";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";

type Hit = {
  collection_name: string;
  paper_id: number;
  title: string;
  retracted_paper_id: number;
  retracted_title: string;
  hops: number;
};

export function CheckLibrary({ signedIn }: { signedIn: boolean }) {
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  if (!signedIn) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link href="/login?next=/integrity" className="underline">
          Sign in
        </Link>{" "}
        to check whether anything in your collections leans on retracted work.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setHits((await api<{ items: Hit[] }>("/integrity/my-library")).items);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking…" : "Check my library"}
      </Button>
      {hits === null ? null : hits.length === 0 ? (
        <EmptyState title="Nothing in your collections cites retracted work within two hops" />
      ) : (
        <ul className="space-y-2" data-testid="library-exposure">
          {hits.map((h) => (
            <li
              key={`${h.paper_id}-${h.retracted_paper_id}`}
              className="rounded-lg border border-retracted/40 bg-retracted/5 p-3 text-sm"
            >
              <Link href={`/papers/${h.paper_id}`} className="font-medium hover:underline">
                {h.title}
              </Link>{" "}
              <span className="text-muted-foreground">in “{h.collection_name}”</span>
              <p className="mt-1 text-muted-foreground">
                {h.hops === 1 ? "cites" : "cites a paper that cites"}{" "}
                <Link href={`/papers/${h.retracted_paper_id}`} className="text-retracted underline">
                  {h.retracted_title}
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
