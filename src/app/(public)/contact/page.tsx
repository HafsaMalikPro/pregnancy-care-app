import { Mail, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Container } from "@/components/shell";
import { Alert, Card, IconBadge, PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Contact us",
  description: "How to get in touch with the Pregnancy Care team.",
  alternates: { canonical: "/contact" },
};

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export default function ContactPage() {
  return (
    <Container wide={false}>
      <PageHeader title="Contact us" subtitle="Questions about your account, your data or our content." />
      <div className="grid gap-4">
        <Alert tone="danger">
          We can&apos;t give medical advice. If you&apos;re worried about yourself or your baby,
          contact your midwife, doctor or maternity unit. In an emergency, call your local
          emergency number.
        </Alert>
        <Card className="flex items-start gap-4">
          <IconBadge>
            <Mail className="size-5" />
          </IconBadge>
          <div>
            <h2 className="font-sans text-xl font-bold">Email</h2>
            {SUPPORT_EMAIL ? (
              <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1 inline-block font-semibold text-clay-strong underline">
                {SUPPORT_EMAIL}
              </a>
            ) : (
              <p className="mt-1 text-muted">Our support address will be published here soon.</p>
            )}
          </div>
        </Card>
        <Card className="flex items-start gap-4">
          <IconBadge tone="sage">
            <ShieldCheck className="size-5" />
          </IconBadge>
          <div>
            <h2 className="font-sans text-xl font-bold">Your data</h2>
            <p className="mt-1 text-muted">
              You can download or delete your data yourself at any time from Settings, under
              Privacy and data.
            </p>
          </div>
        </Card>
      </div>
    </Container>
  );
}
