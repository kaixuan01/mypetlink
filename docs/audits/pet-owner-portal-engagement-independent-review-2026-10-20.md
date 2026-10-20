# MyPetLink — Independent Portal Engagement Audit Review

**Date:** 20 October 2026, Malaysia time  
**Reviewed:** `pet-owner-portal-engagement-audit-2026-10-20.md`  
**Source baseline:** `main`, `808296d83dd21574528b164a49d5be5ffa26e1b3`, including the working tree as found  
**Scope:** Dashboard Enhancement, Smart Care Planner, Weekly Pet Recap. Merchant Partnership is excluded.  
**Status:** Review only. No implementation is approved by this report.

## 1. Executive Verdict

**All three features are feasible on the existing Next.js/.NET/SQL Server infrastructure. The original implementation sequence is not ready to approve unchanged.** Reuse the Dashboard, care-record fulfilment relationship, Share Center and SkiaSharp stack. Do not introduce a task table, recap table, scheduler, recurrence engine, new UI library or external rendering service for the MVP.

**Phase 1 Dashboard Enhancement: NO-GO as currently specified; conditional GO after the four Phase 1 gates in section 11 are settled.** The principal blocker is correctness: today's first-page care list can omit pending dates, and failed reads can look like an empty list. Moving that same information into a more prominent card labelled “Nothing due” would increase false reassurance. The safe query/completeness work belongs before, or within, Phase 1.

The most material corrections to Claude's audit are:

| Finding | Independent verdict | Consequence |
| --- | --- | --- |
| Pending care can fall outside 100 records | Confirmed, including a second failure mode involving an omitted completing record | Resolve before the redesigned care panel ships |
| Only Me media goes into public R2 storage | Confirmed in source; private-bucket download authorization does not apply to those objects | Separate existing security issue; a release decision for any new private-content export |
| Free private Moments are capped at 10 | Confirmed as the seeded limit and service rule; live plan values were not queried | Do not use publicity as the way around a private-storage limit |
| Media-per-Moment limits are enforced | Incorrect for the inspected API write path | Storage-cost assumptions need correction |
| A new care lookup index may be needed | Existing `(PetId, DueDate)` index was overlooked | Start with the existing schema and measure |
| The existing create link opens a prefilled completion form | Not implemented: it currently opens an empty form | Phase 1 includes behavior and validation work, not just layout |
| A unique index solves completion concurrency | Only duplicate target claims are protected | Target edits, archive, retries after Undo and request conflicts still need rules |
| The renderer already supplies brand fonts and reusable primitives | Same rendering stack is reusable; helpers are private and text currently uses Arial | A small extraction and a new composition are real work |
| Existing GA4 can support retention reporting now | Deployed ID and script confirmed, but a deployed command-queue defect was found | Repair and verify delivery before interpreting retention metrics |

**Recommended first release:** a modest refinement of the existing Dashboard, with pet identity near the top, truthful care states, contextual “Log as done”, and a short recent-Moments strip. The planner follows with a bounded owner-wide query and carefully defined completion. Recap starts per pet, on demand, with public-content export only; private selection requires a separate explicit decision.

### Review method and limits

Read the repository and web agent rules, canonical product model, social foundation, owner-sharing architecture, owner portal flow, configuration governance, access-management rules, communication preferences and growth roadmap. Inspected actual controllers, services, DTOs, entities, EF mappings, migrations, frontend components and existing tests. The requested `Project-design-doc.md` is absent from the non-artifact source tree; the available `implementation-plan.md` is `docs/backend/implementation-plan.md` and is explicitly historical. Root `README.md` also understates the live API; current code and `AGENTS.md` take precedence.

Executed small, in-memory probes against the existing care selector, Malaysia date helper and analytics sanitizer. Read the live public homepage, its deployed JavaScript and the Google tag script; inspected its browser script elements and warnings/errors. No account was signed in. No private production data was accessed or synthetic tracking event deliberately sent. Normal public-page navigation may itself invoke the site's installed analytics.

Existing mobile/desktop Dashboard screenshots under `artifacts/owner-portal-visual-e2e/screenshots/` were inspected only as historical visual references. They contain older counters/copy; current layout judgments below are grounded in current source. A fresh authenticated mobile usability session was not performed. No build, dependency install, test-suite run, database query, migration, commit, push or deployment was performed. This report is the only new repository file.

## 2. Confirmed Findings

| Area | Verified current behavior | Code evidence |
| --- | --- | --- |
| Dashboard data | Loads pets, then records and Moments per active pet; waits for secondary requests before finishing its loading state | `apps/web/src/components/portal/DashboardClient.tsx:93`, `:118`, `:130` |
| Care pagination | Web always asks for page 1, size 100; API sorts by record date, then creation time, before pagination | `apps/web/src/services/recordService.ts:50`; `apps/api/MyPetLink.Api/Services/CareRecordService.cs:58`, `:68`; `Validation/PagedQuery.cs:5` |
| Care completion | A newly logged record can fulfil one older, same-pet, same-type record with a due date; self-links, duplicates and cycles are checked | `apps/api/MyPetLink.Api/Services/CareRecordService.cs:480` |
| Database integrity | Non-null `FulfillsCareRecordId` is unique; this is a non-null filter, not an “active record” filter | `apps/api/MyPetLink.Api/Data/MyPetLinkDbContext.cs:2307`; `Migrations/20260827053323_AddCareIdentityAndFulfillment.cs:27` |
| Due statuses | API uses Malaysia today, overdue before today and due-soon through today +30 days; the web mirrors those dates | `CareRecordService.cs:798`; `apps/web/src/lib/careRecordStatus.ts:32` |
| Effective completion | API status itself does not check incoming fulfilment; web derives “Completed” from links in the available collection | `CareRecordService.cs:775`, `:798`; `careRecordStatus.ts:57`, `:67` |
| Private-Moment cap | Counts non-public, non-archived, non-deleted Moments against the primary pet; seeded Free 10, Premium 100 | `apps/api/MyPetLink.Api/Services/MemoryService.cs:592`; `Data/MyPetLinkDbContext.cs:3181`, `:3197` |
| Audience default | Owner editor starts on Only Me; callers can explicitly choose a different initial audience, as Community does | `apps/web/src/components/portal/MomentEditorDialog.tsx:111`, `:142`, `:159` |
| Moment dates | `MomentDate` is a nullable calendar date; `CreatedAt` is insertion time and `PublishedAt` is first publication, with distinct meanings | `apps/api/MyPetLink.Api/Entities/CareMediaEntities.cs:27`, `:70`; `Services/MemoryService.cs:149` |
| Moment membership | Owner list is primary-pet-only; public projections additionally support own tagged pets and separately consented collaborations | `MemoryService.cs:37`; `PublicProfileService.cs:304`, `:327`; `Common/SocialVisibility.cs:346` |
| Sharing | Share Center is the shared entry point; public cards use an anonymous public projection with a separate edge-cache mechanism | `apps/web/src/components/share/ShareCenter.tsx`; `docs/architecture/owner-sharing-experience.md`; `Controllers/PublicProfilesController.cs:49` |
| Notifications | Current care preference fields are placeholders, not an operating reminder channel | `docs/architecture/communication-preferences.md`; `apps/api/MyPetLink.Api/Entities/Enums.cs` (`OwnerNotificationType`) |

The seeded limits are not proof of a particular production account's effective plan. The frontend adopts limits returned by the owner-profile service (`apps/web/src/lib/planLimits.ts:35`; `apps/api/MyPetLink.Api/Services/OwnerProfileService.cs:220`). No plan values should change in this work without a separately approved decision.

## 3. Incorrect or Unsupported Findings

