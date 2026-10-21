# Phase 2 — Smart Care Planner: Implementation Report

**Date:** 2026-10-21 · **Branch:** `main` · **Base:** consolidated checkpoint `36fbb67`
**Status:** Implemented and validated locally. **Not committed** (awaiting review), not pushed, not deployed.

---

## Part A — Consolidated checkpoint (already committed)

- **Commit:** `36fbb67` on `main`, "chore: consolidate MyPetLink development and finalize phase 1 dashboard". 553 files changed: 31 tracked modifications and 522 reviewed new files.
- **Included:**
  - Phase 1 Dashboard and Care Records work, plus their tests.
  - Consignment, Merchant, Smart Tag, Tag Orders and Solo review, QA and release evidence (reports, screenshots, probes, result JSON).
  - Marketing demo tooling (development-only, disabled by default) and content assets.
  - Docs (audits, deployment).
  - Development launch and settings profiles, which contain no secrets.
- **Excluded** (4,392 files, kept in the working tree):

  | Category | Files | Size |
  | --- | --- | --- |
  | Build and publish output, native runtimes | 141 | 595 MB |
  | Archives and release bundles | 9 | 468 MB |
  | Copied source snapshots (`release-isolation/`, `baseline/`, `b2b-release-candidate/source/`) | 3,905 | 162 MB |
  | Test execution output (`.trx`, `.log`, raw vitest JSON) | 321 | 52 MB |
  | Patch exports | 6 | 5 MB |
  | Rendered marketing output | 7 | 6 MB |

  Also excluded: compiled Python (2 files) and an empty stray `TagOrder` file.
- **Checks before commit:**
  - secret scan: only synthetic or placeholder values, and the already-tracked development key;
  - personal-data scan: test fixtures only;
  - largest staged file: a 2.9 MB marketing image;
  - API build: 0 warnings;
  - EF model in sync with migrations;
  - web typecheck, lint and production build;
  - Phase 1 focused suites: 223/223;
  - full API (3,033) and web (4,626) suites, both run on identical source before the commit.

## 1. Phase 2 scope implemented

| Feature | Status |
| --- | --- |
| **One-step Log as done** from the planner ("Done": confirmation dialog with Done on, optional next due date, optional note) | Done |
| **Reliable completion API** (`POST /api/v1/care-records/{id}/complete`): idempotent, concurrency-safe, owner-only, lifecycle-checked | Done |
| **Care planner** (`/records`, Upcoming tab): owner-wide pending care, pet filter, overdue / due soon / later groups with exact counts, server-side paging past 100 and 500, open the record, complete eligible items, empty/loading/error/more states | Done |
| **History navigation**: Dashboard "View all" opens the planner; per-pet history pages past 100 ("Show older records"); deterministic history order | Done |
| **Race protection on every care write path** (create, update, archive, complete), which also closes the remaining Phase 1 limitation | Done |
| Repeat care / next due date | Covered by the optional next due date in Done (owner-entered only; no generated intervals) |
| Same-care "same gap as last time" suggestion | **Deferred** (review: defer for the MVP) |
| Undo / completion correction | **Deferred**: owners correct through ordinary edit or delete. A late retry of a deleted completion is refused, never re-created |
| Care reminders | **Deferred** (Premium, Coming Soon copy only) |
| Weekly Pet Recap | Not touched (Phase 3) |

## 2. Technical design

**Care-write lock.** Every care write for a pet runs through `RunCareWriteAsync`:

- an execution-strategy unit containing a READ COMMITTED transaction;
- the existing `SqlApplicationLock` taken as the first statement, with resource `care-write:{petId}`, exclusive, transaction-owned and a 10-second timeout;
- validation, write and commit, all inside the lock;
- on retry, the change tracker is cleared first.

It wraps `CreateAsync`, `UpdateAsync`, `ArchiveAsync` and `CompleteAsync`.

- **Why an application lock rather than row locks:** it doesn't depend on the read isolation level. It holds under Azure SQL's default READ_COMMITTED_SNAPSHOT as well as LocalDB. It covers the incoming-link checks, which read other rows, and it reuses an established pattern. Contention is per pet, so it is negligible.
- **Effect:** a save validated before an item changed can no longer land afterwards. The competing write waits, then runs against the committed state. This closes the Phase 1 limitation documented in the previous report.

**Completion command (`CompleteAsync`):**

1. **Validate** the key (non-empty GUID), `completedOn` (present, not after Malaysia today) and `nextDueDate` (not before `completedOn`). Field names match the request.
2. **Authorise** with an owned, undeleted target, otherwise 404. This runs before any lock, so nothing is revealed.
3. **Under the pet lock, replay check:** look up the key.
   - Same owner and same request fingerprint, record active: **200 `replayed`** with the record as it is now.
   - Different fingerprint, target or owner: 409 `idempotency_key_conflict`.
   - Record archived or deleted: 409 `completion_removed`.
4. **Under the pet lock, state checks** (status precedence): archived, then pet archived, then no due date, then already completed by an active record. Each gives a 409 with a stable code.
5. **Create** through the same `CreateRecordCoreAsync` the full form uses:
   - type, title and care name copied from the target;
   - date `completedOn`, due date `nextDueDate`;
   - **Private**, linked to the target, no documents.

   It is stamped with the key and fingerprint. A key unique violation can only come from another pet's request, which takes a different lock, and becomes `idempotency_key_conflict`.
6. Return **201 `created`**.

**Fingerprint:** SHA-256 over the target id, `completedOn`, `nextDueDate`, and the trimmed provider and notes. It is stored, so a retry is still recognised after the record is edited.

