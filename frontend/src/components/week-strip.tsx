"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { cx } from "./ui";

/** Scrollable row of weeks 1–42. Links go to `${basePath}${week}`. */
export function WeekStrip({
  selected,
  current,
  basePath,
}: {
  selected: number;
  current?: number;
  basePath: string;
}) {
  const selectedRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [selected]);

  return (
    <nav aria-label="Weeks" className="-mx-4 mb-6 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
      <ol className="flex gap-2">
        {Array.from({ length: 42 }, (_, i) => i + 1).map((w) => (
          <li key={w}>
            <Link
              ref={w === selected ? selectedRef : undefined}
              href={`${basePath}${w}`}
              scroll={false}
              aria-current={w === selected ? "page" : undefined}
              aria-label={`Week ${w}${w === current ? ", your current week" : ""}`}
              className={cx(
                "relative grid size-11 place-items-center rounded-full text-sm font-bold transition",
                w === selected
                  ? "bg-clay text-white shadow-soft"
                  : "border border-line bg-card text-ink hover:border-clay/50",
              )}
            >
              {w}
              {w === current && w !== selected && (
                <span aria-hidden className="absolute -bottom-0.5 size-1.5 rounded-full bg-clay" />
              )}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
