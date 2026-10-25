import { notFound, route } from "@/server/api/handler";
import { graphDriver } from "@/server/graph/driver";
import { deleteRelation, getRelation, updateRelation } from "@/server/graph/relations";

export const GET = route(
  "GET /relations/{id}",
  async ({ params }) => (await getRelation(graphDriver(), params.id)) ?? notFound("Relation"),
);

export const PATCH = route("PATCH /relations/{id}", async ({ params, body, actor }) =>
  updateRelation(graphDriver(), params.id, body, actor()),
);

export const DELETE = route("DELETE /relations/{id}", async ({ params, actor }) => {
  await deleteRelation(graphDriver(), params.id, actor());
  return null;
});
