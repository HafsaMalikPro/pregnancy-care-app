"use client";

import { CircleCheck, ListChecks, ShieldAlert, SlidersHorizontal, UserRound } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { TaskItem } from "@/components/task-item";
import { ButtonLink, ErrorState, ProgressBar, ProgressRing, Spinner } from "@/components/ui";
import { ApiRequestError } from "@/lib/api";
import { DIET_PATTERNS, FOOD_ALLERGIES, ACTIVITY_LEVELS } from "@/lib/labels";
import type { Pregnancy, Profile, ReadinessTask, ThisWeek } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/*
 * Personal panels on the public topic pages. They only ever show the signed-in person's own
 * saved data, fetched in the browser with their credentials; nothing personal is rendered on
 * the server or cached.
 */

const notFound = (error: unknown) => error instanceof ApiRequestError && error.status === 404;

export function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/80 bg-card p-5 shadow-soft sm:p-6">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-10 place-items-center rounded-full bg-clay-soft text-clay-strong">
          {icon}
        </span>
        <h2 className="font-sans text-lg font-bold">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SignedOutPrompt({ title, text }: { title: string; text: string }) {
  return (
    <Panel icon={<UserRound className="size-5" />} title={title}>
      <p className="text-muted">{text}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <ButtonLink href="/signup">Create an account</ButtonLink>
        <ButtonLink href="/login" variant="secondary">
          Sign in
        </ButtonLink>
      </div>
    </Panel>
  );
}

export const Loading = () => (
  <div className="flex items-center gap-2 text-sm text-muted">
    <Spinner className="size-4" /> Loading your details…
  </div>
);

