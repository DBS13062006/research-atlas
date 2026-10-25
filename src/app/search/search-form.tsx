"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SearchForm({ topics }: { topics: { topic_id: number; topic_name: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [yearFrom, setYearFrom] = useState(params.get("year_from") ?? "");
  const [topic, setTopic] = useState(params.get("topic_id") ?? "");
  const [oa, setOa] = useState(params.get("open_access") === "true");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    next.set("mode", params.get("mode") ?? "hybrid");
    if (yearFrom) next.set("year_from", yearFrom);
    if (topic) next.set("topic_id", topic);
    if (oa) next.set("open_access", "true");
    router.push(`/search?${next.toString()}`);
  }

  return (
    <search>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_140px_220px_auto_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            name="q"
            placeholder="spiking neurons energy efficiency"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="year_from">From year</Label>
          <Input
            id="year_from"
            type="number"
            min={1950}
            max={2100}
            placeholder="2018"
            value={yearFrom}
            onChange={(e) => setYearFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="topic">Field</Label>
          <select
            id="topic"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="">Any field</option>
            {topics.map((t) => (
              <option key={t.topic_id} value={t.topic_id}>
                {t.topic_name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex h-8 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={oa}
            onChange={(e) => setOa(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          Open access
        </label>
        <Button type="submit">Search</Button>
      </form>
    </search>
  );
}