### 3.1 Phase 1 is not safely “layout only”

The audit acknowledges truncation but defers its remedy to Phase 2. Phase 1 also adds filtering, week membership and completion prefill, each with behavioral implications. `ownerRoutes.petRecords()` accepts only `create` today (`apps/web/src/lib/routes.ts:27`, `:89`). `RecordsManager` reads that flag and calls `openAddForm()`, which resets to `emptyForm` (`RecordsManager.tsx:225`, `:240`). No existing completion-prefill contract was found.

Do not put care title, notes, provider or other record contents into query strings. If a deep link is used, carry only an opaque target record ID, then load it through the authenticated service, verify its pet and eligibility, and prefill from the server response. An ID is navigation context, never authorization. Avoid analytics/logging of that parameter, consume it once, and retain a normal Back destination.

### 3.2 Index and migration scope was overstated

`CareRecords (PetId, DueDate)` already exists in the EF model (`MyPetLinkDbContext.cs:2304`) and root deployment script (`migration.sql:787`). Pets also have `(OwnerUserId, LifecycleStatus)` (`MyPetLinkDbContext.cs:1541`). Use these plus the unique fulfilment index first. A covering/filtered replacement is a possible measured optimization, not a prerequisite and not a second default index on the same leading fields.

No new table is needed for Dashboard, next-due planning or stateless recap. However, the blanket assertion that the only possible migration is a performance index is too strong: **durable request replay across Undo/archive might require persisted idempotency metadata**. That would be a justified, separately reviewed change if selected, not a reason to introduce a generic task domain now.

### 3.3 Media limits and rate-limit protection are not as described

Free/Premium values of 5/20 are seeded, but `MemoryService.ReplaceMemoryMediaAsync()` validates uniqueness, ownership, primary-pet association, Ready state and category, with no maximum-count check (`MemoryService.cs:760`). `CreateMemoryRequest` and `UpdateMemoryRequest` also have no collection-length annotation (`DTOs/MemoryCareDtos.cs:6`, `:37`). The current editor uses a fixed default of five (`MomentMediaField.tsx:16`, `:29`; `apps/web/src/types.ts:375`), not an enforced server-side entitlement of 5/20.

Similarly, registering a `MomentCreate` limiter in `Program.cs:148` does not apply it to every write. The actual owner create route in `MemoriesController.cs:45` has no `EnableRateLimiting` attribute; `MediaController.cs:24` also has none. No global limiter is assigned in the inspected registration. These are application-code findings; any additional production edge controls were not verified. Do not rely on the audit's stated per-Moment cap or creation-rate protection when estimating abuse/storage bounds.

### 3.4 Other corrections

| Audit statement | Correction |
| --- | --- |
| “13–19 Oct” is an example Monday–Sunday week in 2026 | It is Tuesday–Monday. Previous complete week on 20 October is **12–18 October**; current week is **19–25 October**. 25 October 2026 is Sunday, not Saturday. |
| Timezone is already fixed on both sides | Due-status derivation is; the record form's `getLocalTodayDateInputValue()` uses the browser's timezone (`careRecordTerminology.ts:225`; `RecordsManager.tsx:154`). Completion defaults must use Malaysia today. |
| Owner-wide endpoint can return “Later” and “Done recently” with an optional cursor | The normal contract is page/pageSize. A next-30-days window does not cover all Later items, and two independently paged lists need separate metadata. Keep the MVP to one due-items collection. |
| Same-type history can safely supply a repeated gap | One type can contain different vaccines, medicines or appointments. Never infer an interval from an unrelated record simply because its type matches. |
| One owner makes last-write-wins acceptable | One owner can use two devices, submit a retry or have two tabs. The unique index does not prevent a target edit/archive racing completion. |
| Renderer already provides brand fonts | Its `TextStyle` requests **Arial** (`PublicProfileSocialCardRenderer.cs:1210`); the web uses Poppins/Noto Sans. Do not claim server font parity without checking it. |
| Thumbnails are already available in the owner Moment payload | The owner `MemoryMediaResponse` has one URL, and `MemoryService.cs:739` resolves the original. Derivatives exist in storage, but the current owner payload does not expose a distinct thumbnail URL. |
| Client-side canvas is impossible because of R2 CORS | The documented example permits PUT only. That is not a live CORS inspection. Canvas with authenticated byte fetches and appropriate headers is technically possible; server rendering is still the simpler fit here. |
| Keeping recap outside Share Center avoids duplication | A second preview/share flow would compete with the canonical entry point. Reuse its owner flow while keeping its four first-level choices; see section 8. |
| “This week” and a completed recap can share an undifferentiated label | Label current-week Moments and **last week's recap** separately. An unfinished week is a preview, not a ready weekly recap. |

## 4. Security and Data Integrity Risks

### 4.1 High: incomplete care collections can falsely reassure owners

**Verified chain:** page 1 only (`recordService.ts:54`) → record-date ordering (`CareRecordService.cs:70`) → frontend excludes fulfilled targets using only the supplied records (`careRecordStatus.ts:57`, `:118`) → Dashboard renders a success-shaped empty state (`DashboardClient.tsx:636`, `:668`).

Two independent examples:

1. A pending booster is the 101st record by record date. The first 100 have no due date. Dashboard selects no care rows although the booster remains pending.
2. A target is in the first 100, but its completing record is outside that page, for example because its record date was backdated. Dashboard can show the already completed target as pending. Creation order governs fulfilment eligibility, so backdating does not inherently prevent this case.

An in-memory probe of the actual `selectDashboardCareRecords()` returned no item when the pending item was excluded, returned it with the full collection, and stopped returning a target only once its fulfiller was included. This verifies the selector dependency; no production records were created.

**Failures also masquerade as empty:** `collectFulfilled()` discards rejected requests (`DashboardClient.tsx:792`); availability sets are used for profile-completion nudges, not the care section (`:162`, `:299`). Partial failure may therefore show some pets' care while silently omitting another pet.

**Preferred fix:** move the owner-wide, server-filtered pending-care read forward to Phase 1. Filter ownership, lifecycle, record state and incoming fulfilment in SQL **before pagination**, return exact filtered totals, and expose the date/window to the UI. Do not change the existing per-pet historical list's ordering or response contract.

**Acceptable frontend-only bridge:** explicitly fetch every page for each relevant pet using the existing metadata, merge/deduplicate records by ID, and run the current selector only after all reads succeed. A safety/performance cap, missing metadata, changed totals or failed page must mark that pet's coverage incomplete. Page-number pagination is not a transactional snapshot during concurrent writes; refetch after changes and on return/focus, and do not describe the result as a clinical all-clear. Prefer the server query for a growing account. A fixed larger page size or a record-date filter is not a solution.

Display three distinct states:

| State | Required behavior/copy |
| --- | --- |
| Complete successful query, no pending rows inside a known horizon | “No care dates due through 19 Nov.” Use the actual horizon; this does not mean no future dates exist. |
| Complete successful query, no next dates anywhere | “No next care dates saved yet.” Offer “Log care” with an explanation of next dates. |
| Error, partial coverage, or pagination unfinished | “Some care dates couldn't be loaded.” Show known rows as partial; offer Retry; never “Nothing due”. |

### 4.2 High: Only Me media has public object access

**Confirmed source behavior:** initialization chooses the bucket from category alone (`MediaService.cs:53–79`); `MomentImage` and `MomentVideo` are public categories (`:1037`). Keys include a random GUID (`:924–939`). The owner response exposes the public URL (`MemoryService.cs:719–742`). The authorized private-download route explicitly rejects public media (`MediaService.cs:281–294`). Image derivatives use the same public classification (`:915`; `Common/MediaDerivatives.cs:20`).

