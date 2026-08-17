# MyPetLink — Feature Development Backlog

**Date:** 2026-08-17 · **Source:**
[`GROWTH_AND_PREMIUM_ROADMAP.md`](GROWTH_AND_PREMIUM_ROADMAP.md)
**Branch:** `main` @ `a06ab48`

Codex-ready work packages for the growth and Premium phase. Every file path
below was confirmed to exist during the planning pass. Sizing rule: **one work
package should be reviewable in a single sitting.** Where a feature cannot be,
it is split into sequential phases.

**Status legend:** `Ready` · `Blocked` · `In progress` · `Done`

---

## Execution Order

```text
Phase G1 — Free growth, no backend risk
  MPL-GROWTH-001   Profile Completion                    Done
  MPL-GROWTH-002   Share Card renderer variant (API)     Done
  MPL-GROWTH-003   Share Card edge + owner UI            Done

Phase G2 — Seasonal reach
  MPL-GROWTH-004   Birthday / Adoption card variants     Done

Phase G3 — Free growth loop fixes (from the 2026-08-17 review)
  MPL-GROWTH-FIX-002  Public profile acquisition CTA     Ready   G1 (highest value)
  MPL-GROWTH-FIX-001  Dashboard completion/occasion data Done    G1
  MPL-GROWTH-FIX-003  Card fallback, logo + profile QR   Done    G1
  MPL-GROWTH-FIX-004  Share Card action analytics        Ready   G1
  MPL-GROWTH-FIX-005  First-pet heading never renders    Ready   G2

Phase P0 — Premium foundations (ships dark)
  MPL-PREM-001     Malaysia calendar day + reminder schema   Ready

Phase P1 — First Premium capability
  MPL-PREM-002     Care reminder scheduling worker       Blocked by 001
  MPL-PREM-003     Care reminder email template + gate   Blocked by 001
  MPL-PREM-004     Reminder preferences + entitlement UI Blocked by 002, 003

Phase P2 — Premium depth
  MPL-PREM-005     Document Vault — API + limits         Ready
  MPL-PREM-006     Document Vault — owner UI             Blocked by 005
  MPL-PREM-007     Vet Health Summary PDF                Blocked by 005

Phase P3 — Collaboration (highest risk, deliberately last)
  MPL-PREM-008     Family Access — domain + authorization   Blocked by P1 shipped
  MPL-PREM-009     Family Access — invitation + acceptance  Blocked by 008
  MPL-PREM-010     Family Access — owner UI + revocation    Blocked by 009
  MPL-PREM-011     Family Access — public/safety regression Blocked by 010

Later (not scheduled)
  MPL-LATER-001    Advanced Safety (scan notify, history retention)
  MPL-LATER-002    Recurring Care Schedules
  MPL-LATER-003    Premium profile customisation
  MPL-LATER-004    Weight tracking + trends
  MPL-LATER-005    Year in Review
```

**The approved Free Growth loop is complete through MPL-GROWTH-004**, and has
been reviewed end to end (2026-08-17). The loop works from profile completion
through to a shared card, and no G0 issue was found — but it **does not yet
close**: the page every share lands on offers a recipient no way to create their
own profile. Ship Phase G3 before any marketing campaign; Premium work
(`MPL-PREM-001`) can start in parallel.

---

# Phase G1 — Free Growth

## MPL-GROWTH-001 — Profile Completion

**Status:** Done · **Full spec:**
[`features/PROFILE_COMPLETION.md`](features/PROFILE_COMPLETION.md)

**Goal.** Give owners a clear, honest next action on a new pet profile, raising
the share of profiles that reach a genuinely shareable state.

**Dependencies.** None.

**Likely code areas**
- New: `apps/web/src/lib/profileCompletion.ts` (+ tests)
- New: `apps/web/src/components/portal/ProfileCompletionCard.tsx` (+ tests)
- `apps/web/src/components/portal/DashboardClient.tsx` — already loads pets,
  moments and records for all active pets at line 108
- `apps/web/src/app/pets/[id]/page.tsx` and
  `apps/web/src/components/portal/PetManagementTabs.tsx`
- `apps/web/src/lib/analytics.ts` — two events
- `apps/web/src/lib/routes.ts` — reuse existing deep links only
- Reference: `apps/web/src/components/portal/OwnerContactSetupCard.tsx`
  (existing single-item nudge that must not be duplicated)
- Reference: `apps/web/src/lib/features.ts`,
  `apps/web/src/lib/safetyProfile.ts`

**Scope.** Frontend only. **No API, no DTO, no migration.**

**Acceptance criteria**
1. Completion is derived by one pure function from data the client already holds;
   no new network call is introduced.
2. Every incomplete item deep-links to the editor that resolves it, using
   `ownerRoutes`.
3. Items whose feature is disabled by `lib/features.ts` are excluded from both
   the checklist and the denominator.
4. A fully complete profile shows a brief complete state rather than an empty
   card.
