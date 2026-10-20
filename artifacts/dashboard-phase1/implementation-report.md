# Phase 1 Pet Owner Dashboard — Local Implementation Report

**Date:** 2026-10-20 · **Base:** `main` @ `808296d` plus the existing uncommitted work, left untouched
**Status:** Implemented and validated locally only. Nothing committed, pushed or deployed.

**This revision:** the recovery state-machine correction for G1–G4 from `release-gate-review.md` (NO-GO). Section 11 summarises the earlier R1–R4 and F1–F6 revisions, which still apply except where this one supersedes them.

It adds no migration, index, isolation change, App Setting, flag, dependency, table, analytics change, media-architecture change, plan-limit change, Phase 2 command, Undo or idempotency framework. The approved Dashboard design is unchanged.

---

## 1. Direct answers

| Question | Answer |
| --- | --- |
| Can a late initial POST result ever reset a newer editor? | **No.** While a save stages files or awaits its response, the editor can't be cancelled, closed (button or Escape) or replaced by another editor. Every success, failure and reconciliation handler also checks its attempt id and editor generation before changing anything. Leaving the page retires its generation. Tested in-page against the real initial POST and upload, after unmount, and in the browser against the real API. |
| Can a refusal of Request B unlock an unlinked recovery save while Request A may still be executing? | **No.** The recovery flow no longer has any write action. "Save as a separate record" is removed entirely, refused or not. The link to the item is never removed by recovery. Proven by the UI tests, the SQL interleaving (A paused, item changed, page reloaded, B refused, A lands: one record) and the browser run. |
| Can missing canonical documents be interpreted as no attachments? | **No.** The completion contract requires a `documents` array on both the target and the completion. A missing or `null` collection is rejected as malformed, and the editor shows "We couldn't check", never a confirmation. |
| Can a cleared DueDate still be reported as ordinary completed? | **No.** The precedence is now archived → pet archived → **no due date** → completed → pending, in the API, local-data mode and the web contract. A `completed` state with an undated target is rejected. The SQL test asserts the **final** state after the paused save lands: `no-due-date`, with the late record still shown. |
| Is Phase 1 ready for a focused final release check? | **Yes, locally.** G1–G4 are fixed, with failing-first regressions now passing, and every check passes, including one uninterrupted full API run of 3,033/3,033. The remaining items are release-candidate checks: a clean release manifest from the dirty tree, a real-auth smoke with real private-storage uploads, and Azure SQL load. |

## 2. G1–G4: root cause and fix

| # | Sev. | Root cause | Fix | Failing-first evidence |
| --- | --- | --- | --- | --- |
| G1 | P1 | The save attempt was registered only after the initial POST failed. While upload or POST was pending, the editor could be dismissed and another opened. The old request's success or recovery then reset and closed the newer editor. | An explicit save lifecycle (section 3): the attempt is registered **before** the first asynchronous step; the editor can't be dismissed or replaced while the save runs; every async handler checks attempt id and editor generation; unmount retires the generation. | 5 of 6 new lifecycle tests failed on the old code (Cancel closed the in-flight editor; a dropped response after unmount still started reconciliation) |
| G2 | P1 | The `refused` flag described only the latest request, but unlocked an unlinked save that could duplicate an earlier, still-running request after a reload. | "Save as a separate record" removed from recovery entirely. A refusal shows its reason. For a changed item it adds "An earlier save for this item may still appear in your care records." Save stays locked and the link is never removed. Owners who want an independent entry use the ordinary Add record flow. | 5 UI tests failed (the shortcut was offered) |
| G3 | P2 | Rows were checked per scope only. An all-pets overdue row could contradict its pet's zero counts. An omitted `documents` field was repaired to `[]`. | Every known row (from any scope) must fit its own pet's category counts, and all known rows the all-pets counts, for truncated summaries too. A `documents` array is required on canonical records. | The review's two fixtures and 3 related cases failed |
| G4 | P2 | `completed` ranked above `no-due-date`, so a save validated before the due date was removed was reported as completed once it landed. | No due date now ranks above completed, in the API, local-data mode and the web contract. The late record is still returned and validated. | 3 API tests (in-memory, relational and the G2 due-date variant) and 2 web cases failed |

## 3. Editor and save-attempt lifecycle

**Attempt** (`CareSaveAttempt`):

```text
{ id, editorGeneration, targetId, payload (frozen), phase, mediaFileIds, uploadedFiles }
```

`phase` moves through `preparing → sending → unknown | refused`.

