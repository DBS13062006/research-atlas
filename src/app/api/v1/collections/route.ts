import { route } from "@/server/api/handler";
import { createCollection, myCollections } from "@/server/services/library";

export const GET = route("GET /collections", async ({ db }) => ({ items: await myCollections(db) }));
export const POST = route("POST /collections", async ({ db, body }) => ({
  collection_id: await createCollection(db, body),
}));
