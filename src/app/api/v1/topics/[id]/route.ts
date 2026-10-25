import { idFrom, notFound, route } from "@/server/api/handler";
import { getTopic } from "@/server/services/catalog";

export const GET = route(
  "GET /topics/{id}",
  async ({ db, params }) => (await getTopic(db, idFrom(params))) ?? notFound("Topic"),
);
