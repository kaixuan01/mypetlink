# Phase 2 Smart Care Planner — Final Commit Approval

Reviewed 21 October 2026 (UTC+8). Project: C:\Project\MyPetLink. Branch main, HEAD 36fbb67ae8636c3145368390f800e447088df29d. Phase 2 remains uncommitted.

## 1. Final verdict

**GO — Phase 2 accepted and ready for direct local main commit.**

**Yes. Phase 2 Smart Care Planner is ready to commit directly to local main under the explicitly approved Best-effort Live List MVP contract.**

The remaining F4 acceptance blocker is resolved by truthful presentation and accessible recovery controls, rather than by a new snapshot guarantee. Temporary stale or omitted records during concurrent changes remain possible and are now an explicitly accepted limitation. The exact equal-total reproducer still produces mixed membership, but the exhausted Planner/history lists retain their freshness qualification and Refresh/Reload actions. A stable refresh recovers the current rows.

No new implementation blocker was independently reproduced within this focused acceptance scope. F1, F2, F3, F5 and the specific F6 archive race retain their prior reviewed acceptance; the final correction does not change API implementation or schema.

This approves the **local commit of the exact reviewed scope in Section 8**. It does not authorize staging/committing during this review, pushing, executing migrations, using Production/R2, or deployment. Only this approval report was authored.

## 2. Exact F4 reproducer verification

Reviewed the previous final independent review, final F4 implementation report, actual source/tests, browser script/results and screenshots. Additional probes exercised the actual rendered React components with controlled service responses; they were not string-only or helper-only checks. No test/probe source file was created.

The previous review already reproduced this response sequence against real disposable SQL Server using ordinary completions with next due dates. That API behavior is unchanged, so the SQL workload was not repeated. The supplied final API-connected browser run independently records the real five-completion case under the new UI.

### Planner: 150 pending items, unchanged total/day/categories

Loaded 50, then 100 rows. During the final whole-window read, page 1 returned the first 100 of the original 150. Before page 2, five earlier targets left pending and five later next-due rows entered it. Total remained 150, the Malaysia reference day was unchanged, and all rows remained due-soon.

Independent rendered result:

| Check | Observed |
| --- | --- |
| Displayed/current pending total | 150 / 150 |
| Temporary stale rows / omitted current rows | 5 / 5 — permitted by the approved contract |
| Neutral freshness note | **Visible:** “Care dates may change while you're browsing. Refresh to check the latest list.” |
| Top Refresh / Refresh the list | **Both accessible** |
| Show more | Exhausted; freshness note and controls remain |
| Exact-looking group counts | **Absent** |
| False no-records/no-pending message | **Absent** |
| Strong detected-change warning | Absent, appropriately: this equal-total case is not detected |
| Stable Refresh the list | Pages 1 and 2 reread; all 150 current rows, zero stale/omitted IDs |
| Freshness qualification after refresh | Remains visible; refresh does not claim to stop later changes |

The previously omitted a-100…a-104 and stale a-0…a-4 still establish that no snapshot was added. Their temporary presence/absence is no longer presented as a verified complete result.

Also independently held an old all-pets Show more response, selected Oyen and completed its newer read, then released the old response. Only Oyen's one row and one Done action remained, with count 1 and no stale alert. F1 scope rejection is preserved.

### History: equivalent 150-row membership churn

The rendered history combined the older first page and shifted second page into 150 rows with five stale/five missing records. With Show older records exhausted, it now retained:

- “Records may change while you browse. Reload to check again.”
- An accessible **Reload records** action.

A stable Reload reread exactly pages 1 and 2, recovered all 150 current records and retained the longer window. A separately held old-pet Reload was released after a newer pet's initial load completed: the new pet's one record remained, with zero old-pet rows. An initial single-page history showed neither the multi-page note nor Reload control.

## 3. Planner freshness and Refresh findings

Relevant source: [window metadata](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:33), [page request counting](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:458), [single-request count gate](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:637), [persistent multi-page qualification](C:/Project/MyPetLink/apps/web/src/components/portal/care/CarePlanner.tsx:685).

The implementation records the number of list page requests actually made. A multi-page result without a detected disagreement receives the neutral note and its own Refresh the list button independently of the More button. The existing top Refresh remains available. Group counts are shown only for a single-request list whose summary agrees; multi-page counts are suppressed.

A detected disagreement still produces the distinct stronger message: **“Some care dates changed while loading. Refresh to check again.”** The Planner retries up to three times before showing that state. This differs clearly from ordinary live-list freshness wording.

