import { idFrom, notFound, route } from "@/server/api/handler";
import { invalidateCatalog } from "@/server/cached";
import { syncGraphNow } from "@/server/services/admin";
import { deletePaper, getPaper, updatePaper } from "@/server/services/papers";

export const GET = route(
  "GET /papers/{id}",
  async ({ db, params }) => (await getPaper(db, idFrom(params))) ?? notFound("Paper"),
);

export const PATCH = route("PATCH /papers/{id}", async ({ db, params, body }) => {
  const id = idFrom(params);
  if (!(await updatePaper(db, id, body))) notFound("Paper");
  await syncGraphNow().catch(() => undefined);
  invalidateCatalog();
  return getPaper(db, id);
});

export const DELETE = route("DELETE /papers/{id}", async ({ db, params }) => {
  if (!(await deletePaper(db, idFrom(params)))) notFound("Paper");
  await syncGraphNow().catch(() => undefined);
  invalidateCatalog();
  return null;
});
