// pnpm ingest:expand — adds works cited at least five times inside the corpus but not yet in it, so
// the citation graph is connected (classic foundations everyone cites) rather than star-shaped.
// Fetched by id in batches of 50.

import { addToCorpus, readCorpus, writeCorpus } from "./lib/corpus";
import { BudgetExhaustedError, openalex, shortId, usage } from "./lib/openalex";
import { type OAWork, WORK_FIELDS } from "./lib/transform";

const MIN_IN_CORPUS_CITATIONS = 5;
const MAX_ADDITIONS = 900;

async function main(): Promise<void> {
  const corpus = readCorpus();
  const counts = new Map<string, number>();
  for (const { work } of corpus.values()) {
    for (const ref of work.referenced_works ?? []) {
      if (!corpus.has(ref)) counts.set(ref, (counts.get(ref) ?? 0) + 1);
    }
  }
  const wanted = [...counts.entries()]
    .filter(([, n]) => n >= MIN_IN_CORPUS_CITATIONS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ADDITIONS)
    .map(([id]) => id);
  console.log(
    `${wanted.length} works are cited ≥${MIN_IN_CORPUS_CITATIONS} times inside the corpus but missing`,
  );

  let added = 0;
  try {
    for (let i = 0; i < wanted.length; i += 50) {
      const ids = wanted
        .slice(i, i + 50)
        .map((u) => shortId(u))
        .join("|");
      const page = await openalex<{ results: OAWork[] }>("/works", {
        filter: `openalex:${ids}`,
        select: WORK_FIELDS,
        "per-page": "50",
      });
      for (const w of page.results) {
        addToCorpus(corpus, w, "foundations", "expand");
        added++;
      }
    }
  } catch (err) {
    if (!(err instanceof BudgetExhaustedError)) throw err;
    console.warn(`PARTIAL: ${err.message}`);
  }
  writeCorpus(corpus);
  console.log(`added ${added}; corpus now ${corpus.size} works`, usage());
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
