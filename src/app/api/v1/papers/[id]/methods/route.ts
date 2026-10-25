import { idFrom, route } from "@/server/api/handler";
import { invalidateCatalog } from "@/server/cached";
import { syncGraphNow } from "@/server/services/admin";
import { linkMethod } from "@/server/services/catalog";

export const POST = route("POST /papers/{id}/methods", async ({ db, params, body }) => {
  const result = await linkMethod(db, idFrom(params), body.method_id, body.usage_type);
  await syncGraphNow().catch(() => undefined);
  invalidateCatalog();
  return result;
});
