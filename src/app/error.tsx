"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center" role="alert">
      <p className="font-mono text-sm text-muted-foreground">
        Error{error.digest ? ` · ${error.digest}` : ""}
      </p>
      <h1 className="mt-4 text-4xl">This page hit a problem</h1>
      <p className="mt-3 text-muted-foreground">
        The databases may be starting up. Check that PostgreSQL and Neo4j are running (pnpm db:up), then try
        again.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
