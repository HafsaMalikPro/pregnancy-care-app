"use client";

import { Badge } from "@/components/ui";
import type { ContentStatus, Reference } from "@/lib/types";

const STATUS_TONE = {
  draft: "neutral",
  in_review: "warn",
  approved: "info",
  published: "success",
  archived: "neutral",
} as const;

export function StatusBadge({ status }: { status: ContentStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status.replace("_", " ")}</Badge>;
}

/** One reference per line: "Title | https://url" (URL optional). */
export const parseReferences = (text: string): Reference[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, url] = line.split("|").map((s) => s.trim());
      return url ? { title, url } : { title };
    });

export const formatReferences = (refs: Reference[]) =>
  refs.map((r) => (r.url ? `${r.title} | ${r.url}` : r.title)).join("\n");

export const lines = (text: string) =>
  text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
