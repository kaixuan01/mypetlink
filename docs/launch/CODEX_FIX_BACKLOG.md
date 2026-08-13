# MyPetLink — Codex Fix Backlog

**Date:** 2026-08-13 · **Source:** [`SOFT_LAUNCH_READINESS.md`](SOFT_LAUNCH_READINESS.md)
All file paths below were confirmed to exist during the audit.

---

## Recommended Codex Execution Order

Batches are derived from the actual findings. The owner-managed migration artefacts are excluded from Codex work and are not a Codex launch blocker.

```text
Batch 1 — Finder safety                          MPL-SL-P0-001
Batch 2 — Measurement (unblocks all later learning) MPL-SL-P1-001
Batch 3 — Retention correctness                  MPL-SL-P1-002, MPL-SL-P1-005
Batch 4 — Launch-day content + activation        MPL-SL-P1-003, MPL-SL-P1-004, MPL-SL-P1-007
Batch 5 — Hardening and hygiene (post-launch)    MPL-SL-P2-001 … P2-004
```

Batch 2 precedes Batches 3 and 4 deliberately: instrument before changing onboarding, so the effect of those changes is measurable rather than assumed.

`MPL-SL-P1-006` (Google-only sign-in) is a product decision, not a code task, and is excluded from the batches.

---

# P0

## MPL-SL-P0-001 — Safety Profile must not instruct a finder to use contact options it does not show

**Status (2026-08-13): Implemented — awaiting final launch verification.** The finder page now shows contact instructions only when a valid, owner-approved phone or WhatsApp action is available, and otherwise renders a clear no-contact fallback. Component tests, the full web test suite, the production web build, and mobile browser checks of `/q`, `/t`, and `/n` pass.

**Problem.** The finder-facing Safety Profile renders the unconditional sentence "Please contact the owner directly using one of the options below" (or, in Lost Mode, "please contact the owner immediately"), while every contact CTA beneath it is conditionally rendered. When a pet has no usable contact method, the finder sees instructions pointing at nothing.

**User impact.** Someone holding a lost pet is told to make contact and given no way to do it. The homepage advertises "Basic QR download" as a free feature, so a printed QR can lead directly to this dead end.

**Reproduction (verified 2026-08-13).**
1. Take a pet whose safety settings have `QrSafetyEnabled = 1` and no stored phone/WhatsApp — e.g. safety code `stysjmj4bayjd23ff7jva` ("Milo") in the dev database.
2. `GET /api/v1/public/safety/stysjmj4bayjd23ff7jva` → `"contact": null`.
3. Open `/q/stysjmj4bayjd23ff7jva`.
4. Observe the instruction sentence with no contact buttons below it.

**Expected.** When no contact method is available, the page replaces the instruction with an honest state — the pet is registered with MyPetLink but the owner has not published a contact method — and offers whatever fallback exists (for example, guidance to keep the pet safe and check back, or a non-PII relay if one is added later). Lost Mode should be equally explicit.

**Current.** Instruction copy renders unconditionally; all CTAs render conditionally; no `else` branch exists.

**Scope.** Frontend. Optionally a small backend addition to expose an explicit "no contact available" signal rather than inferring it from `contact === null`.

**Relevant code.**
- `apps/web/src/components/marketing/QrSafetyPageView.tsx:167` — instruction copy
- `apps/web/src/components/marketing/QrSafetyPageView.tsx:198-236` — conditional CTA block
- `apps/web/src/lib/safetyProfile.ts` — already defines the "Contact Update Needed" concept; reuse its vocabulary
- `apps/api/MyPetLink.Api/Services/QrSafetyService.cs:90-99` — where `contact` becomes `null`
- `apps/api/MyPetLink.Api/DTOs/PublicDtos.cs:77-108`

