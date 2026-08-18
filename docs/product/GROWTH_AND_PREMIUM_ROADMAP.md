# MyPetLink — Growth and Premium Roadmap

**Date:** 2026-08-17 · **Branch inspected:** `main` @ `a06ab48`
**Method:** repository inspection of `apps/web`, `apps/api`, `apps/web/edge`,
`apps/web/functions`, and existing product/launch documentation. Every code path
named below was opened and confirmed during this planning pass.

This is the canonical planning document for the **post-soft-launch** product
phase. Implementation-ready work items live in
[`FEATURE_DEVELOPMENT_BACKLOG.md`](FEATURE_DEVELOPMENT_BACKLOG.md).

It answers one question: **what should we build next, in what order, and how
does each feature fit the architecture that already exists?**

---

## 1. Executive Summary

MyPetLink is not missing features. It is missing **loops**.

The repository already contains a working plan/entitlement model, a transactional
email outbox with a background dispatcher, a two-level email gate, private R2
storage with per-category upload rules, care records with due dates and derived
overdue/due-soon status, an edge social-card pipeline, QuestPDF document
rendering, and consistently owner-scoped authorization. What it does not contain
is anything that **brings a user back** or that **converts attention into
reach**. Every return visit today depends on the owner spontaneously
remembering, and every share is a plain link.

That produces a clear direction:

1. **Free work should convert the existing profile into shareable artefacts and
   guided completion.** Cheap, no new domain, no worker, immediate acquisition
   and activation effect.
2. **The first Premium capability should be Automatic Care Reminders**, because
   it is the only proposed feature where roughly 70% of the machinery — outbox,
   dispatcher, retry, lease, template gate, branded layout — is already built,
   tested, and running in production.
3. **Family Access is the highest-risk item in the entire backlog** and must not
   be scheduled early. It changes the single security invariant the codebase
   currently relies on in 41 places.

### The strategy hypothesis, evaluated

The proposed Free/Premium split holds, with **one correction**.

| Proposed | Verdict |
| --- | --- |
| Free drives acquisition, activation, sharing, attachment, basic safety | **Confirmed.** This is what the code is already good at. |
| Premium monetizes automation, collaboration, storage, advanced safety, insights, convenience | **Confirmed with one exception.** |

**The correction: "Storage" is a weak Premium pillar on its own, and "Insights"
is not a pillar at all yet.**

- Storage limits already exist and are already enforced (`PlanLimit.MaxPets`,
  `MaxMemoriesPerPet`, enforced in `PetService.cs:527`, `MemoryService.cs:268`).
  Selling "more of the same" is the weakest possible upgrade reason. Document
  Vault is worth building not because it is storage but because it is
  **retrieval under pressure** — the vet appointment, the boarding kennel, the
  border crossing. Position and build it that way.
- Insights (Weight Trends, Year in Review) have no data to be insightful about
  yet. There is no weight field anywhere in the domain, and Year in Review over
  a first-year user base produces near-empty cards. Both are correctly placed
  late.

The pillar that the current strategy **under-weights** is **automation**, which
is also the cheapest to build here. Reminders should carry the Premium launch
almost alone.

---

## 2. Free vs Premium Boundary — Final Recommendation

Classification legend: **FREE** · **PREMIUM** · **COMING LATER** · **DO NOT
BUILD YET**.

### Already shipped — must stay Free

These are protected. Nothing in this roadmap moves them behind a paywall.

| Capability | Class | Where it lives |
| --- | --- | --- |
| Pet profile (up to plan limit) | FREE | `PetService.cs` |
| Public Share Profile `/p/:slug` | FREE | `PublicProfileService.cs` |
| Social card / OG preview | FREE | `apps/web/edge/publicProfileEdge.ts` |
| Moments + Life Timeline | FREE | `MemoryService.cs`, `lib/petTimeline.ts` |
| Care Records + due-date tracking | FREE | `CareRecordService.cs`, `lib/careRecordStatus.ts` |
| Safety Profile `/q/:safetyCode` | FREE | `QrSafetyService.cs` |
| Lost Mode | FREE | `Pet.LostModeEnabled` |
| Basic QR download | FREE | `qrcode` in `apps/web` |
| Finder contact (phone/WhatsApp, per-toggle) | FREE | `PublicSafetyContactResponse` |

### Proposed capabilities

| # | Capability | Class | Reasoning |
| --- | --- | --- | --- |
| F1 | Profile Completion | **FREE** | Activation mechanic. Paywalling it would be self-defeating. |
| F2 | Pet Share Card | **FREE** | Acquisition engine. Each share is a free ad. |
| F3 | Birthday / Adoption Share Card | **FREE** | Same engine, seasonal trigger. |
| F4 | Year in Review | **FREE**, but **later** | Needs ≥1 year of real data to be worth generating. |
| P1 | Automatic Care Reminders | **PREMIUM** | Genuine automation and ongoing operational cost. The *data* stays Free. |
| P2 | Family / Caregiver Access | **PREMIUM** | Collaboration, per-seat value, real authorization work. |
| P3 | Document Vault | **PREMIUM** | Private storage + retrieval; existing `MaxCareRecords`-style limits apply. |
| P4 | Vet Health Summary (PDF) | **PREMIUM** | Depends on Premium data density. |
| P4b | Temporary Vet Link | **COMING LATER** | Time-boxed public token — new attack surface, defer past MVP. |
| P5a | Scan notification email | **PREMIUM** | Automation, same outbox. |
| P5b | Extended scan history (>N days) | **PREMIUM** | `PlanLimit.ScanHistoryDays` already models exactly this. |
| P5c | Finder approximate-location history | **PREMIUM** | `PlanLimit.AllowsFoundReports` already models exactly this. |
| P5d | Multiple emergency contacts | **PREMIUM** | Additive; one contact stays Free. |
| P5e | **Basic finder contact** | **FREE — protected** | Non-negotiable safety floor. |
| P6 | Recurring Care Schedules | **PREMIUM**, later | Belongs *after* reminders, not inside them. |
| P7 | Weight / Health Trends | **PREMIUM**, later | Requires a new measurement domain that does not exist. |
| P8 | Premium Profile Customisation | **PREMIUM**, cheap support benefit | `PlanLimit.AllowsAdvancedThemes` already exists. Never the headline. |
| — | Custom profile URL | **DO NOT BUILD YET** | Collides with `publicCode` uniqueness, slug parsing (`parsePublicProfileParam`), edge slug validation, and the social-card cache key. High blast radius, low value. |
| — | Explore feed, likes, comments, following, chat | **DO NOT BUILD YET** | Already ruled out in `SOFT_LAUNCH_READINESS.md` P3. Unchanged. |
| — | GPS / BLE tracking | **COMING LATER** | Existing product rule. Unchanged. |