## 3. API contracts

```text
POST /api/v1/care-records/{recordId}/complete     (owner; JWT subject is the actor)
  { idempotencyKey: guid, completedOn: "YYYY-MM-DD", nextDueDate?: "YYYY-MM-DD",
    provider?: string(≤160), notes?: string(≤2000) }
→ 201 { data: { outcome: "created",  completion: CareRecord } }  Location: /care-records/{id}
→ 200 { data: { outcome: "replayed", completion: CareRecord } }
→ 400 validation_failed { idempotencyKey | completedOn | nextDueDate }
→ 404 not_found                      (not the caller's item, or deleted)
→ 409 care_item_archived | care_item_pet_archived | care_item_no_due_date
      | care_item_completed | idempotency_key_conflict | completion_removed
→ 503 care_write_busy                (pet lock not obtained within 10 s)
```

Existing contracts:

- **Unchanged:** `GET /care-records/upcoming` (paged, used by the planner), `/upcoming/summary` and `/{id}/completion`.
- **`GET /pets/{petId}/care-records`:** the response is unchanged, but the order now ends with `Id` so pages are stable when timestamps tie.

The full write-up is in `docs/api/api-contract-v1-draft.md`.

## 4. Database changes

Migration `20261020181228_AddCareCompletionIdempotency`:

- `CareRecords.CompletionIdempotencyKey uniqueidentifier NULL`;
- `CareRecords.CompletionRequestFingerprint nvarchar(64) NULL`;
- `IX_CareRecords_CompletionIdempotencyKey`, UNIQUE, filtered `WHERE [CompletionIdempotencyKey] IS NOT NULL`.

**Why it's needed:** a durable replay ("the same request returns the same record, even after a timeout or an edit") needs the request identity stored. The fulfilment link alone is cleared by archive. This follows the existing `PetMemories.CreateIdempotencyKey` pattern.

**Safety:**

- additive, with nullable columns;
- no existing row changes and no backfill;
- old API code ignores the columns;
- `Down` drops the index and columns.

The root `migration.sql` was regenerated with `dotnet ef migrations script --idempotent`. That command reproduces the previous file byte for byte, so the diff is only +43 lines for this migration. The deploy needs this migration applied before the new API.

## 5. Idempotency and concurrency guarantees

| Scenario | Guarantee | Evidence |
| --- | --- | --- |
| Double click | One request (the button disables) and, regardless, one record per key | Browser S3; component test; relational test with 8 concurrent same-key requests |
| Same key replayed (lost response, timeout after commit) | 200 `replayed`, the same record, no second write | HTTP test; relational "retry after commit"; browser S4 (real `route.fetch` + abort, then Try again) |
| Retry arriving while the original is still writing | Waits for the pet lock, then replays the original's record | Relational test (original paused inside its insert) |
| Same key, different details / item / owner | 409 `idempotency_key_conflict`, nothing written | Unit theory (4 cases); relational cross-owner race (unique index backstop) |
| Two tabs, different keys | Exactly one completion; the others get 409 `care_item_completed` | Relational test (6 concurrent); browser S5 |
| Target archived during a completion | The archive waits for the completion, then runs (and unlinks it, as archive always does). Never "completed on a deleted item" | Relational tests (command and full form) |
| Target due date moved or cleared during a completion | The edit waits; moving the date then succeeds, clearing it is refused (the item is completed) | Relational theory (2 cases) |
| Full form (Phase 1) racing the one-step command | One completion; the command gets 409 | Relational test |
| Phase 1 interleavings (G2, R2, due-date) | Rewritten: the competing write now waits and then runs against the committed state | 5 rewritten relational tests |
| Cross-owner / cross-pet | 404 before any lock or replay check; a key can't reveal another owner's record | Unit and HTTP tests |
| Deleted completion, then replay | 409 `completion_removed`; never re-created | Unit test |
| Malaysia midnight | `completedOn` checked against Malaysia's day (15:59:59Z vs 16:00:00Z) | Unit theory (3 cases) |
| More than 100 / 500 pending items, paging while completing | Exact totals, no repeats, ordered pages; the client re-reads its loaded window after every change | Relational tests (520 and 150 items with concurrent completions); browser S1 (130 items); component test (520 items) |

**Negative control:** with the application lock disabled, 4 race tests fail. The file was restored byte-identical (SHA-256 checked).

No fixed timer decides anything, and no claim of exactly-once delivery is made beyond "one record per key, one completion per item".

## 6. Frontend screens and flows

**`/records` (Care):**

- tabs **Upcoming** (default) and **All records** (`?view=all`, the existing per-pet picker);
- `?pet=` narrows the planner;
- Back restores the view.

**Care planner:**

- pet chips (shown with more than one pet);
- the success notice;
- grouped cards **Overdue / Due soon / Later**, with exact counts from the summary;
- rows reuse the Dashboard's care-row look and offer **Done** and **Open**;
- **Show more care dates (N more)**, 50 per page;
- re-reads on focus or visibility change (other tabs, a new Malaysia day);
- an empty state for no records and one for nothing pending;
- an error state with Try again. A failed read is never shown as "nothing due".

**Mark as done dialog:**

- **Fields:** Done on (default Malaysia today, max today), Next due date (optional, "From your vet card or clinic"), Note (optional).
- **While sending:** the dialog can't be dismissed and the button is disabled.
- **After an unknown outcome:** the details lock, and **Try again** resends the same key and details.
- **Refusals:** each is explained, and only Close is offered.
- **Field errors:** shown inline; the corrected request is sent under a new key.
- **Full form:** "Add documents or a clinic" opens the Phase 1 full Log as done form, which is unchanged.

