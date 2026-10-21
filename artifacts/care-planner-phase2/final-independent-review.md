# Phase 2 — Final Independent Corrective Review

Reviewed 21 October 2026 (UTC+8). Project root: C:\Project\MyPetLink. Branch: main. Base/HEAD: 36fbb67ae8636c3145368390f800e447088df29d. Phase 2 remains uncommitted.

## 1. Executive verdict

**NO-GO — Reproduced implementation blocker remains.**

**F1, F2, F3, F5 and the specific F6 archive race are resolved in the reviewed scope. F4 is only partially resolved. Phase 2 is not yet ready to be accepted as complete and committed directly to local main.**

The original 105-record reproducer is fixed, but a new, ordinary interleaving still silently omits pending care: completing items with another next due date preserves the pending total while changing membership between page requests. The Planner's checks accept that mixed result as agreeing; it displays exact-looking counts and an exhausted list without its changed-list warning. History has the same defect and does not offer its Reload records action in this state.

This conclusion is **not** based on deferred real-auth/R2 smoke, Azure measurements, Production schema verification, release packaging or the historical Smart Tag test. Those are separate release requirements and would not automatically block a local implementation commit.

Independent targeted suites passed: **85 API tests** and **174 web tests**. Additional probes reproduced the remaining F4 defect in the actual rendered components and demonstrated the corresponding page sequence using the actual service against disposable SQL Server. Passing the supplied regression cases does not disprove this uncovered interleaving.

Only this final review report was authored. No source/migration fixes, staging, commit, push, deployment or Production access was performed. The earlier independent report remains audit history.

### Scope and method

Read the applicable root/frontend instructions, the earlier independent report, implementation/remediation report, current API/Owner Portal documentation, actual changed API/web source and tests, browser results/script and relevant screenshots. The root README remains historically stale about the backend; the canonical product model and current implementation take precedence. Root Project-design-doc.md and implementation-plan.md are absent; the existing backend implementation plan had already been consulted in this chat.

Inspected the complete tracked Phase 2 diff against the checkpoint plus new source/test files, the additive migration, Designer, snapshot, root migration script and all six Consignment test adjustments. Relevant compiled source was verified against Portable PDB SHA-256 checksums: **32 documents matched, zero mismatches**, including the service, shared lock, PetService and relevant tests. Tests were run without rebuilding; web test cache was disabled. Additional component probes used the actual TypeScript components with controlled service responses; no probe source files were created. SQL probes used only the existing randomly named disposable MyPetLinkTest_* fixture databases and their cleanup.

## 2. F1–F6 final verification matrix

| Finding | Final assessment | Independent verification and boundary |
| --- | --- | --- |
| **F1 — request generation/pet scope** | **Resolved** | Original deferred response after switching to Pet B left exactly B's one row, one Done action and count 1. Stale rejection, rapid switching, refresh overtaking Show more and unmount also passed independent probes. |
| **F2 — completion attempt lifecycle** | **Resolved within the stated Planner lifetime** | Page owns the attempt and frozen request. Unknown Close/Review restores note, next date and key; another pet's independent save does not replace them. Retry used the same frozen object. Full-form link is absent while sending/unknown; an unsent draft requires a truthful discard decision. Edited replay is acknowledged without an unknown-outcome loop. Leaving/reloading the Planner still discards local recovery state, as the held banner explains. |
| **F3 — fingerprint encoding** | **Resolved** | Exact newline-boundary collision now produces different hashes and a 409 idempotency_key_conflict with one active completion. Normalization/Unicode/date/owner/target/edit cases in the focused suite passed. JSON encoding is explicitly versioned. Existing older fingerprints would need compatibility handling; fourteen inspected local databases are not proof of Production state. |
| **F4 — Planner/history pagination** | **Partially resolved; blocker remains** | Original 105-row deletion-shift, stable >500 rows and detectable total/day/duplicate disagreements pass. Equal-total membership change during a multi-page reread still yields five omitted pending rows, five stale rows, no More action and no changed-list warning. History reproduces the same shape. |
| **F5 — summary/page consistency** | **Resolved for the original finding** | A known row survives an earlier empty summary. Summary failure still shows rows without counts; category disagreement suppresses counts and warns; midnight disagreement retries; stable empty still works. F4 remains a separate multi-page membership problem, even when summary count/category checks pass. |
| **F6 — pet archive shares care lock** | **Resolved for ArchiveAsync versus the protected care operations** | Real SQL tests independently passed: archive waits behind the paused completion, reverse ordering refuses completion, and a 10-second lock wait fails without archiving. The shared helper/resource/transaction sequence was inspected. No guarantee is inferred for every other lifecycle or Lost Mode interleaving. |

