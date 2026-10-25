import { idFrom, route } from "@/server/api/handler";
import { invalidateCatalog } from "@/server/cached";
import { syncGraphNow } from "@/server/services/admin";
import { linkDataset } from "@/server/services/catalog";

export const POST = route("POST /papers/{id}/datasets", async ({ db, params, body }) => {
  const result = await linkDataset(db, idFrom(params), body.dataset_id, body.usage_type);
  await syncGraphNow().catch(() => undefined);
  invalidateCatalog();
  return result;
});