**Dashboard:** "View all" and "N more care dates" now open the planner, filtered to the pet when one is selected. The Dashboard layout is unchanged, and its per-item "Log as done" still opens the full form.

**Per-pet history:** **Show older records (N more)** reads the next page with the exact total, without repeats.

**Screenshots** (`screenshots/`):

- `p2-01`: planner at 1280 px;
- `p2-02`, `p2-03`: dialog and success;
- `p2-04`: unknown outcome;
- `p2-05`: already logged in another tab;
- `p2-06`, `p2-07`: 390 px planner and dialog.

## 7. Exact changed files (uncommitted Phase 2 work)

**API:**

- `MyPetLink.Api/Entities/CareMediaEntities.cs`
- `MyPetLink.Api/Data/MyPetLinkDbContext.cs`
- `MyPetLink.Api/Migrations/20261020181228_AddCareCompletionIdempotency.cs` (new) and `.Designer.cs` (new)
- `MyPetLink.Api/Migrations/MyPetLinkDbContextModelSnapshot.cs`
- `MyPetLink.Api/Services/CareRecordService.cs`
- `MyPetLink.Api/Services/ServiceContracts.cs`
- `MyPetLink.Api/DTOs/MemoryCareDtos.cs`
- `MyPetLink.Api/Controllers/CareRecordsController.cs`
- `migration.sql` (root)

**API tests:**

- `CareCompletionCommandTests.cs` (new, 19)
- `CareRecordUpcomingHttpTests.cs` (+5)
- `Relational/CareCompletionCommandRelationalTests.cs` (new, 11)
- `Relational/CareCompletionInterleavingRelationalTests.cs` (5 rewritten)
- **Consignment migration-rollback tests:** `Relational/ConsignmentReferenceAndDefaultTermsRelationalTests.cs`, `…AgreementDocumentRelationalTests.cs`, `…SalesFinalRemediationRelationalTests.cs`, `…SalesMigrationRelationalTests.cs`, `…StocktakeRelationalTests.cs`, `…StocktakeRemediationRelationalTests.cs`. Test-only and Consignment code is untouched.
  - **Why they changed:** they list the exact migrations pending after rolling back to a Consignment migration, and EF rolls back newest first, so the new care migration now appears in those lists. The project's convention is to append each new migration to them, as it did for References.
  - **The blocked-rollback test** now expects the care migration, which rolls back before the Consignment guard stops the run, as the only pending migration.

**Web:**

- `src/components/portal/care/CarePlanner.tsx` (new)
- `src/components/portal/care/CompleteCareDialog.tsx` (new)
- `src/components/portal/care/CareHome.tsx` (new)
- `src/app/records/page.tsx`
- `src/components/portal/RecordsManager.tsx`
- `src/components/portal/dashboard/DashboardCareSection.tsx`
- `src/lib/careContracts.ts`
- `src/lib/routes.ts`
- `src/services/apiDtos.ts`
- `src/services/recordService.ts`
- `src/types.ts`

**Web tests:**

- `src/components/portal/care/CarePlanner.test.tsx` (new, 15)
- `src/components/portal/care/CareHome.test.tsx` (new, 3)
- `src/components/portal/RecordsManager.history.test.tsx` (new, 3)
- `src/services/recordService.completion.test.ts` (new, 15)

**Docs:** `docs/api/api-contract-v1-draft.md`, `apps/web/docs/OWNER_PORTAL_FLOW.md` (§6, §6a).

**Artifacts:** this report, `e2e-care-planner.mjs`, `e2e-care-planner-results.json`, `screenshots/p2-01…07`.

## 8. Test results

| Check | Result |
| --- | --- |
| Care API (unit, HTTP, relational, identity) | **144/144** |
| SQL Server relational care tests (command 11, interleaving 10, upcoming 3) | All pass, 0 skipped; lock negative control fails 4/4 as expected |
| **Full API suite** (idle LocalDB) | **3,067 passed, 1 failed, 0 skipped** of 3,068 (22 m 20 s, uninterrupted). The one failure is `SmartTagRateLimitingTests.PublicTagRoute_AboveLimitReturnsStandard429WithRetryAfter`: it got 200 instead of 429 after 13 s, so the requests most likely spanned the limiter's time window under full-suite load. It passes 8/8 in three isolated runs, and no Smart Tag code changed in this phase. A sibling test failed the same way in the previous full run, and also passes in isolation. All 196 Consignment relational tests pass after the migration-list update (§7) |
| **Full web suite** | 392 files passed, 1 skipped; **4,662 passed, 7 skipped, 0 failed** |
| Typecheck (app and functions, unfiltered) / lint | Pass / pass |
| Production build (`--smart-tags=true --tag-orders=true --ordering=true on`) | Pass: 160 pages, release-flag/social/SEO checks |
| **API-connected browser run** (real web + API + disposable DB migrated with the new `migration.sql`; failures injected in the browser only) | **16/16 checks across 9 scenarios** |

Safety measures for the browser run:

- a random JWT signing key, so no stored secret was read;
- R2 credentials blanked; email, DevAuth and MarketingDemo off;
- `.claude/launch.json` restored byte-identical;
- the disposable database dropped by exact name;
- no pre-existing database touched and no LocalDB restart.

## 9. Known limitations and deferred items