## 3. Reproduced or disproved defects

### Remaining F4 — P2: equal-total membership churn is misclassified as a complete window

**References:** [CarePlanner.readWindow:447](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:447), [agreement predicate:483](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:483), [summary/category comparison:489](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:489), [conditional warning:563](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:563), [remaining calculation:631](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:631); [history reread:616](C:/Project/MyPetLink/apps/web/src/components/portal/RecordsManager.tsx:616), [history acceptance predicate:633](C:/Project/MyPetLink/apps/web/src/components/portal/RecordsManager.tsx:633), [history continuation UI:1146](C:/Project/MyPetLink/apps/web/src/components/portal/RecordsManager.tsx:1146).

The new reread checks equal totals, equal day, full page sizes, uniqueness and expected cardinality. These are useful inconsistency detectors. They do **not** establish that the returned IDs belonged to the same pending set. The summary adds category counts, not membership proof.

**Actual rendered Planner reproduction:**

1. Start with 150 due-soon items, A0…A149, with stable unique ordering.
2. Load the initial window, then grow to 100.
3. Grow to 150. During that whole-window read, page 1 returns A0…A99 and total 150.
4. Before page 2, remove the first five from pending and add five later due-soon items. Total remains 150; the reference day and category totals remain unchanged.
5. Page 2 at offset 100 returns A105…A149 plus the five new items.
6. The UI accepts 150 unique IDs, including stale A0…A4, and **omits still-pending A100…A104**.

Observed result:

| Check | Result |
| --- | --- |
| Current pending total | 150 |
| Displayed / unique IDs | 150 / 150 |
| Omitted current IDs | a-100, a-101, a-102, a-103, a-104 |
| Stale displayed IDs | a-0, a-1, a-2, a-3, a-4 |
| Group count shown | 150 |
| Show more present | No |
| Changed-list warning present | **No** |
| Refresh present | Yes |
| Conservative live-list/snapshot qualification in this rendered state | **No** |

A subsequent manual Refresh after changes stop restores the missing IDs. That is a recovery mechanism, not detection or a consistent-read guarantee.

**Actual SQL Server service evidence, not merely a mock-only scenario:**

Seeded 150 active due-soon targets in a disposable fixture database. Read page 1. On separate contexts, issued five ordinary **CompleteAsync requests with a next due date**. Each removes a target from pending and adds its completing record as the next pending item, so **each write naturally preserves the total**. Then read page 2 and a fresh reference window.

Observed: first total 150; second total 150; summary pending 150; unchanged reference day; every displayed item due-soon; 150 unique combined IDs; **five missing pending IDs and five stale IDs**. The database was dropped in finally. The API is correctly answering each individual request; the frontend inference across requests is wrong. The component probe above demonstrates how these response properties pass the current UI checks.

This can occur during routine recurring-care completion on another device. It does not require corrupt data, duplicated IDs, malicious responses, a clock error or an unusual transaction isolation setting.

**Actual rendered history reproduction:**

The corresponding 150-record history reread accepted 100 earlier rows plus 50 later rows after five removals/five insertions preserving total. It displayed 150 entries, omitted Visit 100…104 and retained stale Visit 0…4. **Show older records, Reload records and the changed-history warning were all absent.** History's reload action appears only after its weaker checks detect a disagreement.

