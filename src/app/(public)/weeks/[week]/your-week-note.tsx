"use client";

import Link from "next/link";
import { useSession } from "@/components/session-provider";
import type { Pregnancy } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** For signed-in visitors: how this week relates to theirs. Rendered only in the browser. */
export function YourWeekNote({ week }: { week: number }) {
  const { me } = useSession();
  const pregnancy = useApi<Pregnancy>(me ? "/v1/pregnancies/current" : null);
  const current = pregnancy.data?.week;
  if (!current) return null;

  return (
    <p className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-3xl bg-clay-soft px-5 py-3 text-sm text-clay-strong">
      <span>
        {current === week
          ? "This is your current week."
          : `You're in week ${current}.`}
      </span>
      <span className="flex gap-4 font-semibold">
        {current !== week && (
          <Link href={`/weeks/${current}`} className="underline">
            Go to week {current}
          </Link>
        )}
        <Link href="/timeline" className="underline">
          My pregnancy overview
        </Link>
      </span>
    </p>
  );
}

