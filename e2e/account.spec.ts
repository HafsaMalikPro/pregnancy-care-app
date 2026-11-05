import { expect, test } from "@playwright/test";
import { PASSWORD, isoDaysAgo, onboard, signUp, uniqueEmail } from "./helpers";

test("sign-up validates the password before calling the API", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Short Password");
  await page.getByLabel("Email address").fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "at least 12 characters" })).toBeVisible();
});

test("onboarding validates dates, lets you edit, and saves only on confirm", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("button", { name: "Save choices and continue" })).toBeDisabled();
  await page.getByText("Store my pregnancy and health details").click();
  await page.getByRole("button", { name: "Save choices and continue" }).click();

  await page.getByText("Ultrasound dating").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Scan date").fill(isoDaysAgo(-3));
  await page.getByLabel("Weeks at scan").fill("10");
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "can't be in the future" })).toBeVisible();

  await page.getByLabel("Scan date").fill(isoDaysAgo(14));
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("About 12 weeks 0 days pregnant today")).toBeVisible();

  // Edit goes back to the dates; going back again keeps the entered values.
  await page.getByRole("button", { name: "Edit what you entered" }).click();
  await expect(page.getByLabel("Weeks at scan")).toHaveValue("10");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByRole("heading", { name: "You're 12 weeks 0 days along" })).toBeVisible();
});

test("dashboard, sign out, sign in and session restoration", async ({ page }) => {
  const email = await signUp(page);
  await onboard(page, 20);
  await expect(page.getByRole("heading", { level: 1, name: /Good (morning|afternoon|evening), Amira/ })).toBeVisible();
  await expect(page.getByText("Week 20 of 40")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Week 20 of 40")).toBeVisible();

  await page.goto("/settings?tab=account");
  await page.getByRole("button", { name: "Show my devices" }).click();
  await expect(page.getByText("This device")).toBeVisible();
  await page.getByLabel("Name").fill("Amira Renamed");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name updated.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out of this device" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("wrong password entirely");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /invalid/i })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Week 20 of 40")).toBeVisible();
});

test("guest mode works without an account", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as a guest" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByText("Guest mode: your data stays on this browser only.")).toBeVisible();
});
