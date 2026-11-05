"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  PageHeader,
  SectionTitle,
  Select,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import {
  REMINDER_KINDS,
  WEEKDAYS,
  WEEKDAY_LABELS,
  describeRecurrence,
} from "@/lib/labels";
import type { Reminder, ReminderKind } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type Weekday = (typeof WEEKDAYS)[number];

// Pregnancy has no periods, so cycle reminders are not offered here.
const KINDS: ReminderKind[] = ["daily_log", "readiness_checkin", "custom"];

export default function RemindersPage() {
  const reminders = useApi<Reminder[]>("/v1/reminders");

  if (reminders.loading) return <Loading />;
  if (reminders.error) return <ErrorState error={reminders.error} onRetry={reminders.reload} />;
  const list = reminders.data ?? [];

  return (
    <div>
      <PageHeader
        title="Reminders"
        subtitle="Gentle nudges at times that suit you. Labels stay discreet — no health details."
      />
      <div className="mb-6">
        <Alert tone="info">
          Reminders are saved to your account. Notifications in the browser aren&apos;t sent
          yet.
        </Alert>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <NewReminder onCreated={(r) => reminders.setData([...list, r])} />
        <div>
          <SectionTitle>Your reminders</SectionTitle>
          {list.length === 0 ? (
            <EmptyState title="No reminders yet">Add one to get started.</EmptyState>
          ) : (
            <ul className="grid gap-3">
              {list.map((r) => (
                <ReminderRow
                  key={r.id}
                  reminder={r}
                  onChange={(updated) =>
                    reminders.setData(list.map((x) => (x.id === updated.id ? updated : x)))
                  }
                  onDelete={() => reminders.setData(list.filter((x) => x.id !== r.id))}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function NewReminder({ onCreated }: { onCreated: (r: Reminder) => void }) {
  const [kind, setKind] = useState<ReminderKind>("daily_log");
  const [localTime, setLocalTime] = useState("20:00");
  const [daily, setDaily] = useState(true);
  const [days, setDays] = useState<Weekday[]>(["MO", "TH"]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!daily && days.length === 0) return setError("Pick at least one day.");
    setBusy(true);
    setError(null);
    try {
      const ordered = WEEKDAYS.filter((d) => days.includes(d));
      onCreated(
        await api<Reminder>("/v1/reminders", {
          method: "POST",
          body: {
            kind,
            localTime,
            recurrence: daily ? "FREQ=DAILY" : `FREQ=WEEKLY;BYDAY=${ordered.join(",")}`,
            label: label.trim() || null,
            enabled: true,
          },
        }),
      );
      setLabel("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle>New reminder</SectionTitle>
      <form onSubmit={submit} className="grid gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as ReminderKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {REMINDER_KINDS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Time">
            <Input
              type="time"
              required
              value={localTime}
              onChange={(e) => setLocalTime(e.target.value)}
            />
          </Field>
        </div>
        <div>
          <span className="mb-2 block text-sm font-semibold">Repeat</span>
          <div className="flex flex-wrap gap-2">
            <Chip selected={daily} onClick={() => setDaily(true)}>
              Every day
            </Chip>
            <Chip selected={!daily} onClick={() => setDaily(false)}>
              Some days
            </Chip>
          </div>
          {!daily && (
            <div className="mt-3 flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <Chip
                  key={d}
                  selected={days.includes(d)}
                  onClick={() =>
                    setDays((list) =>
                      list.includes(d) ? list.filter((x) => x !== d) : [...list, d],
                    )
                  }
                >
                  {WEEKDAY_LABELS[d]}
                </Chip>
              ))}
            </div>
          )}
        </div>
        <Field label="Label (optional)" hint="Shown on your lock screen, so keep it discreet">
          <Input
            maxLength={60}
            value={label}
            placeholder="Time for a check-in"
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <Button type="submit" busy={busy} className="justify-self-start">
          Add reminder
        </Button>
      </form>
    </Card>
  );
}

function ReminderRow({
  reminder: r,
  onChange,
  onDelete,
}: {
  reminder: Reminder;
  onChange: (r: Reminder) => void;
  onDelete: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-sans text-2xl font-semibold">{r.localTime}</span>
            {!r.enabled && <Badge tone="neutral">Paused</Badge>}
          </div>
          <p className="text-sm text-muted">
            {r.label ?? REMINDER_KINDS[r.kind]} · {describeRecurrence(r.recurrence)}
          </p>
          {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              run(async () =>
                onChange(
                  await api<Reminder>(`/v1/reminders/${r.id}`, {
                    method: "PATCH",
                    body: { enabled: !r.enabled },
                  }),
                ),
              )
            }
          >
            {r.enabled ? "Pause" : "Resume"}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api(`/v1/reminders/${r.id}`, { method: "DELETE" });
                onDelete();
              })
            }
          >
            Delete
          </Button>
        </div>
      </Card>
    </li>
  );
}
