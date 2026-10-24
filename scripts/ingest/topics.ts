// pnpm ingest:topics — resolves each theme to OpenAlex topic ids and writes data/themes.json for review.
import { mkdirSync, writeFileSync } from "node:fs";
import { openalex, shortId, usage } from "./lib/openalex";
import { THEMES } from "./lib/themes";

type Topic = {
  id: string;
  display_name: string;
  works_count: number;
  subfield: { display_name: string };
  field: { display_name: string };
};

async function main(): Promise<void> {
  const out = [];
  for (const theme of THEMES) {
    const topics = new Map<
      string,
      { id: string; name: string; subfield: string; field: string; works: number }
    >();
    for (const q of theme.topicSearch) {
      const page = await openalex<{ results: Topic[] }>("/topics", { search: q, "per-page": "5" });
      for (const t of page.results) {
        topics.set(t.id, {
          id: shortId(t.id) as string,
          name: t.display_name,
          subfield: t.subfield.display_name,
          field: t.field.display_name,
          works: t.works_count,
        });
      }
    }
    out.push({ key: theme.key, name: theme.name, search: theme.search, topics: [...topics.values()] });
    console.log(
      `${theme.key.padEnd(9)} ${topics.size} topics: ${[...topics.values()].map((t) => t.name).join("; ")}`,
    );
  }
  mkdirSync("data", { recursive: true });
  writeFileSync("data/themes.json", `${JSON.stringify(out, null, 2)}\n`);
  console.log("Wrote data/themes.json", usage());
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
