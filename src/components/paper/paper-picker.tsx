"use client";

import { Loader2, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PickedPaper = { paper_id: number; title: string; publication_year?: number | null };

// Type-ahead paper search (lexical, PostgreSQL full-text) used wherever a paper must be chosen.
export function PaperPicker({
  label,
  value,
  onChange,
  placeholder = "Search by title or keyword",
}: {
  label: string;
  value: PickedPaper | null;
  onChange: (p: PickedPaper | null) => void;
  placeholder?: string;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/search?mode=lexical&limit=8&q=${encodeURIComponent(q)}`);
        if (res.ok) setResults(((await res.json()) as { hits: PickedPaper[] }).hits);
      } finally {
        setLoading(false);
        setActive(0);
      }
    }, 220);
  }, [q]);

  if (value) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <p className="flex-1 text-sm">
            {value.title}
            {value.publication_year ? (
              <span className="ml-2 font-mono text-xs text-muted-foreground">{value.publication_year}</span>
            ) : null}
          </p>
          <Button size="icon-xs" variant="ghost" aria-label={`Clear ${label}`} onClick={() => onChange(null)}>
            <X className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={id}
          className="pl-8"
          placeholder={placeholder}
          value={q}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
            else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              onChange(results[active]);
            } else return;
            e.preventDefault();
          }}
        />
        {loading ? (
          <Loader2
            className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : null}
      </div>
      {results.length > 0 ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-lg"
        >
          {results.map((r, i) => (
            <li key={r.paper_id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${i === active ? "bg-muted" : "hover:bg-muted"}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => onChange(r)}
              >
                {r.title}
                {r.publication_year ? (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{r.publication_year}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
