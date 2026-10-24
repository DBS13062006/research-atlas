// pnpm docs:schema — regenerates docs/schema/ from the live development database: one Markdown page
// per table (columns, keys, constraints, indexes, triggers) and a relational diagram rendered with
// Graphviz. Generated from the catalog, so the documentation can never drift from the DDL.
// (tbls was the first choice but cannot read PostgreSQL 18 VIRTUAL generated columns.)
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { ownerUrl } from "../db/urls";

type Column = {
  table_name: string;
  column_name: string;
  data_type: string;
  not_null: boolean;
  default_expr: string | null;
  generated: string;
  generation_expr: string | null;
  ordinal: number;
};
type Constraint = {
  table_name: string;
  name: string;
  kind: string;
  definition: string;
  columns: string[];
  ref_table: string | null;
};
type Index = { table_name: string; name: string; definition: string };
type Trigger = { table_name: string; name: string; definition: string };
type Table = { table_name: string; comment: string | null; kind: string };

const sql = postgres(`${ownerUrl()}?sslmode=disable`, { max: 1, onnotice: () => {} });

const KIND: Record<string, string> = {
  p: "PRIMARY KEY",
  u: "UNIQUE",
  f: "FOREIGN KEY",
  c: "CHECK",
  x: "EXCLUDE",
};

