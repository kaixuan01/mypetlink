# Phase 2 Smart Care Planner — Independent Review

Reviewed 21 October 2026 (Malaysia/Singapore, UTC+8). Repository: `C:\Project\MyPetLink`. Branch `main`, checkpoint `36fbb67ae8636c3145368390f800e447088df29d`; Phase 2 remains uncommitted.

## 1. Executive Verdict

**NO-GO for accepting the current Phase 2 implementation as ready to commit and prepare for release.** One P1 and five P2 findings are documented below. These are narrowly scoped implementation corrections, not a request to redesign the approved Dashboard or introduce cursor pagination.

The underlying completion design is sound in several important respects: it reuses `CareRecords`, authenticates the actor, preserves durable request keys, serializes the four care-write operations per pet, and retains unique database constraints. The independently rerun same-key, different-key, full-form-versus-command and care-target edit/archive races passed. No unintended second active **linked** completion was demonstrated in those scenarios. That evidence does **not** establish every requested invariant: a reproducible fingerprint collision accepts different details as a replay; the new dialog can lose an unresolved request; and the Planner can show the wrong pet's actionable rows or hide pending care.

**Answer to the release question: No, not yet.** The current changes are not fully functionally correct. Resolve F1–F5 and explicitly resolve or accept the bounded lifecycle race in F6, then repeat the affected checks. Production deployment remains a later, separately authorized step. Nothing was committed, staged, pushed, deployed, or applied to Production during this review.

### Review method and limits

- Read the root instructions, frontend instructions/reference, canonical product model, implementation report, Phase 1 final approval, current care API contract, Owner Portal flow, relevant access documentation, source, tests, migration, snapshot and root script. The root `Project-design-doc.md` and `implementation-plan.md` do not exist; the existing `docs/backend/implementation-plan.md` was consulted. The stale root README's backend-placeholder description was not treated as authoritative.
- Inspected the changed frontend pages/components, endpoints, `CareRecords` columns/indexes, shared DTOs/types/services, and all six Consignment test-file diffs before producing this report.
- Ran existing tests without rebuilding, and ran additional **in-memory** component/service probes without creating test source files. Portable PDB SHA-256 checks matched **31 relevant compiled source documents**, including the care service, relevant tests, lock helper, PetService and Smart Tag limiter test; there were no mismatches. The tested service hash was `4A90D6032997C4687241AA8916CDC6B9BF8E71FBBAEE6E728003D903422E927D`.
- SQL probes/tests used the existing fixture's randomly named disposable `MyPetLinkTest_*` LocalDB databases and cleanup. No existing owner database, private storage, external service or Production data was used.
- Inspected supplied browser result JSON and screenshots. Did not rerun the browser script, full API/web suites, lint, typecheck or production build. Their reported results remain attributed evidence, not new independent passes.

## 2. Feature Verification Matrix

| Feature / invariant | Assessment | Evidence / limit |
| --- | --- | --- |
| JWT actor, ownership, stranger/deleted target | Pass in reviewed scope | Controller `[Authorize]`, current-user service and ownership-filtered reads; HTTP/unit tests. No client actor field. |
| Same-pet/type fulfilment | Pass | Shared `ValidateFulfillmentAsync`; existing cross-pet/cross-owner/type tests pass. |
| Malaysia completion day and next date | Pass | UTC+8 `DateOnly` validation, midnight unit cases, client default and inline date validation. |
| Target archived / undated / already fulfilled | Pass for care-write races | State checks and the common pet lock, backed by SQL tests. Pet lifecycle writes have a separate gap: F6. |
| Same-key replay after commit/edit | Pass with exceptions | Durable fingerprint and current stored record; F3 invalidates the different-payload guarantee for certain text. |
| Deleted/archived completion replay | Pass | `completion_removed`; key/fingerprint retained when archiving unlinks fulfilment. No recreation. |
| Concurrent same/different-key requests | Pass in tested SQL scenarios | 8 same-key requests produce one create and seven replays; 6 different keys produce one completion and conflicts. Unique indexes remain backstops. |
| Network outcome unknown, retry while dialog retained | Pass | Existing component/browser evidence; exact same captured key and payload. Leaving the dialog loses this guarantee: F2. |
| Create / Update / Archive / Complete lock coverage | Pass for those four operations | Each invokes `RunCareWriteAsync`; pet archive does not: F6. |
| Lock timeout / subsequent lock release | Independently reproduced | `503 care_write_busy` after **10.05 seconds**; after releasing the first writer, retry returned the same record as `replayed`. |
| Additive migration and root script | Pass on inspected development schema chain | Nullable columns, filtered unique index, matching snapshot; migration/replay/rollback tests below. Actual Production migration history not inspected. |
| Upcoming and All records; owner/per-pet scope | Partial | Normal flows work; delayed load-more response contaminates a new filter: F1. |
| Static paging beyond 100 / 500 | Pass | SQL 520-row test and web 520-row test pass. |
| Paging while data changes | Fail to converge reliably | Concrete missing pending rows and misleading end-of-list: F4. |
| Empty/loading/error and exact counts | Partial | Read failures show errors; separate successful reads can hide a real row: F5. |
| Focus/visibility refresh | Pass with boundary | Rereads the loaded window. No foreground midnight timer; statuses can remain yesterday's until another refresh. |
| One-step/full-form coexistence | Partial | Full form still exists and regression tests pass; new link bypasses one-step save ownership: F2. |
| Approved Dashboard and other owner features | No broad regression found | Dashboard structure, full editor/reconciliation, Lost Mode, Moments and Share Center remain in place. New Planner navigation has the findings below. |
| Free/Premium and deferred scope | Pass | No subscription, reminder execution, Undo, same-gap suggestion or Weekly Recap implementation added. |
| Responsive/keyboard UX | Partial evidence | Actual 390/1280 screenshots inspected; shared modal focus behavior reused. New 768px, long-content and keyboard-overlay scenarios are not demonstrated. |

