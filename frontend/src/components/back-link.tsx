"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";

/** "Back to Dashboard" for signed-in visitors; otherwise back to `fallback`. */
export function BackLink({ fallback = "/journey", fallbackLabel = "Back to journey" }: { fallback?: string; fallbackLabel?: string }) {
  const { me } = useSession();
  return (
    <Link
      href={me ? "/dashboard" : fallback}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-clay-strong"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {me ? "Back to Dashboard" : fallbackLabel}
    </Link>
  );
}
