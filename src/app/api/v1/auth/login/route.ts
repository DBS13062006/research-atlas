import { HttpError, route } from "@/server/api/handler";
import { LoginError, logIn } from "@/server/auth/service";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

export const POST = route("POST /auth/login", async ({ body, req, setCookie }) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  try {
    const { userId, token, expiresAt } = await logIn(
      body.email,
      body.password,
      ip,
      req.headers.get("user-agent"),
    );
    setCookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return Response.json({ user_id: userId, expires_at: expiresAt.toISOString() });
  } catch (err) {
    if (err instanceof LoginError) throw new HttpError(401, err.message);
    throw err;
  }
});
