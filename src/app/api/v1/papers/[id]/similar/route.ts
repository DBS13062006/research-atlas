import { idFrom, notFound, route } from "@/server/api/handler";
import { similarPapers } from "@/server/services/graph-views";
import { getPaperCards } from "@/server/services/papers";

export const GET = route("GET /papers/{id}/similar", async ({ db, params }) => {
  const id = idFrom(params);
  if ((await getPaperCards(db, [id])).size === 0) notFound("Paper");
  return { items: await similarPapers(id) };
});
