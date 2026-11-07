import { expect, test } from "@playwright/test";
import { isoDaysAgo, onboard, signUp } from "./helpers";

test("topic pages show reviewed week content and sign-in prompts for visitors", async ({ page }) => {
  await page.goto("/nutrition");
  await expect(page.getByRole("heading", { name: "Today's Meal Plan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your Nutrition Tips" })).toBeVisible();
  // The weekly tab holds the reviewed advice; seed data has first-trimester guides.
  await page.getByRole("tab", { name: "Weekly Plan" }).click();
  await expect(page.getByText(/weeks? with guidance/).first()).toBeVisible();
  await expect(page.locator("details[open]").getByRole("link", { name: /^Weeks? \d+/ }).first()).toBeVisible();
  // Hash links open the right tab.
  await page.goto("/nutrition#by-week");
  await expect(page.getByRole("tab", { name: "Weekly Plan" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Your food preferences" })).toBeVisible();

  await page.goto("/exercise");
  await expect(page.getByRole("heading", { level: 1, name: "Exercise & Wellness" })).toBeVisible();
  await page.getByRole("tab", { name: "First trimester" }).click();
  const start = page.getByRole("button", { name: "Start exercise" }).filter({ visible: true });
  await start.click();
  await expect(page.getByText("Stop and get help if:").filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "Brisk walk" }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Brisk walk" }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stop and get help" })).toBeVisible();

  await page.goto("/baby-care");
  await expect(page.getByRole("heading", { name: "Newborn checklist" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Newborn Care Tips" })).toBeVisible();

  await page.goto("/birth-and-postpartum");
  await expect(page.getByRole("heading", { level: 1, name: "Birth Preparation" })).toBeVisible();
  await page.goto("/postpartum");
  await expect(page.getByRole("heading", { level: 1, name: "Postpartum Care" })).toBeVisible();
});

test("signed-in topic pages show saved preferences and save checklist progress", async ({ page }) => {
  await signUp(page);
  await onboard(page, 12);

  await page.goto("/nutrition");
  await expect(page.getByText(/From your week 12 guide/)).toBeVisible();
  const prefs = page.locator("section", { has: page.getByRole("heading", { name: "Your food preferences" }) });
  await expect(prefs.getByText("Diet", { exact: true })).toBeVisible();
  await expect(prefs.getByRole("link", { name: "Edit preferences" })).toHaveAttribute("href", "/settings");

  const todo = page.locator("section", { has: page.getByRole("heading", { name: "Nutrition to-dos" }) });
  const box = todo.getByRole("checkbox").first();
  await box.click();
  await expect(box).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(
    page.locator("section", { has: page.getByRole("heading", { name: "Nutrition to-dos" }) }).getByRole("checkbox").first(),
  ).toHaveAttribute("aria-checked", "true");

  // The signed-in frame shows the design's sidebar.
  const side = page.getByRole("navigation", { name: "App" });
  await expect(side.getByRole("link", { name: "Meal Plan" })).toHaveAttribute("aria-current", "page");
  await side.getByRole("link", { name: "Postpartum Care" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Postpartum Care" })).toBeVisible();
});

test("signed-in planning: meal plan, hydration, shopping, exercise, sleep, appointments, birth and newborn", async ({ page }) => {
  await signUp(page);
  await onboard(page, 30);
  const panel = (name: string | RegExp) => page.locator("section", { has: page.getByRole("heading", { name }) });

  // Nutrition: today's plan, eaten tick survives a reload, hydration counter.
  await page.goto("/nutrition");
  const meals = panel("Today's meal plan");
  const firstMeal = meals.getByRole("checkbox").first();
  await expect(firstMeal).toBeVisible();
  await firstMeal.click();
  await expect(firstMeal).toHaveAttribute("aria-checked", "true");
  await panel("Hydration tracker").getByRole("button", { name: "One more glass" }).click();
  await expect(panel("Hydration tracker").getByText("1", { exact: true })).toBeVisible();
  await page.reload();
  await expect(panel("Today's meal plan").getByRole("checkbox").first()).toHaveAttribute("aria-checked", "true");
  await expect(panel("Hydration tracker").getByText("1", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Weekly Plan" }).click();
  await expect(panel("This week's meal plan").getByText("Today")).toBeVisible();

  await page.getByRole("tab", { name: "Recipes" }).click();
  await page.getByRole("button", { name: "Dinner", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Spinach dal with rice" })).toBeVisible();

  await page.getByRole("tab", { name: "Shopping List" }).click();
  const shop = panel("Shopping list");
  await shop.getByRole("button", { name: "Add this week's meal plan" }).click();
  await expect(shop.getByText(/Added \d+ items? from this week/)).toBeVisible();
  // Checked items move to the end of the list, so pin the item by its id rather than by
  // position, then click and assert (check() also asserted synchronously).
  const itemId = await shop.getByRole("checkbox").first().getAttribute("id");
  const item = shop.locator(`[id="${itemId}"]`);
  await item.click();
  await expect(item).toBeChecked();
  await shop.getByRole("button", { name: /Clear 1 checked/ }).click();
  await expect(shop.getByRole("button", { name: /Clear \d+ checked/ })).toHaveCount(0);

  // Exercise: week 30 plan, mark one done, sleep tracker saves.
  await page.goto("/exercise");
  const plan = panel(/Your exercise plan — week 30/);
  await expect(plan).toBeVisible();
  const act = plan.getByRole("checkbox").first();
  await act.click();
  await expect(act).toHaveAttribute("aria-checked", "true");
  await expect(plan.getByText(/1 of \d+ done today/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Other exercises" }).filter({ visible: true })).toBeVisible();
  await panel("Sleep tracker").getByLabel("How long did you sleep last night?").selectOption("450");
  await page.reload();
  await expect(panel("Sleep tracker").getByLabel("How long did you sleep last night?")).toHaveValue("450");

  // Birth: appointment, birth preferences, hospital bag.
  await page.goto("/birth-and-postpartum");
  const appts = panel("Appointments");
  await appts.getByRole("button", { name: "Add appointment" }).click();
  await appts.getByLabel("Type").selectOption("scan");
  await appts.getByLabel("Date").fill(isoDaysAgo(-7));
  await appts.getByLabel("Questions to ask (one per line)").fill("Is baby head down?");
  await appts.getByRole("button", { name: "Save appointment" }).click();
  await expect(appts.getByText("Is baby head down?")).toBeVisible();

  const birth = panel("Birth preferences");
  await birth.getByLabel("Where would you like to give birth?").selectOption("hospital");
  await birth.getByRole("button", { name: "Gas and air" }).click();
  await birth.getByRole("button", { name: "Save preferences" }).click();
  await expect(birth.getByText(/Saved\./)).toBeVisible();
  await page.reload();
  await expect(panel("Birth preferences").getByLabel("Where would you like to give birth?")).toHaveValue("hospital");
  await expect(panel("Hospital bag and birth checklist").getByText("Pack your maternity notes")).toBeVisible();

  // Baby care: newborn checklist grouped by section, with progress saved.
  await page.goto("/baby-care");
  const newborn = panel("Newborn checklist");
  await newborn.getByRole("button", { name: /^Safe sleep/ }).click();
  const sleepTask = newborn.getByRole("checkbox").first();
  await sleepTask.click();
  await expect(sleepTask).toHaveAttribute("aria-checked", "true");
  await expect(newborn.getByRole("button", { name: /^Safe sleep 1\// })).toBeVisible();

  await page.goto("/postpartum");
  await expect(page.getByRole("heading", { name: "The first weeks at home" })).toBeVisible();
  await expect(page.getByText("Recovering after the birth").first()).toBeVisible();
});
