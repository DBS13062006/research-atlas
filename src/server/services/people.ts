import "server-only";

import { ANONYMOUS, withDb } from "@/server/db/client";

// Content stored in Neo4j (trails, curated relations) records only a user_id. This resolves the
// display names through fn_user_display_names, which exposes names and nothing else.
export async function displayNames(userIds: number[]): Promise<Map<number, string>> {
  const ids = [...new Set(userIds)].filter((id) => Number.isSafeInteger(id));
  if (ids.length === 0) return new Map();
  const rows = await withDb(
    ANONYMOUS,
    (tx) =>
      tx<
        { user_id: string; name: string }[]
      >`SELECT user_id, name FROM fn_user_display_names(${ids}::BIGINT[])`,
  );
  return new Map(rows.map((r) => [Number(r.user_id), r.name]));
}

// Adds `<key>Name` beside a numeric user-id field on each item.
export async function withNames<T extends Record<K, number>, K extends string>(
  items: T[],
  key: K,
): Promise<(T & Record<`${K}Name`, string | null>)[]> {
  const names = await displayNames(items.map((i) => i[key]));
  return items.map(
    (i) => ({ ...i, [`${key}Name`]: names.get(i[key]) ?? null }) as T & Record<`${K}Name`, string | null>,
  );
}
