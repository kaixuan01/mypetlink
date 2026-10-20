# Pet Owner Portal — Engagement Audit & UX Design Proposal

**Date:** 2026-10-20 · **Branch inspected:** `main` @ `808296d` (working tree has
unrelated uncommitted Consignment / Merchant / marketing work, untouched)
**Type:** read-only audit and proposal. **Nothing in this document is approved
for implementation.**

**Scope:** Owner Dashboard, pet management hub, Care Records, Moments, Share
Center / Share Cards, Share Profile, notifications, plan limits. Merchant
Partnership, merchant rewards and marketplace work are out of scope.

**Method:** every claim below was checked against the current source. File
references use `path:line` and point at the code as it stands on 2026-10-20.
Where something was *not* verified it says so.

**Related canonical documents** (this audit builds on them, it does not replace
them):

- [`docs/architecture/product-model.md`](../architecture/product-model.md) — terminology and profile relationships
- [`apps/web/docs/OWNER_PORTAL_FLOW.md`](../../apps/web/docs/OWNER_PORTAL_FLOW.md) — portal structure rules
- [`docs/product/GROWTH_AND_PREMIUM_ROADMAP.md`](../product/GROWTH_AND_PREMIUM_ROADMAP.md) — Free/Premium boundary, Care Reminders (P1) and Recurring Schedules (P6) plans
- [`docs/architecture/communication-preferences.md`](../architecture/communication-preferences.md) — reminder preferences are placeholders
- [`docs/architecture/owner-sharing-experience.md`](../architecture/owner-sharing-experience.md) — one Share entry point

---

## 1. Executive Summary

**MyPetLink already has most of the machinery these three features need. What
it lacks is a reason, on the Dashboard, to come back.**

The Dashboard today is a well-built *status page*: a greeting, three counters,
the pet list, a birthday card when one applies, one profile-completion nudge,
three care due dates, three navigation tiles and a plan-usage meter
(`apps/web/src/components/portal/DashboardClient.tsx:247-313`). Every element
answers "what do I have?". Almost nothing answers "what should I do today?" or
"what happened this week?" — and the two items that come closest (care due
dates and quick actions) have no action attached to them.

The findings that shape every recommendation:

1. **Care is further along than it looks.** Care records already carry a next
   due date, a derived Overdue / Due soon / Upcoming status computed on the
   Malaysia calendar day, and a **fulfilment link** (`FulfillsCareRecordId`)
   that says "this record completed that due item" — protected by a filtered
   unique index, cycle detection and same-pet/same-type validation
   (`apps/api/MyPetLink.Api/Services/CareRecordService.cs:480-556`,
   `Data/MyPetLinkDbContext.cs:2307-2309`). A completion chain *is* a recurring
   schedule the owner controls. **"Mark as Done" is mostly a UX feature over an
   existing backend.**
2. **There is no notification channel for care, by design.** In-app
   notifications are Community-only (`OwnerNotificationType`,
   `Entities/Enums.cs:451`), and email reminders are documented as a future
   **Premium** capability with placeholder preferences
   (`communication-preferences.md`, `GROWTH_AND_PREMIUM_ROADMAP.md` §P1). This
   audit keeps that boundary: the in-app planner is Free; MyPetLink *reaching
   out* stays Premium Coming Soon.
3. **The Share Card pipeline is reusable, but only for public data.** The
   SkiaSharp renderer (`Services/PublicProfileSocialCardRenderer.cs`) produces
   1080×1350 cards, but it is fed by an *anonymous, cacheable* public endpoint
   (`Controllers/PublicProfilesController.cs:49`). A Weekly Recap draws on
   owner-private Moments and care, so it needs a **new owner-authenticated,
   uncached** render endpoint that reuses the renderer's drawing code — not the
   public endpoint.
4. **No scheduled job and no new table are needed** for a first Weekly Recap.
   It can be assembled on demand from existing `PetMemories`, `MomentPets`,
   `MediaFiles` and `CareRecords`.
5. **Two existing constraints will surface as soon as owners use these
   features more:** list endpoints cap at 100 rows (`Validation/PagedQuery.cs:10`)
   and the Dashboard makes one request per pet for records and another per pet
   for Moments (`DashboardClient.tsx:121-124`); and the Free plan keeps only
   **10 private Moments per pet** (`MyPetLinkDbContext.cs:3181`) while the
   Moment editor defaults to *Only me*. A weekly-Moment habit hits that wall in
   about ten weeks.

**Answer to the headline question:** yes — all three enhancements fit the
current architecture without major redevelopment. Recommended order:
**Dashboard → Care Planner → Weekly Recap**, with the first Dashboard pass
shipping as a frontend-only change. Details in §11 and §14.

---

## 2. Current Portal Inventory

### 2.1 Shell, navigation and routing

| Concern | Where | Notes |
| --- | --- | --- |
| Portal shell + auth guard | `apps/web/src/components/layouts/AppLayout.tsx` | Sidebar (desktop), `MobileBottomNav` (phone) |
| Nav items (single source) | `apps/web/src/lib/ownerNavigation.ts:31-90` | Dashboard, My Pets, Care Records, Moments, Smart Tags, Orders, Owner Settings |
| Mobile primary bar | same file, `showInMobilePrimary` | **Home / Pets / Moments / More** — Care Records lives inside *More* |
| Header create actions | `apps/web/src/lib/ownerHeaderActions.ts`, `components/portal/OwnerHeaderActions.tsx`, `GlobalAddMenu.tsx` | Dashboard header already has an **Add** menu: Add Pet / Add Care Record / Add Moment, with a pet chooser |
| Route strings | `apps/web/src/lib/routes.ts` | `ownerRoutes.petRecords(petId, { create })` (`:89`), `petMomentCreate` (`:101`) |
| Feature flags | `apps/web/src/lib/features.ts` | No flag exists for any feature in this audit |
| Static export | `next.config.ts` (`output: "export"`) | New dynamic routes need `generateStaticParams` + client re-fetch. **Prefer dialogs/sheets over new dynamic routes.** |

### 2.2 Dashboard — `/dashboard`

`apps/web/src/app/dashboard/page.tsx` renders `DashboardClient` inside
`AppLayout`. All data is fetched client-side.

| Order | Section | Code | Shown when |
| --- | --- | --- | --- |
| 1 | Owner contact setup nudge | `OwnerContactSetupCard` (`DashboardClient.tsx:249`) | No usable owner contact |
| 2 | "Welcome back" + 3 stat tiles (Pets, Share Profiles, Moments) | `:260-284` | Always |
| 2a | Lost Mode alert (inside the welcome card) | `LostModeAlert` `:406-433` | Any pet in Lost Mode |
| 3 | Your pets (max 4 cards: avatar, name, Public/Private badge, Share, View) | `DashboardPetsSection` `:489-594` | Always |
| 4 | Celebrate today (birthday share card) | `DashboardOccasionSection` `:316-359` | Birthday today + Share Profile on |
| 5 | Profile completion (one pet, lowest %) | `ProfileCompletionCard` `:290-297` | Any incomplete pet |
| 6 | Care due dates (max 3; type, pet, status badge, due date) | `UpcomingCareSection` `:636-727`, selection in `lib/careRecordStatus.ts:118-143` | Always (empty text when none) |
| 7 | Quick actions: Care Records / Moments / Owner Settings | `QuickActions` `:729-757` | Always |
| 8 | Plan usage | `PlanSummaryCard` `:302-310` | Always |
| — | Zero-pet welcome | `ZeroPetWelcome` `:435-458` | No pets |
| — | Loading / error | `:189-223` | Text card / "Could not load your dashboard" + Try Again |

**Data loading** (`:90-142`): `getPets()` once, then for every active pet
`getPetRecords(pet.id)` **and** `getPetMoments(pet.id)` in parallel
(`:121-124`). Three pets = seven requests on every Dashboard open. Each list is
requested with `pageSize=100` (`services/recordService.ts:54`,
`services/momentService.ts:102`), the API maximum (`PagedQuery.cs:10`).
Secondary failures degrade per section, which is good.

`dashboard/loading.tsx` is a four-tile skeleton that no longer matches the
page's shape.