**Acceptance criteria.**
1. With `contact === null`, no sentence instructs the finder to use options below.
2. A clear, non-technical message explains the situation without exposing owner PII or internal wording.
3. Lost Mode with no contact method is also handled explicitly.
4. Existing behaviour is unchanged when phone and/or WhatsApp are present.
5. Memorial pets (which force `contact: null`) continue to render their memorial state, not the new message.

**Required tests.** Unit/component tests for `QrSafetyPageView` covering: no contact; WhatsApp only; phone only; both; Lost Mode with no contact; Memorial. One browser check of `/q/{code}` for a contactless pet.

**Dependencies.** None. **Risk.** Low — additive rendering branch.

---

## MPL-SL-P0-002 — Resolve the duplicate and stale `migration.sql`

**Status (2026-08-13): Owner-managed — excluded from the Codex launch backlog.** The repository owner generates and manages both migration SQL artefacts. Codex must not investigate, modify, move, delete, rename, or regenerate them. This finding is retained as audit history only and is not a Codex launch blocker.

**Problem.** Two different `migration.sql` files are tracked in git. Root `migration.sql` (2026-08-11, 6086 lines, md5 `6664d749…`) is current. `database/migration.sql` (2026-08-03, 4008 lines, md5 `ae17fc6f…`) is roughly 8 migrations behind — yet it lives in the directory an operator would naturally search, whose `README.md` still claims "Database scripts are **not implemented yet**."

**User impact.** Applying the stale script produces a schema missing recent migrations. At production setup this is the least recoverable moment for a data-integrity error.

**Reproduction.**
```bash
git ls-files migration.sql database/migration.sql
md5sum migration.sql database/migration.sql
```

**Expected.** Exactly one authoritative deployable script, in the location the documentation names, with the other removed or unmistakably marked historical. `database/README.md` must stop contradicting its own contents.

**Current.** Two tracked scripts disagree; `docs/architecture/configuration-governance.md:213` names the root file, but nothing warns a reader inside `database/`.

**Scope.** Repository hygiene + database deployment documentation. **No schema change.**

**Relevant code.**
- `migration.sql` (root, authoritative)
- `database/migration.sql` (stale)
- `database/README.md`
- `docs/architecture/configuration-governance.md:213-219,271`
- `docs/deployment/environment-variables.md:91`

**Acceptance criteria.**
1. Only one deployable `migration.sql` is reachable without ambiguity.
2. `database/README.md` accurately describes what the directory holds.
3. Deployment docs point at the surviving file and state how to regenerate it after a new EF migration.
4. The surviving script remains idempotent and applies cleanly to an empty database.

**Required tests.** Apply the surviving script to a fresh empty database with `sqlcmd -I`; confirm success and that `__EFMigrationsHistory` matches `apps/api/MyPetLink.Api/Migrations`. Re-run to confirm idempotency.

**Dependencies.** None.
**Risk.** Medium — touches database deployment. **Deleting a migration artefact needs explicit human sign-off; this audit deliberately did not remove it.**

---

# P1 — Recommended Before Soft Launch

## MPL-SL-P1-001 — Add minimum funnel analytics

**Status (2026-08-13): Implemented in code; production configuration remains.** A provider-neutral, runtime-allowlisted event layer and optional GA4 adapter now cover page views and the reliably measurable activation, share, care, Smart Tag, and order actions. Analytics remains inert until Operations configures `NEXT_PUBLIC_GA_MEASUREMENT_ID` and rebuilds. Signup events are excluded until authentication can distinguish a new account from a returning owner; WhatsApp sharing is excluded until there is an explicit WhatsApp share control.

**Original problem.** No analytics existed. The initial search for `gtag`, `posthog`, `mixpanel`, `plausible`, `segment` and `dataLayer` returned zero matches.

**User impact.** Indirect but decisive: a soft launch exists to produce evidence. Without instrumentation, drop-off is unknowable and every later change is guesswork.

**Implemented event set.** A single privacy-respecting adapter, with the smallest reliably measurable funnel:

`page_view` · `pet_create_started` · `pet_created` · `public_profile_viewed` · `share_clicked` · `share_link_copied` · `moment_created` · `care_record_created` · `smart_tag_viewed` · `order_started` · `order_submitted`

**Scope.** Frontend, plus a privacy-policy update.

**Relevant code.**
- `apps/web/src/app/layout.tsx` — script/provider mount point
- `apps/web/src/lib/features.ts` — follow the existing `readPublicBoolean` flag pattern
- `apps/web/src/components/portal/PetProfileForm.tsx:693` — `pet_created`
- `apps/web/src/components/portal/PetMomentForm.tsx` — `moment_created`
- `apps/web/src/components/portal/RecordsManager.tsx` — `care_record_created`
- `apps/web/src/components/marketing/PublicSharePetProfile.tsx` — `public_profile_viewed`
- `apps/web/src/components/marketing/QrSafetyPageView.tsx` — `safety_profile_viewed`
- `apps/web/src/app/privacy/page.tsx` — must describe what is collected

**Acceptance criteria.**
1. Events carry **no identifiers**. Metadata is limited to fixed source/surface/type categories and a bounded item count; names, contact details, codes, references, care content, filenames, and free text are prohibited.
2. Analytics is behind a `NEXT_PUBLIC_*` flag and is inert when unset, so the static export stays clean.
3. No analytics call blocks or breaks a user action if the provider fails to load.
4. The privacy policy reflects the chosen provider (note PDPA obligations for a Malaysian launch).
5. Events fire once per action — no duplicates from React re-render or effect re-invocation.

**Required tests.** Unit tests asserting each helper emits the right event name and that payloads contain no PII. One browser pass confirming single emission for pet creation and share.

**Dependencies.** None — **do first among P1s**, so later onboarding changes are measurable. **Risk.** Low.

---

## MPL-SL-P1-002 — Add an `overdue` care-record state

**Status (2026-08-13): Implemented and verified.** Care records now derive `overdue` before the current Malaysia calendar day, `due-soon` from today through day 30 inclusive, `upcoming` after day 30, and `complete` when no next due date exists. The dashboard shows at most one most-recent overdue item before the nearest current/future items, then uses additional recent overdue items only to fill unused slots. This keeps missed care visible without allowing the oldest records to crowd out imminent care. The full Care Records list keeps its existing history ordering.

The API owns the status returned for authenticated care records. `apps/web/src/lib/careRecordStatus.ts` is the single frontend implementation used by static/local fallback records and public-profile records, where no API-derived status is available. This is a derived presentation rule, not a deployment or business setting, so it does not add configuration ownership or a schema migration.

**Problem.** `deriveStatus` returns `"due-soon"` for any due date ≤ today + 30 days with **no lower bound**. A record years overdue is labelled "Due soon" indefinitely, and the dashboard sorts due dates ascending, pinning the stalest items to the top. The rule is duplicated in frontend and backend.

**User impact.** The only retention surface in the product degrades into permanent noise, and genuinely urgent items become indistinguishable from long-abandoned ones.

**Reproduction (verified 2026-08-13).** Create a care record with `date = 2024-01-10`, `dueDate = 2024-06-10` via `POST /api/v1/pets/{petId}/care-records`. Response returns `derivedStatus: "due-soon"` despite being ~26 months past.

**Expected.** A distinct `overdue` state for due dates before today, visually differentiated on the dashboard, with sorting that surfaces actionable items rather than the oldest. One authoritative implementation of the rule.

**Previous.** `dueDate <= today+30 ? "due-soon" : "upcoming"` in both layers; `"complete"` only when `dueDate` is null.

**Scope.** Frontend + backend.