The known-row/empty-state protection from F5 remains. The accepted live-list limitation is not used to hide known rows behind an earlier empty summary. Stale requests remain generation/scope checked, and actual Done requests continue to be validated independently by the unchanged server.

Current [Owner Portal documentation](C:/Project/MyPetLink/apps/web/docs/OWNER_PORTAL_FLOW.md:333) and [API paging contract](C:/Project/MyPetLink/docs/api/api-contract-v1-draft.md:743) explicitly deny a cross-request snapshot guarantee and describe partial detection. The source's surrounding comments do the same. Names such as pagesAgree/consistent and “gap” shorthand describe metadata checks, not proof of stable membership; the active explanatory text expressly rejects that inference.

The implementation report's earlier stronger F4 claims are marked superseded, with the final section explicitly stating that equal totals, days, full pages and unique IDs do not prove complete membership. Earlier independent NO-GO reports remain valid audit history for earlier bytes and the earlier acceptance boundary. No active snapshot/completeness guarantee is approved by this report.

## 4. History Reload findings

Relevant source: [shared generation-scoped history reader](C:/Project/MyPetLink/apps/web/src/components/portal/RecordsManager.tsx:617), [same-window Reload](C:/Project/MyPetLink/apps/web/src/components/portal/RecordsManager.tsx:659), [persistent multi-page controls](C:/Project/MyPetLink/apps/web/src/components/portal/RecordsManager.tsx:1156).

Show older records grows the requested window; Reload records rereads the current window, with the pending longer window offered after a detected growth disagreement. It replaces the displayed records instead of appending stale offsets. The neutral note/control is independent of whether older records remain. Detected changes retain the stronger warning and Reload action.

Independent checks confirmed an exhausted two-page history can be refreshed without collapsing to page 1, and that a retired old-pet response cannot replace a newer loaded pet's history. Initial single-page history remains uncluttered.

The common generation guard ignores superseded settlements. The tested controls disable overlapping history read actions while loading. This is not a guarantee of snapshot membership; it is an accepted best-effort list with a usable reload.

## 5. Regression evidence

### Independently verified in this acceptance review

| Check | Result |
| --- | --- |
| Focused web suites: care components, history, completion client, DashboardClient, full Log as done, document recovery and save lifecycle | **179 passed across 11 files**, no failures; cache disabled |
| Equal-total Planner and history component probes | Accepted freshness/control behavior verified, including exhausted lists and stable refresh recovery |
| Stale Planner/pet-history responses | Rejected after the newer scope/read completed |
| Initial single-page history | No unnecessary freshness/reload controls |
| 520-row Planner probe | All 520 rows reachable; qualification visible, group counts suppressed |
| Persistent-disagreement probe | Three attempts then stronger warning; no self-refresh loop |
| Relevant API/test source versus Portable PDB checksums | **32 matching documents, zero mismatches** |
| Exact implementation manifest comparison with previous review | Same **41 paths**, no additions/removals |
| Tracked diff whitespace check | Passed |

The 179 tests include the new final F4 cases and existing F1/F2/F5, full-editor and recovery regressions. Additional actual-component probes repeated the uncovered membership interleaving rather than merely trusting the new test names.

The previous corrective review independently ran **85 API tests**, including real SQL same/different-key races, all 14 command relational cases, the shared pet-archive ordering/timeout checks and all eight Smart Tag limiter cases. This final correction changes web list behavior, tests and documentation only. The inspected API/EF/lock implementation is unchanged; the 32 relevant source checksum matches support continued applicability of that evidence. No API/SQL suite or Production migration was rerun here.

### Supplied evidence, correctly attributed

The final implementation report states **281/281 focused tests**, **4,696 web tests passed / 7 skipped**, **8/8 browser checks**, and passing typecheck, lint and production build. The actual final browser JSON has eight successful entries. The script injects real equal-total churn via the completion API, checks stable refresh against current API rows, and exercises refresh/reload by keyboard. It records 150 displayed rows with five stale rows, with qualification and no counts.

Inspected actual final screenshots, including the churn view and mobile Planner/history end states. The note/button remain visible at the end and fit above the mobile bottom navigation; supplied 320/390/768/1280 results report no sideways overflow. These are retained browser/visual evidence, not a new independent browser run. Full-suite/build raw logs and failing-first output are not in this Phase 2 directory; their totals and “failed before” history remain attributed to the author. A full build was not repeated during this read-only review.

**The previous full API result remains 3,078 passed / 1 failed. It is not green.** The recorded failure is the historical timing-sensitive Smart Tag limiter test. The prior review established pre-Phase-2 failures in that test family and isolated passes, and no Smart Tag production/test behavior changed in this correction. Its test reliability work remains separate; no limiter setting was weakened.

