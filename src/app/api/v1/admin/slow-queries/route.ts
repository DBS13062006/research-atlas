import { route } from "@/server/api/handler";
import { slowQueries } from "@/server/services/admin";

export const GET = route("GET /admin/slow-queries", async ({ db }) => ({ items: await slowQueries(db) }));