**Relevant code.**
- `apps/api/MyPetLink.Api/Services/CareRecordService.cs:469-478` — `DeriveStatus` / `GetMalaysiaToday`
- `apps/web/src/services/recordService.ts:338-356` — `toFrontendStatus` / `deriveStatus`
- `apps/web/src/types.ts:220` — status union
- `apps/web/src/services/apiDtos.ts:291` — `derivedStatus`
- `apps/web/src/components/portal/DashboardClient.tsx:131-136` (sort), `:608-633` (`ReminderItem`), `:707-717` (labels)
- `apps/web/src/components/portal/RecordCard.tsx:35-38`

**Acceptance criteria.**
1. `dueDate < today` (Malaysia time) yields `overdue`.
2. `today ≤ dueDate ≤ today+30` yields `due-soon`; beyond that, `upcoming`.
3. Backend and frontend agree; the threshold is defined in one place per layer with the duplication documented, per `docs/architecture/configuration-governance.md`.
4. The dashboard visually distinguishes overdue and does not let stale items permanently crowd out actionable ones.
5. Owner-facing labels stay consumer-friendly.

**Required tests.** Backend unit tests at the boundaries (yesterday, today, +30, +31) including the Malaysia offset; frontend unit tests for `deriveStatus`; a `DashboardClient` test asserting ordering and labelling with a mix of overdue and upcoming records.

**Dependencies.** None. **Risk.** Low.

---

## MPL-SL-P1-003 — Stop the sample-experience CTAs from dead-ending

**Resolved in code and verified on 2026-08-13.** `/sample` is now a stable,
self-contained guided experience. An approved Featured Sample Pet may personalize
public-only fields, while missing, invalid, or unavailable configuration falls
back to the intentional static sample instead of a holding card. The page has one
anonymous-safe create-profile CTA. Public Share Profile and Safety Profile entry
points use centralized section routes, also resolving MPL-SL-P1-007 without
linking to runtime-selected dynamic pet routes that are not guaranteed by the
static export.

**Problem.** Four homepage links point to `/sample`, which renders "The Sample Experience is being prepared" until an admin configures a sample pet.

**User impact.** The primary "show me what this is" path for a first-time visitor leads nowhere. The wording is honest, but the conversion path is lost.

**Reproduction.** With no featured sample pet configured, load `/` and follow "Explore Sample Profile".

**Expected.** No visible link leads to an empty page, regardless of optional sample-pet configuration.

**Scope.** Frontend, plus a launch-checklist entry.

**Relevant code.**
- `apps/web/src/app/sample/page.tsx`
- `apps/web/src/data/publicSample.ts`, `apps/web/src/data/samplePet.ts`
- `apps/api/MyPetLink.Api/Controllers/SampleExperienceController.cs`
- `apps/api/MyPetLink.Api/Services/PublicSampleExperienceService.cs`
- `apps/web/src/app/admin/sample-experience/page.tsx`
- `docs/deployment/release-checklist.md` — add the prerequisite

**Acceptance criteria.**
1. With no sample configured, no homepage CTA leads to an empty sample page.
2. With a sample configured, all sample CTAs work.
3. The release checklist verifies both optional personalized and generic states.

**Required tests.** Component tests for the homepage in both states; one browser check per state. **Dependencies.** None. **Risk.** Low.

---

## MPL-SL-P1-004 — Give the post-creation screen one primary action

**Resolved in code and verified on 2026-08-13.** The success state now has one
visually dominant action: **View {pet}'s Profile**. This gives the owner an
immediate reward and leads naturally to the existing share action on the Public
Share Profile. **Add {pet}'s First Moment** is the single secondary activation
action. Share-link controls, Safety Profile, physical-tag ordering, pet
management, and Dashboard buttons no longer compete in the success action
group. If the Public Share Profile is unavailable, Add First Moment becomes the
primary action and Manage Pet is secondary. Missing-contact guidance remains as
a separate card below the activation decision.

**Problem.** After a pet is created, up to five CTAs render at similar weight — View Public Profile, View Safety Profile, Order Physical Tag, Manage {pet}, Go to Dashboard — stacking into a long column on mobile. **"Add your first Moment" is absent**, despite Moments being the core retention loop.