5. Copy contains no internal wording (no "field", "record", "API", "profile
   completeness score"); it reads as guidance to a pet owner.
6. Memorial and Archived pets show no completion prompt.
7. `completion_prompt_viewed` and `completion_action_clicked` pass the runtime
   allowlist in `analytics.ts`.
8. No layout overflow at 375 × 812.

**Required tests.** Unit tests for the derivation function covering: empty pet,
partial, complete, memorial, archived, feature-disabled items, and the
percentage/checklist agreement invariant. Component tests for render, empty
state, complete state, and analytics emission. `npm run test`, `npm run lint`,
`npm run typecheck` in `apps/web`.

**Risk.** Low — additive UI, revertible by removing one card.

**Codex effort:** **Medium.**

---

## MPL-GROWTH-002 — Share Card Renderer Variant (API)

**Status:** Done

**Goal.** Teach the existing social-card renderer to produce a second,
share-sheet-friendly card layout, without creating a second image service.

**Dependencies.** None.

**Likely code areas**
- `apps/api/MyPetLink.Api/Services/PublicProfileSocialCardRenderer.cs` — extract
  the layout from `DrawCard` into per-variant layouts; keep `Width`/`Height`
  per variant
- `apps/api/MyPetLink.Api/Controllers/PublicProfilesController.cs:49` — the
  existing `pets/{publicSlug}/social-card.jpg` action
- `apps/api/MyPetLink.Api/DTOs` — `PublicProfileSocialResponse` (**do not widen
  it**)
- `apps/api/MyPetLink.Api.Tests`

**Scope.** Backend only.

**Acceptance criteria**
1. A `variant` value selects the layout; an unknown or missing variant resolves
   to today's 1200×630 behaviour byte-for-byte unchanged.
2. The memory cache key includes the variant, so variants cannot collide.
3. The in-flight dedupe (`_inflight`) remains per cache key.
4. The renderer still consumes only `PublicProfileSocialResponse`. No contact
   detail, owner name, safety code, or tag code can reach a card.
5. Existing host allowlist, byte/dimension/pixel caps, and 4.5 s media fetch
   timeout are unchanged.
6. Lost Mode banner behaviour is preserved in every variant and still adds no
   contact information.

**Required tests.** Renderer tests asserting: default variant output is
unchanged; new variant produces valid JPEG of the expected dimensions; cache key
differs by variant; a null photo/cover falls back cleanly; long pet names are
truncated rather than overflowing. `dotnet test`.

**Risk.** Low–Medium — a shared production renderer; regressions would degrade
existing OG previews.

**Codex effort:** **Medium.**

---

## MPL-GROWTH-003 — Share Card Edge Route + Owner Share UI

**Status:** Done

**Goal.** Deliver the new card to owners through the existing edge cache and
share controls.

**Dependencies.** MPL-GROWTH-002.

**Likely code areas**
- `apps/web/edge/publicProfileEdge.ts` — `handleSocialCardRequest`; keep the
  "revalidate projection before serving cache" ordering
- `apps/web/functions/social/pets/[slug].ts`, `apps/web/public/_routes.json`
- `apps/web/src/components/share/ShareProfileLink.tsx`
- `apps/web/src/lib/publicProfileSocial.ts`, `apps/web/src/lib/features.ts`
  (new `NEXT_PUBLIC_SHARE_CARDS_ENABLED`, default `false`)
- `apps/web/src/lib/analytics.ts` — `share_card_viewed`, `share_card_shared`,
  new controlled dimension `card_variant`

**Scope.** Frontend + Cloudflare Pages Function. No API change.

**Acceptance criteria**
1. The variant is part of the edge cache key together with
   `publicProfileVersion`.
2. A profile that is private, archived, or not found produces **no** card, and
   an existing cached card stops being served immediately.
3. `navigator.share` is used where available with a clipboard/link fallback
   identical in behaviour to `ShareProfileLink`'s existing path.
4. Desktop, with no `navigator.share`, still offers the image and Copy Profile
   Link.
5. The feature is entirely hidden when the flag is `false`; routes still work.
6. No pet name, code, or slug reaches analytics.

**Required tests.** Edge tests alongside `edge/publicProfileEdge.test.ts` for
cache key, revalidation, and rejection paths. Component tests for share, copy
fallback, and flag-off rendering. `npm run test`, `npm run typecheck` (which
also type-checks `tsconfig.functions.json`), `npm run build:functions`.

**Risk.** Medium — edge caching mistakes are publicly visible and slow to
expire.

**Codex effort:** **High** (edge caching + privacy revalidation ordering).

---

# Phase G2 — Seasonal Reach

## MPL-GROWTH-004 — Birthday and Adoption Card Variants

**Status:** Done

**Goal.** Give owners something worth posting on the two days of the year they
already feel like posting — with no scheduler and no notification.

**Dependencies.** MPL-GROWTH-002, MPL-GROWTH-003.

**Likely code areas**
- `PublicProfileSocialCardRenderer.cs` — two further variants
- `apps/api/MyPetLink.Api/Services/PetAgeCalculator.cs` — age number
- `apps/web/src/components/portal/DashboardClient.tsx` — an occasion card
- `apps/web/src/lib/careRecordStatus.ts` — reuse the Malaysia-day helper
- `apps/web/src/lib/petTimeline.ts`, `MomentType` vocabulary for copy

**Scope.** Renderer variants + one dashboard surface.

**Acceptance criteria**
1. The occasion card appears only when `birthday` or `adoptionDay` equals today
   in the Malaysia calendar.
2. Pets with only `estimatedBirthYear` show nothing.
3. Memorial and Archived pets show nothing.
4. **No background job, cron, worker, or email is added.**
5. Sharing reuses the MPL-GROWTH-003 path; `card_variant` distinguishes
   `birthday` from `adoption`.
6. Copy is warm and non-technical, and handles "turns 1" vs "turns 4"
   correctly.

**Required tests.** Date-boundary tests across the 16:00 UTC / 00:00 MYT
transition, leap-day birthdays, adoption day equal to birthday, and lifecycle
exclusions. Renderer tests for both variants.

**Risk.** Low.

**Codex effort:** **Medium.**

---

# Phase G3 — Free Growth Loop Fixes

Findings from the cross-feature growth-loop review of `main` @ `75d1047`
(2026-08-17), run end to end against a local API + Cloudflare Pages build with
`NEXT_PUBLIC_SHARE_CARDS_ENABLED=true`.

**No G0 issue was found.** Privacy and lifecycle invariants were verified live:
disabling a public profile, archiving, or marking a pet memorial made every card
variant return `404` immediately at both the edge and the origin, and occasion
cards return `404` on any day that is not the anniversary.

The four items below are **G1 — strongly recommended before any marketing
campaign**. `MPL-GROWTH-FIX-002` is the single highest-value item in this
backlog: without it the acquisition loop does not close.

---

## MPL-GROWTH-FIX-001 — Dashboard completion and occasion cards read an incomplete pet payload

**Status:** Done · **Priority:** G1

**Problem.** `DashboardClient` derives both profile completion and today's
occasions from the pets **list** response, which does not carry `breed`,
`gender`, `bio`, or `adoptionDay`. `petService` substitutes placeholders for the
missing fields, so the derivation silently reads fabricated values.

**Evidence (live, 2026-08-17).** For one pet, in one session:

| Surface | Percentage | "Basic information" | "About" |
| --- | --- | --- | --- |
| `/dashboard` compact card | **65%** | counted **incomplete** | counted **complete** |
| `/pets/[id]` full card | **76%** | complete | complete |

The pet had `breed: "Golden Retriever"`, `gender: "Male"`, and an owner-written
bio. `GET /api/v1/pets` omits all three keys; `GET /api/v1/pets/{id}` returns
them. Separately, a pet whose adoption anniversary was that day showed **no**
"Celebrate today" card, while its Share Card modal on the pet page correctly
offered the **Adoption Day** variant.

**Root cause.**
- `apps/web/src/services/petService.ts:530-531` — `breed`/`gender` fall back to
  `"Not set"`, which `hasText()` in `profileCompletion.ts` treats as absent.
- `apps/web/src/services/petService.ts:538` — `adoptionDay` falls back to
  `"Not set"`, so `derivePetOccasions` never produces an adoption occasion.
- `apps/web/src/services/petService.ts:572-574` — `bio` falls back to a
  generated sentence, so "About" reads complete for a pet with no bio.

**User / growth impact.** The dashboard is the most-seen surface. It under-reports
progress, asks owners to re-enter information they already entered — the exact
"nagging" failure `features/PROFILE_COMPLETION.md` set out to avoid — and hides a
genuinely missing bio. Half of `MPL-GROWTH-004` (adoption anniversaries) is dead
on its primary surface, leaving that occasion discoverable only by chance.

**Exact surface.** `apps/web/src/components/portal/DashboardClient.tsx`,
`apps/web/src/lib/profileCompletion.ts`, `apps/web/src/lib/petOccasions.ts`,
`apps/web/src/services/petService.ts`, and the pets list DTO in
`apps/api/MyPetLink.Api/DTOs/PetDtos.cs` if the list projection is widened.

**Acceptance criteria**
1. The same pet reports the **same** percentage on `/dashboard` and
   `/pets/[id]`.
2. A field the client cannot actually see is **excluded from both numerator and
   denominator**, never counted as incomplete and never counted as complete from
   a placeholder.
3. `"Not set"` and the generated bio sentence can never satisfy a completion
   item.
4. A pet whose adoption anniversary is today shows a "Celebrate today" card on
   the dashboard.
5. Whichever fix is chosen — widening the list projection or marking unknown
   fields unavailable — is applied in **one** place, not per surface.
6. No additional per-pet request is introduced on dashboard load.

**Required tests.** Unit tests for `deriveProfileCompletion` with placeholder
`"Not set"` values and with the generated bio fallback; a `derivePetOccasions`
test for an adoption anniversary reaching the dashboard; a `DashboardClient`
test asserting dashboard and pet-page percentages agree for identical data.

**Risk.** Medium — touches the shared pet mapper used by every owner surface.

**Codex effort:** **Medium.**

---

## MPL-GROWTH-FIX-002 — The Public Share Profile gives a recipient no way to create their own profile

**Status:** Ready · **Priority:** G1 — highest value in this backlog

**Problem.** Every share lands on `/p/:slug`. That page contains **no**
acquisition path.

**Evidence (live, anonymous session, 375 × 812).** A full inventory of the
rendered page returned:

- links: exactly **one** — `href="/"`, the header logo, with no accessible
  label and a 36 px height (below the 40 px tap-target threshold);
- occurrences of "MyPetLink" in visible text: **one**, in the closing line
  "Powered by MyPetLink. This profile only shows owner-approved public
  information.";
- any create/sign-up wording: **none**.

`CreateProfileCTA` is used on `/`, `/pricing`, `/how-it-works`, `/pet-profile`,
`/sample`, and `PublicLayout` — every public surface **except** the one that
receives the traffic.

**User / growth impact.** This is where the loop terminates. A visitor who
likes what they see must notice a small unlabelled logo, realise it is
clickable, and tap it. Once on the homepage the CTAs are strong ("Create Free
Pet Profile"), so the gap is exactly one step — and it is the step every share
depends on. It also makes share-driven signup **unmeasurable**, because there is
no instrumented CTA to attribute against.

**Exact surface.**
`apps/web/src/components/marketing/PublicSharePetProfile.tsx:656-662` (the
closing line, after the tab content) and
`apps/web/src/components/marketing/CreateProfileCTA.tsx`.

**Acceptance criteria**
1. An anonymous visitor is offered one clear, calm way to create a profile for
   their own pet, placed **after** the pet's content — never above or beside it.
2. The page still reads as the owner's pet page, not an advertisement: one CTA,
   no interstitial, no banner, no repetition.
3. The owner viewing their own profile does not see the acquisition CTA.
4. Signed-in visitors are routed to create a pet; signed-out visitors go through
   login, reusing `CreateProfileCTA`'s existing behaviour.
5. Memorial profiles are handled deliberately and respectfully — this review
   recommends suppressing the CTA there.
6. One analytics event distinguishes a CTA click on a public profile from the
   same CTA elsewhere, so share-driven signup becomes measurable, using only
   existing controlled dimensions.
7. Tap target ≥ 40 px; no horizontal overflow at 375 × 812.

**Required tests.** Component tests for anonymous vs owner vs memorial;
analytics emission test; a mobile layout assertion.

**Risk.** Medium — this page is the product's public face. The failure mode is
tonal, not technical.

**Codex effort:** **Medium.** → Product should approve the copy and placement
before implementation.

---

## MPL-GROWTH-FIX-003 — Share Cards render a blank panel without a photo, and never show the real logo

**Status:** Done · **Priority:** G1

**Problem.** Two rendering defects make the shareable image markedly weaker than
its layout intends. Both live in code shared with the existing Open Graph card,
and both were reproduced on the OG card too — they are **pre-existing**, not
introduced by `MPL-GROWTH-002`, but the portrait cards make them dominant.

**Evidence (rendered 1080 × 1350 JPEGs, 2026-08-17).**

1. **The photo-less hero renders as a near-empty white panel** occupying roughly
   55% of the card. `DrawCover`'s fallback builds a three-stop gradient but
   assigns it to a paint created by `Paint()`, whose `Color` is
   `SKColors.Transparent`. Skia modulates a shader by the paint's alpha, so the
   gradient is drawn at alpha 0. Only the white paw watermark survives. The same
   blank panel appears on the existing OG card.
2. **The brand logo never loads.** `LoadLogo()` reads
   `Assets/logo-horizontal.png` relative to the content root; the repository
   ships `apps/api/MyPetLink.Api/Assets/Brand/mypetlink-logo-horizontal.png`.
   Every card therefore falls back to plain "MyPetLink" text.

**User / growth impact.** A new owner's very first share is the product's first
impression on a dozen strangers. A profile without a photo currently produces an
image that looks unfinished, and no card carries real branding. Both directly
reduce the value of every share.

**Exact surface.**
`apps/api/MyPetLink.Api/Services/PublicProfileSocialCardRenderer.cs` —
`DrawCover` fallback branch, `LoadLogo`, and `Paint`.

**Acceptance criteria**
1. A pet with no photo and no cover produces a deliberately designed panel, not
   a blank one, on every variant **and** on the existing Open Graph card.
2. The real brand logo renders on every variant; if the asset is genuinely
   missing the text fallback still applies.
3. Photo-bearing cards are unchanged.
4. A test asserts the fallback panel is not a single flat colour — for example,
   by sampling pixels at opposite corners of the hero and requiring a
   difference.
5. A test asserts the logo asset resolves from the content root.

**Required tests.** Renderer tests for the no-photo fallback on all four
variants, a logo-resolution test, and confirmation that the OG card's byte
output changes only in the fallback case.

**Risk.** Medium — a shared production renderer; Open Graph output changes.

**Codex effort:** **Medium.**

**Implemented (2026-08-17).** The shared fallback now renders an opaque brand
gradient with the pet initial, paw, and soft shapes; the packaged horizontal
logo is loaded from the API assembly with a canonical content-root fallback.
Profile, Birthday, and Adoption cards no longer print the long public slug URL.
They render a locally generated, Q-error-correction QR for the canonical Public
Share Profile plus the short root domain. QR decode tests cover every portrait
variant and a 540 x 675, JPEG-quality-68 resize/compression pass. The restricted
public projection and existing clickable native/text and Copy Profile Link
payloads are unchanged. Cache identities advanced independently to
`social-card-v3`, `pet-share-card-v2`, `pet-birthday-card-v2`, and
`pet-adoption-card-v2`.

**Note.** This review could not verify the photo-bearing card at all: the local
database has 39 pets and **zero** with a profile or cover photo, and the
renderer's host allowlist only accepts `media.mypetlink.com.my` or the
configured R2 public host. Verify the photo path against a staging environment
with real R2 media before promoting Share Cards.

---

## MPL-GROWTH-FIX-004 — Share Card success actions emit no analytics

**Status:** Ready · **Priority:** G1

**Problem.** `share_card_shared` fires **only** on a successful
`navigator.share`. The other three success paths are silent.

**Evidence (code, confirmed against the live modal).**
- `PetShareCard.handleSave` — downloads the image, emits nothing.
- `PetShareCard.copyProfileLink` — calls `copyTextToClipboard` directly and
  emits nothing (it does not reuse the `share_link_copied` event that
  `ShareProfileLink` fires).
- `handleShare` with no Web Share support falls through to `copyProfileLink`,
  also silent.

On the review's desktop run the modal exposed **Save Image**, **Copy Profile
Link** and **Open Image**; on a browser without Web Share these are the *only*
ways to succeed.

**User / growth impact.** `share_card_viewed` will show opens while
`share_card_shared` shows near-zero on desktop, making the feature look like it
fails when it is working. `share_card_viewed` also fires from the image `onLoad`
handler, so a failed preview records neither a view nor an error — a broken card
is invisible in analytics.

**Exact surface.** `apps/web/src/components/share/PetShareCard.tsx`,
`apps/web/src/lib/analytics.ts`.

**Acceptance criteria**
1. Saving the image, copying the profile link from the modal, and opening the
   image each emit an event carrying `card_variant`.
2. The distinction between "shared natively" and "saved/copied" is preserved.
3. Every new value passes the runtime allowlist; no identifier, slug, name, or
   free text is emitted.
4. A failed preview is distinguishable from a card that was never opened.
5. `docs/operations/product-analytics.md` is updated with the new rows.

**Required tests.** Component tests asserting one event per action, with the
correct variant, including the no-Web-Share fallback path.

**Risk.** Low.

**Codex effort:** **Medium.**

---

## MPL-GROWTH-FIX-005 — The first-pet completion heading can never render

**Status:** Ready · **Priority:** G2

**Problem.** `apps/web/src/app/pets/[id]/page.tsx` passes
`activePetCount={getActivePets(mockPets).length}`. `mockPets` is the static
local-fallback fixture and contains exactly two active pets, so `isFirstPet` is
`false` for every real owner. The "Finish {pet}'s profile" framing written for
the new-owner activation moment is unreachable in production; every owner sees
"Add more about {pet}".

**Evidence.** Confirmed by code and by live rendering — a two-pet account and a
freshly created first pet both rendered "Add more about Milo".

**User / growth impact.** Low individually, but it silently disables the one
piece of copy aimed at the activation moment the whole feature exists to serve.
It also imports demo fixture data into a production page, which will mislead
later work.

**Acceptance criteria**
1. `isFirstPet` reflects the signed-in owner's real active pet count.
2. `mockPets` is not imported by `apps/web/src/app/pets/[id]/page.tsx`.
3. A single-pet account renders "Finish {pet}'s profile"; a multi-pet account
   renders "Add more about {pet}".

**Required tests.** Component test for both headings.

**Risk.** Low. Ships naturally with `MPL-GROWTH-FIX-001`.

**Codex effort:** **Medium.**

---

## G2 — Recorded, not scheduled

These are product judgements from the review, not defects. No work item yet.

- **Dashboard action button reads only "Add".** The compact card shows
  "Add more about {pet} · 65% complete · [Add]". The accessible label is
  correct ("Add Milo's profile photo"), but a sighted owner cannot see *what*
  the button adds without tapping. Naming the next step would make the most-seen
  growth surface self-explanatory.
- **Occasion availability window.** Birthday and adoption cards exist only on
  the exact Malaysia calendar day, at both the client and the origin. An owner
  who opens the app the next morning has missed it entirely. Recommendation:
  widen to roughly 7 days before through 7 days after, with the day itself
  highlighted, once there is usage data. This changes the origin's
  `PetOccasionCalculator` guard and the per-day cache key, so it is not a copy
  change.
- **"First care record" in a sharing checklist.** Care records do not appear on
  the card and do not make a profile more shareable; the item lengthens the
  checklist without serving the loop. Weighted 1, so the cost is small.
- **Weighting review.** After seeing the real UX the weights hold. Photo (3) is
  correctly the joint-highest — it is the single biggest determinant of whether
  a shared card looks finished, which `MPL-GROWTH-FIX-003` reinforces.

---

# Phase P0 — Premium Foundations

## MPL-PREM-001 — Malaysia Calendar Day and Reminder Schema

**Status:** Ready · **Ships dark — sends nothing.**

**Goal.** Put the two prerequisites for reminders in place as a small, separately
reviewable change.

**Dependencies.** None.

**Likely code areas**
- New: `apps/api/MyPetLink.Api/Common/` Malaysia calendar-day helper, mirroring
  the rule in `apps/web/src/lib/careRecordStatus.ts` (existing precedent for the
  +08:00 offset: `Common/BusinessReferenceGenerator.cs:24`)
- `apps/api/MyPetLink.Api/Entities/EmailOutboxEntities.cs` —
  `RelatedCareRecordId` and a dedupe key
- `apps/api/MyPetLink.Api/Entities/Enums.cs` — append
  `EmailMessageType.CareReminder` (**append only**; values are stored as
  strings, so ordering must not change)
- `apps/api/MyPetLink.Api/Entities/AccountEntities.cs` — typed reminder
  preference columns on `OwnerProfile` (**not**
  `NotificationPreferencesJson`; see `AGENTS.md` configuration rule 12)
- `apps/api/MyPetLink.Api/Migrations` + regenerate root `migration.sql`
- `EmailTemplateSetting` seed row: disabled, `EnabledFromUtc` null

**Scope.** Backend + database. No behaviour change.

**Acceptance criteria**
1. The calendar helper is the single server-side source of "today in Malaysia"
   and agrees with `lib/careRecordStatus.ts` at every boundary.
2. A filtered unique index makes a duplicate reminder row **impossible at the
   database level**.
3. The new `EmailTemplateSetting` row is seeded disabled with a null
   `EnabledFromUtc`, so no historical backlog can ever be released.
4. Existing `EmailMessageType` values keep their stored string representation.
5. Root `migration.sql` is regenerated and applies cleanly and idempotently to
   an empty database.
6. Nothing enqueues, sends, or displays anything.

**Required tests.** Calendar-day boundary tests (UTC 15:59 vs 16:00, year
boundary, leap day). A relational test asserting the unique index rejects a
duplicate. Migration applied twice against a fresh database.

**Risk.** Medium — schema change to a table the production dispatcher reads.

**Codex effort:** **High** (schema + concurrency invariant).

---

## MPL-PREM-002 — Care Reminder Scheduling Worker

**Status:** Blocked by MPL-PREM-001

**Goal.** Enqueue due-care reminder rows exactly once per care record per
offset, reusing the existing dispatcher for delivery.

**Dependencies.** MPL-PREM-001.

**Likely code areas**
- New scheduling `BackgroundService`, modelled on
  `Services/EmailDispatchWorker.cs` and
  `Services/PaymentReservationExpiryWorker.cs`
- New enqueue method alongside `Services/EmailOutboxService.cs`
- `Services/CareRecordService.cs`, `Entities/CareMediaEntities.cs`
  (`CareRecord.DueDate`)
- `Services/EmailTemplateGate.cs` (use as-is)
- `apps/api/MyPetLink.Api/appsettings.json` — poll interval / batch size under
  the existing `Email:Dispatch` conventions
- Entitlement read from `Entities/PlanEntities.cs` `PlanLimit`

**Scope.** Backend worker + enqueue. **Delivery code is not modified.**

**Acceptance criteria**
1. Offsets are **7 days before, 1 day before, and the due day**, evaluated on the
   Malaysia calendar day, and the offset is stored on the outbox row.
2. Running the scheduler twice in the same Malaysia day produces no second row.
3. Concurrent instances produce exactly one row (constraint-enforced, not
   application-enforced).
4. Records that are archived, soft-deleted, or belong to a Memorial/Archived/
   soft-deleted pet are never enqueued.
5. Owners without the Premium entitlement are never enqueued.
6. Opted-out owners are never enqueued, and opt-out is **re-checked at
   dispatch**.
7. When the template is disabled, rows are recorded `Suppressed` with a typed
   reason — never silently dropped and never sent later.
8. A scheduler failure never blocks the existing dispatcher.
9. The worker does not log SQL statements at Information level (avoid repeating
   the `PaymentReservationExpiryWorker` noise noted in the launch audit).

**Required tests.** Idempotency across repeated runs; concurrency test asserting
one row survives; boundary tests at each offset; lifecycle exclusion tests;
entitlement and opt-out tests; suppressed-when-disabled test.

**Risk.** **High** — first system that mails customers unprompted.

**Codex effort:** **High.** → **Claude Code High review required after merge.**

---

## MPL-PREM-003 — Care Reminder Email Template

**Status:** Blocked by MPL-PREM-001

**Goal.** A branded reminder email that says enough to act on and nothing that
should not sit on a lock screen.

**Dependencies.** MPL-PREM-001. Parallel with MPL-PREM-002.

**Likely code areas**
- New renderer beside `Services/OwnerWelcomeEmailTemplateRenderer.cs` and
  `Services/PaymentConfirmedEmailTemplateRenderer.cs`
- `Services/TransactionalEmailLayout.cs` — reuse, do not fork
- `Services/EmailContracts.cs` — template data record
- `Services/EmailPreviewService.cs` — dev preview
- `docs/branding/email-design-system.md` — mandatory

**Scope.** Backend template only.

**Acceptance criteria**
1. Uses the shared transactional layout, header, footer, CTA, and brand tokens.
   No standalone email styling.
2. The subject names the pet and that care is due; it carries **no** medical
   detail.
3. Every header-bound value passes through the existing `CleanHeaderValue`
   sanitisation.
4. `TemplateDataJson` stores the minimum needed to render.
5. A one-click way to turn reminders off is present and honest.
6. Renders correctly with a missing provider, a very long pet name, and a
   very long record title.

**Required tests.** Renderer snapshot/structure tests for the three offsets;
header-injection test with newline-bearing pet name; long-value truncation.

**Risk.** Medium.

**Codex effort:** **Medium.**

---

## MPL-PREM-004 — Reminder Preferences and Premium Gate UI

**Status:** Blocked by MPL-PREM-002, MPL-PREM-003

**Goal.** Let owners see, control, and turn off reminders, and let non-Premium
owners understand what they would get — without any checkout.

**Dependencies.** MPL-PREM-002, MPL-PREM-003.

**Likely code areas**
- `apps/web/src/app/settings`, `apps/web/src/lib/ownerSettings.ts`
- `apps/web/src/services/ownerProfileService.ts`
- `apps/api/MyPetLink.Api/Controllers/OwnerProfileController.cs`
- `apps/web/src/lib/features.ts` — `NEXT_PUBLIC_CARE_REMINDERS_ENABLED`
- `apps/web/src/lib/planLimits.ts` — the Premium feature list already names
  "Care reminders"

**Scope.** Frontend + a small owner-profile endpoint.

**Acceptance criteria**
1. Reminder preference is a real, persisted, typed setting — not a disabled
   placeholder.
2. Non-Premium owners see an honest Coming Soon / Premium state with **no
   checkout, upgrade, or payment flow** (`AGENTS.md` hard rule 4).
3. Copy never promises delivery while the template gate is off.
4. Opt-out takes effect without needing a support action.
5. Fully hidden when the build flag is off.

**Required tests.** Settings component tests for entitled, non-entitled,
flag-off, and save-failure states. Service tests for the persistence path.

**Risk.** Medium — this is where the product could accidentally promise
delivery that the gate is blocking.

**Codex effort:** **Medium.**

---

# Phase P2 — Premium Depth

## MPL-PREM-005 — Document Vault API and Limits

**Status:** Ready

**Goal.** Expose the private document capability that already exists in the media
layer, with explicit, enforced limits.

**Dependencies.** None (independent of the reminder chain).

**Likely code areas**
- `apps/api/MyPetLink.Api/Services/MediaService.cs` — `ResolveTargetAsync`
  (lines 370–390 already handle `VaccinationDocument` / `MedicalDocument`),
  `IsPublicCategory` (line 736), `CreatePrivateDownloadUrlAsync` (line 237)
- `apps/api/MyPetLink.Api/Controllers/MediaController.cs`
- `apps/api/MyPetLink.Api/Entities/CareMediaEntities.cs` — `MediaFileLink`
- `apps/api/MyPetLink.Api/Entities/PlanEntities.cs` — new document limit fields
- Migration + regenerate root `migration.sql`

**Scope.** Backend + database (limits).

**Acceptance criteria**
1. Document categories **never** resolve to the public bucket; a test asserts
   `IsPublicCategory` is false for every document category.
2. Listing returns metadata only — never a durable URL.
3. Download is only ever a short-lived presigned URL from
   `CreatePrivateDownloadUrlAsync`, with its existing public/ready/deleted/bucket
   checks intact.
4. Per-pet document count and per-file size limits are enforced server-side and
   read from `PlanLimit`; **no "unlimited" path exists**.
5. Cross-owner access returns `404 not_found`, matching the existing convention.
6. Deleting a pet leaves no orphaned reachable document.

**Required tests.** Bucket-routing assertion per category; presigned-expiry
assertion; cross-owner 404; limit-exceeded rejection; content-type rejection for
a disallowed type.

**Risk.** Medium–High — private health documents.

**Codex effort:** **High.** → **Claude Code High review required after merge.**

---

## MPL-PREM-006 — Document Vault Owner UI

**Status:** Blocked by MPL-PREM-005

**Goal.** Upload, find, and retrieve a document in under ten seconds on a phone
in a vet waiting room.

**Dependencies.** MPL-PREM-005.

**Likely code areas**
- `apps/web/src/services/mediaService.ts` (already knows the document
  categories), `apps/web/src/lib/imageUpload.ts`
- New pet tab beside `apps/web/src/app/pets/[id]/records`
- `apps/web/src/components/portal/PetManagementTabs.tsx`
- `apps/web/src/lib/features.ts` — `NEXT_PUBLIC_DOCUMENT_VAULT_ENABLED`

**Scope.** Frontend only.

**Acceptance criteria**
1. Upload uses the existing presigned flow; a failure gives a calm, non-technical
   message.
2. Limits are shown before the owner hits them, reusing the tone of
   `getMemoryLimitState`.
3. Downloads open through a freshly issued short-lived URL every time — no URL
   is cached in component state or history.
4. Copy never states or implies that documents are public.
5. Usable at 375 × 812.

**Required tests.** Upload success/failure, limit-reached state, empty state,
flag-off, and download-link freshness.

**Risk.** Low–Medium.

**Codex effort:** **Medium.**

---

## MPL-PREM-007 — Vet Health Summary PDF

**Status:** Blocked by MPL-PREM-005

**Goal.** One printable page an owner can hand to a vet.

**Dependencies.** MPL-PREM-005 (so the summary can reference stored documents).

**Likely code areas**
- New renderer beside `Services/MerchantDocumentRenderer.cs`, using
  `Services/DocumentTheme.cs`
- `Services/OrderDocumentService.cs` as the ownership-scoped precedent
- `Services/CareRecordService.cs`, `Services/PetAgeCalculator.cs`
- `apps/web/src/services/orderDocuments.ts` as the frontend download precedent

**Scope.** Backend renderer + one owner action.

**Acceptance criteria**
1. Owner-scoped download only; another owner's pet returns `404 not_found`.
2. Contains pet identity, age, allergies, care notes, and care records grouped
   by type with dates and providers.
3. Lists attached documents by name and date without embedding them.
4. States plainly that it contains owner-entered information and is not a
   medical record. **No diagnosis, scoring, or advice.**
5. **No temporary link, token, QR, or email delivery** in this work package.
6. Renders correctly for a pet with zero care records.

**Required tests.** Ownership rejection; empty-record rendering; long-value
layout; PDF generated without exception for each care record type.

**Risk.** Low.

**Codex effort:** **Medium.**

---

# Phase P3 — Family Access

> Do not start this phase until Premium has shipped and been observed. It
> rewrites the authorization predicate used in 41 places across 18 services. See
> the security invariants in
> [`GROWTH_AND_PREMIUM_ROADMAP.md`](GROWTH_AND_PREMIUM_ROADMAP.md#10-security-and-privacy-review).

## MPL-PREM-008 — Family Access: Domain and Authorization

**Status:** Blocked by Phase P1 shipped

**Goal.** Introduce pet access grants and route **every** owner-scoped query
through a single shared authorization predicate — with no user-visible change.

**Dependencies.** Phase P1 shipped and stable.

**Likely code areas.** New membership entity + migration; a single new
authorization helper; then **every** service currently asserting
`OwnerUserId == userId`: `PetService.cs`, `MemoryService.cs`,
`CareRecordService.cs`, `MediaService.cs`, `OrderService.cs`,
`SmartTagService.cs`, `PaymentProofService.cs`, `OrderDocumentService.cs`,
`TagOrderInventoryAvailabilityService.cs`.

**Scope.** Backend + database. **Behaviour must be identical after this item.**

**Acceptance criteria**
1. Exactly one helper resolves "pets this principal may act on". No service
   re-implements it.
2. With no grants in the database, every existing behaviour is **byte-identical**
   to today.
3. Owner-only operations (transfer, delete pet, Smart Tags, orders, plan) are an
   explicit list, enforced centrally, and negatively tested.
4. Grants are **per-pet**; no grant can widen to another pet or to account-level
   data.
5. No endpoint accepts an owner id from the caller.
6. Every grant change is audited via `AuditLogService`.
7. A repository-wide check confirms no residual direct `OwnerUserId ==` ownership
   assertion remains outside the helper (admin query services excluded).

**Required tests.** A negative authorization matrix — {owner, co-owner,
caregiver, viewer, unrelated} × {read, write, delete, owner-only} — for pets,
moments, care records, media, orders, tags, payment proofs and documents.
Regression suite proving no-grant behaviour is unchanged.

**Risk.** **Very high** — cross-tenant data exposure.

**Codex effort:** **High.** → **Claude Code High authorization/E2E audit
required before any UI is built on top.**

---

## MPL-PREM-009 — Family Access: Invitation and Acceptance

**Status:** Blocked by MPL-PREM-008

**Goal.** Let an owner invite a specific person to a specific pet, within the
Google-only authentication constraint.

**Likely code areas.** Invitation entity + migration; invitation service; a new
`EmailMessageType` and template (reusing the outbox and shared layout);
`Services/AuthService.cs` / `Controllers/AuthController.cs` for the
sign-in-binding step.

**Acceptance criteria**
1. Invitations are single-use, expiring, bound to one email address, and
   revocable before acceptance.
2. Acceptance requires Google sign-in **as the invited address**. The flow never
   creates an account and never grants access to a different signed-in user.
3. Pending invitations count against `PlanLimit.MaxFamilyMembers`.
4. Invitation creation is rate-limited per owner and per target address.
5. The response never reveals whether the invited address has a MyPetLink
   account.
6. The invitation email exposes no pet health data and no owner phone number.
7. Every invitation lifecycle event is audited.

**Required tests.** Replay of a used token; expired token; wrong-signed-in-user;
revoked-before-acceptance; limit exceeded; rate limit; account-enumeration
resistance.

**Risk.** **Very high.**

**Codex effort:** **High.** → **Claude Code High review required.**

---

## MPL-PREM-010 — Family Access: Owner UI and Revocation

**Status:** Blocked by MPL-PREM-009

**Goal.** Make who-has-access visible and removable in one obvious place.

**Acceptance criteria**
1. Access list, invite, role change, and remove are all reachable from the pet.
2. Revocation takes effect immediately, including cached client state.
3. Roles are explained in plain language, not permission jargon.
4. A member can see which pets they were given access to and can leave.
5. Hidden entirely behind `NEXT_PUBLIC_FAMILY_ACCESS_ENABLED`.

**Risk.** Medium. **Codex effort:** **Medium.**

---

## MPL-PREM-011 — Family Access: Public and Safety Regression

**Status:** Blocked by MPL-PREM-010

**Goal.** Prove that sharing management never leaks into finder-facing or public
surfaces.

**Acceptance criteria**
1. Public Share Profile, Safety Profile, tag scan pages, and social cards expose
   no member identity, email, or count.
2. `PublicProfileSocialResponse` and `PublicSafetyContactResponse` are unchanged.
3. Owner contact shown to a finder remains the **pet owner's** configured
   contact, never a member's.
4. A revoked member appears nowhere, including in cached social cards.

**Required tests.** Full public-surface regression plus a live browser pass over
`/p`, `/q`, and `/t`.

**Risk.** High. **Codex effort:** **High.** → **Claude Code High review
required.**

---

# Later — Not Scheduled

| ID | Title | Note |
| --- | --- | --- |
| MPL-LATER-001 | Advanced Safety | Scan notification email (reuses outbox); enforce `PlanLimit.ScanHistoryDays` as real deletion; approximate-location-only default; multiple emergency contacts. Basic finder contact stays Free. |
| MPL-LATER-002 | Recurring Care Schedules | Must land on the proven MPL-PREM-002 dedupe path. Generate the **next** occurrence only — never a horizon of rows. |
| MPL-LATER-003 | Premium profile customisation | Read `PlanLimit.AllowsAdvancedThemes`; extend `lib/petProfileThemes.ts`. Cheap filler, never the headline. Custom profile URL is **not** included — see roadmap. |
| MPL-LATER-004 | Weight tracking + trends | Requires a new measurement domain; no weight field exists today. Owner-entered facts only, no diagnosis. |
| MPL-LATER-005 | Year in Review | Revisit when the account base has ≥1 year of Moments. Reuses share-card variants. |

---

# Recommended Agent Assignment

| Work package | Agent | Effort | Claude Code review after? |
| --- | --- | --- | --- |
| MPL-GROWTH-001 | Codex | Medium | No |
| MPL-GROWTH-002 | Codex | Medium | No |
| MPL-GROWTH-003 | Codex | **High** | Optional (edge caching + privacy) |
| MPL-GROWTH-004 | Codex | Medium | No |
| MPL-GROWTH-FIX-001 | Codex | Medium | No |
| MPL-GROWTH-FIX-002 | Codex | Medium | No — but Product approves copy/placement first |
| MPL-GROWTH-FIX-003 | Codex | Medium | No — verify photo-bearing cards on staging |
| MPL-GROWTH-FIX-004 | Codex | Medium | No |
| MPL-GROWTH-FIX-005 | Codex | Medium | No |
| MPL-PREM-001 | Codex | **High** | **Yes** — schema + uniqueness invariant |
| MPL-PREM-002 | Codex | **High** | **Yes** — worker scheduling + dedupe |
| MPL-PREM-003 | Codex | Medium | No |
| MPL-PREM-004 | Codex | Medium | No |
| MPL-PREM-005 | Codex | **High** | **Yes** — private file authorization |
| MPL-PREM-006 | Codex | Medium | No |
| MPL-PREM-007 | Codex | Medium | No |
| MPL-PREM-008 | Codex | **High** | **Yes — mandatory, before any UI** |
| MPL-PREM-009 | Codex | **High** | **Yes — mandatory** |
| MPL-PREM-010 | Codex | Medium | No |
| MPL-PREM-011 | Codex | **High** | **Yes — mandatory** |

**Codex High** is reserved for authorization, worker scheduling, cross-layer
concurrency, schema/uniqueness invariants, and security-sensitive sharing.
**Codex Medium** covers UI, straightforward API work, templates, and analytics
instrumentation.

**Claude Code High review points, stated plainly:**

```text
Care Reminders (MPL-PREM-001, -002)
  → Codex High implementation
  → Claude Code High review: dedupe, scheduling, gate, rollout safety

Document Vault API (MPL-PREM-005)
  → Codex High implementation
  → Claude Code High review: private-bucket routing + presigned access

Family Access (MPL-PREM-008, -009, -011)
  → Codex High implementation
  → Claude Code High authorization/E2E audit after EACH of the three
```
