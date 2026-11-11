"use client";

import { browserTimeZone } from "@/lib/dates";
import {
  ACTIVITY_LEVELS,
  DIET_PATTERNS,
  FETUS_COUNTS,
  FOOD_ALLERGIES,
} from "@/lib/labels";
import type {
  ActivityLevel,
  DietPattern,
  FetusCount,
  PregnancyDetails,
  Profile,
} from "@/lib/types";
import { useState } from "react";
import { Checkbox, Chip, Field, Input, Select } from "./ui";

export const defaultProfile = (): Profile => ({
  timeZone: browserTimeZone(),
  locale: "en",
  planningHorizonMonths: null,
  countryCode: null,
  dietPattern: null,
  foodAllergies: [],
  activityLevel: null,
});

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export function ProfileFields({
  value,
  onChange,
}: {
  value: Profile;
  onChange: (p: Profile) => void;
}) {
  const set = <K extends keyof Profile>(key: K, v: Profile[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Eating pattern">
          <Select
            value={value.dietPattern ?? ""}
            onChange={(e) => set("dietPattern", (e.target.value || null) as DietPattern | null)}
          >
            <option value="">Prefer not to say</option>
            {Object.entries(DIET_PATTERNS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Activity level">
          <Select
            value={value.activityLevel ?? ""}
            onChange={(e) =>
              set("activityLevel", (e.target.value || null) as ActivityLevel | null)
            }
          >
            <option value="">Prefer not to say</option>
            {Object.entries(ACTIVITY_LEVELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div>
        <span className="mb-2 block text-sm font-semibold">Food allergies</span>
        <div className="flex flex-wrap gap-2">
          {Object.entries(FOOD_ALLERGIES).map(([v, label]) => (
            <Chip
              key={v}
              selected={value.foodAllergies.includes(v)}
              onClick={() => set("foodAllergies", toggle(value.foodAllergies, v))}
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Time zone" hint="Used to work out what “today” is for you">
          <Input
            value={value.timeZone}
            onChange={(e) => set("timeZone", e.target.value)}
          />
        </Field>
        <Field label="Country code" hint="Two letters, e.g. GB, US, PK (optional)">
          <Input
            maxLength={2}
            value={value.countryCode ?? ""}
            onChange={(e) =>
              set("countryCode", e.target.value.toUpperCase() || null)
            }
          />
        </Field>
      </div>
    </div>
  );
}

export function PregnancyDetailsFields({
  value,
  onChange,
}: {
  value: PregnancyDetails;
  onChange: (d: PregnancyDetails) => void;
}) {
  const set = <K extends keyof PregnancyDetails>(key: K, v: PregnancyDetails[K]) =>
    onChange({ ...value, [key]: v });
  const bool = (v: boolean | null | undefined) =>
    v === true ? "yes" : v === false ? "no" : "";
  const parseBool = (v: string) => (v === "yes" ? true : v === "no" ? false : null);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="How many babies?">
          <Select
            value={value.fetusCount ?? "unknown"}
            onChange={(e) => set("fetusCount", e.target.value as FetusCount)}
          >
            {Object.entries(FETUS_COUNTS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="First pregnancy?">
          <Select
            value={bool(value.firstPregnancy)}
            onChange={(e) => set("firstPregnancy", parseBool(e.target.value))}
          >
            <option value="">Prefer not to say</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
        <Field label="Confirmed by a clinician?">
          <Select
            value={bool(value.confirmedByClinician)}
            onChange={(e) => set("confirmedByClinician", parseBool(e.target.value))}
          >
            <option value="">Not yet / not sure</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
      </div>
      <Checkbox
        label="My clinician has advised me to avoid exercise (we'll hide movement suggestions)"
        checked={value.restrictExercise ?? false}
        onChange={(e) => set("restrictExercise", e.target.checked)}
      />
      <Field
        label="Foods my clinician told me to avoid"
        hint="Comma separated, e.g. dairy, caffeine"
      >
        <ListInput
          value={value.foodRestrictions ?? []}
          onChange={(list) => set("foodRestrictions", list)}
        />
      </Field>
    </div>
  );
}

/** Comma-separated list input that keeps the raw text so commas can be typed. */
function ListInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (list: string[]) => void;
}) {
  const [raw, setRaw] = useState(value.join(", "));
  return (
    <Input
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(
          e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
