import "server-only";

import { createReadStream, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import neo4j, { type Integer, isDuration, isNode, isPath, isRelationship } from "neo4j-driver";
import postgres from "postgres";
import {
  type CatalogEntry,
  type CatalogParam,
  maxPlaceholder,
  parseCatalogFile,
  splitSqlStatements,
} from "@/lib/query-catalog";
import { dbContext } from "@/server/auth/dal";
import type { SessionUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { graphDriver } from "@/server/graph/driver";

// The Query Lab runs catalog files, never typed SQL. Each SQL run gets its own short-lived
// connection (so NOTICEs can be captured), switches to the caller's database role, and is rolled
// back unless an administrator asks to commit. Cypher runs are always rolled back.

const SQL_ROOT = "db/queries";
const SQL_DIRS = ["", "dml", "proofs", "routines", "triggers"];
const CYPHER_ROOT = "graph/queries";
const MAX_ROWS = 200;
const ROLLBACK = Symbol("rollback");

export const LAB_GROUPS = [
  { key: "constraints", label: "Constraint proofs" },
  { key: "dml", label: "DML" },
  { key: "join", label: "Joins" },
  { key: "nested", label: "Nested and correlated" },
  { key: "recursive", label: "Recursive" },
  { key: "analytics", label: "Analytics and more" },
  { key: "routines", label: "Functions and procedures" },
  { key: "triggers", label: "Triggers" },
  { key: "cypher", label: "Cypher" },
] as const;

function groupOf(entry: CatalogEntry): string {
  if (entry.language === "cypher") return "cypher";
  if (LAB_GROUPS.some((g) => g.key === entry.category)) return entry.category;
  return "analytics"; // set operations, JSON and search sit with the analytics queries
}

export type LabEntry = Omit<CatalogEntry, "file"> & { file: string; group: string; writes: boolean };

let catalog: LabEntry[] | null = null;

export function labCatalog(): LabEntry[] {
  if (catalog) return catalog;
  const sqlFiles = SQL_DIRS.flatMap((dir) =>
    readdirSync(join(SQL_ROOT, dir))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => join(dir, f)),
  );
  const entries = [
    ...sqlFiles.map((f) => ({ path: join(SQL_ROOT, f), file: f })),
    ...readdirSync(CYPHER_ROOT)
      .filter((f) => f.endsWith(".cypher"))
      .map((f) => ({ path: join(CYPHER_ROOT, f), file: f })),
  ].map(({ path, file }) => {
    const entry = parseCatalogFile(file, readFileSync(path, "utf8"));
    const group = groupOf(entry);
    return {
      ...entry,
      file: path,
      group,
      writes:
        ["dml", "routines", "triggers"].includes(group) || /\b(CREATE|SET|DELETE|MERGE)\b/.test(entry.body),
    };
  });
  const order = (e: LabEntry) => LAB_GROUPS.findIndex((g) => g.key === e.group);
  catalog = entries.sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id, "en", { numeric: true }));
  return catalog;
}

export function labEntry(id: string): LabEntry | undefined {
  return labCatalog().find((e) => e.id === id);
}

// ── Results ──────────────────────────────────────────────────────────────────────────────────

export type LabResultSet = {
  statement: number;
  command: string;
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
};

export type PlanNode = {
  label: string;
  detail: string[];
  rows: number | null;
  estimate: number | null;
  totalMs: number | null;
  selfMs: number | null;
  share: number;
  hits: string | null;
  children: PlanNode[];
};

export type SideEffect = {
  source: string;
  row_id: string;
  target: string;
  operation: string;
  detail: unknown;
};

export type LabError = {
  message: string;
  code: string | null;
  constraint: string | null;
  detail: string | null;
  hint: string | null;
  expected: boolean;
};

export type LabRun = {
  id: string;
  language: "sql" | "cypher";
  mode: "run" | "explain" | "profile";
  runAs: string;
  committed: boolean;
  ms: number;
  params: { name: string; type: string; value: unknown }[];
  results: LabResultSet[];
  notices: string[];
  sideEffects: SideEffect[];
  counters: Record<string, number> | null;
  plan: PlanNode | null;
  planTiming: { planningMs: number | null; executionMs: number | null } | null;
  rawPlan: unknown;
  error: LabError | null;
};

export class LabInputError extends Error {}

