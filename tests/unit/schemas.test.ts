import { describe, expect, it } from "vitest";
import { parseCatalogFile, splitSqlStatements } from "@/lib/query-catalog";
import { importDoi, paperCreate, searchQuery, signUpSchema, trailReorder } from "@/lib/schemas";

describe("zod schemas", () => {
  it("normalises a DOI URL for import", () => {
    expect(importDoi.parse({ doi: "https://doi.org/10.48550/arXiv.1706.03762" }).doi).toBe(
      "10.48550/arxiv.1706.03762",
    );
    expect(() => importDoi.parse({ doi: "hello" })).toThrow();
  });

  it("rejects a DOI with a URL prefix on create", () => {
    expect(paperCreate.safeParse({ title: "x", doi: "https://doi.org/10.1/x" }).success).toBe(false);
    expect(paperCreate.parse({ title: "x" }).work_type).toBe("ARTICLE");
  });

  it("requires a strong enough password and a real email on sign-up", () => {
    expect(signUpSchema.safeParse({ name: "A", email: "a@b.co", password: "short" }).success).toBe(false);
    expect(signUpSchema.safeParse({ name: "A", email: "nope", password: "long enough pass" }).success).toBe(
      false,
    );
    expect(signUpSchema.safeParse({ name: "A", email: "a@b.co", password: "long enough pass" }).success).toBe(
      true,
    );
  });

  it("defaults search to hybrid and bounds the limit", () => {
    expect(searchQuery.parse({ q: "graphs" })).toMatchObject({ mode: "hybrid", limit: 20 });
    expect(searchQuery.safeParse({ q: "graphs", limit: "500" }).success).toBe(false);
  });

  it("only accepts positive positions for a trail reorder", () => {
    expect(trailReorder.safeParse({ order: [0, 1] }).success).toBe(false);
  });
});

describe("query catalog parser", () => {
  it("reads headers and parameters", () => {
    const e = parseCatalogFile(
      "Q99.sql",
      "-- @id Q99\n-- @title T\n-- @category join\n-- @role ra_anon\n-- @param paper_id bigint = SELECT 1\nSELECT $1;",
    );
    expect(e).toMatchObject({
      id: "Q99",
      role: "ra_anon",
      params: [{ name: "paper_id", type: "bigint", defaultSql: "SELECT 1" }],
    });
  });

  it("refuses a role outside the allow-list", () => {
    expect(() =>
      parseCatalogFile("x.sql", "-- @id X\n-- @title T\n-- @category c\n-- @role postgres\nSELECT 1"),
    ).toThrow();
  });

  it("splits statements but not inside strings, dollar quotes or comments", () => {
    const parts = splitSqlStatements("SELECT ';'; -- a; comment\nDO $$ BEGIN PERFORM 1; END $$; SELECT 2;");
    expect(parts).toHaveLength(3);
    expect(parts[1]).toContain("PERFORM 1;");
  });
});
