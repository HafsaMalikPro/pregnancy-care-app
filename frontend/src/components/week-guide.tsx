"use client";

import {
  Apple,
  Baby,
  CalendarHeart,
  Check,
  Footprints,
  HeartPulse,
  ListTodo,
  Phone,
} from "lucide-react";
import { useRef, useState } from "react";
import { formatDate } from "@/lib/dates";
import type { WeekGuide } from "@/lib/types";
import { Alert, Card, IconBadge, cx } from "./ui";

function List({ items, icon = "dot" }: { items: string[]; icon?: "dot" | "check" }) {
  return (
    <ul className="grid gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          {icon === "check" ? (
            <Check aria-hidden className="mt-0.5 size-4.5 shrink-0 text-sage" />
          ) : (
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-rose" />
          )}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const Sub = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-2 mt-5 text-sm font-bold text-heading">{children}</h3>
);

interface Tab {
  id: string;
  label: string;
  icon: typeof Baby;
  content: React.ReactNode;
}

/**
 * The reviewed guide for one week, in tabs. "When to get help" always stays visible.
 * `firstPregnancy` picks the matching personal note; `restrictExercise` swaps the movement
 * advice for a reminder to follow the clinician's advice.
 */
export function WeekGuideView({
  guide,
  firstPregnancy = null,
  restrictExercise = false,
}: {
  guide: WeekGuide;
  firstPregnancy?: boolean | null;
  restrictExercise?: boolean;
}) {
  const s = guide.sections;
  const note =
    firstPregnancy === true
      ? s.firstPregnancyNote
      : firstPregnancy === false
        ? s.subsequentPregnancyNote
        : null;

  const tabs: Tab[] = [
    {
      id: "baby",
      label: "Baby",
      icon: Baby,
      content: <p className="leading-relaxed">{s.baby}</p>,
    },
    {
      id: "you",
      label: "You",
      icon: HeartPulse,
      content: (
        <>
          <p className="leading-relaxed">{s.body}</p>
          {s.symptoms.length > 0 && (
            <>
              <Sub>Common this week</Sub>
              <List items={s.symptoms.map((x) => x.replaceAll("_", " "))} />
            </>
          )}
        </>
      ),
    },
    {
      id: "nutrition",
      label: "Nutrition",
      icon: Apple,
      content: (
        <>
          {s.eat && <p className="leading-relaxed">{s.eat}</p>}
          {s.avoid.length > 0 && (
            <>
              <Sub>Best avoided</Sub>
              <List items={s.avoid} />
            </>
          )}
        </>
      ),
    },
    {
      id: "activity",
      label: "Activity",
      icon: Footprints,
      content: restrictExercise ? (
        <p className="leading-relaxed">
          You told us your clinician has asked you to limit exercise, so we&apos;re not showing
          general movement tips. Follow the advice your midwife or doctor gave you.
        </p>
      ) : (
        <p className="leading-relaxed">{s.move}</p>
      ),
    },
    {
      id: "visits",
      label: "Appointments",
      icon: CalendarHeart,
      content: (
        <>
          {s.visits && <p className="leading-relaxed">{s.visits}</p>}
          {s.askAtVisit.length > 0 && (
            <>
              <Sub>Questions you could ask</Sub>
              <List items={s.askAtVisit} />
            </>
          )}
        </>
      ),
    },
    {
      id: "todo",
      label: "To-do",
      icon: ListTodo,
      content: (
        <>
          {s.checklist.length > 0 && <List items={s.checklist} icon="check" />}
          {s.prepare.length > 0 && (
            <>
              <Sub>Getting ready</Sub>
              <List items={s.prepare} />
            </>
          )}
        </>
      ),
    },
  ].filter((t) => hasContent(t.id, s));

  return (
    <div className="grid grid-cols-1 gap-5">
      {s.message && (
        <p className="rounded-[1.75rem] bg-plum-soft px-6 py-5 font-sans text-lg font-semibold leading-relaxed text-plum">
          {s.message}
        </p>
      )}
      {note && <Alert tone="info">{note}</Alert>}

      <Tabs tabs={tabs} />

      {s.whenToGetHelp.length > 0 && (
        <Card className="border-danger/30 bg-danger-soft/60">
          <div className="flex items-start gap-4">
            <IconBadge tone="rose" className="bg-card text-danger">
              <Phone className="size-5" />
            </IconBadge>
            <div>
              <h2 className="font-sans text-xl font-bold">When to get help</h2>
              <p className="mb-3 mt-1 text-sm">
                Contact your midwife, doctor or maternity unit straight away if you notice:
              </p>
              <List items={s.whenToGetHelp} />
            </div>
          </div>
        </Card>
      )}

      <ReviewFooter guide={guide} />
    </div>
  );
}

function hasContent(id: string, s: WeekGuide["sections"]): boolean {
  switch (id) {
    case "baby":
      return Boolean(s.baby);
    case "you":
      return Boolean(s.body) || s.symptoms.length > 0;
    case "nutrition":
      return Boolean(s.eat) || s.avoid.length > 0;
    case "activity":
      return Boolean(s.move);
    case "visits":
      return Boolean(s.visits) || s.askAtVisit.length > 0;
    default:
      return s.checklist.length > 0 || s.prepare.length > 0;
  }
}

/** WAI-ARIA tabs: arrow keys move between tabs, Tab moves into the panel. */
function Tabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.min(active, tabs.length - 1);
  if (tabs.length === 0) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (current + delta + tabs.length) % tabs.length;
    if (delta === 0 && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }

  const tab = tabs[current];
  return (
    <Card className="p-0 sm:p-0">
      <div
        role="tablist"
        aria-label="Week guide sections"
        className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-3 sm:px-5"
        onKeyDown={onKeyDown}
      >
        {tabs.map((t, i) => {
          const Icon = t.icon;
          const selected = i === current;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={cx(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition",
                selected
                  ? "border-clay text-clay-strong"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`panel-${tab.id}`}
        aria-labelledby={`tab-${tab.id}`}
        tabIndex={0}
        className="p-5 sm:p-7"
      >
        {tab.content}
      </div>
    </Card>
  );
}

export function ReviewFooter({
  guide,
}: {
  guide: Pick<WeekGuide, "review" | "references" | "nextReviewDue">;
}) {
  return (
    <div className="grid gap-3 border-t border-line pt-5 text-sm text-muted">
      {guide.review && (
        <p>
          Reviewed by {guide.review.reviewerCredentials} on{" "}
          {formatDate(guide.review.reviewedAt)}
          {guide.nextReviewDue && `. Next review due ${formatDate(guide.nextReviewDue)}.`}
        </p>
      )}
      {guide.references.length > 0 && (
        <div>
          <p className="font-semibold text-ink">Sources</p>
          <ul className="mt-1 grid gap-1">
            {guide.references.map((r) => (
              <li key={r.title}>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="underline">
                    {r.title}
                  </a>
                ) : (
                  r.title
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
