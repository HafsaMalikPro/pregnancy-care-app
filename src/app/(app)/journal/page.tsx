"use client";

import { useMemo, useState } from "react";
import {
  Alert,
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
  Textarea,
  cx,
} from "@/components/ui";
import { api, errorMessage, isNotFound } from "@/lib/api";
import { addDays, formatDate, todayIso } from "@/lib/dates";
import { SYMPTOMS } from "@/lib/labels";
import type { DailyLog, SymptomCode } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const NOTE_MAX_LENGTH = 2000;
const HISTORY_DAYS = 30;

export default function JournalPage() {
  const today = todayIso();
  const from = addDays(today, -(HISTORY_DAYS - 1));
  const history = useApi<DailyLog[]>(`/v1/daily-logs?from=${from}&to=${today}`);
  const [date, setDate] = useState(today);

  const frequency = useMemo(() => {
    const counts = new Map<SymptomCode, number>();
    for (const log of history.data ?? []) {
      for (const s of log.symptoms) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [history.data]);

  if (history.error) return <ErrorState error={history.error} onRetry={history.reload} />;

  return (
    <div>
      <PageHeader
        title="Journal"
        subtitle="Note how you feel. Bring it to your appointments — it helps."
      />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <div className="grid gap-5">
            <Field label="Day">
              <Input
                type="date"
                max={today}
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
            </Field>
            <DayEntry key={date} date={date} onChanged={() => void history.reload()} />
          </div>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <SectionTitle>Last {HISTORY_DAYS} days</SectionTitle>
            {frequency.length ? (
              <ul className="grid gap-2">
                {frequency.slice(0, 6).map(([code, count]) => (
                  <li key={code} className="flex items-center gap-3 text-sm">
                    <span className="w-36 shrink-0">{SYMPTOMS[code]}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunk">
                      <span
                        className="block h-full rounded-full bg-plum"
                        style={{ width: `${(count / HISTORY_DAYS) * 100}%` }}
                      />
                    </span>
                    <span className="w-14 text-right text-muted">
                      {count} day{count === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No symptoms logged yet.</p>
            )}
          </Card>

          <div>
            <SectionTitle>Recent entries</SectionTitle>
            {history.data && history.data.length === 0 ? (
              <EmptyState title="No entries yet" />
            ) : (
              <ul className="grid gap-2">
                {[...(history.data ?? [])].reverse().map((log) => (
                  <li key={log.date}>
                    <button
                      type="button"
                      onClick={() => setDate(log.date)}
                      className={cx(
                        "w-full rounded-2xl border px-4 py-3 text-left transition hover:border-clay",
                        log.date === date ? "border-clay bg-clay-soft" : "border-line bg-card",
                      )}
                    >
                      <span className="block text-sm font-semibold">
                        {formatDate(log.date, { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                      <span className="block truncate text-sm text-muted">
                        {log.symptoms.map((s) => SYMPTOMS[s]).join(", ") || "No symptoms"}
                        {log.note ? ` · ${log.note}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The form for one day, mounted fresh per date so its state starts from that day's log. */
function DayEntry({ date, onChanged }: { date: string; onChanged: () => void }) {
  const entry = useApi<DailyLog>(`/v1/daily-logs/${date}`);
  if (entry.loading) return <Loading />;
  if (entry.error && !isNotFound(entry.error)) {
    return <ErrorState error={entry.error} onRetry={entry.reload} />;
  }
  return <EntryForm date={date} initial={entry.data ?? null} onChanged={onChanged} />;
}

function EntryForm({
  date,
  initial,
  onChanged,
}: {
  date: string;
  initial: DailyLog | null;
  onChanged: () => void;
}) {
  const [symptoms, setSymptoms] = useState<SymptomCode[]>(initial?.symptoms ?? []);
  const [note, setNote] = useState(initial?.note ?? "");
  const [exists, setExists] = useState(initial !== null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const toggle = (code: SymptomCode) =>
    setSymptoms((list) =>
      list.includes(code) ? list.filter((c) => c !== code) : [...list, code],
    );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api(`/v1/daily-logs/${date}`, {
        method: "PUT",
        body: { symptoms, note: note.trim() || null },
      });
      setExists(true);
      setMessage({ tone: "success", text: "Saved." });
      onChanged();
    } catch (err) {
      setMessage({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete your entry for ${formatDate(date)}?`)) return;
    setBusy(true);
    try {
      await api(`/v1/daily-logs/${date}`, { method: "DELETE" });
      setSymptoms([]);
      setNote("");
      setExists(false);
      setMessage({ tone: "success", text: "Entry deleted." });
      onChanged();
    } catch (err) {
      setMessage({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-5">
      <div>
        <span className="mb-2 block text-sm font-semibold">Anything you noticed?</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SYMPTOMS) as SymptomCode[]).map((code) => (
            <Chip key={code} selected={symptoms.includes(code)} onClick={() => toggle(code)}>
              {SYMPTOMS[code]}
            </Chip>
          ))}
        </div>
      </div>
      <Field label="Notes" hint={`${note.length}/${NOTE_MAX_LENGTH} · private to you`}>
        <Textarea
          rows={5}
          maxLength={NOTE_MAX_LENGTH}
          value={note}
          placeholder="Sleep, mood, baby's movements, questions for your midwife…"
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" busy={busy}>
          {exists ? "Update entry" : "Save entry"}
        </Button>
        {exists && (
          <Button type="button" variant="ghost" onClick={remove} disabled={busy}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