**Impact:** the new pagination flow still silently exhausts while current care/history records are absent. It is not a duplicate-write or authorization defect. The failure directly contradicts the remediation report's “No silent end” answer. It remains an implementation acceptance blocker for this stated requirement, despite being bounded and recoverable by a fresh read.

**Narrow recommendation:** add regressions for the exact equal-total recurring-completion interleaving in both list implementations. Then either:
- establish membership stability with an appropriate server snapshot/change token or equivalent checked boundary; or
- explicitly adopt a best-effort live-list contract, give unconditionally conservative wording in multi-request/exhausted states, provide an always-available history reload as well as Planner Refresh, and obtain deliberate acceptance of possible omissions during concurrent change.

The present conditional warning does not provide that second boundary, because it is absent for this demonstrated case. This review does **not** require cursor pagination; cursors alone also would not make edited rows and independent requests a single snapshot. Update comments/docs that describe checked cardinality as “no gaps” or a complete agreeing read.

### Original defects independently disproved

**F1:** [generation ownership](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:124), cleanup invalidation, generation-scoped success/error/finally and selected-pet filtering now prevent the original contamination. Independent probe outputs after late success, late error and rapid switching were exactly one B row, one Done button, count 1, no stale alert and no loading button. When Refresh overtook Show more, the older response did not grow the newer 50-row window. After unmount, no rows/actions were applied.

**F2:** [page-owned send/attempt state](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:248), [close behavior](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:314), and [full-form switch guard](C:/Project/MyPetLink/apps/web/src/components/portal/care/CompleteCareDialog.tsx:222) resolve the original lost-key case. Independently entered an A note/next date, received an unknown outcome, closed, switched pets, saved B with a different note, then reviewed A. A's note/date were intact and retry reused the identical frozen request object/key. Full-form navigation was not offered in the unknown state. A replay whose current link had been edited produced the historical-acknowledgement message and closed the dialog. This probe mocked service outcomes; one-row SQL concurrency assertions and the supplied API-connected browser row-count result are separate database evidence.

Discard only removes the held local attempt; it sends no request. A later explicit Done/Save is a new operation/key, still subject to database fulfilment uniqueness. It is not silently submitted as a recovery write. Unmount invalidates settlement into the old component; no durable reload recovery is claimed. An unsent form may be discarded after an explicit warning that dates/notes do not transfer; it is not falsely described as a transfer.

**F3:** [fingerprint:916](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/CareRecordService.cs:916) now serializes a fixed JSON array beginning with care-completion-v1, followed by target, dates and normalized provider/notes. Independently repeated provider “Clinic + newline + Room”, notes “Note” versus provider “Clinic”, notes “Room + newline + Note”: first created, second **409 idempotency_key_conflict**, unequal hashes, one active completion. Null/empty/whitespace equivalence, trimming and Unicode/separator cases in the actual suite passed. Normalization is identical to persistence: Trim and empty-to-null, without Unicode normalization.

**F5:** independent actual-component probes showed: old empty summary/new row → row visible, warning, no counts; failed summary → row visible, no counts; category mismatch → row visible, warning, no counts; split Malaysia day → reread and settle on matching counts; stable true empty → no-records state. No earlier empty summary hid a known row. These controls do not repair the separate F4 equal-total membership issue.

**F6:** [shared helper](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Common/PetCareWriteLock.cs:22), [care delegation](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/CareRecordService.cs:945), [pet archive](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/PetService.cs:389), and [real SQL interleaving test](C:/Project/MyPetLink/apps/api/MyPetLink.Api.Tests/Relational/CareCompletionCommandRelationalTests.cs:193) now coordinate the original race. Independently rerun SQL assertions confirm the archive is still pending and the pet Active while completion is paused, then completion commits before archive and exactly one completing record remains.

## 4. Idempotency and concurrency verdict

**The completion command's reviewed safety mechanisms are acceptable.** No unintended duplicate active linked completion was demonstrated in the focused cases.

