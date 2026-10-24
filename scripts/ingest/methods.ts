// pnpm ingest:methods — methods, datasets and code links from the final Papers with Code archive
// (Hugging Face mirror pwc-archive/*, read with DuckDB straight from Parquet; only the columns and
// rows needed are fetched and cached as JSON in data/raw/pwc/).
//   (a) papers in the archive (matched on arXiv id or normalised title) get their listed methods;
//       the introducing paper of a method is marked PROPOSED;
//   (b) a curated alias dictionary links methods and datasets by word-boundary matches in titles and
//       abstracts;
//   (c) official code repositories become CODE resources.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { ownerUrl } from "../db/urls";
import { aliasRegex, DATASETS, METHOD_ALIASES } from "./lib/aliases";

const OUT = "data/raw/pwc";
const HF = "hf://datasets/pwc-archive";
const MAX_ARCHIVE_METHODS = 60;

type Paper = {
  paper_id: string;
  arxiv_id: string | null;
  title: string;
  abstract: string | null;
  norm: string;
};
type PaperMethod = {
  arxiv_id: string | null;
  norm_title: string;
  name: string;
  full_name: string;
  description: string | null;
  introduced_year: number | null;
  collection: string | null;
};
type MethodRow = {
  name: string;
  full_name: string;
  description: string | null;
  introduced_year: number | null;
  collection: string | null;
  paper_title: string | null;
  slug: string | null;
};
type DatasetRow = {
  name: string;
  full_name: string | null;
  description: string | null;
  homepage: string | null;
  slug: string | null;
};
type CodeLink = { arxiv_id: string; repo_url: string; is_official: boolean };

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function duck(sqlText: string): void {
  const res = spawnSync("duckdb", ["-c", sqlText], {
    encoding: "utf8",
    env: { ...process.env, AI_AGENT: "" },
  });
  if (res.status !== 0) throw new Error(`duckdb failed: ${res.stderr || res.stdout}`);
}

