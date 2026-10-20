# Phase 1 Dashboard — Final Independent Release Review

**Date:** 20 October 2026, Malaysia time  
**Repository:** `C:\Project\MyPetLink`  
**Baseline:** `main` at `808296d`, including the existing uncommitted work  
**Verdict:** **NO-GO for Production approval in the current revision.**

## 1. Executive verdict

The corrective work substantially improves the implementation. The Dashboard no longer assembles a supposedly complete collection from independent care pages. The SQL Server summary uses the right transaction boundary. Completion recovery reads an actual completing record, and the shared uncertainty classifier now handles real transport errors. The approved pet-first design remains intact.

**F1–F6 have not all been resolved correctly. Two P1 recovery defects remain:**

1. Matching care text can clear a draft and report success even when the draft's certificate is absent from the completing record. Documents are excluded from matching, and uploaded identities are not retained in the editor's save attempt.
2. An uncertain save can be converted into an unlinked, separate save while its original request is still executing. An independently controlled SQL Server interleaving produced **two active new logs**. The status endpoint then returned `completed` for an archived target because completion takes precedence over target availability.

The five-second interval does not establish that a write failed. A separate real-SQL probe did confirm that an unchanged target's unique fulfilment constraint rejects the late losing request and leaves one log. That limited protection does **not** justify the broader recovery guarantees or the separate-record escape while the original outcome remains unknown.

F3's summary consistency fix passes source and focused relational review. The original page/date validation failures in F4 are fixed, but meaningful response-invariant gaps remain. F5's principal wording fix and F6's cross-pet ordering fix pass. Two P2 issues are recorded below: residual contract validation and an inaccurate promise that View all exposes every record.

**Independent checks:** 213 web tests passed; the three principal UI suites passed another 89 executions with the six release feature values enabled; 78 API tests passed, including the three SQL Server relational tests. Lint passed. The standard web typecheck currently fails on malformed generated development declarations; a separate in-memory source check excluding those declarations had zero diagnostics. Full-suite and production-build claims remain author-reported, not independently rerun here.

### Review boundaries and preservation

Read the previous independent review, updated implementation report, original engagement review, current project instructions and relevant code/tests. Reviewed the latest four screenshots against the previously approved design. Executed actual-client error probes, recovery-function probes, contract probes and two controlled SQL Server service interleavings. No application source, dependency, migration, configuration, existing report or screenshot was edited. No commit, push, deployment, production data operation or database restart occurred.

SQL work used the existing fixture's uniquely generated throwaway databases on LocalDB. The probes compiled their interceptors in memory and called the actual compiled care service. They did not replace application code. One probe initialization failed before schema creation; its newly created empty database was identified by exact name and creation time and removed. Successful fixture databases were disposed normally. A final query found no review-created test databases remaining. Pre-existing databases were left alone.

All **71 baseline files** included in the preservation manifest retained their SHA-256 hashes; the working-tree status was unchanged before this report was added. The manifest covers tracked modifications, relevant untracked application/docs files, and the existing Phase 1 artifacts. **This report is the only new repository artifact.**

## 2. F1–F6 verification matrix

| Finding | Final result | Verified behavior and remaining limit |
| --- | --- | --- |
| **F1 — Completion confirmation** | **PARTIAL / FAIL release gate** | A pending item's disappearance is no longer evidence of completion. An active completing record and canonical text are required. Different text preserves the draft/link. Document differences are ignored and can cause false success and draft loss: R1. A late write can also cause an archived target to return `completed`: R2. |
| **F2 — Uncertain save recovery** | **Classifier PASS; recovery FAIL** | Actual client status 0, 408 and 5xx are uncertain; ordinary 400/403 refusals are distinct. Immediate pending and unavailable status reads stay locked. Five seconds is still used to unlock retry, and an uncertain changed target offers a separate save. SQL Server demonstrated the unsafe latter branch: R2. |
| **F3 — Summary consistency** | **PASS for SQL consistency; capacity/performance limitations remain** | Active-pet coverage, care coverage, grouped counts and candidate rows run in one SERIALIZABLE transaction inside the execution strategy. No client page stitching remains. Relational churn test passed. Above 1,000 rows, exact counts accompany an explicitly partial selection; no all-clear branch is rendered. |
| **F4 — Contract validation** | **Original reproducers fixed; PARTIAL overall** | Wrong/missing page metadata, invalid totals and invalid reference/horizon dates are rejected. Count-to-row consistency, all-scope membership and comprehensive completion validation are incomplete: R3. |
| **F5 — Empty states** | **PASS for the original defect** | “No pending care dates.” correctly includes completed history. No-records, future-only, failed, unavailable and partial states are distinct. Invalid horizon dates cannot generate a broken reassurance sentence. Partial-state navigation copy still overpromises: R4. |
| **F6 — Recent Moments ordering** | **PASS for Dashboard ordering** | Moment date descending, creation time descending, then stable ID ascending. API mapping retains creation time; new local Moments receive it. The selector is independent of pet loading order. Existing API pagination lacks a final ID tie-break, a limited boundary caveat described below. |