This is a distinction between **application visibility** and **object access**. Public-profile queries correctly filter private Moments (`Common/ShareProfileVisibility.cs:48`); that does not make an object URL require an owner session. Random names resist guessing but do not authenticate someone who has the URL. Cloudflare documents that enabling public bucket access exposes its objects over the Internet; CORS is a browser integration policy, not an owner authorization check. [Cloudflare public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/).

**Exposure paths:** the owner's browser/network tools, copied URLs, downloaded page content, extensions with page access, shared debugging material, an earlier public rendition of a Moment, and anyone forwarding a known original or thumbnail URL. These are realistic paths, not evidence of an observed breach. Object paths can also reveal a pet ID. No brute-force enumeration or real private-media fetch was performed. Production bucket policy, access logs and CDN purge behavior were not inspected.

Changing Public to Only Me does not relocate/rekey the media in `MemoryService.UpdateAsync()` (`:304`, `:353`). Archiving a Moment only timestamps the row (`:375`); it does not remove its objects. Explicit media deletion attempts object cleanup (`MediaService.cs:272–278`), but cannot recall copies already downloaded or prove all intermediaries have purged them.

**Mitigations to assess separately; none implemented here:** store private media and derivatives in the existing private bucket, issue authorized short-lived reads, and deliberately handle visibility changes, old URLs, object cleanup and CDN invalidation. Alternatively use an authenticated proxy/Worker with a private origin. Merely signing a URL while leaving an unsigned public origin reachable does not fix access. CORS changes, noindex and longer random keys do not fix access either. This would be a media-architecture/security workstream, not a hidden Dashboard task.

**Blocker classification:** not a blocker for a read-only Dashboard or an owner-only textual recap summary using today's authorization. It is a blocker to claiming stronger “Only Me” file privacy, and a release gate for newly promoting private photo export. The simplest recap MVP excludes private photos from export. If product explicitly wants private export, first decide whether to remediate object access or knowingly accept the existing risk, then add explicit export consent. Consent to exporting an image does not cure its underlying public-object access.

### 4.3 High: fulfilment uniqueness is narrower than a safe completion command

`ValidateFulfillmentAsync()` checks state before saving (`CareRecordService.cs:496`); the filtered unique index guarantees only one non-null claim. It does not protect all transitions:

- Another tab can clear the target's due date, change its type or archive it after the completion validation reads it. The current edit/archive paths share no completion lock or optimistic version (`:150`, `:254`).
- Existing completion requests may disagree on completion date, next due date, provider or visibility. Returning the first winner must not imply the second request's different data was saved.
- After a unique violation, `CreateAsync()` currently translates the error into a 400 field error (`:132`), not a success replay. A new completion action must handle both “already claimed” validation and the database race, and clean up failed tracked inserts before any retry/save.
- Archive clears outgoing **and incoming** fulfilment references (`:260–272`). Undoing an older completion after it acquires a successor can detach that successor. This is more than toggling a status.
- Archiving the completion erases its target link. A delayed retry can then create another completion. An optional, unpersisted `clientRequestId` cannot guarantee replay across this transition.

Recommended phase boundaries and response rules appear in section 7. A single-owner product still needs these protections.

### 4.4 High: recap membership must not become export permission

The audit's “primary or MomentPets” shorthand is insufficient by itself. `MomentPets` also contains other households' accepted collaboration subjects (`SocialVisibility.cs:346`; `MomentCollaborationService.cs:15`). Authorship remains immutable across pet transfer (`CareMediaEntities.cs:12`). Owning the selected pet alone must not grant export access to another author's media or old private content through a join.

For the MVP, require current ownership of the requested pet **and** the Moment's primary pet, `AuthorUserId == JWT subject`, active own subject membership with `CollaborationId == null`, and active/eligible Moment and media rows. Primary membership may use `PetMemory.PetId` directly so legacy missing join rows do not hide the primary pet. Exclude cross-household collaborative content and transfer-edge content rather than inventing new export rights. Recheck at render time; deduplicate by Moment ID.

For a valid secondary pet, media normally belongs to the **primary pet** (`MemoryService.cs:776–784`), so a blanket `media.PetId == requestedRecapPetId` would incorrectly reject it. Validate media against the authorized source Moment/primary pet and owner, then validate the selected pet's association separately.

### 4.5 Analytics: deployed delivery defect and incomplete privacy coverage

On 20 October, the live public homepage loaded `gtag/js?id=G-XS6YVSLFCL`. Its deployed chunk `/_next/static/chunks/41e6aeo1kdu26.js` includes that ID and the same rest-parameter queue implementation as `apps/web/src/lib/analytics.ts:311`. The browser's inspected warning/error log had no entries; silence is not evidence that events are delivered.