### 2.3 Pet management hub — `/pets/{id}`

`PetManagementTabs.tsx` → `OverviewTab` (`:203`): Profile completion, a
**Moments** summary (3 recent with thumbnails, audience badge, Add Moment /
"Moment Limit Reached"), **Recent care records** (3 recent by record date —
*not* by due date), the read-only **Sharing & Privacy** card, Smart Tags,
Memorial / history. Other tabs: Care Records (`RecordsManager`), Moments
(`PetMomentsManager`), Smart Tag (flagged).

The hub's care summary shows *history*; the Dashboard's shows *due items*. The
two never show the same idea twice — good — but neither offers "done".

### 2.4 Care Records

**Entity** `CareRecord` (`apps/api/MyPetLink.Api/Entities/CareMediaEntities.cs:99-116`):
`PetId`, `FulfillsCareRecordId`, `Type` (Vaccine, Deworming, Grooming, Vet
Visit, Medication, Allergy, Surgery, Lab Test, Other), `Title`, `CareName`,
`RecordDate`, `DueDate`, `Provider`, `Notes`, `PublicVisibility`
(Private / Public badge only), `ArchivedAt`, `DeletedAt`. Documents attach
through `MediaFileLink` (private bucket).

**API** `Controllers/CareRecordsController.cs`: list per pet (`:25`, filters
type / date range / archived), create (`:50`), get, update (PUT + PATCH),
archive (DELETE). **No owner-wide endpoint** — everything is per pet.

**Service rules** (`Services/CareRecordService.cs`):

| Rule | Line | Effect |
| --- | --- | --- |
| Record date cannot be in the future | `:423-456` | Future care must be a *due date*, never a record. Good fit for "Mark as Done = today". |
| Due date ≥ record date | `:458-467` | |
| Fulfilment: same pet, same type, target has a due date, target older, not already claimed, no cycle | `:480-556` | Completion semantics already exist |
| Duplicate fulfilment blocked by DB | `:132-136`, `:872-879`; index `MyPetLinkDbContext.cs:2307` | A double-tapped "Done" cannot create two completions |
| Archiving a target releases its fulfiller | `:254-287` | |
| Status derived on read, Malaysia day, 30-day "due soon" | `:798-819` | Mirrors `lib/careRecordStatus.ts:13-44` |
| **No create idempotency key** | — | Unlike Moments (`PetMemory.CreateIdempotencyKey`) |
| **No `RowVersion`** on `CareRecord` | — | Edits are last-write-wins |
| **`MaxCareRecords` is never read** | `Entities/PlanEntities.cs:37`; seeded 100 / 500 (`MyPetLinkDbContext.cs:3184,3200`) | Plan limit modelled but not enforced |

**Web** `RecordsManager.tsx`: records grouped by type (`:486-520`), add/edit in
a `FormDialog`, and an optional "**Completes a previous due item?**" radio list
(`:653-740`) fed by `getEligibleFulfillmentCandidates`
(`lib/careRecordStatus.ts:86-116`). `RecordCard.tsx` shows a status badge and a
"Completed" state when fulfilled. `ownerRoutes.petRecords(id, { create: true })`
opens the dialog directly (`RecordsManager.tsx:244-252`).

**What this means:** completing a due item today takes: open Records → pick pet
→ Add Record → choose the same type → type a title → set today's date → find
and tick the matching due item → optionally set the next due date → Save.
Eight steps for what the owner thinks of as one.

### 2.5 Care schedules and reminders

| Capability | Status | Evidence |
| --- | --- | --- |
| Next due date per record | **Exists** | `CareRecord.DueDate` |
| Overdue / due soon / upcoming | **Exists** (derived) | `CareRecordService.cs:798`, `careRecordStatus.ts:32` |
| "Completed by" link | **Exists** | `FulfillsCareRecordId` |
| Recurrence rule (every N weeks) | **Missing** | No field, no table |
| One-click Mark as Done | **Missing** (UX) | Fulfilment is buried in the full form |
| Owner-wide upcoming list | **Partial** | Dashboard shows 3 items, assembled client-side from per-pet lists |
| Calendar view | **Missing** | |
| Snooze / "stop tracking" | **Partial** | API supports `ClearDueDate` on update; no UI affordance |
| Reminder notifications | **Missing by design** | Premium Coming Soon; no sender, no scheduler (`communication-preferences.md`) |
| Reminder preferences | **Placeholder** | `OwnerProfile.NotificationPreferencesJson` (`Entities/AccountEntities.cs:83`), UI renders disabled |
| Server-side Malaysia day | **Duplicated, not shared** | `TimeSpan.FromHours(8)` / `MalaysiaToday` re-implemented in `CareRecordService`, `PetOccasionCalculator`, `PublicProfileService`, `BusinessReferenceGenerator` and ~15 document/email services |

### 2.6 Moments and photos

**Entity** `PetMemory` (`Entities/CareMediaEntities.cs:3-97`): primary `PetId`,
immutable `AuthorUserId`, `MomentDate` (the day it is *about*; can be
backdated), `PublishedAt`, `CreateIdempotencyKey`, `Title`, `Type` (11
categories incl. Birthday, Grooming Day, Vet Visit, Vaccination, Outdoor / Trip,
Funny Moment), `Caption`, `Visibility` (Only me / Shared publicly),
`CoverMediaFileId`, moderation fields. Additional subjects via `MomentPet`;
collaborators via `MomentCollaboration`.

**API** `MemoriesController.cs`: per-pet list (`:25`, filters *visibility* and
archived only — **no date-range filter**), create (`:45`), get, update, archive.
Create is idempotent and all-or-nothing (`MemoryService.cs:72-84`).

**Plan rule** (`MemoryService.cs:592-615`): only **private** Moments count
against `MaxPrivateMemoriesPerPet` (Free 10, Premium 100). Shared-publicly
Moments are uncapped. Media cap 5 per Moment on Free (`MAX_MOMENT_MEDIA`,
`types.ts`).

**Media storage** (`Services/MediaService.cs:1037-1045`): Moment images and
videos are stored in the **public** R2 bucket regardless of the Moment's
audience, under random object keys (`:937-939`). Thumbnails are generated for
public images (`:913-920`, `ImageDerivativeGenerator.cs`). Documents use the
private bucket and short-lived presigned downloads. R2 CORS is documented for
browser **PUT** only (`docs/cloudflare-r2-media-setup.md:77-100`).

**Web** `PetMomentsManager.tsx`, `MomentEditorDialog.tsx`, `PetMomentCard.tsx`,
`PetTimeline.tsx` + `lib/petTimeline.ts` (one timeline builder for owner and
Share Profile). `/moments` requires an explicit pet choice when there are
several pets (`GenericPetSection.tsx`).

### 2.7 Share Center, Share Cards, Share Profile

| Piece | Where | Notes |
| --- | --- | --- |
| Single share entry point | `components/share/ShareCenter.tsx` | Rule: no competing share rows anywhere (`AI_AGENT_REFERENCE.md` §7.10) |
| Share Card dialog | `components/share/PetShareCard.tsx` | Preview, variant chooser, native share with file, save, copy link; analytics on view / action |
| Card variants | `Services/PublicProfileSocialCardVariant.cs` | OpenGraph 1200×630, ShareCard / Birthday / Adoption 1080×1350; template-versioned cache keys |
| Renderer | `Services/PublicProfileSocialCardRenderer.cs` | SkiaSharp, QRCoder, brand logo resource, R2 image fetch with size/pixel/time limits (`:66-70`), in-memory cache + in-flight dedupe (`:96-118`), themed palette (`ShareCardPalette.cs`) |
| Endpoint | `PublicProfilesController.cs:49` `GET public/pets/{slug}/social-card.jpg` | **Anonymous**, public data only, edge-cached through `apps/web/edge/publicProfileEdge.ts` |
| Occasions | `PetOccasionCalculator.cs` (server), `lib/petOccasions.ts` (web) | Web exposes Birthday only; Adoption exists server-side |
| Native share helper | `lib/nativeShare.ts` | File sharing where supported, copy-link fallback |

### 2.8 Notifications and background work

