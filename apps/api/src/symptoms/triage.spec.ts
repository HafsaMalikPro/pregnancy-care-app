import {
  RedFlagCode,
  SymptomCode,
  type TriageRuleSet,
} from '@preconception/contracts';
import rulesFile from './triage-rules.json' with { type: 'json' };
import { loadRuleSet, redFlagsFor, TRIAGE_RULES, triage } from './triage.js';

const clone = (): TriageRuleSet =>
  JSON.parse(JSON.stringify(rulesFile)) as TriageRuleSet;

describe('symptom triage rules', () => {
  describe('shipped rule set', () => {
    it('loads and passes its safety invariants', () => {
      expect(TRIAGE_RULES.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
      expect(TRIAGE_RULES.sources.length).toBeGreaterThan(0);
    });

    it('is labelled as not yet clinically reviewed until a review is recorded', () => {
      // Flip this test (and record the reviewer) only after a clinician signs off the file.
      expect(TRIAGE_RULES.review).toBeNull();
    });

    it('uses the required emergency wording', () => {
      expect(TRIAGE_RULES.levels.emergency.callToAction).toEqual({
        label: 'Call your doctor now or go to emergency services',
        kind: 'emergency',
      });
      expect(TRIAGE_RULES.disclaimer).toContain(
        'This is general information, not medical advice',
      );
    });

    it('never uses diagnostic language', () => {
      const text = JSON.stringify(TRIAGE_RULES).toLowerCase();
      for (const word of [
        'you have',
        'diagnos', // allowed only as "cannot diagnose" / "not a diagnosis"
        'preeclampsia',
        'pre-eclampsia',
        'miscarriage',
        'you are fine',
        'nothing to worry',
      ]) {
        if (word === 'diagnos') {
          const uses = text.match(/[a-z ]{0,20}diagnos[a-z]*/g) ?? [];
          for (const use of uses) {
            expect(use).toMatch(/cannot diagnose|not a diagnosis/);
          }
        } else {
          expect(text).not.toContain(word);
        }
      }
    });
  });

  describe('triage()', () => {
    it.each(RedFlagCode.options)(
      'every red flag alone is an emergency: %s',
      (code) => {
        const out = triage([code]);
        expect(out.level).toBe('emergency');
        expect(out.matchedRules.length).toBeGreaterThan(0);
        expect(out.redFlags).toEqual([
          { code, label: expect.any(String) as string },
        ]);
      },
    );

    it.each(SymptomCode.options)(
      'an everyday symptom alone is routine: %s',
      (code) => {
        const out = triage([code]);
        expect(out).toEqual({
          level: 'routine',
          matchedRules: [],
          redFlags: [],
        });
      },
    );

    it('a red flag among everyday symptoms still escalates', () => {
      const out = triage(['nausea', 'fatigue', 'vision_changes', 'back_pain']);
      expect(out.level).toBe('emergency');
      expect(out.redFlags.map((r) => r.code)).toEqual(['vision_changes']);
    });

    it('deduplicates repeated codes', () => {
      const out = triage(['fever', 'fever']);
      expect(out.redFlags).toHaveLength(1);
    });

    it('takes the most urgent level when rules disagree', () => {
      const rules = clone();
      rules.rules = [
        {
          id: 'clinic',
          level: 'call_clinic_today',
          anyOf: ['overwhelming_tiredness'],
          source: 'cdc_hear_her',
        },
        {
          id: 'urgent',
          level: 'emergency',
          anyOf: [...RedFlagCode.options],
          source: 'cdc_hear_her',
        },
      ];
      const checked = loadRuleSet(rules);
      expect(triage(['overwhelming_tiredness'], checked)).toMatchObject({
        level: 'emergency',
        matchedRules: ['clinic', 'urgent'],
      });
    });

    it('supports a call-the-clinic level when a reviewed rule set uses one', () => {
      const rules = clone();
      rules.rules = [
        {
          id: 'clinic',
          level: 'call_clinic_today',
          anyOf: [...RedFlagCode.options],
          source: 'cdc_hear_her',
        },
      ];
      expect(triage(['fever'], loadRuleSet(rules)).level).toBe(
        'call_clinic_today',
      );
    });
  });

  describe('loadRuleSet() refuses unsafe edits', () => {
    it('a red flag that no rule covers (it would come out routine)', () => {
      const rules = clone();
      rules.rules[0].anyOf = rules.rules[0].anyOf.filter((c) => c !== 'fever');
      expect(() => loadRuleSet(rules)).toThrow('no rule covers fever');
    });

    it('a red flag with no wording', () => {
      const rules = clone();
      rules.symptoms = rules.symptoms.filter((s) => s.code !== 'fever');
      expect(() => loadRuleSet(rules)).toThrow('no wording for fever');
    });

    it('a rule or symptom without a listed source', () => {
      const rules = clone();
      rules.rules[0].source = 'blog_post';
      expect(() => loadRuleSet(rules)).toThrow('unknown source blog_post');
    });

    it('an emergency level without an emergency call to action', () => {
      const rules = clone();
      rules.levels.emergency.callToAction = null;
      expect(() => loadRuleSet(rules)).toThrow('emergency call to action');
    });

    it('an unknown symptom code', () => {
      const rules = clone() as unknown as { rules: { anyOf: string[] }[] };
      rules.rules[0].anyOf.push('made_up');
      expect(() => loadRuleSet(rules)).toThrow();
    });
  });

  describe('redFlagsFor()', () => {
    it('offers pregnancy-only signs in pregnancy and postpartum-only signs after birth', () => {
      const pregnancy = redFlagsFor('pregnancy').map((s) => s.code);
      const postpartum = redFlagsFor('postpartum').map((s) => s.code);
      expect(pregnancy).toContain('reduced_baby_movement');
      expect(pregnancy).not.toContain(
        'heavy_bleeding_or_bad_smelling_discharge_after_birth',
      );
      expect(postpartum).toContain(
        'heavy_bleeding_or_bad_smelling_discharge_after_birth',
      );
      expect(postpartum).not.toContain('reduced_baby_movement');
      expect(redFlagsFor('unknown')).toHaveLength(RedFlagCode.options.length);
    });
  });
});
