// Application roles, their rank on the privilege ladder and the PostgreSQL role each maps to.
// Mirrors the `role` table (seeded in 900_reference_seed.sql); used by UI gating and the API.
import type { DbRole } from "./query-catalog";

export type RoleCode = "ANONYMOUS" | "RESEARCHER" | "CURATOR" | "ADMIN";

export const ROLE_RANK: Record<RoleCode, number> = { ANONYMOUS: 0, RESEARCHER: 1, CURATOR: 2, ADMIN: 3 };

export const DB_ROLE: Record<RoleCode, DbRole> = {
  ANONYMOUS: "ra_anon",
  RESEARCHER: "ra_researcher",
  CURATOR: "ra_curator",
  ADMIN: "ra_admin",
};

export const ROLE_LABEL: Record<RoleCode, string> = {
  ANONYMOUS: "Visitor",
  RESEARCHER: "Researcher",
  CURATOR: "Curator",
  ADMIN: "Administrator",
};

export function atLeast(role: RoleCode, minimum: RoleCode): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

// Permission codes per role, matching role_permission. The database remains the authority; this
// copy only decides what the UI shows.
const RESEARCHER_PERMS = [
  "papers:read",
  "collections:own",
  "notes:own",
  "trails:own",
  "relations:write",
  "lab:run",
];
const CURATOR_PERMS = [
  ...RESEARCHER_PERMS,
  "papers:write",
  "catalog:write",
  "import:run",
  "relations:moderate",
];
const ADMIN_PERMS = [
  ...CURATOR_PERMS,
  "papers:delete",
  "retractions:manage",
  "users:manage",
  "audit:read",
  "graph:sync",
  "lab:dml",
];

export const ROLE_PERMISSIONS: Record<RoleCode, readonly string[]> = {
  ANONYMOUS: ["papers:read"],
  RESEARCHER: RESEARCHER_PERMS,
  CURATOR: CURATOR_PERMS,
  ADMIN: ADMIN_PERMS,
};

export function can(role: RoleCode, permission: string): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
