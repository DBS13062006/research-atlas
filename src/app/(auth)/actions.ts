"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { loginSchema, signUpSchema } from "@/lib/schemas";
import { LoginError, logIn, signUp } from "@/server/auth/service";
import { invalidateSession, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";
import { isPgError } from "@/server/db/errors";

export type AuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

// Only same-site relative paths are followed after sign-in.
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/library";
}

async function clientInfo() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: h.get("user-agent") };
}

export async function loginAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const values = { email: String(form.get("email") ?? "") };
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) {
    return {
      values,
      fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
    };
  }
  const { ip, userAgent } = await clientInfo();
  try {
    const { token, expiresAt } = await logIn(parsed.data.email, parsed.data.password, ip, userAgent);
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  } catch (err) {
    if (err instanceof LoginError) return { values, error: err.message };
    throw err;
  }
  redirect(safeNext(form.get("next")));
}

export async function signupAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const values = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  const parsed = signUpSchema.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) {
    return {
      values,
      fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
    };
  }
  const { ip, userAgent } = await clientInfo();
  try {
    const { token, expiresAt } = await signUp(parsed.data, ip, userAgent);
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  } catch (err) {
    if (isPgError(err) && err.code === "RA001")
      return { values, fieldErrors: { email: "An account with this email already exists." } };
    throw err;
  }
  redirect("/library");
}

export async function logoutAction(form: FormData) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(token, form.get("everywhere") === "true");
  jar.delete(SESSION_COOKIE);
  redirect("/");
}
