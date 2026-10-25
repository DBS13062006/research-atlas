import { route } from "@/server/api/handler";
import { graphDriver } from "@/server/graph/driver";
import { recentRelations } from "@/server/graph/relations";

export const GET = route("GET /relations", async () => ({ items: await recentRelations(graphDriver(), 50) }));