## 3. P0 / P1 / P2 Findings

**P0: none identified. P1: F1. P2: F2–F6.** All six findings have concrete reproduction evidence; their broader operational implications are distinguished from what was reproduced.

### F1 — P1: A stale page response inserts another pet's actionable rows into the selected filter

**References:** [CarePlanner.tsx:145](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:145), [state append at line 155](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:155), [pet selection at line 134](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:134), [row actions at line 472](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:472).

`read()` has a generation check; `loadMore()` does not. Its response appends to whichever ready state exists when it settles, without checking the pet filter or read generation that requested it. Its error/finally handlers are also unscoped.

**Reproduced with the actual component:** load the all-pets first page, hold page 2, select Oyen, let Oyen's one-row response finish, then release the old 50-row Milo response. The URL and selected chip were `?pet=b` / Oyen, but the list contained **51 rows, 50 belonging to Milo**, while the group count remained **1**. Those wrong-pet rows still exposed their Done buttons. In a filtered view, row pet-name labels are omitted; the confirmation dialog does name the actual pet, which reduces but does not remove the risk.

**Impact:** a normal slow-network interaction produces a misleading pet scope and actionable care for another pet. This is an owner UX/data-integrity defect, not a cross-owner authorization bypass.

**Narrow recommendation:** capture a scope/read generation for every incremental request; invalidate it on filter/full refresh/unmount and ignore all stale settlement paths. Add a deferred-response regression for filter change and for a full refresh overtaking load-more.

### F2 — P2: The full-form link bypasses pending-save protection; closing an unknown outcome discards recovery data

**References:** [CompleteCareDialog.tsx:61](C:/Project/MyPetLink/apps/web/src/components/portal/care/CompleteCareDialog.tsx:61), [dismissal at line 134](C:/Project/MyPetLink/apps/web/src/components/portal/care/CompleteCareDialog.tsx:134), [full-form link at line 248](C:/Project/MyPetLink/apps/web/src/components/portal/care/CompleteCareDialog.tsx:248), [parent close at CarePlanner.tsx:265](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:265).

**Reproduced with the actual dialog:** enter a note and hold the completion promise. Save/Cancel become disabled, but **Add documents or a clinic** remains an ordinary focusable link (`tabIndex=0`, no disabled state), pointing at the full editor. Following it unmounts the dialog and loses its entered fields/key while the authorized request can still finish. Even before submission, that switch does not transfer entered details.

Reject the held promise as a network failure: the dialog promises that details are kept, but Cancel is enabled and calls `onClose`; the parent removes the dialog. The captured payload and idempotency key exist only in that dialog's refs/state and are discarded. Reopening has a new key and blank note/next date. There is no held-draft banner, review/discard choice or page-retention explanation equivalent to Phase 1.

**Impact:** user-entered details and the ability to retry the exact unresolved request are lost. The full editor can be opened while the earlier request is unresolved. The server's fulfilment index still prevents a second active linked completion for the same target; this probe did **not** demonstrate duplicate linked records.

**Narrow recommendation:** disable the full-form switch while sending or unresolved; transfer unsent details or explicitly handle their discard when switching. Retain an unresolved attempt at page level when closing, with review/retry and truthful navigation/discard wording. Do not imply Cancel cancels an already sent request. Test link activation, Cancel/Close/Escape, route departure, reopening, and late settlement.

