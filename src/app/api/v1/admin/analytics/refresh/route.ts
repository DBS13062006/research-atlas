import { route } from "@/server/api/handler";
import { invalidateCatalog } from "@/server/cached";
import { refreshAnalytics } from "@/server/services/admin";

export const POST = route("POST /admin/analytics/refresh", async ({ db }) => {
  const result = await refreshAnalytics(db);
  invalidateCatalog();
  return result;
});
