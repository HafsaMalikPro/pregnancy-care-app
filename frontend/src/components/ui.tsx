"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useId, useState } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";

import { cx } from "@/lib/cx";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-linear-to-b from-clay to-clay-strong text-on-primary shadow-soft hover:brightness-95",
  secondary: "border border-clay/40 bg-card text-clay-strong hover:bg-clay-soft",
  ghost: "text-ink hover:bg-sunk",
  danger: "bg-danger text-white hover:opacity-90",
};

const buttonClass = (variant: ButtonVariant, className?: string) =>
  cx(
    "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
    BUTTON_VARIANTS[variant],
    className,
  );

export function Button({
  variant = "primary",
  busy = false,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      className={buttonClass(variant, className)}
    >
      {busy && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link {...props} className={buttonClass(variant, className)} />;
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cx(
        "rounded-[1.75rem] border border-line/70 bg-card p-5 shadow-soft sm:p-6",
        className,
      )}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="font-sans text-3xl font-extrabold tracking-tight sm:text-[2.5rem] sm:leading-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 font-sans text-xl font-bold tracking-tight">
      {children}
    </h2>
  );
}

/** The id of the control inside the nearest Field, so its label points at it. */
const FieldId = createContext<{ id: string; hasHint: boolean } | undefined>(undefined);

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <FieldId.Provider value={{ id, hasHint: Boolean(hint) }}>{children}</FieldId.Provider>
      {hint && (
        <span id={`${id}-hint`} className="mt-1 block text-xs text-muted">
          {hint}
        </span>
      )}
    </div>
  );
}

/** id and aria-describedby for a control rendered inside a Field. */
function useFieldProps(props: { id?: string; "aria-describedby"?: string }) {
  const field = useContext(FieldId);
  return {
    id: props.id ?? field?.id,
    "aria-describedby":
      props["aria-describedby"] ?? (field?.hasHint ? `${field.id}-hint` : undefined),
  };
}

const controlClass =
  "w-full rounded-2xl border border-line bg-card px-4 py-2.5 text-ink placeholder:text-muted/70 focus:border-clay focus:outline-none";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const field = useFieldProps(props);
  return <input {...props} {...field} className={cx(controlClass, props.className)} />;
}

/** Password field with a show/hide toggle. */
export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  const field = useFieldProps(props);
  return (
    <span className="relative block">
      <input
        {...props}
        {...field}
        type={shown ? "text" : "password"}
        className={cx(controlClass, "pr-12", props.className)}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-1 my-auto grid size-10 place-items-center rounded-full text-muted hover:text-ink"
      >
        {shown ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
      </button>
    </span>
  );
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const field = useFieldProps(props);
  return <textarea {...props} {...field} className={cx(controlClass, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const field = useFieldProps(props);
  return <select {...props} {...field} className={cx(controlClass, props.className)} />;
}

export function Checkbox({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 size-5 shrink-0 accent-[var(--clay)]"
      />
      <span>{label}</span>
    </label>
  );
}

/** A toggleable pill, used for symptoms, allergies and weekdays. */
export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        "min-h-10 rounded-full border px-4 text-sm font-semibold transition",
        selected
          ? "border-clay bg-clay-soft text-clay-strong"
          : "border-line bg-card text-ink hover:border-clay/40",
      )}
    >
      {children}
    </button>
  );
}

type Tone = "info" | "success" | "warn" | "danger";
const TONES: Record<Tone, string> = {
  info: "bg-plum-soft text-plum",
  success: "bg-sage-soft text-sage",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

export function Alert({
  tone = "info",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-2xl px-4 py-3 text-sm", TONES[tone])}>
      {children}
    </div>
  );
}

export function Badge({
  tone = "info",
  children,
}: {
  tone?: Tone | "neutral";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "neutral" ? "bg-sunk text-muted" : TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className = "size-6" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block animate-spin rounded-full border-2 border-current border-r-transparent",
        className,
      )}
    />
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

/** Error panel with a consent-specific path, since most health endpoints need consent. */
export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  if (error instanceof ApiRequestError && error.code === "CONSENT_REQUIRED") {
    return (
      <Card className="text-center">
        <p className="font-sans text-xl font-semibold">
          We need your permission first
        </p>
        <p className="mx-auto mt-2 max-w-md text-muted">
          To store pregnancy and health details, we need your consent to process
          health data. You can withdraw it at any time in Settings.
        </p>
        <ButtonLink href="/onboarding" className="mt-5">
          Review and give consent
        </ButtonLink>
      </Card>
    );
  }
  return (
    <Alert tone="danger">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{errorMessage(error)}</span>
        {onRetry && (
          <button onClick={onRetry} className="font-semibold underline">
            Try again
          </button>
        )}
      </div>
    </Alert>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.75rem] border border-dashed border-clay/30 bg-card/60 px-6 py-12 text-center">
      <p className="font-sans text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 text-muted">{children}</div>}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-2.5 overflow-hidden rounded-full bg-sunk"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-clay" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Circular progress, e.g. how far through 40 weeks. */
export function ProgressRing({
  value,
  size = 120,
  label,
  children,
}: {
  value: number;
  size?: number;
  label: string;
  children?: React.ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 44;
  const circumference = 2 * Math.PI * r;
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--clay-soft)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--sage-bright)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
        />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

/** A soft tinted circle holding an icon. */
export function IconBadge({
  tone = "rose",
  className,
  children,
}: {
  tone?: "rose" | "sage" | "plum" | "warn";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    rose: "bg-clay-soft text-clay-strong",
    sage: "bg-sage-soft text-sage",
    plum: "bg-plum-soft text-plum",
    warn: "bg-warn-soft text-warn",
  };
  return (
    <span
      aria-hidden
      className={cx("grid size-11 shrink-0 place-items-center rounded-full", tones[tone], className)}
    >
      {children}
    </span>
  );
}

/** Numbered progress for multi-step flows. */
export function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {steps.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
          <span
            aria-current={i === current ? "step" : undefined}
            className={cx(
              "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold",
              i < current && "bg-clay-soft text-clay-strong",
              i === current && "bg-clay text-white",
              i > current && "border border-line bg-card text-muted",
            )}
          >
            {i + 1}
            <span className="sr-only">: {label}{i < current ? " (done)" : ""}</span>
          </span>
          {i < steps.length - 1 && (
            <span className={cx("h-0.5 flex-1 rounded", i < current ? "bg-clay" : "bg-line")} />
          )}
        </li>
      ))}
    </ol>
  );
}

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {item.href ? (
              <Link href={item.href} className="font-semibold hover:text-clay-strong hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export { cx };