### F3 — P2: Newline-delimited fingerprinting conflates different persisted provider/note values

**Reference:** [CareRecordService.cs:911](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/CareRecordService.cs:911), especially the `string.Join("\n", ...)` at line 913.

Trimming/null normalization matches persistence, but the encoding of the normalized fields is ambiguous. Newlines are accepted inside both optional strings.

**Reproduced against the compiled service**, using its existing in-memory test harness and the same target/date/key:

| Request | Provider | Notes |
| --- | --- | --- |
| First | `Clinic\nRoom` | `Note` |
| Second | `Clinic` | `Room\nNote` |

These generate identical SHA-256 input/hash. The first returned `created`; the second returned **`replayed`**, carrying persisted provider `Clinic\nRoom` and notes `Note`, rather than the expected `409 idempotency_key_conflict`. Exactly one active completion existed. This is an encoding collision, not an attack on SHA-256.

**Impact:** the advertised different-payload guarantee is false for valid input; callers receive success for details that were not stored. The current one-step web form does not send provider, so the reproducer primarily affects direct API clients/future provider entry.

**Narrow recommendation:** hash an unambiguous, invariant encoding of the actual normalized values, such as a fixed JSON array or length-prefixed fields. Retain the stored original request fingerprint across edits. Add this collision case plus trim/null equivalence tests; define compatibility if any keyed data exists before changing the encoding.

### F4 — P2: Offset churn can hide pending rows and terminate paging prematurely

**References:** [CarePlanner.tsx:145](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:145), [remaining calculation at line 375](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:375); [RecordsManager.tsx:602](C:/Project/MyPetLink/apps/web/src/components/portal/RecordsManager.tsx:602), [history continuation at line 1107](C:/Project/MyPetLink/apps/web/src/components/portal/RecordsManager.tsx:1107). The SQL test [CareCompletionCommandRelationalTests.cs:247](C:/Project/MyPetLink/apps/api/MyPetLink.Api.Tests/Relational/CareCompletionCommandRelationalTests.cs:247) acknowledges shifting offsets but does not prove complete client coverage under that interleaving.

**Reproduced with the actual Planner:** start with 105 pending items and read 50. Complete the first five outside this mounted Planner, without a new focus event. The next page is offset 50 in the now-100-row set. The rendered list contains 100 IDs, including five stale completed IDs, and **omits five still-pending IDs (`a-50` through `a-54`)**. Since `total - displayed unique IDs` is zero, the Show more button disappears. There is no visible refresh action in the ready state.

The history implementation has the related limitation: it appends/de-duplicates pages and decides that it is finished from `historyPages * 100`, not actual coverage. Inserts, deletes or record-date edits can shift boundaries. Local create/delete updates do not update the stored history total. These history implications are source-derived; the live-component reproduction above is specifically for the Planner.

**Impact:** the new interface can stop offering pending care that still exists. Static ordering and de-duplication prevent neither omission nor stale rows. Own completions/focus refresh improve recovery but do not cover another device or a change between page reads.

**Classification:** this is a concrete offset-pagination consistency limitation with a UI consequence, not a requirement for cursors or a database duplicate-write defect. Even keyset paging would not, by itself, make separate reads a single snapshot or refresh edited displayed rows.

**Narrow recommendation:** keep page/pageSize for MVP, but provide a visible refresh/restart and truthful live-list wording; reconcile a changed loaded window and avoid treating row count as proof of exhaustive coverage. Test the demonstrated deletion/completion shift, insertion/date-edit shifts, and end-of-list behavior. Do not promise stable snapshots across requests unless implemented.

### F5 — P2: A stale successful summary can suppress a newly returned pending row

**References:** [CarePlanner.tsx:84](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:84), [empty-state precedence at line 337](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:337), [counts at line 370](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:370).

The summary is consistent internally, but it is fetched **before** independently requested pages. The Planner does not reconcile their coverage/count/day differences.

**Reproduced with the actual component:** return a valid empty summary (`hasCareRecords=false`, zero pending), followed by a valid first page containing one newly created pending care item, total 1. The UI renders **“No care records yet.”**, displays **zero rows**, and hides the item it just received. A real creation between the two requests produces this sequence without either endpoint being wrong. Other concurrent changes can also leave the summary's group counts stale relative to displayed rows.

**Impact:** a successful read sequence presents incomplete information as an empty state, contrary to the acceptance requirement. The existing error-state tests do not cover two individually valid but temporally different responses.

**Narrow recommendation:** never allow an empty-summary branch to override known pending rows. Detect/reconcile contradictory coverage, counts and reference day, or show a refresh state instead of an all-clear. Add a regression with a write between summary and first page, and one across Malaysia midnight.

