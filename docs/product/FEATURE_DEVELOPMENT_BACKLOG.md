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
  MPL-GROWTH-001   Profile Completion                    Ready
  MPL-GROWTH-002   Share Card renderer variant (API)     Ready
  MPL-GROWTH-003   Share Card edge + owner UI            Blocked by 002

Phase G2 — Seasonal reach
  MPL-GROWTH-004   Birthday / Adoption card variants     Blocked by 003

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

**MPL-GROWTH-001 is the recommended next task.** It has no dependencies, no
backend surface, and no rollback risk.

---

# Phase G1 — Free Growth

## MPL-GROWTH-001 — Profile Completion

**Status:** Ready · **Full spec:**
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

**Status:** Ready

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

**Status:** Blocked by MPL-GROWTH-002

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

**Status:** Blocked by MPL-GROWTH-003

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