## 3. Verified code and test evidence

### Completion endpoint and normal Log as done flow

The new `GET /api/v1/care-records/{id}/completion` is covered by the controller's `[Authorize]` and uses the current user's subject. The outer query explicitly requires the target's current pet owner, an undeleted pet and an undeleted target. A foreign target and a soft-deleted target return 404. Tests exercise unauthorized HTTP access and foreign-owner reads.

[CareRecordService.cs](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/CareRecordService.cs:332) projects the target, pet archive state and first active incoming fulfiller in one relational statement. The incoming record must reference the target and have neither `DeletedAt` nor `ArchivedAt`. Target disappearance from the pending collection is no longer consulted. The new HTTP contract is additive; existing create/list/update/archive routes remain.

The opener checks the returned target's pet against the page's pet. A pending target prefills the ordinary form with Malaysia's date, Private audience and the fulfilment link. Provider, notes, documents and next due date are not copied from an earlier visit. Opening and cancelling do not write. A different completing record's text is shown as a conflict, with draft and link retained until an explicit choice.

Two qualifications prevent a blanket security/consistency assertion:

- The inner fulfiller query does **not** explicitly require `fulfiller.PetId == target.PetId` or repeat owner/deleted-pet predicates. Supported care writes validate same pet and owner, so no supported cross-owner write exploit was demonstrated. However, the endpoint itself does not guarantee that an inconsistent historical cross-pet link cannot expose another record. Add those predicates and an adversarial fixture assertion rather than relying exclusively on write-time integrity.
- Documents are loaded in another statement after the target/fulfiller projection. The report's “single statement” description applies to those entities and state, not to an atomic snapshot of the complete response with documents. R1 explains why document identity matters to recovery.

### Independently executed checks

| Check | Independent result | Scope |
| --- | --- | --- |
| Web focused suites | **12 files, 213 passed** | Upcoming service/contracts; Log as done; Dashboard; Dashboard helpers; request-outcome classifier; document saves; Share Center availability; care identity/date/status and existing manager behavior. |
| Principal UI suites with release values enabled | **3 files, 89 passed** | Dashboard, Log as done and Share Center availability; all six `NEXT_PUBLIC_*` release values from the existing configuration were true. These are repeated executions, not 89 additional unique tests. |
| Care API suites | **78 passed, 0 skipped** | Upcoming service/HTTP/relational classes plus existing care service and identity/fulfilment suites. Used existing compiled test/API assemblies newer than the reviewed sources; no rebuild. |
| SQL Server relational checks | **Included above: 3 passed** | Real SQL pending filtering before paging, summary under concurrent changes, and target/fulfiller SQL projection. Fixtures create/drop only their own GUID databases. |
| Lint | **Passed** | Existing web lint configuration, no fixes or cache writes requested. |
| Standard web typecheck | **Failed in generated development files** | `.next/dev/types/routes.d.ts:125` and `validator.ts:650`, TS1128. Duplicate/trailing generated fragments are present. These files were not edited. |
| Source check with broken generated development declarations omitted in memory | **0 diagnostics** | TypeScript compiler host only; no replacement files or emitted output. This does not turn the standard typecheck into a pass. |
| Functions typecheck | **Passed** | Existing functions configuration, no emit/incremental output. |
| Full API/web suites and production build | **Not independently rerun** | Author reports 3,020 API tests, 4,554 web tests and a successful production build. No raw final-run log accompanies this report in the Phase 1 artifact directory. |
| Browser/visual checks | **20 existing screenshots reviewed across the two reviews; latest 17–20 rechecked here** | Prepared local-data screenshots and component behavior; no fresh authenticated API-connected browser failure injection. |