### The two ambiguous calls, explained

**Care Reminders as Premium.** There is a real argument that reminding an owner
about a rabies booster is a safety feature and should be Free. The distinction
this roadmap draws: **the due-date data, the overdue badge, and the dashboard
list stay Free forever.** What Premium buys is *delivery* — MyPetLink reaching
out to you. That is honest (it costs us money per message), it is legible to a
customer, and it leaves the safety-critical information visible to everyone who
opens the app. If reminders later prove to be the single strongest retention
lever, a limited Free allowance (e.g. overdue-only, one message) is a clean
follow-up concession that does not require re-architecture.

**Document Vault as Premium.** Vaccination and medical document upload already
*exists* in the API (`MediaUploadCategory.VaccinationDocument`,
`MedicalDocument` → private bucket, `MediaService.cs:370-390`) with no UI. That
means we are not taking anything away — we are surfacing an unbuilt capability
directly into Premium. Attaching **one** document to a care record could
reasonably be Free as a taste; a *vault* (browse, categorise, retrieve, share to
vet) is Premium.

---

## 3. Architecture Reuse Map

Every row was verified against the current tree.

| Proposed feature | Existing capability reused (file) | New backend? | New DB? | New worker? | New UI? |
| --- | --- | --- | --- | --- | --- |
| **F1 Profile Completion** | `Pet` DTO already carries every field (`apps/web/src/types.ts:59`); dashboard already fetches moments + records for all active pets (`DashboardClient.tsx:108`); `OwnerContactSetupCard.tsx` is the existing single-item nudge | **No** | **No** | No | Yes — one `lib/` module + one card |
| **F2 Pet Share Card** | `PublicProfileSocialCardRenderer.cs` (SkiaSharp, 1200×630, in-memory cache, in-flight dedupe); `GET /api/v1/public/pets/{slug}/social-card.jpg`; Cloudflare Pages Function `functions/social/pets/[slug].ts` + `edge/publicProfileEdge.ts` (version-keyed cache, host allowlist, JPEG magic-byte check); `ShareProfileLink.tsx` (`navigator.share`, clipboard fallback) | Small — a card **variant** parameter | **No** | No | Yes — share sheet + save |
| **F3 Birthday / Adoption Card** | Everything F2 uses, plus `Pet.Birthday`, `Pet.AdoptionDay`, `PetAgeCalculator.cs`, `MomentType` Birthday / Adoption Day / First Day Home, `lib/petTimeline.ts` | Variant only | **No** | **No** | Yes — dashboard moment card |
| **P1 Care Reminders** | `EmailOutbox` + `EmailOutboxService.cs` (dedupe by relation, `MaxAttempts`, `NextAttemptAt`, `LockToken`/`LockedUntil`); `EmailDispatchWorker.cs` (claim-batch, visibility timeout, bounded concurrency); `EmailTemplateGate.cs` (two-level AND gate + `EnabledFromUtc` backlog guard); `TransactionalEmailLayout.cs`; `CareRecord.DueDate`; `lib/careRecordStatus.ts` Malaysia-day rule; `OwnerProfile.NotificationPreferencesJson` | Yes — enqueue service + template renderer | Yes — `RelatedCareRecordId` + dedupe key on `EmailOutbox`; new `EmailMessageType` | **Yes** — one scheduling `BackgroundService` (dispatch worker already exists) | Yes — reminder preferences |
| **P2 Family Access** | `User`/`OwnerProfile`/`ExternalLogin` (Google-only); the `OwnerUserId ==` scoping pattern used in 41 places across 18 services; `AuditLogService.cs`; `PlanLimit.MaxFamilyMembers` **already exists** | Yes — substantial | Yes — membership + invitation tables | No | Yes |
| **P3 Document Vault** | `MediaFile`/`MediaFileLink`; `MediaUploadCategory.VaccinationDocument` / `MedicalDocument`; private bucket routing (`IsPublicCategory`, `MediaService.cs:736`); `CreatePrivateDownloadUrlAsync` (presigned, 5 min, bucket-verified, ownership-scoped); `UploadRules.Documents`; `MediaOwnerType.CareRecord` / `.Pet` | Small — listing + metadata endpoints | Small — document type/label, or reuse `MediaFileLink` | No | Yes |
| **P4 Vet Health Summary** | QuestPDF 2026.6.1; `OrderDocumentService.cs`; `MerchantDocumentRenderer.cs`; `DocumentTheme.cs`; `EmailAttachmentResolver.cs`; `CareRecord` + `Pet` data | Yes — one renderer | No (Option A) | No | Yes — one action |
| **P5 Advanced Safety** | `TagScan` (source, geo, consent flag, device); `FoundReport`; `PlanLimit.ScanHistoryDays`; `PlanLimit.AllowsFoundReports`; `lib/foundLocation.ts`; outbox for notification | Moderate | Contact multiplicity only | No | Yes |
| **P6 Recurring Schedules** | `CareRecord`; P1's scheduler | Moderate | Yes — recurrence rule | Reuses P1's | Yes |
| **P7 Weight Trends** | Nothing — no weight field exists anywhere | Yes | Yes | No | Yes |
| **P8 Profile Customisation** | `lib/petProfileThemes.ts`; `Pet.ProfileTheme`; `PlanLimit.AllowsAdvancedThemes` | Trivial | No | No | Small |
| **Premium entitlements** | `Plan` + `PlanLimit` + `OwnerProfile.PlanId` + `AdminPlansController` + `adoptServerPlanLimits` (`lib/planLimits.ts:33`) | Extend | Extend | No | Admin exists |

