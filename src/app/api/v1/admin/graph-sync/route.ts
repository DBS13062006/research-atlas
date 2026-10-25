import { route } from "@/server/api/handler";
import { invalidateCatalog } from "@/server/cached";
import { syncGraphNow } from "@/server/services/admin";

export const POST = route("POST /admin/graph-sync", async () => {
  const result = await syncGraphNow();
  invalidateCatalog();
  return result;
});
