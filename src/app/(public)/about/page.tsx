import { BookOpenCheck, LockKeyhole, Stethoscope, UserRoundCheck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/shell";
import { CareNote, TopicHero } from "@/components/topic";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "About Pregnancy Care",
  description:
    "What Pregnancy Care is, how its guidance is reviewed, and how it looks after your information.",
  alternates: { canonical: "/about" },
};

const POINTS = [
  {
    icon: BookOpenCheck,
    title: "Reviewed before it's published",
    text: "Week guides, articles and checklist items go through a clinical review before anyone sees them. Each one shows its sources and when it was last reviewed.",
  },
  {
    icon: Stethoscope,
    title: "Information, not diagnosis",
    text: "Pregnancy Care explains what's common and what to ask. It doesn't diagnose, assess your risk or replace your midwife or doctor.",
  },
  {
    icon: UserRoundCheck,
    title: "Built around your due date",
    text: "Add your due date, last period, scan or IVF transfer date, and every page shows where you are, week by week.",
  },
  {
    icon: LockKeyhole,
    title: "Your information stays yours",
    text: "Nothing about your health is saved until you agree. You can download or delete everything from Settings at any time.",
  },
];

export default function AboutPage() {
  return (
    <Container>
      <TopicHero
        title="A calm companion for the months ahead"
        intro="Pregnancy Care follows your pregnancy week by week, from the first scan to your baby's first days, with guidance reviewed by clinicians."
        art={
          <Image
            src="/assets/illustrations/mother-clean.png"
            alt="Illustration of a pregnant woman holding her bump"
            width={1179}
            height={1187}
            sizes="20rem"
            className="h-auto w-full"
          />
        }
      >
        <ButtonLink href="/signup" className="min-h-12 rounded-2xl! px-6">
          Start your journey
        </ButtonLink>
        <ButtonLink href="/journey" variant="secondary" className="min-h-12 rounded-2xl! px-6">
          Explore the pregnancy guide
        </ButtonLink>
      </TopicHero>

      <ul className="grid gap-5 sm:grid-cols-2">
        {POINTS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-3xl border border-line/70 bg-card p-6 shadow-soft">
            <Icon className="size-6 text-clay-strong" aria-hidden />
            <h2 className="mt-4 font-sans text-lg font-bold text-slate">{title}</h2>
            <p className="mt-2 leading-relaxed text-muted">{text}</p>
          </li>
        ))}
      </ul>

      <div className="mt-10 grid gap-4">
        <CareNote>
          If you think you or your baby may be in danger, call your local emergency number now.
          For anything else you&apos;re worried about, contact your midwife, doctor or maternity
          unit. Questions about Pregnancy Care itself?{" "}
          <Link href="/contact" className="font-semibold text-clay-strong underline">
            Contact us
          </Link>
          .
        </CareNote>
      </div>
    </Container>
  );
}
