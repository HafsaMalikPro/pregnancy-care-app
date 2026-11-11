import type { Metadata } from "next";
import { Container } from "@/components/shell";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Data deleted", robots: { index: false } };

/** Shown after the API confirms a deletion (it answers only once the data is gone). */
export default function GoodbyePage() {
  return (
    <Container wide={false}>
      <Card className="mx-auto max-w-xl text-center">
        <h1 className="font-sans text-3xl font-bold">Your data has been deleted</h1>
        <p className="mt-3 text-muted">
          Everything linked to your account or guest session has been removed, and you&apos;ve
          been signed out on every device. Thank you for using Pregnancy Care.
        </p>
        <ButtonLink href="/" className="mt-6">
          Back to home
        </ButtonLink>
      </Card>
    </Container>
  );
}
