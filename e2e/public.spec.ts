import { expect, test } from "@playwright/test";

test("homepage shows the hero, calls to action and real content", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Your Complete Pregnancy Journey, From First Week to Baby's First Days." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Start Your Journey" }).first()).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("heading", { name: "Your 9-Month Journey at a Glance" })).toBeVisible();
  await page.getByRole("link", { name: "Explore Guide" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your pregnancy journey" })).toBeVisible();
});

test("main navigation menus reach every public section", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  const sections: [string, string, string][] = [
    ["Journey", "Pregnancy journey", "Your pregnancy journey"],
    ["Journey", "Week by week", "Your baby, week by week"],
    ["Nutrition", "Nutrition overview", "Nutrition & Meal Plan"],
    ["Exercise", "Exercise overview", "Exercise & Wellness"],
    ["Baby Care", "Baby care overview", "Baby Care Preparation"],
    ["Learn", "All articles", "Learn"],
    ["Learn", "About Pregnancy Care", "A calm companion for the months ahead"],
  ];
  for (const [menu, link, heading] of sections) {
    await nav.getByRole("button", { name: menu }).click();
    await nav.getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  // Menus close with Escape and return focus to their button.
  const journey = nav.getByRole("button", { name: "Journey" });
  await journey.click();
  await expect(journey).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(journey).toHaveAttribute("aria-expanded", "false");
  await expect(journey).toBeFocused();
});

test("week guide navigation: strip, next/previous and browser history", async ({ page }) => {
  await page.goto("/weeks/12");
  await expect(page.getByRole("heading", { level: 1, name: "Week 12" })).toBeVisible();
  await page.getByRole("link", { name: "Week 13" }).last().click();
  await expect(page).toHaveURL(/\/weeks\/13$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/weeks\/12$/);
  // Tabs are keyboard operable.
  const baby = page.getByRole("tab", { name: "Baby" });
  if (await baby.count()) {
    await baby.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "You" })).toHaveAttribute("aria-selected", "true");
  }
  // The last week renders, whether or not a guide is published for it.
  await page.goto("/weeks/42");
  await expect(page.getByRole("heading", { level: 1, name: "Week 42" })).toBeVisible();
});

test("articles list opens a rendered article", async ({ page }) => {
  await page.goto("/articles");
  const first = page.locator("main a[href^='/articles/']").first();
  const title = (await first.locator("h2, h3").first().textContent())!.trim();
  await first.click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(/min read/)).toBeVisible();
});

test("unknown pages and slugs show the not-found page", async ({ page }) => {
  await page.goto("/articles/does-not-exist");
  await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  await page.goto("/weeks/99");
  await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
});

test("SEO files are served", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /dashboard");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/weeks/42");
});

test("private pages redirect visitors without a session to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
});
