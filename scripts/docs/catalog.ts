// pnpm docs:catalog — writes docs/05-ddl.md, docs/06-dml.md and docs/07-queries.md from the live
// database: every catalog file is run the way the Query Lab runs it (as its own role, inside a
// transaction that is rolled back), and the chapters show the SQL, real sample output and an
// EXPLAIN ANALYZE summary. Re-run after any schema or catalog change.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import {
  type CatalogEntry,
  maxPlaceholder,
  parseCatalogFile,
  splitSqlStatements,
} from "../../src/lib/query-catalog";
import { ownerUrl } from "../db/urls";

const ROOT = "db/queries";
const ROLLBACK = Symbol("rollback");
const SAMPLE_ROWS = 5;
const EXPLAINABLE = /^\s*(WITH|SELECT|INSERT|UPDATE|DELETE|MERGE|TABLE|VALUES)\b/i;

type Outcome = {
  entry: CatalogEntry;
  params: string[];
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  command: string;
  plan: { top: string; nodes: string[]; planningMs: number; executionMs: number } | null;
  error: { message: string; constraint: string | null; code: string | null } | null;
};

function load(dir: string): CatalogEntry[] {
  return readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => parseCatalogFile(join(dir, f), readFileSync(join(ROOT, dir, f), "utf8")))
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  let text: string;
  if (value instanceof Date) text = value.toISOString().replace("T00:00:00.000Z", "");
  else if (typeof value === "object") text = JSON.stringify(value);
  else text = String(value);
  text = text.replace(/\s+/g, " ").replace(/\|/g, "\\|");
  return text.length > 70 ? `${text.slice(0, 69)}…` : text;
}

type PlanNode = { "Node Type": string; "Relation Name"?: string; "Index Name"?: string; Plans?: PlanNode[] };

function nodeLabel(n: PlanNode): string {
  return `${n["Node Type"]}${n["Index Name"] ? ` using ${n["Index Name"]}` : n["Relation Name"] ? ` on ${n["Relation Name"]}` : ""}`;
}

function walk(n: PlanNode, out: string[]): string[] {
  out.push(nodeLabel(n));
  for (const c of n.Plans ?? []) walk(c, out);
  return out;
}

