import "server-only";

import { connection, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import { atLeast } from "@/lib/roles";
import { AuthError, dbContext, graphActor, roleOf } from "@/server/auth/dal";
import {
  SESSION_COOKIE,
  type SessionUser,
  sessionCookieOptions,
  validateSessionToken,
} from "@/server/auth/session";
import type { DbContext } from "@/server/db/client";
import { type Problem, problemFromDbError } from "@/server/db/errors";
import type { GraphActor } from "@/server/graph/errors";
import { API, type EndpointKey } from "./registry";

// Wraps every /api/v1 route handler: same-origin check on writes, session lookup, the role gate from
// the registry, Zod validation of query and body, and errors as RFC 9457 problem+json.

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Entry<K extends EndpointKey> = (typeof API)[K];
type QueryOf<K extends EndpointKey> =
  Entry<K> extends { query: infer Q extends z.ZodType } ? z.infer<Q> : undefined;
type BodyOf<K extends EndpointKey> =
  Entry<K> extends { body: infer B extends z.ZodType } ? z.infer<B> : undefined;

export type ApiContext<K extends EndpointKey> = {
  req: NextRequest;
  user: SessionUser | null;
  db: DbContext;
  params: Record<string, string>;
  query: QueryOf<K>;
  body: BodyOf<K>;
  actor: () => GraphActor;
  setCookie: (name: string, value: string, options: Record<string, unknown>) => void;
};

export function problem(p: Problem, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(p), {
    status: p.status,
    headers: { "Content-Type": "application/problem+json", ...headers },
  });
}

const TITLES: Record<number, string> = {
  400: "Bad request",
  401: "Sign in required",
  403: "Not allowed",
  404: "Not found",
  409: "Conflict",
  422: "Invalid input",
  502: "Upstream error",
  503: "Service unavailable",
};

export function route<K extends EndpointKey>(key: K, fn: (ctx: ApiContext<K>) => Promise<unknown>) {
  const entry = API[key] as Entry<K> & { query?: z.ZodType; body?: z.ZodType };
  const method = key.split(" ")[0];
  return async (
    req: NextRequest,
    segment: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    // API responses depend on the session cookie, so they are never prerendered at build time.
    // Outside the try: during a build prerender this rejects on purpose and Next handles it.
    await connection();
    const cookiesToSet: [string, string, Record<string, unknown>][] = [];
    try {
      if (!["GET", "HEAD"].includes(method)) {
        const origin = req.headers.get("origin");
        if (origin && new URL(origin).host !== req.headers.get("host")) {
          throw new HttpError(403, "Cross-site requests are not accepted.");
        }
      }
      let user: SessionUser | null = null;
      const token = req.cookies.get(SESSION_COOKIE)?.value;
      if (token) {
        const session = await validateSessionToken(token);
        user = session?.user ?? null;
        if (session?.renewedUntil)
          cookiesToSet.push([SESSION_COOKIE, token, sessionCookieOptions(session.renewedUntil)]);
      }
      if (!atLeast(roleOf(user), entry.minRole)) {
        throw new AuthError(
          user ? 403 : 401,
          user ? `This needs the ${entry.minRole.toLowerCase()} role.` : "Sign in to continue.",
        );
      }
      const query = entry.query ? entry.query.parse(Object.fromEntries(req.nextUrl.searchParams)) : undefined;
      let body: unknown;
      if (entry.body) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          throw new HttpError(400, "The request body must be JSON.");
        }
        body = entry.body.parse(raw);
      }
      const ctx: ApiContext<K> = {
        req,
        user,
        db: dbContext(user),
        params: await segment.params,
        query: query as QueryOf<K>,
        body: body as BodyOf<K>,
        actor: () => {
          if (!user) throw new AuthError(401, "Sign in to continue.");
          return graphActor(user);
        },
        setCookie: (name, value, options) => cookiesToSet.push([name, value, options]),
      };
      const result = await fn(ctx);
      const response =
        result instanceof Response
          ? result
          : result === null || result === undefined
            ? new Response(null, { status: 204 })
            : Response.json(result, { status: method === "POST" ? 201 : 200 });
      return withCookies(response, cookiesToSet);
    } catch (err) {
      return withCookies(toProblem(err), cookiesToSet);
    }
  };
}

function withCookies(res: Response, cookies: [string, string, Record<string, unknown>][]): Response {
  for (const [name, value, o] of cookies) {
    const parts = [`${name}=${value}`, `Path=${o.path ?? "/"}`];
    if (o.expires instanceof Date) parts.push(`Expires=${o.expires.toUTCString()}`);
    if (o.maxAge !== undefined) parts.push(`Max-Age=${o.maxAge}`);
    if (o.httpOnly) parts.push("HttpOnly");
    if (o.secure) parts.push("Secure");
    if (o.sameSite)
      parts.push(`SameSite=${String(o.sameSite).charAt(0).toUpperCase()}${String(o.sameSite).slice(1)}`);
    res.headers.append("Set-Cookie", parts.join("; "));
  }
  return res;
}

export function toProblem(err: unknown): Response {
  if (err instanceof ZodError) {
    return problem({
      type: "https://research-atlas.test/problems/validation",
      title: TITLES[422],
      status: 422,
      detail: err.issues[0]?.message ?? "Invalid input",
      errors: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const status = (err as { status?: unknown })?.status;
  if (err instanceof Error && typeof status === "number" && status >= 400 && status < 600) {
    return problem({
      type: `https://research-atlas.test/problems/http-${status}`,
      title: TITLES[status] ?? "Error",
      status,
      detail: err.message,
    });
  }
  const db = problemFromDbError(err);
  if (db) return problem(db);
  console.error(err);
  return problem({
    type: "about:blank",
    title: "Internal error",
    status: 500,
    detail: "Something went wrong on our side.",
  });
}

export function notFound(what: string): never {
  throw new HttpError(404, `${what} not found.`);
}

export function idFrom(params: Record<string, string>, name = "id"): number {
  const n = Number(params[name]);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(404, "Not found.");
  return n;
}
