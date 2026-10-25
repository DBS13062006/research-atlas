import { route } from "@/server/api/handler";
import { graphDriver } from "@/server/graph/driver";
import { deleteTrail, getTrail, updateTrail } from "@/server/graph/trails";

export const GET = route("GET /trails/{id}", async ({ params, user }) =>
  getTrail(graphDriver(), params.id, { userId: user?.userId ?? null, isAdmin: user?.role === "ADMIN" }),
);

export const PATCH = route("PATCH /trails/{id}", async ({ params, body, actor, user }) => {
  await updateTrail(graphDriver(), params.id, body, actor());
  return getTrail(graphDriver(), params.id, {
    userId: user?.userId ?? null,
    isAdmin: user?.role === "ADMIN",
  });
});

export const DELETE = route("DELETE /trails/{id}", async ({ params, actor }) => {
  await deleteTrail(graphDriver(), params.id, actor());
  return null;
});
