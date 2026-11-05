import type { Metadata } from "next";
import { Container } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms for using Pregnancy Care.",
  alternates: { canonical: "/terms" },
};

const TERMS = [
  ["Information, not medical advice", "Pregnancy Care provides general information. It does not diagnose, treat or replace care from your midwife, doctor or maternity unit. In an emergency, call your local emergency number."],
  ["Your account", "Keep your password safe and use a strong one. You are responsible for activity on your account. You can delete it at any time from Settings."],
  ["Due dates are estimates", "Dates and weeks are calculated from the information you give. Your care team's dates take priority."],
  ["Content", "Guides and articles are reviewed by clinicians before publishing and reviewed again on a schedule. Each one shows when it was reviewed and its sources."],
  ["Changes", "If these terms or our privacy notice change, we'll show the new version and ask again where your consent is needed."],
];

export default function TermsPage() {
  return (
    <Container wide={false}>
      <PageHeader title="Terms of use" subtitle="The short version of how this service works." />
      <ol className="grid gap-4">
        {TERMS.map(([title, body], i) => (
          <li key={title}>
            <Card>
              <h2 className="font-sans text-xl font-bold">
                {i + 1}. {title}
              </h2>
              <p className="mt-2 max-w-prose leading-relaxed">{body}</p>
            </Card>
          </li>
        ))}
      </ol>
    </Container>
  );
}
