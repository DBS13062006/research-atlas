import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// P6 gate: every protected route answers 200 for the right role and 403 (or a sign-in redirect) otherwise.

const PROTECTED = [
  { path: "/library", min: "researcher" },
  { path: "/account", min: "researcher" },
  { path: "/curate", min: "curator" },
  { path: "/admin", min: "admin" },
] as const;

const RANK = { anonymous: 0, researcher: 1, curator: 2, admin: 3 } as const;

test.describe("anonymous", () => {
  for (const r of PROTECTED) {
    test(`${r.path} redirects to sign-in`, async ({ page }) => {
      await page.goto(r.path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(r.path)}`));
    });
  }
});

for (const role of ["researcher", "curator", "admin"] as const) {
  test.describe(role, () => {
    test.beforeEach(async ({ page }) => signIn(page, role));
    for (const r of PROTECTED) {
      const allowed = RANK[role] >= RANK[r.min];
      test(`${r.path} is ${allowed ? "allowed" : "forbidden"}`, async ({ page }) => {
        const res = await page.goto(r.path);
        expect(res?.status()).toBe(200);
        if (allowed) await expect(page.locator("#main").getByTestId("access-denied")).toHaveCount(0);
        else await expect(page.locator("#main").getByTestId("access-denied")).toBeVisible();
      });
    }
  });
}

test("researcher API write to curator endpoint is 403", async ({ page }) => {
  await signIn(page, "researcher");
  const res = await page.request.post("/api/v1/import/doi", {
    data: { doi: "10.1000/xyz" },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(res.status()).toBe(403);
});
