import { route } from "@/server/api/handler";
import { searchAuthors } from "@/server/services/catalog";

export const GET = route("GET /authors", async ({ db, query }) => ({
  items: await searchAuthors(db, query.q, query.limit),
}));
