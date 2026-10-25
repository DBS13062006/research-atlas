import { route } from "@/server/api/handler";
import { topicTree } from "@/server/services/catalog";

export const GET = route("GET /topics", async ({ db }) => ({ items: await topicTree(db) }));
