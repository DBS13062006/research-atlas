import { idFrom, notFound, route } from "@/server/api/handler";
import { lineage } from "@/server/services/graph-views";
import { getPaperCards } from "@/server/services/papers";

export const GET = route("GET /papers/{id}/lineage", async ({ db, params, query }) => {
  const id = idFrom(params);
  if ((await getPaperCards(db, [id])).size === 0) notFound("Paper");
  return lineage(db, id, query);
});
