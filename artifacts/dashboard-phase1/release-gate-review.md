# Phase 1 Dashboard — Independent Release Gate Verification

**Date:** 20 October 2026, Malaysia time  
**Repository:** `C:\Project\MyPetLink`, `main` at `808296d`, with existing uncommitted work  
**Verdict:** **NO-GO for approving the current revision for Production Release Preparation.**

## 1. Executive verdict

**The current revision is not ready for Production Release Preparation approval.** The fixes address the original document mismatch and timer-based retry failures, but the pending-request lifecycle still permits an older save to erase a newer draft. There are also bounded gaps in the refused-write recovery and response validation described below.

The assessment is focused on R1–R4. The approved Dashboard design is preserved; no redesign, Phase 2 completion command, Undo, broad care concurrency redesign or new database schema is requested.

Passing tests do not cover the reproduced stale-POST sequence. The existing stale-result test starts after the POST has already failed and a recovery attempt exists. The actual gap occurs earlier, while the initial POST is still awaiting its response.

The independent clean full API run passed **3,030/3,030**, including all 11 relevant SQL tests. The independent full web run passed **4,610**, with seven skipped. Both normal typechecks and lint passed. These checks validate the existing assertions; they do not cover the new reproduced cases. Two P1 recovery defects, G1/G2, prevent approval; G3/G4 are bounded P2 corrections.

## 2. R1–R4 verification matrix

| Gate | Result | Independent assessment |
| --- | --- | --- |
| **R1 — Document-aware reconciliation** | **Core attachment fix passes; lifecycle gate fails** | The observer reports prepared stored media IDs before the POST. Matching compares identity sets, not names. Missing/different/extra IDs retain the draft; upload failure before sending does not become an uncertain care write. A late result from the initial POST can still erase a newer editor: G1. |
| **R2 — Unknown-save safety** | **Substantially improved; not fully resolved** | No timer remains. Unknown recovery locks Save and the fields, and Check again only reads. Closing after an unknown result preserves a held draft. Closing before the initial response does not: G1. A refusal describes one request, not every earlier request for the item: G2. |
| **R3 — Response validation** | **Original examples fixed; incomplete** | Wrong target, malformed dates, archived fulfiller, duplicate item/document IDs, mismatched copies and basic count contradictions are now rejected. Cross-scope category bounds and a missing canonical document collection can still pass: G3. Removed-date precedence also differs from the report's stated changed-target behavior: G4. |
| **R4 — Care navigation copy** | **PASS** | The complete-history promise is gone. The partial warning now says some dates may be missing from this list. It does not promise that View all exposes every historical record. |

## 3. Verified implementation findings

### Prepared IDs and the actual POST lifecycle

[recordService.ts](C:/Project/MyPetLink/apps/web/src/services/recordService.ts:377) uploads/stages files before invoking `onSending`. The callback receives every prepared document ID and the IDs uploaded by this attempt. Those same prepared documents feed `buildBackendRecordPayload`; sorting affects order, not set membership. A failed upload exits before the callback and before the care POST. The observer is immediately before request construction, so it is a conservative sending boundary, not a server receipt.

The editor captures those IDs and whether this attempt uploaded files. [careSaveRecovery.ts](C:/Project/MyPetLink/apps/web/src/lib/careSaveRecovery.ts:51) checks text first, then exact document identity sets. Repeated IDs are not treated as a valid set match. Reordering the same identities is accepted; a missing, extra or different identity is not. Files are retained on uncertain writes rather than deleted from a potentially saved record.

The new document-recovery component tests go through the actual care service and mapper, with transport/media-store stand-ins. They cover the original missing-certificate defect, another file with the same name, matching IDs, reordered IDs, missing one of several files, failed reconciliation and later confirmation. The service tests check observer ordering and the failure-before-POST case. This is materially stronger than testing the matcher alone.

Without new uploads, “Care is already logged with these details.” describes an observed canonical record without asserting request identity. With a matching set of newly uploaded IDs, saying the details and attachments are logged is also supported. Neither wording proves which HTTP request committed or provides durable exactly-once delivery. That architectural limitation does not, by itself, block Phase 1.

### Authorization and canonical reads

