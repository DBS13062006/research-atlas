import { route } from "@/server/api/handler";
import { importByDoi } from "@/server/services/import";

export const POST = route("POST /import/doi", async ({ db, body }) => importByDoi(db, body.doi));