async function main(): Promise<void> {
  const tables = await sql<Table[]>`
    SELECT c.relname AS table_name, obj_description(c.oid, 'pg_class') AS comment,
           CASE c.relkind WHEN 'p' THEN 'partitioned table' ELSE 'table' END AS kind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
      AND c.relname <> 'schema_migrations'
    ORDER BY c.relname`;
  const columns = await sql<Column[]>`
    SELECT c.relname AS table_name, a.attname AS column_name,
           format_type(a.atttypid, a.atttypmod) AS data_type, a.attnotnull AS not_null,
           CASE WHEN a.attgenerated = '' THEN pg_get_expr(d.adbin, d.adrelid) END AS default_expr,
           a.attgenerated::TEXT AS generated,
           CASE WHEN a.attgenerated <> '' THEN pg_get_expr(d.adbin, d.adrelid) END AS generation_expr,
           a.attnum AS ordinal
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY c.relname, a.attnum`;
  const constraints = await sql<Constraint[]>`
    SELECT t.relname AS table_name, c.conname AS name, c.contype::TEXT AS kind,
           pg_get_constraintdef(c.oid) AS definition,
           ARRAY(SELECT a.attname::TEXT FROM unnest(c.conkey) k JOIN pg_attribute a
                 ON a.attrelid = c.conrelid AND a.attnum = k) AS columns,
           r.relname AS ref_table
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_class r ON r.oid = c.confrelid
    WHERE n.nspname = 'public' AND c.contype IN ('p', 'u', 'f', 'c', 'x') AND NOT t.relispartition
    ORDER BY t.relname, array_position(ARRAY['p', 'u', 'f', 'c', 'x'], c.contype::TEXT), c.conname`;
  const indexes = await sql<Index[]>`
    SELECT i.tablename AS table_name, i.indexname AS name, i.indexdef AS definition
    FROM pg_indexes i
    JOIN pg_class t ON t.relname = i.tablename
    JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = i.schemaname
    WHERE i.schemaname = 'public' AND NOT t.relispartition
    ORDER BY i.tablename, i.indexname`;
  const triggers = await sql<Trigger[]>`
    SELECT c.relname AS table_name, t.tgname AS name, pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal AND NOT c.relispartition
    ORDER BY c.relname, t.tgname`;
  await sql.end();

  mkdirSync("docs/schema", { recursive: true });
  const by = <T extends { table_name: string }>(rows: T[], table: string) =>
    rows.filter((r) => r.table_name === table);
  const pkCols = (table: string) =>
    new Set(constraints.find((c) => c.table_name === table && c.kind === "p")?.columns ?? []);
  const fkCols = (table: string) =>
    new Set(constraints.filter((c) => c.table_name === table && c.kind === "f").flatMap((c) => c.columns));

  // ── per-table pages ──
  for (const t of tables) {
    const pk = pkCols(t.table_name);
    const fk = fkCols(t.table_name);
    const lines: string[] = [`# ${t.table_name}`, "", `Kind: ${t.kind}.`, ""];
    if (t.comment) lines.push(t.comment, "");
    lines.push(
      "## Columns",
      "",
      "| # | Column | Type | Null | Default / generated | Key |",
      "| - | - | - | - | - | - |",
    );
    for (const c of by(columns, t.table_name)) {
      const gen =
        c.generated === "v"
          ? `GENERATED ALWAYS AS (${c.generation_expr}) VIRTUAL`
          : c.generated === "s"
            ? `GENERATED ALWAYS AS (${c.generation_expr}) STORED`
            : (c.default_expr ?? "");
      const key = [pk.has(c.column_name) ? "PK" : "", fk.has(c.column_name) ? "FK" : ""]
        .filter(Boolean)
        .join(", ");
      lines.push(
        `| ${c.ordinal} | \`${c.column_name}\` | ${c.data_type} | ${c.not_null ? "NO" : "yes"} | ${gen ? `\`${gen.replace(/\|/g, "\\|")}\`` : ""} | ${key} |`,
      );
    }
    lines.push("", "## Constraints", "", "| Name | Kind | Definition |", "| - | - | - |");
    for (const c of by(constraints, t.table_name)) {
      lines.push(`| \`${c.name}\` | ${KIND[c.kind] ?? c.kind} | \`${c.definition.replace(/\|/g, "\\|")}\` |`);
    }
    const ix = by(indexes, t.table_name);
    if (ix.length) {
      lines.push("", "## Indexes", "", "| Name | Definition |", "| - | - |");
      for (const i of ix) lines.push(`| \`${i.name}\` | \`${i.definition}\` |`);
    }
    const tg = by(triggers, t.table_name);
    if (tg.length) {
      lines.push("", "## Triggers", "", "| Name | Definition |", "| - | - |");
      for (const g of tg) lines.push(`| \`${g.name}\` | \`${g.definition}\` |`);
    }
    lines.push("", "[← All tables](README.md)", "");
    writeFileSync(`docs/schema/${t.table_name}.md`, lines.join("\n"));
  }

  // ── relational diagram ──
  const dot: string[] = [
    "digraph schema {",
    '  graph [rankdir=LR, splines=true, overlap=false, nodesep=0.5, ranksep=1.1, fontname="Helvetica", bgcolor="white"];',
    '  node [shape=plain, fontname="Helvetica", fontsize=11];',
    '  edge [color="#475569", arrowhead=tee, arrowtail=crow, dir=both, penwidth=1.1];',
  ];
  for (const t of tables) {
    const pk = pkCols(t.table_name);
    const fk = fkCols(t.table_name);
    const rows = by(columns, t.table_name)
      .map((c) => {
        const tag = [pk.has(c.column_name) ? "PK" : "", fk.has(c.column_name) ? "FK" : ""]
          .filter(Boolean)
          .join(" ");
        const name = pk.has(c.column_name) ? `<u>${c.column_name}</u>` : c.column_name;
        const type = c.data_type
          .replace(/character varying/, "varchar")
          .replace(/timestamp with time zone/, "timestamptz");
        return `<tr><td align="left" port="${c.column_name}">${name}</td><td align="left"><font color="#64748b">${type.replace(/</g, "&lt;")}</font></td><td align="left">${tag ? `<font color="#1e3a8a"><b>${tag}</b></font>` : " "}</td></tr>`;
      })
      .join("");
    dot.push(
      `  ${t.table_name} [label=<<table border="1" cellborder="0" cellspacing="0" cellpadding="3" color="#1e3a8a"><tr><td colspan="3" bgcolor="#dbeafe"><b>${t.table_name}</b></td></tr>${rows}</table>>];`,
    );
  }
  for (const c of constraints.filter((x) => x.kind === "f" && x.ref_table)) {
    dot.push(`  ${c.table_name}:${c.columns[0]} -> ${c.ref_table} [tooltip="${c.name}"];`);
  }
  dot.push("}");
  writeFileSync("docs/schema/schema.dot", dot.join("\n"));
  for (const fmt of ["svg", "png"]) {
    const res = spawnSync(
      "dot",
      [
        `-T${fmt}`,
        ...(fmt === "png" ? ["-Gdpi=110"] : []),
        "-o",
        `docs/schema/schema.${fmt}`,
        "docs/schema/schema.dot",
      ],
      {
        stdio: "inherit",
      },
    );
    if (res.status !== 0) throw new Error(`dot -T${fmt} failed`);
  }

  // ── index page ──
  const idx: string[] = [
    "# Relational schema",
    "",
    "Generated by `pnpm docs:schema` from the live database. Do not edit by hand.",
    "",
    "![Relational schema](schema.svg)",
    "",
    "| Table | Columns | Constraints | Indexes | Triggers |",
    "| - | - | - | - | - |",
  ];
  for (const t of tables) {
    idx.push(
      `| [${t.table_name}](${t.table_name}.md) | ${by(columns, t.table_name).length} | ${by(constraints, t.table_name).length} | ${by(indexes, t.table_name).length} | ${by(triggers, t.table_name).length} |`,
    );
  }
  idx.push(
    "",
    `Totals: ${tables.length} tables, ${constraints.length} named constraints, ${indexes.length} indexes, ${triggers.length} triggers.`,
    "",
  );
  writeFileSync("docs/schema/README.md", idx.join("\n"));
  console.log(
    `docs/schema: ${tables.length} tables, ${constraints.length} constraints, ${indexes.length} indexes`,
  );
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  await sql.end();
  process.exit(1);
});
