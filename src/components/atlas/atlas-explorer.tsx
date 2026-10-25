"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { categoryColor } from "@/lib/format";
import type { AtlasPoint, Front } from "@/server/services/graph-views";

// The canvas (and d3) load only on the client, so the page shell stays small.
const AtlasCanvas = dynamic(() => import("@/components/atlas/atlas-canvas").then((m) => m.AtlasCanvas), {
  ssr: false,
  loading: () => <div className="h-[640px] animate-pulse rounded-xl border bg-muted/40" />,
});

type Collection = { collection_id: number; collection_name: string };

export function AtlasExplorer({
  points,
  fronts,
  signedIn,
}: {
  points: AtlasPoint[];
  fronts: Front[];
  signedIn: boolean;
}) {
  const years = useMemo(() => points.map((p) => p.y_ ?? 0).filter((y) => y > 0), [points]);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState(maxYear);
  const [listView, setListView] = useState(false);
  const [selection, setSelection] = useState<number[]>([]);
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return points
      .filter((p) => (p.y_ ?? 0) <= year && (q.length < 2 || p.t.toLowerCase().includes(q)))
      .sort((a, b) => b.w - a.w)
      .slice(0, 60);
  }, [points, query, year]);

  async function loadCollections() {
    const res = await fetch("/api/v1/collections");
    if (res.ok) setCollections(((await res.json()) as { items: Collection[] }).items);
  }

  async function addAll(collectionId: number) {
    let added = 0;
    for (const id of selection.slice(0, 100)) {
      const res = await fetch(`/api/v1/collections/${collectionId}/papers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper_id: id }),
      });
      if (res.ok) added++;
    }
    toast.success(`Added ${added} papers to the collection`);
    setSelection([]);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="atlas-search">Light up papers by title</Label>
            <Input
              id="atlas-search"
              placeholder="e.g. spiking, retrieval, ICU"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-2">
            <Label id="year-label">
              Published up to <span className="font-mono">{year}</span>
            </Label>
            <Slider
              aria-labelledby="year-label"
              min={minYear}
              max={maxYear}
              step={1}
              value={[year]}
              onValueChange={(v) => setYear(Array.isArray(v) ? v[0] : v)}
            />
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Switch id="list-view" checked={listView} onCheckedChange={setListView} />
            <Label htmlFor="list-view">List view</Label>
          </div>
        </div>
        {listView ? (
          <ol
            className="divide-y rounded-xl border"
            aria-label="Most influential papers matching the filters"
          >
            {visible.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: categoryColor(p.c) }}
                  aria-hidden
                />
                <Link href={`/papers/${p.id}`} className="flex-1 hover:underline">
                  {p.t}
                </Link>
                <span className="font-mono text-xs text-muted-foreground">{p.y_}</span>
              </li>
            ))}
          </ol>
        ) : (
          <AtlasCanvas
            points={points}
            highlight={query}
            maxYear={year}
            selected={selectedSet}
            onSelect={signedIn ? setSelection : undefined}
          />
        )}
        <p className="text-xs text-muted-foreground">
          Drag to pan, scroll or <kbd className="font-mono">+</kbd>/<kbd className="font-mono">−</kbd> to
          zoom, <kbd className="font-mono">n</kbd> to step through papers and{" "}
          <kbd className="font-mono">Enter</kbd> to open one.
          {signedIn
            ? " Shift-drag a box to select papers for a collection."
            : " Sign in to add a region to a collection."}{" "}
          Red rings mark retracted papers.
        </p>
      </div>
      <aside className="space-y-6">
        {selection.length > 0 ? (
          <div className="rounded-xl border p-4">
            <p className="font-medium">{selection.length} papers selected</p>
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
              {selection.slice(0, 12).map((id) => (
                <li key={id} className="truncate">
                  {byId.get(id)?.t}
                </li>
              ))}
            </ul>
            {collections === null ? (
              <Button className="mt-3 w-full" size="sm" onClick={loadCollections}>
                Add to a collection…
              </Button>
            ) : collections.length === 0 ? (
              <p className="mt-3 text-sm">
                <Link href="/library" className="underline">
                  Create a collection first
                </Link>
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-1">
                {collections.map((c) => (
                  <Button
                    key={c.collection_id}
                    size="sm"
                    variant="outline"
                    onClick={() => addAll(c.collection_id)}
                  >
                    {c.collection_name}
                  </Button>
                ))}
              </div>
            )}
            <Button className="mt-2 w-full" size="sm" variant="ghost" onClick={() => setSelection([])}>
              Clear selection
            </Button>
          </div>
        ) : null}
        <div>
          <h2 className="text-xl">Research fronts</h2>
          <p className="text-sm text-muted-foreground">Communities found by Leiden on the citation graph.</p>
          <ul className="mt-3 space-y-2">
            {fronts.map((f) => (
              <li key={f.community} className="flex items-start gap-2 text-sm">
                <span
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ background: categoryColor(f.community) }}
                  aria-hidden
                />
                <span className="flex-1">
                  {f.label}
                  <span className="block font-mono text-xs text-muted-foreground">
                    {f.papers} papers · {f.recent_share}% since 2023
                  </span>
                </span>
                {f.emerging ? <Badge variant="secondary">Emerging</Badge> : null}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