| Mechanism | Where | Use today |
| --- | --- | --- |
| `OwnerNotification` (in-app) | `Entities/SocialGraphEntities.cs:305` | Community activity only (follow, like, comment, collaboration, moderation). Documented as deliberately not email. |
| `/notifications` page | `apps/web/src/app/notifications` | Community half; gated by `socialEnabled` |
| Email outbox + dispatcher | `EmailOutboxEntities.cs`, `EmailOutboxService.cs`, `EmailDispatchWorker.cs`, `EmailTemplateGate.cs` | Transactional: welcome, payment, shipping, merchant documents. Production-grade leasing/retry. No care type. |
| Hosted services | `Program.cs:528-530` | Email dispatch, payment-reservation expiry, Community restriction expiry. **No scheduler for owner engagement.** |

### 2.9 Plans and entitlements

| Limit | Free | Premium (Coming Soon) | Enforced? |
| --- | --- | --- | --- |
| Pets | 3 | 10 | Yes (`PetService.cs:562`) |
| Private Moments per pet | 10 | 100 | Yes (`MemoryService.cs:597`) |
| Media per Moment | 5 | 20 | Yes |
| Care records | 100 | 500 | **No** |
| Scan history days | 0 | 365 | Yes (Smart Tag history) |
| Care reminders | — | listed as Premium feature | Not built (`lib/planLimits.ts:64-80`) |

Web adopts server limits via `adoptServerPlanLimits` (`lib/planLimits.ts:36`).

### 2.10 Analytics

`apps/web/src/lib/analytics.ts`: GA4 via `gtag`, a **typed event catalogue with
per-parameter allowlists** — categorical values only, no pet names or ids.
Existing events relevant here: `page_view`, `moment_created`,
`care_record_created`, `share_card_viewed`, `share_card_shared`,
`share_card_action`, `completion_prompt_viewed`, `completion_action_clicked`.
Server timestamps (`CreatedAt` on Moments and care records) give a second,
tamper-proof activity signal without new tracking.

### 2.11 Design system

| Token / primitive | Where |
| --- | --- |
| Colours: `pet-cream #fff8f2` (page), `pet-vanilla #fff`, `pet-teal #1570ef` (brand blue), `pet-coral #ff7a6e`, `pet-apricot #ffe9de`, `pet-mint`, `pet-sage`, `pet-sky`, `pet-ink #0d1b3d`, `pet-muted #44506a`, `pet-border #f0dcd0` | `apps/web/src/app/globals.css:57-69` |
| Type: Poppins display, Noto Sans body | `globals.css:68-92` |
| Surfaces: `brand-card` (white 88%, heavy 0 18px 45px shadow), `brand-soft-card`, `brand-paw-dots` | `globals.css:158-185` |
| Reduced motion block | `globals.css:453` |
| Primitives | `CTAButton` (6 variants), `Badge` (warm / mint / teal / soft / danger), `EmptyState`, `PageHeader`, `PetAvatar`, `Icon`, `StatCard`, `SegmentedTabs`, `FormDialog`, `ConfirmDialog`, `DateInput`, `ServiceWakeUpState` (paw-dot loader) |
| Radius rhythm | 1rem rows · 1.25rem tiles · 1.35rem cards · 1.75rem hero cards |

The visual identity is already warm, rounded and cream-based. The proposal
below *uses* it; it does not introduce a new language.

---

## 3. Existing Feature Reuse Opportunities

| Need | Reuse this | Do **not** rebuild |
| --- | --- | --- |
| Mark care as done | `FulfillsCareRecordId` + unique index + validation; `RecordsManager` dialog with `?create=1` | A separate "task" or "reminder" entity |
| Next occurrence | The new record's own `DueDate` (the chain) | A recurrence engine (Phase 1) |
| Due status | `CareRecordService.DeriveStatus`, `lib/careRecordStatus.ts` | Any new status field |
| Upcoming list | `selectDashboardCareRecords` ordering rules | |
| Add Moment / Add Care / pet chooser | `GlobalAddMenu.tsx`, `MomentEditorDialog`, `MomentPetSelector` | A second create flow |
| Share anything | `ShareCenter`, `PetShareCard`, `lib/nativeShare.ts` | A new share sheet |
| Card drawing | `PublicProfileSocialCardRenderer` primitives, `ShareCardPalette`, brand logo resource, R2 fetch limits | A new image service, AI image generation, client-side canvas |
| Occasion logic | `PetOccasionCalculator`, `lib/petOccasions.ts` | |
| Photo thumbnails | `MediaFile.ThumbnailObjectKey` derivatives | |
| Moment audience copy | `lib/momentVisibility.ts` | New audience wording |
| Empty / loading / error | `EmptyState`, `ServiceWakeUpState`, existing retry cards | |
| Analytics | `trackEvent` + typed catalogue | A second analytics SDK |
| Future email reminders | Outbox, dispatcher, template gate (roadmap P1) | A second sender |

---

## 4. Dashboard Findings

### Q1. What does it display?

See §2.2. In short: greeting + three counters, pets, birthday card, one
completion nudge, three care due dates, three navigation tiles, plan usage.

### Q2. What is missing?

- **Any action on care.** Due items are read-only; "View all" drops the owner
  into a per-pet records list.
- **The care item title.** `ReminderItem` shows the *type* ("Vaccine") but not
  the record title or care name ("Rabies booster") (`DashboardClient.tsx:695-697`).
- **Anything about recent activity.** No recent Moments, no photos — the most
  emotionally rewarding content in the product never appears on Home.
- **Real quick actions.** The three tiles navigate to sections the nav already
  links to (`:735-754`). Add Moment / Add Care Record exist only in the header
  Add menu.
- **A sense of time.** Nothing says "this week".

### Q3. Reusable components

`DashboardPetCard`, `LostModeAlert`, `DashboardOccasionSection`,
`ProfileCompletionCard` (`compact`), `ReminderItem` (extend), `ShareCenter`,
`GlobalAddMenu` pet chooser, `MomentMediaThumbnail` (from the hub), `Badge`,
`CTAButton`, `EmptyState`, `PetAvatar`.

### Q4. Move / remove / combine / simplify

| Element | Recommendation | Why |
| --- | --- | --- |
| Stat tiles (Pets / Share Profiles / Moments) | **Remove** | Vanity counts; "Share Profiles: 2" prompts nothing. Replaced by "This week". |
| Quick actions (navigation) | **Replace** with three real actions: *Add Moment*, *Log Care*, *Share* | Navigation is already in the sidebar / bottom bar |
| Plan usage | **Show only near a limit** (≥ 80% of private Moments for any pet, or pets at max) — otherwise it lives in Settings | A meter at 1 of 3 pets is noise |
| Owner contact nudge + profile completion | **Combine into one "Next step" slot**, one card at a time, contact first | Two nudges compete today |
| Care due dates | **Promote** to "Coming up", add title + *Done* | It is the strongest return reason |
| Loading skeleton | **Match** the new shape | Current one shows four stat tiles |
| Your pets | **Keep**, unchanged behaviour | Already compact and rule-compliant |
| Celebrate today | **Keep** | Already conditional and shareable |
| Lost Mode alert | **Keep at the very top**, outside the greeting | Safety outranks everything |

### Q5. Staying useful without overwhelming

- **Never more than five content blocks** above the pet list on a phone; most
  days only two render (Coming up, This week).
- **Conditional sections disappear completely** when empty, except Coming up,
  which keeps a one-line empty state (it teaches the feature).
- **One nudge at a time.**
- **No charts, streaks, scores or badges.**

### Q6. What brings a user back

Two honest, recurring reasons: **"something needs doing"** (care due this
week) and **"something happened"** (this week's Moments, ready to look back on
and share). Both are tied to the owner's real pets and real dates, and both
already have data behind them.

---

## 5. Smart Care Planner Feasibility

### 5.1 Verdict

**Primarily a UX enhancement, plus two small API additions. No migration is
required for the MVP.**

### 5.2 Requirement-by-requirement