**User impact.** The highest-leverage activation moment diffuses attention across five choices, and the action most likely to create lasting value is not offered.

**Expected.** One visually dominant primary CTA, with the rest demoted to secondary. Given the product direction, the primary should be either "Add your first Moment" or "View {pet}'s public profile"; the other becomes secondary. Order Physical Tag should not compete while tag ordering is disabled.

**Previous implementation.** `PetProfileForm.tsx` rendered the CTA row with near-equal prominence.

**Scope.** Frontend.

**Relevant code.**
- `apps/web/src/components/portal/PetProfileForm.tsx:900-966`
- `apps/web/src/lib/routes.ts` — `ownerRoutes.petMomentNew` (do not hardcode routes)
- `apps/web/src/components/ui/CTAButton.tsx`
- `apps/web/src/lib/features.ts`

**Acceptance criteria.**
1. Exactly one primary CTA; all others visually secondary.
2. A route to add the first Moment is present.
3. On a 375px viewport the primary CTA is reachable without excessive scrolling.
4. Feature-flagged CTAs stay hidden when their flags are off.
5. Owner contact setup guidance continues to appear when contact is missing.

**Required tests.** Component tests for CTA hierarchy and flag combinations; a 375px browser check. **Dependencies.** Best sequenced after `MPL-SL-P1-001` so the change is measurable. **Risk.** Low.

---

## MPL-SL-P1-005 — Remove promises of reminders that are not delivered

**Resolved in code and verified on 2026-08-13.** Add/Edit Care Record helpers
and frontend/API validation now direct owners to use the next due date to track
future care, without implying that MyPetLink will contact them. The dashboard
labels the same data as **Care due dates**, and the Terms refer to due-date
information rather than active reminders. Existing overdue, due-today,
due-soon, and upcoming status behavior is unchanged. References that remain on
Home, Pricing, and Owner Settings are explicitly marked Coming Soon/Later and
disabled where interactive controls are shown.

**Problem.** Care-record validation messages reference reminders — e.g. "Use Next Vaccination Due Date for future reminders." No reminder is ever delivered; no reminder job or email exists.

**User impact.** Sets an expectation the product does not meet, and erodes trust precisely where the product asks for ongoing data entry.

**Expected.** Copy describes what the field actually does (recording the next due date, shown on the dashboard) without promising notification, until reminder delivery exists.

**Scope.** Backend validation copy; check frontend equivalents.

**Relevant code.**
- `apps/api/MyPetLink.Api/Services/CareRecordService.cs:320-338`
- `apps/web/src/lib/careRecordTerminology.ts`
- `apps/web/src/components/portal/RecordsManager.tsx:213-217`

**Acceptance criteria.**
1. No owner-facing string implies a notification will be sent.
2. Copy stays consumer-friendly and free of internal wording, per `AGENTS.md`.
3. Homepage "Reminders coming soon" stays as-is — it is accurate.

**Required tests.** Update existing care-record validation tests to the new strings. **Dependencies.** None. **Risk.** Low.

---

## MPL-SL-P1-006 — Decide explicitly on Google-only sign-in *(decision, not a code task)*

Google is the only authentication method; there is no email OTP, password, or Apple option, and no fallback if Google Sign-In fails to load. For a Malaysian consumer launch this constrains the addressable audience and creates a single point of failure at the front door.

No implementation is proposed here. The decision needed is whether soft launch proceeds Google-only (acceptable for a controlled launch) or whether a second method is scheduled before broader release. Relevant code: `apps/api/MyPetLink.Api/Controllers/AuthController.cs`, `apps/web/src/components/auth/LoginPanel.tsx`.

---

## MPL-SL-P1-007 — Differentiate the two sample CTAs

