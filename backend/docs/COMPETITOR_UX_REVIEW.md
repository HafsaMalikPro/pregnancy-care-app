# Competitor UX Review — Pregnancy Tracking Apps

Research done to inform the Pregnancy Care home screen redesign. Apps covered: BabyCenter,
What to Expect, Pregnancy+, Ovia Pregnancy, The Bump, Flo (pregnancy mode), Sprout Pregnancy,
Peanut.

## How to read this document

Every claim below is one of two kinds, and they are labeled inline:

- **[Sourced]** — backed by a specific, checkable source: a named news outlet, an academic
  paper, a regulator (FTC), a research org (Mozilla *Privacy Not Included*, Privacy
  International, University of Michigan), or a long-form security report. These are the
  claims to treat as solid.
- **[Aggregator]** — comes from an automated app-review-summary site (marlvel.ai,
  justuseapp.com, unstar.app, or similar), or from a single unverified user review. These
  tools scrape and summarize app store reviews with no editorial check, their sample sizes
  are often small (tens of reviews), and at least one ("marlvel.ai") appears to be
  AI-generated. Treat these as *indicative of a pattern*, not as confirmed fact. No star
  rating, review count, or quote from an **[Aggregator]** source should be repeated as if it
  were precise data.
- **[Brief]** — a complaint pattern that was already given to me as a known, commonly
  reported issue, where my own search did not turn up a specific new citation beyond what's
  noted. These are still real, widely-discussed issues in pregnancy-app coverage generally
  (several show up across multiple apps below), just not independently re-verified
  per-app here.

No review quote, star rating, or statistic in this document was invented. Where a figure is
repeated from a source, it is attributed to that source, including its own caveats about
sample size.

---

## BabyCenter

**What it does well**
- Very large, long-running content library and community; one of the highest-rated apps in
  the category by review count — Bitrise's app listing shows 4.88 stars from 1.5M reviews
  **[Aggregator — app-store listing, not independently audited]**.
- Broad week-by-week content and tools bundled into one free app.