function readJson<T>(file: string): T[] {
  const text = readFileSync(file, "utf8").trim();
  return text ? (JSON.parse(text) as T[]) : [];
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const sql = postgres(`${ownerUrl()}?sslmode=disable`, { max: 1, onnotice: () => {} });
  try {
    const papers = (
      await sql<Omit<Paper, "norm">[]>`SELECT paper_id::TEXT, arxiv_id, title, abstract FROM paper`
    ).map((p) => ({ ...p, norm: norm(p.title) }));
    writeFileSync(
      `${OUT}/corpus-keys.csv`,
      `arxiv_id,norm_title\n${papers.map((p) => `${p.arxiv_id ?? ""},"${p.norm.replace(/"/g, "")}"`).join("\n")}\n`,
    );

    // ── fetch from the archive (cached) ──
    if (!existsSync(`${OUT}/paper-methods.json`)) {
      console.log("reading papers-with-abstracts from the archive (column projection only)…");
      duck(`
        CREATE TEMP TABLE keys AS SELECT * FROM read_csv('${OUT}/corpus-keys.csv', header = true, all_varchar = true);
        COPY (
          SELECT p.arxiv_id,
                 regexp_replace(lower(p.title), '[^a-z0-9]+', ' ', 'g').trim() AS norm_title,
                 m.name, m.full_name, m.description, m.introduced_year, m.main_collection.name AS collection
          FROM (SELECT arxiv_id, title, unnest(methods) AS m FROM '${HF}/papers-with-abstracts/data/*.parquet') p
          WHERE p.arxiv_id IN (SELECT arxiv_id FROM keys WHERE arxiv_id IS NOT NULL)
             OR regexp_replace(lower(p.title), '[^a-z0-9]+', ' ', 'g').trim() IN (SELECT norm_title FROM keys)
        ) TO '${OUT}/paper-methods.json' (FORMAT json, ARRAY true);`);
    }
    if (!existsSync(`${OUT}/methods.json`)) {
      duck(`COPY (
          SELECT name, full_name, description, introduced_year, collections[1].collection AS collection,
                 paper.title AS paper_title, regexp_extract(url, '/method/([^/]+)', 1) AS slug
          FROM '${HF}/methods/data/*.parquet'
        ) TO '${OUT}/methods.json' (FORMAT json, ARRAY true);`);
    }
    if (!existsSync(`${OUT}/datasets.json`)) {
      duck(`COPY (
          SELECT name, full_name, coalesce(short_description, description) AS description, homepage,
                 regexp_extract(url, '/dataset/([^/]+)', 1) AS slug
          FROM '${HF}/datasets/data/*.parquet'
        ) TO '${OUT}/datasets.json' (FORMAT json, ARRAY true);`);
    }
    if (!existsSync(`${OUT}/code-links.json`)) {
      duck(`
        CREATE TEMP TABLE keys AS SELECT * FROM read_csv('${OUT}/corpus-keys.csv', header = true, all_varchar = true);
        COPY (
          SELECT paper_arxiv_id AS arxiv_id, repo_url, is_official
          FROM '${HF}/links-between-paper-and-code/data/*.parquet'
          WHERE paper_arxiv_id IN (SELECT arxiv_id FROM keys WHERE arxiv_id IS NOT NULL)
        ) TO '${OUT}/code-links.json' (FORMAT json, ARRAY true);`);
    }
    const paperMethods = readJson<PaperMethod>(`${OUT}/paper-methods.json`);
    const allMethods = readJson<MethodRow>(`${OUT}/methods.json`);
    const allDatasets = readJson<DatasetRow>(`${OUT}/datasets.json`);
    const codeLinks = readJson<CodeLink>(`${OUT}/code-links.json`);
    console.log(
      `archive rows: ${paperMethods.length} paper-method links, ${allMethods.length} methods, ${allDatasets.length} datasets, ${codeLinks.length} code links`,
    );

    const byArxiv = new Map(papers.filter((p) => p.arxiv_id).map((p) => [p.arxiv_id as string, p]));
    const byTitle = new Map(papers.map((p) => [p.norm, p]));
    const methodInfo = new Map(allMethods.map((m) => [m.name.toLowerCase(), m]));

    // ── choose methods: the most frequent archive methods in the corpus plus the curated list ──
    const freq = new Map<string, number>();
    for (const pm of paperMethods) freq.set(pm.name, (freq.get(pm.name) ?? 0) + 1);
    const curatedNames = new Set(METHOD_ALIASES.map((m) => m.name.toLowerCase()));
    const archiveTop = [...freq.entries()]
      .filter(([name]) => !curatedNames.has(name.toLowerCase()))
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_ARCHIVE_METHODS)
      .map(([name]) => name);
    const chosen = new Map<
      string,
      {
        name: string;
        category: string | null;
        description: string | null;
        year: number | null;
        slug: string | null;
        introducedBy: string | null;
      }
    >();
    for (const name of [...METHOD_ALIASES.map((m) => m.name), ...archiveTop]) {
      const info = methodInfo.get(name.toLowerCase());
      chosen.set(name.toLowerCase(), {
        name: name.slice(0, 200),
        category: info?.collection?.slice(0, 80) ?? null,
        description: info?.description ?? null,
        year:
          info?.introduced_year && info.introduced_year >= 1900 && info.introduced_year <= 2100
            ? info.introduced_year
            : null,
        slug: info?.slug ?? null,
        introducedBy: info?.paper_title ? norm(info.paper_title) : null,
      });
    }

    // ── links: archive, then aliases ──
    const methodLinks = new Map<string, { paperId: string; method: string; usage: string }>();
    const link = (paperId: string, methodKey: string, usage: string) => {
      const key = `${paperId}|${methodKey}`;
      const prev = methodLinks.get(key);
      if (!prev || usage === "PROPOSED") methodLinks.set(key, { paperId, method: methodKey, usage });
    };
    for (const pm of paperMethods) {
      const paper = (pm.arxiv_id && byArxiv.get(pm.arxiv_id)) || byTitle.get(pm.norm_title);
      const key = pm.name.toLowerCase();
      if (paper && chosen.has(key)) link(paper.paper_id, key, "USED");
    }
    for (const [key, m] of chosen) {
      const intro = m.introducedBy ? byTitle.get(m.introducedBy) : undefined;
      if (intro) link(intro.paper_id, key, "PROPOSED");
    }
    const methodRegexes = METHOD_ALIASES.map((m) => ({
      key: m.name.toLowerCase(),
      res: aliasRegex(m.aliases),
    }));
    const datasetRegexes = DATASETS.map((d) => ({ d, res: aliasRegex(d.aliases) }));
    const datasetLinks: { paperId: string; dataset: string; usage: string }[] = [];
    for (const p of papers) {
      const text = `${p.title}. ${p.abstract ?? ""}`;
      for (const { key, res } of methodRegexes) {
        if (res.some((r) => r.test(text)))
          link(
            p.paper_id,
            key,
            /\b(we|our) (propose|introduce|present)\b/i.test(text) && res.some((r) => r.test(p.title))
              ? "PROPOSED"
              : "USED",
          );
      }
      for (const { d, res } of datasetRegexes) {
        if (!res.some((r) => r.test(text))) continue;
        const near = (verb: RegExp) => d.aliases.some((a) => verb.test(text) && text.includes(a));
        const usage = near(/\b(trained|pre-?trained|training) on\b/i)
          ? "TRAINING"
          : near(/\b(benchmark|state-of-the-art|outperform)/i)
            ? "BENCHMARKING"
            : "OTHER";
        datasetLinks.push({ paperId: p.paper_id, dataset: d.name, usage });
      }
    }

    // ── write ──
    const datasetInfo = new Map(allDatasets.map((d) => [d.name.toLowerCase(), d]));
    await sql.begin(async (tx) => {
      for (const m of chosen.values()) {
        await tx`
          INSERT INTO method (method_name, method_category, description, introduced_year, pwc_slug)
          VALUES (${m.name}, ${m.category}, ${m.description}, ${m.year},
                  ${m.slug && !(await tx`SELECT 1 FROM method WHERE pwc_slug = ${m.slug} AND method_name <> ${m.name}`).length ? m.slug : null})
          ON CONFLICT (method_name) DO UPDATE
            SET method_category = coalesce(method.method_category, EXCLUDED.method_category),
                description = coalesce(method.description, EXCLUDED.description),
                introduced_year = coalesce(method.introduced_year, EXCLUDED.introduced_year)`;
      }
      for (const d of DATASETS) {
        const info = datasetInfo.get((d.pwcName ?? d.name).toLowerCase());
        await tx`
          INSERT INTO dataset (dataset_name, modality, domain, dataset_url, description, pwc_slug)
          VALUES (${d.name}, ${d.modality}, ${d.domain}, ${info?.homepage?.slice(0, 1000) ?? null}, ${info?.description ?? null},
                  ${info?.slug ?? null})
          ON CONFLICT (dataset_name) DO NOTHING`;
      }
      const ml = [...methodLinks.values()];
      const names = new Map([...chosen.entries()].map(([k, v]) => [k, v.name]));
      await tx`
        INSERT INTO paper_method (paper_id, method_id, usage_type)
        SELECT s.paper_id::BIGINT, m.method_id, s.usage
        FROM unnest(${ml.map((l) => l.paperId)}::TEXT[], ${ml.map((l) => names.get(l.method) as string)}::TEXT[],
                    ${ml.map((l) => l.usage)}::TEXT[]) AS s(paper_id, method_name, usage)
        JOIN method m ON m.method_name = s.method_name
        ON CONFLICT (paper_id, method_id) DO UPDATE SET usage_type = EXCLUDED.usage_type
          WHERE EXCLUDED.usage_type = 'PROPOSED'`;
      await tx`
        INSERT INTO paper_dataset (paper_id, dataset_id, usage_type)
        SELECT s.paper_id::BIGINT, d.dataset_id, s.usage
        FROM unnest(${datasetLinks.map((l) => l.paperId)}::TEXT[], ${datasetLinks.map((l) => l.dataset)}::TEXT[],
                    ${datasetLinks.map((l) => l.usage)}::TEXT[]) AS s(paper_id, dataset_name, usage)
        JOIN dataset d ON d.dataset_name = s.dataset_name
        ON CONFLICT DO NOTHING`;
      // Code repositories: official ones first, at most two per paper.
      const perPaper = new Map<string, CodeLink[]>();
      for (const c of codeLinks) {
        if (!/^https?:\/\//.test(c.repo_url)) continue;
        const list = perPaper.get(c.arxiv_id) ?? [];
        list.push(c);
        perPaper.set(c.arxiv_id, list);
      }
      const code: { paperId: string; url: string }[] = [];
      for (const [arxiv, list] of perPaper) {
        const paper = byArxiv.get(arxiv);
        if (!paper) continue;
        for (const c of list.sort((a, b) => Number(b.is_official) - Number(a.is_official)).slice(0, 2)) {
          code.push({ paperId: paper.paper_id, url: c.repo_url.slice(0, 1000) });
        }
      }
      await tx`
        INSERT INTO resource (paper_id, resource_type, resource_url)
        SELECT s.paper_id::BIGINT, 'CODE', s.url
        FROM unnest(${code.map((c) => c.paperId)}::TEXT[], ${code.map((c) => c.url)}::TEXT[]) AS s(paper_id, url)
        ON CONFLICT DO NOTHING`;
      console.log(`code links: ${code.length}`);
    });

    const [stats] = await sql<
      { methods: number; datasets: number; pm: number; pd: number; covered: string }[]
    >`
      SELECT (SELECT count(*) FROM method)::INT AS methods, (SELECT count(*) FROM dataset)::INT AS datasets,
             (SELECT count(*) FROM paper_method)::INT AS pm, (SELECT count(*) FROM paper_dataset)::INT AS pd,
             round(100.0 * (SELECT count(*) FROM paper p WHERE EXISTS (SELECT 1 FROM paper_method x WHERE x.paper_id = p.paper_id)
                                                     OR EXISTS (SELECT 1 FROM paper_dataset y WHERE y.paper_id = p.paper_id))
                   / (SELECT count(*) FROM paper), 1)::TEXT AS covered`;
    console.log(
      `methods ${stats.methods}, datasets ${stats.datasets}, paper_method ${stats.pm}, paper_dataset ${stats.pd}, papers covered ${stats.covered}%`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
