# Backend gaps

Features from the product brief that the website can't build yet because the API has no
endpoint for them. The website shows an honest "not available yet" state for each one and
never shows sample data in their place. Checked against `backend/docs/api/openapi.json` on
2026-11-02.

What the website already uses: auth and guest sessions, consents, profile (diet pattern, food
allergies, activity level), pregnancies and dating, current week and timeline, week guides
(baby, body, symptoms, eat, move, visits, askAtVisit, prepare, avoid, whenToGetHelp),
articles, daily logs, the readiness checklist, reminders, export and deletion.

## Needed endpoints

| Feature | Where it shows on the site | Suggested API |
| --- | --- | --- |
| List of published week guides | `/weeks`, `/nutrition`, `/exercise`, `/baby-care`, `/birth-and-postpartum` each fetch weeks 1–42 one at a time (42 requests). Builds can hit the 120/min per-IP limit; see "Rate limits" below. | `GET /v1/week-guides?fields=…` returning every published guide, or a summary list |
| Meal plans and recipes | `/nutrition`: "Meal plans and recipes" | `GET /v1/meals` (filter by diet pattern and allergens), `GET /v1/meal-plans/today`, `GET /v1/meal-plans?week=`, `PUT /v1/meal-plans/{date}/items/{id}` (eaten), saved meals, shopping list. Content must go through the same clinical review workflow as articles. |
| Hydration tracking | `/nutrition`: "Hydration tracking" | Add `waterMl` (or glasses) to `PUT /v1/daily-logs/{date}`, with no target unless clinically approved |
| Exercise library and tracking | `/exercise`: "Exercise library and tracking" | `GET /v1/activities?trimester=` (instructions, contraindications, stop signs, media, review status), `PUT /v1/activities/{id}/completions/{date}`. Must respect `restrictExercise`. |
| Sleep tracking | `/exercise`: "Sleep tracking" | Add sleep fields to daily logs |
| Appointments | `/birth-and-postpartum`: "Appointment planner"; dashboard | `GET/POST/PATCH/DELETE /v1/appointments` (date, time, type, notes, questions to ask) |
| Birth preferences and hospital bag | `/birth-and-postpartum` | Either readiness tasks in `birth` and `hospital_bag` categories (no new endpoint, just content) or `GET/PUT /v1/birth-preferences` |
| Newborn preparation checklist | `/baby-care`: preparation checklist | Readiness tasks in newborn categories (clothing, feeding, safe sleep, car seat…). No new endpoint, just reviewed content. |
| Postpartum guide | `/birth-and-postpartum`: "Postpartum guide" | Postpartum week guides (e.g. `GET /v1/postpartum-guides/{week}`), or articles tagged postpartum |
| Article topics | Topic pages pick articles by matching words in slug and title | `topic`/`tags` on articles and `GET /v1/articles?topic=` |
| Diet-aware guidance | `/nutrition` shows saved preferences next to the guidance but can't filter it | Structured `eat`/`avoid` items with allergen and diet tags on week guides |

## Rate limits

The API allows 120 requests per minute per IP. The website server fetches public content from
a single IP, so pages that list every week share one in-process copy of the 42 guides
(`getAllWeekGuides` in `src/lib/public-api.ts`). Builds keep static pages in one worker
(`experimental.staticGenerationMinPagesPerWorker` in `next.config.ts`), and build-time reads
retry a 429 after `Retry-After`. A list endpoint (first row above) would remove the need for
all three. Production should also exempt the website server's IP, or use a server-to-server
key, so visitor traffic can't push public pages into their "can't load" state.

Sign-up is limited to 10 per hour per IP. Running the end-to-end suite more than once an hour
against the same API needs `RATE_LIMIT_ENABLED=false` (local and test environments only; the
API refuses it in production).
