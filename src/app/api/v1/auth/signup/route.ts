import { route } from "@/server/api/handler";
import { signUp } from "@/server/auth/service";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

export const POST = route("POST /auth/signup", async ({ body, req, setCookie }) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const { userId, token, expiresAt } = await signUp(body, ip, req.headers.get("user-agent"));
  setCookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return { user_id: userId };
});
