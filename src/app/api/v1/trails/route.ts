import { route } from "@/server/api/handler";
import { graphDriver } from "@/server/graph/driver";
import { createTrail, listTrails } from "@/server/graph/trails";

export const GET = route("GET /trails", async ({ user }) => ({
  items: await listTrails(graphDriver(), user?.userId ?? null),
}));
export const POST = route("POST /trails", async ({ body, actor }) => ({
  trail_id: await createTrail(graphDriver(), body, actor()),
}));
