// Role matrix: every /api/v1 endpoint called as anonymous, researcher, curator and admin. Roles below
// the endpoint's minimum must get 401 (anonymous) or 403; roles at or above it must get past the gate
// (the samples target missing resources or invalid bodies, so nothing real changes). Also proves the
// login lockout, the session cookie flags, and that /api/docs is served.
import { NextRequest } from "next/server";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { atLeast, type RoleCode } from "@/lib/roles";
import { API, type Endpoint, type EndpointKey } from "@/server/api/registry";
import { logIn, signUp } from "@/server/auth/service";
import { invalidateSession } from "@/server/auth/session";
import { env } from "@/server/env";

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const BASE = "http://localhost:3000";
const DEMO: Record<Exclude<RoleCode, "ANONYMOUS">, string> = {
  RESEARCHER: "rhea@research-atlas.test",
  CURATOR: "curator@research-atlas.test",
  ADMIN: "admin@research-atlas.test",
};
const tokens: Partial<Record<RoleCode, string>> = {};
const ROUTE_MODULES = import.meta.glob("/src/app/api/v1/**/route.ts");

async function handlerFor(
  key: EndpointKey,
): Promise<{ handler: Handler; params: (path: string) => Record<string, string> }> {
  const [method, template] = key.split(" ");
  const dir = template.replace(/\{(\w+)\}/g, "[$1]");
  const load = ROUTE_MODULES[`/src/app/api/v1${dir}/route.ts`];
  if (!load) throw new Error(`no route module for ${key}`);
  const mod = (await load()) as Record<string, Handler>;
  const names = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const pattern = new RegExp(`^${template.replace(/\{\w+\}/g, "([^/?]+)")}(?:\\?|$)`);
  return {
    handler: mod[method],
    params: (path) => {
      const m = path.match(pattern);
      return Object.fromEntries(names.map((n, i) => [n, m?.[i + 1] ?? ""]));
    },
  };
}

function request(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = { origin: BASE, host: "localhost:3000" };
  if (token) headers.cookie = `ra_session=${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`${BASE}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeAll(async () => {
  const password = env().SEED_PASSWORD;
  if (!password) throw new Error("SEED_PASSWORD must be set (pnpm seed:demo)");
  for (const [role, email] of Object.entries(DEMO)) {
    tokens[role as RoleCode] = (await logIn(email, password, "127.0.0.1", "vitest")).token;
  }
});

afterAll(async () => {
  for (const t of Object.values(tokens)) if (t) await invalidateSession(t);
});

describe("role matrix", () => {
  const roles: RoleCode[] = ["ANONYMOUS", "RESEARCHER", "CURATOR", "ADMIN"];
  for (const key of Object.keys(API) as EndpointKey[]) {
    const e = API[key] as Endpoint;
    for (const role of roles) {
      const allowed = atLeast(role, e.minRole);
      const expectation = allowed ? "passes the gate" : role === "ANONYMOUS" ? "401" : "403";
      it(`${key} as ${role.toLowerCase()} → ${expectation}`, async () => {
        const { handler, params } = await handlerFor(key);
        const method = key.split(" ")[0];
        const res = await handler(request(method, e.sample.path, tokens[role], e.sample.body), {
          params: Promise.resolve(params(e.sample.path)),
        });
        if (allowed) {
          expect([401, 403, 500]).not.toContain(res.status);
        } else {
          expect(res.status).toBe(role === "ANONYMOUS" ? 401 : 403);
          expect(res.headers.get("content-type")).toBe("application/problem+json");
        }
      });
    }
  }
});

describe("authentication", () => {
  const email = `lockout-${Date.now()}@research-atlas.test`;
  const owner = postgres(`${env().DATABASE_OWNER_URL}?sslmode=disable`, { max: 1, onnotice: () => {} });

  afterAll(async () => {
    await owner`DELETE FROM user_account WHERE email = ${email}`;
    await owner.end();
  });

  it("locks an account after five failed logins, even for the right password", async () => {
    const { token } = await signUp(
      { name: "Lockout Test", email, password: "the right password" },
      null,
      "vitest",
    );
    await invalidateSession(token);
    const login = (await import("@/app/api/v1/auth/login/route")).POST as Handler;
    const attempt = (password: string) =>
      login(request("POST", "/auth/login", undefined, { email, password }), { params: Promise.resolve({}) });
    for (let i = 1; i <= 4; i++) {
      const res = await attempt("wrong password");
      expect(res.status).toBe(401);
      expect((await res.json()).detail).toBe("Email or password is incorrect.");
    }
    const fifth = await attempt("wrong password");
    expect(fifth.status).toBe(401);
    expect((await fifth.json()).detail).toMatch(/^Too many failed attempts/);
    const correct = await attempt("the right password");
    expect(correct.status).toBe(401);
    expect((await correct.json()).detail).toMatch(/^Too many failed attempts/);
    const [row] = await owner<{ failed_login_count: number; locked: boolean }[]>`
      SELECT failed_login_count, locked_until > now() + INTERVAL '14 minutes' AS locked FROM user_account WHERE email = ${email}`;
    expect(row).toEqual({ failed_login_count: 5, locked: true });
  });

  it("sets the session cookie HttpOnly, SameSite=Lax, path-wide, with a 30-day expiry", async () => {
    const login = (await import("@/app/api/v1/auth/login/route")).POST as Handler;
    const res = await login(
      request("POST", "/auth/login", undefined, { email: DEMO.RESEARCHER, password: env().SEED_PASSWORD }),
      {
        params: Promise.resolve({}),
      },
    );
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^ra_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie.includes("Secure")).toBe(env().SESSION_COOKIE_SECURE);
    const expires = new Date(cookie.match(/Expires=([^;]+)/)?.[1] ?? "");
    expect(Math.round((expires.getTime() - Date.now()) / 86_400_000)).toBe(30);
    await invalidateSession(cookie.match(/^ra_session=([^;]+)/)?.[1] ?? "");
  });

  it("rejects a write from another origin", async () => {
    const post = (await import("@/app/api/v1/collections/route")).POST as Handler;
    const req = new NextRequest(`${BASE}/api/v1/collections`, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        host: "localhost:3000",
        cookie: `ra_session=${tokens.RESEARCHER}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "csrf" }),
    });
    expect((await post(req, { params: Promise.resolve({}) })).status).toBe(403);
  });
});

describe("API reference", () => {
  it("serves /api/docs and a valid OpenAPI document", async () => {
    const docs = (await import("@/app/api/docs/route")).GET as unknown as (req: Request) => Promise<Response>;
    expect((await docs(new Request(`${BASE}/api/docs`))).status).toBe(200);
    const spec = (await import("@/app/api/v1/openapi.json/route")).GET as () => Promise<Response>;
    const doc = await (await spec()).json();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths).length).toBeGreaterThan(30);
  });
});