**Resolved with MPL-SL-P1-003 on 2026-08-13.** The two homepage actions now use
centralized `/sample` section links and land on content matching their labels.

"Explore Sample Profile" and "View Sample Safety Profile" both link to `/sample`, promising the shareable page and the finder page respectively while delivering the same destination. Either deep-link each to its own sample view or align the labels.

**Relevant code.** `apps/web/src/components/marketing/` (homepage hero and sample sections), `apps/web/src/app/sample/page.tsx`, `apps/web/src/lib/routes.ts`.
**Acceptance criteria.** Each CTA lands on content matching its label; labels never over-promise. **Risk.** Low. Fold into `MPL-SL-P1-003`.

---

# P2 — After Soft Launch

## MPL-SL-P2-001 — Rate-limit anonymous scan-location consent
`POST /api/v1/public/tags/{tagCode}/scan-location-consent` accepts anonymous writes with no rate limit, while sibling GETs use `SmartTagRateLimitPolicies.PublicTagScan`. Apply an appropriate policy.
`apps/api/MyPetLink.Api/Controllers/TagScanController.cs:64-72`; `Program.cs:89-138`. **Risk.** Low.

## MPL-SL-P2-002 — Rate-limit authentication endpoints
`/api/v1/auth/google` and `/api/v1/auth/refresh` have no rate limiting. Add a fixed-window policy to blunt token-grinding and abuse.
`apps/api/MyPetLink.Api/Controllers/AuthController.cs`; `Program.cs:89-138`. **Risk.** Low.

## MPL-SL-P2-003 — Reduce reservation-worker log noise
`PaymentReservationExpiryWorker` causes a full SQL statement to be logged at Information level on every poll, which will dominate production logs. Lower EF command logging in production or raise the poll interval.
`apps/api/MyPetLink.Api/Services/PaymentReservationExpiryWorker.cs`; `appsettings.json` logging section. **Risk.** Low.

## MPL-SL-P2-004 — Remove dead configuration from `.env.example`
**Resolved in the production-configuration audit.** Unused Supabase,
future-payment-provider, and support-number placeholders were removed. The
example now contains only values read by current web code or deployment tooling.
`apps/web/.env.example`; cross-check `docs/deployment/environment-variables.md`. **Risk.** Low.

## MPL-SL-P2-005 — Consider edge social previews for Lost Mode safety pages
`public/_routes.json` includes only `/p/*` and `/social/pets/*`, so sharing a Lost Mode `/q/:safetyCode` produces generic previews — exactly when reach matters most. Requires a deliberate privacy decision, since safety pages are contact-bearing.
`apps/web/public/_routes.json`; `apps/web/functions/`; `docs/deployment/dynamic-social-previews.md`. **Risk.** Medium (privacy-sensitive).

## MPL-SL-P2-006 — Increase footer tap targets on mobile
Eight homepage footer links measure ~20px tall at 375px, below a comfortable 40px target.
`apps/web/src/components/layouts/` footer component. **Risk.** Low.

---

# Retention Candidates (not yet scheduled)

Recorded so they are not rediscovered later. All build on infrastructure that already exists.

| Candidate | Value | Complexity | Depends on | When |
| --- | --- | --- | --- | --- |
| Care reminder email | High — the missing return trigger | Medium | `EmailOutboxService`, `EmailDispatchWorker`, `Email:Enabled`, P1-002 | After launch |
| Birthday / adoption anniversary email | High — emotional, data already stored (`Birthday`, `AdoptionDay`) | Low–Medium | Same email stack | After launch |
| Profile completion checklist | Medium–High activation | Medium | P1-001 for measurement | After launch |
| Promote the existing Life Timeline | Medium — already built, under-surfaced | Low | None | With P1-004 |

**Do not build a separate Milestones feature.** `MomentType` already includes Birthday, Adoption Day, First Day Home and Achievement, and `showInLifeTimeline` / `timelineNote` already drive `/pets/:id/timeline`.