- **Undo** is deferred (review: not approved as a simple toast). Corrections go through ordinary edit and delete; a retried deleted completion is refused.
- **Same-gap suggestion and reminders** are deferred. Reminders keep their Coming Soon copy.
- **Offset paging** is still used, with no cursor (the review asked for none in v1). Between two page reads a change can shift items. The planner re-reads its whole loaded window after every change and on focus, and de-duplicates by id. A keyset cursor would remove the window entirely.
- **Lock behaviour:** a care write that waits more than 10 seconds for the pet lock gets 503 `care_write_busy` and can be retried. Load on Azure SQL hasn't been measured.
- **Archiving a completed item** still unlinks its completion. That is existing behaviour; the completion stays in history.
- **No feature flag.** The planner replaces the `/records` landing (the pet picker moves to All records). If it should ship dark, a flag would need adding: a product decision.

## 10. Migration and deployment requirements

1. Apply migration `AddCareCompletionIdempotency` (root `migration.sql`, idempotent) **before** deploying the API. The change is additive, so the old API runs unaffected on the new schema.
2. Deploy the API, then the web build. The new web needs `POST /complete`; an old API returns 404 there, which the dialog shows as a refusal, never a false success.
3. **Rollback:** web first. The API can roll back on the new schema, since the columns are ignored by old code. Dropping the columns (`Down`) is optional and loses replay identity only.
4. **Release-candidate smoke** with real auth:
   - a slow network while saving;
   - two tabs;
   - an item deleted while the dialog is open;
   - more than 100 pending items;
   - the four widths.

## 11. Final Git status

- `main` at `36fbb67` (Part A checkpoint). Not pushed.
- The Phase 2 files in §7 are modified or untracked and **not committed**, pending review.
- The 4,392 excluded Part A files remain untracked, along with `TagOrder`, `physical-qa-release.patch` and the marketing `output/` folder (excluded; not deleted).
- `.claude/launch.json` is unchanged.

## Answers

- **Was the consolidated checkpoint committed directly to `main`?** Yes.
- **Commit SHA?** `36fbb67`.
- **Legitimate changes included?** Phase 1 Dashboard and Care Records work with tests, review and release evidence across Consignment, Merchant, Smart Tag, Tag Orders and Solo, marketing tooling and assets, docs, and development profiles. 553 files.
- **Files intentionally excluded?** Yes, 4,392: build and publish output, native runtimes, archives, copied source snapshots, test execution output, patch exports, rendered marketing output, compiled Python and an empty stray file. All are still on disk.
- **Phase 2 features implemented:**
  - the idempotent, concurrency-safe completion API with its migration;
  - per-pet write serialisation across all care write paths;
  - the Care planner with paging and pet filter;
  - the one-step Mark as done dialog with safe retry;
  - planner-first Dashboard navigation;
  - paged per-pet history.
- **What remains?**
  - Review and commit;
  - the Undo / same-gap / reminder decisions (deferred);
  - an optional feature flag;
  - Azure SQL load measurement;
  - the release-candidate smoke with real auth.
- **Ready for independent Codex review?** Yes, see §8.


---

# Independent Review Remediation — F1–F6

**Date:** 2026-10-21 · Input: `independent-review.md` (NO-GO: 1 P1, 5 P2). Phase 2 is still **uncommitted**; `main` is at `36fbb67`, nothing is pushed or deployed.

## Direct answers

| Question | Answer |
| --- | --- |
| 1. Can a late load-more response display another pet's actionable rows? | **No.** Every read carries a generation and the pet filter it was made for. A filter change, a newer read or unmount retires it, and its rows, error and loading state are all ignored. Rows are also filtered to the selected pet before rendering. Reproducer test plus the browser run (R1, real held response). |
| 2. Can the Done dialog lose the only copy of an unresolved idempotency key while the page remains open? | **No.** The attempt (key, frozen details, target and pet) lives in the planner, not the dialog. Closing after an unknown outcome keeps it ("isn't confirmed yet" with Review and Discard), and reopening Done for the item reopens it. While sending, nothing dismisses the dialog and the full-form link is disabled. Only an explicit Discard, a page reload or navigating away drops it, and the copy says so. |
| 3. Can different provider/notes values produce the same fingerprint encoding? | **No.** The fingerprint is SHA-256 over a versioned JSON array, `["care-completion-v1", target, completedOn, nextDueDate, provider, notes]`. Each value is quoted and escaped, and null stays distinct. The review's exact collision now returns `409 idempotency_key_conflict`. |
| 4. Can the Planner silently terminate paging while pending items remain? | *Superseded by the Final F4 section below: equal-total churn between pages was not detected; multi-page lists are now presented as a best-effort live list.* **No** silent end. Show more re-reads the whole window from page 1. "More" and end-of-list are only decided from a read whose pages agree (one total, one day, no repeats, no gaps). Otherwise it says the list changed and offers Refresh, without claiming the list is complete. The 105-item reproducer now shows a-050…a-054. |
| 5. Can an older empty summary hide a newly returned pending item? | **No.** Rows from the list read always render. Empty states require the list read itself to be empty and agree with the summary. A disagreement is read again, then shown without counts and with a "changed while loading" note. |
| 6. Can pet archive commit ahead of a protected completion? | **No.** `PetService.ArchiveAsync` now takes the same `care-write:{petId:N}` transaction-scoped application lock, through the same shared helper. SQL test: the archive waits for the paused completion, then commits; the reverse order refuses the completion. |

## Finding-by-finding

**F1 (P1), stale load-more crossing pet filters**

