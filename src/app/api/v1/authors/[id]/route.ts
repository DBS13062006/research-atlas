import { idFrom, notFound, route } from "@/server/api/handler";
import { getAuthor } from "@/server/services/catalog";

export const GET = route(
  "GET /authors/{id}",
  async ({ db, params }) => (await getAuthor(db, idFrom(params))) ?? notFound("Author"),
);
