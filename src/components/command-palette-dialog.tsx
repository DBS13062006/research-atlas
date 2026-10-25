"use client";

import { FileText, Layers, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/components/paper/api";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NAV_SECTIONS } from "@/lib/nav";

type PaperHit = { paper_id: number; title: string; publication_year: number | null };
type AuthorHit = { author_id: number; author_name: string; papers: number };
type Topic = { topic_id: number; topic_name: string; topic_level: number; papers: number };

const LEVELS = ["domain", "field", "subfield", "topic"];

// Loaded only when the palette first opens, so cmdk stays out of every page's initial bundle.
// Pages and topics are filtered here; papers and authors come from the API as you type.
export default function CommandPaletteDialog({
  open,
  onOpenChange,
  go,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  go: (href: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [papers, setPapers] = useState<PaperHit[]>([]);
  const [authors, setAuthors] = useState<AuthorHit[]>([]);

  useEffect(() => {
    api<{ items: Topic[] }>("/topics")
      .then((r) => setTopics(r.items.filter((t) => t.papers > 0)))
      .catch(() => setTopics([]));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setPapers([]);
      setAuthors([]);
      return;
    }
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q, mode: "lexical", limit: "6" });
      api<{ hits: PaperHit[] }>(`/search?${params}`)
        .then((r) => setPapers(r.hits))
        .catch(() => setPapers([]));
      api<{ items: AuthorHit[] }>(`/authors?${new URLSearchParams({ q, limit: "5" })}`)
        .then((r) => setAuthors(r.items))
        .catch(() => setAuthors([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const needle = query.trim().toLowerCase();
  const pages = useMemo(
    () =>
      NAV_SECTIONS.map((s) => ({
        ...s,
        items: s.items.filter((i) => !needle || `${i.label} ${i.hint}`.toLowerCase().includes(needle)),
      })).filter((s) => s.items.length),
    [needle],
  );
  const topicHits = useMemo(
    () =>
      needle.length < 2 ? [] : topics.filter((t) => t.topic_name.toLowerCase().includes(needle)).slice(0, 6),
    [topics, needle],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Jump to a page, paper, author or topic"
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Pages, papers, authors, topics…"
          value={query}
          onValueChange={setQuery}
          aria-label="Search pages, papers, authors and topics"
        />
        <CommandList>
          <CommandEmpty>{needle.length < 2 ? "Type to search." : "Nothing matches."}</CommandEmpty>
          {papers.length ? (
            <CommandGroup heading="Papers">
              {papers.map((p) => (
                <CommandItem
                  key={p.paper_id}
                  value={`paper-${p.paper_id}`}
                  onSelect={() => go(`/papers/${p.paper_id}`)}
                >
                  <FileText className="size-4 text-muted-foreground" aria-hidden />
                  <span className="truncate">{p.title}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {p.publication_year ?? ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {authors.length ? (
            <CommandGroup heading="Authors">
              {authors.map((a) => (
                <CommandItem
                  key={a.author_id}
                  value={`author-${a.author_id}`}
                  onSelect={() => go(`/authors/${a.author_id}`)}
                >
                  <UserRound className="size-4 text-muted-foreground" aria-hidden />
                  <span>{a.author_name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{a.papers} papers</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {topicHits.length ? (
            <CommandGroup heading="Topics">
              {topicHits.map((t) => (
                <CommandItem
                  key={t.topic_id}
                  value={`topic-${t.topic_id}`}
                  onSelect={() => go(`/topics/${t.topic_id}`)}
                >
                  <Layers className="size-4 text-muted-foreground" aria-hidden />
                  <span>{t.topic_name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{LEVELS[t.topic_level]}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {pages.map((section) => (
            <CommandGroup key={section.title} heading={section.title}>
              {section.items.map((item) => (
                <CommandItem key={item.href} value={`page-${item.href}`} onSelect={() => go(item.href)}>
                  <item.icon className="size-4 text-muted-foreground" aria-hidden />
                  <span>{item.label}</span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">{item.hint}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
