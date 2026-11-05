import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Pregnancy Care stores, why, and how you stay in control of it.",
  alternates: { canonical: "/privacy" },
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "What we store",
    body: "Your account details (name, email and a securely hashed password), and the pregnancy details you add: due date and how it was worked out, journal entries, checklist progress, reminders and preferences such as your time zone.",
  },
  {
    title: "We ask before storing health information",
    body: "Pregnancy and journal details are only saved after you agree to health-data processing. Each choice is recorded with its date and the version of this notice. You can withdraw it in Settings at any time.",
  },
  {
    title: "Optional extras",
    body: "Product analytics and occasional emails are off unless you turn them on, and you can turn them off again whenever you like.",
  },
  {
    title: "Guest mode",
    body: "Without an account, your data is tied to a secret key kept in this browser. If you clear your browser data, you lose access to it. Creating an account moves it across.",
  },
  {
    title: "Your rights",
    body: (
      <>
        From{" "}
        <Link href="/settings?tab=privacy" className="font-semibold text-clay-strong underline">
          Settings
        </Link>{" "}
        you can download everything we hold about you as a file, and delete your account and
        all its data straight away.
      </>
    ),
  },
  {
    title: "Medical information",
    body: "Weekly guides and articles are general information reviewed by clinicians. They don't replace advice from your midwife or doctor.",
  },
];

export default function PrivacyPage() {
  return (
    <Container wide={false}>
      <PageHeader
        title="Privacy policy"
        subtitle="A plain-language summary of how Pregnancy Care handles your information. Policy version 2026-10-01."
      />
      <div className="grid gap-4">
        {SECTIONS.map((s) => (
          <Card key={s.title}>
            <h2 className="font-sans text-xl font-bold">{s.title}</h2>
            <p className="mt-2 max-w-prose leading-relaxed">{s.body}</p>
          </Card>
        ))}
      </div>
    </Container>
  );
}