The durable global unique key index and existing unique fulfilment index remain. The command uses the JWT subject, revalidates ownership/state, derives the pet from the target and creates the existing private care-record model. Same-key same-request replay, replay after edit, different payload/target/owner conflict, removed completion refusal, concurrent identical/different keys, full-form-versus-command and timeout/replay tests passed. The revised frontend parser accepts a replayed record's edited link while keeping the created-result link check strict.

The versioned fingerprint is unambiguous for normalized values. It is still stored as a 64-character hash; an internal version tag is not an automatic compatibility shim for pre-existing old hashes. Given the stated never-deployed state, no shim is currently demonstrated necessary for a local commit. Before any release, verify whether any target environment has keyed rows from the earlier newline encoding; if it does, define/test compatibility rather than invalidating valid unresolved requests. The report of fourteen local databases with no columns does not establish Production state.

PetCareWriteLock creates the execution strategy outside its delegate, starts the READ COMMITTED transaction inside, acquires the parameterized transaction-owned application lock using exactly care-write:{petId:N}, validates/writes and commits. PetService.ArchiveAsync and all four care writes use that helper. Archive ownership is checked before acquiring the lock and loaded again inside. The archive's prior lifecycle, ArchivedAt and LostModeEnabled=false assignments are retained. The inspected call paths do not nest the helper or take a second pet application lock.

On execution-strategy retry the tracker is cleared and entities are reloaded. Transaction disposal rolls back exceptions and releases the application lock. The independent SQL timeout test verifies no archive on lock failure and successful archive after the holder is released. It does not inject every post-mutation SQL failure or ambiguous commit. The completion key protects command replay; it should not be generalized to durable exactly-once behavior for generic unkeyed Create.

The comment that this is “the only lock” should be read as the added application-lock scheme: SQL row/range locks and SERIALIZABLE summary reads still exist. No broad claim that deadlocks are impossible is justified. Ordinary transient SQL exceptions are retried; negative application-lock returns become the existing 503 care_write_busy response.

Other lifecycle transitions were inspected at the relevant boundaries: Memorial still permits historical care writing and Restore reactivates; no hard-delete path was added. This review does not certify arbitrary concurrent Memorial/Restore/Lost Mode combinations. The specifically disputed Archive/Completion ordering is fixed.

## 5. Planner/history consistency assessment

The new design improves the original behavior:
- Show more rereads the loaded window rather than appending to stale offsets.
- The original 105-item case now needs one 100-row page after the five removals and includes the formerly skipped rows.
- Stable 520-row coverage works.
- Different totals/days, duplicate IDs and short pages can trigger rereads/warnings.
- Known rows survive summary failure/disagreement, and there is always a Planner Refresh action.
- History totals are adjusted after ordinary local create/archive, and date changes are reflected on the next successful window read.

However, equal metadata and unique cardinality do not prove stable membership. F4's undisclosed exhausted result remains. Refresh alone is not an adequate conservative boundary **as currently presented**: the owner has no warning to use it in that state, exact-looking category totals still display, and history loses its reload action entirely. A stable list after manual refresh is not proof that the previous exhausted list was complete.

Pure rescheduling of an unchanged set can create duplicates that these checks detect, or stale values/order that they do not. A full unique result of exactly the unchanged set's cardinality covers its IDs; that observation does not apply once completions/insertions/deletions change membership. The real SQL probe specifically covers that missing condition. No universal omission-free guarantee is inferred from tests that mutate data only before the whole-window reread begins.

Malaysia reference-date disagreements trigger retry/conservative display; a visible page left across midnight still needs Refresh/focus/action to update. This remains an explicit freshness boundary, not a reminder feature.

### Reread cost

For a shown window of n rows, a stable Planner read makes one summary request plus approximately ceil(n/100) sequential list requests, while the UI grows by 50. Loading 520 stable rows from the initial 50 through the final 550-sized requested window takes **36 list requests plus 11 summary requests**, before focus refreshes or retries. A persistently disagreeing read can repeat up to three times. History similarly rereads pages 1…k on every growth.

