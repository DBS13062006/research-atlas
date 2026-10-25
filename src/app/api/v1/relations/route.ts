import { route } from "@/server/api/handler";
import { graphDriver } from "@/server/graph/driver";
import { recentRelations } from "@/server/graph/relations";
import { withNames } from "@/server/services/people";

export const GET = route("GET /relations", async () => ({
  items: await withNames(await recentRelations(graphDriver(), 50), "createdBy"),
}));
