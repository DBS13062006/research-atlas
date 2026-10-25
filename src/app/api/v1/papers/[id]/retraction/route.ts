import { idFrom, notFound, route } from "@/server/api/handler";
import { invalidateCatalog } from "@/server/cached";
import { syncGraphNow } from "@/server/services/admin";
import { getPaper, retractPaper } from "@/server/services/papers";

export const POST = route("POST /papers/{id}/retraction", async ({ db, params, body }) => {
  const id = idFrom(params);
  if (!(await getPaper(db, id))) notFound("Paper");
  const result = await retractPaper(db, id, body);
  await syncGraphNow().catch(() => undefined);
  invalidateCatalog();
  return result;
});
