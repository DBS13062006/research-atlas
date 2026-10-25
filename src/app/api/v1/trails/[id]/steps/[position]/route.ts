import { idFrom, route } from "@/server/api/handler";
import { graphDriver } from "@/server/graph/driver";
import { annotateStep, removeStep } from "@/server/graph/trails";

export const PATCH = route("PATCH /trails/{id}/steps/{position}", async ({ params, body, actor }) => {
  await annotateStep(graphDriver(), params.id, idFrom(params, "position"), body.annotation, actor());
  return { position: idFrom(params, "position") };
});

export const DELETE = route("DELETE /trails/{id}/steps/{position}", async ({ params, actor }) => {
  await removeStep(graphDriver(), params.id, idFrom(params, "position"), actor());
  return null;
});
