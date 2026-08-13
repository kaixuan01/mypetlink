# MyPetLink Soft Launch Readiness

**Audit date:** 2026-08-13
**Branch audited:** `main` @ `a2ac6ab`
**Method:** repository inspection + live local verification (API on `:5281` against SQL LocalDB `MyPetLinkDev`, web on `:3000`)

---

## Executive Summary

**Overall status: P0 COMPLETE — READY AFTER 2 REMAINING SELECTED P1 ITEMS AND ANALYTICS CONFIGURATION.**

MyPetLink is substantially more complete than its own top-level documentation claimed. `apps/api` is a working ASP.NET Core + EF Core service with 39 migrations, real Google authentication, ownership-scoped authorization, an email outbox with background dispatch, PDF document generation, and a broad Admin Portal. Security and privacy posture is genuinely good — the usual launch killers (IDOR, public PII leakage, weak identifiers) were checked and **not** found.

The risk at soft launch is not the platform. The finder-contact edge is fixed and the activation funnel is now instrumented in code; production analytics still needs to be configured and validated before launch learning begins.

| Priority | Count |
| --- | ---: |
| P0 — open Codex launch blocker | 0 |
| P1 — open recommendations | 6 |
| P2 — after launch | 6 |
| P3 — do not build yet | 5 |

### Top risks

1. **Finder contact dead-end — implemented and verified.** The Safety Profile now replaces contact instructions with a clear fallback when the pet has zero public contact methods.
2. **Migration SQL artefacts are owner-managed.** The audit finding is retained for history, but the artefacts are excluded from Codex work and are not a Codex launch blocker.
3. **Analytics is implemented but not yet enabled.** The optional GA4 adapter is privacy-limited and inert until Operations supplies the production measurement id and rebuilds.
4. **The homepage's primary demo CTA dead-ends** until an admin configures a sample pet.
5. **Care reminders decay into noise** — anything overdue is labelled "Due soon" forever.

---

## Current Product State

### What is actually implemented and production-ready

- **Authentication** — Google Sign-In only (`/api/v1/auth/google`), JWT access + refresh, logout, session restore. Admin authorization is re-checked against the database on every request (`ActiveAdminRequirementHandler`), not trusted from the token claim.
- **Pets** — full CRUD, lifecycle (Active / Memorial / Archived), Free-plan limit of 3, themes, personality, favourites, allergies, adoption day, birthday and estimated-year age handling.
- **Public Share Profile** (`/p/:slug`) — About / Moments / Timeline tabs, owner-controlled visibility flags, renders cleanly on mobile.
- **Dynamic social previews** — Cloudflare Pages Functions rewrite per-pet Open Graph tags at the edge and serve a generated 1200×630 JPEG card from the API. Verified: the social projection and `social-card.jpg` both return 200.
- **Safety Profile** (`/q/:safetyCode`) — finder-facing page, contact gated behind explicit `ShowPhone` / `ShowWhatsapp` toggles, Lost Mode, found-location consent.
- **Moments** — 12 categories including Birthday / Adoption Day / First Day Home, media up to 5 items, public/private, plus a Life Timeline with per-moment timeline notes.
- **Care Records** — 9 types, due dates, media, per-record public visibility, and type-specific date validation.
- **Smart Tags, orders, payment proofs, merchant sales and fulfilment** — extensive and recently developed, but **feature-flagged off by default** (see below).
- **Email** — outbox + background dispatcher, MailKit/SMTP, templated and brand-styled.
- **Admin Portal** — 23 admin controllers covering owners, pets, orders, payment review, products, tag inventory, shipping, configuration and audit logs.

### What is implemented but disabled by default

This is the single most important scoping fact in the repository. In `apps/web/src/lib/features.ts` and `appsettings.json`:

| Flag | Default |
| --- | --- |
| `NEXT_PUBLIC_PUBLIC_PROFILES_ENABLED` | **true** |
| `NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED` | false |
| `NEXT_PUBLIC_SMART_TAGS_ENABLED` | false |
| `NEXT_PUBLIC_TAG_ORDERS_ENABLED` | false |
| `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED` | false |
| `Features:SmartTagOrderingEnabled` (API) | false |
| `Email:Enabled` (API) | false |

**The default launch posture is free pet profiles only.** The Smart Tag commerce stack that dominates recent commit history is built but switched off, and the marketing site correctly labels it "Coming Soon" throughout. Email is off by default, which means the welcome email does not send unless explicitly enabled.

### What does not exist

