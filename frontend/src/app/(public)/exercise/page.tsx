import type { Metadata } from "next";
import { ExerciseFeature } from "@/components/exercise-feature";
import { ChecklistPanel, MovementGate } from "@/components/personal-panels";
import { ExercisePlanPanel, SleepTracker } from "@/components/planning-panels";
import { Container } from "@/components/shell";
import { Tabs, type TabDef } from "@/components/tabs";
import {
  ApiDown,
  ArticleRow,
  BulletList,
  ByTrimester,
  CareNote,
  ScreenHeader,
  SectionHeading,
} from "@/components/topic";
import { TRIMESTER_NAMES } from "@/components/week-hero";
import { getActivities, getAllWeekGuides, getArticleLibrary } from "@/lib/public-api";
import { articlesAbout, sectionByTrimester, TOPIC_WORDS, uniqueItems, type Trimester } from "@/lib/topics";

export const metadata: Metadata = {
  title: "Exercise and movement in pregnancy",
  description:
    "Gentle, pregnancy-appropriate exercises for each trimester, with step-by-step instructions and the signs that mean you should stop and get help.",
  alternates: { canonical: "/exercise" },
};

export default async function ExercisePage() {
  const [{ guides, reachable }, library, activities] = await Promise.all([
    getAllWeekGuides(),
    getArticleLibrary(),
    getActivities(),
  ]);
  const move = sectionByTrimester(guides, (g) => g.sections.move);
  const getHelp = uniqueItems(guides.flatMap((g) => (g ? [g.sections.whenToGetHelp] : [])));

  const forTrimester = (t: Trimester | null) =>
    activities ? (
      <ExerciseFeature activities={t ? activities.filter((a) => a.sections.trimesters.includes(t)) : activities} />
    ) : (
      <ApiDown what="exercises" />
    );

  const tabs: TabDef[] = [
    { id: "all", label: "All", content: forTrimester(null) },
    ...([1, 2, 3] as Trimester[]).map((t) => ({
      id: `t${t}`,
      label: TRIMESTER_NAMES[t],
      content: forTrimester(t),
    })),
  ];

  return (
    <Container>
      <ScreenHeader
        title="Exercise & Wellness"
        subtitle="Safe, gentle exercises for every stage of pregnancy."
        fallback="/"
        fallbackLabel="Back"
      />

      <MovementGate>
        <Tabs label="Trimester" tabs={tabs} />
      </MovementGate>

      <div className="mt-10 grid gap-10">
        <ExercisePlanPanel />

        <section id="by-week" className="scroll-mt-24">
          <SectionHeading title="Movement, trimester by trimester" intro="The movement advice from each week's guide." />
          <MovementGate>
            {reachable ? (
              <ByTrimester
                groups={move}
                render={(text) => <p>{text}</p>}
                empty="No week guides with movement advice are published for this trimester yet."
              />
            ) : (
              <ApiDown what="week guides" />
            )}
          </MovementGate>
        </section>

        <section id="get-help" className="scroll-mt-24">
          <SectionHeading
            title="Stop and get help"
            intro="Stop exercising and contact your midwife, doctor or maternity unit straight away if any of these happen. In an emergency, call your local emergency number."
          />
          <div className="rounded-3xl border border-danger/20 bg-danger-soft p-5 sm:p-6">
            {!reachable ? (
              <ApiDown what="warning signs" />
            ) : getHelp.length > 0 ? (
              <BulletList items={getHelp} tone="danger" />
            ) : (
              <p>
                The list of warning signs isn&apos;t published yet. If something feels wrong, stop and
                contact your midwife or doctor.
              </p>
            )}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <SleepTracker />
          <ChecklistPanel
            title="Activity to-dos"
            categories={["fitness"]}
            emptyText="There are no activity items on your checklist yet."
          />
        </div>

        <section>
          <SectionHeading title="Reading about exercise" />
          <ArticleRow
            articles={library && articlesAbout(library, TOPIC_WORDS.exercise)}
            empty="No exercise articles are published yet."
          />
        </section>

        <CareNote>
          This is general information, not an exercise prescription. Your midwife or doctor can
          tell you what&apos;s safe for you, especially if you have a complication, were very
          active before pregnancy, or haven&apos;t exercised for a while.
        </CareNote>
      </div>
    </Container>
  );
}
