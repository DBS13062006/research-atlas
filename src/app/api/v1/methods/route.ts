import { route } from "@/server/api/handler";
import { listMethods } from "@/server/services/catalog";

export const GET = route("GET /methods", async ({ db }) => ({ items: await listMethods(db) }));
