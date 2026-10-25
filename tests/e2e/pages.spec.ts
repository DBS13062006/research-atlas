import { expect, test } from "@playwright/test";
import { collectErrors, demoIds, type SeedRole, setTheme, signIn } from "./helpers";

// One smoke test per page: it renders its main heading for the right role, logs no errors,
// and leaves a screenshot in each theme under docs/screenshots/.

type PageCase = {
  name: string;
  path: (ids: Ids) => string;
  heading: RegExp;
  role?: SeedRole;
  ready?: string;
};
type Ids = Awaited<ReturnType<typeof demoIds>>;

const PAGES: PageCase[] = [
  { name: "home", path: () => "/", heading: /./ },
  { name: "atlas", path: () => "/atlas", heading: /placed by meaning/i, ready: "canvas" },
  { name: "search", path: () => "/search?q=graph+neural+networks&mode=hybrid", heading: /find papers/i },
  { name: "paper", path: (i) => `/papers/${i.paperId}`, heading: /attention/i },
  { name: "author", path: (i) => `/authors/${i.authorId}`, heading: /./ },
  { name: "topics", path: () => "/topics", heading: /domain/i },
  { name: "topic", path: (i) => `/topics/${i.topicId}`, heading: /./ },
  { name: "integrity", path: () => "/integrity", heading: /retract/i },
  { name: "lineage", path: (i) => `/explore/lineage?paper=${i.paperId}`, heading: /lineage|idea/i },
  { name: "connect", path: () => "/explore/connect", heading: /connect|chain/i },
  { name: "fronts", path: () => "/explore/fronts", heading: /moving/i },
  { name: "gems", path: () => "/explore/gems", heading: /influence/i },
  { name: "observatory", path: () => "/explore/observatory", heading: /methods are tested/i },
  { name: "trails", path: () => "/trails", heading: /curated routes/i },
  { name: "library", path: () => "/library", heading: /your reading/i, role: "researcher" },
  { name: "account", path: () => "/account", heading: /account/i, role: "researcher" },
  { name: "curate", path: (i) => `/curate?paper=${i.paperId}`, heading: /catalog/i, role: "curator" },
  { name: "admin", path: () => "/admin", heading: /run the atlas/i, role: "admin" },
  { name: "login", path: () => "/login", heading: /sign in|welcome/i },
  { name: "lab", path: () => "/lab?q=Q15", heading: /running live/i, role: "researcher" },
];

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
      await page.screenshot({ path: `docs/screenshots/${p.name}-${theme}.png`, fullPage: false });
    }
    expect(errors).toEqual([]);
  });
}
