import { expect, test } from "@playwright/test";
import { onboard, signUp } from "./helpers";

test.describe.configure({ mode: "serial" });

test("journal, checklist, reminders and timeline persist through the API", async ({ page }) => {
  await signUp(page);
  await onboard(page, 16);

  // Journal
  await page.goto("/journal");
  await page.getByRole("button", { name: "Back pain", exact: true }).click();
  await page.getByLabel("Notes").fill("Felt the first flutters");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Back pain", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Notes")).toHaveValue("Felt the first flutters");

  // Checklist
  await page.goto("/checklist");
  const box = page.getByRole("checkbox").first();
  await box.click();
  await expect(box).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByRole("checkbox").first()).toHaveAttribute("aria-checked", "true");

  // Reminders
  await page.goto("/reminders");
  await page.getByLabel("Label (optional)").fill("Evening check-in");
  await page.getByRole("button", { name: "Add reminder" }).click();
  await expect(page.getByText("Evening check-in")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Evening check-in")).toBeVisible();

  // Dashboard reflects the saved data
  await page.goto("/dashboard");
  await expect(page.getByText(/Logged today: Back pain/)).toBeVisible();
  await expect(page.getByText("Evening check-in")).toBeVisible();

  // Timeline week navigation
  await page.goto("/timeline");
  await expect(page.getByText("Current week")).toBeVisible();
  await page.getByRole("link", { name: "Next week" }).click();
  await expect(page).toHaveURL(/week=17/);
  await page.getByRole("link", { name: "Back to my current week (16)" }).click();
  await expect(page).toHaveURL(/\/timeline$/);
});

test("privacy: export downloads a file and deletion removes the account", async ({ page }) => {
  await signUp(page);
  await onboard(page, 10);
  await page.goto("/settings?tab=privacy");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download my data" }).click();
  expect((await download).suggestedFilename()).toMatch(/pregnancy-care-export-.*\.json/);

  const remove = page.getByRole("button", { name: "Delete permanently" });
  await expect(remove).toBeDisabled();
  await page.getByLabel('Type "DELETE" to confirm').fill("DELETE");
  await remove.click();
  await expect(page).toHaveURL(/\/goodbye/);
  await expect(page.getByRole("heading", { name: "Your data has been deleted" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("withdrawing consent blocks saving new health details", async ({ page }) => {
  await signUp(page);
  await onboard(page, 8);
  await page.goto("/settings?tab=consent");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Withdraw" }).first().click();
  await expect(page.getByRole("button", { name: "Allow" }).first()).toBeVisible();
  // Existing data stays readable (and exportable); new health data can't be saved.
  await page.goto("/journal");
  await page.getByRole("button", { name: "Nausea", exact: true }).click();
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /consent/i })).toBeVisible();
});
