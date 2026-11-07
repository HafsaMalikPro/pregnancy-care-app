# Changelog

## 2026-11-07

### Phase 0 — Baseline

- Recorded the baseline in `docs/BASELINE_2026-11-07.md` (unit 269/269, e2e 377/377,
  combined coverage 646/646 at 97.05% statements).
- `test:coverage`: e2e hook timeout raised so the combined unit + e2e run no longer times out
  in `platform.e2e-spec.ts` setup.
- `turbo.json`: `pnpm dev` now passes shell variables (`RATE_LIMIT_ENABLED`, `EMAIL_PROVIDER`, …)
  through to the API; strict env mode had been dropping them.
