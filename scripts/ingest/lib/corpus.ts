// The working corpus between pipeline steps: raw OpenAlex works plus the themes each belongs to,
// stored as gzip-compressed JSON lines in data/cache/ (git-ignored, rebuilt from the API cache).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import type { OAWork } from "../../../src/lib/openalex-transform";

export type CorpusEntry = { work: OAWork; themes: string[]; via: "theme" | "expand" | "integrity" };

const FILE = "data/cache/corpus.jsonl.gz";

export function readCorpus(): Map<string, CorpusEntry> {
  const map = new Map<string, CorpusEntry>();
  if (!existsSync(FILE)) return map;
  for (const line of gunzipSync(readFileSync(FILE)).toString("utf8").split("\n")) {
    if (!line) continue;
    const entry = JSON.parse(line) as CorpusEntry;
    map.set(entry.work.id, entry);
  }
  return map;
}

export function writeCorpus(map: Map<string, CorpusEntry>): void {
  mkdirSync("data/cache", { recursive: true });
  const lines = [...map.values()].map((e) => JSON.stringify(e)).join("\n");
  writeFileSync(FILE, gzipSync(lines));
}

export function addToCorpus(
  map: Map<string, CorpusEntry>,
  work: OAWork,
  theme: string,
  via: CorpusEntry["via"],
): void {
  const existing = map.get(work.id);
  if (existing) {
    if (!existing.themes.includes(theme)) existing.themes.push(theme);
    return;
  }
  map.set(work.id, { work, themes: [theme], via });
}
