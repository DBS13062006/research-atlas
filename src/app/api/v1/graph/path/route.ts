import { route } from "@/server/api/handler";
import { shortestPath } from "@/server/services/graph-views";

export const GET = route("GET /graph/path", async ({ db, query }) => shortestPath(db, query.from, query.to));