- **Email OTP, password login, Apple Sign-In** — not implemented. Google is the only way in.
- **Production analytics delivery** — not active until Operations supplies the GA4 measurement id and rebuilds. The code-side event layer is implemented and remains inert when configuration is absent.
- **Reminder delivery** — no scheduled reminder job, no reminder email. Due dates are captured and shown on the dashboard, but nothing ever reaches the user outside the app.
- **Profile completion meter / onboarding checklist** — not implemented.

---

## Critical User Journey: Create → Share → Return → Protect

| Stage | State | Assessment |
| --- | --- | --- |
| **Create** | Strong | Pet creation works and the form is rich. The risk is the opposite of missing features — the create form is a 3,549-line component with many optional fields. |
| **Share** | Strong | Per-pet OG metadata and generated social cards work at the edge. Copy Link and WhatsApp share are present. This is the best-executed pillar. |
| **Return** | Weak | Moments, Life Timeline and Care Records all exist, but nothing pulls the user back. No email, no reminder, no notification. Return depends entirely on the user remembering. |
| **Protect** | Mixed | The mechanics are sound and privacy-respecting, but the finder-facing page can render instructions with no contact options (P0-001), and the owner-facing Safety UI is disabled by default. |

The four-stage model fits the product well. The mismatch is that **Protect is simultaneously the most emotionally central promise and the least enabled at launch**.

---

## Soft Launch Scope

See [`SOFT_LAUNCH_SCOPE.md`](SOFT_LAUNCH_SCOPE.md). In brief: launch **Profile + Memories + Care + Share**, keep **Smart Tag commerce** deferred behind its existing flags, and decide deliberately whether the Safety Profile owner UI ships (it is currently off, which weakens the "safety" half of the pitch).

## Explicitly Deferred Scope

Smart Tag ordering and fulfilment, Premium plans, GPS, FIUU payment integration, and any social/community feature. All are already either flagged off or unbuilt — no code removal is required.

---

## P0 Findings

### P0-001 — Safety Profile instructs a finder to use contact options that are not shown

**Status (2026-08-13): Implemented — awaiting final launch verification.** Valid public phone and WhatsApp actions retain the normal finder instructions. When neither is available, the page shows a calm no-contact state without exposing account contact details. Automated web checks and 375 × 812 browser verification passed for the direct Safety Profile and the shared physical-tag routes.

**Evidence (live, 2026-08-13):**

`GET /api/v1/public/safety/stysjmj4bayjd23ff7jva` returns `"contact": null` for pet "Milo" (`ShowWhatsapp = 1`, but no WhatsApp number is stored on the pet or owner).

The rendered page at `/q/stysjmj4bayjd23ff7jva` shows:

> Found Milo?
> Please contact the owner directly using one of the options below.

…followed by **no contact options at all**.

**Cause:** in `apps/web/src/components/marketing/QrSafetyPageView.tsx:167` the instruction copy is unconditional, while every contact CTA below it is conditionally rendered on `visibility.showWhatsapp && whatsappE164` / `visibility.showPhone && phoneE164`. There is no fallback branch for "no contact method available".

**Why it is P0:** the homepage advertises "Basic QR download" as a free feature, so a free user can print a QR that resolves to this page. A finder holding a lost pet follows an instruction that points at nothing. The codebase already has a **"Contact Update Needed"** concept (`apps/web/src/lib/safetyProfile.ts`) for the owner side — the finder side simply does not degrade.

### P0-002 — Two tracked `migration.sql` files disagree; the documented-looking one is stale

**Status (2026-08-13): Owner-managed — excluded from Codex action.** The repository owner generates and manages these artefacts. Codex must not investigate or modify them, and this historical audit finding is not treated as a Codex launch blocker.

**Evidence:**

| File | Last commit | Lines | md5 |
| --- | --- | ---: | --- |
| `migration.sql` (root) | 2026-08-11 | 6086 | `6664d749…` |
| `database/migration.sql` | 2026-08-03 | 4008 | `ae17fc6f…` |

`docs/architecture/configuration-governance.md` correctly names the **root** file as authoritative. But `database/migration.sql` sits inside the directory whose `README.md` still says "Database scripts are **not implemented yet**" — a stale 4,008-line script in a folder that claims to contain none, roughly 8 migrations behind.

**Why it is P0:** an operator or agent preparing the production database from `database/` would deploy a schema missing recent migrations. This is data-integrity risk at the exact moment it is least recoverable.

**Note:** this file was deliberately **not deleted** during this audit — deletion of database migration records is out of scope for documentation housekeeping and needs an explicit decision.

---

## P1 Findings