- *Root cause:* only the initial read had a generation check; `loadMore` appended to whatever state existed when it settled, and its error and finally handlers were unscoped.
- *Fix:* `CarePlanner` reads are generation-scoped. The filter effect's cleanup and unmount retire reads. Show more is itself a generation-scoped window read. Loading and error flags are set only by the newest read. Visible rows are filtered to the selected pet.

**F2 (P2), lost attempt and full-form bypass**

- *Root cause:* the key and payload lived in the dialog's refs; the full-form link stayed active while sending.
- *Fix:* a `CompletionAttempt` is held by the planner, keyed by care item: `{ id, item, key, input (frozen), phase, message, fieldErrors, draft }`. The dialog only presents it.
- *Sending:* Cancel, Close and Escape are disabled, and the link is replaced by an `aria-disabled` label.
- *Unknown outcome:* the details lock; Try again sends `attempt.input` (same key and payload); Close keeps the attempt behind a banner with Review and Discard.
- *Definite refusal (400 with field errors):* the details are offered for correction under a **new** key, because nothing was written.
- *Settlement:* a response for an attempt the owner discarded only refreshes the list. After unmount nothing is applied.
- *Unsent draft:* the full-form link shows an explicit "won't carry over" confirmation (Go to the full form / Stay here).

**F3 (P2), fingerprint collision**

- *Root cause:* `string.Join("\n", …)` over free text.
- *Fix:* the versioned JSON array described above.
- *Normalisation:* provider and notes are trimmed and empty becomes null, matching storage. Text is otherwise compared exactly, with no Unicode normalisation.
- *Compatibility:* no persistent database has the new columns. All 14 local persistent databases were checked: `no-column` everywhere, so no keyed record uses the old encoding and no shim is needed. The version tag lets any future change coexist.

**F4 (P2), offset churn**

- *Root cause:* pages were appended at old offsets, and the end was decided from the de-duplicated row count.
- *Planner fix:* every read re-reads the shown window from page 1 (100 per request) and checks the pages agree (one total, one Malaysia day, no repeats, every page full but the last, coverage equal to `min(window, total)`). Up to three reads, then a "may be out of date" state with Refresh. A Refresh button is always shown.
- *History fix:* "Show older records" re-reads pages 1…n+1 with the same checks; on disagreement it replaces nothing and offers **Reload records**. Local creates and deletes keep the total current, and history reads are generation-scoped.
- *Guaranteed (superseded, see Final F4 section):* each shown window comes from one read whose pages agreed when read. Agreement is partial detection, not proof of a stable membership.
- *Not guaranteed:* that separate requests form one snapshot, or that the list stays current after it is shown. Refresh, focus and completion re-read it.

**F5 (P2), stale summary over rows**

- *Root cause:* the empty-state branch was chosen from the summary, which was read before the page.
- *Fix:* the summary is used only for counts, and only when it agrees with the pages: same day, same pending total, category counts fit the rows. "No care records yet" / "No pending care dates" come from the list read itself (its total and `petIdsWithCareRecords`). A failed summary still shows the rows, with "The totals aren't available right now". A Malaysia-midnight split re-reads and settles.

**F6 (P2), pet archive outside the care lock**

- *Root cause:* `PetService.ArchiveAsync` saved without the per-pet lock.
- *Fix:* the lock logic moved to `Common/PetCareWriteLock.RunAsync`, shared by `CareRecordService` (create, update, archive, complete) and `PetService.ArchiveAsync`.
- *Design:* each operation takes only this one lock, so there is no lock ordering to get wrong. The lock is transaction-owned, the unit retries with a cleared tracker, and ownership is checked before the lock so nobody can hold another owner's lock.
- *Archive behaviour unchanged:* lifecycle, `ArchivedAt` and Lost Mode off.
- *Other lifecycle transitions assessed:*
  - Memorial still allows care writes (unchanged, not deactivating).
  - Restore re-activates (no race risk).
  - No pet hard-delete exists in `PetService`.

  Only archive needed the lock.

**A. Edited completion replay.** `parseCareCompletionResult` now checks the link only for `created`. A `replayed` record is the original request's record as it is now, possibly re-linked or unlinked since. The planner reports it as "was logged as done earlier; that record has since been changed", not as unknown. The durable idempotency contract is unchanged.

**B. Smart Tag rate-limit test.** No Smart Tag code was changed. `SmartTagRateLimitingTests` failed once in each of the last three full runs, each time a different test, after 11–13 seconds (got 200 or 404 instead of 429). It passed 8/8 in every isolated run (three times after each full run). This looks like a limiter time-window flake under full-suite load. It is recorded as a failure, not a pass. A deterministic-clock fix belongs in a separate, test-only change.

## SQL Server evidence (real LocalDB, disposable fixture databases)

| Test | Result |
| --- | --- |
| `ArchivingThePetWhileACompletionIsWriting_WaitsForIt`: the review's interleaving (completion paused inside its insert holding the lock; `PetService.ArchiveAsync` on another connection) | Archive still pending after 750 ms, pet still Active. After release: completion `created`, then pet Archived; status `pet-archived` with that completion; 1 completing record |
| `ACompletionAfterThePetWasArchived_IsRefused` (opposite order) | `care_item_pet_archived`, 0 records |
| `ArchivingThePetWhileItsCareLockIsHeldTooLong_FailsSafelyAndChangesNothing` | Archive gets `503 care_write_busy` after the 10 s lock wait, pet unchanged; after release the completion commits and archiving then succeeds |
| Failing first | Before the fix, both interleaving tests failed (archive committed immediately). After the fix they pass. |

The existing 11 command, 10 interleaving and 196 Consignment migration-rollback relational tests all pass in the full run.

