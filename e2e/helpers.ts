import { expect, type Page } from "@playwright/test";

export const PASSWORD = "a calm walk in the park";

export const uniqueEmail = () =>
  `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

/** ISO date `days` from today in the browser's zone (tests run in the same zone). */
export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function signUp(page: Page, email = uniqueEmail()) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Amira Test");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  // Password hashing makes sign-up the slowest request.
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
  return email;
}

/** Runs onboarding with an LMP `weeksAgo` weeks back and lands on the dashboard. */
export async function onboard(page: Page, weeksAgo = 12) {
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByText("Store my pregnancy and health details").click();
  await page.getByRole("button", { name: "Save choices and continue" }).click();
  await page.getByText("Last menstrual period").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("First day of your last period").fill(isoDaysAgo(weeksAgo * 7));
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Check your details" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByRole("heading", { name: `You're ${weeksAgo} weeks 0 days along` })).toBeVisible();
  await page.getByRole("link", { name: "Open my dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const wide = [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .filter((el) => !el.closest("[class*='overflow-x-auto']"))
      .slice(0, 3)
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 120));
    return { by: document.documentElement.scrollWidth - window.innerWidth, wide };
  });
  expect(overflow.by, `${page.url()} overflows: ${overflow.wide.join(" | ")}`).toBeLessThanOrEqual(0);
}
