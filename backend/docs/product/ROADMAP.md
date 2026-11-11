# Pregnancy Companion App — Build Roadmap

Status as of 2026-10-19, checked against the repository. `[x]` = done and verifiable in the repo;
**Partial** = some of it exists; unmarked = not started. Section numbers (§) refer to
[`PREGNANCY_APP_PRD.md`](./PREGNANCY_APP_PRD.md).

> **Note on the existing backend.** The API in `apps/api` was built for the *preconception*
> product (cycles, period estimates, readiness tasks). Its platform layer — auth, anonymous use,
> consent, content workflow, reminders, export/deletion, audit, tests — carries over to the
> pregnancy app. The pregnancy-specific modules (dating, weekly guide, appointments, warning
> signs, nutrition, postpartum) are **not built yet**, except the Phase 3 tracking core
> (backend only, 2026-10-19).

> **Note on ordering.** This checklist builds the food tracker (Phase 5) before exercise,
> appointments and birth preparation. The PRD (§15) puts food logging *after* the MVP because of
> its cost and the risk of restrictive use, and ships meal ideas, food safety, appointments, the
> warning-sign path and birth prep first. Decide which order to follow before Phase 3 starts.

## Phase 1 — Research & Planning

- [x] Research competitor apps and user reviews — §13 (5 apps, 3 studies, sourced)
- [ ] Identify problems faced by first-time and unsupported mothers — **Partial:** personas in §3 are assumptions; no evidence was found on competitor support for isolated mothers. Needs user interviews (§19)
- [ ] Finalize target users and core app features — **Partial:** drafted in §3 and §4; finalize after interviews
- [x] Define MVP scope and future features — §15
- [x] Document medical safety requirements and trusted sources — §9, §16, Sources (items marked "not verified" still need checking)
- [x] Create product requirements document (PRD) — `docs/product/PREGNANCY_APP_PRD.md`

## Phase 2 — UI/UX Design

- [ ] Design onboarding and pregnancy setup — question list ready in §14
- [ ] Design home dashboard and Today's Plan — content model in §6
- [ ] Design week-by-week pregnancy journey — page schema in §5
- [ ] Design nutrition and food logging screens
- [ ] Design exercise and symptom tracking screens
- [ ] Design appointments, reminders, and settings
- [ ] Create mobile-responsive design system and prototypes — **Partial:** `packages/design-tokens` has colours, spacing, type scale and a11y minimums; no components or prototypes

## Phase 3 — Pregnancy Tracking Core

- [x] Calculate estimated due date and current pregnancy week — LMP (cycle-adjusted), known date, ultrasound and IVF dating; `POST /v1/pregnancies`, `GET /v1/pregnancies/current` (API only)
- [x] Support all three trimesters and approximately 40 weeks — ACOG trimesters and term categories, weeks 1–42 (API only)
- [ ] Build weekly baby development and mother-care content — **Partial:** week-guide model, admin creation (`POST /v1/admin/week-guides`), clinical review/publish and public read (`GET /v1/week-guides/{week}`) are built; **no guide content has been written or clinically reviewed yet**
- [x] Create pregnancy calendar and milestone timeline — `GET /v1/pregnancies/current/timeline` (API only; calendar UI is Phase 2)
- [x] Allow users to update due dates and pregnancy details — `PUT /current/dating` (with dating history and shift), `PATCH /current`, `POST /current/end` (API only)
- [x] Add first-pregnancy and personalization preferences — first pregnancy, number of babies, clinician restrictions on the pregnancy; country, diet, allergies, activity on the profile (API only)

## Phase 4 — Daily Planner

- [ ] Generate a personalized daily checklist
- [ ] Add meals, hydration, movement, rest, and self-care tasks
- [ ] Add daily tips based on pregnancy stage
- [ ] Add appointment and preparation tasks
- [ ] Allow users to complete, skip, and customize tasks — **Partial:** task completion with private notes exists (`/v1/readiness/tasks/{id}/progress`); no skip/customize or daily generation
- [ ] Create daily progress summary and history

## Phase 5 — Nutrition & Food Tracker

- [ ] Build searchable food database
- [ ] Support local Pakistani and international foods — USDA proxies identified in §7; a South Asian composition table is still needed
- [ ] Add meal logging and serving sizes
- [ ] Calculate estimated calories, protein, carbohydrates, fats, and fiber
- [ ] Track water intake and selected micronutrients
- [ ] Build meal suggestions and affordable food alternatives
- [ ] Display nutrition progress without restrictive dieting — rules defined in §7
- [ ] Validate nutrition calculations against reliable references — reference values sourced in §7

