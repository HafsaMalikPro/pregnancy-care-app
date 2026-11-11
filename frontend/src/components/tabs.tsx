"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/lib/cx";

export interface TabDef {
  id: string;
  label: string;
  content: React.ReactNode;
  /** URL hashes (without #) that open this tab, e.g. section anchors inside it. */
  anchors?: string[];
}

/**
 * Pill tabs from the design. Arrow keys move between tabs; the URL hash selects a tab so
 * links like /nutrition#by-week land on the right one.
 */
export function Tabs({ tabs, label }: { tabs: TabDef[]; label: string }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const base = useId();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const tab = tabs.find((t) => t.id === hash || t.anchors?.includes(hash));
      if (!tab) return;
      setActive(tab.id);
      // Let the panel render, then bring the anchor into view.
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    const next =
      e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : null;
    if (next === null) return;
    e.preventDefault();
    setActive(tabs[next].id);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKey}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      >
        {tabs.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${base}-${t.id}-tab`}
              aria-selected={selected}
              aria-controls={`${base}-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              className={cx(
                "shrink-0 rounded-full border px-5 py-2 text-sm font-semibold transition",
                selected
                  ? "border-clay bg-linear-to-b from-clay to-clay-strong text-on-primary shadow-[0_8px_18px_-10px_rgb(208_50_95/0.8)]"
                  : "border-line bg-card text-slate hover:border-clay/40",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-${t.id}`}
          aria-labelledby={`${base}-${t.id}-tab`}
          hidden={t.id !== active}
          className="mt-5"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