// JSON-safe cell values: dates as ISO strings, bytes as hex, graph values flattened.
function cell(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `\\x${value.toString("hex")}`;
  if (typeof value === "bigint") return value.toString();
  if (neo4j.isInt(value)) return (value as Integer).toNumber();
  if (isNode(value)) return { labels: value.labels, ...cellObject(value.properties) };
  if (isRelationship(value)) return { type: value.type, ...cellObject(value.properties) };
  if (isPath(value))
    return value.segments.map(
      (s) => `(${s.start.labels[0]})-[:${s.relationship.type}]->(${s.end.labels[0]})`,
    );
  if (isDuration(value)) return value.toString();
  if (Array.isArray(value)) return value.map(cell);
  if (typeof value === "object") {
    const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
    if (ctor && ctor !== "Object") return String(value); // temporal and spatial types
    return cellObject(value as Record<string, unknown>);
  }
  return value;
}

function cellObject(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([k]) => k !== "embedding") // 768 floats help nobody in a grid
      .map(([k, v]) => [k, cell(v)]),
  );
}

// ── Parameters ───────────────────────────────────────────────────────────────────────────────

const PARAM_PATTERNS: Record<string, RegExp> = {
  bigint: /^-?\d{1,18}$/,
  int: /^-?\d{1,9}$/,
  float: /^-?\d+(\.\d+)?$/,
  boolean: /^(true|false)$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
};

function checkParam(p: CatalogParam, raw: string): string {
  const value = raw.trim();
  const pattern = PARAM_PATTERNS[p.type];
  if (pattern && !pattern.test(value)) throw new LabInputError(`${p.name} must be a ${p.type}`);
  if (value.length > 500) throw new LabInputError(`${p.name} is too long`);
  return value;
}