## Phase 6 — Exercise & Wellness

- [ ] Create trimester-based activity library — safety rules and launch library specified in §8
- [ ] Add exercise instructions and illustrations
- [ ] Include suitable modifications and precautions
- [ ] Add activity and duration tracking
- [ ] Build mood, sleep, and general wellness check-ins
- [ ] Add symptom logging with severity and notes — **Partial:** daily logs with a fixed symptom vocabulary and private notes exist (`/v1/daily-logs`); no severity, duration or pregnancy symptoms
- [ ] Implement warning-sign guidance and escalation flows — specified in §9; **highest-priority build item**

## Phase 7 — Appointments & Notifications

- [ ] Create appointment calendar
- [ ] Add prenatal visit and screening reminders — regional templates sourced in §10
- [ ] Allow clinician-directed supplement reminders
- [ ] Build customizable push or local notifications — **Partial:** reminder preferences API exists (`/v1/reminders`: kind, local time, daily/weekly recurrence, label); no delivery to devices
- [ ] Add questions-to-ask-your-doctor notes
- [ ] Test reminder timing, time zones, and notification permissions

## Phase 8 — Birth & Postpartum

- [ ] Build hospital bag checklist
- [ ] Add birth preparation and labor education — labour signs sourced in §12
- [ ] Create emergency contact and transport planning tools
- [ ] Add postpartum recovery guidance
- [ ] Add maternal mental health and breastfeeding resources — sources and crisis lines in §11–12 (Pakistan numbers to re-verify)
- [ ] Design transition from pregnancy to postpartum mode — specified in §12, §14

## Phase 9 — Backend, Security & Quality

- [ ] Design database schema and API contracts — **Partial:** done for the preconception domain (18 tables, 70 API operations, OpenAPI spec, zod contracts); pregnancy tables still to design
- [x] Implement authentication if required — Better Auth (email/password, bearer, 2FA for staff) plus anonymous sessions
- [ ] Secure sensitive pregnancy information — **Partial:** consent gate, ownership checks, no health data in logs or audit, unsupported auth endpoints disabled; encryption at rest depends on hosting
- [x] Add authorization, validation, and rate limiting — default-deny guard, staff roles + MFA, strict DTOs, per-IP limits (`trust proxy` still to set for deployment)
- [ ] Write unit, integration, and end-to-end tests — **Partial:** 115 unit + 175 API integration tests passing; no client-app end-to-end tests
- [ ] Test concurrent users and expected production load — **Partial:** 1,000-user local test on health endpoints only (`docs/LOAD_TEST_REPORT.md`); soak test invalid; staging test with real endpoints needed
- [ ] Review privacy, backups, logging, and data deletion — **Partial:** deletion, export and logging rules done and tested; backups and retention not defined
- [ ] Arrange clinical review of health content — required for every MVP feature (§20)

## Phase 10 — Launch & Improvement

- [ ] Test on Android and iOS or target platforms
- [ ] Test onboarding and the complete pregnancy journey
- [ ] Fix critical bugs and accessibility issues
- [ ] Add privacy policy and terms of use
- [ ] Verify analytics and privacy-friendly advertising — policy defined in §17 (no behavioural ads)
- [ ] Release MVP to a small test group
- [ ] Collect feedback and prioritize improvements
- [ ] Monitor crashes, retention, and feature usage

## Summary

| Phase | Done | Partial | Not started |
| --- | --- | --- | --- |
| 1 Research & Planning | 4 | 2 | 0 |
| 2 UI/UX Design | 0 | 1 | 6 |
| 3 Pregnancy Tracking Core | 5 | 1 | 0 |
| 4 Daily Planner | 0 | 1 | 5 |
| 5 Nutrition & Food Tracker | 0 | 0 | 8 |
| 6 Exercise & Wellness | 0 | 1 | 6 |
| 7 Appointments & Notifications | 0 | 1 | 5 |
| 8 Birth & Postpartum | 0 | 0 | 6 |
| 9 Backend, Security & Quality | 2 | 6 | 0 |
| 10 Launch & Improvement | 0 | 0 | 8 |
| **Total (68 items)** | **11** | **13** | **44** |
