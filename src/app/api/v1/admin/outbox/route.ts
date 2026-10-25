import { route } from "@/server/api/handler";
import { outboxHealth } from "@/server/services/admin";

export const GET = route("GET /admin/outbox", async ({ db }) => outboxHealth(db));