This is a quadratic cumulative request pattern as the explored list grows, not a one-request-per-added-page design. It may be acceptable at MVP sizes, but it increases latency, server queries and owner-wide summary work. No Azure throughput/latency measurement was performed. Consider retaining the bounded strategy or a more efficient consistency mechanism according to measured usage; theoretical cursor preference alone is not a reason to expand scope.

## 6. Test evidence assessment

### Independently executed in this corrective review

| Check | Result |
| --- | --- |
| Focused API: completion command, command SQL, interleaving SQL, upcoming HTTP, identity/fulfilment and Smart Tag limiter | **85 passed, zero failed/skipped**, about 83 seconds. Includes all 14 command relational cases, all 10 interleaving cases and all 8 limiter cases. |
| Focused web: all care component tests, history, completion client, DashboardClient, full Log as done, document recovery and save lifecycle | **174 passed across 11 files**, no failures, cache disabled. |
| F1 independent actual-component probes | Late success, late rejection, rapid filters, Refresh overtaking and unmount passed. |
| F2 independent actual-component probe | Unknown Close/review across another pet's save retained exact frozen request; edited replay acknowledged. |
| F3 actual compiled service probe | Original collision refused with 409; one active completion. |
| F4 actual components and actual SQL service | Remaining defect reproduced as detailed above. Manual stable Planner Refresh recovered coverage. |
| F5 independent actual-component probes | All five described summary/error/day/empty controls passed. |
| Relevant source/PDB comparison | 32 matching source checksums, zero mismatches. |
| Tracked diff whitespace check | Passed. |

The additional SQL probe was run after the focused API process completed; no separate database-heavy runs overlapped. The existing test runner can still run test classes concurrently within one process. All throwaway fixture databases used by the independent probe were disposed.

The new tests provide real fix coverage, but their F4 cases mainly change the collection **before** the longer read or force unequal page totals. They do not cover equal-total membership changes **between** page 1 and page 2. Their names and pass count therefore cannot establish the stronger “no silent end” guarantee.

The author reports 43 regression cases and 26 pre-fix failures. The described 43 includes three pre-existing history cases; the reported full-suite increases are **29 web + 11 API = 40 new cases**. This accounting distinction is not an implementation blocker. Raw failing-first/negative-control execution output was not found in this evidence directory, so the historical 26-failure assertion is attributed to the author rather than independently certified. No protection was removed from source to recreate a negative control.

### Supplied full-suite/browser evidence

The remediation report states:
- Full web: **4,691 passed, 7 skipped**.
- Full API: **3,078 passed, 1 failed**, no skips.
- Browser: **12/12 checks**.
- Typecheck, lint and production build: passed.

The actual browser JSON contains 12 successful entries, and the script implements held/dropped real-network responses and SQL-backed record counts. Its F2 retained-key retry reports two POSTs, one completion. These are supplied browser results, not an independently rerun browser session. Full-suite/build raw logs are not included in the Phase 2 directory; their totals are attributed to the implementation report. No unnecessary full-suite/build rerun was performed.

Inspected actual remediation screenshots at tablet/mobile/desktop boundaries, including the 768px dialog, 390px end-of-list and explicit full-form discard confirmation. They support clear wrapping, reachable controls, retained branding and mobile bottom clearance. The browser script's bottom-bar locator falls back to viewport height when it finds no qualifying nav, which happened in the supplied metrics. Its “clearance ok” assertion alone is not independent evidence of the bar position; the screenshots are the relevant visual evidence. Software-keyboard behavior remains candidate smoke work.

### Historical Smart Tag failure

The latest reported failure is Activation_UsesIndependentAuthenticatedUserPartitions, expected 429 but received the normal 404. The test uses two sequential activation requests and expects a third to hit a two-per-five-second real-time window. Fixed-window replenishment can legitimately permit the third request if scheduling crosses a boundary.

The earlier review established the same timing-sensitive family in retained pre-Phase-2 raw results, including [17 October 429/200 failure evidence](C:/Project/MyPetLink/artifacts/consignment-final-verification/api-full-suite.trx:1844). There is no Phase 2 diff to the Smart Tag limiter, its test, Program or tag production behavior. All eight limiter cases passed in the independent focused run. Timing is the supported failure classification; the exact latest window crossing is an inference without per-request timings.