**Concrete defect:** the adapter pushes a plain JavaScript array for each command. Google's documented bootstrap pushes an `arguments` object. The currently served Google tag parser handles arrays as data-model method calls, while its Google-command dispatch checks an Arguments-shaped object. A pure, in-memory shape probe returned false for the repository's rest array and true for the documented Arguments object. The deployed adapter therefore does not use the command-dispatch path expected by the inspected provider. This is strong source-level evidence of a delivery defect, not a captured production collection request or a GA Realtime result. [Google installation and verification guidance](https://developers.google.com/tag-platform/gtagjs), [served tag script](https://www.googletagmanager.com/gtag/js?id=G-XS6YVSLFCL).

Existing unit tests that assert queue contents do not establish provider compatibility. GA4 must be treated as **not verified working** until the adapter is corrected in a separately authorized change, a real collection request is observed, and that event appears in the intended property's Realtime/DebugView. Property access was unavailable in this review; no claim is made about historic collection volumes.

Also, the sanitizer covers legacy public routes and `/pets/{id}`, but leaves `/u/{handle}`, `/moments/{id}` and `/social/pets/{id}/moments` unchanged (`analytics.ts:275`). A pure sentinel-ID probe confirmed all three. That conflicts with the documented no-identifiers/no-slugs contract. Verify dynamic route sanitization and provider-added referrer/page fields before expanding tracking. Do not take a broken sender as a privacy control.

## 5. Recommended UX/UI Improvements

**Keep the existing portal; bring its pets and useful actions forward.** Current source already has a mobile shell, four-item bottom bar, rounded cards, blue actions and a compact pet-card pattern. The work is a refinement of `DashboardClient`, not a new application.

The audit is right to remove counters and repetitive navigation tiles, reduce plan-meter prominence, put Lost Mode first, and combine completion/contact nudges. Its proposed composition still has four problems:

1. **Pet identity arrives too late.** On mobile, greeting, filters, care rows, Moments, recap and a new action row precede Your pets. A pet's small chip/avatar is not enough to make Home feel personal. Put the existing pet-card section immediately below a compact greeting; increase its photo from current `PetAvatar size="sm"` (48px) to `md` (64px). Keep actual photos, management link and existing Share behavior.
2. **Action duplication persists.** A global Add menu, Add tile inside Moments, a new three-button action row and Share on each pet repeat choices. Keep the existing header Add menu, one contextual Add Moment link in the Moments section and a contextual completion action. Remove the separate global action row. Share remains on the pet card through Share Center.
3. **The mobile care list is too tall.** Avoid a full-width bottom button inside every row. Use a text/title block and a compact trailing “Log as done” button; at 320px it may wrap beneath the title but does not create a second nested card. Show at most two rows on phones and three on desktop, with an honest additional-items count and View all. Keep additional pending pets discoverable through that link.
4. **Ready-recap copy is premature.** Dashboard must not say “your week is ready” before confirming a nonempty complete week. Phase 1 has a recent-Moments strip only. Phase 3 adds “Last week's recap · 12–18 Oct” after a successful query, never a placeholder CTA for an endpoint not yet built.

### One pet, several pets and emotional tone

With one pet, show its identity card and no filter. With several pets, keep all pets as the initial view and offer a compact filter for care/Moments below the pet section; avoid duplicating an avatar-chip row above another full pet list. A selected filter is always visible, never silently chosen. For a large household, show four pet cards plus “View all N pets”, following today's behavior. Desktop uses a two-column pet grid; phones use compact stacked cards without a carousel.

Do not persist filtering for the first release. If persistence is later approved, scope it to the signed-in account, validate against current owned pets, and reset it on logout/account change. A device-global key could retain a stale pet selection for a different account and produce a misleading empty state.

Use pet names, real photos and calm language. Avoid claims that a pet is healthy, safe, fully cared for or overdue for treatment based solely on dates the owner entered. Do not require a name in the greeting; “Welcome back” is sufficient. Account display name is allowed privately but adds no meaningful engagement value and must not enter exported content.

### Meaningful empty and error states

| Situation | Recommended presentation |
| --- | --- |
| No pets | Existing `ZeroPetWelcome` and one Add your first pet CTA; no two empty content panels |
| No Moments | “A small moment is worth keeping.” One Add Moment action; no four empty photo tiles |
| Only older Moments | Title the section “Recent Moments”, not “This week”; show actual dates |
| No image for a Moment | Existing category icon and title; no stock pet photo and no broken photo tile |
| No pending care | Use the precise states in section 4.1, not a blanket all-clear |
| Care/Moments fail independently | Retain pets and the other successful section; inline retry, no false zero count |
| Memorial-only household | Gentle existing memorial/history access; no urgent care task, celebratory weekly prompt or instruction to replace the pet |
| Lost Mode | Visible before optional content; suppress that pet's celebratory recap prompt, without changing its safety routes or settings |
| Near private limit | One compact per-pet note at 8/10 or above, only from trustworthy counts; no upgrade button or nudge to make private content public |

The claim that Malaysian owners will enjoy this remains a hypothesis. Validate with a few local owners on their normal phones, especially one-pet households, long pet names, photo-poor new accounts and older devices. No Malaysian user research was supplied, so the review does not assert a proven cultural preference.

## 6. Dashboard Design Specification

### 6.1 Information hierarchy

1. Existing shell/header and Add action; conditional Lost Mode notice first in content.
2. Short greeting; **Your pets** with recognizable photos and existing actions.
3. A shared pet filter only for multi-pet households, labelled by its effect on the following sections.
4. **Care coming up**: due title, pet name, exact date, derived status, “Log as done”; View all.
5. **Recent Moments**: three photos/titles on mobile, up to four on desktop; contextual Add Moment.
6. One conditional occasion/contact/profile-completion next step. Essential contact setup takes priority over profile decoration. A birthday may use its existing compact occasion row, but not a new full hero.
7. Phase 3 only: compact last-complete-week recap entry within Moments. Near-limit note remains tertiary.

No stat grid, charts, streaks, full plan card, repeated section-navigation tiles or large marketing block.

### 6.2 Refined mobile wireframe — 390px, two pets

```text
┌────────────────────────────────────────┐
│ MyPetLink                    + Add ▾   │ existing shell
├────────────────────────────────────────┤
│ [Lost Mode notice, only when needed]   │
│ Welcome back                           │ compact, no large hero
│                                        │
│ Your pets                  Manage pets │
│ ┌────────────────────────────────────┐ │
│ │ [64px Oyen] Oyen                    │ │
│ │             Domestic Shorthair · 3y │ │
│ │ [Share]                     [View]  │ │ existing Share Center
│ ├────────────────────────────────────┤ │
│ │ [64px Mochi] Mochi                  │ │
│ │              Poodle · 2y            │ │
│ │ [Share]                     [View]  │ │
│ └────────────────────────────────────┘ │
│ Show care and Moments for:             │ only with several pets
│ [All pets ▾]                           │ reuse pet-choice pattern
│                                        │
│ Care coming up                View all │
│ Rabies booster · Oyen     [Log as done] │
│ Overdue · Due 12 Oct                    │
│ Grooming · Mochi          [Log as done] │
│ Upcoming · Sun, 25 Oct                  │
│ 2 more care dates                       │ only if known
│                                        │
│ Recent Moments              Add Moment │
│ [real photo] [real photo] [real photo]  │ 3 equal squares
│ Sunny nap    New box       Park walk   │ pet/date on open or below
│ Last week's recap · 12–18 Oct     →     │ Phase 3, eligible only
│                                        │
│ [One compact next step, if useful]     │
├────────────────────────────────────────┤
│ Home       Pets       Moments     More │ existing bar + safe clearance
└────────────────────────────────────────┘
```

At 320px, preserve 16px outer gutters, readable titles and 44px targets. “Log as done” may wrap to a second line of controls; no horizontal page scroll. One-pet mode removes the second pet and filter entirely. The first screen should show pet identity and reach the start of useful content without an oversized greeting. Do not force all sections above the fold or shrink text to achieve it.

### 6.3 Refined desktop wireframe — within existing sidebar/shell

```text
┌──────────────┬───────────────────────────────────────────────────────────┐
│ Existing     │ Welcome back                                  + Add ▾  │
│ sidebar      │ [Conditional Lost Mode notice]                          │
│              │ Your pets                                  Manage pets │
│ Dashboard    │ ┌────────────────────────┐ ┌────────────────────────┐   │
│ My Pets      │ │ [64px photo] Oyen      │ │ [64px photo] Mochi     │   │
│ Care Records │ │ metadata  Share / View │ │ metadata  Share / View │   │
│ Moments      │ └────────────────────────┘ └────────────────────────┘   │
│ ...          │ Show care and Moments for: [All pets ▾]                 │
│              │ ┌──────────────────────────┬────────────────────────┐   │
│              │ │ Care coming up   View all│ Recent Moments   + Add │   │
│              │ │ Title · pet     [Log…]   │ [photo] [photo]        │   │
│              │ │ exact date / status      │ [photo] [photo]        │   │
│              │ │ Up to 3 compact rows     │ Last week's recap →    │   │
│              │ └──────────────────────────┴────────────────────────┘   │
│              │ [One compact, conditional next step]                   │
└──────────────┴───────────────────────────────────────────────────────────┘
```

Use columns only when the **available content width** can support them. Existing `AppLayout` has a 288px expanded desktop sidebar and a `max-w-7xl` main (`AppLayout.tsx:161`, `:314`). At approximately 1280px viewport, main content is narrower than the full viewport; do not require a 720px planner plus a large photo column there. Dashboard can use roughly 55/45 columns from the existing `xl` breakpoint if both remain readable; otherwise stack. Do not stretch one-pet content into a billboard to fill desktop space.

### 6.4 Concrete visual and interaction rules

| Element | Specification grounded in current system |
| --- | --- |
| Canvas | Existing warm shell; `pet-cream #fff8f2`, white surfaces. Do not globally replace the body gradient. |
| Brand/action | `pet-teal #1570ef` is the existing **blue** token. Use for the primary action and links. Coral for small celebrations; danger tone for overdue text/badges. |
| Text | `pet-ink #0d1b3d`, `pet-muted #44506a`; Poppins headings and Noto Sans body. Source: `globals.css:54–94`. |
| Type scale | Page title 20px mobile/24px desktop; section titles 18px/20px; row title/body 14–16px; metadata 12–13px. Avoid pervasive `font-black` on metadata. |
| Spacing | 16px mobile outer gutter; 24/32px larger-screen gutters inherited from shell; 20–24px section gaps; 12–16px row padding; 8–12px internal gaps. |
| Surfaces | Keep current rounded identity. 20–22px section/pet cards, 16px rows. White/border with no extra row shadow; locally reduce `brand-card` shadow rather than changing it globally. Current heavy shadow: `globals.css:158`. |
| Pet photography | Existing `PetAvatar` `md` = 64px (`PetAvatar.tsx:12`); natural crop, existing image fallback. Real images only; no generated/stock replacement. |
| Moments | Three mobile square tiles, four on desktop; 8px gutters, 12–16px rounding. Reserve dimensions, lazy-load offscreen photos, no autoplay video. Original-URL payload may need a bounded thumbnail projection later. |
| Buttons | Reuse `CTAButton`, link styles, `Badge`, `FormDialog` and modal-focus helper. Minimum 44×44px target including text links; one blue action per local decision. |
| Filters | Reuse the pet chooser; all-pets initial state. A filter must not hide the global Lost Mode notice or a contact warning. |
| Feedback | Form opening is not completion. Save success appears only after a confirmed response; keep selections on errors and announce status politely. |
| Motion | Short 150–200ms feedback only; respect existing reduced-motion styles (`globals.css:453`). No attention-seeking loops. |
| Loading | Pets render after their successful read; care and Moments load independently with dimension-matched placeholders. Do not block pet identity on all secondary requests. |
| Accessibility | Semantic headings, visible focus, named controls, text status alongside color, sensible image alt, dialog focus restoration, bottom-bar/keyboard clearance. Validate 320/390/768/1280px and 200% zoom. |

Retain existing routes and feature availability. “Public/Private” on today's pet card describes Share Profile availability, not care or Moment privacy; consider the clearer compact label “Share Profile on/off” when refining copy. Never imply that this single badge describes the entire Pet Profile.

## 7. Smart Care Planner Assessment

### 7.1 Model sufficiency and boundaries

**The existing model is sufficient for a next-due list and owner-logged fulfilment chains. It is not a general future-task or appointment model.** Record date is required and cannot be future (`CareRecordService.cs:341`, `:423`). A future due date belongs to a real care log; the UI must not fabricate an already completed care event merely to add an appointment.

For the MVP, call the create action **Log care**, with an optional next date. If standalone future appointments with no prior care event are required, that is a distinct product/model decision and is outside this no-new-domain MVP. “Add care date” must not promise an unsupported blank task flow.

Reuse the existing records page and manager. Add a clear Upcoming/All records control; keep All records and its historical ordering intact. The generic Upcoming view may be all-pets, while historical editing retains the existing explicit pet context. Do not switch a user's selected tab automatically when data changes. Preserve existing create links and browser Back behavior.

### 7.2 Owner-wide read contract

`GET /api/v1/care/upcoming` is viable, but a collection-aligned **`GET /api/v1/care-records/upcoming`** fits the existing flat care-record routes more naturally. Existing record IDs are GUID-constrained, so `upcoming` need not collide. Choose one, not both.

Recommended minimum contract:

- JWT actor only; optional `petId` is a filter whose ownership is validated, never an actor override.
- `page`/`pageSize` as existing `PagedQuery`, with 1–100 page size; optional validated through-date/window. No cursor in the first version.
- SQL filters: caller-owned active, non-deleted pet; active, non-deleted record; non-null due date; no current incoming fulfilment. Enforce filters in the query, independent of indexes.
- Return only list fields: ID, pet ID/name/avatar reference, title/care name/type, ISO due date, effective status. Exclude notes, provider and document payloads from the overview.
- Preserve `ApiEnvelope` success/error style (`Common/ApiEnvelope.cs:5`), accurate filtered `meta.total`, request ID and page metadata. Return Malaysia `asOfDate` and queried horizon in an explicit typed summary if needed; do not overload `total` to mean an unfiltered count.
- Define deterministic ordering with due date and record ID tie-breakers. Today's Dashboard deliberately protects a future item alongside the most recently overdue one (`careRecordStatus.ts:118`). Retain that during Phase 1; any Phase 2 switch to oldest-overdue-first must be deliberate and reviewed, not an accidental change caused by pagination.
- If “Later” extends beyond the default 30 days, explicitly expand the horizon or offer Show later dates. A zero row count is only meaningful within the stated query scope.
- Defer “Done recently” in the first owner-wide response. If later included, give it its own bounded list/count; do not silently apply due-items pagination to completion history.

Thin controller, query/business logic in `CareRecordService` or a focused existing-pattern query service, typed DTOs and matching fallback semantics. No `OwnerNotification` repurposing, calendar grid, recurrence table or reminder sender.

### 7.3 Phase 1 “Log as done”

Use **Log as done**, not **Done ✓**, for a control that opens an unsaved form. Dialog title: “Log completed care”; submit: “Save care record”. Explain the named target and pet. Cancellation makes no change and does not remove the due row or emit completion analytics.

Prefill type, title/care name and the fulfilment target from a freshly authorized read, with Malaysia today as the editable completion date. Leave next due date blank. Do not blindly copy notes or attachments. Default visibility to Private, or clearly display and require confirmation of any inherited public-badge audience; a public old log is not consent to publishing a new event. Provider may be shown as an editable suggestion, since the owner may have used another clinic.

The target might have been fulfilled, archived or changed before the form opens/saves. Recheck, retain the user's draft, show the existing completion when appropriate, and refresh the due list. Phase 1 uses existing create semantics, so it is **not retry-idempotent**. After a timeout, reconcile target state before offering a blind resubmit; if the winner cannot be established, say the save could not yet be confirmed. Do not claim one-tap completion in marketing or analytics.

### 7.4 Phase 2 completion command, concurrency and Undo

`POST /api/v1/care-records/{id}/complete` is an appropriate optional convenience endpoint. Reuse the same validation rules, rather than accepting copied type/pet/visibility from the browser.

| Case | Required behavior |
| --- | --- |
| New completion | Validate date ≤ Malaysia today and optional next due ≥ completion date; create through shared rules in one transaction; 201 with envelope and Location |
| No session / foreign or inaccessible target | 401 / privacy-preserving 404, before inspecting or returning a winner |
| Same target already has the same accepted completion | Return its canonical record, 200, and distinguish “Already logged” from a new save |
| Conflicting date/next-date or changed target | 409 with a stable error code and canonical current state; never silently claim conflicting input was saved |
| Invalid fields / invalid lifecycle | Existing-style 400 field errors / 422 state error; source remains authoritative |
| Two concurrent creates | Unique index as final backstop; catch both precheck and database race; re-read authorized winner after failed entity state is cleared |
| Completion races type/due-date/archive edit | Shared target/chain transaction serialization or equivalent locking in **all affected write paths**, including old create/update/archive endpoints; not just the new command |

“Same gap as last time” is **deferred for the simplest MVP**. A blank picker and No next date cover the need. If later approved, derive only from the actual fulfilled record's own valid positive gap, show the proposed date explicitly, require a deliberate choice, and do not describe it as recommended treatment. Handle zero/missing dates, overflow and leap years. Never choose a gap from generic same-type history.

**Undo is not approved as a simple six-second archive toast.** Prefer “View record” and existing edit/correction for the first completion-command release. If immediate Undo is required, it must target only the completion created by that response, verify it has not been edited or acquired a successor, check current pet ownership and state, atomically remove the new next-date effect, and refresh both lists. A replay that returned someone else's earlier completion must not offer to undo it. A stale/changed completion should refuse with 409 and explain that the record changed.

Durable retries after Undo cannot be guaranteed by the current link alone because archive clears it. Decide whether to introduce persisted operation identity/tombstone information in a separately approved small schema change, or explicitly defer Undo and its stronger replay guarantee. Do not accept `clientRequestId` and imply durability without storing its meaning. SQL Server relational concurrency tests are required before releasing the stronger command; existing `CareRecordIdentityAndFulfillmentTests.cs:424` uses EF InMemory and does not exercise SQL uniqueness/locking races.

### 7.5 Status, privacy and plan boundaries

Keep stored dates as dates, not UTC-midnight timestamps. Derive due today/overdue using Malaysia day and refresh after midnight or window focus. “This week” grouping is a separate Monday–Sunday bucket; it is not a renamed 30-day due-soon status. A fulfilled record's new due date may itself be pending; hide the old target, not the entire chain.

Respect private care and document authorization. Never copy documents into completion automatically or send care details to public-card endpoints. Missing next date is legitimate and means no future item, not an error or auto-recurrence. Planner and ordinary next-date tracking remain Free. `MaxCareRecords` is currently not enforced in the care-write service; do not add enforcement as a side effect. Email/WhatsApp delivery and recurrence automation remain deferred, with Premium **Coming Soon**, no checkout.

## 8. Weekly Recap Assessment

### 8.1 Simplest safe MVP

**One pet, previous complete Malaysia week, on-demand summary and explicit photo-card generation. No persistence, scheduler or push notification.** A household rollup and arbitrary historical week browser are deferred. Care may appear in the private review as an honestly labelled count of logs, but exclude it from the first exported card. That removes a sensitive selection decision and ambiguous “care done” inference from the smallest release.

Reuse the SkiaSharp runtime, image decoding bounds, palette, logo, QR drawing and modal/native-share helpers. The existing renderer is a public-data class whose drawing/fetch helpers are private (`PublicProfileSocialCardRenderer.cs:173`, `:420`, `:890`). Extract only the few reusable primitives into an internal shared helper; add an owner-specific DTO/template/service. Do not manufacture a `PublicProfileSocialResponse` containing private recap data or add recap to the anonymous variant enum/edge route.

The existing Share Card composition remains unchanged. Recap is a separate composition; it does not replace the approved hero/portrait layout of the normal Pet Share Card. Typeface reuse is Arial today; Poppins/Noto Sans in an exported card would need available, correctly licensed font assets and visual verification, not a claim that they are already embedded.

### 8.2 Calendar and inclusion rules

| Concern | Required rule |
| --- | --- |
| Week | Malaysia-local Monday 00:00 through the following Monday, exclusive. Previous complete week on 20 Oct: **12–18 Oct 2026**. Current week: **19–25 Oct**. |
| Moment membership | `MomentDate >= startDate && MomentDate < nextMonday`. Only legacy null dates fall back to the Malaysia calendar date of `CreatedAt`. Apply the same rule in summary, selection and render. |
| UTC timestamp boundaries | Previous week is `[2026-10-11T16:00:00Z, 2026-10-18T16:00:00Z)`. Do not use UTC Monday or the browser timezone. |
| Creation/publication | A Moment created 20 Oct about 16 Oct belongs to 12–18 Oct. Publishing/editing it later does not move its event week. `PublishedAt` is not recap membership. |
| Backdated edits | Recap is computed, not a frozen snapshot. A newly backdated Moment can change last week's recap; say “Review last week”, not “permanently ready”. Regenerate when selection/source changes. |
| Future dates | The current Moment create service requires a date but does not reject future dates (`MemoryService.cs:618`). Exclude future-dated content from a complete-week recap; do not assume the general Moment model forbids it. |
| Care summary | Use `RecordDate` to describe logs about that week, not `CreatedAt`; deduplicate record IDs and distinguish all care logs from explicit fulfilments. Neither proves treatment occurred. |
| Occasions | Existing calculator answers today's occasion; a historical-week query needs deliberate range logic. Exclude weekly milestone embellishments from MVP rather than reuse a today-only result incorrectly. |
| Current-week strip | If labelled This week, use the same Malaysia calendar convention; if coverage is not complete, show Recent Moments without weekly totals. |

The existing Malaysia helper was probed at `2026-10-18T15:59:59Z` and `16:00:00Z`; it correctly switched from Sunday 18 October to Monday 19 October. New week logic must additionally cover month/year changes, leap days and clients outside UTC+8. A shared server helper can be introduced for touched care/recap services; do not turn this feature into a refactor of financial/document/email date helpers.

### 8.3 Authenticated endpoint design

The audit's endpoints are appropriate:

- `GET /api/v1/pets/{petId}/weekly-recap?weekStart=YYYY-MM-DD`: private summary in existing JSON envelope; validate a Monday, bounded history and no future week. For MVP the server can default to the previous complete week and omit week-navigation UI.
- `POST /api/v1/pets/{petId}/weekly-recap/card`: authenticated JPEG response. Body carries the canonical week, an ordered, unique selection of at most four media IDs and any explicitly consented options. Never accept arbitrary source URLs, object keys or an actor ID. Errors use the existing JSON error envelope; frontend checks content type before treating bytes as an image.

Both must enforce ownership on every request. Summary candidates should be paginated with page/pageSize when needed; four output photos does not mean an owner's week can have only four candidate images. Compute summary counts over the complete authorized week query, not the first candidate page. Bound title lengths and selection count, handle a Ready image without a thumbnail, and reject videos/documents for this template.

Recheck the complete authorization/eligibility predicate in section 4.4 immediately before rendering. Require an active MediaFileLink of type PetMemory to the chosen eligible Moment, Ready non-deleted image media owned by the caller, valid category and matching source primary pet. A supplied ID that belongs to another owner, pet/week or ineligible source must be refused generically, not silently dropped into a different card. Never use `CoverMediaFileId` alone as permission.

Moderated, archived or deleted Moments are excluded from export even if still visible to the owner in history. Multi-pet Moments can appear in each eligible pet's separate recap but count once per recap; an eventual household recap must count them once globally. Pending/revoked collaborations never add candidate rights.

### 8.4 Private selection and explicit export consent

**Recommended MVP:** export only eligible, owner-authored public Moments, with an owner-confirmed final preview. Do not require Community to be enabled. Do not silently enable a Share Profile or publish anything.

If private selection is separately approved, default private candidates off and make every chosen private photo/title visibly identifiable. A final unchecked acknowledgement before Share/Save should say, for example: **“This card includes photos from Only Me Moments. Sharing or saving it creates a copy outside MyPetLink.”** Consent covers the selected content and current preview, resets on changes, and does not change original Moment visibility. Selecting a photo should not automatically include its title/caption; titles can contain sensitive information even when the image looks innocuous. Exclude notes, providers, documents, exact locations and all three owner identities from exports.

An owner can export a recap without enabling their Share Profile. Include a QR or profile-copy action only when the current Share Profile is available under its own rules/build availability. Never link to a Safety Profile or physical-tag route. A public-only card may use already-public photos while still being an owner-only generation feature; do not create a public recap URL.

### 8.5 Cache, rendering cost and client handling

For the first release, **do not cache generated private recap bytes on the server**. Limit rendering to an explicit Create card action; selection changes mark the preview stale rather than rendering on every click. This is simpler and avoids the audit's inconsistent “uncached endpoint, selection-hash cache” description.

- Success and error responses for summary/render: `Cache-Control: private, no-store`; ensure no CDN route or service worker stores them. Do not pass them through `publicProfileEdge.ts` or use public versioned image URLs/ETags.
- Use authenticated `apiClient`-style fetch for the POST, then an in-memory Blob/object URL for preview/save/share. An ordinary `<img src>` cannot supply the bearer header used by the API. Revoke object URLs on replacement/close/logout and guard stale responses after pet/week/selection changes.
- Current `PetShareCard` accepts an anonymous image path and falls back to copying a profile link (`PetShareCard.tsx:41`, `:175`). Reuse presentation/helpers, not that fetch/fallback contract unchanged. If a recap file cannot be shared, offer Save image. A copied profile link does not contain the private recap and must not be reported as sharing it.
- Bound input count, source bytes, decoded pixels, total fetch time, output dimensions and simultaneous renders. Existing public renderer limits are 8 MiB per source, 8192px dimension and 40 million pixels (`PublicProfileSocialCardRenderer.cs:75`). Four decoded 40-million-pixel images can approach **640 MB** at four bytes/pixel before other allocations; per-image limits alone are not a safe aggregate budget. Downsample before retaining, bound total decoded pixels and render concurrency, and use a total request deadline.
- Use existing storage retrieval/approved-host validation, never a client URL. Retain SSRF/redirect/type checks when extracting helpers. Add an actor-partitioned render limiter and a small service concurrency bound; measure memory, latency and failure rate on the actual hosting tier. “Hundreds of milliseconds” and negligible cost are unmeasured estimates, not evidence.
- If a cache is later justified, authenticate and revalidate before every hit. Namespace by actor, requested pet, canonical week, ordered selection, source revisions/media identity, display options/theme/profile-link state and template version; bound TTL and total size. A selection hash alone is not an authorization boundary and does not invalidate an edited/private/moderated source.

An empty week has no render action: show a warm Add Moment state and optionally recent history. A week with only private content is not “no activity”; explain that there are no photos eligible for this share card. A private text-only Moment still counts in the private summary but does not fabricate a photo. Image fetch/decode failure preserves selection and gives a retry or explicit remove-photo choice; do not export a silently incomplete collage.

### 8.6 Share Center integration

Preserve the four-choice first level and public visitor behavior. Add the owner-only recap review as an option inside **Share Pet Card** (or an owner-only supporting choice beneath its existing panel). Dashboard “Review last week” and the pet-hub link open that same owner controller at the recap review step. Reuse one preview/share/save interaction after review; do not introduce a parallel native-share row.

Keep owner recap availability separate from the existing public-card requirement for an enabled Share Profile. The owner can generate/export an eligible recap without a profile QR. A public visitor must never see recap candidates, owner summaries or private endpoints. This requires a small explicit owner-mode contract, not a public variant string clients can inject.

## 9. Free/Premium Recommendations

### Current behavior and engagement impact

Ten private Moments means about ten weeks at one new private Moment per week, sooner with several posts. Because Only Me is the owner-editor default, this cap is a direct friction point for a diary habit. Public Moments do not consume the allowance, but public-to-private conversion also checks the cap (`MemoryService.cs:304–318`), so someone at the limit can be unable to make a public Moment private through that update path. Archiving is available, but is not equivalent to retaining an active private diary. Never suggest publishing as a way to unlock storage.

Counts excluding archived rows are not a storage budget: Moment archive timestamps the row while retaining files (`MemoryService.cs:375`), and rate limits only reduce upload speed, not lifetime retained bytes. The cap is also a count-then-save check without a corresponding private-count uniqueness constraint; simultaneous writes need consideration if used as a hard financial control.

### Recommended direction; no limits changed

| Capability | Recommendation |
| --- | --- |
| Dashboard, care dates, ordinary completion | Free; no new care-count enforcement in this release |
| Per-pet recap generation/export | Free with bounded on-demand use and operational limits; no paid call-to-action |
| Private diary baseline | Product should consider **52 active private Moments per pet** as a concrete starting candidate for a weekly habit, subject to real storage/retention analysis. This is a proposal, not an approved value or automatic migration. |
| Premium later | Larger private archive/media allowance, optional richer exports and automated reminders; privacy and default-private creation stay available on Free |
| Privacy changes | Making a public item private should not be blocked by a growth lever. Decide a quota-safe exception/over-limit policy separately; preserve existing content and avoid forced deletion/publicity. |
| Storage control | Enforce the existing per-Moment media limit server-side; measure retained bytes, originals/derivatives, videos and abandoned uploads across **both audiences**. Any account byte budget/retention change needs explicit grandfathering and deletion/export rules. |

Even the candidate 52 × five 10 MiB images is approximately 2.5 GiB per pet before derivatives; five 50 MiB videos per Moment is approximately 12.7 GiB. These use existing upload-size ceilings (`MediaService.cs:14–16`), are upper-bound illustrations rather than pricing forecasts, and demonstrate why simply multiplying a Moment cap is not enough. Do not invent a new hard byte quota inside the Dashboard change.

Premium remains Coming Soon. A private-limit note should explain current usage and access to existing Moments, not offer an unavailable subscription. A blanket “Premium will solve this” is not a sustainable launch answer. The cap decision is important before marketing a weekly diary loop, but it need not block a truthful Phase 1 layout/task-improvement release.

## 10. Revised Implementation Order and Measurement

### 10.1 Order

1. **Review decisions only:** approve the narrower Dashboard hierarchy, care completeness approach and completion label/prefill behavior. No need to settle every optional `.ics`, household-recap, greeting or future-Premium decision first.
2. **Care-read correctness prerequisite:** preferably add the owner-wide pending-care read now; alternatively approve the complete-pagination bridge with explicit incomplete states. Verify the real first-100 edge cases and secondary-error handling.
3. **Phase 1 Dashboard refinement:** evolve the existing component, reuse pet cards/Share Center/Add controls, remove counters/navigation tiles, add contextual Log as done and recent Moments. Keep existing per-pet history endpoints and public routes compatible. Mock/fallback gets the same contract and failure/completeness semantics.
4. **Parallel release-readiness workstream, not a hidden prerequisite refactor:** separately fix/verify analytics and decide the existing private-media/privacy posture and Free diary economics. Dashboard may ship without analytics, but cannot claim measured retention success.
5. **Phase 2 planner:** owner-wide list, existing per-pet history, focused completion command only after race/replay rules are resolved. Defer same-gap shortcuts and one-click Undo for the smallest version.
6. **Phase 3 recap:** owner-only previous-week summary, public-content export, Share Center integration, explicit generation and bounded rendering. Private export, care export and household rollups require separate approval.

Shared calendar code should cover the services touched here, with boundary checks, not unrelated consignment, financial, invoice or email date paths. Feature rollout controls are optional deployment infrastructure decisions, not automatically new App Settings. A frontend flag is visibility only; it cannot secure a private render endpoint. If infrastructure kill switches/options are added later, follow configuration governance and inventory/deployment documentation.

### 10.2 Retention hypothesis, honestly separated

| Outcome | Likely contribution | Limitation |
| --- | --- | --- |
| Task completion | Visible due title and fewer steps to log care | Strong convenience case; form opening is not completion |
| Return visits | Seeing real next dates and a pet's growing diary | All three features are pull experiences. Without a notification, owners must remember to return; no guaranteed weekly retention effect |
| Emotional attachment | Prominent pets/photos and recent Moments | Depends on sufficient real content; empty accounts need a small onboarding path |
| Sharing/acquisition | A fresh recap image with brand and optional Share Profile QR | Share-sheet acceptance/save is observable; delivery, recipient app and downstream signup attribution are not |

The original “moderate/strong/high” forecasts have no baseline or experiment behind them. A due date next month does not by itself establish day-7 retention. Treat these as hypotheses, not expected measured lifts.

### 10.3 Minimal measurement plan

**Prerequisite:** resolve section 4.5, verify one genuine page view and one existing success event in production collection plus Realtime/DebugView, then validate dynamic-path/referrer privacy and the intended consent configuration. Do not send private content to troubleshoot it. Local queue tests and the presence of a measurement ID are insufficient.

Use the existing typed allowlist and success boundaries; avoid a second SDK or generic event table. Start with:

| Signal | Trigger and interpretation |
| --- | --- |
| Owner Dashboard page view | Existing sanitized `/dashboard` page_view; browser-level return trend only |
| `care_record_created` | Existing confirmed save; retain controlled type, add source only if needed for Dashboard/planner attribution |
| `care_completion_logged` | Confirmed new fulfilment only, after save; source = dashboard/planner. Replayed existing completions do not count again. Needed to distinguish completion from ordinary logs. |
| `moment_created` | Existing confirmed save; compare creation trend with owners who encountered the new Dashboard |
| `weekly_recap_opened` | Once per deliberate opening, source and eligible/empty state only |
| `weekly_recap_card_created` | Valid generated image received; bounded photo-count bucket only |
| Share/save | Extend existing `share_card_shared`/`share_card_action` with a recap variant; save is not distribution, cancelled share records no success |

Do not add Undo or same-gap analytics for features deferred from the MVP. Avoid exact dates, names, handles, IDs, URLs, free text, care titles or photo data. Unknown/failed loads are not `has_due_care=no`.

For an initial comparison, collect a short pre-release baseline and compare similar post-release periods for Dashboard visits, successful care/Moment creation and recap usage. Avoid causal claims from tiny or changing cohorts. GA browser cohorts do not identify authenticated owners across devices, and this app has no reliable newly-created-account signal for signup cohorts (`docs/operations/product-analytics.md`). Label browser-return metrics accordingly rather than “owner retention”.

Existing database `CreatedAt` can support aggregate creation activity, not visits. Use immutable `PetMemory.AuthorUserId` for Moment author activity; deriving historical actors from a pet's current owner is wrong after transfer. Care records do not carry equivalent immutable author identity (`CareMediaEntities.cs:99`), so current-owner care aggregates have that attribution limitation. A fulfilment-date measure is also owner-entered/backdatable; creation time measures when a log was entered. No new Admin report or analytics schema is needed to implement the reviewed MVP.

## 11. Blockers and Product Decisions

### Phase 1 gates — resolve before implementation approval

| Gate | Decision/review result required | Recommended answer |
| --- | --- | --- |
| P1-A: trustworthy care | Bring owner-wide read into Phase 1, or approve a complete-pagination bridge with partial/error states | Owner-wide read first; no “Nothing due” from a first page |
| P1-B: action semantics | Confirm prefill/authorization/reconciliation work is in scope and choose the user-facing label | “Log as done”; server-loaded target, Private default, success only after Save |
| P1-C: Dashboard composition | Approve pet-first compact hierarchy and remove repeated global actions | Existing pet section first, care then recent Moments; header Add and pet Share retained |
| P1-D: Moments completeness | Decide whether Phase 1 makes weekly claims | Use Recent Moments initially; no week totals/ready recap from truncated lists |

These are sufficient decisions to make Phase 1 concrete. A Free-cap increase, private-media migration, reminder pricing, household recap, `.ics` and broad date refactoring are not necessary blockers to the narrower Dashboard.

### Later decisions and release checks

| Area | Required before affected release |
| --- | --- |
| Phase 2 command | Define same vs conflicting replay, target-edit/archive race protection across old and new paths, and timeout reconciliation |
| Undo | Defer or design safe conditional reversal and durable replay; approve any necessary operation metadata explicitly |
| Planner scope | Confirm next dates attached to actual care logs, rather than standalone future appointments |
| Date behavior | Malaysia week convention is already specified by this request; use 12–18 / 19–25 Oct, not reopen that decision |
| Recap private content | Approve public-only MVP or explicitly decide private-object risk and final export consent; no implied architectural fix |
| Free diary | Decide active-private allowance and byte/retention economics before promoting an ongoing weekly posting habit |
| Analytics | Fix command queue/sanitizer and verify actual property receipt before making retention claims; not a blocker to an unmeasured Dashboard rollout |
| Share integration | Owner-only recap branch within existing Share Center flow; public card and visitor experience unchanged |
| Rendering operations | Actual hosting-tier memory/latency checks, aggregate image bounds, actor limiter and render concurrency cap |

### Interaction with ongoing Consignment, Merchant and Smart Tag work

No domain dependency was found for these features on consignment custody/agreements, merchant sales/locations/logos, inventory, commissions, payment state or tag assignment. Keep their entities, endpoints, routes, capability catalogue and transactional email templates untouched. No booking/staff/payment tables are needed; this repository uses SQL Server/EF Core, not the generic MySQL assumptions in the surrounding instructions.

The likely integration conflicts are **shared files**, not business logic: `Program.cs` for DI/rate limits, `MyPetLinkDbContext.cs`/snapshot if a later migration is chosen, `types.ts`/backend DTOs, `routes.ts`, `features.ts`, `ShareCenter` and renderer helpers. `Program.cs` and other files already have unrelated uncommitted edits. Future implementation should use focused changes against the current working tree, not restore a historical audit baseline or regenerate migrations merely to obtain a clean diff.

Protect `/q`, `/n`, `/t`, activation rules and `ShareProfileBridge`; scanning remains Safety Profile first. Do not create public recap URLs, change physical-tag sellability, expose Account/Finder/Social identities, or gate Share Profile QR on Community. Regression checks for later code should cover existing Share Card variants, Share Profile with Community off, tag scans/activation, old create/deep links and fallback parity. This review makes no compatibility claim based on running those suites; it identifies the required boundaries.

## 12. GO / NO-GO Recommendation for Each Phase

| Phase | Verdict now | Conditions for GO |
| --- | --- | --- |
| Phase 0 decisions/prep | **GO for product/design decisions; no code authorized by this report** | Keep scope narrow; no repository-wide calendar refactor |
| Phase 1 Dashboard as Claude proposed | **NO-GO** | It defers care correctness and understates prefill/weekly behavior |
| Revised Phase 1 Dashboard | **Conditional GO for implementation after approval** | Resolve P1-A through P1-D; verify page-101, omitted-fulfiller, partial-error and cancelled/uncertain-save cases; confirm mobile hierarchy |
| Phase 2 planner list | **Conditional GO** | Owner-filtered pending query before pagination, exact scope/counts, lifecycle/ownership rules, next-due-only product boundary |
| Phase 2 stronger completion | **NO-GO for unconditional one-tap/Undo claims** | Agree replay/conflict behavior and shared race protection; relational concurrency verification; defer Undo or design it properly |
| Phase 3 public-content recap | **Conditional GO** | Authenticated membership/media revalidation, Malaysia week logic, one Share Center flow, no-store Blob handling and measured render limits |
| Phase 3 private-content export | **NO-GO pending explicit product/security decision** | Resolve public-object posture and explicit export consent; do not silently broaden private content distribution |
| Reminders, recurrence engine, household recap | **Defer** | Separate request and product approval; Premium stays Coming Soon |

**Final answer:** Phase 1 Dashboard Enhancement is **not ready for implementation exactly as written in Claude's audit**. It becomes ready for an implementation approval once care completeness is moved forward or safely bridged, “Log as done” and its real prefill/uncertain-save behavior are agreed, the compact pet-first layout is accepted, and Phase 1 uses honest Recent Moments rather than unsupported weekly claims. The other features fit the architecture, but completion concurrency, private-media export and storage/analytics assumptions require the narrower phase gates above.

**Review stopped here. No application code, migration, dependency, configuration or existing file was changed.**
