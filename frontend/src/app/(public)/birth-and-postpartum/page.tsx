import type { Metadata } from "next";
import Link from "next/link";
import { OutcomeNote } from "@/components/outcome-note";
import { AppointmentsPanel, BirthPreferencesPanel, PreparationChecklist } from "@/components/planning-panels";
import { Container } from "@/components/shell";
import {
  ApiDown,
  BulletList,
  ByTrimester,
  CareNote,
  ScreenHeader,
  SectionHeading,
} from "@/components/topic";
import { getAllWeekGuides } from "@/lib/public-api";
import { sectionByTrimester, uniqueItems } from "@/lib/topics";

export const metadata: Metadata = {
  title: "Birth preparation",
  description:
    "Getting ready for the birth: third-trimester appointments, questions to ask and practical planning, from guides reviewed by clinicians.",
  alternates: { canonical: "/birth-and-postpartum" },
};

export default async function BirthPage() {
  const { guides, reachable } = await getAllWeekGuides();
  const third = guides.map((g) => (g && g.week >= 28 ? g : null));
  const visits = sectionByTrimester(third, (g) => g.sections.visits);
  const questions = uniqueItems(third.flatMap((g) => (g ? [g.sections.askAtVisit] : [])));

  return (
    <Container>
      <ScreenHeader
        title="Birth Preparation"
        subtitle="Third-trimester appointments, questions to ask and practical planning."
        fallback="/journey"
        fallbackLabel="Back"
      />

      <div className="grid gap-10">
        <OutcomeNote />

        <section className="grid gap-6">
          <SectionHeading
            id="birth"
            title="Birth preparation"
            intro="Third-trimester appointments, from the reviewed week guides."
          />
          {reachable ? (
            <ByTrimester
              groups={visits}
              render={(text) => <p>{text}</p>}
              empty="No appointment guidance is published for this trimester."
            />
          ) : (
            <ApiDown what="week guides" />
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border border-line/70 bg-card p-5 shadow-soft sm:p-6">
              <h3 className="font-sans text-lg font-bold">Questions you could ask</h3>
              <p className="mt-1 text-sm text-muted">
                Take these to your appointments, or note your own in your journal.
              </p>
              <div className="mt-4">
                {reachable && questions.length > 0 ? (
                  <BulletList items={questions} />
                ) : (
                  <p className="text-muted">No third-trimester questions are published yet.</p>
                )}
              </div>
            </div>
            <AppointmentsPanel />
          </div>

          <div id="plan" className="grid scroll-mt-24 gap-5 lg:grid-cols-2">
            <BirthPreferencesPanel />
            <PreparationChecklist
              title="Hospital bag and birth checklist"
              categories={["hospital_bag", "birth_preparation"]}
              emptyText="There are no hospital-bag or birth-preparation items on your checklist yet."
            />
          </div>
        </section>

        <p className="text-sm text-muted">
          Looking for recovery and the first weeks with your baby? See{" "}
          <Link href="/postpartum" className="font-semibold text-clay-strong underline">
            Postpartum care
          </Link>
          .
        </p>

        <CareNote>
          This is general information, not a birth plan. Your midwife or doctor will help you
          prepare for your own birth. If you&apos;re worried about yourself or your baby, contact
          your maternity unit straight away. In an emergency, call your local emergency number.
        </CareNote>
      </div>
    </Container>
  );
}