### F6 — P2: Pet lifecycle writes bypass the care lock, leaving a validated-completion/archive race

**References:** [CareRecordService.cs:795](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/CareRecordService.cs:795), [CreateRecordCoreAsync at line 490](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/CareRecordService.cs:490), [RunCareWriteAsync at line 932](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/CareRecordService.cs:932); [PetService.ArchiveAsync:382](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/PetService.cs:382).

**Reproduced against real SQL Server**, reusing the command suite's pause-before-insert interceptor and disposable fixture:

1. Start `CompleteAsync`, pass target/pet/fulfilment validation, pause immediately before insertion while holding `care-write:{petId:N}`.
2. On a separate context, call the actual `PetService.ArchiveAsync` for that pet. It commits and returns `Archived` before releasing the completion pause.
3. Release the first writer. It returns **`created`** and commits its completion after the pet archive. Observed completion ID: `0d0125d7-385a-4deb-9061-5626297b3616` in the subsequently dropped test database.

**Impact/boundary:** lifecycle validation is not atomic with pet archive. The four care-write operations are protected from each other, but that does not serialize PetService operations. A new request that sees an already archived pet is correctly refused, and the completion-status read still reports `pet-archived`; no second active linked completion or authorization leak was demonstrated.

This extends the pre-existing Phase 1 pet-lifecycle race; the new command inherits it. It is **not** evidence that the rewritten care-target archive/edit tests are false, but the report's broad claim that the remaining changed-pet race is closed is too strong.

**Narrow recommendation:** either coordinate the relevant pet lifecycle transition with the same pet lock and consistent lock ordering, or explicitly retain this precise overlapping-operation boundary as a product/release exception. Add the actual pet-archive interleaving to SQL tests. Do not claim all active-pet lifecycle races are eliminated until this is addressed. No unrelated pet-feature redesign is needed.

## 4. Completion API Review

The [controller](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Controllers/CareRecordsController.cs:145) is thin and uses the existing envelope. Created responses use `201`/Location; matching replay uses `200`. Model binding/data annotations cover GUID/date syntax and optional text maximum lengths; service validation names missing/invalid completion fields. Target-not-owned and hard-deleted targets are both `404`. Owned target archive, archived pet, no due date and existing fulfilment yield stable `409` codes in that precedence. Lock exhaustion is `503`, not a false conflict or success.

The actor is the JWT subject. The command accepts neither pet nor owner identity; it derives the pet from the owned target. It creates through `CreateRecordCoreAsync`, copying current title/type/care name, using chosen dates, normalizing optional strings, setting Private visibility and linking the existing fulfilment field. It does not copy documents or introduce a second care-record model. Current care type/title may change before the command acquires its lock; there is no version precondition. It completes the current eligible item, not a frozen copy of the dialog's initial title.

| Replay / refusal scenario | Reviewed behavior |
| --- | --- |
| Same key and normalized details, after successful commit | Existing active record, `200 replayed`, no new write. |
| Same request after editing the created record | Stored original fingerprint still matches; response is the record **as it is now**, not its original fields. |
| Same key, different date/next date/ordinary notes | `409 idempotency_key_conflict`; exceptions in F3. |
| Same key, another owned target or another owner's owned target | Fingerprint/ownership mismatch, generic `409`; no other owner's record content returned. |
| Caller asks directly for someone else's target | `404` before replay lookup or lock acquisition. |
| Completion archived or soft-deleted | `409 completion_removed`; key retained, never recreated. |
| Target archived after earlier successful completion | Matching replay precedes current target-state checks; active historical completion may be returned, now unlinked. This is historical request acknowledgement, not a new completion of an archived item. |
| Target or pet hard-deleted | Ownership precheck prevents replay (`404`); successful historical creation does not override current access. |
| Another active fulfiller / different tabs | One active fulfilment link; second new-key command conflicts. |

Ordinary edits can explicitly clear or change the fulfilment link; ordinary archive clears it and reopens the prior pending item. Those are existing correction mechanisms. A late original key does not reinsert the old completion. A deliberate new completion after such a correction is a new operation, not an idempotent replay defect.

One client boundary deserves a regression: [parseCareCompletionResult](C:/Project/MyPetLink/apps/web/src/lib/careContracts.ts:334) rejects a replay whose currently edited fulfilment link points to a different item, although the API deliberately returns edited records. This can leave the dialog reporting an unknown outcome even after the API acknowledged the original request. No duplicate is created; distinguish historical request acknowledgement from current fulfilment when resolving such edited replays.

