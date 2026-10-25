// Every /api/v1 endpoint in one table. The same entry drives request validation and the role gate
// (src/server/api/handler.ts), the OpenAPI document (/api/v1/openapi.json) and the role-matrix tests.
// Each `sample` targets a missing resource or an invalid body, so a role that passes the gate gets
// a 404/422 rather than changing real data when the tests run.
import { z } from "zod";
import type { RoleCode } from "@/lib/roles";
import {
  adminUserUpdate,
  auditQuery,
  authorMerge,
  collectionCreate,
  collectionPaperAdd,
  collectionPaperUpdate,
  collectionUpdate,
  importDoi,
  lineageQuery,
  loginSchema,
  noteCreate,
  noteUpdate,
  paperCreate,
  paperDatasetLink,
  paperListQuery,
  paperMethodLink,
  paperUpdate,
  pathQuery,
  relationCreate,
  relationUpdate,
  retractionCreate,
  searchQuery,
  signUpSchema,
  trailCreate,
  trailReorder,
  trailStepAdd,
  trailStepUpdate,
  trailUpdate,
} from "@/lib/schemas";

export type Endpoint = {
  summary: string;
  tag: string;
  minRole: RoleCode;
  query?: z.ZodType;
  body?: z.ZodType;
  sample: { path: string; body?: unknown };
  description?: string;
};

const MISSING = 999999999;
const MISSING_UUID = "00000000-0000-7000-8000-000000000000";

