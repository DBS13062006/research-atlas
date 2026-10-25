import { idFrom, notFound, route } from "@/server/api/handler";
import { invalidateCatalog } from "@/server/cached";
import { syncGraphNow } from "@/server/services/admin";
import { unlinkMethod } from "@/server/services/catalog";

export const DELETE = route("DELETE /papers/{id}/methods/{methodId}", async ({ db, params }) => {
  if (!(await unlinkMethod(db, idFrom(params), idFrom(params, "methodId")))) notFound("Method link");
  await syncGraphNow().catch(() => undefined);
  invalidateCatalog();
  return null;
});