### P1-001 — No analytics or funnel instrumentation exists
**Implemented in code on 2026-08-13; production configuration remains.** The initial repo-wide search found no provider or event layer. MyPetLink now has optional GA4 behind `NEXT_PUBLIC_GA_MEASUREMENT_ID`, manual App Router page views, and the reliably measurable create → view → share → return and Smart Tag events. Dynamic routes and event metadata are sanitized at runtime. Signup is not emitted because the current Google auth response cannot reliably distinguish new and returning owners.

### P1-002 — Overdue care records are labelled "Due soon" forever
`deriveStatus` in `apps/web/src/services/recordService.ts:342` and `DeriveStatus` in `apps/api/.../Services/CareRecordService.cs:469` both return `"due-soon"` for **any** due date ≤ today + 30 days, with no lower bound and no `overdue` state.

**Verified live:** a care record created with `dueDate = 2024-06-10` (≈26 months past) returned `derivedStatus: "due-soon"`. The dashboard sorts by due date ascending, so the oldest overdue items permanently pin to the top of the reminders widget. The one retention surface that exists degrades into noise.

The rule is also duplicated across frontend and backend, which conflicts with the single-owner principle in `docs/architecture/configuration-governance.md`.

### P1-003 — `/sample` is empty on a fresh database, dead-ending four homepage CTAs
Four homepage links ("Explore Sample Profile", "View Sample Safety Profile", and two footer/nav "Sample Profile" links) all point to `/sample`, which renders only:

> The Sample Experience is being prepared. Please check again soon.

The degradation is honest and safe, but the primary "show me what this is" path for every first-time visitor leads nowhere until an admin configures a sample pet in `/admin/sample-experience`. Either make this a hard pre-launch checklist item or hide the CTAs when no sample exists.

### P1-004 — The post-creation screen offers five competing CTAs and no primary action
After creating a pet (`PetProfileForm.tsx:900`) the success screen renders up to five buttons — View Public Profile, View Safety Profile, Order Physical Tag, Manage {pet}, Go to Dashboard — at similar visual weight, which stack into a long column on mobile. There is no single obvious next step, and notably **"Add your first Moment" is not among them**, even though Moments are the core retention loop. This is the highest-leverage activation moment in the product and it currently diffuses attention.

### P1-005 — Owner-facing copy promises reminders that do not exist
Care-record validation returns, e.g., *"Vaccination date cannot be in the future. Use Next Vaccination Due Date for future reminders."* No reminder is ever delivered. The homepage is honest ("Reminders coming soon"); this in-product copy is not.

### P1-006 — Google is the only way to sign in
There is no email OTP, password, or Apple option. Any user without a usable Google account — or on a device where Google Sign-In fails to load — cannot enter the product at all, and the failure mode is a small inline error. For a Malaysian consumer launch this is a real addressable-audience constraint. It is a deliberate scope decision, not a defect, but it should be a conscious launch decision rather than an implicit one.

### P1-007 — Two differently-labelled CTAs resolve to the same page
"Explore Sample Profile" and "View Sample Safety Profile" both link to `/sample`. They promise two different things (the shareable page vs. the finder page) and deliver the same destination.

---

## P2 Findings

- **Anonymous `POST /api/v1/public/tags/{tagCode}/scan-location-consent` has no rate limit**, while its sibling GET endpoints do. Low impact while tags are disabled, but it accepts anonymous writes.
- **No rate limiting on `/api/v1/auth/google` or `/api/v1/auth/refresh`.** Rate limiting is configured only for tag scan and tag activation policies.
- **Footer links are ~20px tall** at 375px, below the 40px comfortable tap-target threshold (8 such links on the homepage).
- **`/q` and `/t` are excluded from the edge OG rewrite** (`public/_routes.json` includes only `/p/*` and `/social/pets/*`). Sharing a Lost Mode safety page to social media produces generic previews — a missed opportunity precisely when reach matters most.
- **`.env.example` carries dead configuration** — `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMENT_PROVIDER`, `PAYMENT_SECRET_KEY`, with a comment claiming "Checkout is not implemented yet" although the manual payment-proof flow is fully built.
- **`PaymentReservationExpiryWorker` logs a full SQL statement on every poll** at Information level, which will dominate production logs.

---

## P3 — Do Not Build Yet

Explore/social feed, likes, comments, following pets, chat/community, complex social notifications, BLE, and GPS. **No partial implementations of any of these exist in the codebase** — there is nothing to hide or remove. GPS is already positioned as "Coming Later" in marketing copy, which is consistent.

**Also do not build: a separate "Milestones" feature.** It already exists in substance — `MomentType` includes Birthday, Adoption Day, First Day Home and Achievement, and `showInLifeTimeline` / `timelineNote` with a dedicated `/pets/[id]/timeline` page already deliver "from camera roll to life story". Building a parallel Milestone concept would duplicate it. Surface what exists instead.