The completion controller remains authenticated and uses the current JWT subject. The outer query requires an owned, undeleted target on an undeleted pet. Its fulfiller subquery now explicitly requires the same pet, same owner, undeleted pet, active record and correct incoming fulfilment link. Adversarial cross-pet/cross-owner fulfiller rows are rejected in the service tests. Foreign targets return 404; client-supplied owner identity is not accepted.

[CareRecordService.cs](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/CareRecordService.cs:339) reads target, pet state, completion and linked document metadata inside one SERIALIZABLE transaction wrapped by the execution strategy. Archived target and archived pet take precedence over a late completion. A late record remains available for inspection while the target is reported unavailable. Archived/deleted fulfilers are excluded.

Document metadata is selected through links belonging to the authorized care-record IDs, and supported writes validate media owner, pet, ready state and category. This establishes the normal supported ownership path. `LoadRecordDocumentsAsync` does not independently repeat media owner/pet predicates for arbitrary corrupted media-link rows; this review does not claim those inconsistent rows were tested or proven safe. Adding those predicates is sensible defense in depth, not a demonstrated new cross-owner exploit here.

### Unknown and refused writes

The real client normalizes dropped transport to status 0. The classifier keeps status 0, 408, 5xx, abort/read errors and raw errors uncertain; an unconfigured connection and ordinary parsed 4xx refusals are distinguished. A malformed/unreadable error envelope remains conservative rather than being assumed a definite refusal.

For the current registered unknown attempt, no elapsed time unlocks Save, the fieldset stays disabled and no unlinked action is shown. A pending result is not treated as failure. Check again calls only `getCareCompletionStatus`; it does not create or upload. Closing after this state is reached keeps a draft/attempt in page memory. Reviewing it restores the locked draft and reads again.

The limitation is that the attempt is registered only in `settleFailedCompletion`, after the initial create has thrown. `onSending` currently updates a local variable, not the live held-attempt reference. That distinction causes G1.

## 4. Remaining P1/P2 findings and narrow corrections

### G1 — [P1] A late initial POST result can erase a newer draft

**References:** [RecordsManager.tsx](C:/Project/MyPetLink/apps/web/src/components/portal/RecordsManager.tsx:488), `onSending` at line 635, the ordinary success/reset at line 658, and recovery-attempt creation at line 720; [FormDialog.tsx](C:/Project/MyPetLink/apps/web/src/components/ui/FormDialog.tsx:70).

The form remains dismissible while the POST is pending. Cancel, Close and Escape can call `closeEditor`. At that point `saveAttemptRef.current` is still null, so `holdUnresolvedSave` keeps nothing. The owner can open an existing history record for editing and enter a different draft. The old request's catch handler can then register itself as the current attempt; its matching status response passes the object-identity guard and resets/closes the newer editor. The normal successful POST path also has no editor-generation check before its reset.

**Independent rendered-component reproducer:** actual `RecordsManager`, care service and API client, bundled in memory under JSDOM; only fetch responses were controlled, with no real writes:

1. Open Log as done and submit draft A. Keep its actual client fetch pending.
2. Press Cancel before any error response. No held-save banner appears.
3. Press Edit on an existing history record and type `NEW UNSAVED DRAFT` in Notes. The history and completion reads both include the same valid target; no missing-history fixture is required.
4. Make A's response fail as a dropped connection, then return A's correctly matching canonical completion from the status read.

Observed:

```text
before late failure: NEW UNSAVED DRAFT
dialogPresent=false
newDraftPresent=false
success=true
heldBanner=false
```

This is an in-page draft-loss defect, not the accepted full-reload limitation. The current stale-check test covers a status request after an already registered failure; it does not cover the initial POST, upload or its completion handler.

**Narrow fix:** track a save/editor generation from before the first asynchronous upload/POST, register its immutable draft and prepared IDs at the sending boundary, and guard every success/error/recovery state change against that generation. Preserve a sent attempt on close, or prevent dismissal/new editing while the initial request is pending. Freeze the submitted draft during that interval. Add the exact close-during-POST/new-draft/late-success and late-error tests. No backend command, durable storage or schema change is needed for this correction.

### G2 — [P1] A current refusal cannot settle an earlier unresolved write

**References:** [RecordsManager.tsx](C:/Project/MyPetLink/apps/web/src/components/portal/RecordsManager.tsx:705), `saveAsSeparateRecord` at line 824 and the target-changed issue panel; [CareRecordService.cs](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/CareRecordService.cs:452).