Web tests used the existing runner with the runner config loader, cache disabled and one worker. API tests used the existing test assembly with results directed outside the repository. Additional TypeScript probes bundled current modules in memory or executed the current recovery function bodies with captured state callbacks. No persistent tests were added.

### What the new tests prove, and what they miss

The component tests now use the real `ApiClientError` class and appropriate normalized error shapes. To verify normalization independently, the actual API client was bundled and supplied controlled failed fetch/HTTP responses. A dropped fetch became `ApiClientError(0, service_unavailable)` and was classified uncertain. HTTP 408/500/503 were uncertain; 400/403 were refusals. This directly closes the original F2 error-shape mismatch.

The tests correctly reject the old “absent means completed” assumption and cover matching versus different text, immediate pending, status-read failure, wrong pet, ordinary validation and explicit separate-record choice after a refused save. Document-service tests now retain staged uploads on uncertain writes, avoiding destructive cleanup of potentially attached media.

However, the six-second component test changes `Date.now`, supplies another mocked pending status and asserts that Save reopens. It does not leave a real POST executing and race a retry against it. The “still running” test changes the mocked status to completed; it does not execute concurrent writes. No completion test stages a new file and then reconciles against identical text with different attached documents. Those gaps allowed R1/R2 to pass.

The relational churn test is real, not a mock. It seeds 60 dated records and 80 history records, uses a second connection to archive/restore/reschedule selected rows, and asserts that more than five reads and writes occurred. It can detect count-versus-row membership disagreement via `summary.Complete`. It cannot detect **every** inconsistent state: a same-total reschedule can change due/overdue counts while preserving all the asserted cardinality/range relationships. It also does not deterministically interleave pet archiving, insertion or completion. The author's claimed READ COMMITTED negative control was not independently repeated; no application isolation level was changed here. Confidence in F3 comes primarily from the actual transaction boundary and SQL semantics, supported by this test.

## 4. Remaining P1/P2 findings

### R1 — [P1] Matching text discards an unsaved document draft

**Evidence:** [RecordsManager.tsx](C:/Project/MyPetLink/apps/web/src/components/portal/RecordsManager.tsx:1306), its success branch at line 676, and [recordService.ts](C:/Project/MyPetLink/apps/web/src/services/recordService.ts:665).

`completionMatchesDraft` compares type, title, care name, date, next due date, provider, notes and audience. It explicitly ignores documents. `prepareCareDocuments` substitutes uploaded media IDs internally, but those IDs are not retained in `SaveAttempt`; the editor still has its original draft documents/source files.

**Reproducer:** two tabs submit the same care text for the same due item. Tab A's record wins without a certificate; Tab B's draft contains a new certificate and its response is uncertain or its claim is refused. The completion read returns A's active record with identical text and an empty document collection. Current matching returns true, resets the entire form, closes it and reports “logged as done with the details you entered.” B's certificate is not attached to that record and its recoverable draft is gone.

An in-memory execution of the actual matcher and recovery function reproduced exactly those callbacks: `match: true`, empty form, closed dialog and success, with one staged draft document versus zero canonical documents. The document-service tests' “do not delete uncertain uploads” fix preserves storage, but does not preserve the owner's ability to recover an unlinked certificate after this false confirmation.

**Narrow correction:** retain per-attempt prepared document identities and verify the canonical attachment set before clearing the draft. If attachment equivalence cannot be established, retain the draft and describe the result as unresolved or different. Do not use filenames/sizes alone as proof of file identity. Add a component/service integration case for identical text with missing/different documents and a dropped response with the correct linked documents. No Phase 2 command or schema change is required to stop falsely clearing the form.

Identical text without documents remains unable to identify which request created the record. A message that those exact values are already logged can be truthful, but it is not a durable request receipt or exactly-once guarantee.

### R2 — [P1] Unknown writes can escape the fulfilment guard and save twice

**Evidence:** [RecordsManager.tsx](C:/Project/MyPetLink/apps/web/src/components/portal/RecordsManager.tsx:720), `keepAsSeparateRecord` at line 730, and the changed-target panel at line 1374; [CareRecordService.cs](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/CareRecordService.cs:424), archive at line 587 and state precedence at line 363.

The code keeps unknown outcomes locked initially, but:

