import { route } from "@/server/api/handler";
import { syncGraphNow } from "@/server/services/admin";

export const POST = route("POST /admin/graph-sync", async () => syncGraphNow());