```text
                       ┌─────────────── save owns the editor ───────────────┐
 editing ─ Save ─► preparing ─ onSending (ids) ─► sending ─ 2xx ─► confirmed ─► editor closes
   ▲                  │                             │
   │  upload failed   │                             ├─ 0/408/5xx ─► unknown ─┐
   │  (nothing sent)  │                             ├─ 400 on link ─► refused ─┤ status read
   └──── form error ◄─┘                             └─ other 4xx ─► form error └─► assess (R1)
```

- **Registered before any async work.** For Log as done, `handleSubmit` creates the attempt with the frozen payload before staging files. `onSending` moves it to `sending` with the exact stored media ids the POST carries; a failure while still `preparing` means nothing was sent.
- **Editor generation.** One counter identifies the editor on screen. It advances when any editor opens, when it closes, after a confirmed save, when a held save is deliberately reopened, and on unmount.
- **The save owns its editor while it runs.** While `savingRef` is set:
  - Cancel is disabled;
  - the close button and Escape are removed;
  - the fields are read-only;
  - opening Add, Edit, Log as done or Review my save is ignored;
  - a second submit is ignored.

  This is the first line of protection, not the only one.
- **The draft is immutable.** It is frozen at submit, and recovery compares only that frozen draft and its media ids.
- **Cancellation vs. a sent request.** Before the POST is sent, a failure is an ordinary error with nothing written. After it may have reached the server, the outcome is unknown and is never assumed rolled back. Nothing aborts a request.
- **Documents.** Staged files are kept whenever the outcome is uncertain, and released only after a definite refusal (unchanged).

## 4. Stale-callback protection

| Handler | Guard before touching state |
| --- | --- |
| Initial POST success | Analytics fires for a real 2xx (the record exists). The list, form, dialog and message change **only if the editor generation is unchanged**. |
| Initial POST failure | Returns at once if the generation changed. `settleFailedCompletion` acts only if `saveAttemptRef` still holds that attempt id. |
| `onSending` | Updates the attempt only if it is still the registered one. |
| Status read (reconciliation) | `isCurrentAttempt`: same attempt id **and** same editor generation, checked before the read and again after it resolves, in both success and failure paths. |
| `finally` | Always ends the running save (`savingRef` and Saving state), whichever editor is on screen. |
| Unmount | The generation is retired, so every pending handler above becomes a no-op. A dropped response after unmount starts no reconciliation (tested). |

A held save becomes current again only through **Review my save** or reopening the same item. The restore adopts it under the new generation deliberately; it can't happen by accident.

## 5. Final recovery behaviour

| Outcome | Shown | Save | Actions |
| --- | --- | --- | --- |
| 2xx | "{Item} is logged as done." | — | — |
| Unknown, confirmed match, with uploads | "…is logged as done with your details and attachments." | — | — |
| Unknown or refused, confirmed match, no uploads | "Care is already logged with these details." | — | — |
| Unknown, nothing yet | "We can't confirm this save yet — it may still be finishing. Your details are kept on this page…" | Locked | Check again, View care records |
| Unknown, status unreadable | "We couldn't check whether this was saved…" | Locked | Check again, View care records |
| Unknown, other details or attachments | "…is logged as done on {date} with different details / the same details but different attachments. We can't tell yet whether your save went through." | Locked | Check again, View care records |
| Unknown, item changed | "This care item was deleted / its due date was removed / this pet's profile was archived while you were saving…" | Locked | Check again, View care records |
| Refused, other completion | "…was already logged as done on {date} with … so this save wasn't recorded." | Locked | View care records |
| Refused, item changed | "…, so this save wasn't recorded. An earlier save for this item may still appear in your care records." | Locked | View care records |
| Refused, item still pending | The service's reason | Open (link kept) | Correct and save |
| Other definite refusal | The service's reason | Open | Correct and save |

- **Removed:** "Save as a separate record" and its note. With them goes every path that cleared `fulfillsCareRecordId` from recovery.
- **Unchanged:** no timer-based unlock; no claim of exactly-once delivery. Ordinary Add record stays available as a deliberate, separate action.
- **Page-scoped hold:** closing an unknown save shows "Your log for {item} isn't confirmed yet. Your details are kept on this page until you leave or reload it. Leaving doesn't cancel a save that was already sent."
- **UI fix from the browser review:** each new explanation scrolls into view. Previously, on a long form, a refusal could arrive with the explanation off-screen above a disabled Save button (screenshot 27 shows the fix).

## 6. SQL Server interleaving evidence

`Relational/CareCompletionInterleavingRelationalTests.cs` runs on real SQL Server. Each test uses its own disposable fixture database. The interceptor holds a save after service validation and before the insert, armed after seeding.

