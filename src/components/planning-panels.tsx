"use client";

import {
  Apple,
  CalendarClock,
  CalendarPlus,
  Check,
  ClipboardList,
  Coffee,
  CookingPot,
  Dumbbell,
  GlassWater,
  HeartHandshake,
  Minus,
  Moon,
  Plus,
  Salad,
  ShoppingBasket,
  Trash2,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Loading, Panel, SignedOutPrompt } from "@/components/personal-panels";
import { useSession } from "@/components/session-provider";
import { TaskItem } from "@/components/task-item";
import {
  Alert,
  Badge,
  Button,
  Chip,
  ErrorState,
  Field,
  Input,
  ProgressBar,
  ProgressRing,
  Select,
  Textarea,
  cx,
} from "@/components/ui";
import { ApiRequestError, api, errorMessage } from "@/lib/api";
import { addDays, formatDate, todayIso } from "@/lib/dates";
import { FOOD_ALLERGIES } from "@/lib/labels";
import type {
  Activity,
  Appointment,
  AppointmentKind,
  BirthPreferences,
  DailyLog,
  ExercisePlan,
  MealSlot,
  PersonalMealPlan,
  PlanAvailability,
  Profile,
  ReadinessTask,
  Recipe,
  ShoppingItem,
} from "@/lib/types";
import { useApi } from "@/lib/use-api";

/*
 * Personal planning panels (meal plan, hydration, shopping, exercise, sleep, appointments,
 * birth preferences, preparation checklists). Everything personal is fetched in the browser
 * with the person's own credentials; the API does all filtering and never computes targets.
 */

const notFound = (e: unknown) => e instanceof ApiRequestError && e.status === 404;

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/** Shown on content that is published without an approving clinical review. */
export function UnreviewedNote({ review }: { review: unknown }) {
  if (review) return <Badge tone="success">Clinically reviewed</Badge>;
  return <Badge tone="warn">Not yet clinically reviewed</Badge>;
}

function AvailabilityNote({ availability, what }: { availability: PlanAvailability; what: "meal" | "exercise" }) {
  const text: Record<Exclude<PlanAvailability, "available">, React.ReactNode> = {
    no_pregnancy: (
      <>
        Add your pregnancy in{" "}
        <Link href="/onboarding" className="font-semibold underline">
          your details
        </Link>{" "}
        to get a {what} plan for your week.
      </>
    ),
    clinician_guidance:
      what === "meal"
        ? "You told us a clinician or dietitian manages what you eat, so we don't offer a general meal plan. Follow their advice."
        : "You told us your midwife or doctor asked you to limit exercise, so we don't suggest activities. Ask them what's right for you.",
    none_published: `No ${what} plans are published yet.`,
    none_matching: (
      <>
        No published meal plan fits your diet and allergies yet. Check your{" "}
        <Link href="/settings" className="font-semibold underline">
          food preferences
        </Link>
        , or browse the recipes.
      </>
    ),
  };
  if (availability === "available") return null;
  return <Alert tone={availability === "clinician_guidance" ? "warn" : "info"}>{text[availability]}</Alert>;
}

function useSignedIn() {
  const { me, loading } = useSession();
  return { me, loading };
}

// ---------------------------------------------------------------------------
// Meal plan
// ---------------------------------------------------------------------------

const SLOT_TILES: Record<MealSlot, { icon: typeof Coffee; tone: string }> = {
  breakfast: { icon: Coffee, tone: "bg-[#fde6d3] text-[#c4621b]" },
  lunch: { icon: Salad, tone: "bg-sage-soft text-sage" },
  dinner: { icon: CookingPot, tone: "bg-blush text-clay-strong" },
  snack: { icon: Apple, tone: "bg-plum-soft text-plum" },
};

function SlotTile({ slot }: { slot: MealSlot }) {
  const { icon: Icon, tone } = SLOT_TILES[slot];
  return (
    <span aria-hidden className={cx("grid size-14 shrink-0 place-items-center rounded-2xl", tone)}>
      <Icon className="size-6" />
    </span>
  );
}

async function setEaten(date: string, slot: MealSlot, slug: string, eaten: boolean) {
  const path = `/v1/meal-logs/${date}/${slot}/${encodeURIComponent(slug)}`;
  await api(path, { method: eaten ? "PUT" : "DELETE" });
}