- A pending read after five seconds enables another save. Elapsed time is not evidence that the first request stopped.
- An **uncertain** archived/undated target offers Keep mine as a separate record. That action immediately drops the fulfilment link and forgets the outstanding attempt. The one-claim index cannot arbitrate a second request whose link is null.
- The server validates target availability before saving, without a transaction protecting that validation against archive/reschedule. Thus a previously validated original request can finish after the target changed.

**Independent real-SQL reproducer:** a save interceptor paused the actual care service immediately before its original `SaveChanges`, after validation. Another context archived its target. The status read returned `archived`. The separate-record action's resulting payload, with `FulfillsCareRecordId = null`, was saved through the actual service. The original save was then released.

Observed result:

```text
targetStatusDuringPause=archived
activeNewLogs=2
finalStatus=completed
targetArchived=True
```

Both new records were active. The late original still linked to the archived target. The status endpoint preferred that incoming record over `target.ArchivedAt` and returned `completed`. This also disproves an unqualified claim that an archived target cannot be confirmed as completed.

**Control with the target unchanged:** the original remained paused for **six seconds**; a status read still returned pending; a linked retry saved; releasing the original produced the existing fulfilment `ApiException`. The database contained **one** new active log. Therefore the existing unique non-null-link index does protect two linked attempts while the claim remains intact. It is not an operation idempotency key: archiving/unlinking a claimant releases it, and an ordinary unlinked save bypasses it.

The server's target-edit race predates these fixes. The new recovery workflow nevertheless relies on that existing model and actively offers the unsafe escape. This finding does not require a general Care Records concurrency redesign to prevent the new UI from making an unsupported retry safe claim.

**Narrow correction within Phase 1:** keep an unknown outcome explicitly unknown; remove timer-only permission to treat it as not saved, and do not offer an unlinked separate save while an earlier write may still commit. Preserve the draft and offer status/history inspection. Allow separate saving after a confirmed rejection/conflict where the earlier request is known not to have written, with appropriate confirmation of the current state. If automatic retry is retained instead, it needs a proven invariant covering archive/unlink and request identity, not a longer delay. Treat archived/unavailable target state explicitly in the completion response/recovery rather than letting incoming completion silently override it. Add the controlled SQL interleaving and an API-connected UI test. Do not introduce the Phase 2 completion command or Undo as part of this correction.

### R3 — [P2] Response validation still accepts internally contradictory care data

**Evidence:** [careContracts.ts](C:/Project/MyPetLink/apps/web/src/lib/careContracts.ts:111), summary parser at line 145 and completion parser at line 209.

The original wrong page/pageSize, missing total and invalid date reproducers are fixed. The new parser checks useful arithmetic, but stops short of validating the semantics that drive the reassurance UI:

- A complete one-row summary with an overdue dated item, `pendingCount = 1`, `dueWithinHorizonCount = 0` and `overdueCount = 0` is accepted when repeated consistently in the all/pet scopes. The UI's complete/zero-due branch then qualifies for “Nothing due through 19 Nov.” despite that overdue row.
- The all-pets scope's items need not belong to any listed pet scope. Duplicate item identities and mismatched copies of an item across scopes are not rejected.
- The completion record shape checks only identity, type and title before casting. An archived completion with an invalid event date can pass. `getCareCompletionStatus(requestedId)` does not check that the returned target ID equals `requestedId`.

The first and malformed-completion examples were independently accepted by the actual parsers in memory. No correctly executing current summary transaction was shown to produce those malformed counts: this is a defensive contract gap, not evidence that F3 still mixes SQL states.

**Narrow correction:** validate row status/date against the response reference day/horizon, counts against the visible rows, all-scope membership/identity consistency, and completion dates/active state/requested identity before mapping. For a truncated summary, validate bounds and known rows without pretending unseen rows can be recomputed. Preserve the error state when validation fails. Add these concrete malformed-response cases.

### R4 — [P2] The large-summary warning promises a complete history the destination cannot show

**Evidence:** [DashboardCareSection.tsx](C:/Project/MyPetLink/apps/web/src/components/portal/dashboard/DashboardCareSection.tsx:205) says “View all to see every record.” The destination still uses [recordService.ts](C:/Project/MyPetLink/apps/web/src/services/recordService.ts:80), which reads only care history page 1, size 100.

For the >1,000-pending case that triggers the warning, an old due item can be absent both from the selected summary rows and from that first historical page. The warning correctly admits the summary may omit urgent dates, but gives a recovery promise the current list cannot fulfill.