## Regression tests added (failing first)

| Area | Tests | Before fix → after |
| --- | --- | --- |
| F3 collisions and normalisation (`CareCompletionCommandTests`) | 5 conflict cases (exact Codex case, boundary ambiguity, `\n` vs `\r\n`, Unicode, null vs text) + 3 replay cases (null/empty/whitespace, trimming, Unicode with newline) | Codex case and boundary case failed → all pass |
| F6 (`CareCompletionCommandRelationalTests`) | 3 | 2 failed → pass |
| F1, F4, F5 (`CarePlanner.consistency.test.tsx`) | 16 (F1 ×5: reproducer, rapid switching, refresh overtaking, stale error, unmount; F4 ×5: 105-item reproducer, insertion, date-edit reorder, disagreeing pages, 520 items; F5 ×6: reproducer, non-empty summary over empty page, midnight split, failed summary, count mismatch, stable empty) | 12 failed, including all 3 reproducers → pass |
| F2 and A (`CompleteCareFlow.test.tsx`) | 8 (link disabled while sending, Close then Review same details and key, reopen the held attempt, network still down, other tab, discard then new key, unmount, unsent-draft confirmation, edited replay) | 6 failed → pass |
| A (`recordService.completion.test.ts`) | +2 (replay re-linked or unlinked accepted; `created` still strict) | 1 failed → pass |
| History (`RecordsManager.history.test.tsx`) | 6 (deleted between pages, inserted before page, disagreeing pages → Reload records, plus 3 existing) | 3 failed → pass |

Updated tests:

- `CarePlanner.test.tsx`: the no-records state now comes from the list read; a failed **list** read gives the error state; replay mocks carry their link.
- `CareCompletionCommandTests`: a harness of the theory data.

## API-connected browser run (real web, API, disposable DB; holds and aborts injected in the browser)

`e2e-care-remediation.mjs`: **12/12 checks** (`e2e-care-remediation-results.json`).

- **R1 (F1):** all-pets page 2 held; switch to the long-named pet; release. Only that pet's one row and one Done button remain.
- **R2 (F4):** 105 pending; five earliest completed via the API between reads; Show more shows exactly the next 100, none skipped or stale.
- **R3 (F5):** an item created after the summary read but before the list read is shown; no empty state.
- **R4 (F2):**
  - the POST is held, and the full-form link is disabled while it is;
  - the server commits, then the response is aborted, giving an unknown outcome;
  - Cancel shows the banner;
  - Review restores the same note and next date;
  - Try again sends an identical body (200 replay); 1 completion.
- **R5 (F2):** a typed note, then the full-form link, shows the confirmation; Go to the full form opens the Phase 1 form.
- **UX:**
  - 320, 390, 768 and 1280 px: no sideways scroll.
  - The dialog keeps keyboard focus through 8 Tabs.
  - Long pet name: truncated in its chip with `title`. Long care title: wraps.
  - End-of-list clearance above the mobile bottom bar was verified in the screenshots (`screenshots/remediation/r-ux-planner-390-end.png` and 320). The script's own clearance check did not locate the bar element, so it is not counted as evidence.

Screenshots are in `screenshots/remediation/`.

Safety measures for the browser run:

- a random signing key, so no stored secret was read;
- R2 credentials blanked;
- `.claude/launch.json` restored byte-identical;
- the disposable database dropped by name;
- no pre-existing database touched and no LocalDB restart.

## Results

| Check | Result |
| --- | --- |
| Full web suite | 394 files passed, 1 skipped; **4,691 passed, 7 skipped, 0 failed** |
| Typecheck (app and functions, unfiltered) / lint | Pass / pass |
| Production build (approved flags) | Pass: 160 pages, release-flag/social/SEO checks |
| **Full API suite**, uninterrupted, idle LocalDB | **3,078 passed, 1 failed, 0 skipped of 3,079** (22 m 33 s). The failure is `SmartTagRateLimitingTests.Activation_UsesIndependentAuthenticatedUserPartitions` (got 404 instead of 429): the known flake (section B), 8/8 ×3 isolated. Every care, pet, relational and Consignment migration test passed. *(It was started with a `Care\|Pet` filter, but `Pet` matches the `MyPetLink` namespace, so it selected the whole suite.)* |
| Browser run | 12/12 |

## Exact files changed in this remediation

- **API:**
  - `Common/PetCareWriteLock.cs` (new)
  - `Services/CareRecordService.cs` (fingerprint encoding; lock delegated to the helper)
  - `Services/PetService.cs` (`ArchiveAsync` under the lock)
- **API tests:**
  - `CareCompletionCommandTests.cs` (+8 cases)
  - `Relational/CareCompletionCommandRelationalTests.cs` (+3)
- **Web:**
  - `components/portal/care/CarePlanner.tsx` (generation-scoped window reads, consistency checks, Refresh, page-level attempts)
  - `components/portal/care/CompleteCareDialog.tsx` (presentational; full-form guard)
  - `components/portal/RecordsManager.tsx` (history window re-read, generation, totals)
  - `lib/careContracts.ts` (replay link rule)
- **Web tests:**
  - `care/CarePlanner.consistency.test.tsx` (new)
  - `care/CompleteCareFlow.test.tsx` (new)
  - `care/CarePlanner.test.tsx`
  - `RecordsManager.history.test.tsx`
  - `services/recordService.completion.test.ts`
- **Docs:** `docs/api/api-contract-v1-draft.md`, `apps/web/docs/OWNER_PORTAL_FLOW.md` §6a, this report.
- **Artifacts:** `e2e-care-remediation.mjs`, `e2e-care-remediation-results.json`, `screenshots/remediation/` (15 images).

