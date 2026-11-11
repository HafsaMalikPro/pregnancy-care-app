import { describe, expect, it } from "vitest";
import { datingProblems, estimateDueDate, gestationDays } from "./dating";

describe("estimateDueDate (mirrors the API)", () => {
  it("adds 280 days to the LMP, adjusted for cycle length", () => {
    expect(estimateDueDate({ method: "lmp", lmpDate: "2026-01-01" })).toBe("2026-10-08");
    expect(estimateDueDate({ method: "lmp", lmpDate: "2026-01-01", cycleLengthDays: 32 })).toBe("2026-10-12");
  });
  it("uses gestational age at an ultrasound", () => {
    expect(
      estimateDueDate({ method: "ultrasound", scanDate: "2026-03-01", gestationalWeeks: 10, gestationalDays: 2 }),
    ).toBe("2026-09-25");
  });
  it("uses 266 days minus embryo age for IVF", () => {
    expect(estimateDueDate({ method: "ivf", transferDate: "2026-02-01", embryoAgeDays: 5 })).toBe("2026-10-20");
  });
  it("keeps a known due date", () => {
    expect(estimateDueDate({ method: "due_date", dueDate: "2027-01-15" })).toBe("2027-01-15");
  });
});

describe("datingProblems", () => {
  const today = "2026-10-29";
  it("accepts a plausible pregnancy", () => {
    expect(datingProblems({ method: "lmp", lmpDate: "2026-08-06" }, today)).toEqual([]);
    expect(gestationDays(estimateDueDate({ method: "lmp", lmpDate: "2026-08-06" }), today)).toBe(84);
  });
  it("rejects a missing or future date", () => {
    expect(datingProblems({ method: "lmp", lmpDate: "" }, today)).toEqual(["Choose a date."]);
    expect(datingProblems({ method: "lmp", lmpDate: "2026-11-02" }, today)[0]).toMatch(/future/);
  });
  it("rejects due dates more than 40 weeks away or over 44 weeks of pregnancy", () => {
    expect(datingProblems({ method: "due_date", dueDate: "2027-09-01" }, today)[0]).toMatch(/40 weeks away/);
    expect(datingProblems({ method: "lmp", lmpDate: "2025-11-01" }, today)[0]).toMatch(/44 weeks/);
  });
  it("checks numeric ranges", () => {
    expect(
      datingProblems({ method: "ultrasound", scanDate: "2026-10-01", gestationalWeeks: 2, gestationalDays: 9 }, today),
    ).toEqual(["Weeks at the scan must be between 4 and 40.", "Extra days must be 0 to 6."]);
    expect(datingProblems({ method: "ivf", transferDate: "2026-10-01", embryoAgeDays: 9 }, today)).toEqual([
      "Embryo age must be 2 to 7 days.",
    ]);
  });
});