The `refused` flag correctly describes the request that returned 400. It is not evidence that a different earlier request for the same due item has stopped. Reload/navigation loses the held state, so a fresh editor can coexist with an older server request that already passed validation.

An independent rendered client probe supplied an HTTP 400 fulfilment refusal through the actual API client after target archiving. Current UI displayed “This care item was deleted, so your details weren't saved”, offered Save as a separate record and sent a second POST with a null fulfilment link. This was controlled transport, not a running HTTP server.

After the full API suite exited, a separate probe ran that server sequence through the actual compiled care service on a fresh SQL Server fixture, with provider retries enabled. A save interceptor held A after validation, before the insert. Another context archived the target. B's linked create returned the actual `ApiException` with status 400 and a `fulfillsCareRecordId` error. The unlinked create corresponding to the UI's Separate Record action succeeded. A was then released. The fresh-page client probe models the page reload that loses A's hold; the SQL probe models the still-running server operation. No application implementation was substituted.

Observed SQL result:

```text
targetStatusDuringPause=archived
secondLinkedRequestRefused=400:True
activeNewLogs=2
finalStatus=archived
targetArchived=True
```

The updated archived-state precedence works, but does not prevent the duplicate history. This is the earlier duplicate-log scenario reached through a **definitely refused newer request**, rather than through an `unknown` flag. It demonstrates the unsafe combination of lost page state and the current shortcut; it does not prove the 400 classifier is wrong about B. The unique non-null link index cannot arbitrate B's unlinked write. A refusal is local to that request, not a global receipt that the care event was never saved.

**Narrow correction:** do not offer the unlinked recovery shortcut for an unavailable target merely because the latest request was refused. Preserve the draft and explain that an earlier request may still appear. A manual ordinary-record flow must be an informed new-record action rather than an assertion that all earlier attempts failed. Add this earlier-request/current-refusal case to both SQL and editor regression coverage. This does not require introducing the Phase 2 completion command or a general create-idempotency system.

### G3 — [P2] Some contradictory or incomplete canonical responses still produce reassurance/success

**References:** [careContracts.ts](C:/Project/MyPetLink/apps/web/src/lib/careContracts.ts:187), record validation at line 270 and [careSaveRecovery.ts](C:/Project/MyPetLink/apps/web/src/lib/careSaveRecovery.ts:65).

Two independently accepted payloads remain outside the new test cases:

**Cross-scope category contradiction:** an owner-wide summary shows an overdue item for pet A, while pet A's scope claims zero due/overdue. Both pet scopes have more than three pending rows, so each shows only three future rows; pet B's count carries the one overdue item. Owner totals still sum correctly. Current validation checks each scope independently and compares repeated IDs, but never checks the owner-wide known row against that pet's counts.

Concrete fixture:

| Scope | Pending | Due within horizon | Overdue | Visible rows |
| --- | ---: | ---: | ---: | --- |
| All pets | 8 | 1 | 1 | A-overdue, A-future-1, B-future-1 |
| Pet A | 4 | 0 | 0 | A-future-1/2/3 |
| Pet B | 4 | 1 | 1 | B-future-1/2/3 |

All visible items have valid status/date, unique IDs and identical repeated copies. The parser accepts it as complete. Selecting pet A yields the green “Nothing due through 19 Nov.” branch despite the known owner-wide overdue A row.

**Missing document collection:** a completing record whose `documents` field is omitted is accepted. Mapping converts that missing collection to `[]`; an attempt with no sent attachments then matches and is confirmed. An absent canonical attachment collection is not proof that the canonical set is empty. Explicit duplicate/unidentified documents are rejected, but omission is currently silently repaired.

These are defensive contract failures. No current, correctly executing serializable summary was shown to generate the contradictory counts, and the real completion DTO normally emits a document array. They do not establish a new SQL privacy defect.

**Narrow fix:** validate the union of known unique rows against the counts for their actual pet, as well as against all-pets counts. Reject a missing/non-array document collection on this new completion contract rather than assuming empty. Keep truncated summaries as bounds, not inferred complete lists. Add these two concrete cases and valid truncated controls.