**Do not report the full API suite as green.** The historical limiter failure does not independently block this local Phase 2 commit; handle test determinism separately and do not change production rate limits to make the assertion pass.

## 7. Migration and rollback assessment

The remediation adds **no second migration**. The Phase 2 delta remains:
- nullable uniqueidentifier CompletionIdempotencyKey;
- nullable nvarchar(64) CompletionRequestFingerprint;
- a global unique filtered index for non-null keys.

The existing fulfilment unique index is unchanged. The [migration](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Migrations/20261020181228_AddCareCompletionIdempotency.cs:13), Designer, DbContext mapping and snapshot agree. The [root migration.sql addition](C:/Project/MyPetLink/migration.sql:13777) is still 43 additive, migration-history-guarded lines; no previous script content or unrelated schema change is in the diff. Existing rows remain NULL, with no backfill.

All six Consignment test diffs still only adjust exact pending migration expectations to include the later care migration. Existing blocked-rollback error and protected-history assertions remain. They correctly account for migration-by-migration rollback before an earlier guard refuses; they do not weaken that guard. Those unchanged migration/rollback behaviors were independently exercised by seven focused passing tests in the previous review; they were not unnecessarily repeated here.

An old API can run against the additive schema. The new API needs the migration first. Down drops the index/columns, preserves care events/links but destroys replay identity. Prefer application rollback with the additive schema left in place; do not drop columns while newer API/open clients may still need them. Eventual release order is verified schema upgrade, API, web; rollback web before API while accounting for cached/open newer clients.

Actual Production schema, migration history and any old-format keyed records were **not queried**. The fourteen-local-database claim must not substitute for that pre-release verification. These operational checks do not by themselves prevent committing the local implementation.

## 8. Exact Phase 2 commit manifest and exclusions

**This is an inspected scope manifest, not approval to commit the currently failing candidate.** After the remaining F4 correction and focused verification, update this manifest for any additional explicit test/source paths before committing.

There are **41 current implementation/test/contract/migration files** over the checkpoint: 23 runtime/schema files, 16 test files and two product/API documents. Entries below are literal paths relative to C:\Project\MyPetLink; do not replace the list with parent-directory staging.

```
apps/api/MyPetLink.Api.Tests/CareCompletionCommandTests.cs
apps/api/MyPetLink.Api.Tests/CareRecordUpcomingHttpTests.cs
apps/api/MyPetLink.Api.Tests/Relational/CareCompletionCommandRelationalTests.cs
apps/api/MyPetLink.Api.Tests/Relational/CareCompletionInterleavingRelationalTests.cs
apps/api/MyPetLink.Api.Tests/Relational/ConsignmentAgreementDocumentRelationalTests.cs
apps/api/MyPetLink.Api.Tests/Relational/ConsignmentReferenceAndDefaultTermsRelationalTests.cs
apps/api/MyPetLink.Api.Tests/Relational/ConsignmentSalesFinalRemediationRelationalTests.cs
apps/api/MyPetLink.Api.Tests/Relational/ConsignmentSalesMigrationRelationalTests.cs
apps/api/MyPetLink.Api.Tests/Relational/ConsignmentStocktakeRelationalTests.cs
apps/api/MyPetLink.Api.Tests/Relational/ConsignmentStocktakeRemediationRelationalTests.cs
apps/api/MyPetLink.Api/Common/PetCareWriteLock.cs
apps/api/MyPetLink.Api/Controllers/CareRecordsController.cs
apps/api/MyPetLink.Api/Data/MyPetLinkDbContext.cs
apps/api/MyPetLink.Api/DTOs/MemoryCareDtos.cs
apps/api/MyPetLink.Api/Entities/CareMediaEntities.cs
apps/api/MyPetLink.Api/Migrations/20261020181228_AddCareCompletionIdempotency.cs
apps/api/MyPetLink.Api/Migrations/20261020181228_AddCareCompletionIdempotency.Designer.cs
apps/api/MyPetLink.Api/Migrations/MyPetLinkDbContextModelSnapshot.cs
apps/api/MyPetLink.Api/Services/CareRecordService.cs
apps/api/MyPetLink.Api/Services/PetService.cs
apps/api/MyPetLink.Api/Services/ServiceContracts.cs
apps/web/docs/OWNER_PORTAL_FLOW.md
apps/web/src/app/records/page.tsx
apps/web/src/components/portal/care/CareHome.test.tsx
apps/web/src/components/portal/care/CareHome.tsx
apps/web/src/components/portal/care/CarePlanner.consistency.test.tsx
apps/web/src/components/portal/care/CarePlanner.test.tsx
apps/web/src/components/portal/care/CarePlanner.tsx
apps/web/src/components/portal/care/CompleteCareDialog.tsx
apps/web/src/components/portal/care/CompleteCareFlow.test.tsx
apps/web/src/components/portal/dashboard/DashboardCareSection.tsx
apps/web/src/components/portal/RecordsManager.history.test.tsx
apps/web/src/components/portal/RecordsManager.tsx
apps/web/src/lib/careContracts.ts
apps/web/src/lib/routes.ts
apps/web/src/services/apiDtos.ts
apps/web/src/services/recordService.completion.test.ts
apps/web/src/services/recordService.ts
apps/web/src/types.ts
docs/api/api-contract-v1-draft.md
migration.sql
```