---

## Retention Assessment

**Would a user return today? Mostly no — and not because features are missing.**

The building blocks are unusually complete: Moments with categories and media, a Life Timeline, nine kinds of Care Record with due dates, and a dashboard widget that already lists upcoming care. What is missing is any mechanism that **initiates contact**. Every return visit currently depends on the user spontaneously remembering.

| Mechanism | State | Effort to make useful |
| --- | --- | --- |
| Moments / Life Timeline | Built | None — needs promotion in onboarding (P1-004) |
| Care Records | Built | None |
| Dashboard reminders | Built but degrading | Low — fix `deriveStatus`, add `overdue` (P1-002) |
| Profile completion checklist | Not built | Medium — high activation value |
| Care reminder **email** | Not built | Medium — outbox, templates and worker already exist; needs a scheduled query + template |
| Birthday / adoption anniversary | Data exists, unused | Low — `Birthday` and `AdoptionDay` are already stored |
| Milestones | Effectively built | None — do not rebuild |

**The highest-value retention work is the cheapest:** fix the overdue bug, then add a care-reminder email on top of the existing `EmailOutboxService` + `EmailDispatchWorker`. Birthday and adoption-anniversary emails reuse the same machinery and data already captured.

---

## Mobile Assessment

**Good.** Measured at 375×812 on live pages:

| Page | Horizontal overflow | Notes |
| --- | --- | --- |
| `/` | None (`scrollWidth` 375) | 8 footer links under 40px tall |
| `/p/:slug` | None | 0 overflowing elements |
| `/q/:safetyCode` | None | 1 small tap target |

No cramped controls, broken modals, or off-screen CTAs were found on the public surfaces. Mobile is not a launch risk for the pages that anonymous visitors see.

**Caveat:** authenticated Owner Portal pages were **not** verified in the browser (see Verification Limitations).

---

## Public Profile Assessment

The Public Profile does read as a pet's page rather than a database record: pet-first heading, About / Moments / Timeline tabs, theming, and an explicit privacy line ("This profile only shows owner-approved public information"). Combined with per-pet social cards, it supports "Give your pet a page of their own" well.

Two refinements worth making: age is stated twice on the same screen (subtitle and About block), and a pet with no photo falls back to a text-only presentation that undercuts the emotional pitch — worth a warmer empty state.

## Sharing Assessment

**The strongest pillar.** Per-pet Open Graph tags and a generated JPEG card are injected at the Cloudflare edge, with a version hash so a changed photo busts the cache while the canonical URL stays stable. Privacy is handled carefully: the card renderer consumes a restricted projection containing no contact details, and disabled or archived profiles fall back to generic metadata.

Note for reviewers: in `next dev` the `/p/:slug` page serves **generic site-wide** OG tags. That is expected — the rewrite happens at the edge and is only observable in a Pages build, per `docs/deployment/dynamic-social-previews.md`. It is not a defect.

## Smart Tag Assessment

Built to an impressive depth — inventory, assignment, replacement, activation, QR/NFC/legacy scan sources, scan history, disable/replace semantics, and audit trails — and **disabled by default**. Because ordering is off, the full purchase → fulfilment → activation lifecycle was **not** exercised end-to-end in this audit. Re-verify that lifecycle as a dedicated exercise before enabling the flags; treat it as out of scope for this soft launch.

## Payment / Fulfilment Assessment

Manual DuitNow with payment-proof upload and admin review is implemented, along with reservation expiry, documents, and merchant sales/fulfilment workflows. Not in the default launch scope.

On **FIUU readiness**: the architecture would not obstruct a future gateway. Payment state is modelled explicitly (`PaymentStatus`, `PaymentConfirmedAt`, reservation expiry, idempotency keys on order creation) rather than assumed synchronous, which is the property that usually makes gateway integration painful. The main gap is that payment confirmation is currently an admin action rather than an event, so a webhook path would need to be added alongside it.

## Email Assessment

Infrastructure is solid — outbox table, background dispatcher with visibility timeout and retry, MailKit SMTP, shared branded layout, a two-level `EmailTemplateGate`, and dev preview endpoints.

Only **three owner-facing** templates exist: `OwnerWelcome`, `PaymentConfirmed`, `OrderShipped` (plus four merchant/B2B templates). There is no acknowledgement when a payment proof is *received*, no delivered notification, no tag-activation confirmation, and no reminder of any kind. **`Email:Enabled` is `false` by default**, so even the welcome email does not send unless explicitly switched on — this must be an explicit launch-checklist decision.

