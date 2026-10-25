import { route } from "@/server/api/handler";
import { labCatalog } from "@/server/services/lab";

export const GET = route("GET /lab/catalog", async () => ({
  items: labCatalog().map(({ body, ...entry }) => ({ ...entry, source: body })),
}));
