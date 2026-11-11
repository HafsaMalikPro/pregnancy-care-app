"use client";

import {
  ArrowLeft,
  CalendarCheck,
  Droplet,
  FlaskConical,
  Pencil,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MotherArt, WombArt } from "@/components/art";
import { DateInputs, toDatingInput, useDatingDraft } from "@/components/dating-form";
import { PregnancyDetailsFields } from "@/components/profile-fields";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  ErrorState,
  IconBadge,
  Loading,
  Stepper,
  cx,
} from "@/components/ui";
import { ApiRequestError, api, errorMessage, isNotFound } from "@/lib/api";
import { CONSENT_COPY, recordConsent } from "@/lib/consent";
import { datingProblems, estimateDueDate, gestationDays } from "@/lib/dating";
import { browserTimeZone, formatDate, todayIso } from "@/lib/dates";
import { DATING_METHODS, FETUS_COUNTS } from "@/lib/labels";
import type {
  ConsentPurpose,
  ConsentState,
  DatingMethod,
  Pregnancy,
  PregnancyDetails,
  Profile,
} from "@/lib/types";

const STEPS = ["Welcome", "Privacy", "Method", "Dates", "Summary"] as const;
const WELCOME = 0;
const PRIVACY = 1;
const METHOD = 2;
const DATES = 3;
const SUMMARY = 4;

const METHOD_CARDS: { method: DatingMethod; title: string; hint: string; icon: LucideIcon }[] = [
  { method: "lmp", title: "Last menstrual period", hint: "The most common method", icon: Droplet },
  { method: "due_date", title: "Estimated due date", hint: "If you already know your date", icon: CalendarCheck },
  { method: "ultrasound", title: "Ultrasound dating", hint: "Based on a scan you've had", icon: ScanLine },
  { method: "ivf", title: "IVF / fertility treatment", hint: "For assisted conception", icon: FlaskConical },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [profile, setProfile] = useState<{ value: Profile; neverSaved: boolean } | null>(null);
  const [created, setCreated] = useState<Pregnancy | null>(null);
  const dating = useDatingDraft();
  const [details, setDetails] = useState<PregnancyDetails>({
    fetusCount: "one",
    firstPregnancy: null,
    confirmedByClinician: null,
    restrictExercise: false,
    foodRestrictions: [],
  });

  // Resume: people who already consented start at the dating method.
  useEffect(() => {
    (async () => {
      try {
        const consents = await api<ConsentState[]>("/v1/me/consents");
        const health = consents.find((c) => c.purpose === "health_data_processing");
        if (!health?.granted) return setStep(WELCOME);
        try {
          await api<Pregnancy>("/v1/pregnancies/current");
          return router.replace("/dashboard");
        } catch (err) {
          if (!isNotFound(err)) throw err;
        }
        setStep(METHOD);
      } catch (err) {
        setLoadError(err);
      }
    })();
  }, [router]);

  // The profile needs consent, so it loads once that step is done.
  useEffect(() => {
    if (step === null || step < METHOD || profile) return;
    api<Profile>("/v1/me/profile").then(
      (saved) => {
        // The API returns a UTC default until a profile is saved.
        const neverSaved = saved.timeZone === "UTC" && browserTimeZone() !== "UTC";
        setProfile({
          value: neverSaved ? { ...saved, timeZone: browserTimeZone() } : saved,
          neverSaved,
        });
      },
      setLoadError,
    );
  }, [step, profile]);

  if (loadError) return <ErrorState error={loadError} />;
  if (step === null) return <Loading />;
  if (created) return <Done pregnancy={created} />;

  const back = step > WELCOME && (
    <button
      type="button"
      onClick={() => setStep(step - 1)}
      className="mb-6 inline-flex items-center gap-2 rounded-full text-sm font-semibold text-muted hover:text-clay-strong"
    >
      <ArrowLeft className="size-4" aria-hidden /> Back
    </button>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <Stepper steps={STEPS} current={step} />
        <p className="mt-3 text-sm text-muted">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
      </div>
      {back}

      {step === WELCOME && (
        <Card className="text-center">
          <MotherArt className="mx-auto h-auto w-56" priority />
          <h1 className="mt-4 font-sans text-3xl font-bold sm:text-4xl">
            You&apos;re in good hands
          </h1>
          <p className="mx-auto mt-3 max-w-md text-muted">
            We&apos;ll ask how far along you are so we can show the right week&apos;s guide,
            your timeline and milestones. It takes about a minute, and you can change
            anything later.
          </p>
          <Button className="mt-6 w-full sm:w-auto sm:px-10" onClick={() => setStep(PRIVACY)}>
            Get started
          </Button>
        </Card>
      )}

      {step === PRIVACY && <ConsentStep onDone={() => setStep(METHOD)} />}

      {step === METHOD && (
        <Card>
          <h1 className="font-sans text-3xl font-bold">
            How would you like to set your due date?
          </h1>
          <p className="mt-2 text-muted">Choose the method that works best for you.</p>
          <fieldset className="mt-6 grid gap-3">
            <legend className="sr-only">Dating method</legend>
            {METHOD_CARDS.map(({ method, title, hint, icon: Icon }) => {
              const selected = dating.draft.method === method;
              return (
                <label
                  key={method}
                  className={cx(
                    "flex cursor-pointer items-center gap-4 rounded-3xl border p-4 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-clay",
                    selected ? "border-clay bg-clay-soft/60" : "border-line bg-card hover:border-clay/40",
                  )}
                >
                  <IconBadge>
                    <Icon className="size-5" />
                  </IconBadge>
                  <span className="flex-1">
                    <span className="block font-semibold text-heading">{title}</span>
                    <span className="block text-sm text-muted">{hint}</span>
                  </span>
                  <input
                    type="radio"
                    name="method"
                    value={method}
                    checked={selected}
                    onChange={() => dating.set("method", method)}
                    className="size-5 accent-[var(--clay)]"
                  />
                </label>
              );
            })}
          </fieldset>
          <Button className="mt-6 w-full" onClick={() => setStep(DATES)}>
            Continue
          </Button>
        </Card>
      )}

      {step === DATES && (
        <DatesStep dating={dating} details={details} setDetails={setDetails} onDone={() => setStep(SUMMARY)} />
      )}

      {step === SUMMARY && (
        <SummaryStep
          dating={dating}
          details={details}
          profile={profile}
          edit={setStep}
          onCreated={setCreated}
        />
      )}
    </div>
  );
}

