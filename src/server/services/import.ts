import "server-only";

import neo4j from "neo4j-driver";
import { type OAWork, toPayload, WORK_FIELDS } from "@/lib/openalex-transform";
import { invalidateCatalog } from "@/server/cached";
import { type DbContext, withDb } from "@/server/db/client";
import { documentText, embeddingProvider } from "@/server/embeddings/provider";
import { env } from "@/server/env";
import { graphDriver } from "@/server/graph/driver";
import { syncGraphNow } from "./admin";

export class ImportError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Curator import by DOI: one OpenAlex lookup (free), sp_import_paper under the curator's own role,
// then the outbox is drained and the new paper is embedded so it appears on the map and in
// semantic search straight away. Embedding is best effort: if Ollama is down the import still stands.
export async function importByDoi(ctx: DbContext, doi: string) {
  const url = new URL(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`);
  url.searchParams.set("select", WORK_FIELDS);
  const { OPENALEX_API_KEY, OPENALEX_MAILTO } = env();
  if (OPENALEX_API_KEY) url.searchParams.set("api_key", OPENALEX_API_KEY);
  if (OPENALEX_MAILTO) url.searchParams.set("mailto", OPENALEX_MAILTO);
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) throw new ImportError(404, `OpenAlex has no work with DOI ${doi}.`);
  if (!res.ok) throw new ImportError(502, `OpenAlex responded ${res.status}.`);
  const work = (await res.json()) as OAWork;
  const payload = toPayload(work);
  if (!payload) throw new ImportError(422, "OpenAlex returned a work without a title.");

  const { paperId, created } = await withDb(ctx, async (tx) => {
    const [existing] =
      await tx`SELECT paper_id FROM paper WHERE openalex_id = ${payload.openalex_id as string}`;
    const [row] = await tx<
      { p_paper_id: string }[]
    >`CALL sp_import_paper(${tx.json(payload as never)}, NULL)`;
    return { paperId: Number(row.p_paper_id), created: !existing };
  });

  const sync = await syncGraphNow().catch(() => ({ processed: 0 }));
  invalidateCatalog();
  let embedded = false;
  try {
    const [vector] = await embeddingProvider().embed([
      documentText(String(payload.title), (payload.abstract as string | null) ?? null),
    ]);
    const session = graphDriver().session();
    try {
      await session.run("MATCH (p:Paper {paperId: $id}) SET p.embedding = $vector", {
        id: neo4j.int(paperId),
        vector,
      });
      embedded = true;
    } finally {
      await session.close();
    }
  } catch {
    embedded = false;
  }
  return { paper_id: paperId, created, title: payload.title, graph_rows_synced: sync.processed, embedded };
}