**Narrow correction:** remove the “every record” promise and describe the available history honestly; separately track proper history navigation. Do not silently expand Phase 1 into an unrequested planner. If complete browsing is a release requirement, implement and validate actual pagination before promising it.

## 5. Save-reconciliation safety verdict

**Not safe to approve as implemented.** The old absence-based false success and transport-classification mistakes are fixed, but R1/R2 remain release blockers.

| Situation | Current result | Assessment |
| --- | --- | --- |
| Normal successful create response | Adds returned record, closes form and reports success | Correct ordinary path. |
| Dropped response after commit; canonical text matches | Reports saved | Correct only if the relevant draft content, including documents, is accounted for. R1 violates this. |
| Different canonical completion | Preserves draft/link and locks Save; separate-record choice offered | Correct for a confirmed refused request. An unknown original must not be assumed settled solely from a snapshot when links can be cleared. |
| Pending immediately after uncertain failure | Locked, “may still be processing”, Check again | Correct. |
| Pending after five seconds | Retry enabled, “can only be logged as done once” | Observation remains uncertain. Safe only under the narrower unchanged-claim invariant demonstrated by the control; copy is too absolute. |
| Status endpoint unavailable | Unknown result, draft retained, Save locked | Safe fallback. |
| Definite ordinary validation/permission refusal | Displays error, leaves draft/link, allows correction | Correct distinction from unknown writes. |
| Archive/removed date during unknown save | Warning and locked linked save, but unlinked separate-record action available | Unsafe escape: R2. |
| Deleted target returns 404 during reconciliation | Generic status-unavailable; draft retained | No false success, but not a dedicated target-unavailable explanation. A 404 cannot prove the original did not create a record. |
| Due date moved to another non-null date | Still `pending`; no target-version comparison | Not detected as a changed schedule. Do not claim reschedule conflict detection; the existing write model has no version precondition. |
| Pet archived while a previously validated write is in flight | Separate action withheld for `pet-archived`, but late active completion can take precedence in state selection | No guarantee the original write is prevented; requires explicit changed-target treatment. |

A request timeout/abort is treated as unknown by the classifier. The reviewed client does not impose a general five-second POST processing deadline, and client cancellation would not itself establish that a server transaction rolled back. No durable care-create idempotency key exists. The implementation report acknowledges that limitation, but its retry-safe wording and UI still exceed what is guaranteed.

**Not independently verified:** browser-to-running-API dropped-response injection, real proxy timeout behavior, and two browser tabs using real authentication/storage. The SQL service interleavings and actual-client probes establish the concrete defects; they are not a substitute for that end-to-end release smoke. Its absence remains an outstanding release check, especially for this recovery path.

## 6. Serializable summary consistency verdict

**The F3 design is correct for the reviewed SQL Server path.** [CareRecordService.cs](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/CareRecordService.cs:187) wraps BeginTransaction, all four database reads and commit inside `CreateExecutionStrategy().ExecuteAsync`. Retryable failure reruns that complete read unit, with a new transaction; no externally visible write is retried by this method. The InMemory branch omits the relational transaction and cannot independently prove isolation.

The four reads are active owned pet IDs, distinct active pets with care, grouped pending counts, and up to 1,000 projected pending rows. Filters require current owner, undeleted/unarchived Active pet, active care and a due date. The anti-join excludes targets with a nondeleted, unarchived incoming fulfiller over the full table. Counts are grouped before truncation. Owner-wide totals sum those same groups; pet scopes include zero-care active pets.

Malaysia's day is captured once before the retry delegate, with horizon +30 inclusive. Overdue means before today. Retries crossing midnight retain that request's internally coherent reference day; a later request gets a new day. Rows order by due date, creation time and ID. The selector deliberately shows the most recently missed item, nearest upcoming items, then older missed items. This is the existing product rule, not a clinical urgency assessment.

SQL Server SERIALIZABLE prevents the relevant read sets from changing in ways that would produce nonrepeatable/phantom reads during the transaction. This is a serializable read, not an MVCC snapshot or a claim that the screen remains current afterward. EF's documented execution-strategy pattern wraps user transactions as a retryable unit, which this method follows. [Microsoft isolation documentation](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql), [EF connection resiliency](https://learn.microsoft.com/en-us/ef/core/miscellaneous/connection-resiliency).