## 6. Remaining accepted MVP limitations

The user explicitly approved these boundaries for local Phase 2 acceptance:

- Separate page requests may include stale rows or omit current records during concurrent changes; equal totals and unique IDs do not rule that out.
- An exhausted More button is not evidence that every current item is present.
- Refresh/Reload requests another live window; it does not prevent a later write or guarantee a stable snapshot during that refresh.
- Exact-looking group counts are omitted for multi-page Planner results. Detectable disagreements receive a stronger warning than ordinary freshness.
- A page left open can become stale, including across Malaysia midnight, until focus/visibility/action/explicit refresh causes another read. No polling or reminders were added.
- Unresolved completion attempts survive permitted dialog close/reopen on the Planner, but leaving/reloading loses local recovery state and does not cancel a sent write, as the held banner explains.
- The server independently authorizes and validates each completion, using durable request identity, fulfilment uniqueness and the shared per-pet lock. Best-effort display does not weaken those write rules.
- Undo, same-gap suggestions, automated reminders and Weekly Pet Recap remain deferred; ordinary explicit edits/archive remain available.

F4 is accepted under this approved product decision, **not** declared mathematically omission-free. No cursor pagination or HTTP-spanning snapshot isolation is required for this acceptance.

## 7. Performance considerations

Whole-window rereads remain bounded but grow with the explored window. Independent rendered probe results matched the documented cost:

| Scenario | Observed request cost |
| --- | --- |
| Grow a stable Planner from 50 shown to all 520 rows, in 50-row increments | **36 list requests + 11 summary requests** |
| Initial 50, then 100, then a 150-row window whose page metadata persistently disagrees | **8 list + 5 summary requests total**; the final growth used exactly three attempts |
| Stable history Reload of the exhausted 150-row window | Exactly pages **1 and 2**; no collapse to the first page |

The persistent-disagreement probe settled with the stronger warning and accessible Refresh. No spontaneous continuing requests were observed. Retry count and page-loop bounds are finite. There is no polling/effect loop introduced by pagesRead or the freshness controls.

A stale in-flight window may finish some already-started bounded page work before the outer generation check discards it; no claim of cancellation or zero redundant requests is made. Multiple explicit user refreshes or focus/visibility events can also create extra bounded reads. No harmful unbounded behavior was reproduced.

Cumulative request work grows approximately quadratically as an owner repeatedly expands a large window. The 520-row UI remained usable in targeted tests, but this is not an Azure SQL throughput or latency benchmark. Measure real candidate latency, summary blocking, same-pet contention, retries and care_write_busy rates during Production Release Preparation. Those measurements are not a new local-commit blocker.

## 8. Exact Phase 2 commit manifest

**Approved implementation scope: 41 files**, identical in paths to the previous reviewed implementation manifest. The final F4 correction updates existing source/test/document paths; it adds no new implementation path, dependency or migration.

This includes 23 runtime/schema files, 16 tests and two API/product documents. Literal entries below are relative to C:\Project\MyPetLink. Stage only reviewed literal paths in the later commit operation, not parent folders or the entire workspace.

Implementation content fingerprint: **e436b393f6ebc4146d099865af816afcf7ddb3e32c92effc60d7da08408be012**. Computed over the 41 paths in the exact manifest order below, hashing UTF-8 entries of path + NUL + lowercase file SHA-256 + LF. This identifies the accepted implementation bytes; it is not a commit or deployment identity.

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

**Approved Phase 2 audit/evidence bundle: 42 files**, including this report. Keep earlier reports unchanged as history. These may accompany the local development commit but must not be included in the published web/API application.

