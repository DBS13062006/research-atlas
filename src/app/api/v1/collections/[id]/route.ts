import { idFrom, notFound, route } from "@/server/api/handler";
import { deleteCollection, getCollection, updateCollection } from "@/server/services/library";

export const GET = route(
  "GET /collections/{id}",
  async ({ db, params }) => (await getCollection(db, idFrom(params))) ?? notFound("Collection"),
);

export const PATCH = route("PATCH /collections/{id}", async ({ db, params, body }) => {
  const id = idFrom(params);
  if (!(await updateCollection(db, id, body))) notFound("Collection");
  return getCollection(db, id);
});

export const DELETE = route("DELETE /collections/{id}", async ({ db, params }) => {
  if (!(await deleteCollection(db, idFrom(params)))) notFound("Collection");
  return null;
});
