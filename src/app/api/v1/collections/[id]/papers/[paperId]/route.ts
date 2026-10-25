import { idFrom, notFound, route } from "@/server/api/handler";
import { removeFromCollection, updateCollectionPaper } from "@/server/services/library";

export const PATCH = route(
  "PATCH /collections/{id}/papers/{paperId}",
  async ({ db, params, body }) =>
    (await updateCollectionPaper(db, idFrom(params), idFrom(params, "paperId"), body)) ??
    notFound("Collection entry"),
);

export const DELETE = route("DELETE /collections/{id}/papers/{paperId}", async ({ db, params }) => {
  if (!(await removeFromCollection(db, idFrom(params), idFrom(params, "paperId"))))
    notFound("Collection entry");
  return null;
});