| Test | Covers | Result |
| --- | --- | --- |
| `G2_ANewPagesRefusedSave_DoesNotSettleAnEarlierSaveStillRunning("archive")` | The review's sequence: A paused; item archived from another connection; page reload (no in-memory state); linked B gets the real 400 `fulfillsCareRecordId`; status `archived`, no completion; no unlinked write (none exists in the flow); A released | 1 active record (A's), the only link to the item, final `archived` with A's record shown |
| `G2_…("clear-due-date")` | Same, with the due date cleared | 1 record; final **`no-due-date`** with A's record |
| `DueDateRemovedWhileASaveIsPaused…` | G4 | Now asserts the final state is `no-due-date`, the due date null and the late record shown |
| `R2_TargetArchivedWhileAValidatedSaveIsPaused…` | Archived target, late completion | Final `archived`, late record shown |
| `ALinkedRetryWhileTheOriginalIsPaused…` | Earlier A running, linked B lands, A refused 400 | One completing record |
| `TwoTabsWithDifferentDetails…` | Two tabs, different text | Second refused; first stands |
| `SameTextWithDifferentDocuments…` | Two tabs, identical text, different documents | Status carries only the winner's media id |
| `OriginalSaveFinishingAfterALostResponse…`, `ASaveStillRunningBeyondFiveSeconds…`, `ArchivingTheCompletingRecord…` | Late landing, real 6-second wait, revival | Unchanged and passing |

- **Result:** 10 interleaving tests (8 methods plus the 2-case G2 theory) and 3 upcoming relational tests: **13/13 passed, 0 skipped.**
- **Failing first:** before the G4 fix, the due-date test, the G2 due-date case and the new in-memory G4 test failed with `Expected "no-due-date", Actual "completed"`.
- **What these tests do not claim:**
  - The existing Care Records model does not prevent every manually created duplicate history entry.
  - A save validated before the item changed can still be written; the status now reports it truthfully.
  - The release guarantee is narrower: the Log as done recovery workflow never makes an unsafe second write and never falsely claims a write is resolved.

## 7. Regression and full-suite results