function describeError(err: unknown, expect: string | undefined): LabError {
  const e = err as postgres.PostgresError & { code?: string; constraint_name?: string };
  const constraint = e.constraint_name ?? null;
  const code = typeof e.code === "string" ? e.code : null;
  return {
    message: e.message ?? String(err),
    code,
    constraint,
    detail: e.detail ?? null,
    hint: e.hint ?? null,
    expected: Boolean(expect && (expect === constraint || expect === code)),
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────────────────────────────

type PgPlan = Record<string, unknown> & { Plans?: PgPlan[] };

function pgPlanNode(node: PgPlan, executionMs: number): PlanNode {
  const loops = Number(node["Actual Loops"] ?? 1);
  const total = node["Actual Total Time"] === undefined ? null : Number(node["Actual Total Time"]) * loops;
  const children = (node.Plans ?? []).map((c) => pgPlanNode(c, executionMs));
  const childMs = children.reduce((sum, c) => sum + (c.totalMs ?? 0), 0);
  const self = total === null ? null : Math.max(0, total - childMs);
  const on = [node["Relation Name"], node["Index Name"] ? `using ${node["Index Name"]}` : null]
    .filter(Boolean)
    .join(" ");
  const detail = [
    "Join Type",
    "Strategy",
    "Index Cond",
    "Hash Cond",
    "Merge Cond",
    "Recheck Cond",
    "Filter",
    "Join Filter",
    "Sort Key",
    "Group Key",
    "CTE Name",
    "Function Name",
  ]
    .filter((k) => node[k] !== undefined)
    .map((k) => `${k}: ${Array.isArray(node[k]) ? (node[k] as unknown[]).join(", ") : String(node[k])}`);
  const removed = node["Rows Removed by Filter"];
  if (removed) detail.push(`Rows removed by filter: ${removed}`);
  const hit = Number(node["Shared Hit Blocks"] ?? 0);
  const read = Number(node["Shared Read Blocks"] ?? 0);
  return {
    label: `${node["Node Type"]}${on ? ` on ${on}` : ""}`,
    detail,
    // PostgreSQL 18 reports Actual Rows as a per-loop average, so the product is rounded.
    rows: node["Actual Rows"] === undefined ? null : Math.round(Number(node["Actual Rows"]) * loops),
    estimate: node["Plan Rows"] === undefined ? null : Number(node["Plan Rows"]),
    totalMs: total,
    selfMs: self,
    share: self !== null && executionMs > 0 ? Math.min(1, self / executionMs) : 0,
    hits: hit || read ? `buffers: ${hit} hit, ${read} read` : null,
    children,
  };
}

const EXPLAINABLE = /^\s*(WITH|SELECT|INSERT|UPDATE|DELETE|MERGE|TABLE|VALUES)\b/i;

function stripComments(statement: string): string {
  return statement.replace(/--.*$/gm, "").trim();
}

export async function runSql(
  user: SessionUser,
  input: { id: string; params?: Record<string, string>; mode: "run" | "explain"; commit: boolean },
): Promise<LabRun | null> {
  const entry = labEntry(input.id);
  if (entry?.language !== "sql") return null;
  const ctx = dbContext(user);
  const commit = input.commit && user.role === "ADMIN";
  const statements = splitSqlStatements(entry.body);
  const explainAt =
    input.mode === "explain" ? statements.findLastIndex((s) => EXPLAINABLE.test(stripComments(s))) : -1;
  if (input.mode === "explain" && explainAt === -1)
    throw new LabInputError("This file has no statement EXPLAIN can analyse (CALL cannot be explained).");

  const run: LabRun = {
    id: entry.id,
    language: "sql",
    mode: input.mode,
    runAs: ctx.role,
    committed: false,
    ms: 0,
    params: [],
    results: [],
    notices: [],
    sideEffects: [],
    counters: null,
    plan: null,
    planTiming: null,
    rawPlan: null,
    error: null,
  };
  const sql = postgres(env().DATABASE_URL, {
    max: 1,
    connect_timeout: 10,
    onnotice: (n) => run.notices.push(n.message),
  });
  const started = performance.now();
  try {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('role', ${ctx.role}, true),
                      set_config('app.user_id', ${String(user.userId)}, true),
                      set_config('statement_timeout', '20s', true)`;
      const values: string[] = [];
      for (const p of entry.params) {
        const given = input.params?.[p.name];
        let value: string;
        if (given !== undefined && given.trim() !== "") value = checkParam(p, given);
        else {
          const [row] = await tx.unsafe(p.defaultSql);
          const v = row ? Object.values(row)[0] : null;
          if (v === null || v === undefined)
            throw new LabInputError(`No default value for ${p.name} in this database; enter one.`);
          value = String(cell(v));
        }
        values.push(value);
        run.params.push({ name: p.name, type: p.type, value });
      }
      for (const [i, raw] of statements.entries()) {
        if (/\bFROM\s+STDIN\b/i.test(raw)) {
          if (!entry.stdin) throw new LabInputError("COPY FROM STDIN needs an @stdin file");
          const writable = await tx.unsafe(raw).writable();
          await pipeline(createReadStream(join(SQL_ROOT, entry.stdin)), writable);
          run.results.push({
            statement: i + 1,
            command: "COPY",
            columns: [],
            rows: [],
            rowCount: 0,
            truncated: false,
          });
          continue;
        }
        const args = values.slice(0, maxPlaceholder(raw));
        if (i === explainAt) {
          const [row] = await tx.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${raw}`, args);
          const doc = (Object.values(row)[0] as Record<string, unknown>[])[0];
          const executionMs = Number(doc["Execution Time"] ?? 0);
          run.rawPlan = doc;
          run.plan = pgPlanNode(doc.Plan as PgPlan, executionMs);
          run.planTiming = { planningMs: Number(doc["Planning Time"] ?? 0), executionMs };
          continue;
        }
        const result = await tx.unsafe(raw, args);
        const columns = (result.columns ?? []).map((c) => c.name);
        const count = result.count ?? result.length;
        run.results.push({
          statement: i + 1,
          command: result.command ?? "",
          columns,
          rows: result.slice(0, MAX_ROWS).map((r) => columns.map((c) => cell(r[c]))),
          rowCount: count,
          truncated: result.length > MAX_ROWS,
        });
      }
      run.sideEffects = (await tx`SELECT * FROM fn_lab_side_effects()`).map((r) => ({
        source: r.source,
        row_id: String(r.row_id),
        target: r.target,
        operation: r.operation,
        detail: cell(r.detail),
      }));
      if (!commit) throw ROLLBACK;
    });
    run.committed = commit;
  } catch (err) {
    if (err instanceof LabInputError) throw err;
    if (err !== ROLLBACK) run.error = describeError(err, entry.expect);
  } finally {
    run.ms = Math.round(performance.now() - started);
    await sql.end({ timeout: 2 });
  }
  return run;
}

