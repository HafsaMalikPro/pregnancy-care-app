import {
  type CheckSymptomCode,
  RedFlagCode,
  type TriageLevel,
  TriageRuleSet,
  type TriageStage,
} from '@preconception/contracts';
import rulesFile from './triage-rules.json' with { type: 'json' };

const RANK: Record<TriageLevel, number> = {
  routine: 0,
  call_clinic_today: 1,
  emergency: 2,
};

export interface TriageOutcome {
  level: TriageLevel;
  matchedRules: string[];
  redFlags: { code: RedFlagCode; label: string }[];
}

/**
 * Validates a rule set and the safety invariants the API relies on. Throws at boot, so a bad
 * edit to the rules file can never ship:
 * - every red-flag code in the contracts has wording and a source;
 * - every red flag is covered by at least one rule (so a red flag can never come out routine);
 * - every rule and symptom cites a listed source.
 */
export function loadRuleSet(raw: unknown): TriageRuleSet {
  const rules = TriageRuleSet.parse(raw);
  const sourceIds = new Set(rules.sources.map((s) => s.id));
  const problems: string[] = [];
  const described = new Set(rules.symptoms.map((s) => s.code));
  const covered = new Set(rules.rules.flatMap((r) => r.anyOf));
  for (const code of RedFlagCode.options) {
    if (!described.has(code)) problems.push(`no wording for ${code}`);
    if (!covered.has(code)) problems.push(`no rule covers ${code}`);
  }
  for (const item of [...rules.symptoms, ...rules.rules]) {
    if (!sourceIds.has(item.source)) {
      problems.push(`unknown source ${item.source}`);
    }
  }
  if (rules.levels.emergency.callToAction?.kind !== 'emergency') {
    problems.push('emergency level needs an emergency call to action');
  }
  if (problems.length) {
    throw new Error(`Invalid triage rules: ${problems.join('; ')}`);
  }
  return rules;
}

/** The version-controlled rule set shipped with this build. */
export const TRIAGE_RULES = loadRuleSet(rulesFile);

const isRedFlag = (code: CheckSymptomCode): code is RedFlagCode =>
  (RedFlagCode.options as readonly string[]).includes(code);

/**
 * Rule-based triage. Never a diagnosis: it only says how urgently to contact care, from a fixed
 * list. The stage decides which warning signs the form offers, but it never lowers a result:
 * any selected red flag matches its rules whatever the stage.
 */
export function triage(
  symptoms: readonly CheckSymptomCode[],
  rules: TriageRuleSet = TRIAGE_RULES,
): TriageOutcome {
  const selected = new Set(symptoms.filter(isRedFlag));
  const matched = rules.rules.filter((r) =>
    r.anyOf.some((c) => selected.has(c)),
  );
  const level = matched.reduce<TriageLevel>(
    (best, r) => (RANK[r.level] > RANK[best] ? r.level : best),
    'routine',
  );
  const labels = new Map(rules.symptoms.map((s) => [s.code, s.label]));
  return {
    level,
    matchedRules: matched.map((r) => r.id),
    redFlags: [...selected].map((code) => ({
      code,
      label: labels.get(code) ?? code,
    })),
  };
}

/** Red flags to offer for a stage (all of them when the stage is unknown). */
export function redFlagsFor(
  stage: TriageStage,
  rules: TriageRuleSet = TRIAGE_RULES,
) {
  return rules.symptoms.filter(
    (s) =>
      stage === 'unknown' ||
      (s.stages as readonly TriageStage[]).includes(stage),
  );
}