The **29 Phase 2 review/evidence files**, including this report, may accompany a local development commit as an audit bundle. They must not be packaged into the public site/API application. The earlier report records the earlier NO-GO and should remain unchanged as history.

```
artifacts/care-planner-phase2/e2e-care-planner-results.json
artifacts/care-planner-phase2/e2e-care-planner.mjs
artifacts/care-planner-phase2/e2e-care-remediation-results.json
artifacts/care-planner-phase2/e2e-care-remediation.mjs
artifacts/care-planner-phase2/final-independent-review.md
artifacts/care-planner-phase2/implementation-report.md
artifacts/care-planner-phase2/independent-review.md
artifacts/care-planner-phase2/screenshots/p2-01-planner-1280.png
artifacts/care-planner-phase2/screenshots/p2-02-done-dialog-1280.png
artifacts/care-planner-phase2/screenshots/p2-03-done-success-1280.png
artifacts/care-planner-phase2/screenshots/p2-04-unknown-1280.png
artifacts/care-planner-phase2/screenshots/p2-05-already-done-1280.png
artifacts/care-planner-phase2/screenshots/p2-06-planner-390.png
artifacts/care-planner-phase2/screenshots/p2-07-done-dialog-390.png
artifacts/care-planner-phase2/screenshots/remediation/r-01-saving-link-disabled-1280.png
artifacts/care-planner-phase2/screenshots/remediation/r-02-held-banner-1280.png
artifacts/care-planner-phase2/screenshots/remediation/r-03-full-form-confirm-1280.png
artifacts/care-planner-phase2/screenshots/remediation/r-ux-dialog-1280.png
artifacts/care-planner-phase2/screenshots/remediation/r-ux-dialog-320.png
artifacts/care-planner-phase2/screenshots/remediation/r-ux-dialog-390.png
artifacts/care-planner-phase2/screenshots/remediation/r-ux-dialog-768.png
artifacts/care-planner-phase2/screenshots/remediation/r-ux-planner-1280-end.png
artifacts/care-planner-phase2/screenshots/remediation/r-ux-planner-1280.png
artifacts/care-planner-phase2/screenshots/remediation/r-ux-planner-320-end.png
artifacts/care-planner-phase2/screenshots/remediation/r-ux-planner-320.png
artifacts/care-planner-phase2/screenshots/remediation/r-ux-planner-390-end.png
artifacts/care-planner-phase2/screenshots/remediation/r-ux-planner-390.png
artifacts/care-planner-phase2/screenshots/remediation/r-ux-planner-768-end.png
artifacts/care-planner-phase2/screenshots/remediation/r-ux-planner-768.png
```

