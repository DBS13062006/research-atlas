import "server-only";

import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { ANONYMOUS } from "@/server/db/client";
import * as catalog from "@/server/services/catalog";
import * as graph from "@/server/services/graph-views";
import * as papers from "@/server/services/papers";

// Public, user-independent reads cached across requests. Always called as the anonymous role, so a
// cached entry can never contain data that only some users may see. Tags let curator writes
// invalidate them (revalidateTag(CATALOG_TAG)).
export const CATALOG_TAG = "catalog";
export const GRAPH_TAG = "graph";

// After a catalog write: expire the cached public views so the next request reads fresh data.
// Outside a Next.js request (scripts, tests) there is no cache to expire.
export function invalidateCatalog(...extraTags: string[]) {
  for (const tag of [CATALOG_TAG, GRAPH_TAG, ...extraTags]) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch {
      // no request store: nothing cached to invalidate
    }
  }
}

export async function cachedCorpusStats() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return papers.corpusStats(ANONYMOUS);
}

export async function cachedPaper(id: number) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG, `paper:${id}`);
  return papers.getPaper(ANONYMOUS, id);
}

export async function cachedAuthor(id: number) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return catalog.getAuthor(ANONYMOUS, id);
}

export async function cachedTopicTree() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return catalog.topicTree(ANONYMOUS);
}

export async function cachedTopic(id: number) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return catalog.getTopic(ANONYMOUS, id);
}

export async function cachedObservatory() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return catalog.observatory(ANONYMOUS);
}

export async function cachedIntegrity() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return catalog.integrityOverview(ANONYMOUS);
}

export async function cachedExposure(retractedId: number) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return catalog.exposureFor(ANONYMOUS, retractedId);
}

export async function cachedAtlasPoints() {
  "use cache";
  cacheLife("hours");
  cacheTag(GRAPH_TAG);
  return graph.atlasPoints();
}

export async function cachedFronts() {
  "use cache";
  cacheLife("hours");
  cacheTag(GRAPH_TAG);
  return graph.researchFronts(12);
}

export async function cachedGems() {
  "use cache";
  cacheLife("hours");
  cacheTag(GRAPH_TAG);
  return graph.hiddenGems(30);
}

export async function cachedGraphStats() {
  "use cache";
  cacheLife("hours");
  cacheTag(GRAPH_TAG);
  return graph.graphStats();
}

export async function cachedCoauthors(authorId: number) {
  "use cache";
  cacheLife("hours");
  cacheTag(GRAPH_TAG);
  return graph.coauthors(authorId);
}
