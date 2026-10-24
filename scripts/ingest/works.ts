// pnpm ingest:works — per theme, the most-cited works since 2012 plus the most-cited from 2023 on,
// fetched with cursor paging, a select= list and the gzip cache. Also seeds the integrity set:
// retracted computer-science works and the papers that cite them.

import { addToCorpus, readCorpus, writeCorpus } from "./lib/corpus";
import { BudgetExhaustedError, openalexList, shortId, usage } from "./lib/openalex";
import { CS_FIELD_ID, FROM_YEAR, RECENT_FROM_YEAR, THEMES } from "./lib/themes";
import { type OAWork, WORK_FIELDS } from "./lib/transform";

const TYPES = "type:article|preprint|review";

async function main(): Promise<void> {
  const corpus = readCorpus();
  let partial = false;
  try {
    for (const theme of THEMES) {
      const base = [
        `title_and_abstract.search:${theme.search}`,
        TYPES,
        ...(theme.csOnly ? [`primary_topic.field.id:${CS_FIELD_ID}`] : []),
      ];
      const classics = await openalexList<OAWork>(
        "/works",
        {
          filter: [...base, `from_publication_date:${FROM_YEAR}-01-01`].join(","),
          sort: "cited_by_count:desc",
          select: WORK_FIELDS,
        },
        theme.classics,
      );
      const recent = await openalexList<OAWork>(
        "/works",
        {
          filter: [...base, `from_publication_date:${RECENT_FROM_YEAR}-01-01`].join(","),
          sort: "cited_by_count:desc",
          select: WORK_FIELDS,
        },
        theme.recent,
      );
      for (const w of [...classics, ...recent]) addToCorpus(corpus, w, theme.key, "theme");
      console.log(
        `${theme.key.padEnd(9)} classics ${classics.length}, recent ${recent.length}, corpus now ${corpus.size}`,
      );
    }

    // Integrity seed: retracted CS works since 2012 and up to 15 of each one's most-cited citers.
    const retracted = await openalexList<OAWork>(
      "/works",
      {
        filter: [
          `is_retracted:true`,
          `primary_topic.field.id:${CS_FIELD_ID}`,
          `from_publication_date:${FROM_YEAR}-01-01`,
          TYPES,
        ].join(","),
        sort: "cited_by_count:desc",
        select: WORK_FIELDS,
      },
      40,
    );
    for (const w of retracted) addToCorpus(corpus, w, "integrity", "integrity");
    let citers = 0;
    for (const w of retracted.filter((r) => r.cited_by_count > 0)) {
      const list = await openalexList<OAWork>(
        "/works",
        { filter: `cites:${shortId(w.id)}`, sort: "cited_by_count:desc", select: WORK_FIELDS },
        15,
      );
      for (const c of list) addToCorpus(corpus, c, "integrity", "integrity");
      citers += list.length;
    }
    console.log(`integrity retracted ${retracted.length}, citers ${citers}, corpus now ${corpus.size}`);
  } catch (err) {
    if (!(err instanceof BudgetExhaustedError)) throw err;
    partial = true;
    console.warn(`PARTIAL: ${err.message}. Cached pages are kept; re-run after midnight UTC.`);
  }
  writeCorpus(corpus);
  console.log(`corpus: ${corpus.size} works${partial ? " (partial)" : ""}`, usage());
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