### The three biggest reuse findings

1. **`PlanLimit` already anticipates most of Premium.** It carries
   `MaxFamilyMembers`, `MaxCareRecords`, `ScanHistoryDays`, `AllowsFoundReports`
   and `AllowsAdvancedThemes` — fields nothing currently reads. The entitlement
   surface for Family Access, Advanced Safety and Customisation is **already
   modelled and already administered** through `/admin/plans`. Premium
   enforcement is largely a matter of *reading fields that already exist*.
2. **The email stack is production-grade and reminder-shaped.** The outbox has
   per-row leasing, bounded attempts, exponential-style `NextAttemptAt`
   scheduling, typed suppression reasons, and a gate whose `EnabledFromUtc`
   guard exists precisely to stop a historical backlog flooding out when a
   template is switched on. That last property is exactly what protects a
   reminder rollout from mailing every overdue record in the database on day
   one.
3. **The social-card pipeline is a general image factory that currently serves
   one caller.** Renderer, edge proxy, version-keyed cache, in-flight dedupe,
   host allowlist and byte validation are all built. Adding a *template
   variant* to it is a fraction of the cost of any alternative.

### Reuse gaps worth naming

- **No shared server-side "today in Malaysia" rule.** `lib/careRecordStatus.ts`
  computes the Malaysia calendar day in the browser; `PetAgeCalculator.cs` uses
  `DateTime.UtcNow`; `BusinessReferenceGenerator.cs` is the only server code
  using `TimeSpan.FromHours(8)`. A reminder scheduler **must** define this once,
  server-side, or reminders will fire on the wrong day for eight hours daily.
- **`OwnerProfile.PlanOverrideJson` is stored and displayed but never enforced.**
  Any entitlement work must decide whether it becomes real or is removed.
- **`OwnerProfile.NotificationPreferencesJson` is an untyped JSON blob.** Adding
  reminder preferences to it conflicts with the governance rule against generic
  key/value settings (`AGENTS.md` rule 12). Prefer typed columns.

---

## 4. Dependency Graph

Solid arrows are hard dependencies (do not invert). Dotted notes are strong
recommendations.

```text
                       ┌────────────────────────────┐
                       │  Existing social-card       │
                       │  pipeline (renderer + edge) │
                       └──────────────┬──────────────┘
                                      │
                    ┌─────────────────▼─────────────────┐
                    │  F2  Pet Share Card (variant)     │
                    └─────────────────┬─────────────────┘
                                      │
                    ┌─────────────────▼─────────────────┐
                    │  F3  Birthday / Adoption Card     │
                    └─────────────────┬─────────────────┘
                                      │ (needs ≥1 year of data)
                    ┌─────────────────▼─────────────────┐
                    │  F4  Year in Review               │
                    └───────────────────────────────────┘

  F1  Profile Completion  ──── independent, no dependencies ────►


       ┌──────────────────────┐        ┌──────────────────────┐
       │ Care Records (built) │        │ Email outbox +       │
       │ + due-date status    │        │ dispatcher (built)   │
       └──────────┬───────────┘        └──────────┬───────────┘
                  └──────────────┬────────────────┘
                                 │
              ┌──────────────────▼──────────────────┐
              │ PREM-A  Server-side Malaysia day    │
              │         + entitlement read          │
              └──────────────────┬──────────────────┘
                                 │
              ┌──────────────────▼──────────────────┐
              │ P1  Automatic Care Reminders        │
              └──────────────────┬──────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
      ┌──────────▼──────────┐        ┌───────────▼──────────┐
      │ P6 Recurring        │        │ P5a Scan             │
      │    Schedules        │        │     notifications    │
      └─────────────────────┘        └──────────────────────┘

       ┌──────────────────────┐
       │ Media + private R2   │
       │ (built)              │
       └──────────┬───────────┘
                  │
       ┌──────────▼───────────┐        ┌──────────────────────┐
       │ P3  Document Vault   │───────►│ P4  Vet Health       │
       └──────────────────────┘        │     Summary (PDF)    │
                                       └───────────┬──────────┘
                                                   │
                                       ┌───────────▼──────────┐
                                       │ P4b Temporary Vet    │
                                       │     Link (later)     │
                                       └──────────────────────┘

       ┌──────────────────────┐
       │ Current ownership    │
       │ (OwnerUserId, 41×)   │
       └──────────┬───────────┘
                  │
       ┌──────────▼───────────────────────────────┐
       │ P2  Family Access — 4 sequential phases  │
       │   a) access domain + read authorization  │
       │   b) invitation + acceptance             │
       │   c) owner UI + revocation               │
       │   d) full public/safety regression       │
       └──────────────────────────────────────────┘
```

### Ordering constraints that must not be violated

