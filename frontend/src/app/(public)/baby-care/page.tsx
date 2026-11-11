import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Heart, LeafBranch } from "@/components/decor";
import { PreparationChecklist } from "@/components/planning-panels";
import { Container } from "@/components/shell";
import {
  ApiDown,
  ArticleRow,
  BulletList,
  ByTrimester,
  CareNote,
  ScreenHeader,
  SectionHeading,
} from "@/components/topic";
import { getAllWeekGuides, getArticleLibrary, getArticlesIn } from "@/lib/public-api";
import { articlesAbout, sectionByTrimester, TOPIC_WORDS, uniqueItems } from "@/lib/topics";

export const metadata: Metadata = {
  title: "Baby care preparation",
  description:
    "Get ready for your baby with a practical checklist, newborn care reading and week-by-week development, from guides reviewed by clinicians.",
  alternates: { canonical: "/baby-care" },
};

const NEWBORN_CATEGORIES = [
  "newborn_clothing",
  "diapering",
  "bathing_hygiene",
  "feeding",
  "breastfeeding",
  "safe_sleep",
  "car_seat",
  "newborn_appointments",
];

export default async function BabyCarePage() {
  const [{ guides, reachable }, library, newborn] = await Promise.all([
    getAllWeekGuides(),
    getArticleLibrary(),
    getArticlesIn(["newborn_care", "breastfeeding"]),
  ]);
  const development = sectionByTrimester(guides, (g) => g.sections.baby);
  const prepare = uniqueItems(guides.flatMap((g) => (g && g.week >= 28 ? [g.sections.prepare] : [])));
  const byWords = library ? articlesAbout(library, TOPIC_WORDS.baby) : [];
  const babyArticles =
    library || newborn
      ? [...(newborn ?? []), ...byWords.filter((a) => !newborn?.some((n) => n.slug === a.slug))]
      : null;
  const tip = babyArticles?.[0];

  return (
    <Container>
      <ScreenHeader title="Baby Care Preparation" subtitle="Get ready for your little one." fallback="/" fallbackLabel="Back" />

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div id="checklist" className="scroll-mt-24">
          <PreparationChecklist
            title="Newborn checklist"
            categories={NEWBORN_CATEGORIES}
            emptyText="Newborn preparation items, like clothes, feeding, safe sleep and the car seat, aren't on the checklist yet."
          />
        </div>

        <div className="grid content-start gap-5">
          <div className="relative">
            <Heart className="absolute -left-2 top-6 z-10 size-7 text-[#f08aa5]" />
            <Heart className="absolute right-6 -top-2 z-10 size-5 text-[#f5a3b8]" />
            <LeafBranch flip className="absolute -bottom-6 -right-4 z-10 h-40 w-28" />
            <Image
              src="/assets/photos/newborn-teddy.jpg"
              alt="A baby in a knitted hat yawning next to a white teddy bear"
              width={900}
              height={760}
              sizes="(min-width: 1024px) 34rem, 100vw"
              className="aspect-[6/5] w-full rounded-3xl object-cover shadow-soft"
            />
          </div>
          <section id="tips" className="scroll-mt-24 rounded-3xl bg-linear-to-br from-blush to-paper-2 p-5 shadow-soft">
            <h2 className="font-sans text-lg font-bold">Newborn Care Tips</h2>
            {tip ? (
              <>
                <p className="mt-1 text-sm text-muted">{tip.title}</p>
                <Link
                  href={`/articles/${tip.slug}`}
                  className="mt-3 inline-block rounded-xl bg-card px-4 py-2 text-sm font-bold text-clay-strong shadow-soft hover:underline"
                >
                  Read Guide →
                </Link>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">
                Guides for feeding, bathing, cord care, nappy changes and safe sleep will appear
                in{" "}
                <Link href="/articles" className="font-semibold text-clay-strong underline">
                  Learn
                </Link>{" "}
                as they&apos;re reviewed and published.
              </p>
            )}
          </section>
        </div>
      </div>

      <div className="mt-10 grid gap-10">
        <section>
          <SectionHeading
            id="development"
            title="Baby development"
            intro="What's happening for your baby, from each week's reviewed guide. Open a week to read it in full."
          />
          {reachable ? (
            <ByTrimester
              groups={development}
              render={(text) => <p>{text}</p>}
              empty="No week guides are published for this trimester yet."
            />
          ) : (
            <ApiDown what="week guides" />
          )}
        </section>

        <section className="rounded-3xl border border-white/80 bg-card p-5 shadow-soft sm:p-6">
          <h2 className="font-sans text-lg font-bold">From the third-trimester guides</h2>
          <div className="mt-4">
            {!reachable ? (
              <ApiDown what="week guides" />
            ) : prepare.length > 0 ? (
              <BulletList items={prepare} tone="sage" />
            ) : (
              <p className="text-muted">The third-trimester preparation lists aren&apos;t published yet.</p>
            )}
          </div>
        </section>

        <section>
          <SectionHeading title="Articles about babies and newborns" />
          <ArticleRow articles={babyArticles} empty="No baby or newborn articles are published yet." />
        </section>

        <CareNote>
          This is general information, not medical care for your baby. If your newborn seems
          unwell, isn&apos;t feeding, or you&apos;re worried, contact your midwife, health visitor
          or doctor. In an emergency, call your local emergency number.
        </CareNote>
      </div>
    </Container>
  );
}
