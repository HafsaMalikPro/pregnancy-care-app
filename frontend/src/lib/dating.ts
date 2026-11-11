/**
 * A preview of the due date for the onboarding summary, so people can check it before
 * saving. Mirrors `dueDateFrom` / `datingProblems` in the API's pregnancy/dating.ts; the API
 * recalculates on save and its answer is the one shown afterwards.
 */
import { addDays } from "./dates";
import type { DatingInput } from "./types";

const PREGNANCY_DAYS = 280;
const CONCEPTION_TO_DUE = 266;
const MAX_GESTATION_DAYS = 44 * 7;

export function estimateDueDate(input: DatingInput): string {
  switch (input.method) {
    case "lmp":
      return addDays(input.lmpDate, PREGNANCY_DAYS + ((input.cycleLengthDays ?? 28) - 28));
    case "due_date":
      return input.dueDate;
    case "ultrasound":
      return addDays(
        input.scanDate,
        PREGNANCY_DAYS - (input.gestationalWeeks * 7 + input.gestationalDays),
      );
    case "ivf":
      return addDays(input.transferDate, CONCEPTION_TO_DUE - input.embryoAgeDays);
  }
}

function daysBetween(from: string, to: string): number {
  const ms = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) -
    Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

/** Days pregnant on `today` for a pregnancy due on `dueDate`. May be negative. */
export const gestationDays = (dueDate: string, today: string) =>
  PREGNANCY_DAYS - daysBetween(today, dueDate);

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const intIn = (v: number, min: number, max: number) =>
  Number.isInteger(v) && v >= min && v <= max;

/** Problems with the inputs, in plain language; empty when the API should accept them. */
export function datingProblems(input: DatingInput, today: string): string[] {
  const problems: string[] = [];
  const date =
    input.method === "lmp"
      ? input.lmpDate
      : input.method === "due_date"
        ? input.dueDate
        : input.method === "ultrasound"
          ? input.scanDate
          : input.transferDate;
  if (!isDate(date)) return ["Choose a date."];

  if (input.method === "lmp" && input.cycleLengthDays !== undefined &&
      !intIn(input.cycleLengthDays, 20, 45)) {
    problems.push("Cycle length must be between 20 and 45 days.");
  }
  if (input.method === "ultrasound") {
    if (!intIn(input.gestationalWeeks, 4, 40)) {
      problems.push("Weeks at the scan must be between 4 and 40.");
    }
    if (!intIn(input.gestationalDays, 0, 6)) problems.push("Extra days must be 0 to 6.");
  }
  if (input.method === "ivf" && !intIn(input.embryoAgeDays, 2, 7)) {
    problems.push("Embryo age must be 2 to 7 days.");
  }
  if (problems.length) return problems;

  if (input.method !== "due_date" && date > today) {
    problems.push("This date can't be in the future.");
  }
  const days = gestationDays(estimateDueDate(input), today);
  if (days < 0) {
    problems.push("This due date is more than 40 weeks away. Please check the dates.");
  } else if (days > MAX_GESTATION_DAYS) {
    problems.push("This would be more than 44 weeks of pregnancy. Please check the dates.");
  }
  return problems;
}