## Analytics Assessment

**Implemented, disabled until configured.** The frontend now exposes a provider-neutral event contract with an optional GA4 adapter. It emits manual page views plus:

`pet_create_started` · `pet_created` · `public_profile_viewed` · `share_clicked` · `share_link_copied` · `moment_created` · `care_record_created` · `smart_tag_viewed` · `order_started` · `order_submitted`

**Privacy:** no raw or opaque user/pet identifiers are sent. The runtime allowlist accepts only fixed source/surface/type categories and a bounded item count. Dynamic routes are replaced with templates; names, contact details, codes, order references, care content, free text, query strings, filenames, and tokens are excluded. The Privacy Notice now describes the optional GA4 use. Operations must still confirm consent requirements before enabling production analytics.

## Security / Privacy Assessment

**The strongest area of the codebase, and not a launch blocker.** Verified by inspection:

- **Ownership is enforced at the service layer, consistently.** `PetService`, `MemoryService`, `CareRecordService`, `OrderService`, `SmartTagService`, `MediaService`, `PaymentProofService` and `OrderDocumentService` all scope queries by `OwnerUserId`. No IDOR path was found.
- **Admin authorization is re-validated against the database on every request**, checking `IsActive`, `DisabledAt`, user status and soft-deletion — a compromised or stale token is not sufficient.
- **Public identifiers are cryptographically random** — `RandomNumberGenerator`, 96-bit safety codes and 80-bit public codes. Enumeration is infeasible, so the absence of a rate limit on the safety endpoint is not a practical harvesting risk.
- **Public DTOs are minimal by construction.** `PublicPetProfileResponse` carries no phone or email. Contact appears only in `PublicSafetyContactResponse`, gated behind explicit owner toggles, and suppressed entirely for Memorial pets.
- Structured error envelopes avoid leaking internals; forwarded-headers and CORS are explicitly configured; R2 image fetching is host-restricted.

Residual items are the P2 rate-limiting gaps above. **No authentication, authorization, or PII-exposure issue was found that should block a soft launch.**

## Operational Readiness

**Present:** `/health`, `/health/live`, and a real `/health/ready` that probes the database and returns 503 with `Retry-After`; EF Core retry-on-failure; a rate limiter with proper 429 envelopes; audit logging; business reference numbering; two background workers (email dispatch, payment reservation expiry); and a documented deployment plan, release checklist and smoke-test script.

**Gaps:** no error-tracking integration (no Sentry or equivalent), product analytics still needs production configuration and delivery validation, and the reservation worker produces avoidable log noise. Migration SQL artefacts remain owner-managed and excluded from Codex action.

---

## Verification Limitations

Stated plainly so this report is not over-trusted:

- **Authenticated Owner Portal pages were not verified in the browser.** Installing a session token into the browser was blocked by a permission policy, and it was not worked around. Owner journeys were instead verified against the **live API** with a minted development JWT (`/api/v1/auth/me`, `/api/v1/pets`, care-record create/validate/delete all exercised successfully), with the corresponding UI verified by code inspection.
- **Screenshots were unavailable** in this browser pane; visual assessment used DOM measurement and extracted text instead.
- **Admin Portal UI, the Smart Tag purchase→fulfilment→activation lifecycle, and email delivery were not exercised end-to-end** — the first for the reason above, the latter two because both are disabled by default.
- Journeys C, D, E and F from the audit brief were therefore **not** executed as browser flows.

---

## Final Recommendation

### P0 COMPLETE — READY AFTER 3 SELECTED P1 ITEMS

**Fix before soft launch:**

1. **Enable and validate P1-001** — configure the production GA4 measurement id, rebuild, and confirm events in GA4 after privacy/consent review.
2. **P1-002** — Overdue care-record status. Cheap, and it repairs the only retention surface that exists.
3. **P1-003** — Configure the sample pet (or hide the CTAs). A launch-checklist item as much as a code change.

**Why not "READY FOR CONTROLLED SOFT LAUNCH" today:** the P0 finder issue and analytics code are complete, but production analytics configuration, retention-correctness, and sample-experience work remain. Migration SQL artefacts are owner-managed and excluded from this recommendation.

**Why not "NOT READY":** the platform underneath is sound. Authentication, authorization, data ownership, privacy boundaries, and mobile rendering were all verified and hold up. The remaining P1 and P2 items are genuine improvements, not obstacles.

A deliberate decision is still needed on two scope questions that are currently settled by default values rather than by choice: whether `Email:Enabled` is turned on, and whether the Safety Profile owner UI ships. Launching with both off means launching a product whose "safety" promise the owner cannot actually manage.