| Requirement | Existing | Missing work |
| --- | --- | --- |
| Upcoming care | Per-pet list + derived status | Owner-wide query (one request, not 2 × pets); see 5.4 |
| Recurring reminders | Chain via `FulfillsCareRecordId` + new `DueDate` | Recurrence *rule* — **defer** (roadmap P6, Premium, after P1) |
| One-click Mark as Done | Fulfilment validation + DB uniqueness | A focused "Done" sheet + an idempotent completion action |
| Auto-create the corresponding Care Record | Create endpoint accepts `fulfillsCareRecordId` | Server-side prefill (type, title, care name, provider) |
| Schedule next occurrence | `DueDate` on the new record | "When is the next one due?" step |
| Calendar / upcoming list | — | A grouped list (Overdue / This week / Later / Done recently). **No grid calendar in MVP.** |
| Overdue & completed | Derived status; "Completed" badge | Grouping and a short "Done recently" section |
| Multi-pet | Records are per pet | Owner-wide endpoint + pet filter chips |
| Optional reminder notifications | Outbox exists; preferences placeholder | **Out of this scope** — Premium P1 per roadmap |

### 5.3 Medical neutrality

Do not invent or pre-fill care intervals. The "next due" step offers:

1. **A date picker**, empty by default, labelled "From your vet card or
   clinic".
2. **"Same gap as last time"** — shown only when this pet's previous record of
   the same type carried both dates, and computed purely from *that owner's own
   data* (`previous.DueDate − previous.RecordDate`). Shown as the resulting
   date, e.g. "Same gap as last time · 21 Oct 2027".
3. **"No next date"** — a first-class choice.

No "+1 year" or "every 3 months" shortcuts, and no copy that implies a
recommended schedule. *(Open decision D7.)*

### 5.4 Backend additions (small)

**A. Owner-wide upcoming care** — `GET /api/v1/care/upcoming`
- Actor is the JWT subject; returns only the caller's **active** pets
  (exclude archived, deleted and memorial).
- Rows: active, not archived, `DueDate IS NOT NULL`, **not fulfilled** (no
  active record points at it).
- Window: all overdue + next N days (default 30) + optional cursor for "Later".
- Also returns "done recently" (records whose `FulfillsCareRecordId` is set
  and `RecordDate` within 14 days) so the planner can show progress without a
  second call.
- Fixes two current limits at once: the per-pet fan-out
  (`DashboardClient.tsx:121-124`) and the 100-row ceiling, which today orders
  by **record** date (`CareRecordService.cs:69-71`) — so an old record with a
  pending due date can fall off page one and silently disappear from the
  Dashboard for an owner with 100+ records on a pet.
- Suggested index: `CareRecords (PetId, DueDate) INCLUDE (...)` filtered to
  `DueDate IS NOT NULL AND ArchivedAt IS NULL AND DeletedAt IS NULL` —
  performance only; the query enforces every rule itself (AGENTS social rule 5
  applies equally here). Index = one migration; optional for MVP volumes.

**B. Complete a due item** — `POST /api/v1/care-records/{id}/complete`
- Body: `date` (defaults to Malaysia today, may not be future — existing rule),
  optional `nextDueDate`, optional `notes` / `provider`, optional
  `clientRequestId`.
- Creates the fulfilling record by copying `Type`, `Title`, `CareName`,
  `Provider` and `PublicVisibility` from the target, through the **existing**
  `CreateAsync` validation path (no second rule set).
- **Idempotent by meaning:** if an active record already fulfils the target,
  return it with `200` instead of failing. A double tap, a retry after a
  timeout, or two devices produce exactly one completion. The filtered unique
  index (`IX_CareRecords_FulfillsCareRecordId`) remains the final guarantee
  under concurrency; the service catches the violation
  (`CareRecordService.cs:872`) and re-reads the winner.
- Today a retried create with a fulfilment link fails with "already fulfilled"
  even when the first attempt succeeded — the UI would show an error for a
  success. B removes that.

**C. Stop tracking** — no new endpoint. Use the existing update with
`ClearDueDate = true` ("Not needed any more"). Note the existing integrity rule:
a due date that has already been fulfilled cannot be cleared
(`CareRecordService.cs:584-621`) — correct, and the UI should not offer it there.

**D. Shared Malaysia calendar helper** (prerequisite, also roadmap PREM-A) —
one `MalaysiaCalendar.Today(TimeProvider)` used by `CareRecordService`,
`PetOccasionCalculator` and the new endpoints, with tests at 16:00 UTC.

### 5.5 Editing, rescheduling, timezone, concurrency

| Topic | Finding | Recommendation |
| --- | --- | --- |
| Reschedule | Editing `DueDate` works today | "Change date" in the item menu → existing update |
| Edit a completion | Existing edit; fulfilment integrity enforced | Unchanged |
| Undo "Done" | Archive the fulfilling record → target becomes due again (`:254-287`) | Show a 6-second **Undo** toast after Done |
| Timezone | Malaysia (UTC+8) fixed on both sides; dates are `DateOnly` | Keep; no per-user timezone (audience is Malaysian; matches roadmap) |
| Concurrency | No `RowVersion` on `CareRecord` | Acceptable: single-owner records, completion protected by the unique index. Revisit with Family Access (P2). |
| Mock fallback | `recordService.ts` has a local path | Both new calls need local equivalents (AGENTS hard rule 2) |

### 5.6 Free / Premium enforcement