### G4 — [P2] A removed due date loses changed-target precedence after a late completion

**References:** [CareRecordService.cs](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/CareRecordService.cs:395), [careContracts.ts](C:/Project/MyPetLink/apps/web/src/lib/careContracts.ts:340), and [CareCompletionInterleavingRelationalTests.cs](C:/Project/MyPetLink/apps/api/MyPetLink.Api.Tests/Relational/CareCompletionInterleavingRelationalTests.cs:160).

Actual precedence is archived → pet-archived → completed → no-due-date → pending. If a due date is cleared after A validates, the read initially says no-due-date; once A lands, it says completed. The frontend accepts a completed target without a due date and confirms matching values. An in-memory parser/recovery probe returned `confirmed` for that combination.

The relational test checks no-due-date while A is paused, but after releasing it asserts only the landed record ID and record count. It does not assert the final state. A separate independent SQL probe after the full run confirmed `targetStatusDuringPause=no-due-date; activeNewLogs=1; finalStatus=completed; targetDueDatePresent=False`. The implementation report's statement that the status continues reporting no-due-date with a late record is therefore inaccurate.

**Narrow fix:** if clearing the due date is an unavailable/changed-target condition, give it precedence over completion, allow its late record in the response contract and keep the recovery draft in the changed-target state. Assert the final SQL state and editor outcome. This fixes read/recovery semantics; preventing the already validated write itself is the separate versioning work that remains out of scope. Moving one non-null due date to another remains an explicitly documented limitation.

## 5. SQL Server test assessment

The eight new interleaving tests use actual SQL Server and a save interceptor armed after seeding. The pause occurs after service validation and immediately before the insert, so they test a meaningful race rather than changing mocked status values. The six-second test waits real time, and the linked-retry control checks the actual unique-claim behavior. The archived-target test now checks the final archived state and late record.

Their limitations matter: the unknown-target test performs no second write because it assumes the UI will never offer one. It therefore does not exercise a fresh page's definitive refusal while a previous request remains outstanding. The removed-date test omits the final-state assertion described in G4. Neither test proves durable exactly-once behavior.

The fixture creates a fresh `MyPetLinkTest_<GUID>` database and drops only that exact database. The full API run was started with no other active LocalDB user request. No browser/database setup or separate SQL probe ran alongside it. No LocalDB restart or removal of pre-existing databases was performed.

### Previous 47 failures: actual log assessment

Read the author's `api-full.log` and `api-rerun.log` from the existing scratchpad, rather than relying solely on the implementation report. The full log records 2,983 passed, 47 failed, zero skipped, duration 26m04s. All 47 first error messages are SQL execution timeouts, with the fixture's `CREATE DATABASE` execution at line 58 in their stacks. Failure timestamps cluster from 1m25s to 2m00s. No product assertion failure appears in those 47 error messages. The focused log records 73 passed, zero failed/skipped.

This supports fixture/database-resource contention rather than 47 distinct product regressions. It does not independently prove the precise external cause or that every test passed together. The author's migration log/file timestamps alone are insufficient to establish the claimed overlap's complete timeline. The clean independent run result below is the stronger evidence.

**Independent full API result:** **3,030 passed, zero failed/skipped**, 23m29s, one uninterrupted run. Parsed the TRX counters and individual results: interleaving 8/8, upcoming relational 3/3, upcoming service 29/29, upcoming HTTP 8/8. The known Community feed-plan assertion also passed. No non-pass result occurred. Evidence: [independent full-run TRX](C:/Users/User/AppData/Local/Temp/mypetlink-release-gate-20261020/dashboard-release-gate-full-20261020.trx). The test SQL override was unset, so the fixture used its documented LocalDB default.

**Additional SQL probes:** reproduced G2, then G4, sequentially after the full run completed. Each used a separate disposable GUID database, the current API assembly, retry-enabled SQL configuration and an in-memory interceptor. No database-creating tasks overlapped. Both databases were disposed normally. The final catalog check found no remaining test database created since this review run began; the pre-existing test-database count remained 173.

The previously documented Community exact-index plan intermittency remains separate and was not changed or weakened during this review.

## 6. API-connected recovery, web and build assessment