## 5. Idempotency and Concurrency Review

### Lock correctness and SQL tests

[RunCareWriteAsync](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/CareRecordService.cs:932) creates the execution strategy outside the delegate, starts a READ COMMITTED transaction inside it, obtains the application lock before the protected reads, and commits after persistence/response projection. Create/Update/Archive/Complete all use it. Initial record-to-pet lookup is outside the lock for authorization/routing; the actual write validation is inside. No alternative CareRecord mutation path was found outside the service in the runtime API search.

Resource `care-write:{petId:N}` is deterministic, short and consistent across processes. [SqlApplicationLock](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Common/SqlApplicationLock.cs:29) binds the command to the EF transaction, parameterizes the resource, requests an exclusive transaction-owned lock and uses a 10,000 ms timeout. This is compatible with SQL Server/Azure SQL, including READ_COMMITTED_SNAPSHOT; it does not depend on LocalDB-only row-lock semantics. Commit, rollback, disposal or connection termination release transaction-owned locks. A negative application-lock return, including its deadlock-victim return, becomes the stable retryable `503`; an actual transient SQL exception remains subject to the execution strategy.

Independently ran all **11 command** and **10 interleaving** relational cases without skips. They exercise distinct contexts/connections, paused validated writes, same/different keys, a full-form race, target archive, moved/cleared due dates and replay after commit. They are real SQL tests, not in-memory mocks. A further independent held-lock probe returned `503 care_write_busy` at 10.05 seconds and then replayed the first committed record after release. F6 is the uncovered lifecycle path.

No normal valid care-write path acquires two pet application locks in opposite order. SQL locks taken by summary reads, media reads/writes, pet lifecycle writes and cross-pet invalid requests still exist; absence of a universal deadlock is not proven. Disposal and retries are appropriate safeguards, not measured proof that deadlocks never occur.

### Retry boundaries and negative control

On a retried transaction attempt the service clears the EF tracker and reloads state. For the completion command, an ambiguous successful commit is recoverable from the durable key; a rolled-back attempt can validate and insert again. Unit/SQL/client evidence covers replay after a committed write and a retry arriving before the original commits. It does **not** inject every transient connection/commit exception into the execution strategy. In particular, ordinary unlinked Create has no durable request key, so do not extend the completion command's replay guarantee to generic CRUD or unknown-commit retries without further fault-injection evidence.

The implementation report says four race tests failed with locks removed and the source was restored byte-identically. No retained raw negative-control run was found in the Phase 2 evidence directory. **That negative control is reported, not independently verified here.** Removing protection from source was not permitted by this read-only review. The independent real-lock tests and held-lock probe provide positive evidence without making that historical run a fact established by this review.

### Contention

Every care write for the same pet is serialized, including document-link validation and response-document loading. Different pets use different application locks, but owner-wide SERIALIZABLE summaries and shared SQL resources can still contend. There is no production-scale measurement. The implementation report's description of contention as “negligible” is unsupported; repeated focus/visibility refreshes and rereading many loaded pages also add work. Measure latency, blocking, deadlocks/retries and `care_write_busy` rates on Azure SQL before deployment, with representative owner/pet/history sizes.

## 6. Migration and Rollback Review

[Migration Up/Down](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Migrations/20261020181228_AddCareCompletionIdempotency.cs:13) changes only `CareRecords`:

- Nullable `uniqueidentifier CompletionIdempotencyKey`.
- Nullable `nvarchar(64) CompletionRequestFingerprint`.
- Unique `IX_CareRecords_CompletionIdempotencyKey`, filtered to non-null keys.

Existing records receive NULL; there is no backfill or business-data rewrite. Existing NULL rows do not conflict with the filtered index. The existing unique fulfilment index remains intact. SQL errors 2601/2627 for the named key index are mapped to a generic conflict; the separate fulfilment-index handling remains. The global request-key uniqueness is intentional, including archived records.

The model mapping, new migration Designer and snapshot describe the same columns/index. The tracked snapshot diff adds only those properties/index. The [root script addition](C:/Project/MyPetLink/migration.sql:13777) is 43 lines, guarded by migration history, with the index in dynamic SQL and the history insertion inside the transaction. Prior tracked script content is unchanged in the diff. The script was inspected and exercised by the existing fresh-migration/idempotent-replay test, rather than regenerated over the file.

Down drops only the new index and columns. It preserves care events, due dates, media and fulfilment links but **irreversibly loses stored replay identity**. Do not run Down while the new API is serving requests. A normal application rollback should leave the additive schema in place; older API code ignores the columns. Returning to an older API also returns its older race guarantees, so this is compatibility, not equal protection.