1. **P4 depends on P3.** A "health summary" assembled only from care-record text
   is thin; the vet-facing artefact is valuable because it can reference actual
   documents. Building P4 first produces a PDF nobody prints twice.
2. **P6 depends on P1.** Recurrence without delivery is just a date generator —
   the user already has that. Recurrence also *multiplies* the reminder blast
   radius, so it must land on a proven dedupe path.
3. **P2 must not precede P1.** Family Access rewrites the authorization
   predicate that every other service depends on. Doing it while the team is
   also learning whether Premium sells at all is the wrong risk sequencing.
4. **F3 depends on F2's variant mechanism**, not the other way round. Building
   the birthday card first creates a one-off renderer that F2 then has to
   absorb.
5. **PREM-A precedes P1.** The server has no Malaysia calendar-day helper. This
   is a small, sharp prerequisite, not part of the reminder feature.

---

## 5. Recommended Development Priority

Value scale: Low / Medium / High / Very High.

| # | Feature | User value | Acquisition | Retention | Premium conversion | Eng. complexity | Operational risk | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **F1 Profile Completion** | High | Low | High | Low | **Low** | **Very low** | Growth 1 |
| 2 | **F2 Pet Share Card** | High | **Very high** | Medium | Low | Medium | Low–Medium | Growth 1 |
| 3 | **F3 Birthday / Adoption Card** | High | High | **High** | Low | Low (after F2) | Low | Growth 2 |
| 4 | **PREM-A Reminder foundations** | — | — | — | — | Low | Medium | Premium 0 |
| 5 | **P1 Automatic Care Reminders** | **Very high** | Low | **Very high** | **Very high** | Medium | **High** | Premium 1 |
| 6 | **P3 Document Vault** | High | Low | Medium | High | Medium | Medium | Premium 2 |
| 7 | **P4 Vet Health Summary (PDF)** | High | Low | Medium | High | Low–Medium | Low | Premium 2 |
| 8 | **P2 Family Access** | High | Medium | High | High | **High** | **Very high** | Premium 3 |
| 9 | P5 Advanced Safety | Medium | Low | Medium | Medium | Medium | Medium | Later |
| 10 | P6 Recurring Schedules | Medium | Low | High | Medium | Medium | Medium | Later |
| 11 | P8 Profile Customisation | Low | Low | Low | Low (supporting) | **Very low** | Very low | Later (filler) |
| 12 | P7 Weight / Health Trends | Medium | Low | Medium | Medium | Medium | Low | Later |
| 13 | F4 Year in Review | Medium | Medium | Medium | Low | Medium | Low | Later (seasonal) |

### Changes from the starting hypothesis, and why

The proposed order was: Profile Completion → Share Card → Birthday Card →
Reminders → **Family Access** → Document Vault → Vet Summary.

**Family Access moves from 5th to 8th.** Three reasons, all from the code:

- Ownership is currently a single scalar comparison (`OwnerUserId == userId`)
  appearing **41 times across 18 services**. Family Access replaces that with a
  membership lookup **everywhere at once**. Missing one call site is a silent
  cross-tenant data leak, and the codebase's strongest current property —
  "no IDOR path was found" (`SOFT_LAUNCH_READINESS.md`) — is exactly what is at
  stake.
- Authentication is **Google-only** (`ExternalLogin.Provider = "Google"`, no
  email OTP, no password — see `SOFT_LAUNCH_READINESS.md` P1-006). An invitation
  flow therefore cannot create an account; it can only pre-authorize an email
  that must then complete Google sign-in. That is a solvable but non-trivial
  invitation design, and it caps the feature's reachable audience.
- It is the only proposed feature with **no meaningful reuse**. Every other
  Premium item lands on machinery that already runs in production.

**Document Vault and Vet Summary move up**, because they are near-pure reuse
(private bucket + presigned download + QuestPDF all exist) and they pair into a
single coherent Premium story: *keep the paperwork, hand it to the vet*.

**A new item PREM-A is inserted before P1.** The server has no Malaysia
calendar-day helper and `EmailOutbox` has no care-record relation or dedupe key.
Both are prerequisites, both are small, and bundling them into the reminder work
item makes that item too large to review safely.

---

## 6. MVP Boundaries — Top 7

### 1. F1 — Profile Completion

**Full spec:** [`features/PROFILE_COMPLETION.md`](features/PROFILE_COMPLETION.md).

**MVP includes**
- A pure `apps/web/src/lib/profileCompletion.ts` module deriving a fixed
  checklist from data the client already holds.
- Per-pet completion card on the pet detail page; single-pet summary on the
  dashboard.
- Each incomplete item deep-links to the exact editor that fixes it.
- Two analytics events.
- Dismiss/hide once complete.

**MVP explicitly excludes**
- ✗ Any API endpoint, DTO field, or migration.
- ✗ Server-side persistence of completion or dismissal state.
- ✗ Gamification: streaks, badges, points, celebratory animation.
- ✗ Multi-pet aggregate percentage across the whole account.
- ✗ Any item that implies a feature which is flagged off (Smart Tags, Safety
  Profile owner UI when `NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED=false`).
- ✗ Email or push nudges of any kind.

**Percentage vs checklist.** Show **both, weighted toward the checklist**. A
percentage alone is a score with no next action; a checklist alone loses the
sense of progress that makes people finish. The percentage must be derived from
the same weights the checklist displays, never a separate calculation.

---

### 2. F2 — Pet Share Card

**Architecture decision: extend the existing server-rendered social-card
pipeline with a template variant. Do not build a client-side generator, and do
not create a second image service.**

Rationale, from the code:

