import { route } from "@/server/api/handler";
import { invalidateSession, SESSION_COOKIE } from "@/server/auth/session";

export const POST = route("POST /auth/logout", async ({ req, query, setCookie }) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ended = token ? await invalidateSession(token, query.everywhere === "true") : 0;
  setCookie(SESSION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
  return Response.json({ sessions_ended: ended });
});