No unintended tracked workstream, dependency, deployment configuration or Smart Tag runtime modification was found in this Phase 2 diff. Exclude everything outside the literal manifest unless separately reviewed and deliberately added:
- bin/obj, .next/out/node_modules, caches and other generated outputs;
- copied source/baseline/release-isolation trees, publish directories/archives, old bundles, raw unrelated logs/TRX, patches and rendered marketing output;
- unrelated Consignment/Merchant/Marketing/Community/Smart Tag artifacts and all other artifact trees;
- TagOrder, physical-qa-release.patch, temporary files, private signing material, secrets and local connection/configuration dumps;
- any later log/build output or local settings change not on the manifest.

The shared PetService delta belongs to this phase because it closes F6; existing unrelated pet functionality must remain. The six Consignment test files belong only for the new migration expectation adjustment. Do not stage the entire workspace or artifact directory. No staging was performed.

## 9. Remaining risks and operational checks

| Item | Classification / effect on local commit |
| --- | --- |
| Undetected same-total multi-page omissions in F4 | **Reproduced implementation blocker** for the current acceptance requirement. |
| Page-scoped held completion state | Explicit MVP boundary; close/review retained, leave/reload loses local copy and does not cancel the write. |
| Foreground Malaysia midnight freshness | Refresh/focus/action boundary remains; confirm intended behavior during candidate smoke. |
| Fingerprint rollout | Verify target environments before deployment; handle old hashes if any exist. Local database observations do not prove Production state. |
| Real owner authentication and private R2 attachments | Required non-production candidate smoke; not a reason by itself to reject a local source commit. |
| Azure SQL lock/summary latency, blocking, retries and timeout rate | Unmeasured operational check. Same-pet serialization and whole-window rereads add work; no production-scale claim. |
| Actual Production schema/history/drift and backups | Pre-migration release requirement; no Production access or migration performed here. |
| Release packaging and API/web compatibility | Build from a precise immutable candidate, retain the schema/API/web order and rollback plan. No existing mixed output is approved for deployment. |
| Undo, same-gap suggestions, automated reminders, Weekly Recap | Remain intentionally deferred; ordinary explicit care edits/archive stay available. |
| Feature flag for Planner-first /records | Separate product/rollout decision; no flag is required solely for local commit, and a flag would not repair F4. |
| Historical Smart Tag timing failure | Known test reliability issue; preserve non-green full-suite reporting and address separately. |

The approved Phase 1 Dashboard was not redesigned or re-audited in full. Focused existing Dashboard/full-editor/document-recovery tests passed; Lost Mode, recent Moments, sharing/privacy and plan boundaries were not expanded by this corrective review.

## 10. Final recommendation

**NO-GO — Reproduced implementation blocker remains.**

Five findings are resolved in their reviewed scope. **F4 is not safely resolved as claimed**, even though its exact original 105-item reproducer now passes. The remaining case is practical: a normal completion with a next due date preserves totals and defeats the current checks, leaving pending care absent from an apparently exhausted list. The same inference fails in history.

Make the narrow F4 consistency/qualification correction, add the equal-total between-page regressions for Planner and history, and recheck only the affected boundaries. An explicitly accepted best-effort live-list contract is an available MVP option; it must be represented truthfully in the actual rendered exhausted states, not only in documentation or conditional warnings that this case never triggers. A cursor redesign, Dashboard redesign or unrelated Smart Tag production change is not required.

**Are F1–F6 safely resolved and is Phase 2 ready for direct commit to local main? No: F1/F2/F3/F5 and the specific F6 race pass, but F4 remains.** This is not deployment authorization. Review ends here.

Preservation verified: all **69 pre-existing reviewed source, test, migration, documentation and Phase 2 evidence files** retained identical SHA-256 hashes across this review. The final report is excluded from that comparison. HEAD remains 36fbb67ae8636c3145368390f800e447088df29d, branch main, staging empty. Only this final report was authored; the previous review and existing artifacts remain unchanged. No Production data/schema access, source fixes or Git mutations were performed.

