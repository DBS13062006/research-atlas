import { route } from "@/server/api/handler";
import { listDatasets } from "@/server/services/catalog";

export const GET = route("GET /datasets", async ({ db }) => ({ items: await listDatasets(db) }));