All six Consignment test-file changes were inspected. They append the new migration to exact pending lists after earlier rollbacks. The `51047`, `51051`, `51053`, `51055` and `51058` guard expectations and business-history assertions remain; the formerly empty pending list correctly becomes the care migration alone because it rolls back before the earlier guard refuses. No Consignment production code or guard SQL was changed. This reflects non-atomic rollback across migrations; it does not weaken the protected history requirement.

Independent migration/rollback test results are in Section 10. The additive care delta is suitable for an upgrade from the immediately preceding repository migration. **The actual current Production schema/history/drift was not queried and is not certified by these disposable tests.** Before release, compare its history with the intended candidate and account explicitly for any other unapplied migrations in the cumulative root script. Do not assume that `main`'s consolidated development checkpoint is the deployed database baseline. No Production migration was applied here.

Recommended eventual order: verify actual schema baseline/backups → additive migration → API → web. Roll back web before API, account for cached/open newer clients, and retain the columns/keys while rollback clients or unresolved requests may depend on them. Dropping/recreating them is not a harmless replay reset.

## 7. Planner Pagination Review

The pending query filters owner, active pet, active due record and absence of active fulfilment **before** paging. Ordering is due date, creation time, then unique ID. History now adds unique ID after record date and creation time. This makes each ordered query deterministic when timestamps tie. It does not give separate page requests a shared snapshot.

The Planner requests 50 rows per page, uses server metadata, de-duplicates IDs, and rereads its loaded window after its own completion and on visible focus/visibility events. SQL/static web tests demonstrate paging beyond both 100 and 500. History uses 100-row pages with an older-records button. These are substantial improvements over the first-page-only Phase 1 history.

F1 is an asynchronous scope bug, **not inherent to offsets**. F4 is demonstrated cross-request offset drift plus an unjustified exhausted-list decision. F5 is separate-summary/page temporal inconsistency. All can be addressed narrowly while keeping MVP offset pagination. No cursor migration is required by this review.

Counts from the summary are exact for its own transaction; list total/count queries and rows are separate reads, and later requests can describe another state. The implementation should not describe all these numbers as one current snapshot. A summary marked incomplete above 1,000 pending items still has exact counts and does not stop the paged endpoint; the cap affects summary item selection, not the Planner's maximum capacity.

Malaysia dates are derived correctly. A page kept visible through midnight has no scheduled refresh and retains old statuses/counts until focus/visibility or another action causes a read. Reads spanning midnight may also combine different reference days. Treat this as an explicit refresh boundary and test the chosen behavior; no automated reminder system is needed to handle calendar refresh.

## 8. UX/UI Review

Inspected the actual supplied **1280px Planner**, **390px Planner/dialog**, and desktop unknown-outcome/already-completed screenshots. The screenshots use MyPetLink's existing cream/blue/coral palette, rounded controls, clear grouping and readable action labels. The mobile row layout moves actions below text; the one-step dialog names the target/pet and has a pinned footer. Private-by-default copy and the optional date explanation are appropriate for ordinary owners. “Done” versus the existing full editor is understandable.

The inspected 390px Planner screenshot shows the fixed bottom bar covering the current viewport's lower rows; existing AppLayout bottom clearance should allow the final content to scroll above it. The supplied screenshot alone does not prove end-of-list/keyboard clearance. The new browser script tests only 390 and 1280 widths; **there is no Phase 2 768px screenshot/check**, no long-name/title scenario and no software-keyboard test. Earlier Phase 1 tablet screenshots are not proof of the new Planner/dialog.

Accessibility is improved by reusing FormDialog: dialog naming/description, modal background isolation, focus return, Tab trapping and Escape handling are present. Date fields carry error associations; notices/errors use status/alert roles; Done buttons name the pet and target. The Note field does not render arbitrary server field errors, and the active full-form link defeats the intended sending-state interaction lock (F2). Keyboard/focus behavior through changing disabled states, long unbroken header text and 768px layout remain candidate smoke checks, not visually verified passes.

For large lists, loading/error/retry and a progressive More button exist. F4's missing pending rows and F5's false empty state impair the ordinary-owner experience despite the otherwise clear presentation. The recommendation is to correct those behaviors and preserve the approved visual design.

## 9. Security Assessment

