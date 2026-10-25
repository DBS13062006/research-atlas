import { HttpError, notFound, route } from "@/server/api/handler";
import { invalidateCatalog } from "@/server/cached";
import { syncGraphNow } from "@/server/services/admin";
import { LabInputError, runSql } from "@/server/services/lab";

export const POST = route("POST /lab/run", async ({ user, body }) => {
  if (!user) throw new HttpError(401, "Sign in to continue.");
  if (body.commit && user.role !== "ADMIN")
    throw new HttpError(403, "Only administrators can commit lab runs.");
  try {
    const run = await runSql(user, body);
    if (!run) return notFound("catalog file");
    if (run.committed) {
      await syncGraphNow();
      invalidateCatalog();
    }
    // A lab run creates nothing, so it answers 200 rather than the default 201 for POST.
    return Response.json(run);
  } catch (err) {
    if (err instanceof LabInputError) throw new HttpError(422, err.message);
    throw err;
  }
});