## Remaining risks

- **Planner and history reads** are consistent per read, not across reads. A list left open goes stale until Refresh, focus or an action, including after Malaysia midnight. Each Show more re-reads the whole window: about n/100 requests for a window of n items.
- **Held attempts are page-scoped.** A reload or navigation loses the local copy; the copy says so, and the server's key still makes a later retry safe if it is replayed.
- **The care-write lock now also covers pet archive.** A writer waiting more than 10 s gets `503 care_write_busy`; contention on Azure SQL is unmeasured.
- **The Smart Tag limiter test is flaky under full-suite load** (section B).

## Migration and deployment

No new migration in this remediation. Phase 2 still needs `AddCareCompletionIdempotency` applied before the API, then the API, then the web. The fingerprint encoding changed before any deployment, and no persistent database holds keys, so no data step is needed. Rollback: web first; the additive columns can stay.

## Git status

- `main` is at `36fbb67`. Nothing is staged, committed or pushed.
- The Phase 2 and remediation files listed above are modified or untracked.
- The unrelated untracked files from Part A are untouched.
- `.claude/launch.json` is unchanged.


---

# Final F4 Best-effort Live List Acceptance Correction

**Date:** 2026-10-21 · Input: `final-independent-review.md` (NO-GO on F4 only; F1, F2, F3, F5 and the F6 archive race verified resolved). Phase 2 is still **uncommitted**; `main` is at `36fbb67`.

## Direct answers

| Question | Answer |
| --- | --- |
| Can a multi-page Planner list still be temporarily stale? | **Yes, during concurrent changes.** Separate page requests are not one snapshot. A completion that creates a next due date keeps every total the same while shifting items across pages. The browser run reproduced it for real: 150 shown, 5 stale, total still 150. |
| Will that now be clearly communicated even when Show more is exhausted? | **Yes.** Any Planner read that took more than one page request shows "Care dates may change while you're browsing. Refresh to check the latest list." with a **Refresh the list** button. It is shown whether or not more remain, and the list has no summary counts. **Refresh** at the top is always available when the list is shown. |
| Can History users always reload an exhausted multi-page list? | **Yes.** Once more than one page is shown, History shows "Records may change while you browse. Reload to check again." with **Reload records**, including after Show older records is gone. Reload re-reads the same window. |
| Do we still claim matching counts imply a consistent snapshot? | **No.** Code comments, `OWNER_PORTAL_FLOW.md`, the API contract and this report say equal totals, days and unique IDs only *detect some* changes. Counts are shown only beside a list read in a single request that the summary agrees with. |
| Are F1, F2, F3, F5 and F6 unchanged and passing? | **Yes.** No API file changed in this correction, so the last full API run stands (3,078/3,079, only the known Smart Tag limiter flake). All F1/F2/F5 web tests pass (48 Planner + 77 History/records), and the F3/F6 API tests are unchanged. |

## 1. Original equal-total issue (reproduced before fixing)

**Planner.**

1. Start with 150 due-soon items.
2. Load 50, then 100 shown.
3. Show more starts reading the 150 window.
4. Between page 1 and page 2, the first five are completed and five later next-due items appear.
5. Total, day and categories are unchanged, and all IDs are unique.

Before the fix, the exhausted list of 150 rows (5 stale, 5 current omitted) showed exact-looking group counts and no qualification.

**History.** The same shape: five records archived and five added between page 1 and page 2, total 150. Before the fix, Show older records disappeared and there was no Reload records and no note.

Both new tests failed before the change (`CarePlanner.consistency.test.tsx`, `RecordsManager.history.test.tsx`).

## 2. Chosen model: best-effort live list

The guarantee, stated as built:

