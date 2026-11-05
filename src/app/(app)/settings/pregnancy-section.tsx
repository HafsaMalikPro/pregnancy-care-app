"use client";

import { useState } from "react";
import { DatingFields, toDatingInput, useDatingDraft } from "@/components/dating-form";
import { PregnancyDetailsFields } from "@/components/profile-fields";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  ErrorState,
  Field,
  Input,
  Loading,
  SectionTitle,
  Select,
} from "@/components/ui";
import { api, errorMessage, isNotFound } from "@/lib/api";
import { formatDate, todayIso } from "@/lib/dates";
import { DATING_METHODS } from "@/lib/labels";
import type {
  DatingRecord,
  DatingSource,
  Pregnancy,
  PregnancyDetails,
  PregnancyOutcome,
} from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function PregnancySection() {
  const pregnancy = useApi<Pregnancy>("/v1/pregnancies/current");

  if (pregnancy.loading) return <Loading />;
  if (isNotFound(pregnancy.error)) {
    return (
      <Card>
        <SectionTitle>Pregnancy</SectionTitle>
        <p className="mb-4 text-muted">You&apos;re not tracking a pregnancy right now.</p>
        <ButtonLink href="/onboarding">Start tracking a pregnancy</ButtonLink>
      </Card>
    );
  }
  if (pregnancy.error) return <ErrorState error={pregnancy.error} onRetry={pregnancy.reload} />;
  const p = pregnancy.data;
  if (!p) return null;

  return (
    <div className="grid gap-6">
      <DetailsCard pregnancy={p} onSaved={pregnancy.setData} />
      <DueDateCard pregnancy={p} onSaved={pregnancy.setData} />
      <EndCard onEnded={pregnancy.reload} />
    </div>
  );
}

function DetailsCard({
  pregnancy: p,
  onSaved,
}: {
  pregnancy: Pregnancy;
  onSaved: (p: Pregnancy) => void;
}) {
  const [details, setDetails] = useState<PregnancyDetails>({
    firstPregnancy: p.firstPregnancy,
    fetusCount: p.fetusCount,
    confirmedByClinician: p.confirmedByClinician,
    restrictExercise: p.restrictExercise,
    foodRestrictions: p.foodRestrictions,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      onSaved(await api<Pregnancy>("/v1/pregnancies/current", { method: "PATCH", body: details }));
      setMessage({ tone: "success", text: "Saved." });
    } catch (err) {
      setMessage({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle>Pregnancy details</SectionTitle>
      <form onSubmit={submit} className="grid gap-5">
        <PregnancyDetailsFields value={details} onChange={setDetails} />
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button type="submit" busy={busy} className="justify-self-start">
          Save details
        </Button>
      </form>
    </Card>
  );
}

function DueDateCard({
  pregnancy: p,
  onSaved,
}: {
  pregnancy: Pregnancy;
  onSaved: (p: Pregnancy) => void;
}) {
  const dating = useDatingDraft();
  const history = useApi<DatingRecord[]>("/v1/pregnancies/current/dating-history");
  const [source, setSource] = useState<DatingSource>("clinician");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ pregnancy: Pregnancy }>("/v1/pregnancies/current/dating", {
        method: "PUT",
        body: { dating: toDatingInput(dating.draft), source },
      });
      onSaved(res.pregnancy);
      setOpen(false);
      void history.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle>Due date</SectionTitle>
      <p>
        <span className="font-sans text-2xl font-semibold">{formatDate(p.dueDate)}</span>
        <span className="ml-2 text-sm text-muted">
          from {DATING_METHODS[p.datingMethod].toLowerCase()} ·{" "}
          {p.datingSource === "clinician" ? "set by a clinician" : "self-reported"}
        </span>
      </p>

      {open ? (
        <form onSubmit={submit} className="mt-5 grid gap-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <DatingFields {...dating} />
          <Field label="Who gave you this date?">
            <Select value={source} onChange={(e) => setSource(e.target.value as DatingSource)}>
              <option value="clinician">My midwife or doctor</option>
              <option value="self">I worked it out myself</option>
            </Select>
          </Field>
          <div className="flex gap-3">
            <Button type="submit" busy={busy}>
              Update due date
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" className="mt-4" onClick={() => setOpen(true)}>
          Change due date
        </Button>
      )}

      {history.data && history.data.length > 1 && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-muted">History</p>
          <ul className="grid gap-1 text-sm">
            {history.data.map((h) => (
              <li key={h.id} className="flex justify-between gap-4">
                <span>
                  {formatDate(h.dueDate)} · {DATING_METHODS[h.method]}
                </span>
                <span className="text-muted">{formatDate(h.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

const OUTCOMES: Record<PregnancyOutcome, string> = {
  birth: "My baby has been born",
  loss: "My pregnancy has ended (loss)",
  other: "Other / prefer not to say",
};

function EndCard({ onEnded }: { onEnded: () => void }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<PregnancyOutcome>("birth");
  const [endedOn, setEndedOn] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/v1/pregnancies/current/end", { method: "POST", body: { outcome, endedOn } });
      onEnded();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle>End this pregnancy</SectionTitle>
      <p className="text-sm text-muted">
        Stops pregnancy updates. Your journal and history are kept until you delete them.
        If you&apos;ve experienced a loss, we&apos;re so sorry — please reach out to your
        care team for support.
      </p>
      {open ? (
        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
          {error && (
            <div className="sm:col-span-2">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          <Field label="What happened?">
            <Select value={outcome} onChange={(e) => setOutcome(e.target.value as PregnancyOutcome)}>
              {Object.entries(OUTCOMES).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" required max={todayIso()} value={endedOn} onChange={(e) => setEndedOn(e.target.value)} />
          </Field>
          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" busy={busy}>
              Confirm
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" className="mt-4" onClick={() => setOpen(true)}>
          End pregnancy
        </Button>
      )}
    </Card>
  );
}