| Check | Result |
| --- | --- |
| New lifecycle suite (`RecordsManager.saveLifecycle.test.tsx`, real care service; initial POST and upload held open; Cancel, Close, Escape and Edit B tried; late success, late drop with reconciliation, refusal; unmount followed by B's `NEW UNSAVED DRAFT`) | **6/6** (5 failed before the fix) |
| Log as done (36), document recovery (8), recovery helper (13), care service/contracts (72), document service, Dashboard, context-create, care identity, list | All passed |
| Owner suites with **all six release flags true** (context-create, Dashboard, Log as done, lifecycle, document recovery, Share Center) | **137/137**. The `canUseApi` mock gap in `ContextualCreateActions.test.tsx` is fixed. |
| **Full web suite** | 388 files passed, 1 skipped; **4,626 passed, 7 skipped, 0 failed** |
| Focused care API (service, HTTP, relational, identity) | **91/91** |
| **Full API suite** (idle LocalDB, nothing else creating databases) | **3,033 passed, 0 failed, 0 skipped**, one uninterrupted run (22 m 32 s); includes every relational test |
| **API-connected browser run** (real web and API, disposable DB, failure injection in the browser only) | **23/23 checks across 8 scenarios** (below) |
| Typecheck (`npm run typecheck`: app and functions, unfiltered) | Passed |
| Lint | Passed |
| Production build (`--smart-tags=true --tag-orders=true --ordering=true on`) | Passed. 160 pages; release-flag, social-flag and SEO checks passed |

Browser scenarios (`e2e-care-recovery.mjs`, results JSON, screenshots 21–27):

- **A–D:** as before.
- **E (refused, other tab):** no unlinked shortcut; one browser POST.
- **F (G1):** the real POST is held unanswered. Escape, Cancel, Close and a dispatched Edit B all leave A's editor in place. The request is then released; A settles once; B's `NEW UNSAVED DRAFT` is untouched.
- **G (G2):** page 1's request is aborted and the page closed; page 2 opens; the item is deleted; page 2's linked save is refused by the server with no unlinked shortcut and the earlier-save note; page 1's replay is refused too; 0 records.
- **H:** the late original lands. The API then **refuses** to remove a completed item's due date (`400`), so the G4 state can only come from the server-side race, which the SQL tests cover. The editor confirms once.

Safety measures for the browser run:

- a random JWT signing key, so no stored secret was read;
- R2 credentials blanked; email, DevAuth and MarketingDemo off;
- a disposable `MyPetLinkTest_e2e…` database, migrated with the root `migration.sql`;
- afterwards the database was dropped, the key deleted, and `.claude/launch.json` restored byte-identical (`cb74ac9a…`).

This was done **before** the full API run, and LocalDB was confirmed to have no user sessions first.

## 8. Contract and precedence changes

- **Precedence** (API, local data, contract): archived → pet-archived → **no-due-date** → completed → pending.
- `completion` may accompany `archived`, `pet-archived` and `no-due-date`. It must always be active, on the same pet, and fulfil the target.
- `completed` now also requires a dated target.
- **Summary:** each pet's known rows (from its own scope and the all-pets scope) must fit its overdue, due-soon and later counts. All known rows together must fit the all-pets counts. This applies to truncated summaries too, as bounds.
- **Records:** `documents` is required. Ids must be present and unique.
- **API compatibility:** the response shape is unchanged. An older web build rejects `no-due-date` with a completion as malformed and shows its error state, never a false completion.

## 9. Remaining limitations

- **The hold is per page.** A reload or navigation loses an unconfirmed save. The copy says so, and reopening reads the status fresh.
- **No request identity or idempotency key.** "Care is already logged with these details." describes the stored record, not which request wrote it.
- **A save validated before the item changed can still land.** It is reported truthfully. Preventing it needs a version precondition (Phase 2).
- **A due date moved to another date** still reads as pending.
- **Owners can still add a separate record manually.** That is the ordinary feature; the recovery flow never presents it as a recovery.
- **Not exercised in the browser:** real private-storage uploads (R2 was disabled). Attachment identity is covered by the real-service component tests.
- **Not yet measured:** Azure SQL latency and locking for the SERIALIZABLE reads.
- **History browsing** stays limited to the first 100 records (unchanged).

## 10. Changed files, Git status and release dependencies

This revision:

- **API:**
  - `Services/CareRecordService.cs` (precedence);
  - `DTOs/MemoryCareDtos.cs` (doc).
- **API tests:**
  - `CareRecordUpcomingTests.cs` (+1, G4);
  - `Relational/CareCompletionInterleavingRelationalTests.cs` (G2 theory ×2; G4 final-state assertion).
- **Web:**
  - `components/portal/RecordsManager.tsx` (lifecycle, guards, shortcut removed, page-scoped copy, panel scroll);
  - `lib/careSaveRecovery.ts` (attempt type);
  - `lib/careContracts.ts` (G3/G4);
  - `services/recordService.ts` (local precedence).
- **Web tests:**
  - `RecordsManager.saveLifecycle.test.tsx` (new);
  - `RecordsManager.logAsDone.test.tsx`;
  - `RecordsManager.documentRecovery.test.tsx`;
  - `careSaveRecovery.test.ts`;
  - `recordService.upcoming.test.ts`;
  - `ContextualCreateActions.test.tsx` (Cancel disabled while saving; `canUseApi` mock).
- **Docs:** `docs/api/api-contract-v1-draft.md`, `apps/web/docs/OWNER_PORTAL_FLOW.md` §6, this report.
- **Artifacts:** `e2e-care-recovery.mjs`, `e2e-care-recovery-results.json`, screenshots 25 (replaced), 26 and 27.

**Git status:**

- Nothing staged, committed or pushed.
- Unrelated uncommitted work was not touched: Consignment, Merchant, Marketing, Smart Tag, TagOrder, Program/launchSettings/appsettings and root scripts.
- `.claude/launch.json` is byte-identical to its state before this work.
- No LocalDB restart and no pre-existing database removed. The two databases created here (`MyPetLinkTest_e2e…`) were dropped by exact name.

**Release dependencies:**

1. API before web, or both together. The web needs `/upcoming/summary` and `/{id}/completion`.
2. No migration, `migration.sql` change, App Setting or flag.
3. Assemble a scoped release manifest from the dirty tree. Do not deploy it wholesale.
4. **Release-candidate smoke** with real auth:
   - save while the network is throttled, and try to leave;
   - an earlier request plus a reload and a current refusal;
   - same text with different files, using real uploads;
   - a changed target;
   - the four widths.
5. **Rollback:** web first; the API changes are additive reads plus stricter status precedence.

## 11. Earlier revisions (still in force unless superseded)

- **R1:** document-aware reconciliation by stored media-id sets. Unchanged.
- **R2:** no time-based unlock; locked unknown outcomes; server precedence. The precedence is extended by G4. **R2's "separate record after a definitive refusal" is removed by G2.**
- **R3:** contract validation, extended by G3.
- **R4:** truthful partial-summary copy. Unchanged.
- **F1–F6:**
  - completion read from records;
  - one uncertain-outcome classifier;
  - a SERIALIZABLE summary;
  - strict paging;
  - truthful empty states;
  - Moment ordering.

  All unchanged. Authorisation, Malaysia dates, the pet-first Dashboard, Share Center, Lost Mode, mobile navigation, care CRUD, Free/Premium and existing API routes are unchanged.
