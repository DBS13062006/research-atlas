import { idFrom, notFound, route } from "@/server/api/handler";
import { addToCollection, getCollection } from "@/server/services/library";

export const POST = route("POST /collections/{id}/papers", async ({ db, params, body }) => {
  const id = idFrom(params);
  if (!(await getCollection(db, id))) notFound("Collection");
  await addToCollection(db, id, body.paper_id, body.priority);
  return { collection_id: id, paper_id: body.paper_id };
});
