"use client";

import { HeartHandshake } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import type { Page, Pregnancy } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/**
 * Shown on birth and postpartum pages when the person's most recent pregnancy has ended, so
 * the page acknowledges where they are instead of talking only about birth preparation.
 */
export function OutcomeNote() {
  const { me } = useSession();
  const list = useApi<Page<Pregnancy>>(me ? "/v1/pregnancies?limit=1" : null);
  const latest = list.data?.items[0];
  if (!latest || latest.status !== "ended") return null;

  if (latest.outcome === "birth") {
    return (
      <Note>
        Your pregnancy is marked as ended with a birth. Birth preparation is no longer for
        you; see{" "}
        <Link href="/postpartum" className="font-semibold text-clay-strong underline">
          postpartum care
        </Link>{" "}
        for the weeks after.
      </Note>
    );
  }
  return (
    <Note>
      Your pregnancy has ended. You don&apos;t need anything on this page right now. Your
      midwife or doctor can tell you about support and follow-up care, and you can{" "}
      <Link href="/settings" className="font-semibold text-clay-strong underline">
        manage your data and reminders
      </Link>{" "}
      whenever you&apos;re ready.
    </Note>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <aside className="flex gap-4 rounded-3xl bg-plum-soft p-5 leading-relaxed">
      <HeartHandshake className="mt-0.5 size-5 shrink-0 text-plum" aria-hidden />
      <p>{children}</p>
    </aside>
  );
}