function ConsentStep({ onDone }: { onDone: () => void }) {
  const [choices, setChoices] = useState<Record<ConsentPurpose, boolean>>({
    health_data_processing: false,
    product_analytics: false,
    marketing_email: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      for (const purpose of Object.keys(choices) as ConsentPurpose[]) {
        await recordConsent(purpose, choices[purpose], "web_onboarding");
      }
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h1 className="font-sans text-3xl font-bold">Your privacy comes first</h1>
      <p className="mt-2 text-muted">
        Pregnancy information is sensitive. Choose what we may do with it. You can change
        these choices, download your data or delete it at any time in Settings.
      </p>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {(Object.keys(CONSENT_COPY) as ConsentPurpose[]).map((purpose) => (
          <div key={purpose} className="rounded-3xl border border-line p-4">
            <Checkbox
              checked={choices[purpose]}
              onChange={(e) => setChoices((c) => ({ ...c, [purpose]: e.target.checked }))}
              label={
                <>
                  <span className="block font-semibold text-heading">
                    {CONSENT_COPY[purpose].title}
                    {purpose === "health_data_processing" && (
                      <span className="font-normal text-clay-strong"> (required)</span>
                    )}
                  </span>
                  <span className="text-muted">{CONSENT_COPY[purpose].body}</span>
                </>
              }
            />
          </div>
        ))}
        {!choices.health_data_processing && (
          <p className="text-sm text-muted">
            Without the first option we can&apos;t save your due date. You can still read the
            weekly guides and articles.
          </p>
        )}
        <Button type="submit" busy={busy} disabled={!choices.health_data_processing} className="w-full">
          Save choices and continue
        </Button>
      </form>
    </Card>
  );
}

function DatesStep({
  dating,
  details,
  setDetails,
  onDone,
}: {
  dating: ReturnType<typeof useDatingDraft>;
  details: PregnancyDetails;
  setDetails: (d: PregnancyDetails) => void;
  onDone: () => void;
}) {
  const [problems, setProblems] = useState<string[]>([]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = datingProblems(toDatingInput(dating.draft), todayIso());
    setProblems(found);
    if (found.length === 0) onDone();
  }

  return (
    <Card>
      <h1 className="font-sans text-3xl font-bold">
        {METHOD_CARDS.find((m) => m.method === dating.draft.method)?.title}
      </h1>
      <p className="mt-2 text-muted">
        Your due date is always an estimate. You can update it after a scan or if your
        midwife gives you a different date.
      </p>
      <form onSubmit={submit} className="mt-6 grid gap-6" noValidate>
        {problems.length > 0 && (
          <Alert tone="danger">
            {problems.map((p) => (
              <span key={p} className="block">{p}</span>
            ))}
          </Alert>
        )}
        <DateInputs {...dating} />
        <details className="rounded-3xl border border-line p-4">
          <summary className="cursor-pointer font-semibold text-heading">
            A few more details (optional)
          </summary>
          <div className="mt-4">
            <PregnancyDetailsFields value={details} onChange={setDetails} />
          </div>
        </details>
        <Button type="submit" className="w-full">
          Review
        </Button>
      </form>
    </Card>
  );
}

function SummaryStep({
  dating,
  details,
  profile,
  edit,
  onCreated,
}: {
  dating: ReturnType<typeof useDatingDraft>;
  details: PregnancyDetails;
  profile: { value: Profile; neverSaved: boolean } | null;
  edit: (step: number) => void;
  onCreated: (p: Pregnancy) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = toDatingInput(dating.draft);
  const today = todayIso();
  const due = estimateDueDate(input);
  const days = gestationDays(due, today);
  const d = dating.draft;

  const entered: Record<DatingMethod, string> = {
    lmp: `${formatDate(d.lmpDate)}, ${d.cycleLengthDays || 28}-day cycle`,
    due_date: formatDate(d.dueDate),
    ultrasound: `Scan on ${formatDate(d.scanDate)} at ${d.gestationalWeeks} weeks ${d.gestationalDays || 0} days`,
    ivf: `Transfer on ${formatDate(d.transferDate)}, day ${d.embryoAgeDays} embryo`,
  };

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      if (profile?.neverSaved) {
        await api("/v1/me/profile", { method: "PUT", body: profile.value });
      }
      onCreated(
        await api<Pregnancy>("/v1/pregnancies", {
          method: "POST",
          body: { ...details, dating: input, source: "self" },
        }),
      );
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "CONFLICT") {
        setError("You already have an active pregnancy. Open your dashboard to see it.");
      } else {
        setError(errorMessage(err));
      }
      setBusy(false);
    }
  }

  const rows: { label: string; value: string; step: number }[] = [
    { label: "Method", value: DATING_METHODS[d.method], step: METHOD },
    { label: "What you entered", value: entered[d.method], step: DATES },
    { label: "Babies", value: FETUS_COUNTS[details.fetusCount ?? "one"], step: DATES },
  ];

  return (
    <Card>
      <h1 className="font-sans text-3xl font-bold">Check your details</h1>
      <p className="mt-2 text-muted">
        Nothing is saved until you confirm. The due date below is calculated from what you
        entered.
      </p>

      <div className="mt-6 flex items-center gap-5 rounded-3xl bg-clay-soft/70 p-5">
        <WombArt week={Math.max(1, Math.floor(days / 7))} size={96} />
        <div>
          <p className="text-sm font-semibold text-clay-strong">Estimated due date</p>
          <p className="font-sans text-2xl font-semibold text-heading">
            {formatDate(due, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="text-sm text-muted">
            About {Math.floor(days / 7)} weeks {days % 7} days pregnant today
          </p>
        </div>
      </div>

      <dl className="mt-6 divide-y divide-line rounded-3xl border border-line">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-4 px-4 py-3">
            <div className="flex-1">
              <dt className="text-sm text-muted">{row.label}</dt>
              <dd className="font-semibold text-heading">{row.value}</dd>
            </div>
            <button
              type="button"
              onClick={() => edit(row.step)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-clay-strong hover:bg-clay-soft"
            >
              <Pencil className="size-3.5" aria-hidden /> Edit
              <span className="sr-only">{row.label.toLowerCase()}</span>
            </button>
          </div>
        ))}
        {profile && (
          <div className="px-4 py-3">
            <dt className="text-sm text-muted">Time zone</dt>
            <dd className="font-semibold text-heading">{profile.value.timeZone}</dd>
            {profile.neverSaved && (
              <dd className="text-sm text-muted">
                Taken from this browser so your days start at midnight where you are. You can
                change it in Settings.
              </dd>
            )}
          </div>
        )}
      </dl>

      {error && (
        <div className="mt-6">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <Button className="mt-6 w-full" busy={busy} disabled={!profile} onClick={confirm}>
        Confirm and save
      </Button>
    </Card>
  );
}

function Done({ pregnancy: p }: { pregnancy: Pregnancy }) {
  return (
    <Card className="mx-auto max-w-2xl text-center">
      <WombArt week={p.week} size={180} className="mx-auto" priority />
      <h1 className="mt-4 font-sans text-3xl font-bold sm:text-4xl">
        You&apos;re {p.gestationalAge.weeks} weeks {p.gestationalAge.days} days along
      </h1>
      <p className="mt-2 text-muted">
        Saved. Your due date is{" "}
        <strong className="text-heading">
          {formatDate(p.dueDate, { day: "numeric", month: "long", year: "numeric" })}
        </strong>
        . You can change it any time from Settings.
      </p>
      <ButtonLink href="/dashboard" className="mt-6 w-full sm:w-auto sm:px-10">
        Open my dashboard
      </ButtonLink>
    </Card>
  );
}