The supplied JSON has 16 successful **checks across five scenarios**, not 16 independent scenarios. The script uses the real web app, actual API authorization and SQL, with network interception in the browser. It mints a test-owner JWT with an isolated signing key; it does not exercise Google login or token refresh.

- A forwards the create to the server, observes success and drops the response. The UI confirms from a canonical read; SQL counts one log.
- B aborts before the server receives the request, checks the locked UI over 16 real seconds, closes it after the unknown state is established, then replays the original request. It is a useful delayed-delivery test, not a server request paused after validation.
- C repeats that pre-server abort, archives the target and verifies that a later first arrival is refused. It does not cover A having validated before the archive.
- D reopens an already completed item and checks that no create occurs.
- E has another tab win, receives a real 400, then intentionally creates an unlinked record. It contains no earlier unresolved request and no reload.

Those assertions and the JSON agree. Screenshots 21–25 show expected desktop success, locked unknown, held, unavailable and refused states. No new layout regression was found. No files were uploaded in that browser run because storage credentials were disabled; real private-storage attachment behavior remains a release-candidate smoke check. The document integration tests supply the ID-matching evidence, not a completed browser/R2 smoke.

The browser script was inspected, not independently rerun: its disposable setup was removed, and recreating it while the full SQL run was active would undermine the requested idle-server verification. Independent component/client probes used controlled fetch responses and made no real server writes. Their evidence boundaries are stated in G1–G3.

### Independent checks

| Check | Result |
| --- | --- |
| Focused web suites | **241 passed in 10 files**, including the real-service document recovery suite, Log as done, contracts, recovery helper, document service, Dashboard, Share Center, context creation and identity regressions. |
| Full web suite | **4,610 passed, 7 skipped; 387 files passed, one skipped**, 13m44s. Cache disabled; existing default/production test projects; one worker. Focused executions above overlap this full set and are not additional unique tests. |
| Additional owner suites with all six release values true | **120 passed, one failed across four suites.** The failure is the ContextualCreateActions empty-Moments test: its apiConfig mock omits `canUseApi`, reached only with Social on. The real module exports that function; this is a test-fixture gap, not evidence of a missing production export. The other three suites' 96 cases passed. No test was changed or selectively rerun to hide this result. |
| Standard unfiltered app typecheck | **Passed**, no ignored paths, no emitted files and incremental output disabled. |
| Functions typecheck | **Passed**, same no-emit/non-incremental approach. |
| Lint | **Passed**, no fixes. |
| Production build | Existing raw log independently inspected: compiled, TypeScript passed, 160 pages exported, release flags/social/SEO checks passed. **Not rebuilt by this review**, preserving shared generated output. |

The malformed `.next/dev/types` tails are absent now. The current normal typecheck includes those paths and passes; no custom compiler-host omission was needed. `next-env.d.ts` points at the production-generated routes after the supported build. The build log and current outputs support the reported resolution; generated files were not hand-edited by this review. Application source timestamps precede the recorded production build.

## 7. Remaining limitations and classifications

| Limitation | Classification for a conservative Phase 1 release | Reason/action |
| --- | --- | --- |
| Unknown draft state is lost on full reload/navigation | **Acceptable documented limitation only after the unsafe recovery consequences are closed; follow-up for durable recovery** | In-page pending closure must work: G1 is not this limitation. A fresh page must not infer that all earlier requests stopped: G2. Tell owners that the retained draft lasts only on this page and that leaving does not cancel a sent save. |
| No durable care-create idempotency key | **Follow-up improvement, not independently a blocker** | One unchanged target's non-null claim prevents two linked winners, but is not global operation deduplication. Do not promise exactly-once behavior. |
| Text/media matching does not prove request identity | **Acceptable documented limitation** | The success wording can truthfully describe an observed record/set without identifying the creator request. Preserve unmatched or unverifiable drafts. |
| Target update/archive races | **Acceptable write-model limitation after truthful read/recovery handling; current G2/G4 are actionable** | A validated write can land late. Fixing unsafe UI choices/state priority is bounded Phase 1 work; preventing all such writes with version preconditions is separate. |
| SERIALIZABLE summaries not load-tested on Azure SQL | **Release-preparation operational check and follow-up** | Local correctness tests are not target-tier latency, lock or deadlock measurements. Measure representative long histories and concurrent edits; do not add indexes without an observed plan/workload need. |
| Historical care browsing limited to first 100 | **Acceptable documented limitation / follow-up** | R4 no longer promises complete browsing. Exact summary counts do not make history a complete planner. |