```
artifacts/care-planner-phase2/e2e-care-f4-final-results.json
artifacts/care-planner-phase2/e2e-care-f4-final.mjs
artifacts/care-planner-phase2/e2e-care-planner-results.json
artifacts/care-planner-phase2/e2e-care-planner.mjs
artifacts/care-planner-phase2/e2e-care-remediation-results.json
artifacts/care-planner-phase2/e2e-care-remediation.mjs
artifacts/care-planner-phase2/final-commit-approval.md
artifacts/care-planner-phase2/final-independent-review.md
artifacts/care-planner-phase2/implementation-report.md
artifacts/care-planner-phase2/independent-review.md
artifacts/care-planner-phase2/screenshots/f4-final/f4-history-1280.png
artifacts/care-planner-phase2/screenshots/f4-final/f4-history-end-1280.png
artifacts/care-planner-phase2/screenshots/f4-final/f4-history-end-320.png
artifacts/care-planner-phase2/screenshots/f4-final/f4-history-end-390.png
artifacts/care-planner-phase2/screenshots/f4-final/f4-history-end-768.png
artifacts/care-planner-phase2/screenshots/f4-final/f4-planner-churn-1280.png
artifacts/care-planner-phase2/screenshots/f4-final/f4-planner-end-1280.png
artifacts/care-planner-phase2/screenshots/f4-final/f4-planner-end-320.png
artifacts/care-planner-phase2/screenshots/f4-final/f4-planner-end-390.png
artifacts/care-planner-phase2/screenshots/f4-final/f4-planner-end-768.png
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

The combined reviewed manifest is **83 files**. The added final evidence consists of the F4 browser script/results, ten F4 screenshots and this approval report.

### API and migration consistency within the manifest

The completion endpoint/DTO/entity/service, versioned normalized fingerprint, shared PetCareWriteLock, PetService archive coordination, frontend contract/client and tests remain included. No unrelated API implementation delta was introduced by the final F4 correction.

The migration still adds only nullable CompletionIdempotencyKey and CompletionRequestFingerprint plus the unique non-null key index. Mapping, Designer and snapshot agree; the root migration.sql delta is still the same 43 additive guarded lines, and the snapshot delta is the same 11 lines. Existing fulfilment uniqueness remains. No migration was generated or changed in this review.

The six Consignment test-file deltas retain their prior narrow migration-list adjustments and protected-history/blocked-rollback assertions. Their inclusion is for this new migration's position in the rollback chain, not a Consignment implementation change. The earlier seven passing focused migration/rollback tests remain the applicable evidence.

No dependency, secret/configuration, unrelated workstream, public tag routing or deployment file is part of this implementation delta. The browser scripts reference disposable signing-key files at runtime; those key files or values are not in this manifest. No real credential or local environment dump was found in the reviewed commit scope.

## 9. Excluded local files

Everything outside the literal 83-file manifest is excluded unless separately reviewed and deliberately authorized. In particular:

- node_modules, .next, out, bin, obj, caches and generated build/publish outputs.
- Copied baseline/source/release-isolation trees, API publish directories and old release bundles.
- ZIP/TAR archives, old patch exports, unrelated raw logs/TRX, screenshots or prior workstream artifacts.
- Other artifact trees, including Consignment, Merchant, B2B, Solo, Community, Smart Tag and production-release bundles.
- TagOrder, physical-qa-release.patch, rendered marketing output, Python caches and temporary probe files.
- .claude/local environment settings, private signing-key files, credentials, connection strings, environment dumps and storage/auth material.
- Any new test/build output produced after this review that is not on the literal manifest.

Do not use blanket staging or stage the whole Phase 2 directory as a substitute for the evidence list. No staging/commit was performed in this review. The thousands of deliberately excluded local files remain in place.

## 10. Production preparation requirements

These remain required before release, independently of this **GO for local commit**:

1. Build/package an immutable candidate from the precise accepted commit and approved flags/API base; exclude audit artifacts and all mixed local build outputs.
2. Complete real supported owner authentication and non-production private R2 attachment smoke, including the unchanged full Log as done flow.
3. Measure Azure SQL locking, latency, summary/read load, concurrent same-pet writes, retries and timeouts.
4. Verify actual Production schema/migration history/drift and backups. Fourteen inspected local databases without the columns are not proof of Production state. Check for any earlier-format keyed records before a fingerprint rollout.
5. Apply the additive care migration before the API, then deploy the compatible web only after separate release authorization. Account for other unapplied migrations if Production is behind the consolidated repository baseline.
6. Retain tested rollback artifacts: web before API, account for open/cached newer clients, and prefer leaving additive columns/keys in place. Down preserves care events but destroys replay identity; do not drop columns while active clients/API depend on them.
7. Retain truthful full-suite reporting and address the known Smart Tag timing-sensitive test separately. Undo, reminders and Weekly Recap remain deferred.

**Final answer: Yes — Phase 2 Smart Care Planner is accepted and ready for direct commit to local main under the approved Best-effort Live List MVP contract.** This report does not authorize a push, Production migration or deployment. Stop after review.

Preservation verified: all **82 pre-existing reviewed implementation, test, migration, documentation and Phase 2 evidence files** retained identical SHA-256 hashes across this review. Only this approval report was authored. HEAD remains 36fbb67ae8636c3145368390f800e447088df29d on main, with no staged changes. Existing uncommitted work and earlier reports were preserved; no Production database/R2 access, Git mutation or deployment was performed.