async function run(sql: postgres.Sql, entry: CatalogEntry, explain: boolean): Promise<Outcome> {
  const outcome: Outcome = {
    entry,
    params: [],
    columns: [],
    rows: [],
    rowCount: 0,
    command: "",
    plan: null,
    error: null,
  };
  const statements = splitSqlStatements(entry.body);
  const explainAt = explain
    ? statements.findLastIndex((s) => EXPLAINABLE.test(s.replace(/--.*$/gm, "")))
    : -1;
  try {
    await sql.begin(async (tx) => {
      const [user] = await tx<{ user_id: string }[]>`
        SELECT u.user_id FROM user_account u JOIN role r ON r.role_id = u.role_id
        WHERE r.db_role_name = ${entry.role} AND u.is_active ORDER BY u.user_id LIMIT 1`;
      await tx`SELECT set_config('app.user_id', ${user?.user_id ?? ""}, true)`;
      for (const p of entry.params) {
        const [row] = await tx.unsafe(p.defaultSql);
        outcome.params.push(String(row ? Object.values(row)[0] : null));
      }
      await tx.unsafe(`SET LOCAL ROLE ${entry.role}`); // from the validated header allow-list
      for (const [i, statement] of statements.entries()) {
        if (/\bFROM\s+STDIN\b/i.test(statement)) {
          const writable = await tx.unsafe(statement).writable();
          writable.end(readFileSync(join(ROOT, entry.stdin ?? ""), "utf8"));
          await new Promise((resolve) => writable.on("finish", resolve));
          continue;
        }
        const args = outcome.params.slice(0, maxPlaceholder(statement));
        if (i === explainAt) {
          const [row] = await tx.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement}`, args);
          const doc = (Object.values(row)[0] as Record<string, unknown>[])[0];
          const top = doc.Plan as PlanNode;
          outcome.plan = {
            top: nodeLabel(top),
            nodes: [...new Set(walk(top, []))],
            planningMs: Number(doc["Planning Time"]),
            executionMs: Number(doc["Execution Time"]),
          };
          continue;
        }
        const result = await tx.unsafe(statement, args);
        const columns = (result.columns ?? []).map((c) => c.name);
        if (columns.length || !outcome.columns.length) {
          outcome.columns = columns;
          outcome.rows = [...result.slice(0, SAMPLE_ROWS)];
          outcome.rowCount = result.count ?? result.length;
          outcome.command = result.command ?? "";
        }
      }
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) {
      const e = err as { message: string; constraint_name?: string; code?: string };
      outcome.error = { message: e.message, constraint: e.constraint_name ?? null, code: e.code ?? null };
    }
  }
  return outcome;
}

function table(o: Outcome): string {
  if (!o.columns.length) return `_${o.command || "OK"}: ${o.rowCount} rows affected._`;
  const head = `| ${o.columns.join(" | ")} |\n| ${o.columns.map(() => "---").join(" | ")} |`;
  const body = o.rows.map((r) => `| ${o.columns.map((c) => cell(r[c])).join(" | ")} |`).join("\n");
  const more =
    o.rowCount > o.rows.length ? `\n\n_${o.rowCount} rows; the first ${o.rows.length} are shown._` : "";
  return `${head}\n${body}${more}`;
}

function section(o: Outcome, level = "###"): string {
  const e = o.entry;
  const lines = [
    `${level} ${e.id} · ${e.title}`,
    "",
    `**Technique:** ${e.concepts || e.category} · **runs as** \`${e.role}\` · [\`${e.file}\`](../db/queries/${e.file})`,
  ];
  if (o.params.length)
    lines.push(
      "",
      `Parameters (computed from the data): ${e.params.map((p, i) => `\`${p.name}\` = ${o.params[i]}`).join(", ")}`,
    );
  lines.push("", "```sql", e.body, "```", "");
  if (o.error) {
    lines.push(
      e.expect && (o.error.constraint === e.expect || o.error.code === e.expect)
        ? `**Refused, as intended,** by \`${e.expect}\`:`
        : "**Error:**",
      "",
      "```text",
      o.error.message,
      "```",
    );
  } else {
    lines.push(table(o));
  }
  if (o.plan) {
    lines.push(
      "",
      `**Plan:** ${o.plan.top} · planning ${o.plan.planningMs.toFixed(2)} ms · execution ${o.plan.executionMs.toFixed(2)} ms · operators: ${o.plan.nodes.slice(0, 8).join(", ")}${o.plan.nodes.length > 8 ? ", …" : ""}`,
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const sql = postgres(`${ownerUrl()}?sslmode=disable`, { max: 1, onnotice: () => {} });
  const stamp = new Date().toISOString().slice(0, 10);
  try {
    // ── 07 queries
    const queries = await Promise.all([]).then(async () => {
      const out: Outcome[] = [];
      for (const e of load("")) out.push(await run(sql, e, true));
      return out;
    });
    const groups = [...new Set(queries.map((q) => q.entry.category))];
    writeFileSync(
      "docs/07-queries.md",
      [
        "# 7. Queries",
        "",
        `Twenty-five read queries, each a standalone file in [\`db/queries/\`](../db/queries) with a metadata header. The SQL,`,
        "the sample output and the plan summary below were produced from the loaded corpus by `pnpm docs:catalog`",
        `on ${stamp}: each query ran as its declared role inside a transaction that was rolled back, and its plan`,
        "comes from `EXPLAIN (ANALYZE, BUFFERS)`. The same files run live in the Query Lab (`/lab`).",
        "",
        "| Group | Queries |",
        "| --- | --- |",
        ...groups.map(
          (g) =>
            `| ${g} | ${queries
              .filter((q) => q.entry.category === g)
              .map((q) => q.entry.id)
              .join(", ")} |`,
        ),
        "",
        ...groups.flatMap((g) => [
          `## ${g[0].toUpperCase()}${g.slice(1)} queries`,
          "",
          ...queries.filter((q) => q.entry.category === g).flatMap((q) => [section(q), ""]),
        ]),
      ].join("\n"),
    );

    // ── 06 DML
    const dml: Outcome[] = [];
    for (const e of load("dml")) dml.push(await run(sql, e, false));
    writeFileSync(
      "docs/06-dml.md",
      [
        "# 6. Data manipulation",
        "",
        "Ten DML files in [`db/queries/dml/`](../db/queries/dml), one per technique. Each ran as its declared role",
        `on ${stamp} inside a transaction that was rolled back, so the outputs below are real but changed nothing.`,
        "In the Query Lab an administrator may switch on “Commit for real”.",
        "",
        "| File | Statement | Demonstrates |",
        "| --- | --- | --- |",
        ...dml.map((d) => `| ${d.entry.id} | ${d.entry.title} | ${d.entry.concepts} |`),
        "",
        ...dml.flatMap((d) => [section(d, "##"), ""]),
      ].join("\n"),
    );

    // ── 05 DDL
    const migrations = readdirSync("db/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => {
        const text = readFileSync(join("db/migrations", f), "utf8");
        const first = text.split("\n").find((l) => /^-- \d{3}/.test(l)) ?? "";
        return `| [\`${f}\`](../db/migrations/${f}) | ${first.replace(/^-- \d{3} · ?/, "").replace(/\|/g, "\\|")} |`;
      });
    const constraints = await sql<{ table: string; name: string; kind: string; def: string }[]>`
      SELECT c.conrelid::regclass::TEXT AS table, c.conname AS name,
             CASE c.contype WHEN 'p' THEN 'primary key' WHEN 'f' THEN 'foreign key' WHEN 'u' THEN 'unique'
                            WHEN 'c' THEN 'check' WHEN 'x' THEN 'exclusion' ELSE c.contype::TEXT END AS kind,
             pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid <> 0 AND c.contype IN ('p','f','u','c','x')
        AND c.conrelid::regclass::TEXT NOT LIKE 'audit_log_%' AND c.conrelid::regclass::TEXT <> 'schema_migrations'
      ORDER BY 1, array_position(ARRAY['p','u','f','c','x'], c.contype::TEXT), 2`;
    const triggers = await sql<{ table: string; name: string; timing: string; def: string }[]>`
      SELECT t.tgrelid::regclass::TEXT AS table, t.tgname AS name, p.proname AS def,
             CASE WHEN t.tgtype & 2 = 2 THEN 'BEFORE' WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF' ELSE 'AFTER' END
             || ' ' || concat_ws(' OR ', CASE WHEN t.tgtype & 4 = 4 THEN 'INSERT' END,
                                 CASE WHEN t.tgtype & 16 = 16 THEN 'UPDATE' END,
                                 CASE WHEN t.tgtype & 8 = 8 THEN 'DELETE' END)
             || CASE WHEN t.tgtype & 1 = 1 THEN ' · row' ELSE ' · statement' END AS timing
      FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE NOT t.tgisinternal AND t.tgrelid::regclass::TEXT NOT LIKE 'audit_log_%'
      ORDER BY 1, 2`;
    const indexes = await sql<{ table: string; name: string; def: string }[]>`
      SELECT tablename AS table, indexname AS name, regexp_replace(indexdef, '^.* USING ', 'USING ') AS def
      FROM pg_indexes WHERE schemaname = 'public' AND indexname !~ '^(pk|uq)_' AND tablename NOT LIKE 'audit_log_%'
      ORDER BY 1, 2`;
    const proofs: Outcome[] = [];
    for (const e of load("proofs")) proofs.push(await run(sql, e, false));
    const esc = (s: string) => s.replace(/\|/g, "\\|");
    writeFileSync(
      "docs/05-ddl.md",
      [
        "# 5. DDL and constraints",
        "",
        "The schema is built by dbmate migrations in [`db/migrations/`](../db/migrations). Each has an `up` and a",
        "`down` section, and `pnpm verify:all` rolls a fresh database back to zero and up again. Every constraint,",
        `index and trigger has a name, so an error message says which rule was broken. Tables below were read from`,
        `the live catalog (\`pg_constraint\`, \`pg_trigger\`, \`pg_indexes\`) by \`pnpm docs:catalog\` on ${stamp}.`,
        "The psql snapshots in [`docs/report/assets/ddl/`](report/assets/ddl) show the same objects with `\\d+`.",
        "",
        "## 5.1 Migrations",
        "",
        "| Migration | Purpose |",
        "| --- | --- |",
        ...migrations,
        "",
        `## 5.2 Named constraints (${constraints.length})`,
        "",
        "| Table | Constraint | Kind | Rule |",
        "| --- | --- | --- | --- |",
        ...constraints.map((c) => `| ${c.table} | \`${c.name}\` | ${c.kind} | \`${esc(c.def)}\` |`),
        "",
        `## 5.3 Secondary indexes (${indexes.length})`,
        "",
        "| Table | Index | Definition |",
        "| --- | --- | --- |",
        ...indexes.map((i) => `| ${i.table} | \`${i.name}\` | \`${esc(i.def)}\` |`),
        "",
        `## 5.4 Triggers (${triggers.length})`,
        "",
        "| Table | Trigger | When | Function |",
        "| --- | --- | --- | --- |",
        ...triggers.map((t) => `| ${t.table} | \`${t.name}\` | ${t.timing} | \`${t.def}\` |`),
        "",
        "## 5.5 Constraint proofs",
        "",
        "Each proof is an action the rules must refuse. It runs as the role a real user would have; the message",
        "is what PostgreSQL returned (pgTAP checks the same cases in `db/tests/10_constraints.sql`).",
        "",
        ...proofs.flatMap((p) => [section(p, "###"), ""]),
      ].join("\n"),
    );
    console.log(
      `docs:catalog wrote 05 (${constraints.length} constraints, ${indexes.length} indexes, ${triggers.length} triggers, ${proofs.length} proofs), 06 (${dml.length} DML), 07 (${queries.length} queries)`,
    );
    const failed = [...queries, ...dml]
      .filter((o) => o.error)
      .concat(
        proofs.filter(
          (p) => p.entry.expect && p.error?.constraint !== p.entry.expect && p.error?.code !== p.entry.expect,
        ),
      );
    if (failed.length) {
      console.error(`unexpected results: ${failed.map((f) => f.entry.id).join(", ")}`);
      process.exitCode = 1;
    }
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