/** Nutrition: the person's saved diet pattern, allergies and pregnancy food restrictions. */
export function FoodPreferencesPanel() {
  const { me, loading } = useSession();
  const profile = useApi<Profile>(me ? "/v1/me/profile" : null);
  const pregnancy = useApi<Pregnancy>(me ? "/v1/pregnancies/current" : null);

  if (loading) return null;
  if (!me)
    return (
      <SignedOutPrompt
        title="Your food preferences"
        text="Save your diet and any food allergies so you can check each week's guidance against them."
      />
    );

  const busy = profile.loading || pregnancy.loading;
  const realError = [profile.error, pregnancy.error].find((e) => e && !notFound(e));
  const p = notFound(profile.error) ? null : profile.data;
  const restrictions = notFound(pregnancy.error) ? [] : (pregnancy.data?.foodRestrictions ?? []);
  const allergies = p?.foodAllergies ?? [];

  return (
    <Panel icon={<SlidersHorizontal className="size-5" />} title="Your food preferences">
      {busy ? (
        <Loading />
      ) : realError ? (
        <ErrorState error={realError} onRetry={() => void Promise.all([profile.reload(), pregnancy.reload()])} />
      ) : (
        <>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-semibold text-muted">Diet</dt>
              <dd className="mt-0.5 font-bold text-slate">
                {p?.dietPattern ? DIET_PATTERNS[p.dietPattern] : "Not set"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-muted">Food allergies</dt>
              <dd className="mt-0.5 font-bold text-slate">
                {allergies.length ? allergies.map((a) => FOOD_ALLERGIES[a] ?? a).join(", ") : "None saved"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-muted">Advised by your clinician to avoid</dt>
              <dd className="mt-0.5 font-bold text-slate">
                {restrictions.length ? restrictions.join(", ") : "Nothing saved"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-muted">
            Your meal plan is filtered by your diet and allergies. The week-by-week guidance is
            general, so check it against anything your clinician has told you to avoid.{" "}
            <Link href="/settings" className="font-semibold text-clay-strong underline">
              Edit preferences
            </Link>
          </p>
        </>
      )}
    </Panel>
  );
}

/**
 * Exercise: hides general movement guidance from anyone who said their clinician asked them
 * to limit exercise, and shows their saved activity level otherwise.
 */
export function MovementGate({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  const pregnancy = useApi<Pregnancy>(me ? "/v1/pregnancies/current" : null);
  const profile = useApi<Profile>(me ? "/v1/me/profile" : null);

  if (me && pregnancy.data?.restrictExercise) {
    return (
      <Panel icon={<ShieldAlert className="size-5" />} title="Follow your clinician's advice on exercise">
        <p className="leading-relaxed">
          You told us your midwife or doctor has asked you to limit exercise, so we&apos;re not
          showing general movement guidance. Ask them which activities, if any, are right for
          you.
        </p>
        <p className="mt-3 text-sm text-muted">
          If this has changed, update it in{" "}
          <Link href="/settings" className="font-semibold text-clay-strong underline">
            your pregnancy details
          </Link>
          .
        </p>
      </Panel>
    );
  }

  const level = profile.data?.activityLevel;
  return (
    <>
      {me && level && (
        <p className="mb-4 rounded-2xl bg-card px-4 py-3 text-sm text-muted shadow-soft">
          You described your activity level before pregnancy as{" "}
          <strong className="text-slate">{ACTIVITY_LEVELS[level].toLowerCase()}</strong>. Build up
          gently, and check with your midwife or doctor before starting anything new.
        </p>
      )}
      {children}
    </>
  );
}

/**
 * The person's saved checklist, narrowed to tasks in `categories` or whose category or title
 * contains one of `words` (case-insensitive). Plain data, so server pages can pass it.
 */
export function ChecklistPanel({
  title,
  categories = [],
  words = [],
  emptyText,
}: {
  title: string;
  categories?: string[];
  words?: string[];
  emptyText: string;
}) {
  const match = (t: ReadinessTask) => {
    const text = `${t.category} ${t.title}`.toLowerCase();
    return categories.includes(t.category) || words.some((w) => text.includes(w.toLowerCase()));
  };
  const { me, loading } = useSession();
  const tasks = useApi<ReadinessTask[]>(me ? "/v1/readiness/tasks" : null);

  if (loading) return null;
  if (!me)
    return (
      <SignedOutPrompt
        title={title}
        text="Sign in or continue as a guest to tick things off. Your progress is saved to your account."
      />
    );
  if (tasks.loading && !tasks.data) return <Panel icon={<ListChecks className="size-5" />} title={title}><Loading /></Panel>;
  if (tasks.error) return <ErrorState error={tasks.error} onRetry={tasks.reload} />;

  const all = tasks.data ?? [];
  const list = categories.length || words.length ? all.filter(match) : all;
  const done = list.filter((t) => t.completedAt).length;
  const replace = (updated: ReadinessTask) =>
    tasks.setData(all.map((t) => (t.id === updated.id ? updated : t)));

  return (
    <Panel icon={<ListChecks className="size-5" />} title={title}>
      {list.length === 0 ? (
        <p className="text-muted">{emptyText}</p>
      ) : (
        <>
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-semibold">
              {done} of {list.length} done
            </span>
            <Link href="/checklist" className="font-semibold text-clay-strong underline">
              Full checklist
            </Link>
          </div>
          <ProgressBar value={(done / list.length) * 100} />
          <ul className="mt-4 grid gap-3">
            {list.map((task) => (
              <TaskItem key={task.id} task={task} onChange={replace} />
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}


/**
 * "Your Nutrition Tips": eating advice from the signed-in person's current week guide, or
 * the general reviewed advice passed in for visitors.
 */
export function NutritionTips({ general }: { general: string[] }) {
  const { me } = useSession();
  const week = useApi<ThisWeek>(me ? "/v1/pregnancies/current/week" : null);
  const own = week.data?.guide
    ? [week.data.guide.sections.eat, ...week.data.guide.sections.avoid.map((a) => `Be careful with: ${a}`)].filter(Boolean)
    : null;
  const tips = (own ?? general).slice(0, 4);

  return (
    <section className="rounded-3xl border border-white/80 bg-card p-5 shadow-soft">
      <h2 className="font-sans text-lg font-bold">Your Nutrition Tips</h2>
      {own && week.data && <p className="mt-0.5 text-xs font-semibold text-clay-strong">From your week {week.data.pregnancy.week} guide</p>}
      {tips.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No eating advice is published yet.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {tips.map((tip) => (
            <li key={tip} className="flex gap-3 text-sm leading-relaxed">
              <CircleCheck className="mt-0.5 size-5 shrink-0 fill-sage-bright text-white" aria-hidden />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Checklist with a progress ring, as on the baby-care design. */
export function ChecklistRing({
  words,
  title,
  emptyText,
}: {
  words: string[];
  title: string;
  emptyText: string;
}) {
  const { me, loading } = useSession();
  const tasks = useApi<ReadinessTask[]>(me ? "/v1/readiness/tasks" : null);

  if (loading) return null;
  if (!me)
    return (
      <SignedOutPrompt
        title={title}
        text="Sign in or continue as a guest to tick things off. Your progress is saved to your account."
      />
    );
  if (tasks.error) return <ErrorState error={tasks.error} onRetry={tasks.reload} />;
  if (!tasks.data) return <Panel icon={<ListChecks className="size-5" />} title={title}><Loading /></Panel>;

  const all = tasks.data;
  const list = all.filter((t) => {
    const text = `${t.category} ${t.title}`.toLowerCase();
    return words.some((w) => text.includes(w));
  });
  const done = list.filter((t) => t.completedAt).length;
  const pct = list.length ? (done / list.length) * 100 : 0;
  const replace = (updated: ReadinessTask) =>
    tasks.setData(all.map((t) => (t.id === updated.id ? updated : t)));

  return (
    <section className="rounded-3xl border border-white/80 bg-card p-5 shadow-soft sm:p-6">
      {list.length === 0 ? (
        <>
          <h2 className="font-sans text-lg font-bold">{title}</h2>
          <p className="mt-2 text-muted">{emptyText}</p>
          <Link href="/checklist" className="mt-3 inline-block text-sm font-bold text-clay-strong underline">
            Open your full checklist
          </Link>
        </>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <ProgressRing value={pct} label={`${Math.round(pct)} percent of ${title.toLowerCase()} done`}>
              <span className="font-sans text-lg font-extrabold text-heading">{Math.round(pct)}%</span>
            </ProgressRing>
            <div>
              <h2 className="font-sans text-lg font-bold">{title}</h2>
              <p className="text-sm text-muted">
                {done} of {list.length} items
              </p>
            </div>
          </div>
          <ul className="mt-5 grid gap-3">
            {list.map((task) => (
              <TaskItem key={task.id} task={task} onChange={replace} />
            ))}
          </ul>
          <Link href="/checklist" className="mt-4 inline-block text-sm font-bold text-clay-strong hover:underline">
            View All Items →
          </Link>
        </>
      )}
    </section>
  );
}
