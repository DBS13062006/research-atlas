import { route } from "@/server/api/handler";
import { syncGraphNow } from "@/server/services/admin";
import { mergeAuthors } from "@/server/services/catalog";

export const POST = route("POST /authors/merge", async ({ db, body }) => {
  const result = await mergeAuthors(db, body.keep_id, body.duplicate_id);
  await syncGraphNow().catch(() => undefined);
  return result;
});
