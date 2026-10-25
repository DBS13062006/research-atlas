import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatNumber, label, truncate } from "@/lib/format";

export type CardPaper = {
  paper_id: number;
  title: string;
  publication_year?: number | null;
  doi?: string | null;
  cited_by_count?: number | null;
  local_citation_count?: number | null;
  venue_name?: string | null;
  author_names?: string | null;
  primary_topic_name?: string | null;
  retraction_status?: string | null;
  open_access?: boolean | null;
};

// Metadata is set like map coordinates: DOI · year · citations.
export function Coordinates({ paper }: { paper: CardPaper }) {
  const parts = [
    paper.doi ? `DOI ${truncate(paper.doi, 34)}` : null,
    paper.publication_year ? String(paper.publication_year) : null,
    paper.cited_by_count !== undefined && paper.cited_by_count !== null
      ? `${formatNumber(paper.cited_by_count)} citations`
      : null,
  ].filter(Boolean);
  return <p className="font-mono text-xs text-muted-foreground">{parts.join(" · ")}</p>;
}

export function RetractionBadge({ status }: { status: string | null | undefined }) {
  if (!status || status === "REINSTATED") return null;
  return (
    <Badge variant="destructive" className="gap-1">
      <ShieldAlert className="size-3" aria-hidden />
      {label(status)}
    </Badge>
  );
}

export function PaperCard({
  paper,
  extra,
  snippet,
}: {
  paper: CardPaper;
  extra?: ReactNode;
  snippet?: string | null;
}) {
  return (
    <article className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium leading-snug">
          <Link href={`/papers/${paper.paper_id}`} className="hover:underline focus-visible:underline">
            {paper.title}
          </Link>
        </h3>
        <RetractionBadge status={paper.retraction_status} />
      </div>
      {paper.author_names ? (
        <p className="mt-1 text-sm text-muted-foreground">{truncate(paper.author_names, 140)}</p>
      ) : null}
      {snippet ? (
        <p
          className="mt-2 text-sm text-muted-foreground [&_mark]:rounded-sm [&_mark]:bg-primary/25 [&_mark]:px-0.5 [&_mark]:text-foreground"
          // ts_headline output: only <mark> tags around words already in the abstract.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised below
          dangerouslySetInnerHTML={{ __html: sanitiseHeadline(snippet) }}
        />
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Coordinates paper={paper} />
        {paper.venue_name ? (
          <span className="text-xs text-muted-foreground">· {truncate(paper.venue_name, 60)}</span>
        ) : null}
        {paper.primary_topic_name ? <Badge variant="secondary">{paper.primary_topic_name}</Badge> : null}
        {paper.open_access ? <Badge variant="outline">Open access</Badge> : null}
        {extra}
      </div>
    </article>
  );
}

// Escape everything, then restore only <mark> and </mark>.
export function sanitiseHeadline(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}
