import { route } from "@/server/api/handler";
import { checkMyLibrary } from "@/server/services/catalog";

export const GET = route("GET /integrity/my-library", async ({ db }) => ({
  items: await checkMyLibrary(db),
}));
