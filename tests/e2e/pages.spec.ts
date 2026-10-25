import { expect, test } from "@playwright/test";
import { collectErrors, demoIds, setTheme, signIn } from "./helpers";
import { type Ids, PAGES } from "./routes";

// One smoke test per page: it renders its main heading for the right role, logs no errors,
// and, with SCREENSHOTS=1 (pnpm docs:screenshots), leaves one per theme in docs/screenshots/.

let ids: Ids;
test.beforeAll(async ({ request }) => {
  ids = await demoIds(request);
});

for (const p of PAGES) {
  test(`${p.name} renders${p.role ? ` for ${p.role}` : ""}`, async ({ page }) => {
    const errors = collectErrors(page);
    if (p.role) await signIn(page, p.role);
    for (const theme of ["dark", "light"] as const) {
      await setTheme(page, theme);
      const res = await page.goto(p.path(ids));
      expect(res?.status()).toBe(200);
      await expect(page.locator("main h1").first()).toHaveText(p.heading);
      if (p.ready) await page.locator(`main ${p.ready}`).first().waitFor();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      // Committed screenshots change only on purpose: pnpm docs:screenshots sets SCREENSHOTS=1.
      if (process.env.SCREENSHOTS) {
        await page.screenshot({ path: `docs/screenshots/${p.name}-${theme}.png`, fullPage: false });
      }
    }
    expect(errors).toEqual([]);
  });
}