- `PublicProfileSocialCardRenderer.cs` already produces a branded 1200×630 JPEG
  from the *restricted* public projection (`PublicProfileSocialResponse`), which
  contains **no contact details** — the privacy property we want a shareable
  card to have, and the one a client-side renderer would have to re-establish
  from the full owner DTO.
- The edge layer already gives us CDN caching keyed on `publicProfileVersion`,
  in-flight request collapsing, a host allowlist, and JPEG byte validation
  (`edge/publicProfileEdge.ts`).
- `apps/web` is a **static export**. There is no Next.js server to render an
  image on. A client-side canvas approach would mean fonts, CORS-tainted canvas
  from R2, device-dependent output, and inconsistent text metrics — the exact
  problems `SkiaSharp` server rendering already solved.
- Revalidation is already correct: the edge re-checks the public projection
  before serving a cached image, so an archived or privatised profile stops
  producing cards immediately.

**MVP includes**
- One new card **variant** (portrait/story-friendly, distinct from the 1200×630
  OG landscape card) served from the same renderer and same edge route family.
- A "Share {Pet}" action in the owner portal and on the Public Share Profile,
  reusing `ShareProfileLink.tsx`'s `navigator.share` → clipboard fallback.
- **Save Image** on mobile via the native share sheet; desktop gets a direct
  image link plus Copy Profile Link.
- Cache key extended with the variant so variants cannot collide.
- Card content limited to what the public projection already exposes: name,
  species/breed, age label, personality summary, photo, and the profile URL.

**MVP explicitly excludes**
- ✗ Client-side/canvas generation.
- ✗ Owner-selectable templates, colours, fonts, or stickers.
- ✗ Any card for a private, archived, or public-profile-disabled pet.
- ✗ Persisting generated cards to R2 (memory + CDN cache only — R2 write costs
  and lifecycle management buy nothing while the version hash already busts
  correctly).
- ✗ Watermark/branding configuration.
- ✗ Video or animated formats.

**Cost note.** Generation is CPU on the API for a cache miss only, and the edge
holds `s-maxage=604800`. Cards regenerate on profile change, not per view.

---

### 3. F3 — Birthday / Adoption Share Card