// ── Neo4j ────────────────────────────────────────────────────────────────────────────────────

type Profile = {
  operatorType: string;
  identifiers: string[];
  arguments: Record<string, unknown>;
  rows: number;
  dbHits: number;
  time?: number;
  children: Profile[];
};

function cypherPlanNode(p: Profile, totalHits: number): PlanNode {
  const details = p.arguments.Details ? String(cell(p.arguments.Details)) : null;
  const estimate = p.arguments.EstimatedRows;
  return {
    label: p.operatorType.replace(/@neo4j$/, ""),
    detail: details ? [details] : [],
    rows: Number(cell(p.rows)),
    estimate: estimate === undefined ? null : Math.round(Number(cell(estimate))),
    totalMs: null,
    selfMs: null,
    share: totalHits > 0 ? Number(cell(p.dbHits)) / totalHits : 0,
    hits: `${Number(cell(p.dbHits))} db hits`,
    children: p.children.map((c) => cypherPlanNode(c, totalHits)),
  };
}

function sumHits(p: Profile): number {
  return Number(cell(p.dbHits)) + p.children.reduce((s, c) => s + sumHits(c), 0);
}

function castCypher(type: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (type === "int") return neo4j.int(Number(value));
  if (type === "float") return Number(value);
  if (type === "boolean") return value === true || value === "true";
  return String(value);
}

export async function runCypher(input: {
  id: string;
  params?: Record<string, string>;
  mode: "run" | "profile";
}): Promise<LabRun | null> {
  const entry = labEntry(input.id);
  if (entry?.language !== "cypher") return null;
  const run: LabRun = {
    id: entry.id,
    language: "cypher",
    mode: input.mode,
    runAs: "neo4j (always rolled back)",
    committed: false,
    ms: 0,
    params: [],
    results: [],
    notices: [],
    sideEffects: [],
    counters: null,
    plan: null,
    planTiming: null,
    rawPlan: null,
    error: null,
  };
  const session = graphDriver().session();
  const tx = session.beginTransaction({ timeout: 20_000 });
  const started = performance.now();
  try {
    const params: Record<string, unknown> = {};
    for (const p of entry.params) {
      const given = input.params?.[p.name];
      let value: unknown;
      if (given !== undefined && given.trim() !== "") value = checkParam(p, given);
      else {
        const r = await tx.run(p.defaultSql);
        value = r.records[0]?.get(0);
        if (value === null || value === undefined)
          throw new LabInputError(`No default value for ${p.name} in this graph; enter one.`);
      }
      params[p.name] = castCypher(p.type, value);
      run.params.push({ name: p.name, type: p.type, value: cell(value) });
    }
    const canProfile = input.mode === "profile" && !/^\s*SHOW\b/i.test(entry.body);
    if (input.mode === "profile" && !canProfile) throw new LabInputError("SHOW commands cannot be profiled.");
    const res = await tx.run(canProfile ? `PROFILE ${entry.body}` : entry.body, params);
    const columns = res.records[0]?.keys.map(String) ?? [];
    run.results.push({
      statement: 1,
      command: res.summary.queryType,
      columns,
      rows: res.records.slice(0, MAX_ROWS).map((r) => columns.map((c) => cell(r.get(c)))),
      rowCount: res.records.length,
      truncated: res.records.length > MAX_ROWS,
    });
    const updates = res.summary.counters.updates();
    const changed = Object.entries(updates).filter(([, n]) => n > 0);
    run.counters = changed.length ? Object.fromEntries(changed) : null;
    run.notices = res.summary.notifications.map((n) => `${n.title}: ${n.description}`);
    if (res.summary.profile) {
      const profile = res.summary.profile as unknown as Profile;
      run.plan = cypherPlanNode(profile, sumHits(profile));
      run.rawPlan = cell(profile);
    }
  } catch (err) {
    if (err instanceof LabInputError) throw err;
    const e = err as { message?: string; code?: string };
    run.error = {
      message: e.message ?? String(err),
      code: e.code ?? null,
      constraint: null,
      detail: null,
      hint: null,
      expected: false,
    };
  } finally {
    run.ms = Math.round(performance.now() - started);
    if (tx.isOpen()) await tx.rollback();
    await session.close();
  }
  return run;
}
