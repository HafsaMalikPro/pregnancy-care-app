import { expect, test } from "@playwright/test";
import { noHorizontalOverflow, onboard, signUp } from "./helpers";

const PAGES = [
  "/",
  "/journey",
  "/weeks",
  "/weeks/12",
  "/nutrition",
  "/exercise",
  "/baby-care",
  "/birth-and-postpartum",
  "/postpartum",
  "/articles",
  "/about",
  "/login",
  "/signup",
  "/privacy",
];

for (const path of PAGES) {
  test(`no sideways scrolling on ${path}`, async ({ page }) => {
    await page.goto(path);
    await noHorizontalOverflow(page);
  });
}

test("mobile menu and app tab bar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.locator("#public-menu").getByRole("link", { name: "Pregnancy journey" }).click();
  await expect(page).toHaveURL(/\/journey/);

  await signUp(page);
  await onboard(page, 24);
  const tabs = page.getByRole("navigation", { name: "Shortcuts" });
  await expect(tabs).toBeVisible();
  await noHorizontalOverflow(page);
  await tabs.getByRole("link", { name: "Pregnancy" }).click();
  await expect(page).toHaveURL(/\/timeline/);
  await noHorizontalOverflow(page);
  await tabs.getByRole("link", { name: "Profile" }).click();
  await page.getByRole("link", { name: /Account and security/ }).click();
  await expect(page.getByRole("link", { name: "All settings" })).toBeVisible();
  await noHorizontalOverflow(page);
});
