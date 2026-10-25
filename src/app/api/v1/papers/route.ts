import { route } from "@/server/api/handler";
import { syncGraphNow } from "@/server/services/admin";
import { createPaper, listPapers } from "@/server/services/papers";

export const GET = route("GET /papers", async ({ db, query }) => listPapers(db, query));

export const POST = route("POST /papers", async ({ db, body }) => {
  const paperId = await createPaper(db, body);
  await syncGraphNow().catch(() => undefined);
  return { paper_id: paperId };
});