- The in-app planner, Mark as Done and next-date scheduling are **Free** —
  consistent with the roadmap ("the due-date data, the overdue badge, and the
  dashboard list stay Free forever").
- Each completion adds a record. A pet vaccinated, dewormed and groomed
  monthly gains ~25 records a year; the unenforced Free `MaxCareRecords = 100`
  would be reached in about four years. **Decide before enforcing it** (D5).
- Email reminders remain **Premium Coming Soon**. The planner may carry one
  quiet line — "Email reminders are coming with Premium." — never a button,
  checkout or upgrade flow (AGENTS hard rule 4).

### 5.7 Complexity

**Medium.** Two endpoints, one helper, one dialog, one list view, tests. No
schema change required.

---

## 6. Weekly Pet Recap Feasibility

### 6.1 The ten questions

1. **Can existing Moments and photos provide the data?** Yes.
   `PetMemories` (primary pet) ∪ `MomentPets` (additional subjects) for the
   week, with media via `MediaFileLink` → `MediaFile` (images with
   thumbnails). Missing: a **date-range filter** on the Moments list
   (`MemoryService.cs:25-70`) — the recap needs its own query anyway.
2. **Can Share Card functionality be reused?** Partly. Reuse the **drawing
   primitives** (SkiaSharp setup, palette, logo lockup, QR footer, R2 fetch
   with limits, JPEG encode) and the **web dialog** pattern of `PetShareCard`
   (preview → share / save / copy). Do **not** reuse the public
   `social-card.jpg` endpoint or its edge cache: they are anonymous and keyed
   by public code, and a recap contains owner-chosen private content.
3. **On demand?** Yes. A week of one pet is a handful of rows; assemble and
   render when the owner opens it.
4. **Scheduled background job?** **No.** The trigger is "the owner opened the
   app". A job would only be needed to *push* a recap (email/notification),
   which is Premium-delivery territory and deferred.
5. **No weekly activity?** Do not render a card. Show a warm empty state with
   *Add a Moment* and, if the previous week had activity, *See last week*.
   Never pad with fabricated stats.
6. **WhatsApp / Instagram / Facebook?** Yes, through the existing native
   share path: the JPEG travels as a file where the browser supports file
   sharing (most Android Chrome and iOS Safari), otherwise **Save image**.
   1080×1350 (4:5) suits Instagram feed, Facebook and WhatsApp. A 1080×1920
   Story variant is optional later.
7. **Multiple pets?** One recap per pet for MVP, picked with pet chips. A
   Moment tagged with several pets appears in each of their recaps. A
   household recap ("Our week") is deferred (D10).
8. **New tables?** **No** for MVP. Optional later: a `PetWeeklyRecapViews`
   row to remember "seen" state server-side — not required (client storage is
   enough for a dismiss flag).
9. **Preventing exposure of private media and care?** See 6.3.
10. **Lightweight and affordable?** Yes: no AI, no third-party service, no
    storage of generated cards (bytes returned with `no-store`, never written
    to R2), CPU-only render on the existing App Service, bounded by a rate
    limit and an in-memory cache keyed by the selection hash.

### 6.2 What the recap contains

| Element | Source | Rule |
| --- | --- | --- |
| Title "My week with Oyen" | `Pet.Name` | Pet name only — never an owner identity |
| Date range "13 – 19 Oct 2026" | Malaysia Monday–Sunday (D1) | |
| Photos (1–4) | Images from the week's Moments | Owner-selected; see 6.3 |
| Moment titles (≤ 3) | `PetMemory.Title` | Only for selected Moments |
| Care done (optional chips) | Fulfilling/created `CareRecord`s in the week | **Off by default**; generic label only ("Grooming", "Vet visit") — never title, notes, provider, documents |
| Milestones | `PetOccasionCalculator` (birthday / adoption day falling in the week) | Only when a real date matches |
| Counts | "3 Moments this week" | Only true counts, only when > 0; no streaks or scores |
| QR to Share Profile | Existing QR footer | Only when the Share Profile is on; **never** the Safety Profile |

Week membership uses `MomentDate` (the day it is *about*), falling back to
creation date only when no date was set (D2).

### 6.3 Privacy design

- **Owner-only endpoints.** `GET /api/v1/pets/{petId}/weekly-recap?week=YYYY-MM-DD`
  (summary JSON) and `POST /api/v1/pets/{petId}/weekly-recap/card` (JPEG).
  The pet must belong to the JWT subject; no user id accepted from the client.
- **Media allowlist re-validated on render.** Every requested media id must be
  a Ready image, linked to a non-archived, non-deleted, non-moderated Moment of
  *this* pet (primary or `MomentPets`) within the requested week. Anything else
  → 400. The client cannot smuggle another pet's or another owner's photo.
- **Defaults are conservative.** Preselect photos from **Shared publicly**
  Moments only. *Only me* Moments are listed, labelled "Only me", unticked. The
  owner may tick them — the image then leaves MyPetLink by the owner's own
  action (D3).
- **Care is never on the card unless ticked**, and then only as a category
  word. Private care (`PublicVisibility = Private`) is still allowed because
  the owner is the one sharing, but the toggle copy says so: "Show care
  done this week on the card".
- **Nothing is posted.** No Moment is created, nothing appears on the Share
  Profile or in Community. (A later "Post as a Moment" is a separate decision.)
- **No public URL is created** for the card; it is not uploaded, cached at the
  edge, or indexable.
- **Lost Mode / memorial / archived pets:** no recap prompt. A lost pet's
  Dashboard should be about finding the pet; a memorial pet's recap needs its
  own, gentler product decision.
- **Pre-existing posture to note (not introduced here):** Moment images,
  including *Only me* ones, live in the public R2 bucket behind unguessable
  keys (`MediaService.cs:1037`). The recap does not widen that, but it is worth
  recording for a future privacy review.

### 6.4 Rendering choice

| Option | Verdict |
| --- | --- |
| **Server SkiaSharp, owner-authenticated (recommended)** | Reuses renderer code, brand fonts and logo; consistent output on every phone; R2 fetch already solved |
| Client `<canvas>` | R2 CORS allows PUT only — cross-origin photos would taint the canvas; fonts vary by device; harder to test |
| Third-party image / AI service | Cost, data sharing, no need |

Emoji in rendered text: SkiaSharp needs a colour emoji font to draw 🐱
reliably. Use a drawn paw glyph in the card instead, and keep emoji out of the
image (the UI can still use a single emoji in copy if wanted).

### 6.5 Complexity

**Medium–Large** (largest of the three): a new card template with layout
tests, two endpoints, selection UI, mock-path parity, template versioning like
the existing cards.

---

## 7. UX/UI Design Proposal and Wireframes

### 7.0 Visual direction (all three)

- **Page:** `pet-cream` background; content on **white** cards.
- **Cards:** keep `brand-card` for top-level sections, but **lighten the
  shadow for new list rows** — rows are flat `bg-pet-cream` / white with a
  `pet-border` hairline, as the hub already does. Avoid stacking heavy shadows.
- **Accent:** `pet-teal` for primary actions and "this week"; `pet-coral` only
  for celebration and Lost Mode; `danger` badge only for Overdue.
- **Type:** Poppins for section titles and the recap title; Noto Sans
  everywhere else. Section titles 18–20px, row titles 14–15px bold, meta 12px.
- **Shape:** 1.75rem hero, 1.35rem cards, 1rem rows, full-pill buttons.
- **Photography first:** wherever a Moment is shown, the photo leads; text is
  secondary. Square thumbnails 56–64px in lists, 4:5 in the recap.
- **Motion:** 150–200ms ease-out for the Done check, row collapse and toast;
  nothing loops. All of it disabled under `prefers-reduced-motion` (extend the
  existing block at `globals.css:453`).
- **Accessibility:** 44px minimum targets (existing `min-h-11` convention);
  status never by colour alone (badge text); Done announces via `aria-live`;
  dialogs use the existing `useModalDialogFocus`; recap image has generated
  alt text ("Oyen's week, 13 to 19 October, three photos").
- **Tone:** short, warm, plain English that Malaysian owners use every day.
  No "Memory" in new copy (use Moment). No technical words.

### 7.A Enhanced Owner Dashboard

**Information hierarchy**

1. Lost Mode alert *(conditional, top)*
2. Greeting + pet chips
3. **Coming up** — care needing attention
4. **This week** — recent Moments + recap entry
5. Your pets *(unchanged)*
6. Celebrate today *(conditional, unchanged)*
7. Next step — one nudge *(conditional)*
8. Plan note *(conditional, near limits only)*

**Mobile (375px)**

```text
┌───────────────────────────────────┐
│ ⚠ Mochi is in Lost Mode     Review│  ← only when true
├───────────────────────────────────┤
│ Good evening, Kai                 │
│ Here's what's happening with      │
│ your pets this week.              │
│                                   │
│ (All pets) (●Oyen) (●Mochi)       │  ← chips; "All pets" default
├───────────────────────────────────┤
│ Coming up                View all │
│ ┌───────────────────────────────┐ │
│ │ [💉] Rabies booster   OVERDUE │ │
│ │      Oyen · Due 12 Oct        │ │
│ │                     [ Done ✓ ]│ │
│ ├───────────────────────────────┤ │
│ │ [✂] Grooming        THIS WEEK │ │
│ │      Mochi · Sat, 25 Oct      │ │
│ │                     [ Done ✓ ]│ │
│ └───────────────────────────────┘ │
├───────────────────────────────────┤
│ This week                         │
│ ┌────┐┌────┐┌────┐┌────┐          │
│ │ 📷 ││ 📷 ││ 📷 ││ +  │          │  ← Moment thumbnails, last tile = Add
│ └────┘└────┘└────┘└────┘          │
│ ┌───────────────────────────────┐ │
│ │ Oyen's week is ready  →       │ │  ← recap entry (Phase 3)
│ │ 3 Moments · 13–19 Oct         │ │
│ └───────────────────────────────┘ │
├───────────────────────────────────┤
│ [+ Moment]  [+ Care]  [↗ Share]   │  ← real quick actions
├───────────────────────────────────┤
│ Your pets               Manage    │
│ ┌───────────────────────────────┐ │
│ │ (o) Oyen  · Public            │ │
│ │ Cat · Domestic Short Hair · 3y│ │
│ │ [ Share ]          [ View ]   │ │
│ └───────────────────────────────┘ │
│ ...                               │
├───────────────────────────────────┤
│ Next step                         │
│ Add Mochi's birthday so we can    │
│ celebrate with you.   [ Add ]     │
└───────────────────────────────────┘
│ Home │ Pets │ Moments │ More │     ← unchanged bottom bar
```

**Desktop (≥1280px)** — two columns; the action column on the left, the
emotional column on the right.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Good evening, Kai           (All pets) (Oyen) (Mochi)   [+ Add ▾]    │
├───────────────────────────────────────┬──────────────────────────────┤
│ Coming up                   View all  │ This week                    │
│ ┌───────────────────────────────────┐ │ ┌────────┬────────┐          │
│ │ Rabies booster · Oyen   OVERDUE   │ │ │  big   │ small  │          │
│ │ Due 12 Oct          [ Done ✓ ]    │ │ │ photo  ├────────┤          │
│ │ Grooming · Mochi     THIS WEEK    │ │ │        │ small  │          │
│ │ Sat 25 Oct          [ Done ✓ ]    │ │ └────────┴────────┘          │
│ │ Deworming · Oyen     LATER        │ │ Oyen's week is ready →       │
│ │ 14 Nov              [ Done ✓ ]    │ │                              │
│ └───────────────────────────────────┘ │ [+ Moment] [+ Care] [Share]  │
├───────────────────────────────────────┴──────────────────────────────┤
│ Your pets (2-up grid, unchanged)                                     │
├──────────────────────────────────────────────────────────────────────┤
│ Celebrate today (conditional) · Next step (conditional)              │
└──────────────────────────────────────────────────────────────────────┘
```

**Primary CTAs:** *Done* on each care row; *Add Moment*; *Open recap*.

**Pet chips:** "All pets" is the default and is never silently replaced by a
single pet (existing rule). Choosing a pet filters Coming up and This week and
pre-selects that pet for *+ Moment* / *+ Care*. With one pet, chips are hidden.
Selection is remembered per device only (localStorage, wrapped in try/catch).

**Empty states**

| Situation | Copy |
| --- | --- |
| No pets | Unchanged `ZeroPetWelcome` |
| No care dates | "Nothing due. Add your pet's next vaccination or grooming date and we'll keep it here." · *Add care date* |
| No Moments this week | "No Moments this week yet. Snap something small — a nap counts." · *Add Moment* |
| New owner, day one | Coming up + This week both in their empty form; *Next step* shows the profile-completion card |

**Loading:** replace `dashboard/loading.tsx` with a skeleton of greeting →
three care rows → four thumbnails (no fake stat tiles). Keep
`ServiceWakeUpState` for a waking database.

**Errors:** pets failing keeps today's full-page retry. Care or Moments failing
shows an inline row — "We couldn't load care dates right now. *Try again*" —
and never "nothing due" (a wrong reassurance about a vaccination is the error
that matters, mirroring the Community-status rule in `product-model.md`).

**Smart Tag:** not added. The pet card already reaches Smart Tags; a tag only
earns Dashboard space when it needs the owner (e.g. delivered but not
activated) — a later, conditional row, if at all.

**Stays unchanged:** navigation, header Add menu, pet card behaviour, Share
Center as the only share entry, Lost Mode alert copy, birthday card, routes.

**Proposed components:** `DashboardGreeting`, `PetFilterChips`,
`CareComingUpList` + `CareDueRow` (shared with the planner), `ThisWeekStrip`,
`DashboardQuickActions` (reusing `GlobalAddMenu` pet chooser),
`DashboardNextStep` (wraps the two existing nudges).

**Greeting name** (D6): the Account `DisplayName` is private to the owner and
appears only on their own Dashboard — permitted, but it must never flow into a
recap, card or any public surface.

### 7.B Smart Care Planner

**Where it lives:** inside the existing **Care Records** section — no new nav
item. `/records` and `/pets/{id}/records` gain two tabs via `SegmentedTabs`:
**Upcoming** (new, default when any due item exists) and **All records**
(today's grouped list, unchanged). `/records` stops forcing a pet choice for
Upcoming (it is owner-wide with chips); All records keeps the explicit choice.

**Mobile — Upcoming**

```text
┌───────────────────────────────────┐
│ Care                              │
│ [ Upcoming ] [ All records ]      │
│ (All pets) (Oyen) (Mochi)         │
├───────────────────────────────────┤
│ OVERDUE                           │
│ ┌───────────────────────────────┐ │
│ │ 💉 Rabies booster             │ │
│ │ Oyen · was due 12 Oct         │ │
│ │ [ Done ✓ ]          ⋯         │ │  ⋯ = Change date / Not needed / Edit
│ └───────────────────────────────┘ │
│ THIS WEEK                         │
│ │ ✂ Grooming · Mochi · Sat 25 Oct │
│ │ [ Done ✓ ]          ⋯           │
│ LATER                             │
│ │ 💊 Deworming · Oyen · 14 Nov    │
│ │ 🩺 Annual check-up · Mochi · Jan│
│ DONE RECENTLY                     │
│ │ ✓ Flea treatment · Oyen · 18 Oct│
├───────────────────────────────────┤
│ Email reminders are coming with   │
│ Premium.                          │  ← muted, no button
│              [ + Add care date ]  │
└───────────────────────────────────┘
```

**"Done" sheet** (bottom sheet on phone, small dialog on desktop — reuses
`FormDialog`):

```text
┌───────────────────────────────────┐
│ Mark as done                    ✕ │
│ Rabies booster · Oyen             │
│                                   │
│ Done on                           │
│ [ Today, 20 Oct ▾ ]               │
│                                   │
│ When is the next one due?         │
│ ( ) Same gap as last time         │
│     20 Oct 2027                   │  ← only if derivable
│ ( ) Pick a date  [ dd/mm/yyyy ]   │
│ (•) No next date                  │
│ From your vet card or clinic.     │
│                                   │
│ ▸ Add a note or clinic (optional) │
│                                   │
│ [        Save as done        ]    │
└───────────────────────────────────┘
→ toast: "Rabies booster done for Oyen. Undo"
```

**Desktop:** the same list at max-width ~720px, centred, with the pet chips in
the header row; no grid calendar. A month grid is explicitly deferred — dense,
mostly empty, and poor on phones.

**Primary CTAs:** *Done*, *Add care date*.

**Empty:** "No care dates yet. Add the next vaccination, deworming or grooming
date from your vet card, and it will show up here." · *Add care date*.

**Loading:** three skeleton rows. **Error:** "We couldn't load your care dates
right now." · *Try again* — never an empty "all clear".

**Sample content:** Oyen (cat) — Rabies booster overdue 12 Oct, Deworming 14
Nov; Mochi (dog) — Grooming Sat 25 Oct at "Pawsome Grooming PJ", Annual
check-up Jan 2027 at "Klinik Haiwan Damansara".

**Also used on the Dashboard:** `CareDueRow` is the same component in both
places so behaviour cannot drift.

**Stays unchanged:** the record form (still available for full edits), record
grouping in All records, documents, visibility rules, the fulfilment picker for
manual linking.

### 7.C Weekly Pet Recap / Share Card

**Entry points:** the Dashboard *This week* card and the pet hub Overview's
Moments card ("See Oyen's week"). Opens a **full-screen sheet** (phone) /
large dialog (desktop) — no new route, which suits the static export.

**Flow:** *Review* → *Choose photos* → *Preview card* → *Share / Save*.

**Mobile — review + choose**

```text
┌───────────────────────────────────┐
│ ✕   Oyen's week                   │
│     13 – 19 Oct 2026   ‹  ›       │  ← previous / next week
├───────────────────────────────────┤
│ ┌──────────┐┌──────────┐          │
│ │  photo ✓ ││  photo ✓ │          │
│ │ Sunbath  ││ New box! │          │
│ └──────────┘└──────────┘          │
│ ┌──────────┐┌──────────┐          │
│ │  photo   ││  photo ✓ │          │
│ │ Only me  ││ Vet day  │          │  ← Only me unticked by default
│ └──────────┘└──────────┘          │
│ Choose up to 4 photos.            │
├───────────────────────────────────┤
│ This week                         │
│ • 3 Moments                       │
│ • Grooming done                   │
│ [ ] Show care done on the card    │  ← off by default
├───────────────────────────────────┤
│ [       Create card       ]       │
└───────────────────────────────────┘
```

**Rendered card (1080×1350, 4:5)**

```text
┌─────────────────────────────┐
│  MyPetLink logo             │
│                             │
│  My week with Oyen          │  Poppins, pet-ink
│  13 – 19 Oct 2026           │  Noto Sans, muted
│ ┌───────────────┬─────────┐ │
│ │               │  photo  │ │
│ │   hero photo  ├─────────┤ │  rounded 32px, 12px gutters
│ │               │  photo  │ │
│ └───────────────┴─────────┘ │
│  ☀ Sunbath  · 📦 New box!   │  up to 3 Moment titles (glyphs drawn, not emoji)
│  (Grooming ✓)               │  only if the owner ticked it
│                             │
│  ┌─────┐  Scan to see       │
│  │ QR  │  Oyen's profile    │  only if Share Profile is on
│  └─────┘  mypetlink.com.my  │
└─────────────────────────────┘
```

Palette follows the pet's existing profile theme via `ShareCardPalette`
(cream background, white photo frames, brand-blue accents), so the recap feels
like the pet's own Share Card.

**Preview / share step:** reuses the `PetShareCard` dialog pattern — preview,
*Share* (native, with file), *Save image*, and *Copy profile link* only when
the Share Profile is on.

**Empty week:**

```text
│  🐾  Quiet week for Oyen          │
│  Add a Moment and it will appear  │
│  in Oyen's week.                  │
│  [ Add Moment ]   See last week › │
```

**Loading:** photo-grid skeleton; card preview uses the existing "preparing
your card" state. **Error:** "We couldn't make the card right now. *Try
again*" — selection preserved.

**Desktop:** two panes — selection left, live preview right.

**Copy samples:** "Oyen's week is ready" · "A cosy week for Oyen — 3 Moments" ·
"Quiet week for Mochi". No superlatives, no invented stats.

**Stays unchanged:** Share Center (the recap is reached from the Dashboard and
hub, not added as a competing row in the Share Center — see D9), existing
card variants and their cache/versioning.

**Proposed components:** `WeeklyRecapSheet`, `RecapPhotoPicker`,
`RecapSummary`, reuse `PetShareCard`-style preview; server
`PetWeeklyRecapService`, `PetWeeklyRecapCardRenderer` (sharing primitives with
`PublicProfileSocialCardRenderer`).

---

## 8. Architecture and Security Considerations

### 8.1 Per-feature assessment

| | A. Dashboard | B. Care Planner | C. Weekly Recap |
| --- | --- | --- | --- |
| Reuse | Pet card, nudges, Share Center, Add menu, care selection | Fulfilment model, validation, status, form dialog | Renderer primitives, palette, logo, R2 fetch, share dialog, occasions |
| Frontend | Restructure `DashboardClient`; new small components; skeleton | Upcoming tab, Done sheet, row menu, chips, toast | Sheet, picker, preview |
| API | None in phase 1; adopt `care/upcoming` in phase 2 | `GET care/upcoming`, `POST care-records/{id}/complete`, shared Malaysia helper | `GET pets/{id}/weekly-recap`, `POST …/weekly-recap/card` |
| Database | None | None (optional index) | None |
| Migration | None | Optional (index only) → regenerate root `migration.sql` if added | None |
| Performance | Today: 1 + 2×pets requests. Phase 2 cuts care to one request | One indexed query per owner | One query per open; render ≈ hundreds of ms CPU; in-memory cache by selection hash; rate limit |
| Security | Unchanged authorization | JWT subject only; ownership in query; active pets only | JWT subject; media allowlist re-validated; `no-store`; no public URL |
| Privacy | Account name on owner's own page only | Care never leaves the portal | Conservative defaults (§6.3) |
| Premium | Plan note near limits only | Free; reminders stay Coming Soon | Free |
| Ops cost | Nil | Nil | Small CPU; no storage, no third parties |
| Tests | `DashboardClient.test.tsx` updates; empty/error states; multi-pet; Lost Mode first | Service tests for complete idempotency, concurrency (unique index), Malaysia boundary, archived/memorial pets excluded; web tests for sheet + undo; mock parity | Ownership/allowlist tests, cross-pet and cross-owner media rejection, moderated/archived Moment exclusion, week boundary, layout tests like `PublicProfileSocialCardTests.cs`, template version |
| Complexity | **S–M** | **M** | **M–L** |

### 8.2 Cross-cutting rules this work must keep

- **Actor = JWT subject** for every new endpoint (AGENTS social rule 6 —
  applied as good practice here too).
- **Never collapse identities**: recap shows the pet's name only; no
  `OwnerDisplayName`, no Community handle, no account name.
- **Share Profile independence**: the recap's QR depends only on
  `IsPublicProfileEnabled` — not on Community.
- **Safety Profile untouched**: no recap or planner element links to `/q/`.
- **Mock fallback parity** for every new data call (AGENTS hard rule 2).
- **Route strings via `routes.ts`**; no hardcoded paths.
- **No new App Settings** unless a value genuinely needs deployment ownership;
  recap limits (max photos 4, rate limit) are code constants or typed options
  per `configuration-governance.md`.
- **A feature flag** for each owner-facing piece is advisable
  (`NEXT_PUBLIC_CARE_PLANNER_ENABLED`, `NEXT_PUBLIC_WEEKLY_RECAP_ENABLED`),
  defaulting off, and added to the release-flag verification so Production
  states them explicitly (per existing launch posture).

---

## 9. Free vs Premium Recommendations

| Capability | Plan | Note |
| --- | --- | --- |
| Enhanced Dashboard | Free | |
| Upcoming care list, Mark as Done, next due date | **Free** | Matches roadmap: the data and the list stay Free |
| "Same gap as last time" | Free | Owner's own data |
| Email / WhatsApp care reminders | **Premium — Coming Soon** | Roadmap P1; one muted line only |
| Recurrence rules ("every 3 months") | Premium, later | Roadmap P6, after P1 |
| Weekly Recap (per pet) | **Free** | An acquisition engine — every share carries the brand and, optionally, a QR |
| Household recap, Story size, monthly/yearly recap | Free, later | Year in Review already planned Free-later (roadmap F4) |
| Premium themes on the recap card | Premium, later | `AllowsAdvancedThemes` exists |

**Watch-out:** the Free cap of **10 private Moments per pet** combined with
the editor's *Only me* default will block a weekly habit within ~10 weeks. The
API's own message already says sharing publicly does not use the allowance
(`MemoryService.cs:612-614`). Before Phase 3, decide whether to (a) explain
this clearly at the moment of creation, (b) raise the Free private cap, or (c)
accept it as the Premium lever (D4). Do not silently change the default
audience — that is a privacy decision, not a growth one.

---

## 10. Retention and Analytics Recommendations

### 10.1 Expected effect

| Metric | Driver | Expectation (hypothesis, not measured) |
| --- | --- | --- |
| Weekly active owners | "Coming up" + "This week" give two reasons to open Home | Main lever |
| 7-day retention | Planner rows created at onboarding come due inside the first month | Moderate |
| 30-day retention | Due dates and weekly recap repeat monthly / weekly | Strongest |
| Care completion | Done in one tap from Home | High |
| Moments creation | Thumbnails strip + recap reward | Moderate; capped by D4 |
| Share Card usage | Recap is a new, fresher card each week | High |
| Organic acquisition | Recap image + optional QR seen on WhatsApp / IG | Moderate |

No streaks, points or artificial rewards. Return visits should follow real
pet life: care that is due, and photos worth looking back on.

### 10.2 Minimal event model (extends `lib/analytics.ts`)

Add to the typed catalogue, with allowlisted categorical values only — no pet
names, ids, dates or free text:

| Event | Parameters | Question it answers |
| --- | --- | --- |
| `dashboard_viewed` | `has_due_care: "yes"\|"no"`, `has_week_moments: "yes"\|"no"` | Is Home showing something useful? |
| `care_done` | `source: "dashboard"\|"planner"`, `record_type` (existing enum), `timing: "early"\|"on_time"\|"overdue"` | Is one-tap completion used, and when? |
| `care_next_due_set` | `method: "same_gap"\|"picked"\|"none"` | Do chains continue? |
| `care_done_undone` | `source` | Mis-taps / trust |
| `weekly_recap_opened` | `source: "dashboard"\|"pet_hub"`, `state: "has_activity"\|"empty"` | Reach and empty rate |
| `weekly_recap_card_created` | `photo_count: "1"\|"2_3"\|"4"`, `includes_care: "yes"\|"no"` | What owners choose |
| `share_card_shared` / `share_card_action` | add `"weekly_recap"` to `AnalyticsCardVariant` | Reuses existing share events |

**Server-side truth, no new tracking:** weekly counts of owners with ≥1 new
Moment or care record (`CreatedAt`), and the share of due items fulfilled
within 7 days of their due date — both answerable from existing tables via an
Admin report later. Retention cohorts (7/30-day) come from GA4 on the existing
`page_view`.

---

## 11. Implementation Phases

Each phase is independently shippable and reversible. **None starts without
explicit approval.**

### Phase 0 — Decisions and prep (Small)
- Settle D1–D10 (§13).
- Shared server `MalaysiaCalendar` helper + boundary tests; migrate
  `CareRecordService` and `PetOccasionCalculator` to it (no behaviour change).
- Dependencies: none. Risk: very low.

### Phase 1 — Dashboard quick wins (Small–Medium · frontend only)
- Remove stat tiles; greeting + pet chips.
- "Coming up" with record **title**, pet, status, and *Done* that opens the
  existing record dialog **prefilled** (type, title, care name, today, the
  fulfilment target) — reuses `?create=1` plus new prefill parameters through
  `routes.ts`.
- "This week" thumbnails strip from data the Dashboard already loads.
- Real quick actions via the `GlobalAddMenu` pet chooser.
- One "Next step" slot; plan note only near limits; new skeleton; inline
  section errors.
- No API, no migration. Update `DashboardClient.test.tsx`.
- **Quick win.** Risk: low (layout only; existing tests pin current
  behaviour and will need deliberate updates).

### Phase 2 — Smart Care Planner (Medium · small backend)
- `GET /api/v1/care/upcoming`, `POST /api/v1/care-records/{id}/complete`
  (idempotent), mock equivalents.
- Upcoming tab, Done sheet with "next due" step and "Same gap as last time",
  Undo, Change date, Not needed any more.
- Dashboard switches to the owner-wide endpoint (removes per-pet care fan-out).
- Optional filtered index migration (regenerate root `migration.sql`).
- Feature flag, default off.
- Dependencies: Phase 0. Risk: low–medium (care data is safety-adjacent;
  wrong "all clear" must be impossible — error states tested).

### Phase 3 — Weekly Pet Recap MVP (Medium–Large · backend + renderer)
- `GET /api/v1/pets/{petId}/weekly-recap`, `POST …/weekly-recap/card`.
- New card template sharing renderer primitives; template version constant;
  layout tests.
- Recap sheet, photo picker, preview/share via existing patterns.
- Rate limit policy on the render endpoint; in-memory cache by selection hash.
- Feature flag, default off.
- Dependencies: Phase 0; D1–D4, D8. Phase 1 provides the entry point. Risk:
  medium (privacy defaults, render performance on App Service).

### Optional enhancements (after evidence)
- "Add to calendar" (`.ics`) for a care date — free, no infrastructure, but a
  product call against Premium reminders (D8).
- Household recap; Story-size card; "Post as a Moment" from a recap.
- Adoption-day card on the web (server variant already exists).
- Owner-wide Moments-this-week endpoint to remove the Moments fan-out.

### Defer
- Email/WhatsApp reminders (roadmap P1, Premium).
- Recurrence rules (roadmap P6).
- Grid calendar.
- Scheduled recap generation or recap push notifications.
- Per-owner timezones.
- Any AI captioning or image generation.

---

## 12. Estimated Complexity

| Feature | Existing Support | Missing Work | Complexity | Recommendation |
|---|---|---|---|---|
| A. Dashboard enhancement | Dashboard, pet cards, Lost Mode alert, birthday card, completion nudge, care selection, Add menu, Share Center | Restructure; real actions; "This week" strip; one nudge slot; skeleton and inline errors | **S–M** (frontend only) | **Do first** |
| B. Smart Care Planner | Due dates, Malaysia-day status, fulfilment link with unique index, record dialog | Owner-wide upcoming endpoint; idempotent complete action; Done sheet; Upcoming tab; Malaysia helper | **M** (no schema change) | **Do second** |
| C. Weekly Pet Recap | Moments + media + thumbnails, SkiaSharp renderer, palette, share dialog, native share | Owner-auth summary + render endpoints; new template; selection UI; privacy defaults; rate limit | **M–L** (no schema change) | **Do third**, after D3/D4 |
| Email care reminders | Outbox, dispatcher, gate | Scheduler, template, preferences, dedupe columns | L (roadmap P1) | **Defer** — Premium |
| Recurrence rules | Completion chain | Rule model + scheduler integration | M–L (roadmap P6) | **Defer** |

---

## 13. Risks and Open Decisions

### Risks

| Risk | Mitigation |
| --- | --- |
| A care list that wrongly shows "nothing due" | Inline error states never fall back to empty; tests for partial failure |
| Double completion | Idempotent complete + existing filtered unique index |
| Dashboard truncation at 100 records/pet | Owner-wide upcoming endpoint ordered by due date |
| Private photo on a shared card | Public-only preselection, explicit "Only me" label, server allowlist re-check |
| Care details leaking into an image | Care off by default; category words only |
| Free private-Moment cap blocks the habit | Decide D4 before Phase 3 |
| Render CPU on App Service | Cache, rate limit, 4-photo cap, existing fetch limits |
| Mock/API drift | Mock paths in the same PRs; tests for both |
| Breaking pinned Dashboard tests | Planned, deliberate test updates in Phase 1 |
| Scope creep into reminders | Explicitly out; one muted line only |

### Open decisions (owner/product)

| # | Decision | Recommended default |
| --- | --- | --- |
| D1 | Week = Malaysia Monday–Sunday, or rolling 7 days? | Monday–Sunday (stable, nameable "13–19 Oct") |
| D2 | Moment week membership by Moment date or creation date? | Moment date |
| D3 | May *Only me* photos be selected for a recap? | Yes, unticked by default and labelled |
| D4 | Free private-Moment cap vs weekly habit | Explain at creation now; revisit cap with data |
| D5 | Enforce `MaxCareRecords`? At what Free value? | Not before Phase 2 data; if enforced, exclude completions or raise Free |
| D6 | Greet by account display name? | Yes, owner's own Dashboard only |
| D7 | "Same gap as last time" acceptable as non-medical? | Yes, labelled as the owner's own previous gap |
| D8 | Offer `.ics` "Add to calendar" for free? | Defer; decide with Premium reminder pricing |
| D9 | Add "Weekly recap" inside the Share Center? | No for MVP — keep the Share Center's four-choice first level |
| D10 | Household (multi-pet) recap? | Defer until per-pet usage is known |
| D11 | Rename nav "Care Records" → "Care" when the planner lands? | Yes, label only; routes unchanged |

---

## 14. Final Recommendation

**Can all three enhancements be delivered using MyPetLink's current
architecture without major redevelopment?** **Yes.** None needs a new service,
queue, worker, third-party API or database table. The Dashboard pass is
frontend only; the Care Planner needs two small endpoints over an existing
completion model; the Weekly Recap needs two owner-authenticated endpoints and
one new template on the existing SkiaSharp renderer. The only possible
migration in the whole plan is an optional performance index.

**Implement the Dashboard enhancement first.** It is the cheapest, carries no
data or deployment risk, and it is the surface every returning owner sees — the
other two features depend on it for discovery. Its "Done" action can ship
immediately by prefilling the existing record dialog, then be upgraded in place
by the Phase 2 completion endpoint. The Care Planner follows because it creates
the most dependable reason to return (real due dates), and the Weekly Recap
comes third because it carries the most privacy decisions and the most
implementation work.

---

## Appendix — Working tree status and change confirmation

Recorded at the end of this audit (see the session's final `git status`).

- **Created:** `docs/audits/pet-owner-portal-engagement-audit-2026-10-20.md`
  (this file, the only change; `docs/audits/` did not exist before).
- **Not modified:** any application code, tests, database schema, migrations,
  `migration.sql`, configuration, feature flags, or deployment files.
- **Not performed:** dependency installs, builds, migrations, commits, pushes,
  branch switches, stashes, resets or deploys.
- Pre-existing uncommitted Consignment, Merchant, marketing and configuration
  changes were left exactly as found.
