import { route } from "@/server/api/handler";
import { graphDriver } from "@/server/graph/driver";
import { addStep, reorderSteps } from "@/server/graph/trails";

export const POST = route("POST /trails/{id}/steps", async ({ params, body, actor }) => ({
  position: await addStep(graphDriver(), params.id, body.paper_id, body.annotation ?? null, actor()),
}));

export const PUT = route("PUT /trails/{id}/steps", async ({ params, body, actor }) => {
  await reorderSteps(graphDriver(), params.id, body.order, actor());
  return { reordered: body.order.length };
});