- **Authorization:** server ownership checks remain authoritative. No role-name checks, admin-capability changes or client-selected actor were introduced. Different-owner keys return generic errors without notes, documents, owner identifiers or target metadata from the other owner.
- **Cross-pet integrity:** the command derives pet identity from the target, and shared fulfilment validation rejects another pet/type and cycles/self-reference. F1 displays a wrong owned-pet scope but does not bypass API authorization.
- **Privacy:** new records are Private; pending projections exclude provider, notes and attachments. Completion responses use the existing owner-only record DTO. Public Safety/Share/Community projections and identity switches are unchanged.
- **SQL injection:** the application-lock resource is a parameter containing a server-derived GUID, not concatenated executable SQL. Migration dynamic SQL is fixed schema text.
- **Failure handling:** key/fulfilment unique constraints survive concurrent requests; transaction disposal rolls back failed changes. Error codes suit frontend handling. No dedicated completion limiter was added; existing authenticated endpoint patterns are retained. There is no evidence here requiring a new rate-limit policy, but monitor contention/abuse before adding controls.
- **Logging:** existing middleware handles API errors; no new raw clinical-note/key logging was added. Existing request correlation remains available. A reported exception or timeout is not proof that a write did not commit.

No reproduced cross-owner disclosure or unauthorized write was identified. The release blockers are correctness/recovery problems; they should not be mislabeled as a proven external security exploit.

## 10. Test Results and Known Flaky Test Assessment

### Independently executed in this review

| Run | Result |
| --- | --- |
| Focused care command/upcoming/identity/interleaving + Smart Tag limiter, existing compiled DLL | **106 passed, 1 failed, 0 skipped**, 107 total, about 60 seconds. All 11 command and 10 interleaving SQL cases passed; all 8 limiter cases passed. |
| Isolated rerun of the failed care summary SQL test | **1 passed**, 0 skipped. |
| Existing CareRecordServiceTests + PetTruthAndPublicCareTests | **44 passed**, 0 skipped. |
| Focused web: care components, history, completion client, DashboardClient, full-form Log as done, document recovery and save lifecycle | **145 passed across 9 files**, no failures. Cache disabled. |
| Fresh migration/script replay + suggested-terms rollback guard + stocktake-hardening rollback guard | **3 passed**, 0 skipped. |
| Additional agreement/contributor/sales-remediation/stocktake rollback guards | **4 passed**, 0 skipped, about 70 seconds. Together with the preceding run, all six changed Consignment test files had their relevant migration/rollback behavior exercised. |
| Additional probes | Reproduced F1–F6; additionally confirmed real SQL lock timeout/release and same-record replay. No probe source files created. |
| Diff whitespace check | Passed. |

The new independent failure was [Summary_StaysInternallyConsistentWhileRecordsChange](C:/Project/MyPetLink/apps/api/MyPetLink.Api.Tests/Relational/CareRecordUpcomingRelationalTests.cs:115): **“Only 3 summaries were read.”** The test allocates a four-second churn period and asserts more than five reads/writes at [line 194](C:/Project/MyPetLink/apps/api/MyPetLink.Api.Tests/Relational/CareRecordUpcomingRelationalTests.cs:194). It did not report mixed counts or broken summary invariants. Its isolated rerun passed. This is evidence of a timing/throughput-sensitive test under the selected run's scheduling, not a reproduced summary-consistency defect. No separate database-heavy test processes overlapped; the existing test runner can still schedule classes concurrently within one run.

### Supplied results: retain their actual status

The implementation report states **Care API 144/144**, **full API 3,067 passed / 1 failed**, **web 4,662 passed / 7 skipped**, **browser 16/16 checks**, and passing typecheck/lint/production build. The browser JSON contains 16 successful assertions and its screenshots were inspected. Current Phase 2 raw full-suite output and negative-control output were not present in its artifact directory; those totals are attributed to the report. This review did not rerun the full suites/build. **The full API suite is not green.**

### Smart Tag rate-limit failure

The same exact `PublicTagRoute_AboveLimitReturnsStandard429WithRetryAfter` failure **predates Phase 2** in retained raw evidence:

- [17 October full-suite TRX](C:/Project/MyPetLink/artifacts/consignment-final-verification/api-full-suite.trx:1844): failed, duration 11.2296593 seconds; corresponding [log](C:/Project/MyPetLink/artifacts/consignment-final-verification/api-full-suite.log:11) says expected TooManyRequests, actual OK.
- [Earlier 17 October TRX](C:/Project/MyPetLink/artifacts/consignment-independent-qa/api-full-suite.trx:1709): same failure, duration 8.8034813 seconds.

The test permits two requests in a **five-second real-time fixed window** ([configuration](C:/Project/MyPetLink/apps/api/MyPetLink.Api.Tests/SmartTagRateLimitingTests.cs:179)), then expects the third sequential request to be rejected. [Production limiter construction](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Program.cs:875) uses automatic replenishment. If request scheduling crosses a replenishment, a third OK is legitimate. Historical long test durations and current isolated success support that explanation; historical per-request timings were not captured, so the exact boundary crossing in the reported Phase 2 failure remains an inference.

