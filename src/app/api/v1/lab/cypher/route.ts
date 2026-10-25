import { HttpError, notFound, route } from "@/server/api/handler";
import { LabInputError, runCypher } from "@/server/services/lab";

export const POST = route("POST /lab/cypher", async ({ body }) => {
  try {
    const run = await runCypher(body);
    return run ? Response.json(run) : notFound("catalog file");
  } catch (err) {
    if (err instanceof LabInputError) throw new HttpError(422, err.message);
    throw err;
  }
});