If retries are exhausted, no summary DTO is returned. Existing middleware unwraps known retry-limit failures for transient classification and returns an error envelope (503 for classified transient failures, otherwise the existing 500 path). The Dashboard catches the failed read and shows its care error state. Forced retry exhaustion/deadlock injection was not independently exercised; the successful relational test does exercise the retry-enabled provider configuration.

### More than 1,000 pending items

Counts remain exact. `complete` is false when only 1,000 of a larger pending set were read. Candidate selection happens after taking the **earliest** 1,000 rows. Consequently the newest overdue item, nearest future date or all candidates for another pet may fall outside the candidate set. Returned rows are still genuinely pending and authorized within that serializable read, but not necessarily the intended best three for each scope.

The UI labels the result partial, suppresses the zero-due reassurance and shows exact remaining counts. That is safe against a false complete collection/all-clear. A pet with zero pending rows can still receive the owner-wide partial warning, which is conservative but awkward. R4 covers the inaccurate complete-history remedy. The current implementation should not be described as guaranteeing the best displayed rows beyond the cap.

## 7. SQL Server performance and locking assessment

The summary reduces network calls to one care request, but still executes four SELECT statements in one transaction. The 1,000-row cap bounds row projection/materialization, **not** the work required to establish active care coverage and exact counts over an owner's complete history.

Existing model indexes include Pets owner/lifecycle, CareRecords `(PetId, DueDate)`, `(PetId, RecordDate)` and the unique filtered non-null fulfilment-link index. They provide plausible access paths; that is not a measured execution-plan claim. The anti-join's visibility conditions remain query predicates. The unique index is not filtered to active records; ordinary archive code clears links, which is why it does not provide durable request deduplication.

Serializable reads can hold shared/range locks until commit and make writers wait; they can also participate in deadlocks. Access paths and row counts determine the scope of locking. Azure SQL defaults do not turn an explicitly serializable transaction into a nonblocking snapshot. [Microsoft locking guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide).

The read transaction is short in structure, with no network/media calls inside it. A LocalDB churn test passed, but **no independent Azure SQL execution plan, lock trace, logical-read measurement or representative percentile latency measurement was collected**. Do not characterize the change as production load-tested. Test representative owners with long undated history, many pending dates and multiple pets under simultaneous care changes; record latency, logical reads, blocking duration, deadlocks/retries and API timeouts. Inspect the generated plans there before proposing any index or changing isolation. This review recommends **no new index or migration without that evidence**.

## 8. UX/UI regression assessment

**The approved design is preserved. No wholesale redesign is requested.**

- Screenshot **17** retains the compact care rows, distinct Log as done actions, exact remaining-date link and three mobile Moment previews. Linky's equal-date Moment appears first, consistent with the creation-time tie fix. A screenshot alone does not prove timestamps; source/tests supply that evidence.
- Screenshot **18** retains prominent pet cards, Share/View controls, pet scope chips and mobile navigation. “No pending care dates.” fixes the prior wording defect.
- Screenshot **19** shows the 320px future-only view with a readable summary-derived horizon and wrapping pet details. The fixed navigation overlaps content at that scroll position as expected; this screenshot does not demonstrate a new unreachable-action regression. Earlier bottom-clearance evidence remains applicable because the layout was preserved.
- Screenshot **20** preserves the desktop care-history layout and a normal confirmed-save message. It does not demonstrate uncertain recovery, conflict or staged-document behavior.

Source/component tests preserve Lost Mode before the greeting, memorial handling, shared Share Center usage, per-section care/Moments failures and route helpers. New care copy uses normal owner language. The uncertainty/conflict panels have not been shown in the supplied screenshots and still need real-API interaction checks after the blockers are corrected.

Recent Moments remain honest recent owner content, not a weekly recap or a complete-period count. New local Moments receive `createdAt`; older local rows without it fall back deterministically to ID after known creation times. The API's owner list already sorts MomentDate then CreatedAt; the Dashboard adds ID for the loaded set. At a first-100 page boundary with fully identical date/creation timestamps, the API has no final ID ordering and may choose a different subset. That existing boundary limitation does not invalidate the cross-pet tie fix in the returned set, but prevents claiming a fully deterministic globally newest subset for arbitrary tied histories.

## 9. Production deployment requirements

**Do not deploy this revision until R1/R2 are corrected and verified.** Then:

