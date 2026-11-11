"use client";

import { useState } from "react";
import { todayIso } from "@/lib/dates";
import { DATING_METHODS } from "@/lib/labels";
import type { DatingInput, DatingMethod } from "@/lib/types";
import { Field, Input, Select } from "./ui";

export interface DatingDraft {
  method: DatingMethod;
  lmpDate: string;
  cycleLengthDays: string;
  dueDate: string;
  scanDate: string;
  gestationalWeeks: string;
  gestationalDays: string;
  transferDate: string;
  embryoAgeDays: string;
}

export const emptyDating = (): DatingDraft => ({
  method: "lmp",
  lmpDate: "",
  cycleLengthDays: "28",
  dueDate: "",
  scanDate: "",
  gestationalWeeks: "",
  gestationalDays: "0",
  transferDate: "",
  embryoAgeDays: "5",
});

/** The API computes the due date; this only shapes the inputs for the chosen method. */
export function toDatingInput(d: DatingDraft): DatingInput {
  switch (d.method) {
    case "lmp":
      return {
        method: "lmp",
        lmpDate: d.lmpDate,
        ...(d.cycleLengthDays ? { cycleLengthDays: Number(d.cycleLengthDays) } : {}),
      };
    case "due_date":
      return { method: "due_date", dueDate: d.dueDate };
    case "ultrasound":
      return {
        method: "ultrasound",
        scanDate: d.scanDate,
        gestationalWeeks: Number(d.gestationalWeeks),
        gestationalDays: Number(d.gestationalDays || 0),
      };
    case "ivf":
      return {
        method: "ivf",
        transferDate: d.transferDate,
        embryoAgeDays: Number(d.embryoAgeDays),
      };
  }
}

export function useDatingDraft() {
  const [draft, setDraft] = useState<DatingDraft>(emptyDating);
  const set = <K extends keyof DatingDraft>(key: K, value: DatingDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return { draft, set };
}

export function DatingFields(props: ReturnType<typeof useDatingDraft>) {
  const { draft, set } = props;
  return (
    <div className="grid gap-4">
      <Field label="How would you like to date your pregnancy?">
        <Select
          value={draft.method}
          onChange={(e) => set("method", e.target.value as DatingMethod)}
        >
          {Object.entries(DATING_METHODS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <DateInputs {...props} />
    </div>
  );
}

/** The inputs for the chosen method only. */
export function DateInputs({ draft, set }: ReturnType<typeof useDatingDraft>) {
  const today = todayIso();
  return (
    <div className="grid gap-4">
      {draft.method === "lmp" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First day of your last period">
            <Input
              type="date"
              required
              max={today}
              value={draft.lmpDate}
              onChange={(e) => set("lmpDate", e.target.value)}
            />
          </Field>
          <Field label="Usual cycle length (days)" hint="28 if you're not sure">
            <Input
              type="number"
              min={20}
              max={45}
              value={draft.cycleLengthDays}
              onChange={(e) => set("cycleLengthDays", e.target.value)}
            />
          </Field>
        </div>
      )}

      {draft.method === "due_date" && (
        <Field label="Due date">
          <Input
            type="date"
            required
            value={draft.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
          />
        </Field>
      )}

      {draft.method === "ultrasound" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Scan date">
            <Input
              type="date"
              required
              max={today}
              value={draft.scanDate}
              onChange={(e) => set("scanDate", e.target.value)}
            />
          </Field>
          <Field label="Weeks at scan">
            <Input
              type="number"
              required
              min={4}
              max={40}
              value={draft.gestationalWeeks}
              onChange={(e) => set("gestationalWeeks", e.target.value)}
            />
          </Field>
          <Field label="+ days">
            <Input
              type="number"
              min={0}
              max={6}
              value={draft.gestationalDays}
              onChange={(e) => set("gestationalDays", e.target.value)}
            />
          </Field>
        </div>
      )}

      {draft.method === "ivf" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Transfer date">
            <Input
              type="date"
              required
              max={today}
              value={draft.transferDate}
              onChange={(e) => set("transferDate", e.target.value)}
            />
          </Field>
          <Field label="Embryo age at transfer">
            <Select
              value={draft.embryoAgeDays}
              onChange={(e) => set("embryoAgeDays", e.target.value)}
            >
              {[2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>
                  Day {d}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </div>
  );
}