function MealRow({
  date,
  slot,
  recipe,
  eaten,
  canLog,
  onToggle,
}: {
  date: string;
  slot: MealSlot;
  recipe: Recipe;
  eaten: boolean;
  canLog: boolean;
  onToggle: (eaten: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await setEaten(date, slot, recipe.slug, !eaten);
      onToggle(!eaten);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className={cx("rounded-2xl border border-line/60 p-3", eaten && "bg-sage-soft/60")}>
      <div className="flex items-start gap-3">
        <SlotTile slot={slot} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-heading">{SLOT_LABELS[slot]}</p>
          <details>
            <summary className="cursor-pointer text-sm text-ink">{recipe.title}</summary>
            <RecipeDetail recipe={recipe} />
          </details>
        </div>
        {canLog && (
          <button
            type="button"
            role="checkbox"
            aria-checked={eaten}
            aria-label={eaten ? `Mark ${recipe.title} as not eaten` : `Mark ${recipe.title} as eaten`}
            disabled={busy}
            onClick={toggle}
            className={cx(
              "grid size-9 shrink-0 place-items-center rounded-full border-2 transition disabled:opacity-50",
              eaten ? "border-sage bg-sage text-white" : "border-line hover:border-clay",
            )}
          >
            {eaten && <Check className="size-4" aria-hidden />}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </li>
  );
}

/** Today's (or this week's) personal meal plan with "eaten" ticks. */
export function MealPlanPanel({ days = 1 }: { days?: 1 | 7 }) {
  const { me, loading } = useSignedIn();
  const today = todayIso();
  const plan = useApi<PersonalMealPlan>(me ? `/v1/me/meal-plan?date=${today}&days=${days}` : null);
  const title = days === 1 ? "Today's meal plan" : "This week's meal plan";

  if (loading) return null;
  if (!me)
    return (
      <SignedOutPrompt
        title={title}
        text="Sign in or continue as a guest to get a meal plan that follows your diet and allergies."
      />
    );
  if (plan.error) return <ErrorState error={plan.error} onRetry={plan.reload} />;
  if (!plan.data)
    return (
      <Panel icon={<Utensils className="size-5" />} title={title}>
        <Loading />
      </Panel>
    );

  const p = plan.data;
  const mark = (date: string, slot: MealSlot, slug: string, eaten: boolean) =>
    plan.setData({
      ...p,
      days: p.days.map((d) =>
        d.date !== date
          ? d
          : { ...d, meals: d.meals.map((m) => (m.slot === slot && m.recipe.slug === slug ? { ...m, eaten } : m)) },
      ),
    });

  return (
    <Panel icon={<Utensils className="size-5" />} title={title}>
      <AvailabilityNote availability={p.availability} what="meal" />
      {p.availability === "available" && (
        <>
          {(p.filters.dietPattern || p.filters.excludedAllergens.length > 0) && (
            <p className="mb-3 text-xs text-muted">
              Filtered for
              {p.filters.dietPattern ? ` a ${p.filters.dietPattern.replace("_", " ")} diet` : ""}
              {p.filters.excludedAllergens.length
                ? ` without ${p.filters.excludedAllergens.map((a) => FOOD_ALLERGIES[a] ?? a).join(", ").toLowerCase()}`
                : ""}
              .
            </p>
          )}
          <div className={cx("grid gap-4", days === 7 && "md:grid-cols-2 xl:grid-cols-3")}>
            {p.days.map((d) => (
              <div key={d.date}>
                {days === 7 && (
                  <h3 className="mb-2 text-sm font-bold text-slate">
                    {d.date === today ? "Today" : formatDate(d.date, { weekday: "long", day: "numeric", month: "short" })}
                  </h3>
                )}
                <ul className="grid gap-2">
                  {d.meals.map((m) => (
                    <MealRow
                      key={`${m.slot}-${m.recipe.slug}`}
                      date={d.date}
                      slot={m.slot}
                      recipe={m.recipe}
                      eaten={m.eaten}
                      canLog={d.date <= today}
                      onToggle={(eaten) => mark(d.date, m.slot, m.recipe.slug, eaten)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {p.hydrationNote && <p className="mt-4 rounded-2xl bg-sunk px-4 py-3 text-xs leading-relaxed text-muted">{p.hydrationNote}</p>}
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Daily log trackers (hydration, sleep)
// ---------------------------------------------------------------------------

function useTodayLog() {
  const { me } = useSession();
  const today = todayIso();
  const log = useApi<DailyLog>(me ? `/v1/daily-logs/${today}` : null);
  const missing = notFound(log.error);
  const current = missing ? null : log.data;

  async function save(patch: Partial<DailyLog>) {
    const updated = await api<DailyLog>(`/v1/daily-logs/${today}`, {
      method: "PUT",
      body: { symptoms: current?.symptoms ?? [], note: current?.note ?? null, ...patch },
    });
    log.setData(updated);
  }

  return {
    log: current,
    ready: missing || log.data !== undefined,
    error: missing ? null : log.error,
    reload: log.reload,
    save,
  };
}

/** Counts glasses of fluid for today. No target: the API sets none. */
export function HydrationTracker() {
  const { me, loading } = useSignedIn();
  const { log, ready, error, reload, save } = useTodayLog();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (loading) return null;
  if (!me) return <SignedOutPrompt title="Hydration tracker" text="Sign in or continue as a guest to count your drinks each day." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const glasses = log?.waterGlasses ?? 0;
  async function change(n: number) {
    setBusy(true);
    setSaveError(null);
    try {
      await save({ waterGlasses: Math.max(0, Math.min(40, n)) });
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel icon={<GlassWater className="size-5" />} title="Hydration tracker">
      {!ready ? (
        <Loading />
      ) : (
        <>
          <div className="flex items-center gap-4">
            <button type="button" aria-label="One glass less" disabled={busy || glasses === 0} onClick={() => change(glasses - 1)} className="grid size-11 shrink-0 place-items-center rounded-full text-lg font-bold transition disabled:opacity-40 border-2 border-line text-ink hover:border-clay">
              <Minus className="size-5" aria-hidden />
            </button>
            <p className="text-center" aria-live="polite">
              <span className="block font-sans text-3xl font-extrabold text-heading">{glasses}</span>
              <span className="text-sm text-muted">glass{glasses === 1 ? "" : "es"} today</span>
            </p>
            <button type="button" aria-label="One more glass" disabled={busy} onClick={() => change(glasses + 1)} className="grid size-11 shrink-0 place-items-center rounded-full text-lg font-bold transition disabled:opacity-40 bg-clay text-white hover:bg-clay-strong">
              <Plus className="size-5" aria-hidden />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1" aria-hidden>
            {Array.from({ length: Math.max(8, glasses) }, (_, i) => (
              <GlassWater key={i} className={cx("size-5", i < glasses ? "text-[#3b6fc4]" : "text-line")} />
            ))}
          </div>
          {saveError && <p className="mt-2 text-sm text-danger">{saveError}</p>}
          <p className="mt-3 text-xs text-muted">
            There&apos;s no set target here. Your midwife or doctor can tell you how much is right for you.
          </p>
        </>
      )}
    </Panel>
  );
}

const SLEEP_OPTIONS = Array.from({ length: 29 }, (_, i) => i * 30); // 0–14 h in half hours

/** Hours slept, saved on today's journal entry, plus the last 7 days. */
export function SleepTracker() {
  const { me, loading } = useSignedIn();
  const { log, ready, error, reload, save } = useTodayLog();
  const today = todayIso();
  const week = useApi<DailyLog[]>(me ? `/v1/daily-logs?from=${addDays(today, -6)}&to=${today}` : null);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (loading) return null;
  if (!me) return <SignedOutPrompt title="Sleep tracker" text="Sign in or continue as a guest to note how you slept." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const byDate = new Map((week.data ?? []).map((l) => [l.date, l.sleepMinutes ?? null]));
  if (log) byDate.set(today, log.sleepMinutes ?? null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  async function change(value: string) {
    setSaveError(null);
    try {
      await save({ sleepMinutes: value === "" ? null : Number(value) });
    } catch (err) {
      setSaveError(errorMessage(err));
    }
  }

  return (
    <Panel icon={<Moon className="size-5" />} title="Sleep tracker">
      {!ready ? (
        <Loading />
      ) : (
        <>
          <Field label="How long did you sleep last night?">
            <Select value={log?.sleepMinutes ?? ""} onChange={(e) => change(e.target.value)}>
              <option value="">Not noted</option>
              {SLEEP_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m / 60} hours
                </option>
              ))}
            </Select>
          </Field>
          {saveError && <p className="mt-2 text-sm text-danger">{saveError}</p>}
          <ol className="mt-4 grid grid-cols-7 items-end gap-1.5" aria-label="Sleep over the last 7 days">
            {days.map((d) => {
              const m = byDate.get(d) ?? null;
              return (
                <li key={d} className="grid justify-items-center gap-1 text-xs text-muted">
                  <span className="sr-only">{formatDate(d)}: {m === null ? "not noted" : `${m / 60} hours`}</span>
                  <span aria-hidden className="flex h-20 w-full items-end rounded-lg bg-sunk">
                    <span className="w-full rounded-lg bg-plum/70" style={{ height: `${m === null ? 0 : Math.min(100, (m / 720) * 100)}%` }} />
                  </span>
                  <span aria-hidden>{formatDate(d, { weekday: "narrow" })}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-muted">
            Sleeping on your side is recommended from the third trimester. Tell your midwife if
            you can&apos;t sleep or feel exhausted.
          </p>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Shopping list
// ---------------------------------------------------------------------------

export function ShoppingListPanel() {
  const { me, loading } = useSignedIn();
  const list = useApi<ShoppingItem[]>(me ? "/v1/shopping-list" : null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  if (loading) return null;
  if (!me) return <SignedOutPrompt title="Shopping list" text="Sign in or continue as a guest to build a shopping list from your meal plan." />;
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;

  const items = list.data ?? [];
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }
  const fromPlan = () =>
    run(async () => {
      const r = await api<{ added: number; items: ShoppingItem[] }>("/v1/shopping-list/from-meal-plan", {
        method: "POST",
        body: { date: todayIso(), days: 7 },
      });
      list.setData(r.items);
      setMessage({ tone: "success", text: r.added ? `Added ${r.added} item${r.added === 1 ? "" : "s"} from this week's meal plan.` : "Everything from this week's plan is already on your list." });
    });
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void run(async () => {
      const item = await api<ShoppingItem>("/v1/shopping-list", { method: "POST", body: { name: name.trim() } });
      list.setData([...items.filter((i) => i.id !== item.id), item]);
      setName("");
    });
  };
  // Optimistic: tick immediately, then reconcile with the saved row (or revert on error).
  const toggle = (item: ShoppingItem) => {
    list.setData(items.map((i) => (i.id === item.id ? { ...i, checked: !item.checked } : i)));
    return run(async () => {
      try {
        const u = await api<ShoppingItem>(`/v1/shopping-list/${item.id}`, { method: "PATCH", body: { checked: !item.checked } });
        list.setData(items.map((i) => (i.id === u.id ? u : i)));
      } catch (err) {
        list.setData(items);
        throw err;
      }
    });
  };
  const remove = (item: ShoppingItem) =>
    run(async () => {
      await api(`/v1/shopping-list/${item.id}`, { method: "DELETE" });
      list.setData(items.filter((i) => i.id !== item.id));
    });
  const clearChecked = () =>
    run(async () => {
      await api("/v1/shopping-list", { method: "DELETE" });
      list.setData(items.filter((i) => !i.checked));
    });

  const open = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  return (
    <Panel icon={<ShoppingBasket className="size-5" />} title="Shopping list">
      <div className="flex flex-wrap gap-3">
        <Button onClick={fromPlan} busy={busy}>
          Add this week&apos;s meal plan
        </Button>
        {done.length > 0 && (
          <Button variant="secondary" onClick={clearChecked} disabled={busy}>
            Clear {done.length} checked
          </Button>
        )}
      </div>
      <form onSubmit={add} className="mt-4 flex gap-2">
        <label htmlFor="shopping-new" className="sr-only">
          Add an item
        </label>
        <Input id="shopping-new" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="Add an item, e.g. ginger tea" />
        <Button type="submit" variant="secondary" disabled={busy || !name.trim()} aria-label="Add item">
          <Plus className="size-4" aria-hidden />
        </Button>
      </form>
      {message && (
        <div className="mt-3">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
      {list.data === undefined ? (
        <div className="mt-4">
          <Loading />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 text-muted">Your list is empty.</p>
      ) : (
        <ul className="mt-4 grid gap-1.5">
          {[...open, ...done].map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-sunk">
              <input
                id={`shop-${item.id}`}
                type="checkbox"
                checked={item.checked}
                disabled={busy}
                onChange={() => toggle(item)}
                className="size-5 accent-[var(--color-sage,#3f7d5a)]"
              />
              <label htmlFor={`shop-${item.id}`} className={cx("flex-1 capitalize", item.checked && "text-muted line-through")}>
                {item.name}
                {item.quantity && <span className="ml-2 text-xs normal-case text-muted">{item.quantity}</span>}
              </label>
              <button type="button" onClick={() => remove(item)} disabled={busy} aria-label={`Remove ${item.name}`} className="rounded-full p-1.5 text-muted hover:text-danger">
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Recipes (public catalogue, passed in from the server)
// ---------------------------------------------------------------------------

function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const s = recipe.sections;
  return (
    <div className="mt-3 grid gap-3 text-sm leading-relaxed">
      <p className="text-muted">
        {recipe.summary} Serves {s.servings}
        {s.prepMinutes ? ` · about ${s.prepMinutes} min` : ""}.
      </p>
      <div>
        <h4 className="font-bold">Ingredients</h4>
        <ul className="mt-1 list-disc pl-5">
          {s.ingredients.map((i) => (
            <li key={i.name}>
              {i.quantity ? `${i.quantity} ` : ""}
              {i.name.toLowerCase()}
              {i.allergens.length > 0 && <span className="text-xs text-warn"> (contains {i.allergens.map((a) => FOOD_ALLERGIES[a] ?? a).join(", ").toLowerCase()})</span>}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="font-bold">Method</h4>
        <ol className="mt-1 list-decimal pl-5">
          {s.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      {s.nutrients.length > 0 && (
        <ul className="grid gap-1">
          {s.nutrients.map((n) => (
            <li key={n.name}>
              <strong>{n.name}:</strong> {n.note}
            </li>
          ))}
        </ul>
      )}
      {s.foodSafetyNotes.length > 0 && (
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-warn">{s.foodSafetyNotes.join(" ")}</p>
      )}
      {s.substitutions.length > 0 && (
        <p className="text-muted">
          Swaps: {s.substitutions.map((x) => `${x.ingredient.toLowerCase()} → ${x.alternatives.join(" or ").toLowerCase()}`).join("; ")}
        </p>
      )}
    </div>
  );
}

/** The published recipe catalogue, filterable by meal and the person's saved allergies. */
export function RecipeBrowser({ recipes }: { recipes: Recipe[] }) {
  const { me } = useSession();
  const profile = useApi<Profile>(me ? "/v1/me/profile" : null);
  const [slot, setSlot] = useState<MealSlot | "all">("all");
  const [safeOnly, setSafeOnly] = useState(true);
  const allergies = useMemo(() => profile.data?.foodAllergies ?? [], [profile.data]);

  const shown = recipes.filter(
    (r) =>
      (slot === "all" || r.sections.mealSlots.includes(slot)) &&
      (!safeOnly || !r.allergens.some((a) => allergies.includes(a))),
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Meal">
        {(["all", "breakfast", "lunch", "dinner", "snack"] as const).map((s) => (
          <Chip key={s} selected={slot === s} onClick={() => setSlot(s)}>
            {s === "all" ? "All" : SLOT_LABELS[s]}
          </Chip>
        ))}
      </div>
      {allergies.length > 0 && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={safeOnly} onChange={(e) => setSafeOnly(e.target.checked)} className="size-4" />
          Hide recipes with my allergens ({allergies.map((a) => FOOD_ALLERGIES[a] ?? a).join(", ").toLowerCase()})
        </label>
      )}
      {shown.length === 0 ? (
        <p className="mt-4 text-muted">No recipes match.</p>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {shown.map((r) => (
            <li key={r.slug} className="rounded-3xl border border-white/80 bg-card p-5 shadow-soft">
              <div className="flex flex-wrap items-center gap-2">
                {r.sections.mealSlots.map((s) => (
                  <Badge key={s} tone="neutral">
                    {SLOT_LABELS[s]}
                  </Badge>
                ))}
                <UnreviewedNote review={r.review} />
              </div>
              <h3 className="mt-2 font-sans text-lg font-bold">{r.title}</h3>
              <p className="text-xs text-muted">
                {r.allergens.length ? `Contains: ${r.allergens.map((a) => FOOD_ALLERGIES[a] ?? a).join(", ")}` : "No common allergens"}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-bold text-clay-strong">Ingredients and method</summary>
                <RecipeDetail recipe={r} />
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exercise
// ---------------------------------------------------------------------------

function ActivityBody({ activity }: { activity: Activity }) {
  const s = activity.sections;
  return (
    <div className="mt-3 grid gap-3 text-sm leading-relaxed">
      <ol className="list-decimal pl-5">
        {s.instructions.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
      {s.safetyNotes.length > 0 && <p className="text-muted">{s.safetyNotes.join(" ")}</p>}
      {s.contraindications.length > 0 && (
        <p>
          <strong>Not for you if:</strong> {s.contraindications.join("; ").toLowerCase()}.
        </p>
      )}
      <div className="rounded-xl bg-danger-soft px-3 py-2 text-danger">
        <strong>Stop and get help if:</strong> {s.stopSigns.join("; ").toLowerCase()}.
      </div>
    </div>
  );
}

const meta = (a: Activity) =>
  [a.sections.durationMinutes && `${a.sections.durationMinutes} min`, a.sections.intensity].filter(Boolean).join(" · ");

/** This week's activities from the reviewed library, with "done today" ticks. */
export function ExercisePlanPanel() {
  const { me, loading } = useSignedIn();
  const today = todayIso();
  const plan = useApi<ExercisePlan>(me ? `/v1/me/exercise-plan?date=${today}` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;
  if (!me) return <SignedOutPrompt title="Your exercise plan" text="Sign in or continue as a guest to get activities for your week and tick them off." />;
  if (plan.error) return <ErrorState error={plan.error} onRetry={plan.reload} />;
  if (!plan.data)
    return (
      <Panel icon={<Dumbbell className="size-5" />} title="Your exercise plan">
        <Loading />
      </Panel>
    );
  const p = plan.data;
  const done = p.activities.filter((a) => a.doneToday).length;

  async function toggle(a: ExercisePlan["activities"][number]) {
    setBusy(a.slug);
    setError(null);
    try {
      const path = `/v1/activity-logs/${today}/${encodeURIComponent(a.slug)}`;
      if (a.doneToday) await api(path, { method: "DELETE" });
      else await api(path, { method: "PUT", body: { minutes: a.sections.durationMinutes } });
      plan.setData({ ...p, activities: p.activities.map((x) => (x.slug === a.slug ? { ...x, doneToday: !a.doneToday } : x)) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel icon={<Dumbbell className="size-5" />} title={p.week ? `Your exercise plan — week ${p.week}` : "Your exercise plan"}>
      <AvailabilityNote availability={p.availability} what="exercise" />
      {p.availability === "available" && (
        <>
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-semibold">
              {done} of {p.activities.length} done today
            </span>
          </div>
          <ProgressBar value={p.activities.length ? (done / p.activities.length) * 100 : 0} />
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {p.activities.map((a) => (
              <li key={a.slug} className={cx("rounded-2xl border border-line/60 p-4", a.doneToday && "bg-sage-soft/60")}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate">{a.title}</h3>
                    <p className="text-xs text-muted">{meta(a)}</p>
                  </div>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={a.doneToday}
                    aria-label={a.doneToday ? `Mark ${a.title} as not done` : `Mark ${a.title} as done today`}
                    disabled={busy === a.slug}
                    onClick={() => toggle(a)}
                    className={cx(
                      "grid size-9 shrink-0 place-items-center rounded-full border-2 transition disabled:opacity-50",
                      a.doneToday ? "border-sage bg-sage text-white" : "border-line hover:border-clay",
                    )}
                  >
                    {a.doneToday && <Check className="size-4" aria-hidden />}
                  </button>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-bold text-clay-strong">How to do it</summary>
                  <ActivityBody activity={a} />
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 text-xs text-muted">{p.disclaimer}</p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export const APPOINTMENT_KINDS: Record<AppointmentKind, string> = {
  antenatal: "Antenatal check-up",
  scan: "Scan",
  blood_test: "Blood test",
  glucose_test: "Glucose test",
  specialist: "Specialist",
  postnatal: "Postnatal check",
  newborn_check: "Baby check",
  other: "Other",
};

/** startsAt needs an explicit UTC offset; send the local time with the browser's offset. */
function withOffset(date: string, time: string): string {
  const d = new Date(`${date}T${time}`);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  return `${date}T${time}:00${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

function AppointmentRow({ a, onRemove }: { a: Appointment; onRemove: (a: Appointment) => void }) {
  return (
    <li className="flex gap-3 rounded-2xl border border-line/60 p-4">
      <CalendarClock className="mt-0.5 size-5 shrink-0 text-clay-strong" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-slate">{a.title}</p>
        <p className="text-sm text-muted">
          {new Date(a.startsAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          {a.location ? ` · ${a.location}` : ""} · {APPOINTMENT_KINDS[a.kind]}
        </p>
        {a.questions.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {a.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" onClick={() => onRemove(a)} aria-label={`Delete ${a.title}`} className="self-start rounded-full p-1.5 text-muted hover:text-danger">
        <Trash2 className="size-4" aria-hidden />
      </button>
    </li>
  );
}

export function AppointmentsPanel() {
  const { me, loading } = useSignedIn();
  const list = useApi<Appointment[]>(me ? "/v1/appointments" : null);
  const [form, setForm] = useState({ kind: "antenatal" as AppointmentKind, title: "", date: "", time: "09:00", location: "", questions: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (loading) return null;
  if (!me) return <SignedOutPrompt title="Appointments" text="Sign in or continue as a guest to keep track of your appointments and questions." />;
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;

  const items = [...(list.data ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const now = new Date().toISOString();
  const upcoming = items.filter((a) => a.startsAt >= now);
  const past = items.filter((a) => a.startsAt < now).reverse();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<Appointment>("/v1/appointments", {
        method: "POST",
        body: {
          kind: form.kind,
          title: form.title.trim() || APPOINTMENT_KINDS[form.kind],
          startsAt: withOffset(form.date, form.time),
          location: form.location.trim() || null,
          questions: form.questions.split("\n").map((q) => q.trim()).filter(Boolean),
        },
      });
      list.setData([...items, created]);
      setForm({ ...form, title: "", date: "", location: "", questions: "" });
      setAdding(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function remove(a: Appointment) {
    setError(null);
    try {
      await api(`/v1/appointments/${a.id}`, { method: "DELETE" });
      list.setData(items.filter((x) => x.id !== a.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Panel icon={<CalendarPlus className="size-5" />} title="Appointments">
      {list.data === undefined ? (
        <Loading />
      ) : (
        <>
          {upcoming.length === 0 ? (
            <p className="text-muted">No upcoming appointments.</p>
          ) : (
            <ul className="grid gap-3">{upcoming.map((a) => <AppointmentRow key={a.id} a={a} onRemove={remove} />)}</ul>
          )}
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          {adding ? (
            <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl bg-sunk p-4 sm:grid-cols-2">
              <Field label="Type">
                <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AppointmentKind })}>
                  {Object.entries(APPOINTMENT_KINDS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Title (optional)">
                <Input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={APPOINTMENT_KINDS[form.kind]} />
              </Field>
              <Field label="Date">
                <Input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Time">
                <Input type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Where (optional)">
                  <Input value={form.location} maxLength={200} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Questions to ask (one per line)">
                  <Textarea rows={3} value={form.questions} onChange={(e) => setForm({ ...form, questions: e.target.value })} />
                </Field>
              </div>
              <div className="flex gap-3 sm:col-span-2">
                <Button type="submit" busy={busy}>
                  Save appointment
                </Button>
                <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button className="mt-4" onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden /> Add appointment
            </Button>
          )}
          {past.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-bold text-muted">Past appointments ({past.length})</summary>
              <ul className="mt-3 grid gap-3">{past.map((a) => <AppointmentRow key={a.id} a={a} onRemove={remove} />)}</ul>
            </details>
          )}
          <p className="mt-4 text-xs text-muted">
            Appointments don&apos;t send alerts. Set a{" "}
            <Link href="/reminders" className="font-semibold underline">
              reminder
            </Link>{" "}
            if you&apos;d like one.
          </p>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Birth preferences
// ---------------------------------------------------------------------------

const SETTINGS = { hospital: "Hospital", birth_centre: "Birth centre", home: "Home", undecided: "Not decided yet" } as const;
const FEEDING = { breastfeeding: "Breastfeeding", formula: "Formula", combination: "Both", undecided: "Not decided yet" } as const;
const PAIN_RELIEF = ["Breathing and relaxation", "Water / birth pool", "TENS machine", "Gas and air", "Pethidine or other opioids", "Epidural", "Open to anything"];

export function BirthPreferencesPanel() {
  const { me, loading } = useSignedIn();
  const prefs = useApi<BirthPreferences>(me ? "/v1/pregnancies/current/birth-preferences" : null);
  const [draft, setDraft] = useState<BirthPreferences | null>(null);
  const [support, setSupport] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  if (loading) return null;
  if (!me) return <SignedOutPrompt title="Birth preferences" text="Sign in or continue as a guest to write down your birth preferences." />;
  if (notFound(prefs.error))
    return (
      <Panel icon={<HeartHandshake className="size-5" />} title="Birth preferences">
        <p className="text-muted">
          Add your pregnancy in{" "}
          <Link href="/onboarding" className="font-semibold text-clay-strong underline">
            your details
          </Link>{" "}
          first.
        </p>
      </Panel>
    );
  if (prefs.error) return <ErrorState error={prefs.error} onRetry={prefs.reload} />;
  if (!prefs.data)
    return (
      <Panel icon={<HeartHandshake className="size-5" />} title="Birth preferences">
        <Loading />
      </Panel>
    );

  const v = draft ?? prefs.data;
  const set = (patch: Partial<BirthPreferences>) => setDraft({ ...v, ...patch });
  const togglePain = (p: string) => set({ painRelief: v.painRelief.includes(p) ? v.painRelief.filter((x) => x !== p) : [...v.painRelief, p] });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const saved = await api<BirthPreferences>("/v1/pregnancies/current/birth-preferences", {
        method: "PUT",
        body: {
          birthSetting: v.birthSetting,
          painRelief: v.painRelief,
          supportPeople: v.supportPeople,
          feedingIntention: v.feedingIntention,
          notes: v.notes?.trim() || null,
        },
      });
      prefs.setData(saved);
      setDraft(null);
      setStatus({ tone: "success", text: "Saved. Share these with your midwife — plans can change on the day, and that's okay." });
    } catch (err) {
      setStatus({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel icon={<HeartHandshake className="size-5" />} title="Birth preferences">
      <form onSubmit={save} className="grid gap-4">
        <Field label="Where would you like to give birth?">
          <Select value={v.birthSetting ?? ""} onChange={(e) => set({ birthSetting: (e.target.value || null) as BirthPreferences["birthSetting"] })}>
            <option value="">Choose…</option>
            {Object.entries(SETTINGS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Pain relief you&apos;d like to consider</legend>
          <div className="flex flex-wrap gap-2">
            {PAIN_RELIEF.map((p) => (
              <Chip key={p} selected={v.painRelief.includes(p)} onClick={() => togglePain(p)}>
                {p}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Who will support you?</legend>
          <div className="flex flex-wrap gap-2">
            {v.supportPeople.map((p) => (
              <Chip key={p} selected onClick={() => set({ supportPeople: v.supportPeople.filter((x) => x !== p) })}>
                {p} ✕
              </Chip>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <label htmlFor="support-person" className="sr-only">
              Add a support person
            </label>
            <Input id="support-person" value={support} maxLength={80} onChange={(e) => setSupport(e.target.value)} placeholder="e.g. My partner" />
            <Button
              type="button"
              variant="secondary"
              disabled={!support.trim() || v.supportPeople.length >= 10}
              onClick={() => {
                set({ supportPeople: [...v.supportPeople, support.trim()] });
                setSupport("");
              }}
            >
              Add
            </Button>
          </div>
        </fieldset>
        <Field label="How are you thinking of feeding your baby?">
          <Select value={v.feedingIntention ?? ""} onChange={(e) => set({ feedingIntention: (e.target.value || null) as BirthPreferences["feedingIntention"] })}>
            <option value="">Choose…</option>
            {Object.entries(FEEDING).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Anything else (lighting, music, skin-to-skin, cord clamping…)">
          <Textarea rows={3} maxLength={2000} value={v.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        {status && <Alert tone={status.tone}>{status.text}</Alert>}
        <div>
          <Button type="submit" busy={busy} disabled={!draft}>
            Save preferences
          </Button>
        </div>
      </form>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Preparation checklists (newborn, hospital bag, birth, postpartum)
// ---------------------------------------------------------------------------

export const PREPARATION_LABELS: Record<string, string> = {
  newborn_clothing: "Clothing",
  diapering: "Nappies",
  bathing_hygiene: "Bathing",
  feeding: "Feeding",
  breastfeeding: "Breastfeeding",
  safe_sleep: "Safe sleep",
  car_seat: "Car seat",
  hospital_bag: "Hospital bag",
  newborn_appointments: "Baby's first checks",
  postpartum_home: "At home after the birth",
  birth_preparation: "Birth preparation",
};

/** Checklist tasks in `categories`, grouped, with an overall progress ring. */
export function PreparationChecklist({ title, categories, emptyText }: { title: string; categories: string[]; emptyText: string }) {
  const { me, loading } = useSignedIn();
  const tasks = useApi<ReadinessTask[]>(me ? "/v1/readiness/tasks" : null);
  const [group, setGroup] = useState<string>("all");

  if (loading) return null;
  if (!me) return <SignedOutPrompt title={title} text="Sign in or continue as a guest to tick things off. Your progress is saved." />;
  if (tasks.error) return <ErrorState error={tasks.error} onRetry={tasks.reload} />;
  if (!tasks.data)
    return (
      <Panel icon={<ClipboardList className="size-5" />} title={title}>
        <Loading />
      </Panel>
    );

  const all = tasks.data;
  const list = all.filter((t) => categories.includes(t.category));
  const present = categories.filter((c) => list.some((t) => t.category === c));
  const shown = group === "all" ? list : list.filter((t) => t.category === group);
  const done = list.filter((t) => t.completedAt).length;
  const pct = list.length ? (done / list.length) * 100 : 0;
  const replace = (u: ReadinessTask) => tasks.setData(all.map((t) => (t.id === u.id ? u : t)));

  if (list.length === 0)
    return (
      <Panel icon={<ClipboardList className="size-5" />} title={title}>
        <p className="text-muted">{emptyText}</p>
      </Panel>
    );

  return (
    <section className="rounded-3xl border border-white/80 bg-card p-5 shadow-soft sm:p-6">
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
      {present.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Checklist section">
          <Chip selected={group === "all"} onClick={() => setGroup("all")}>
            All
          </Chip>
          {present.map((c) => {
            const n = list.filter((t) => t.category === c);
            return (
              <Chip key={c} selected={group === c} onClick={() => setGroup(c)}>
                {PREPARATION_LABELS[c] ?? c} {n.filter((t) => t.completedAt).length}/{n.length}
              </Chip>
            );
          })}
        </div>
      )}
      <ul className="mt-5 grid gap-3">
        {[...shown]
          .sort((a, b) => Number(Boolean(b.recommendedNow)) - Number(Boolean(a.recommendedNow)))
          .map((task) => (
            <Fragment key={task.id}>
              {task.recommendedNow && !task.completedAt && (
                <li aria-hidden className="-mb-2 text-xs font-bold text-clay-strong">Good to do around now</li>
              )}
              <TaskItem task={task} onChange={replace} />
            </Fragment>
          ))}
      </ul>
      <Link href="/checklist" className="mt-4 inline-block text-sm font-bold text-clay-strong hover:underline">
        Open your full checklist →
      </Link>
    </section>
  );
}
