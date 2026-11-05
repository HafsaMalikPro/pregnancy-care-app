import { Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LeafBranch } from "@/components/decor";
import { ChecklistPanel, FoodPreferencesPanel, NutritionTips } from "@/components/personal-panels";
import { HydrationTracker, MealPlanPanel, RecipeBrowser, ShoppingListPanel } from "@/components/planning-panels";
import { Container } from "@/components/shell";
import { Tabs } from "@/components/tabs";
import {
  ApiDown,
  ArticleRow,
  BulletList,
  ByTrimester,
  CareNote,
  ScreenHeader,
  SectionHeading,
} from "@/components/topic";
import { getAllWeekGuides, getArticleLibrary, getRecipes } from "@/lib/public-api";
import { articlesAbout, sectionByTrimester, TOPIC_WORDS, uniqueItems } from "@/lib/topics";

export const metadata: Metadata = {
  title: "Nutrition in pregnancy",
  description:
    "What to eat and what to be careful with, trimester by trimester, from week guides reviewed by clinicians.",
  alternates: { canonical: "/nutrition" },
};


const card = "rounded-3xl border border-white/80 bg-card p-5 shadow-soft";

export default async function NutritionPage() {
  const [{ guides, reachable }, library, recipeList] = await Promise.all([
    getAllWeekGuides(),
    getArticleLibrary(),
    getRecipes(),
  ]);
  const eat = sectionByTrimester(guides, (g) => g.sections.eat);
  const generalTips = uniqueItems([guides.flatMap((g) => (g?.sections.eat ? [g.sections.eat] : []))]);
  const avoid = uniqueItems(guides.flatMap((g) => (g ? [g.sections.avoid] : [])));
  const articles = library && articlesAbout(library, TOPIC_WORDS.nutrition);

  const daily = (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr_0.9fr]">
        <MealPlanPanel />

        <div className="grid content-start gap-5">
          {reachable ? <NutritionTips general={generalTips} /> : <ApiDown what="nutrition tips" />}
          <HydrationTracker />
        </div>

        <div className="relative hidden lg:block">
          <LeafBranch flip className="absolute -right-4 bottom-0 h-56 w-40" />
          <Image
            src="/assets/photos/fruit-bowl.jpg"
            alt="A wooden bowl of berries and grapes"
            width={720}
            height={720}
            sizes="22rem"
            className="relative aspect-square w-full rounded-full object-cover shadow-soft"
          />
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-4 rounded-3xl bg-linear-to-r from-blush to-card p-5 shadow-soft">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-[#fff1cf] text-[#d9952b]">
          <Lightbulb className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-sans text-base font-bold">Food Safety</h2>
          <p className="text-sm text-muted">
            {avoid.length
              ? `Be careful with: ${avoid.slice(0, 3).join(", ").toLowerCase()}${avoid.length > 3 ? ", and more" : ""}.`
              : "The reviewed list of foods to be careful with isn't published yet."}
          </p>
        </div>
        <Link href="#careful" className="text-sm font-bold text-clay-strong hover:underline">
          Learn More →
        </Link>
      </section>
    </div>
  );

  const weekly = (
    <div className="grid gap-8">
      <MealPlanPanel days={7} />
      {reachable ? (
    <section id="by-week" className="scroll-mt-24">
      <SectionHeading title="What to eat, week by week" intro="The eating advice from each week's reviewed guide." />
      <ByTrimester
        groups={eat}
        render={(text) => <p>{text}</p>}
        empty="No week guides with eating advice are published for this trimester yet."
      />
    </section>
      ) : (
        <ApiDown what="week guides" />
      )}
    </div>
  );

  const recipes = (
    <div className="grid gap-5">
      <section>
        <SectionHeading
          title="Recipes"
          intro="Pregnancy-safe recipes with ingredients, method and allergy information. Open one to see how to make it."
        />
        {recipeList ? (
          recipeList.length ? <RecipeBrowser recipes={recipeList} /> : <p className="text-muted">No recipes are published yet.</p>
        ) : (
          <ApiDown what="recipes" />
        )}
      </section>
      <section>
        <SectionHeading title="Articles about food and nutrition" />
        <ArticleRow articles={articles} empty="No nutrition articles are published yet." />
      </section>
    </div>
  );

  const shopping = <ShoppingListPanel />;


  return (
    <Container>
      <ScreenHeader
        title="Nutrition & Meal Plan"
        subtitle="Healthy eating for you and your baby, from week guides reviewed by clinicians."
        fallback="/"
        fallbackLabel="Back"
      />

      <Tabs
        label="Nutrition"
        tabs={[
          { id: "daily", label: "Daily Plan", content: daily },
          { id: "weekly", label: "Weekly Plan", content: weekly, anchors: ["by-week"] },
          { id: "recipes", label: "Recipes", content: recipes },
          { id: "shopping", label: "Shopping List", content: shopping },
        ]}
      />

      <div className="mt-10 grid gap-10">
        {reachable && avoid.length > 0 && (
          <section id="careful" className="scroll-mt-24">
            <SectionHeading
              title="Foods to be careful with"
              intro="Collected from every published week guide. Ask your midwife or doctor if you're unsure about something you eat."
            />
            <div className={card}>
              <BulletList items={avoid} tone="danger" />
            </div>
          </section>
        )}

        <FoodPreferencesPanel />

        <ChecklistPanel
          title="Nutrition to-dos"
          categories={["nutrition"]}
          emptyText="There are no nutrition items on your checklist yet."
        />

        <CareNote>
          This is general information, not a personal diet plan. If you have a medical
          condition, food allergies, or were advised to change how you eat, ask your midwife,
          doctor or a registered dietitian what&apos;s right for you. Pregnancy Care doesn&apos;t
          offer weight-loss plans.
        </CareNote>
      </div>
    </Container>
  );
}