**Recurring complaints**
- **Ad density on content/video screens.** A 2022 user review describes video content
  becoming unwatchable because of ads shown alongside it. **[Aggregator]**
  ([justuseapp.com](https://justuseapp.com/en/app/386022579/pregnancy-tracker-babycenter/reviews))
- **Subscription/upsell popups interrupting core tracking flows.** **[Aggregator]**
  ([marlvel.ai](https://marlvel.ai/apps/baby-names-by-babycenter/vs))
- **Pregnancy-loss handling**: a reviewer reports still receiving daily digest emails with
  lines like "I heard my baby's heartbeat and I'm in awe!" after a loss, says the app lacks
  miscarriage support, and that deleting a pregnancy logs the user out entirely.
  **[Aggregator, single review]**
  ([justuseapp.com](https://justuseapp.com/en/app/386022579/pregnancy-tracker-babycenter/reviews))
  — this specific anecdote lines up with the broader, well-sourced pattern documented below
  under "Pregnancy loss, industry-wide."

## What to Expect

**What it does well**
- Well-known brand with broad week-by-week content; positioned (per its own App Store
  listing copy) as "Best Pregnancy App" by outlets like Forbes.

**Recurring complaints**
- **Serious, unfixed security vulnerability.** 404 Media reported (Nov 2024) that security
  researcher Ovi Liber found multiple flaws, including an insecure password-reset mechanism
  that allows full account takeover, overexposure of user data through the app's API, and
  exposure of group administrators' email addresses — and that the developer did not respond
  to the researcher or to journalists. **[Sourced]**
  ([404 Media](https://www.404media.co/pregnancy-tracking-app-what-to-expect-refuses-to-fix-issue-that-allows-full-account-takeover-2/))
- Techlicious adds the specific risk: exposed reproductive-health data is dangerous in states
  with laws enabling private lawsuits against anyone who "assists" an abortion. **[Sourced]**
  ([Techlicious](https://www.techlicious.com/blog/what-not-to-expect-from-your-pregnancy-app/))
- **Aggressive registry/formula push notifications** reported in 1–3 star reviews.
  **[Aggregator]**
- An academic paper (Bagelman & Bagelman, *Transactions of the Institute of British
  Geographers*, 2024) studies how pregnancy apps as a category can "erase" loss; it doesn't
  name What to Expect specifically in the portion available, but is directly relevant to the
  pregnancy-loss pattern below. **[Sourced, general to the category]**

## Pregnancy+ (Philips Avent / Health & Parenting Ltd)

**What it does well**
- Clean week-by-week visuals; a free tier that covers the core tracking experience.

**Recurring complaints**
- **Core tools paywalled.** An older Softpedia review (v3.2) says free use effectively ends
  at week 14 and too much content sits behind the paywall. **[Sourced, but dated]**
  ([Softpedia](https://mobile.softpedia.com/ios/Pregnancy-plus-iOS-Review-746.html))
- A 2026 app-comparison piece says the contraction counter and other tools are now
  premium-gated, and that locale-specific content gaps draw criticism. **[Aggregator]**
- **Loss/miscarriage toggle is hard to find.** A Bagelman blog post states that on
  Pregnancy+, the only place to register a loss is "hidden away like an unsubscribe button
  on email spam." **[Sourced, specific to this app]**
  (via [Privacy International](https://privacyinternational.org/examples/1898/pregnancy-persists-internet-despite-miscarriage-real-life))

## Ovia Pregnancy

**What it does well**
- Detailed symptom and health tracking, widely distributed as an employer/insurer benefit.

**Recurring complaints**
- **Employer access to aggregated employee health data.** The Washington Post (2019) found
  that employers who offer Ovia as a benefit can see aggregate data: how many employees
  faced high-risk pregnancies, their top research questions, and how soon new mothers
  planned to return to work. Ovia's cofounder said individual-level data is never shared;
  an MIT researcher countered that aggregation "doesn't guarantee privacy," and experts noted
  that in a small workplace, aggregate counts can still identify individuals. **[Sourced]**
  (via [Mozilla Foundation *Privacy Not Included*](https://www.mozillafoundation.org/en/privacynotincluded/ovia-pregnancy))
- Mozilla's own review flags that personal data may reach the employer's health plan/benefits
  vendors despite the "we don't share without opt-in" language, and that Facebook-owned
  technology collects data from the app regardless of whether the user has a Facebook
  account. **[Sourced]**
- A 2026 aggregator piece says Ovia's negative reviews cluster on this same
  employer-sponsorship privacy angle. **[Aggregator]**

## The Bump

**What it does well**
- Registry integration and community tools aimed at expecting parents.

**Recurring complaints**
- **Privacy/advertising practices rated "Super creepy."** Mozilla's *Privacy Not Included*
  review flags vaguely worded data-sharing language ("for example," "may") and describes a
  policy consistent with targeted advertising and possible sale of user data. **[Sourced]**
  ([Mozilla Foundation](https://www.mozillafoundation.org/en/privacynotincluded/the-bump-pregnancy-tracker-baby-app/))
- Bugginess reported in at least one user review (a community feature requiring an unusual
  workaround to function). **[Aggregator, single review]**

## Flo (pregnancy mode)

**What it does well**
- Detailed cycle/pregnancy tracking; large user base; added in-app privacy controls after
  2021.

**Recurring complaints**
- **FTC settlement over undisclosed health-data sharing (Jan 2021).** The FTC alleged Flo
  shared health data — including pregnancy status — with third-party analytics providers
  (Facebook's and Google's analytics divisions, Google's Fabric service, AppsFlyer, and
  Flurry) despite promising to keep it private, between June 2016 and Feb 2019. Flo agreed
  to obtain affirmative consent before further sharing, undergo an independent privacy
  review, notify affected users, and ask recipients to destroy the data. Flo stated it never
  shared names, addresses, or birthdays, and that the settlement was not an admission of
  wrongdoing. **[Sourced]**
  ([Healthcare IT Today](https://www.healthcareittoday.com/2021/01/14/ftc-settlement-with-fertility-tracking-app-maker-flo-health-over-data-disclosure-allegations/),
  [Becker's Hospital Review](https://www.beckershospitalreview.com/digital-marketing/fertility-app-company-accused-of-sharing-private-data-to-sell-ads-settles-with-ftc/),
  [Law Street Media](https://lawstreetmedia.com/tech/ftc-settles-health-data-sharing-and-privacy-suit-with-fertility-app-flo-health/))
- Two FTC commissioners (Chopra and Slaughter) issued a joint statement arguing for even
  stronger enforcement than the settlement provided. **[Sourced]**
- Sources disagree on exact user-count affected (100M+ vs. 150M+), so no single number is
  repeated here as precise. **[Sourced, but figures conflict between outlets]**

## Sprout Pregnancy

**What it does well**
- Well-regarded 3D fetal visualization feature.

**Recurring complaints**
- **No findable privacy policy.** Mozilla's *Privacy Not Included* (2022) rated it "Super
  creepy" after researchers could not locate a privacy policy for the app at all, and the
  company did not respond to repeated emailed questions — despite the app collecting weight,
  appointment, birth-plan, and journal data. **[Sourced, though possibly stale — a different
  directory (healthify.nz) lists a policy as present, so this may have changed since 2022]**
  ([Mozilla Foundation](https://www.mozillafoundation.org/en/privacynotincluded/sprout-pregnancy/))
- **Tone of medical content**: a user review criticizes the "The doctor says" section as
  reading like it wasn't written by anyone who has been pregnant, and separately that the
  app assumes a father is present. **[Aggregator, single review]**
- **Paywalls** on a related listing ("Pregnancy Tracker 3D by Sprout") reported as the top
  complaint. **[Aggregator]**

## Peanut

**What it does well**
- Identity verification for members; no advertising in the social feed, per its own
  description surfaced in review aggregation. **[Aggregator]**

**Recurring complaints**
- **Community pile-ons and inconsistent moderation.** A review aggregator (11,193 combined
  reviews analyzed, 65.8%/34.2% positive/negative split per its own NLP) includes specific
  written complaints: one describing many members "ganging up" on a single member who was
  then removed quickly after mass reporting, and another describing a new member accused of
  being a scammer by a group despite having sent gifts to other users. **[Aggregator — these
  are individual anecdotes inside a larger automated summary, not a moderation audit]**
  ([justuseapp.com](https://justuseapp.com/en/app/1178656034/peanut-find-friends-support/reviews))
- This is consistent with the general, widely-discussed pattern of toxic/misinformation-prone
  parenting forums (BabyCenter's and What to Expect's community sections carry the same
  reputation in general tech commentary), but no separate deep-dive source was found for
  those two apps' forums specifically in this pass. **[Brief]**

---

## Category-wide patterns (not tied to one app)

These affect the whole category and are the strongest-sourced findings of this review.

**Pregnancy loss is handled badly, industry-wide.**
- A University of Michigan School of Information analysis of **166 pregnancy apps found 72%
  do not account for pregnancy loss at all**; one interview subject said "There's no way to
  tell your app, 'I had a miscarriage. Please stop sending me these updates.'" **[Sourced]**
  ([si.umich.edu](https://si.umich.edu/about-umsi/news/pregnancy-apps-and-online-spaces-fail-support-individuals-grieving-pregnancy-loss))
- A 2016 New York Times essay (summarized by Privacy International) describes a woman whose
  data kept circulating to marketers after she logged a miscarriage — a box of baby formula
  and a congratulations note arrived near her original due date. **[Sourced, older]**
- A 2018 Mashable report (also via Privacy International) found that, at the time, users
  typically had only two options: keep receiving "your baby is now the size of…" style
  alerts, or delete the pregnancy and lose all saved records. **[Sourced, older]**
- Academic work (Bagelman & Bagelman, 2024) frames this as apps structurally "silencing" or
  "erasing" loss by design, not just as a missing feature. **[Sourced]**

**Fruit-size comparisons are popular but criticized as inconsistent/misleading.**
- A clinician quoted by Today.com clarifies the comparison is meant to describe uterus size,
  not baby size, and says not to take it too literally. **[Sourced]**
  ([Today.com](https://www.today.com/today/amp/tdna197706))
- An academic paper in the *International Journal of Communication* (2026) analyzes Reddit
  discussion of these comparisons and finds users call them inconsistent and somewhat
  arbitrary, yet keep using them anyway. **[Sourced]**
- User reviews describe comparisons jumping confusingly between fruit varieties and vague
  units (length vs. weight), and apps disagreeing with each other on the same gestational
  day. **[Aggregator / forum]**
- NPR coverage of a disinformation researcher's review of pregnancy apps found some apps
  contain "dangerous and misleading information" more broadly (not limited to fruit sizing).
  **[Sourced, general]**

**Forced sign-up, notification spam, ads/upsells, US-centric content.** My searches did not
turn up strong new independent sources specifically pinning these four to named apps beyond
what's listed per-app above (ads/paywalls) — these remain **[Brief]**: well-known, frequently
repeated complaint categories across the app-store review ecosystem for this app category,
without a single authoritative study found in this pass. The ads/paywall and privacy
findings above substantiate the general direction of these complaints even where a
dedicated citation wasn't found for "forced sign-up" or "US-centric emergency numbers"
specifically.

---

## Known complaint → how Pregnancy Care avoids it

| Complaint pattern | Evidence tier | Pregnancy Care's approach |
|---|---|---|
| Pregnancy loss handled badly — content/notifications continue, hard-to-find opt-out | **[Sourced]** (U Michigan 72% stat, NYT, Mashable, Bagelman) | A clearly placed (not hidden) "My pregnancy has changed" flow in Profile. Selecting it immediately stops all pregnancy-specific content and reminders. No celebratory UI after a status change. The app never asks for a reason. |
| Ads and aggressive upsells, including on health screens | **[Sourced for Pregnancy+]**, **[Aggregator for BabyCenter, Sprout, related apps]** | No ads anywhere in the app. No paywall interstitials. No dark-pattern upsell flows. |
| Privacy — health data shared with third parties / employers / ad networks | **[Sourced]** (Flo/FTC, Ovia/Washington Post, Mozilla reviews of The Bump & Sprout) | No health data in analytics, logs, or URLs. A plain-language privacy screen explains exactly what is stored and where. No employer- or insurer-facing data products. |
| Forced sign-up before seeing any value | **[Brief]** | Guest mode is supported by the current architecture (anonymous session, see `apps/mobile/src/api/services/session.ts`) and is the default first-run path; account creation is optional. |
| Due date hard to correct; dates disagree across screens | **[Brief]**, consistent with Pregnancy+ paywalled-tools complaints and general multi-app disagreement noted in the fruit-size forum thread | One source of truth for dating/due-date math (the API's `/pregnancies/current/dating` endpoint); the UI never recomputes it locally. Editing the date is a first-class, easy-to-find action. Both LMP-based and scan-based dates are shown when they differ, per the existing `redatePregnancy` / dating-history API. |
| Notification spam | **[Brief]**, consistent with BabyCenter/What to Expect registry & digest complaints | Per-category notification toggles, quiet hours, and nothing enabled by default except what the user explicitly turns on. |
| Toxic community forums / misinformation | **[Sourced, general]** (NPR disinformation coverage); **[Aggregator]** (Peanut moderation anecdotes) | No open community/forum feature in this app at all — sidesteps the moderation problem rather than trying to solve it. |
| Fruit-size comparisons presented as precise | **[Sourced]** (Today.com clinician quote, IJoC paper, NPR) | If size comparisons are used, they are explicitly labeled as approximate, and only backend/verified content is used — no copied third-party comparison tables. |
| Cluttered, slow, crash-prone screens with too much content | **[Sourced, security-adjacent]** (404 Media on What to Expect's neglected bug reports); **[Aggregator]** (general complaints across BabyCenter/Sprout) | Fast, calm, focused screens; skeleton loaders instead of spinners-then-jump; no layout shift once content arrives. |
| US-centric content and emergency numbers | **[Brief]** | Emergency contact info is only shown when it has been verified for the user's region; otherwise the app says "contact your local emergency number or maternity unit" rather than defaulting to a US number. |

## Sources consulted

FTC/Flo: [Healthcare IT Today](https://www.healthcareittoday.com/2021/01/14/ftc-settlement-with-fertility-tracking-app-maker-flo-health-over-data-disclosure-allegations/), [Becker's Hospital Review](https://www.beckershospitalreview.com/digital-marketing/fertility-app-company-accused-of-sharing-private-data-to-sell-ads-settles-with-ftc/), [Law Street Media](https://lawstreetmedia.com/tech/ftc-settles-health-data-sharing-and-privacy-suit-with-fertility-app-flo-health/), [MobiHealthNews](https://www.mobihealthnews.com/news/fertility-app-flo-health-settles-ftc-over-sensitive-data-sharing-complaint)

Ovia/employer data: [Mozilla Foundation *Privacy Not Included*](https://www.mozillafoundation.org/en/privacynotincluded/ovia-pregnancy) (summarizing Washington Post reporting)

What to Expect security: [404 Media](https://www.404media.co/pregnancy-tracking-app-what-to-expect-refuses-to-fix-issue-that-allows-full-account-takeover-2/), [Techlicious](https://www.techlicious.com/blog/what-not-to-expect-from-your-pregnancy-app/)

The Bump / Sprout privacy: [Mozilla Foundation — The Bump](https://www.mozillafoundation.org/en/privacynotincluded/the-bump-pregnancy-tracker-baby-app/), [Mozilla Foundation — Sprout](https://www.mozillafoundation.org/en/privacynotincluded/sprout-pregnancy/)

Pregnancy loss, category-wide: [University of Michigan School of Information](https://si.umich.edu/about-umsi/news/pregnancy-apps-and-online-spaces-fail-support-individuals-grieving-pregnancy-loss), [Privacy International (summarizing NYT & Mashable)](https://privacyinternational.org/examples/1898/pregnancy-persists-internet-despite-miscarriage-real-life), Bagelman & Bagelman, *Transactions of the Institute of British Geographers* (2024)

Fruit-size comparisons: [Today.com](https://www.today.com/today/amp/tdna197706), Frizzell, *International Journal of Communication* (2026), NPR disinformation coverage (via mediawell.ssrc.org)

Pregnancy+: [Softpedia](https://mobile.softpedia.com/ios/Pregnancy-plus-iOS-Review-746.html)

Aggregator sites used for indicative-only signal (justuseapp.com, marlvel.ai, unstar.app): cited inline above each claim they support; none of their star ratings or percentages should be treated as verified.
