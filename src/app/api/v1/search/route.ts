import { route } from "@/server/api/handler";
import { search } from "@/server/services/search";

export const GET = route("GET /search", async ({ db, query }) => search(db, query));
