import { idFrom, notFound, route } from "@/server/api/handler";
import { neighbourhood } from "@/server/services/graph-views";
import { getPaperCards } from "@/server/services/papers";

export const GET = route("GET /papers/{id}/neighbourhood", async ({ db, params }) => {
  const id = idFrom(params);
  if ((await getPaperCards(db, [id])).size === 0) notFound("Paper");
  return neighbourhood(id);
});
