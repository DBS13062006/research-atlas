import { idFrom, notFound, route } from "@/server/api/handler";
import { updateUser } from "@/server/services/admin";

export const PATCH = route(
  "PATCH /admin/users/{id}",
  async ({ db, params, body }) => (await updateUser(db, idFrom(params), body)) ?? notFound("User"),
);
