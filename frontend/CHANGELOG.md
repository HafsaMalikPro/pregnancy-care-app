# Changelog

## 2026-11-07

### Phase 0 — Baseline

- Recorded the baseline in `docs/BASELINE_2026-11-07.md` (unit 20/20, Playwright 32/32 in Chrome).
- `topics.spec.ts`: the shopping-list step pins the item by id, then clicks and asserts
  (checked items move to the end of the list).
- Shopping list: checking an item updates immediately and reverts if the save fails.
