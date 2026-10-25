import { route } from "@/server/api/handler";
import { auditLog } from "@/server/services/admin";

export const GET = route("GET /admin/audit", async ({ db, query }) => ({
  items: await auditLog(db, query.table, query.limit),
}));
