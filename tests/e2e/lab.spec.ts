import { expect, test } from "@playwright/test";
import { gotoReady, signIn } from "./helpers";

test.describe("Query Lab", () => {
  test("a constraint proof is refused by the constraint it names", async ({ page }) => {
    await signIn(page, "curator");
    await gotoReady(page, "/lab?q=P01");
    await page.getByTestId("lab-run").click();
    await expect(page.getByTestId("lab-proof")).toContainText("chk_no_self_citation");
  });

  test("EXPLAIN ANALYZE draws a plan tree", async ({ page }) => {
    await signIn(page, "researcher");
    await gotoReady(page, "/lab?q=Q15");
    await page.getByTestId("lab-plan").click();
    await expect(page.getByRole("list", { name: "Query plan" })).toBeVisible();
    await expect(page.getByTestId("lab-outcome")).toContainText("rolled back");
  });

  test("a trigger demo shows its audit and outbox rows", async ({ page }) => {
    await signIn(page, "curator");
    await gotoReady(page, "/lab?q=T01");
    await page.getByTestId("lab-run").click();
    await expect(page.getByRole("heading", { name: /rows the triggers wrote/i })).toBeVisible();
    await expect(page.getByTestId("lab-outcome")).toContainText("graph_outbox");
  });

  test("a researcher running an admin statement sees PostgreSQL refuse it", async ({ page }) => {
    await signIn(page, "researcher");
    await gotoReady(page, "/lab?q=R06");
    await page.getByTestId("lab-run").click();
    await expect(page.getByTestId("lab-error")).toContainText("42501");
  });

  test("Cypher Lab profiles a traversal", async ({ page }) => {
    await signIn(page, "researcher");
    await gotoReady(page, "/lab?q=C04");
    await page.getByTestId("lab-plan").click();
    await expect(page.getByText(/db hits/).first()).toBeVisible();
  });
});