export const API = {
  "POST /auth/signup": {
    summary: "Create a researcher account and start a session",
    tag: "Auth",
    minRole: "ANONYMOUS",
    body: signUpSchema,
    sample: { path: "/auth/signup", body: { name: "", email: "not-an-email", password: "short" } },
  },
  "POST /auth/login": {
    summary: "Log in; sets the ra_session cookie",
    tag: "Auth",
    minRole: "ANONYMOUS",
    body: loginSchema,
    sample: { path: "/auth/login", body: { email: "nobody", password: "" } },
  },
  "POST /auth/logout": {
    summary: "End this session (everywhere=true ends every session of the user)",
    tag: "Auth",
    minRole: "RESEARCHER",
    query: z.object({ everywhere: z.enum(["true", "false"]).optional() }),
    sample: { path: "/auth/logout?everywhere=bogus" },
  },
  "GET /auth/me": {
    summary: "The signed-in user",
    tag: "Auth",
    minRole: "RESEARCHER",
    sample: { path: "/auth/me" },
  },

  "GET /papers": {
    summary: "List papers with keyset pagination on (cited_by_count, paper_id)",
    tag: "Papers",
    minRole: "ANONYMOUS",
    query: paperListQuery,
    sample: { path: "/papers?limit=2" },
  },
  "POST /papers": {
    summary: "Create a paper",
    tag: "Papers",
    minRole: "CURATOR",
    body: paperCreate,
    sample: { path: "/papers", body: { title: "" } },
  },
  "GET /papers/{id}": {
    summary: "One paper with authors, topics, methods, datasets and resources",
    tag: "Papers",
    minRole: "ANONYMOUS",
    sample: { path: `/papers/${MISSING}` },
  },
  "PATCH /papers/{id}": {
    summary: "Edit a paper",
    tag: "Papers",
    minRole: "CURATOR",
    body: paperUpdate,
    sample: { path: `/papers/${MISSING}`, body: { title: "x" } },
  },
  "DELETE /papers/{id}": {
    summary: "Delete a paper (cascades to its links)",
    tag: "Papers",
    minRole: "ADMIN",
    sample: { path: `/papers/${MISSING}` },
  },
  "POST /papers/{id}/retraction": {
    summary: "Record a retraction (sp_retract_paper)",
    tag: "Papers",
    minRole: "ADMIN",
    body: retractionCreate,
    sample: { path: `/papers/${MISSING}/retraction`, body: { retraction_date: "not-a-date" } },
  },
  "GET /papers/{id}/lineage": {
    summary: "Ancestors or descendants, computed in SQL (recursive CTE) or Cypher",
    tag: "Graph",
    minRole: "ANONYMOUS",
    query: lineageQuery,
    sample: { path: `/papers/${MISSING}/lineage?engine=sql` },
  },
  "POST /papers/{id}/methods": {
    summary: "Link a method to a paper",
    tag: "Curation",
    minRole: "CURATOR",
    body: paperMethodLink,
    sample: { path: `/papers/${MISSING}/methods`, body: { method_id: 0 } },
  },
  "DELETE /papers/{id}/methods/{methodId}": {
    summary: "Unlink a method from a paper",
    tag: "Curation",
    minRole: "CURATOR",
    sample: { path: `/papers/${MISSING}/methods/${MISSING}` },
  },
  "POST /papers/{id}/datasets": {
    summary: "Link a dataset to a paper",
    tag: "Curation",
    minRole: "CURATOR",
    body: paperDatasetLink,
    sample: { path: `/papers/${MISSING}/datasets`, body: { dataset_id: 0 } },
  },
  "DELETE /papers/{id}/datasets/{datasetId}": {
    summary: "Unlink a dataset from a paper",
    tag: "Curation",
    minRole: "CURATOR",
    sample: { path: `/papers/${MISSING}/datasets/${MISSING}` },
  },
  "GET /methods": {
    summary: "All methods with paper counts",
    tag: "Catalog",
    minRole: "ANONYMOUS",
    sample: { path: "/methods" },
  },
  "GET /datasets": {
    summary: "All datasets with paper counts",
    tag: "Catalog",
    minRole: "ANONYMOUS",
    sample: { path: "/datasets" },
  },
  "GET /relations": {
    summary: "The most recently changed curated relations",
    tag: "Relations",
    minRole: "ANONYMOUS",
    sample: { path: "/relations" },
  },
  "GET /papers/{id}/neighbourhood": {
    summary: "One-hop citation neighbourhood and curated relations, as nodes and edges",
    tag: "Graph",
    minRole: "ANONYMOUS",
    sample: { path: `/papers/${MISSING}/neighbourhood` },
  },
  "GET /papers/{id}/similar": {
    summary: "Nearest papers by embedding",
    tag: "Graph",
    minRole: "ANONYMOUS",
    sample: { path: `/papers/${MISSING}/similar` },
  },
  "GET /papers/{id}/relations": {
    summary: "Curated relations of a paper",
    tag: "Relations",
    minRole: "ANONYMOUS",
    sample: { path: `/papers/${MISSING}/relations` },
  },
  "POST /papers/{id}/relations": {
    summary: "Assert a curated relation from this paper to another",
    tag: "Relations",
    minRole: "RESEARCHER",
    body: relationCreate,
    sample: { path: `/papers/${MISSING}/relations`, body: { to_paper_id: 0, type: "LIKES" } },
  },
  "GET /relations/{id}": {
    summary: "One curated relation",
    tag: "Relations",
    minRole: "ANONYMOUS",
    sample: { path: `/relations/${MISSING_UUID}` },
  },
  "PATCH /relations/{id}": {
    summary: "Edit a curated relation (creator or curator)",
    tag: "Relations",
    minRole: "RESEARCHER",
    body: relationUpdate,
    sample: { path: `/relations/${MISSING_UUID}`, body: { confidence: 4 } },
  },
  "DELETE /relations/{id}": {
    summary: "Delete a curated relation (creator or curator)",
    tag: "Relations",
    minRole: "RESEARCHER",
    sample: { path: `/relations/${MISSING_UUID}` },
  },
  "GET /graph/path": {
    summary: "Shortest citation chain between two papers, in Cypher and SQL",
    tag: "Graph",
    minRole: "ANONYMOUS",
    query: pathQuery,
    sample: { path: `/graph/path?from=${MISSING}&to=${MISSING - 1}` },
  },
  "GET /search": {
    summary: "Lexical, semantic or hybrid (reciprocal rank fusion) search",
    tag: "Search",
    minRole: "ANONYMOUS",
    query: searchQuery,
    sample: { path: "/search?q=spiking&mode=lexical&limit=2" },
  },
  "GET /authors/{id}": {
    summary: "An author with papers, output per year and topics",
    tag: "Authors",
    minRole: "ANONYMOUS",
    sample: { path: `/authors/${MISSING}` },
  },
  "POST /authors/merge": {
    summary: "Merge a duplicate author into a canonical one (sp_merge_authors)",
    tag: "Authors",
    minRole: "ADMIN",
    body: authorMerge,
    sample: { path: "/authors/merge", body: { keep_id: MISSING, duplicate_id: MISSING - 1 } },
  },
  "GET /topics": {
    summary: "The topic tree with paper counts",
    tag: "Topics",
    minRole: "ANONYMOUS",
    sample: { path: "/topics" },
  },
  "GET /topics/{id}": {
    summary: "A topic with growth, children and top papers",
    tag: "Topics",
    minRole: "ANONYMOUS",
    sample: { path: `/topics/${MISSING}` },
  },

  "GET /collections": {
    summary: "Your collections with reading counts",
    tag: "Library",
    minRole: "RESEARCHER",
    sample: { path: "/collections" },
  },
  "POST /collections": {
    summary: "Create a collection",
    tag: "Library",
    minRole: "RESEARCHER",
    body: collectionCreate,
    sample: { path: "/collections", body: { name: "" } },
  },
  "GET /collections/{id}": {
    summary: "A collection and its papers (row-level security applies)",
    tag: "Library",
    minRole: "ANONYMOUS",
    sample: { path: `/collections/${MISSING}` },
  },
  "PATCH /collections/{id}": {
    summary: "Rename or publish a collection",
    tag: "Library",
    minRole: "RESEARCHER",
    body: collectionUpdate,
    sample: { path: `/collections/${MISSING}`, body: { name: "x" } },
  },
  "DELETE /collections/{id}": {
    summary: "Delete a collection",
    tag: "Library",
    minRole: "RESEARCHER",
    sample: { path: `/collections/${MISSING}` },
  },
  "POST /collections/{id}/papers": {
    summary: "Add a paper to a collection (sp_add_to_collection)",
    tag: "Library",
    minRole: "RESEARCHER",
    body: collectionPaperAdd,
    sample: { path: `/collections/${MISSING}/papers`, body: { paper_id: 0 } },
  },
  "PATCH /collections/{id}/papers/{paperId}": {
    summary: "Move a card: reading status, priority or position",
    tag: "Library",
    minRole: "RESEARCHER",
    body: collectionPaperUpdate,
    sample: { path: `/collections/${MISSING}/papers/${MISSING}`, body: { reading_status: "READ" } },
  },
  "DELETE /collections/{id}/papers/{paperId}": {
    summary: "Remove a paper from a collection",
    tag: "Library",
    minRole: "RESEARCHER",
    sample: { path: `/collections/${MISSING}/papers/${MISSING}` },
  },
  "GET /notes": {
    summary: "Your notes, or notes on one paper (public ones from others included)",
    tag: "Library",
    minRole: "RESEARCHER",
    query: z.object({ paper_id: z.coerce.number().int().positive().optional() }),
    sample: { path: `/notes?paper_id=${MISSING}` },
  },
  "POST /notes": {
    summary: "Write a note",
    tag: "Library",
    minRole: "RESEARCHER",
    body: noteCreate,
    sample: { path: "/notes", body: { paper_id: MISSING, text: "" } },
  },
  "PATCH /notes/{id}": {
    summary: "Edit your note",
    tag: "Library",
    minRole: "RESEARCHER",
    body: noteUpdate,
    sample: { path: `/notes/${MISSING}`, body: { text: "x" } },
  },
  "DELETE /notes/{id}": {
    summary: "Delete your note",
    tag: "Library",
    minRole: "RESEARCHER",
    sample: { path: `/notes/${MISSING}` },
  },

  "GET /trails": {
    summary: "Public trails and your own",
    tag: "Trails",
    minRole: "ANONYMOUS",
    sample: { path: "/trails" },
  },
  "POST /trails": {
    summary: "Create a reading trail",
    tag: "Trails",
    minRole: "RESEARCHER",
    body: trailCreate,
    sample: { path: "/trails", body: { title: "" } },
  },
  "GET /trails/{id}": {
    summary: "A trail with its ordered steps",
    tag: "Trails",
    minRole: "ANONYMOUS",
    sample: { path: `/trails/${MISSING_UUID}` },
  },
  "PATCH /trails/{id}": {
    summary: "Rename a trail or change its visibility (owner)",
    tag: "Trails",
    minRole: "RESEARCHER",
    body: trailUpdate,
    sample: { path: `/trails/${MISSING_UUID}`, body: { title: "x" } },
  },
  "DELETE /trails/{id}": {
    summary: "Delete a trail (owner)",
    tag: "Trails",
    minRole: "RESEARCHER",
    sample: { path: `/trails/${MISSING_UUID}` },
  },
  "POST /trails/{id}/steps": {
    summary: "Add a stop to the end of a trail",
    tag: "Trails",
    minRole: "RESEARCHER",
    body: trailStepAdd,
    sample: { path: `/trails/${MISSING_UUID}/steps`, body: { paper_id: MISSING } },
  },
  "PUT /trails/{id}/steps": {
    summary: "Reorder all stops in one transaction",
    tag: "Trails",
    minRole: "RESEARCHER",
    body: trailReorder,
    sample: { path: `/trails/${MISSING_UUID}/steps`, body: { order: [1] } },
  },
  "PATCH /trails/{id}/steps/{position}": {
    summary: "Annotate a stop",
    tag: "Trails",
    minRole: "RESEARCHER",
    body: trailStepUpdate,
    sample: { path: `/trails/${MISSING_UUID}/steps/1`, body: { annotation: "x" } },
  },
  "DELETE /trails/{id}/steps/{position}": {
    summary: "Remove a stop; later stops move up",
    tag: "Trails",
    minRole: "RESEARCHER",
    sample: { path: `/trails/${MISSING_UUID}/steps/1` },
  },

  "POST /import/doi": {
    summary: "Import a paper from OpenAlex by DOI (sp_import_paper)",
    tag: "Curation",
    minRole: "CURATOR",
    body: importDoi,
    sample: { path: "/import/doi", body: { doi: "not-a-doi" } },
  },
  "GET /integrity": {
    summary: "Retracted papers and how much of the corpus cites them",
    tag: "Integrity",
    minRole: "ANONYMOUS",
    sample: { path: "/integrity" },
  },
  "GET /integrity/my-library": {
    summary: "Papers in your collections within two hops of retracted work",
    tag: "Integrity",
    minRole: "RESEARCHER",
    sample: { path: "/integrity/my-library" },
  },

  "GET /admin/users": {
    summary: "All users with roles and activity",
    tag: "Admin",
    minRole: "ADMIN",
    sample: { path: "/admin/users" },
  },
  "PATCH /admin/users/{id}": {
    summary: "Change a user's role or deactivate them (sp_set_user_role)",
    tag: "Admin",
    minRole: "ADMIN",
    body: adminUserUpdate,
    sample: { path: `/admin/users/${MISSING}`, body: { is_active: true } },
  },
  "GET /admin/audit": {
    summary: "The audit log",
    tag: "Admin",
    minRole: "ADMIN",
    query: auditQuery,
    sample: { path: "/admin/audit?limit=1" },
  },
  "GET /admin/outbox": {
    summary: "Graph outbox health",
    tag: "Admin",
    minRole: "ADMIN",
    sample: { path: "/admin/outbox" },
  },
  "POST /admin/analytics/refresh": {
    summary: "Refresh the materialized views (sp_refresh_analytics)",
    tag: "Admin",
    minRole: "ADMIN",
    sample: { path: "/admin/analytics/refresh" },
  },
  "GET /admin/slow-queries": {
    summary: "Slowest statements from pg_stat_statements",
    tag: "Admin",
    minRole: "ADMIN",
    sample: { path: "/admin/slow-queries" },
  },
  "POST /admin/graph-sync": {
    summary: "Drain the graph outbox into Neo4j now",
    tag: "Admin",
    minRole: "ADMIN",
    sample: { path: "/admin/graph-sync" },
  },
} satisfies Record<string, Endpoint>;

export type EndpointKey = keyof typeof API;
