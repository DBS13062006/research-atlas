import { route } from "@/server/api/handler";
import { listUsers } from "@/server/services/admin";

export const GET = route("GET /admin/users", async ({ db }) => ({ items: await listUsers(db) }));