There is no Phase 2 diff to Program, the limiter configuration/helper/controller or the limiter tests. All eight limiter cases passed in the independent focused run. **This known scheduling-sensitive failure should not by itself block Phase 2.** Maintain truthful full-suite reporting and address test determinism separately; do not weaken Smart Tag production limits to force a pass.

## 11. Production Readiness

Current result: **not ready for implementation acceptance or release-candidate approval**, due to F1–F5 and the unresolved lifecycle guarantee in F6.

After correction/review, release preparation still needs:

1. An exact Phase 2 source/test/migration manifest over `36fbb67`; exclude the numerous unrelated untracked bundles, copied sources, logs, patches and outputs. Do not stage the whole workspace.
2. Candidate tests/build with the intended flags and real API base; retain immutable candidate identity and complete results, including known failed/flaky runs.
3. Verification of actual Production migration history/drift and a rehearsed additive upgrade/rollback against an isolated schema copy. The cumulative root script contains more than this new care delta if Production is behind the repository baseline.
4. Real supported owner sign-in and non-production private-document smoke for the unchanged full editor, slow/drop-response completion, reopen/leave behavior, two tabs/devices, lifecycle changes and >500 rows.
5. 390/768/1280 (and the existing small-width baseline), long pet/care text, end-of-list bottom clearance, keyboard/focus and foreground Malaysia-midnight checks.
6. Azure SQL measurements for owner-wide SERIALIZABLE reads and multiple simultaneous same-pet writes. No production-scale claim follows from LocalDB correctness tests.

**Feature flag:** none exists; `/records` defaults to the Planner. A flag is a separate product/rollout decision, not an independent code blocker. It may support staged exposure but does not repair the identified defects. Existing active web clients/API compatibility and rollback order must be accounted for regardless.

## 12. Remaining Risks and Deferred Scope

| Item | Classification |
| --- | --- |
| F1 wrong scope, F2 lost recovery, F3 ambiguous fingerprint, F4 paging omissions, F5 false empty state | Reproduced defects; correction requested before acceptance. |
| F6 overlapping pet archive | Reproduced residual lifecycle race; coordinate or explicitly accept its precise boundary. |
| Generic non-keyed Create on an ambiguous transaction commit | Unproven retry risk; completion idempotency must not be generalized to it. No duplicate generic-create probe was run. |
| Lock-negative-control history | Reported evidence not independently recoverable; retain raw output for future audit. |
| Azure SQL latency/contention | Unmeasured operational risk, not a proven scaling failure. |
| Foreground midnight / separately fetched reference days | Current refresh boundary; explicit behavior and candidate check required. |
| Edited replay moved to another fulfilment target | Client/parser compatibility edge; add a regression when correcting recovery behavior. |
| Local fallback | New contract shape/normal flows mirrored, but local key validation only checks non-empty text and is not equivalent to server GUID validation; browser storage is not SQL concurrency evidence. No production SQL guarantee is inferred from fallback tests. |
| Undo | Acceptably deferred; ordinary explicit edits/archive remain. No unsafe automatic recovery write was introduced in the full editor. |
| Same-gap suggestions | Acceptably deferred; next due date is owner-entered. |
| Automated reminders / Weekly Pet Recap | Remain deferred; no reminder dispatch, subscription or Recap flow added. |
| Lost Mode, Recent Moments, Share Center, Free/Premium boundaries | No source change to their behavior from this phase found; full real-auth candidate smoke remains required. |

## 13. GO / CONDITIONAL GO / NO-GO Recommendation

**Selected: NO-GO for the current Phase 2 change set.**

The strongest safety mechanisms work in the tested cases, but successful suites do not override the reproduced defects. Correct the Planner's stale-request ownership and truthful-list/empty-state behavior, preserve unresolved completion details across the permitted dialog flows, and make the fingerprint encoding unambiguous. Resolve or formally bound the pet-lifecycle race. Re-review those exact changes with deferred-network and SQL interleaving regressions; do not redesign the Dashboard or change Smart Tag production behavior for this task.

**Phase 2 is not yet technically and functionally ready to be accepted as complete, committed to main, and prepared as a future Production release.** No deployment is authorized by this review. Work stops after the report.

Preservation check: all **37** reviewed modified/new implementation, test, migration and contract files had identical SHA-256 hashes before and after the review. HEAD remains `36fbb67ae8636c3145368390f800e447088df29d`; the staging area remains empty. Only this review report was authored. No application fixes, migration edits, dependency changes, Git mutations, Production writes or deployments were performed.
