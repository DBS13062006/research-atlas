import { env } from "../../src/server/env";

// Connection URLs for scripts. The test database lives on the same server under a "_test" suffix.
function withDatabase(url: string, test: boolean): string {
  if (!test) return url;
  const u = new URL(url);
  u.pathname = `${u.pathname.replace(/\/$/, "")}_test`;
  return u.toString();
}

export function ownerUrl({ test = false }: { test?: boolean } = {}): string {
  return withDatabase(env().DATABASE_OWNER_URL, test);
}

export function appUrl({ test = false }: { test?: boolean } = {}): string {
  return withDatabase(env().DATABASE_URL, test);
}
