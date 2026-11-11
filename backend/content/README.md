# Clinical content

All clinical content (week guides, articles, recipes, activities, meal plans) is versioned in
the `articles` table and published only through the clinical review workflow:

```
draft ──submit──▶ in_review ──review: approved──▶ approved ──publish──▶ published ──▶ archived
  ▲                    │
  └── review: changes_requested (comments) ──┘
```

- Content editors create drafts, edit them, submit them and publish approved versions.
- Clinical reviewers record a decision with their credentials, the sources they checked and
  comments. A changes-requested review sends the version back to draft with its comments.
- Nobody can review their own content. Administrators pass every role check.
- Publishing archives the previous published version; every version stays for history
  (`GET /v1/admin/articles?slug=…`). Every step is in the audit log.
- Content is shown as reviewed only when it has an approving review (`review` is non-null in
  the public API). Publishing never adds one.

## Seeding: what exists and how to fill the gaps

`GET /v1/admin/content/coverage` lists weeks 1–42 (published or not, and any working
version) and version counts by kind and category. Use it to plan authoring.

The local sample seed (`apps/api/prisma/seed.ts`) only covers weeks 6–16 and five articles,
for development. It is not clinical content and must never run against a real database
(it refuses to).

To bring in authored content:

1. Copy a file from `templates/` for each item and fill every field. Placeholders (`<…>`) and
   `TODO` are refused by the importer.
2. Run, with a content editor's email:

   ```sh
   cd apps/api && pnpm build
   node scripts/import-content.mjs --author editor@example.org ../../content/drafts
   ```

   Every file becomes a **draft**. Files are validated against the contracts (WeekGuideSections,
   RecipeSections, ActivitySections, MealPlanSections); invalid ones are listed and skipped.
   Items with a working version already are skipped.
3. Submit, review and publish in the admin. A meal plan can be published only after all of its
   recipes are.

Nothing in this repository contains reviewed clinical content. Generated or placeholder text
must never be submitted as if it had been written or reviewed by a clinician.

## Languages

Every item has a `locale` (only `en` today). Translations are separate versions with the same
slug and their own review. Adding a locale means adding it to `SUPPORTED_LOCALES` in
`packages/contracts`; no schema change is needed.
