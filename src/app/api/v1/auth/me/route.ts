import { route } from "@/server/api/handler";

export const GET = route("GET /auth/me", async ({ user }) => user);