1. **Prepare a scoped release.** The working tree contains unrelated marketing seeding changes in API `Program.cs`, development settings/launch entries, root scripts, Community test work, marketing documents and extensive pre-existing Consignment/Merchant/Smart Tag artifacts. Do not deploy the current dirty-tree binaries wholesale. Review a precise file/hunk manifest or isolated release checkout containing approved Dashboard changes and their dependencies. Preserve all unrelated work. No release was assembled or committed by this review.
2. **Deploy API first.** The new web build requires `/care-records/upcoming/summary` and `/{id}/completion`. Existing API routes remain additive/backward compatible. Old web plus new API can coexist. New web plus old API should fail visibly in care/opening states; it is not a supported healthy deployment pairing.
3. **No migration/configuration rollout is required for Phase 1.** No reviewed Dashboard change adds an EF migration, model/index change, root `migration.sql` change, dependency or infrastructure setting. Preserve the existing API URL, authentication, CORS and feature configuration; do not accidentally include marketing-only settings as a Dashboard dependency.
4. **Use a clean build environment.** Run the ordinary typecheck, lint and production build for the exact release candidate with the actual release flags. The malformed `.next/dev` declarations seen here must not be treated as a green standard check. Regenerate generated outputs through the supported clean build process outside this read-only review; do not hand-edit generated declarations.
5. **Run real API-connected release smoke with isolated test owners.** Verify 100+ historical rows, old pending items, multi-pet scopes, owner isolation, normal save, certificate attachment, a dropped response after commit, a POST paused beyond five seconds, changed details across two tabs, archive/unlink/reschedule during the outstanding write, failed reconciliation and confirmed validation rejection. Verify the retained draft and exact linked documents as well as the message. Check 320/390/768/1280 layouts and Share Center/Lost Mode/mobile navigation.
6. **Measure SQL behavior on the target database tier.** Use representative test data and simultaneous reads/writes; inspect latency/locking plans and error handling on retry exhaustion. Do not tune indexes by guesswork.
7. **Rollback web first if necessary.** Revert to the previously approved web artifact while leaving additive API reads in place. If API rollback is also necessary, remove the dependent new web first and use the known compatible pair. No schema rollback is needed. Preserve records already created; distinguish software rollback from deleting valid owner history.

The supplied local-data browser smoke is useful visual evidence. It cannot substitute for the uncertain-write release smoke because those local writes complete synchronously and do not exercise HTTP/SQL/R2 attachment races.

## 10. Remaining risks and separate workstreams

- Dashboard reads are point-in-time. An open screen does not refresh on focus, another tab's change or Malaysia midnight. No live reminder guarantee should be implied.
- Care history navigation remains limited to the first 100 records. Exact pending counts do not make that destination a complete planner.
- Care creates have no durable operation identity, and care rows have no version precondition for target edits. Existing archive/update behavior can release fulfilment claims. Keep the recovery UI within those actual guarantees.
- The completion projection needs explicit same-pet/owner defense on its inner fulfiller read; no supported cross-owner exploit was established in this review. Do not describe the missing predicate as already tested protection.
- Retry exhaustion, target-tier performance and browser/API failure injection remain untested here. Successful unit/relational counts do not settle those operational checks.
- The known `SocialQueryPlanRelationalTests.TheFeed_IsOneQueryThatJoinsTheFollowGraphInSql` intermittency remains a separate optimizer-sensitive assertion. The prior independent report records historical fail/pass evidence before this Dashboard work. The author reports it passed in the final full suite; it was not modified or rerun here. It is not the reason for this NO-GO, nor a reason to weaken Community privacy predicates.
- GA4 and private-media architecture remain separate workstreams. No analytics or media architecture change was requested, performed or included in this review's approval scope.
- README/historical planning descriptions remain stale in places; current code and canonical product/access documents governed this review. Premium, subscription checkout, GPS, recurrence, Phase 2 completion/Undo and broad care-model redesign remain outside this task.

## 11. Final recommendation

**NO-GO. F1/F2 are materially improved but remain incomplete and unsafe in specific verified recovery paths. F3 passes its consistency gate; F4 needs the bounded defensive corrections in R3; F5's original wording and F6's Dashboard ordering are resolved.**

Before approving Production, fix document-aware confirmation and unknown-write recovery without adding the deferred Phase 2 command; close the identified contract/copy gaps; then run the clean release checks and real API-connected smoke above. The existing visual design can remain.

**Have F1–F6 been resolved correctly, and is Phase 1 safe to approve for Production deployment? No. Two independently reproduced P1 recovery defects still prevent approval.**
