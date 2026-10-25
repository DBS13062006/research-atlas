import { idFrom, notFound, route } from "@/server/api/handler";
import { invalidateCatalog } from "@/server/cached";
import { syncGraphNow } from "@/server/services/admin";
import { unlinkDataset } from "@/server/services/catalog";

export const DELETE = route("DELETE /papers/{id}/datasets/{datasetId}", async ({ db, params }) => {
  if (!(await unlinkDataset(db, idFrom(params), idFrom(params, "datasetId")))) notFound("Dataset link");
  await syncGraphNow().catch(() => undefined);
  invalidateCatalog();
  return null;
});
