import { describe, expect, it } from "vitest";
import { articlesAbout, mergeRuns, sectionByTrimester, trimesterForWeek, uniqueItems, TOPIC_WORDS } from "./topics";
import type { ArticleSummary, WeekGuide } from "./types";

const guide = (week: number, eat: string, avoid: string[] = []): WeekGuide => ({
  week,
  locale: "en",
  version: 1,
  title: `Week ${week}`,
  summary: "",
  sections: {
    baby: "",
    body: "",
    symptoms: [],
    eat,
    move: "",
    visits: "",
    askAtVisit: [],
    prepare: [],
    avoid,
    whenToGetHelp: [],
    checklist: [],
    message: null,
    firstPregnancyNote: null,
    subsequentPregnancyNote: null,
  } as unknown as WeekGuide["sections"],
  references: [],
  review: null,
  publishedAt: "2026-01-01T00:00:00Z",
  nextReviewDue: null,
});

describe("trimesterForWeek", () => {
  it("uses the 13 / 27 boundaries", () => {
    expect([1, 13, 14, 27, 28, 42].map(trimesterForWeek)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe("sectionByTrimester", () => {
  it("groups by trimester, sorts by week and skips missing or empty sections", () => {
    const result = sectionByTrimester(
      [guide(20, "Iron"), null, guide(8, "Folate"), guide(12, "  "), guide(30, "Protein")],
      (g) => g.sections.eat,
    );
    expect(result[1]).toEqual([{ week: 8, value: "Folate" }]);
    expect(result[2]).toEqual([{ week: 20, value: "Iron" }]);
    expect(result[3]).toEqual([{ week: 30, value: "Protein" }]);
  });

  it("skips empty lists", () => {
    const result = sectionByTrimester([guide(9, "", []), guide(10, "", ["Raw fish"])], (g) => g.sections.avoid);
    expect(result[1]).toEqual([{ week: 10, value: ["Raw fish"] }]);
  });
});

describe("uniqueItems", () => {
  it("keeps the first spelling and drops repeats regardless of case", () => {
    expect(uniqueItems([["Raw fish", "Alcohol"], ["alcohol ", "Pâté"]])).toEqual([
      "Raw fish",
      "Alcohol",
      "Pâté",
    ]);
  });
});

describe("articlesAbout", () => {
  const a = (slug: string, title: string) => ({ slug, title }) as ArticleSummary;
  it("matches on slug or title", () => {
    const list = [a("folic-acid", "Folic acid basics"), a("x", "Gentle yoga"), a("y", "Your rights")];
    expect(articlesAbout(list, TOPIC_WORDS.nutrition).map((x) => x.slug)).toEqual(["folic-acid"]);
    expect(articlesAbout(list, TOPIC_WORDS.exercise).map((x) => x.slug)).toEqual(["x"]);
  });
});

describe("mergeRuns", () => {
  it("joins consecutive identical weeks and keeps gaps and changes separate", () => {
    const items = [6, 7, 8].map((week) => ({ week, value: "A" }));
    expect(mergeRuns([...items, { week: 9, value: "B" }, { week: 11, value: "B" }])).toEqual([
      { from: 6, to: 8, value: "A" },
      { from: 9, to: 9, value: "B" },
      { from: 11, to: 11, value: "B" },
    ]);
  });
});
