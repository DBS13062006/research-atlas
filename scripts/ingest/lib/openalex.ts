// Minimal OpenAlex client for the ingest scripts.
// - Every response is cached gzip-compressed under data/raw/openalex/, keyed by the URL without the
//   API key, so re-running the pipeline costs nothing.
// - 429 and 5xx responses back off exponentially.
// - A daily cost guard stops before the free allowance runs out (OpenAlex reports usage in headers).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const BASE = "https://api.openalex.org";
const CACHE_DIR = "data/raw/openalex";
const STOP_WHEN_REMAINING_USD_BELOW = 0.1; // i.e. stop after spending $0.90 of the $1 daily allowance

export class BudgetExhaustedError extends Error {}

export type OpenAlexPage<T> = {
  meta: { count: number; next_cursor?: string | null; cost_usd?: number };
  results: T[];
};

let lastRemainingUsd: number | undefined;
let spentThisRunUsd = 0;
let networkCalls = 0;
let cacheHits = 0;

export function usage() {
  return {
    networkCalls,
    cacheHits,
    spentThisRunUsd: Math.round(spentThisRunUsd * 1000) / 1000,
    lastRemainingUsd,
  };
}

function cachePath(path: string, params: Record<string, string>): string {
  const key = `${path}?${new URLSearchParams(Object.entries(params).sort()).toString()}`;
  return join(CACHE_DIR, `${createHash("sha1").update(key).digest("hex")}.json.gz`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function openalex<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const file = cachePath(path, params);
  if (existsSync(file)) {
    cacheHits++;
    return JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as T;
  }
  if (lastRemainingUsd !== undefined && lastRemainingUsd < STOP_WHEN_REMAINING_USD_BELOW) {
    throw new BudgetExhaustedError(`OpenAlex daily allowance nearly used (remaining $${lastRemainingUsd})`);
  }
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (process.env.OPENALEX_API_KEY) url.searchParams.set("api_key", process.env.OPENALEX_API_KEY);
  if (process.env.OPENALEX_MAILTO) url.searchParams.set("mailto", process.env.OPENALEX_MAILTO);

  for (let attempt = 0; attempt < 7; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { "User-Agent": "research-atlas-ingest" } });
    } catch {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    networkCalls++;
    const remaining = Number(res.headers.get("x-ratelimit-remaining-usd"));
    if (Number.isFinite(remaining)) lastRemainingUsd = remaining;
    const cost = Number(res.headers.get("x-ratelimit-cost-usd"));
    if (Number.isFinite(cost)) spentThisRunUsd += cost;
    if (res.status === 429 || res.status >= 500) {
      if (res.status === 429 && lastRemainingUsd !== undefined && lastRemainingUsd <= 0) {
        throw new BudgetExhaustedError("OpenAlex returned 429 with no allowance left");
      }
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      // Never echo the URL: it carries the API key.
      throw new Error(`OpenAlex ${path} responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const body = (await res.json()) as T;
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, gzipSync(JSON.stringify(body)));
    return body;
  }
  throw new Error(`OpenAlex ${path} kept failing after retries`);
}

// Cursor-paginates a list endpoint until `limit` results have been collected.
export async function openalexList<T>(
  path: string,
  params: Record<string, string>,
  limit: number,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null | undefined = "*";
  while (cursor && out.length < limit) {
    const perPage = String(Math.min(200, limit - out.length));
    const page: OpenAlexPage<T> = await openalex<OpenAlexPage<T>>(path, {
      ...params,
      "per-page": perPage,
      cursor,
    });
    out.push(...page.results);
    cursor = page.results.length > 0 ? page.meta.next_cursor : null;
  }
  return out.slice(0, limit);
}

export const shortId = (url: string | null | undefined): string | null =>
  url ? (url.split("/").pop() ?? null) : null;
