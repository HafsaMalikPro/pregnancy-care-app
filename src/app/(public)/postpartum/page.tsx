import type { Metadata } from "next";
import { OutcomeNote } from "@/components/outcome-note";
import { PreparationChecklist } from "@/components/planning-panels";
import { Container } from "@/components/shell";
import { ArticleRow, CareNote, NotAvailable, ScreenHeader, SectionHeading } from "@/components/topic";
import { getArticleLibrary, getArticlesIn } from "@/lib/public-api";
import { articlesAbout, TOPIC_WORDS } from "@/lib/topics";

export const metadata: Metadata = {
  title: "Postpartum care",
  description: "Recovery, feeding, your wellbeing and follow-up care after the birth.",
  alternates: { canonical: "/postpartum" },
};

export default async function PostpartumPage() {
  const [library, recovery] = await Promise.all([
    getArticleLibrary(),
    getArticlesIn(["postpartum", "mental_wellbeing", "warning_signs", "breastfeeding", "newborn_care"]),
  ]);
  const byWords = library ? articlesAbout(library, TOPIC_WORDS.birth) : [];
  const articles =
    library || recovery
      ? [...(recovery ?? []), ...byWords.filter((a) => !recovery?.some((r) => r.slug === a.slug))]
      : null;

  return (
    <Container>
      <ScreenHeader
        title="Postpartum Care"
        subtitle="Recovery, feeding, your wellbeing and follow-up care after the birth."
        fallback="/journey"
        fallbackLabel="Back"
      />
      <div className="grid gap-10">
        <OutcomeNote />
        <section>
          <SectionHeading title="Reading for after the birth" />
          <ArticleRow articles={articles} empty="No articles about birth or recovery are published yet." />
        </section>
        <PreparationChecklist
          title="The first weeks at home"
          categories={["postpartum_home", "newborn_appointments"]}
          emptyText="There are no after-the-birth items on your checklist yet."
        />
        <NotAvailable title="Week-by-week recovery guide">
          A week-by-week guide to recovery after the birth isn&apos;t published yet. Your
          midwife, health visitor or doctor will check on you and your baby in the first weeks.
        </NotAvailable>
        <CareNote>
          Contact your midwife, doctor or maternity unit straight away if you&apos;re worried
          about yourself or your baby after the birth. In an emergency, call your local
          emergency number.
        </CareNote>
      </div>
    </Container>
  );
}
