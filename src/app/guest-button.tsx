"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui";
import { errorMessage } from "@/lib/api";

/** Starts an anonymous session, or goes straight to the app when one already exists. */
export function GuestButton({ label = "Try it without an account" }: { label?: string }) {
  const { me, startGuest } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      if (!me) await startGuest();
      router.push("/dashboard");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="secondary" busy={busy} onClick={start}>
        {me ? "Open my dashboard" : label}
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
