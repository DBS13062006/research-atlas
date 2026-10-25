import { type APIRequestContext, expect, type Page } from "@playwright/test";

export const USERS = {
  researcher: "rhea@research-atlas.test",
  curator: "curator@research-atlas.test",
  admin: "admin@research-atlas.test",
} as const;
export type SeedRole = keyof typeof USERS;

export async function signIn(page: Page, role: SeedRole) {
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error("SEED_PASSWORD is not set; run pnpm seed:demo with .env.local filled in.");
  await page.goto("/login");
  await page.getByLabel("Email").fill(USERS[role]);
  await page.getByLabel("Password").fill(password);
  await page
    .locator("main form")
    .getByRole("button", { name: /sign in/i })
    .click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export async function setTheme(page: Page, theme: "dark" | "light") {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }, theme);
}

// Resolves ids from the live corpus so the tests do not depend on load order.
export async function demoIds(request: APIRequestContext) {
  const search = await request.get("/api/v1/search?q=attention&mode=lexical&limit=1");
  expect(search.ok()).toBeTruthy();
  const paperId: number = (await search.json()).hits[0].paper_id;
  const paper = await (await request.get(`/api/v1/papers/${paperId}`)).json();
  return {
    paperId,
    authorId: paper.authors[0].author_id as number,
    topicId: paper.primary_topic_id as number,
  };
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Download the React DevTools/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

// Streams finish and React hydrates before a test clicks anything; until then a Suspense boundary's
// content can briefly exist twice (the hidden streamed copy and the placed one).
export async function gotoReady(page: Page, path: string) {
  const res = await page.goto(path);
  await page.waitForLoadState("networkidle");
  return res;
}