**MVP includes**
- Two further variants of the F2 renderer ("turns N today", "N years since
  joining").
- **User-initiated only**, surfaced by an in-app dashboard card that appears
  when `Pet.Birthday` or `Pet.AdoptionDay` matches today in the Malaysia
  calendar.
- Reuses `PetAgeCalculator` for the age number and the existing `MomentType`
  Birthday / Adoption Day vocabulary for copy.

**MVP explicitly excludes**
- ✗ Any scheduler, worker, cron, or background job.
- ✗ Any email or push notification.
- ✗ Automatic Moment creation.
- ✗ Cards for pets with only `EstimatedBirthYear` (no exact day → no "today").
- ✗ Cards for Memorial or Archived pets.

**This is the key design constraint honoured:** the Free birthday card needs
**zero reminder infrastructure**. The trigger is "the owner opened the app on
the day", which is exactly why it should stay Free and why the *emailed*
birthday greeting belongs to Premium later.

---

### 4. PREM-A — Reminder Foundations

**MVP includes**
- A single server-side Malaysia calendar-day helper (mirroring the rule in
  `lib/careRecordStatus.ts`) with boundary tests at the 16:00 UTC / 00:00 MYT
  transition.
- `EmailOutbox.RelatedCareRecordId` plus a **unique dedupe key** column
  (care record + offset bucket), with a filtered unique index.
- A new `EmailMessageType.CareReminder` and its `EmailTemplateSetting` row,
  seeded **disabled** with `EnabledFromUtc` null.
- Typed reminder-preference columns on `OwnerProfile` (not
  `NotificationPreferencesJson`).

**MVP explicitly excludes**
- ✗ Any sending. This item ships dark.
- ✗ Reading the new preference anywhere in the UI.

---

### 5. P1 — Automatic Care Reminders

**MVP includes**
- ✓ **Email only.**
- ✓ **One reminder per care record per offset**, from a small fixed set —
  recommended **7 days before, 1 day before, on the due day**. This is a
  starting product decision, not a permanent one; the offset is stored on the
  outbox row so it is measurable and changeable.
- ✓ Enqueue via a new scheduling `BackgroundService` that runs once per Malaysia
  day, claims work in bounded batches, and writes `EmailOutbox` rows. **Delivery
  reuses the existing `EmailDispatchWorker` unchanged.**
- ✓ **Dedupe** enforced by a database unique index, not application logic —
  the only guarantee that survives concurrent instances, worker restarts, and
  clock skew.
- ✓ **Retry** reuses the existing `AttemptCount` / `MaxAttempts` /
  `NextAttemptAt` / lease mechanics. No new retry code.
- ✓ Gated by `EmailTemplateGate` (App Setting `Email:Enabled` **AND** the
  template row) so the historical-backlog guard prevents a launch-day flood.
- ✓ Per-owner opt-out honoured at enqueue time and re-checked at dispatch.
- ✓ Premium entitlement checked at enqueue time from `PlanLimit`.

**MVP explicitly excludes**
- ✗ WhatsApp, SMS, push, in-app notification centre.
- ✗ Per-record custom offsets or per-record reminder toggles.
- ✗ Per-owner timezone selection (Malaysia only; the audience is Malaysian).
- ✗ Digest/batching multiple pets into one email.
- ✗ Recurrence (that is P6).
- ✗ Snooze / "remind me later".
- ✗ Reminder history UI beyond what Admin already shows for the outbox.

**What prevents duplicate reminders — four independent layers**

1. **Database uniqueness.** A filtered unique index on
   `(RelatedCareRecordId, ReminderOffsetDays)` where the row is not superseded.
   Two schedulers racing produce one row and one constraint violation.
2. **Idempotent scheduling window.** The scheduler selects by *due date* and
   *Malaysia day*, not by "time since last run", so a missed or repeated run
   converges instead of drifting.
3. **The dispatcher's existing lease.** `LockToken` + `LockedUntil` already
   guarantee one sender per row.
4. **`EnabledFromUtc`.** Rows recorded before the template was switched on are
   `Suppressed` and can never be released later.

**Operational risk is High and must be respected.** This is the first feature
that sends unsolicited mail. A defect here is visible to every customer at once
and is not retractable. Rollout: ship dark → enable for internal accounts →
enable for a small cohort → general.

---

### 6. P3 — Document Vault

**MVP includes**
- Owner UI to upload, list, rename, and delete pet documents, reusing
  `MediaUploadCategory.VaccinationDocument` / `MedicalDocument` and the existing
  presigned upload path.
- A listing endpoint returning document metadata (never a durable URL).
- Download strictly via `CreatePrivateDownloadUrlAsync` — presigned, short-lived
  (`PresignedDownloadExpiryMinutes`, currently 5), bucket-verified, and
  ownership-scoped.
- Optional link to a care record via the existing `MediaOwnerType.CareRecord`.
- **Explicit storage limits**, expressed as new `PlanLimit` fields:
  recommended starting point **Free 0 documents / Premium 50 documents per pet,
  10 MB per file**, aligned with the existing `UploadRules.Documents` policy.
  Never advertise "unlimited".

**MVP explicitly excludes**
- ✗ Any public or unauthenticated document access.
- ✗ Sharing documents outside the account (that is P4/P4b).
- ✗ OCR, parsing, expiry extraction, or any content interpretation.
- ✗ Folders, tags, or search.
- ✗ Versioning.
- ✗ Bulk download / ZIP export.

---

### 7. P4 — Vet Health Summary

**Recommended MVP: Option A — Download Health Summary PDF. Not Option B, not
Option C.**

Reasoning: Option A reuses QuestPDF, `DocumentTheme`, and the existing
owner-scoped document pattern, and ships with **zero new public surface**.
Option B (temporary vet link) introduces an unauthenticated, time-boxed,
guessable-if-done-wrong token that exposes health data — a materially larger
security commitment than anything currently in the product, and one that should
not be taken on in the same release as the feature it decorates. Build A, learn
whether owners actually hand the PDF over, then decide whether B is worth its
risk.

**MVP includes**
- One QuestPDF renderer producing a branded A4 summary: pet identity, age,
  allergies, personality/care notes, and care records grouped by type with dates
  and providers.
- Owner-initiated download only, ownership-scoped.
- Lists attached documents by name and date (P3 dependency) without embedding
  them.

**MVP explicitly excludes**
- ✗ Temporary vet link, QR for the vet, or any tokenised access.
- ✗ Emailing the summary.
- ✗ Embedding document images/PDFs into the summary.
- ✗ Any interpretation, scoring, or health advice. **The document must state
  that it is owner-entered information, not a medical record.**

---

## 7. Premium Entitlement and Pricing Architecture

**Recommendation: keep entitlement completely independent of FIUU, and extend
the `Plan` domain that already exists rather than inventing a parallel one.**

### What already exists

- `Plan` (Code, Name, `PlanStatus` Available/ComingSoon/Disabled, PriceLabel,
  BillingNote) and `PlanLimit` (nine typed limit fields).
- `OwnerProfile.PlanId` — every owner already points at a plan.
- Enforcement reads limits at the service layer (`PetService`, `MemoryService`).
- `AdminPlansController` + `/admin/plans` administer plans and per-owner plan
  assignment.
- `lib/planLimits.ts` `adoptServerPlanLimits()` already lets the server's real
  limits override the frontend baseline.

**This is already an entitlement domain.** It is not yet a *subscription*
domain, and that is the correct boundary to preserve.

### The concepts actually needed, and when

| Concept | Needed for | Add when |
| --- | --- | --- |
| `Plan`, `PlanLimit` | Everything | **Exists** |
| `Entitlement` (derived from `PlanLimit`) | Feature gating | **Exists in substance** — read the unused fields |
| `Subscription` (owner → plan, with state) | Paid Premium | Only when billing ships |
| `SubscriptionStatus` (Trialing/Active/PastDue/Cancelled/Expired) | Paid Premium | With `Subscription` |
| `BillingPeriod` (start/end, renewal) | Paid Premium | With `Subscription` |
| Payment-provider records (FIUU token, txn ref, webhook events) | FIUU | **Separate table, separate service** |

### Required separation

```text
  Feature code
       │  asks only: "does this owner have entitlement X right now?"
       ▼
  Entitlement resolver  ◄── Plan / PlanLimit  ◄── Subscription (status, period)
                                                        ▲
                                                        │ state transitions only
                                                        │
                                            Payment provider adapter (FIUU)
                                            tokenisation · recurring · FPX/eWallet
```

**Rules to enforce when billing is built:**

1. No feature code may ever reference FIUU, a token, or a transaction. Features
   ask the entitlement resolver only.
2. `Subscription` state changes come from **events** — this is the one thing the
   current architecture does *not* have. Payment confirmation today is an admin
   action (`AdminPaymentProofsController`), not a webhook. A FIUU integration
   needs an idempotent webhook receiver with replay protection alongside the
   existing manual path; the readiness audit already identified this as the main
   gateway gap.
3. Entitlement must **fail closed** for financial configuration
   (`AGENTS.md` configuration rule 8) but **fail open for safety** — a billing
   outage must never take down a Safety Profile or hide finder contact.
4. `OwnerProfile.PlanOverrideJson` must be resolved before billing ships: make
   it a real, typed, audited override or delete it. An unenforced override field
   next to a paid entitlement is a support incident waiting to happen.
5. Grandfathering already exists (`GrandfatheredAt`, and
   `lib/planLimits.ts` early-access copy). Preserve it — existing owners above a
   new limit keep their data.

**Do not create migrations or code for any of this yet.** No pricing decision is
made in this document.

---

## 8. Feature Flags and Rollout

**Current conventions are sufficient. Do not invent a new flag system.**

Two mechanisms exist and are correct for their jobs:

- **Build-time `NEXT_PUBLIC_*`** in `apps/web/src/lib/features.ts` — hides owner
  navigation, widgets, and actions while routes and data keep working. Composed
  flags already exist (`tagOrdersEnabled = smartTagsEnabled && …`).
- **Runtime typed database switches** — `EmailTemplateSetting` per message type,
  with authorization, audit, `RowVersion`, and the `EnabledFromUtc` guard,
  gated by an App Setting kill switch (`Email:Enabled`). This is the pattern
  `AGENTS.md` rule 9 requires for two-level controls.

### Recommended flags — five, not twelve

| Feature | Flag | Type | Default |
| --- | --- | --- | --- |
| F1 Profile Completion | **none** | — | Ship on. Additive, reversible by revert, no external effect. |
| F2 + F3 Share Cards | none (launched; follows Public Profile eligibility) | n/a | n/a |
| P1 Care Reminders | `EmailMessageType.CareReminder` template row **AND** `Email:Enabled` | Runtime DB + App Setting | disabled |
| P1 owner-facing UI | `NEXT_PUBLIC_CARE_REMINDERS_ENABLED` | Build-time | `false` |
| P3 Document Vault | `NEXT_PUBLIC_DOCUMENT_VAULT_ENABLED` | Build-time | `false` |
| P2 Family Access | `NEXT_PUBLIC_FAMILY_ACCESS_ENABLED` | Build-time | `false` |
| Premium generally | `Plan.Status = ComingSoon → Available` | **Existing data**, not a flag | ComingSoon |

**Avoiding flag explosion:** P4 ships under the P3 flag (it is a button inside
the vault story). F3 ships under the F2 flag. P8 needs no flag —
`PlanLimit.AllowsAdvancedThemes` is the switch. **Premium availability is a plan
status change, not a feature flag**, which keeps one concept in one place.

Every flag added must come with a removal note in the work package. A flag that
outlives its rollout becomes permanent untested branching.

---

## 9. Analytics Requirements

Reuse `apps/web/src/lib/analytics.ts` exactly as it stands: add the event name to
`AnalyticsEvent`, the payload shape to `AnalyticsPayloads`, the permitted keys to
`allowedKeys`, and any new categorical value to `allowedValues`. The runtime
allowlist is what enforces the privacy contract even if TypeScript is bypassed.

**Hard constraints (already enforced, must not be weakened):** no pet or owner
names, emails, phone numbers, slugs, safety codes, tag codes, order numbers,
database identifiers, or free text. Dynamic routes are sent as templates.

### Minimum events per feature — only what answers "does it work?"

| Feature | Events | The question it answers |
| --- | --- | --- |
| F1 Profile Completion | `completion_prompt_viewed`, `completion_action_clicked` | Do people notice it, and does it move them into an editor? |
| F2 Pet Share Card | `share_card_viewed`, `share_card_shared` | Do people who see it actually share? |
| F3 Birthday Card | `share_card_shared` with `card_variant` | Does the seasonal trigger outperform the evergreen card? |
| P1 Care Reminders | `care_reminder_settings_viewed`, `care_reminder_opt_out` (frontend); **delivery/open/click measured server-side from `EmailOutbox`**, never client-side | Do owners keep reminders on? Do reminders send reliably? |
| P3 Document Vault | `document_uploaded` (with a controlled `document_type`), `document_downloaded` | Is the vault filled, and is it ever re-opened? |
| P4 Vet Summary | `health_summary_downloaded` | Is the PDF generated more than once per owner? |
| Premium (when live) | `premium_viewed`, `subscription_started`, `subscription_completed` | Funnel. |

**One new controlled dimension is needed:** `card_variant`
(`profile` \| `birthday` \| `adoption`), added to `allowedValues`. Everything
else fits existing dimensions.

**Explicitly not instrumented client-side:** reminder sends, opens, and bounces.
Those are server facts and belong to the outbox, where they already have status,
attempt count, and error columns. Emitting them from the browser would be both
wrong and a privacy regression.

Do not implement any of these events in this planning task.

---

## 10. Security and Privacy Review

Tied to this architecture, not generic.

### P2 Family Access — the highest-risk item in the backlog

**Threat: the authorization rewrite misses a call site.** Ownership is asserted
as `OwnerUserId == userId` in **41 places across 18 services**
(`PetService`, `MemoryService`, `CareRecordService`, `MediaService`,
`OrderService`, `SmartTagService`, `PaymentProofService`, `OrderDocumentService`
and more). Family Access replaces a scalar comparison with a membership lookup.
Any missed site is either a cross-tenant leak or a broken feature.

**Security invariants — must hold after every Family Access phase:**

1. **No caller may pass an owner id.** The effective identity comes from the
   validated token only. A `?ownerId=` parameter on any owner endpoint is a
   defect.
2. **Exactly one authorization helper.** Every service resolves access through a
   single shared "pets this principal may act on" predicate. No service
   re-implements the check.
3. **Read access never implies write access, and neither implies admin.** Role
   is evaluated per operation, not per session.
4. **Access grants are per-pet, never per-account.** Sharing one pet must not
   expose the owner's other pets, orders, payment proofs, or documents.
5. **Only the true owner may: transfer ownership, delete the pet, manage Smart
   Tags/orders, or change plan.** Encode this as an explicit owner-only
   operation list, tested negatively.
6. **Invitations are single-use, expiring, bound to one email, and revocable.**
   Because auth is Google-only, an invitation must pre-authorize an email and
   require Google sign-in as that email — never create an account, never accept
   an arbitrary signed-in user.
7. **Every grant, acceptance, role change, and revocation is audited** through
   the existing `AuditLogService`.
8. **Revocation is immediate**, including any cached client state and any issued
   refresh token path.
9. **A revoked or expired member's identity must vanish from public surfaces** —
   Public Share Profile, Safety Profile, and social cards must never leak member
   names or emails.

**Invitation abuse:** rate-limit invitation creation per owner and per target
email, cap pending invitations at `PlanLimit.MaxFamilyMembers`, and never
disclose in the response whether the invited email has a MyPetLink account.

### P3 Document Vault — private file exposure

- Documents **must** land in the private bucket. `IsPublicCategory`
  (`MediaService.cs:736`) is the single decision point; adding a document
  category without updating it silently publishes health records.
- Never return a durable object URL. Only `CreatePrivateDownloadUrlAsync`,
  which already verifies `IsPublic == false`, `UploadStatus == Ready`,
  `DeletedAt == null`, and bucket identity before presigning.
- Presigned download URLs are bearer credentials. Keep the 5-minute expiry, and
  never log, email, or place them in analytics or query-string history.
- Object keys for documents are currently flat (`pet-documents/{random}`), unlike
  photo keys which embed `pets/{petId}/…`. Keep them unguessable and do **not**
  add owner or pet identifiers to document keys — key structure is metadata.
- Enforce `UploadRules.Documents` content types server-side. Never trust the
  client-declared content type for rendering; force `Content-Disposition:
  attachment` for anything not explicitly allow-listed.
- Deleting a pet must delete or orphan-protect its documents. Soft-deleted pets
  currently keep media rows.

### P4 Vet Sharing — temporary-link leakage

Deferred out of MVP for exactly this reason. When it is built: cryptographically
random tokens from `RandomNumberGenerator` (matching the existing 96-bit safety
code standard), short expiry, single revocation switch, `noindex`, no
enumerable id, and rate limiting — the safety endpoints' current lack of rate
limiting (`SOFT_LAUNCH_READINESS.md` P2) is acceptable only because those codes
are 96-bit; a vet link must not repeat that assumption with health data.

### P5 Advanced Safety — finder location privacy

- `TagScan` stores latitude/longitude, IP, user agent, browser, OS, and city —
  about a **finder**, who is a third party that never agreed to a MyPetLink
  account. `FinderConsentPreciseLocation` exists and must remain the gate for
  precise coordinates.
- Owner-facing location history must show **approximate** location by default
  (city/area), with precise coordinates only where consent was explicitly given.
- Set a retention limit. `PlanLimit.ScanHistoryDays` is the right knob; make
  retention actually delete, not merely hide, or the Premium boundary becomes a
  privacy claim we cannot honour.
- Never expose finder IP or user agent to the owner. Those are operational
  fields.

### P1 Reminders — sensitive information in email

- The subject line must not carry health information. **"Care due for Milo"**,
  not "Rabies vaccination overdue". The subject is visible on a lock screen.
- The body should name the pet and the record title (owner-authored) but avoid
  restating medical detail beyond what the owner typed.
- `EmailOutbox.TemplateDataJson` is a stored snapshot — keep it minimal, since
  it is retained long after sending and is visible to admins.
- Reuse `CleanHeaderValue` (`EmailOutboxService.cs:412`) for every header-bound
  value; pet names are user input and are a header-injection vector.
- A pet deleted, archived, or made memorial after enqueue must not receive a
  reminder. Re-check state at dispatch, not only at enqueue.
- Honour `CommunicationPreferenceRules` intent: reminders are **not** marketing
  and must never be sent to satisfy a marketing goal, nor should reminder
  consent be inferred as marketing consent.

### F2/F3 Share Cards — accidental publication

- Render **only** from `PublicProfileSocialResponse`, the restricted projection
  that contains no contact details. Never pass the owner DTO into a card
  renderer.
- The edge already re-validates the public projection before serving a cached
  image; preserve that ordering when adding variants, or a privatised pet's card
  will survive in CDN cache.
- Include the variant in the cache key alongside `publicProfileVersion`.
- A pet with `IsPublicProfileEnabled = false`, archived, or memorial must
  produce **no** card — not a redacted one.
- Lost Mode cards deserve care: the existing renderer draws a "PET IS LOST"
  banner. That is intentional reach, but it must never add contact details to
  the image, since images are re-shared beyond the owner's control and cannot be
  revoked.

---

## 11. Documentation and Stale-Doc Notes

- [`mypetlink-development-phases.md`](mypetlink-development-phases.md) predates
  the current stack (it names Supabase; the backend is ASP.NET Core + EF Core +
  SQL Server) and lists Premium, family access, care reminders, and scan history
  as unscheduled "Phase 3 possible features". It has been given a status banner
  pointing here for anything post-launch. Its **product rules remain in force**
  — especially "finder contact must not be locked behind Premium", which this
  roadmap upholds.
- [`launch/SOFT_LAUNCH_READINESS.md`](../launch/SOFT_LAUNCH_READINESS.md)
  already identifies the same two cheapest retention wins (profile completion,
  care-reminder email on the existing outbox). This roadmap is consistent with
  it and supersedes nothing in it.
- No new per-feature document should be created until its work package starts.
  The only detailed spec written now is
  [`features/PROFILE_COMPLETION.md`](features/PROFILE_COMPLETION.md).
