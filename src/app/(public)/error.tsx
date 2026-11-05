"use client";

import { Container } from "@/components/shell";
import { Button, Card } from "@/components/ui";

export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container wide={false}>
      <Card className="mx-auto max-w-xl text-center">
        <h1 className="font-sans text-3xl font-bold">This page couldn&apos;t load</h1>
        <p className="mt-3 text-muted">
          We couldn&apos;t reach our content service. Check your connection and try again.
        </p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </Card>
    </Container>
  );
}
