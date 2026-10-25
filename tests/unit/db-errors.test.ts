import { describe, expect, it } from "vitest";
import { problemFromDbError } from "@/server/db/errors";

const pg = (code: string, constraint?: string, message = "db error") =>
  Object.assign(new Error(message), { code, constraint_name: constraint });

describe("SQLSTATE to HTTP mapping", () => {
  it.each([
    ["23505", 409],
    ["23001", 409],
    ["23503", 422],
    ["23514", 422],
    ["42501", 403],
    ["P0001", 400],
    ["RA001", 409],
    ["RA002", 409],
  ])("maps %s to %i", (code, status) => {
    expect(problemFromDbError(pg(code))?.status).toBe(status);
  });

  it("names the violated constraint in plain words", () => {
    const p = problemFromDbError(pg("23514", "chk_no_self_citation"));
    expect(p).toMatchObject({
      status: 422,
      constraint: "chk_no_self_citation",
      detail: "A paper cannot cite itself.",
      sqlstate: "23514",
    });
  });

  it("explains permission errors without leaking the SQL", () => {
    expect(problemFromDbError(pg("42501", undefined, "permission denied for table retraction"))?.detail).toBe(
      "Your role does not have permission for this action.",
    );
  });

  it("ignores errors that are not from PostgreSQL", () => {
    expect(problemFromDbError(new Error("boom"))).toBeNull();
    expect(problemFromDbError(pg("XX000"))).toBeNull();
  });
});
