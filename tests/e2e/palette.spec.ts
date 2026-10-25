import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

test("the command palette finds papers, authors and topics as you type", async ({ page }) => {
  await gotoReady(page, "/");
  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByRole("combobox", { name: /search pages, papers, authors and topics/i });
  await expect(input).toBeVisible();
  await input.fill("graph neural");
  await expect(page.getByRole("group", { name: "Papers" })).toBeVisible();
  await input.fill("hinton");
  await expect(page.getByRole("group", { name: "Authors" })).toBeVisible();
  await input.fill("neuroscience");
  await expect(page.getByRole("group", { name: "Topics" })).toBeVisible();
  await page.getByRole("group", { name: "Topics" }).getByRole("option").first().click();
  await expect(page).toHaveURL(/\/topics\/\d+$/);
});
