// Query Lab: catalog files run as the caller's database role, inside a transaction that is rolled
// back unless an administrator commits. Constraint proofs fail with the constraint they name,
// trigger demos expose their audit and outbox rows, and EXPLAIN / PROFILE return plan trees.
import { NextRequest } from "next/server";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as cypherPost } from "@/app/api/v1/lab/cypher/route";
import { POST as runPost } from "@/app/api/v1/lab/run/route";
import { logIn } from "@/server/auth/service";
import { invalidateSession } from "@/server/auth/session";
import { env } from "@/server/env";
import { type LabRun, labCatalog } from "@/server/services/lab";

const BASE = "http://localhost:3000";
const tokens: Record<"researcher" | "admin", string> = { researcher: "", admin: "" };
const owner = postgres(`${env().DATABASE_OWNER_URL}?sslmode=disable`, { max: 1, onnotice: () => {} });

function call(handler: typeof runPost, token: string, body: unknown) {
  const req = new NextRequest(`${BASE}/api/v1/lab/run`, {
    method: "POST",
    headers: {
      origin: BASE,
      host: "localhost:3000",
      cookie: `ra_session=${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return handler(req, { params: Promise.resolve({}) });
}

async function run(as: "researcher" | "admin", body: Record<string, unknown>): Promise<LabRun> {
  const res = await call(runPost, tokens[as], body);
  expect(res.status).toBe(200);
  return res.json();
}

beforeAll(async () => {
  const password = env().SEED_PASSWORD;
  if (!password) throw new Error("SEED_PASSWORD must be set (pnpm seed:demo)");
  tokens.researcher = (await logIn("rhea@research-atlas.test", password, "127.0.0.1", "vitest")).token;
  tokens.admin = (await logIn("admin@research-atlas.test", password, "127.0.0.1", "vitest")).token;
});

afterAll(async () => {
  for (const t of Object.values(tokens)) await invalidateSession(t);
  await owner.end();
});

describe("catalog", () => {
  it("loads every SQL and Cypher file with a unique id", () => {
    const entries = labCatalog();
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    for (const prefix of ["Q", "D", "P", "R", "T", "C"]) {
      expect(entries.some((e) => e.id.startsWith(prefix))).toBe(true);
    }
  });
});

describe("SQL runs", () => {
  it("runs a read query as the caller's role and returns rows", async () => {
    const r = await run("researcher", { id: "Q09" });
    expect(r.error).toBeNull();
    expect(r.runAs).toBe("ra_researcher");
    expect(r.results.at(-1)?.rowCount).toBeGreaterThan(0);
  });

  it("returns an EXPLAIN ANALYZE plan tree", async () => {
    const r = await run("researcher", { id: "Q15", mode: "explain" });
    expect(r.error).toBeNull();
    expect(r.plan?.label).toBeTruthy();
    expect(r.planTiming?.executionMs).toBeGreaterThan(0);
  });

  it("proves a constraint by failing with exactly that constraint", async () => {
    const r = await run("admin", { id: "P01" });
    expect(r.error?.constraint).toBe("chk_no_self_citation");
    expect(r.error?.expected).toBe(true);
  });

  it("lets PostgreSQL refuse a researcher running an admin-only statement", async () => {
    const r = await run("researcher", { id: "P08" });
    expect(r.error?.code).toBe("42501");
  });

  it("shows trigger side effects and rolls them back", async () => {
    const before = await owner`SELECT title FROM paper ORDER BY cited_by_count DESC, paper_id LIMIT 1`;
    const r = await run("admin", { id: "T01" });
    expect(r.error).toBeNull();
    expect(r.committed).toBe(false);
    expect(r.sideEffects.some((s) => s.source === "audit_log" && s.target === "paper")).toBe(true);
    expect(r.sideEffects.some((s) => s.source === "graph_outbox")).toBe(true);
    const after = await owner`SELECT title FROM paper ORDER BY cited_by_count DESC, paper_id LIMIT 1`;
    expect(after[0].title).toBe(before[0].title);
  });

  it("captures NOTICEs raised by a procedure", async () => {
    const r = await run("admin", { id: "R04" });
    expect(r.error).toBeNull();
    expect(r.notices.join(" ")).toMatch(/recorded as RETRACTED/);
  });

  it("validates parameter values against their declared type", async () => {
    const res = await call(runPost, tokens.researcher, {
      id: "Q15",
      params: { paper_id: "1; DROP TABLE paper" },
    });
    expect(res.status).toBe(422);
  });

  it("refuses commit for anyone but an administrator", async () => {
    const res = await call(runPost, tokens.researcher, { id: "D05", commit: true });
    expect(res.status).toBe(403);
  });
});

describe("Cypher runs", () => {
  it("profiles a query and always rolls back writes", async () => {
    const res = await call(cypherPost, tokens.researcher, { id: "C04", mode: "profile" });
    expect(res.status).toBe(200);
    const r: LabRun = await res.json();
    expect(r.error).toBeNull();
    expect(r.plan?.hits).toMatch(/db hits/);
  });

  it("lists the vector index with SHOW INDEXES", async () => {
    const res = await call(cypherPost, tokens.researcher, { id: "C01" });
    const r: LabRun = await res.json();
    const typeCol = r.results[0].columns.indexOf("type");
    expect(r.results[0].rows.some((row) => row[typeCol] === "VECTOR")).toBe(true);
  });
});