1. Each API page returns the owner's authorized records according to its own read.
2. The Planner and History detect some changes across page reads (a total or Malaysia day that moved, a repeat, a short page, summary counts that don't fit) and react with a stronger warning and, for the Planner, a re-read.
3. Separate page responses are not guaranteed to describe the same dataset version.
4. Concurrent completions, edits or additions may temporarily leave stale or omitted rows on screen.
5. Persistent **Refresh** (Planner) and **Reload records** (multi-page History) let owners request a fresh window. A refresh does not stop later changes.
6. The UI states this limitation whenever a list was read across more than one page, including when no more pages are available.
7. Completing an item is validated independently by the server, using the existing idempotency key, the per-pet care-write lock and the status checks. A stale row's Done is refused or replayed correctly, never doubled.

No cursor pagination, change tokens, schema, migration, polling, flag or new dependency.

## 3. Planner changes (`CarePlanner.tsx`)

- `WindowRead.pagesRead` counts the page requests a read actually made.
- **Read across more than one request and no detected disagreement:** shows the neutral freshness note with **Refresh the list**, below the groups and next to Show more. Style: muted text on white with a light border, not error colouring.
- **Group counts:** shown only for a single-request read that the summary agrees with, never beside rows read across pages.
- **Detected disagreement:** keeps the stronger, distinct warning, now worded "Some care dates changed while loading. Refresh to check again." (empty-list variant: title "Some care dates changed while loading." with "Refresh to check again."). The planner still re-reads up to three times first.
- **Unchanged:** generation and pet-scope rejection of stale reads (F1), whole-window re-read from page 1, empty states only from an agreeing read (F5), Done and Open tied to each row's item and pet, the always-present top **Refresh**.

## 4. History changes (`RecordsManager.tsx`)

- `loadMoreHistory` became a shared, generation-scoped `readHistory(pages)`.
  - **Show older records:** reads `historyPages + 1` pages.
  - **Reload records:** reads the same window, or the pending one after a detected change. The new window replaces the old one, and stale reads from older reloads or another pet are ignored.
- **Multi-page history (`historyPages > 1`):** always shows "Records may change while you browse. Reload to check again." with **Reload records**, whether or not older records remain. A single-page history shows neither, to avoid clutter.
- **Detected disagreement:** keeps its stronger message ("Your care records changed while they were loading, so this list may be out of date.") with Reload records.
- **Unchanged:** create, edit and archive, total bookkeeping, and the Phase 1 full-form Log as done.

## 5. Owner-facing wording

| Situation | Copy |
| --- | --- |
| Planner, read across pages | "Care dates may change while you're browsing. Refresh to check the latest list." + **Refresh the list** |
| Planner, detected change | "Some care dates changed while loading. Refresh to check again." |
| Planner, always | **Refresh** |
| History, more than one page | "Records may change while you browse. Reload to check again." + **Reload records** |
| History, detected change | "Your care records changed while they were loading, so this list may be out of date." + **Reload records** |

## 6. Regression tests and results

| Test | Result |
| --- | --- |
| **Test A**, Planner equal-total churn between pages: exhausted list keeps the note, Refresh and Refresh the list, no counts, no false empty; a stable Refresh then shows the exact current IDs | Failed before → **passes** |
| Planner: detected disagreement shows the distinct stronger wording | Passes |
| Planner: a single-request list shows exact counts and no note | Passes |
| **Test B**, History equal-total churn: note and Reload records after Show older is gone; a stable reload shows current membership in the same window | Failed before → **passes** |
| History: a single-page history shows no note or reload | Passes |
| **Test C**, existing regressions: 105-row offset case, more than 500 items, insertion and removal, date reordering, stale pet-filter Show more, rapid switching, refresh overtaking, changed between reads, stable empty, stable single page, F2 flow, F5 cases | All pass (Planner/care 48, RecordsManager 77 including history 8) |
| Focused regression set (Planner, completion flow, History, records, Dashboard, Dashboard helpers, care services) | **281/281** across 15 files |
| **Test D**, browser run against the real API and disposable DB (`e2e-care-f4-final.mjs`) | **8/8** (below) |
| Full web suite | 394 files passed, 1 skipped; **4,696 passed, 7 skipped, 0 failed** |
| Typecheck (app and functions) / lint / production build (approved flags) | Pass / pass / pass (160 pages, flag and SEO checks) |
| API | **Not re-run.** No API file changed since the last full run (3,078/3,079; the one failure is the pre-existing Smart Tag limiter timing flake, no Smart Tag production change). |

Browser run details (`e2e-care-f4-final-results.json`, `screenshots/f4-final/`):

- **Real equal-total churn:** page 2 was held while five items were completed with next due dates through the API. The exhausted list showed 150 rows, 5 of them stale, with the total still 150. The freshness note was visible, no counts were shown, and exactly one top Refresh was present.
- **Refresh the list, activated by keyboard:** showed exactly the API's current 150.
- **History:** exhausted after Show older, with the note and Reload records, which worked by keyboard.
- **320, 390, 768 and 1280 px:** the notes wrap, there is no sideways scroll, and the buttons fit the width.
- **Above the bottom bar:** confirmed visually in the 320 and 390 px end-of-page screenshots.
- **Teardown:** disposable database dropped, signing key deleted, `.claude/launch.json` restored byte-identical.

## 7. Correctly bounded guarantees

The report's earlier F4 statements are superseded:

- "**No** silent end" (remediation answer 4);
- "Guaranteed: each shown window comes from one read whose pages agreed".

The correct statement is section 2 above: detection is partial, multi-page lists are presented as best-effort, and refresh or reload is always offered. Equal totals, days, full pages and unique IDs **do not** prove a stable membership, no duplicates **does not** mean nothing is missing, and an exhausted Show more **does not** mean every current pending record is shown.

## 8. Remaining accepted limitations

- A multi-page Planner or History list can briefly show stale rows or miss current ones during concurrent changes, until the owner refreshes. A refresh can itself be overtaken by later changes.
- Each Show more re-reads the whole window (about n/100 requests for a window of n items).
- A list left open isn't refreshed automatically. There is no polling; the window is re-read when it regains focus.
- The Smart Tag limiter test flake is unrelated and still open (needs a separate, test-only fix).

## 9. Exact files changed in this correction

- `apps/web/src/components/portal/care/CarePlanner.tsx`
- `apps/web/src/components/portal/RecordsManager.tsx`
- `apps/web/src/components/portal/care/CarePlanner.consistency.test.tsx` (+3 tests, stronger-wording expectation)
- `apps/web/src/components/portal/RecordsManager.history.test.tsx` (+2 tests, server hook)
- `apps/web/docs/OWNER_PORTAL_FLOW.md` §6a
- `docs/api/api-contract-v1-draft.md` (paging consistency note under `GET /care-records/upcoming`)
- This report
- `artifacts/care-planner-phase2/e2e-care-f4-final.mjs`, `e2e-care-f4-final-results.json`, `screenshots/f4-final/` (10 images)

## 10. Git status

- `main` is at `36fbb67`. Nothing is staged, committed or pushed.
- Phase 2 (including this correction) is uncommitted.
- Unrelated untracked work is untouched.
- `.claude/launch.json` is unchanged.
- No LocalDB restart; no pre-existing database touched.
