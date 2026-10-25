import { route } from "@/server/api/handler";
import { integrityOverview } from "@/server/services/catalog";

export const GET = route("GET /integrity", async ({ db }) => integrityOverview(db));
