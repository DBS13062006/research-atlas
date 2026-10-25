import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
        <p>
          Research Atlas · DBMS mini-project, PES University · Data: OpenAlex (CC0), Retraction Watch via
          Crossref, Papers with Code archive.
        </p>
        <nav className="flex gap-4" aria-label="Footer">
          <Link href="/api/docs" className="hover:text-foreground">
            API
          </Link>
          <Link href="/lab" className="hover:text-foreground">
            Query Lab
          </Link>
          <Link href="/topics" className="hover:text-foreground">
            Topics
          </Link>
        </nav>
      </div>
    </footer>
  );
}