The in-page banner currently says details are kept without qualifying its page lifetime. Add a short, accurate leave/reload explanation as part of release copy; do not imply that discarding the draft cancels a server request. GA4 and private-media architecture remain separate workstreams.

## 8. Production release checklist

1. **Resolve the specific recovery/validation findings above, then rerun their exact regressions.** Preserve the approved layout. Do not introduce the deferred Phase 2 command or redesign the care write model merely to satisfy this review.
2. **Assemble a clean, scoped release candidate.** Existing dirty changes include marketing seeding in API `Program.cs`, development launch/settings, root scripts and extensive unrelated Consignment/Merchant/Smart Tag work/artifacts. Do not deploy the current dirty-tree binaries wholesale. Review a precise manifest or isolated release checkout. This review did not stage, commit, discard or move any of that work.
3. **API dependencies:** care controller, DTOs, care service and service contract changes, backed by the existing schema. No Phase 1 migration, model/index change, root `migration.sql` change or new App Setting is needed. Marketing-demo configuration is unrelated and is not a Dashboard deployment dependency.
4. **Web dependencies:** Dashboard pages/components/helpers, care service/contracts/recovery/outcome helpers, routes, shared DTO/types and the owner Moment creation-time mapping. The optional create observer is part of the care service/editor integration. Rebuild the approved source/flags with the intended public API URL; preserve existing authentication/CORS configuration.
5. **Deploy API before the dependent web.** The web requires `/api/v1/care-records/upcoming/summary` and `/{id}/completion`. Old API with new web yields visible care/opening failures, not a healthy supported pair. Older web can reject new late-completion/unavailable combinations and fail closed; do not call that completely transparent backward compatibility.
6. **Run release-candidate/post-deployment smoke with isolated test owners:** 100+ history records and old pending care, multiple pets and owner isolation, normal saves with a certificate, dropped response after commit, close/reopen while the initial POST is pending, unknown checks after long delay, earlier request plus reload/current refusal, changed targets, same text/different files and two-tab conflict. Inspect canonical linked IDs and final row counts, not messages alone. Check Smart Tag/Share Center behavior and the four approved widths. No production failure injection or real-owner data modification was performed here.
7. **Check target-tier SQL performance.** Exact counts scan beyond the 1,000-row candidate cap. Review duration/logical reads, blocking, deadlocks/retries and exhausted-retry errors under representative owners and care changes. Both summary and completion reads now use SERIALIZABLE; the completion read additionally holds locks through document loading. No index or isolation change is recommended without evidence.
8. **Rollback web first.** The additive API reads can remain. If API rollback is necessary, first remove the new dependent web and use the previous compatible pair. No schema rollback is required. Do not delete valid owner history as part of a software rollback.

## 9. Decision and preservation

**NO-GO for approving the current revision for Production Release Preparation.** The timer and missing-certificate failures are fixed, but the initial-request lifecycle must stop erasing newer drafts, and the bounded refused-write/contract gaps must be closed. A passing full suite cannot negate the independently reproduced missing test cases.

The full API run passed **3,030/3,030**, the standard full web run passed **4,610 with seven skips**, and both typechecks/lint passed. The additional six-release-value owner check exposed one missing-export test mock, recorded above. The current-refusal/earlier-write and removed-date SQL probes confirmed the remaining gaps despite the passing existing assertions.

Byte preservation was checked over **4,940 pre-existing modified/untracked files**, including unrelated application work and artifacts. The final aggregate of each sorted path and SHA-256 was identical to the baseline: `e0927d00bd0ca2951d52c529377f7001a83a92669d7444ca2c2f1aad5b0a2300`. The new review report was excluded from both manifests. Existing files were preserved; only this report was added inside the repository. Test results were written to the temporary directory linked above.

No application changes, production/pre-existing database modifications, migrations, dependency installations, commits, pushes or deployments were performed. No LocalDB restart or unrelated database removal occurred. This report is the only new repository artifact.

**R1–R4 have not all been resolved safely. Fix G1/G2 and the bounded G3/G4 validation/state issues, then verify the scoped release candidate. Stop after the review.**
