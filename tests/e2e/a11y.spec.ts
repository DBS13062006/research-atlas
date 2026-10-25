import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { demoIds, gotoReady, setTheme, signIn } from "./helpers";
import { type Ids, PAGES } from "./routes";

// P7 gate: axe-core finds no serious or critical WCAG 2.2 AA violations on any page, in either theme.

let ids: Ids;
test.beforeAll(async ({ request }) => {
  ids = await demoIds(request);
});

for (const p of PAGES) {
  test(`${p.name} has no serious accessibility violations`, async ({ page }) => {
    if (p.role) await signIn(page, p.role);
    for (const theme of ["dark", "light"] as const) {
      await setTheme(page, theme);
      await gotoReady(page, p.path(ids));
      if (p.ready) await page.locator(`main ${p.ready}`).first().waitFor();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .exclude("nextjs-portal")
        .analyze();
      const serious = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => ({
          theme,
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes
            .slice(0, 4)
            .map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n")[1] ?? ""}`),
        }));
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    }
  });
}
