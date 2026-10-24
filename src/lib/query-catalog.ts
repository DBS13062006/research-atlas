// Parser for the SQL and Cypher catalog files in db/queries and graph/queries. Each file starts with
// a header the Query Lab, the runner and the documentation all read:
//
//   -- @id        Q09                     (or // @id C01 for Cypher)
//   -- @title     Authors active in every year 2021-2024
//   -- @category  nested
//   -- @concepts  relational division, double NOT EXISTS
//   -- @role      ra_anon
//   -- @param     paper_id bigint = SELECT ... (one line per $n, in order; the default is a query)
//   -- @params    none
//   -- @stdin     dml/D10_citations.csv     (optional data for COPY ... FROM STDIN)

export type CatalogParam = { name: string; type: string; defaultSql: string };

export type CatalogEntry = {
  id: string;
  title: string;
  category: string;
  concepts: string;
  role: string;
  params: CatalogParam[];
  stdin?: string;
  file: string;
  body: string;
  language: "sql" | "cypher";
};

export const DB_ROLES = ["ra_anon", "ra_researcher", "ra_curator", "ra_admin"] as const;
export type DbRole = (typeof DB_ROLES)[number];

export function isDbRole(value: string): value is DbRole {
  return (DB_ROLES as readonly string[]).includes(value);
}

export function parseCatalogFile(file: string, text: string): CatalogEntry {
  const language = file.endsWith(".cypher") ? "cypher" : "sql";
  const prefix = language === "cypher" ? "//" : "--";
  const meta: Record<string, string> = {};
  const params: CatalogParam[] = [];
  const bodyLines: string[] = [];
  let inHeader = true;
  for (const line of text.split("\n")) {
    const m = inHeader ? line.match(new RegExp(`^${prefix}\\s*@(\\w+)\\s+(.*)$`)) : null;
    if (m) {
      const [, key, value] = m;
      if (key === "param") {
        const p = value.match(/^(\w+)\s+(\w+)\s*=\s*(.+)$/);
        if (!p) throw new Error(`${file}: malformed @param line: ${value}`);
        params.push({ name: p[1], type: p[2], defaultSql: p[3].trim() });
      } else {
        meta[key] = value.trim();
      }
      continue;
    }
    inHeader = false;
    bodyLines.push(line);
  }
  for (const key of ["id", "title", "category", "role"]) {
    if (!meta[key]) throw new Error(`${file}: missing @${key}`);
  }
  if (!isDbRole(meta.role)) throw new Error(`${file}: @role must be one of ${DB_ROLES.join(", ")}`);
  return {
    id: meta.id,
    title: meta.title,
    category: meta.category,
    concepts: meta.concepts ?? "",
    role: meta.role,
    params,
    stdin: meta.stdin,
    file,
    body: bodyLines.join("\n").trim(),
    language,
  };
}

// Splits a SQL script into statements on top-level semicolons, respecting quotes, dollar-quoted
// bodies and comments. Comment-only fragments are dropped.
export function splitSqlStatements(script: string): string[] {
  const out: string[] = [];
  let current = "";
  let i = 0;
  while (i < script.length) {
    const ch = script[i];
    const next = script[i + 1];
    if (ch === "-" && next === "-") {
      const end = script.indexOf("\n", i);
      const stop = end === -1 ? script.length : end;
      current += script.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = script.indexOf("*/", i + 2);
      const stop = end === -1 ? script.length : end + 2;
      current += script.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < script.length) {
        if (script[j] === ch && script[j + 1] === ch) j += 2;
        else if (script[j] === ch) break;
        else j++;
      }
      current += script.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "$") {
      const tag = script.slice(i).match(/^\$[A-Za-z_]*\$/);
      if (tag) {
        const end = script.indexOf(tag[0], i + tag[0].length);
        const stop = end === -1 ? script.length : end + tag[0].length;
        current += script.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (ch === ";") {
      out.push(current);
      current = "";
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);
}

// Highest $n placeholder used in a statement, so each statement gets exactly the parameters it needs.
export function maxPlaceholder(statement: string): number {
  let max = 0;
  for (const m of statement.matchAll(/\$(\d+)/g)) max = Math.max(max, Number(m[1]));
  return max;
}
