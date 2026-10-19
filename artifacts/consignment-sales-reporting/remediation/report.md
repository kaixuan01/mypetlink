# Phase 1A independent review — remediation report

Date: 19 October 2026 · Review: `phase1a-independent-review.md` (F1–F9 plus six further items) · Design: `mvp-design-final.md`
**Local only.** Nothing was staged, committed, pushed or deployed, and no Production system was accessed. SQL work ran only on disposable local databases (LocalDB), which were dropped afterwards.

## 1. F1–F9 matrix

| # | Finding | Status | Proven by (fails before the fix → passes after) |
|---|---|---|---|
| F1 (P1) | A corrected handover gets a second ledger identity | **Fixed** | `F1CorrectedHandover…` (AggregateSale and NonSaleWithdrawal), `LegacyCorrectedHandoverJoinsTrackingOnce…`, plus a migrated-schema rerun |
| F2 (P1) | A correction can leave more verified refunds than sales | **Fixed** | `F2CorrectionCannotLeaveMoreVerifiedRefundsThanSales`, `F2RemovedLinesPriceChangesAndCorrectionsOfCorrections…`, plus a migrated rerun |
| F3 (P1) | Editors are not treated as contributors | **Fixed** | `F3PriceEditor…`, `F3ReportEditor…`, `F3ContributionSurvivesDisabling…`, `F3NoOpSave…` (guard) |
| F4 | Verification allowed a day before the period ends | **Fixed** | `F4ReportsCannotBeVerifiedBefore…` ×3 (mid-month, month end, leap February) |
| F5 | Posting order blocks valid final states | **Fixed** | `F5SamePeriodSalesAndSealedReturn…`, `F5CorrectionAfterIdentifiedHandovers…`, `F5AnInvalidFinalPositionRollsBackEverything`, plus a migrated rerun |
| F6 | Refunds break across renewals and split periods | **Fixed** | `F6RefundInARenewedVersion…` |
| F7 | Refunds not tied to the origin period's sales | **Fixed** | `F7RefundsMustMatchVerifiedSalesInTheirStatedOriginPeriod` |
| F8 | Wizard create-then-record retry recorded old values | **Fixed** (API + UI) | `F8ChangedRetry…` ×2 (API); 4 wizard retry tests (UI) |
| F9 | Unavailable stock shown as "no stock" | **Fixed** | 4 UI tests: error + retry, permission, stale figures, overview |

Pre-fix evidence: `logs/pre-fix-regression.log` (16 of 19 new API tests failed against the original code; the 3 that passed are guards for unchanged behaviour), and `logs/web-mutation-original-behaviour.log` (7 of 8 new UI retry/stock tests failed with the original wizard and stock-loading code restored; the one that passed covers a guarantee the API provides).

## 2. Root cause and fix per finding

**F1.** The ledger keyed an identified handover by whichever record was current. A correction moves the "current" pointer to a new record, so tracking start posted the same handover again under the new id, and reversal could find two movements.
*Fix:* a handover is keyed by its **episode root**, the record that began it (`HandoverEpisodeRoot` walks `SupersedesRecordId` back to the `Handover` record).
- Live posting uses that root.
- Tracking start recognises it as already posted, so a retry is a no-op.
- Reversal undoes exactly that one movement.
- Handovers older than handover records keep the unit as their source.

**F2.** Refund limits were checked only for the refund lines in the report being verified. A correction containing only sales never rechecked refunds already verified against them, and financial-only refunds have no stock effect, so the bucket checks could not catch it.
*Fix:* refund capacity is keyed by (branch, SKU, price term, origin period). Verifying any report checks:
- every refund key of the report itself;
- every sale key of the report and of the verified version it replaces.

That covers reduced quantities, removed lines, price changes, corrections of corrections, financial-only refunds and physical returns. The refusal happens before any posting, so it is atomic.
*Second defect found and fixed:* a correction of a *disputed* correction could not be completed, and would have left the original verified. The "verified ancestor" is now found through the whole chain; it is reversed exactly once, and every open ancestor becomes Superseded.

**F3.** Independence was judged on `CreatedBy`/`RecordedBy` only, so someone who substantively edited a price term or report could approve or verify it, and be labelled Independent (Team).
*Fix:* a new append-only `ConsignmentRecordContributors` table, mirroring the agreement contributor pattern. It records:
- creators;
- substantive editors (a no-op save contributes nothing; a changed approval-evidence reference counts);
- recorders.

In Team Mode, anyone listed for a price term, or for a report or **any earlier version** of it, gets 403. Disabling or re-enabling an account changes nothing. Solo Mode keeps its scoped self-review, labelled `Self-reviewed (Solo)`.

Starting a correction only copies figures, so it does not make the starter a contributor. This keeps a two-person team able to correct and re-verify. The cost: that two-person team can't verify a correction someone in it edited, unless Solo Mode is in use or a third person verifies.

**F4.** The rule was `now < PeriodEndExclusive − 1 day`.
*Fix:* `now < PeriodEndExclusive`, the true exclusive end at midnight Malaysia time. Tested one tick before and exactly at the boundary, for the 16th, the month end and leap-year 1 March. Agreement-split periods use the same exclusive end.

**F5.** Postings ran in a fixed order (refunds, then sales; reversal first), each needing a non-negative balance at that instant. Legitimate net outcomes were refused.
*Fix:* `PostTogetherAsync` defers balance checks for one movement — the reversal of the replaced version plus the report's sales and returns. Every bucket it touched must be ≥ 0 **at the end**, inside the same transaction; otherwise the whole transaction is refused. The non-negative guarantee and atomicity stay intact. The assessment simulation now also covers the Unsellable bucket, so an impossible correction is reported as an issue before anyone tries.

**F6.** Two causes:
- A refund line could only reference a price term from the report's own agreement version.
- The origin had to be the 1st or 16th, so a period that began mid-month on a renewal couldn't be referenced.

*Fix:*
- A refund may use any non-withdrawn price term of the **same partner's** agreements, which keeps the original pricing reference.
- The origin must be the start of a real report period at the branch, or the report's own start.
- The list-price snapshot comes from the origin agreement's standard price.
- The refund term-window check was removed (the verified sale it reverses already proved the price was valid).

**F7.** Refund capacity was counted across all periods at a price. It is now counted against verified sales in the **stated origin period**. Refused:
- a period with no report (at save);
- a later period (at save and at assessment);
- an exhausted period (at verification, counting earlier verified refunds of that period).

**F8.** An idempotent replay compared only branch and agreement, so a changed retry silently returned the earlier report, which the wizard then recorded.
*API fix:* a retry is compared value for value with the saved report (normalised the way it is stored; no extra column).
- **Identical:** returns the saved report.
- **Changed, still Draft, sender is the only contributor:** updates the draft.
- **Otherwise:** `409 submission_changed`.

*UI fix:* the wizard keeps the draft it saved. On retry it re-reads the report:
- still a draft: it updates it, then records;
- already recorded with the same values: it finishes without recording again;
- already recorded with other values: it shows a clear error and changes nothing.

**F9.** A failed stock load was caught and replaced by an empty list ("No partner stock yet").
*Fix:* the panel keeps load state (loading, loaded, error, forbidden, and the time of the last good load).
- Never loaded: an error with a working **Try again**.
- Permission failure: says so, with no retry.
- Failed refresh: keeps the earlier figures, labelled "may be out of date", with a retry.
- Overview: leaves sales/stock counts out and flags them as unavailable, instead of showing the queue as clear.

**Additional items**
1. **Correction permission and audit.** `/sales-reports/{id}/correct` now requires `consignment.sales_reports.verify` (the approved design's matrix) and a 10+ character reason. It is audited on both the original (`…correction-requested`) and the new version. Editing and recording the correction still needs `…record`. The UI shows Correct only with verify.
2. **Journal export.** The review-log CSV gains `Subject type` and `Subject ID` columns, and the review DTO exposes both.
3. **Sealed-return attestation.** Persisted per refund line: `SealedReturnConfirmed`, plus `SealedReturnEvidence` (5–300 characters), required whenever a quantity is restocked.
   - Enforced in the service and by the check constraint `CK_ConsignmentSalesLine_SealedReturn`.
   - Older restocked lines are labelled honestly, not marked confirmed; an unverified one can't be verified until corrected.
   - The wizard adds the checkbox and the "How you know" field.
4. **Mixed tracking.** `stockTracked` is now reported per unit, and the handover/return forms decide on the selected units (dispatch-wide flag only as a fallback for older responses). A mixed multi-unit selection is refused as a whole by the API.
5. **Historical/new compatibility** is covered by three tests:
   - a legacy priced handover, corrected, brought into tracking twice, then reversed;
   - a mixed delivery;
   - an upgrade from the committed head with custody data.
6. **Role semantics, documented.** The three new capabilities are added to no ordinary built-in role template. Super Admin holds them (it resolves every catalogue capability) but is still not independent of its own work in Team Mode, and can self-review only when nominated in Solo Mode.

## 3. Changed files (this remediation)

API
- `apps/api/MyPetLink.Api/Services/ConsignmentService.Sales.cs`: contributors, retries, correction, verification as one movement, refund rules, assessment, helpers.
- `apps/api/MyPetLink.Api/Services/ConsignmentService.Ledger.cs`: deferred balance checks; handover episode root.
- `apps/api/MyPetLink.Api/Services/ConsignmentService.Approval.cs`: review subject in the DTO and CSV.
- `apps/api/MyPetLink.Api/Services/ConsignmentService.cs`: per-unit `StockTracked`.
- `apps/api/MyPetLink.Api/Entities/ConsignmentSalesEntities.cs`: `ConsignmentRecordContributor`; sealed-return fields.
- `apps/api/MyPetLink.Api/Data/MyPetLinkDbContext.ConsignmentSales.cs`:
  - contributor table, check constraints and the append-only EF guard;
  - widened line key and the capacity index.
- `apps/api/MyPetLink.Api/DTOs/ConsignmentSalesDtos.cs`, `ConsignmentDtos.cs`, `ConsignmentApprovalDtos.cs`.
- `apps/api/MyPetLink.Api/Controllers/Admin/AdminConsignmentController.cs`: correction needs verify and a reason.
- **New** `apps/api/MyPetLink.Api/Migrations/20261018164233_HardenConsignmentSalesReporting.cs` and `.Designer.cs`.
- `apps/api/MyPetLink.Api/Migrations/MyPetLinkDbContextModelSnapshot.cs`.
- `migration.sql` (root, regenerated).

API tests
- **New** `Relational/ConsignmentSalesRemediationRelationalTests.cs` and `Relational/ConsignmentSalesMigrationRelationalTests.cs`.
- `Relational/ConsignmentSalesLedgerRelationalTests.cs`: correction reason, sealed confirmation, the real mid-period origin, and the retry expectation, which used to assert the F8 behaviour.
- `Relational/ConsignmentRelationalTests.cs`: optional migrated-schema fixture.
- `ConsignmentSalesHttpTests.cs`: a new permission and revocation test.

Web
- `apps/web/src/services/adminConsignmentService.ts`
- `apps/web/src/components/admin/merchantSales/ConsignmentPanel.tsx`
- `apps/web/src/components/admin/merchantSales/consignment/`: `context.ts`, `model.ts`, `SalesReportWizard.tsx`, `SalesReportsView.tsx`, `StockPositionPanel.tsx`, `ConsignmentOverview.tsx`, `DispatchDetail.tsx`.
- Tests: `ConsignmentSalesReports.test.tsx`, `consignment/model.test.ts`.

Docs
- `docs/architecture/consignment-mvp.md`, `docs/deployment/consignment-mvp-rollout.md`.
- One wording line in `artifacts/consignment-sales-reporting/report.md`.

Artifacts
- `artifacts/consignment-sales-reporting/remediation/`: this report, `e2e-remediation.mjs`, `screenshots/`, `logs/`.

## 4. New tests

**Relational, SQL Server (`ConsignmentSalesRemediationRelationalTests.cs`), 19 methods, 22 cases**

| Area | Tests |
|---|---|
| F1 | `F1CorrectedHandoverKeepsOneLedgerIdentityThroughTrackingStartAndReversal` ×2 (AggregateSale, NonSaleWithdrawal): original → correction → tracking start → retry → reversal; checks every bucket, the tie-out and the source identity |
| F2 | `F2CorrectionCannotLeaveMoreVerifiedRefundsThanSales` (financial-only refunds); `F2RemovedLinesPriceChangesAndCorrectionsOfCorrectionsKeepRefundsCovered` (removed line, price change, physical returns, correction of a disputed correction, correction of a correction) |
| F3 | `F3PriceEditorCannotApproveTheirOwnChangeAsIndependent`, `F3ReportEditorCannotVerifyAReportSomeoneElseRecorded`, `F3NoOpSaveDoesNotMakeAnOperatorAContributor`, `F3ContributionSurvivesDisablingAndReEnablingTheEditor` |
| F4 | `F4ReportsCannotBeVerifiedBeforeTheirExclusiveMalaysiaEnd` ×3 (16th, month end, 29 Feb 2028 → 1 Mar) |
| F5 | `F5SamePeriodSalesAndSealedReturnVerifyWhenTheFinalPositionIsValid`, `F5CorrectionAfterIdentifiedHandoversSucceedsWhenTheNetIsValid`, `F5AnInvalidFinalPositionRollsBackEverything` (ledger count, buckets and statuses unchanged) |
| F6 | `F6RefundInARenewedVersionUsesTheOriginalSaleAndASplitPeriodStart` (v1 Aug 1–10, v2 from Aug 10) |
| F7 | `F7RefundsMustMatchVerifiedSalesInTheirStatedOriginPeriod` (over-capacity, no report, future period, exhausted period) |
| F8 | `F8ChangedRetryNeverReturnsTheOldQuantitiesSilently`, `F8ChangedRetryAfterSomeoneElseEditedTheDraftIsAConflict` |
| Items 2–5 | `ReviewLogExportNamesTheSubjectOfEachDecision`, `RestockedReturnsNeedAPersistedSealedConfirmation`, `MixedTrackingInOneDeliveryIsDecidedPerUnit`, `LegacyCorrectedHandoverJoinsTrackingOnceAndReversesCleanly` |

**Migrated schema (`ConsignmentSalesMigrationRelationalTests.cs`), 5 tests.** These build the schema through the real migration chain, so its SQL triggers are installed.

| Test | What it proves |
|---|---|
| `MigratedSchemaRunsTheRemediatedLedgerFlowsWithTriggersInstalled` | F1 ×2, F2 ×2, F5 ×3 and F8 rerun on the migrated schema |
| `MigratedLedgerRefusesRawEditsDuplicateSourcesAndSecondReversals` | Raw UPDATE/DELETE gets THROW 51043; a duplicate source and a second reversal get 2601 |
| `MigratedReportsAndPricesUseNativeRowversionConcurrency` | A stale token gets 409; two contexts racing raise DbUpdateConcurrencyException |
| `MigrationUpgradesCustodyDataAndAcceptsLongReceivingReferences` | Upgrade with legacy custody rows. A 1,000-character receiving reference fails with **Msg 1946** at the Solo head (the old oversized key) and succeeds at the new head. The key is (DispatchId, Action) with the reference INCLUDEd. Nothing is invented or posted. |
| `RemediationRollbackIsBlockedWithHistoryAndCleanWhenEmpty` | An empty Down/Up round-trips; with history, **THROW 51045** blocks, and so does going further back |

**HTTP:** `CorrectionNeedsVerifyEditsNeedRecordAndRevocationIsImmediate`. It covers:
- PUT price and report edits, and `/correct`, return 403 without capabilities;
- record-only can edit but can't correct; verify can correct;
- revoking a capability takes effect on the next request.

**Web (Vitest).** 11 new tests in `ConsignmentSalesReports.test.tsx`:
- F8 retries ×4: lost create; failed record; identical retry after a lost reply; changed retry after a lost reply.
- Refund origin and sealed confirmation.
- Correction needs verify.
- F9 ×4: error with retry; permission failure; stale figures; overview.
- Mixed tracking.

Plus 3 helper tests in `model.test.ts` (clamped periods including leap February, refund origins, retry matching). One existing test was updated for the correction reason.

**Updated existing tests.** The correction reason and the sealed-confirmation fields were added. `SalesBeyondRecordedStock…` asserted the **F8 bug itself** (a changed retry returning the old report silently) and now asserts the 409. `RefundsCannotExceedSales…` now names its real mid-period origin: the test agreement starts at 5 Aug 10:00 MYT.

## 5. SQL migration results

All runs used disposable LocalDB databases (`MyPetLinkTest_*`, `MyPetLinkMigrationQA_*`, `MyPetLinkQA_SalesRemediation`). Every one was dropped afterwards.

| Check | Result |
|---|---|
| Model parity | `dotnet ef migrations has-pending-model-changes`: no changes |
| Fresh database, root script with session settings (`sqlcmd -I -b`) | exit 0, 77 migrations, no `Msg` errors |
| Idempotent replay of the same script | exit 0, nothing re-applied |
| Upgrade from the committed head (75 migrations, `…AddConsignmentSoloOperatorPolicy`) to the new script | exit 0, 77 migrations |
| Upgrade with legacy custody rows (EF migrator) | rows kept; nothing posted or invented |
| Append-only trigger, raw SQL | UPDATE and DELETE get THROW **51043** |
| Unique source / unique reversal | raw duplicate gets **2601** for each |
| Rowversion | stale API token gets 409; two-context race gets `DbUpdateConcurrencyException` |
| Long receiving reference (1,000 characters) | **Msg 1946** at the Solo head; inserts at the new head. The index key is (DispatchId, Action) with RequestReference INCLUDEd. The old oversized index was not reintroduced. |
| Guarded Down | empty: Down then Up round-trips. With history: **THROW 51045**, and going further back is also blocked |
| Root `migration.sql` | regenerated, 142 lines added, 0 removed, UTF-8 BOM kept |
| New database objects present after apply | `TR_ConsignmentStockLedgerEntries_AppendOnly`, `CK_ConsignmentSalesLine_SealedReturn`, `UX_ConsignmentSalesReportLines_Line` (filter `[PriceTermId] IS NOT NULL`), `UX_ConsignmentLedger_Source`/`_Reverses` (filtered) |

Logs: `logs/sqlcmd-fresh-and-replay.log`, `logs/sqlcmd-upgrade-from-head.log`, `logs/migration-tests.log`.

## 6. Test summary

Every run below passed on its **first** attempt. Nothing was rerun to reach green.

| Suite | Result |
|---|---|
| New regression tests against the **original** code | 16 of 19 failed as expected (3 were guards for unchanged behaviour): `logs/pre-fix-regression.log` |
| New web tests with the original wizard and stock-loading logic restored | 7 of 8 failed as expected: `logs/web-mutation-original-behaviour.log` |
| Consignment relational and HTTP after the fix | 92 of 92 (`logs/post-fix-run1.log`; three test expectations were corrected in that run, see §4, then that subset passed 3 of 3) |
| Migrated-schema and migration tests | 7 of 7 (`logs/migration-tests.log`) |
| **Full API suite** (run alone) | **2,878 passed, 0 failed, 0 skipped**, 12 min 45 s (`logs/api-full-suite.log`) |
| **Full web suite** | **4,397 passed, 7 skipped, 0 failed**, 376 of 377 files (`logs/web-tests.log`) |
| ESLint (whole web app) | clean |
| TypeScript | clean |
| Production build (all four release flags) | succeeds |
| Browser rehearsal (production static export, real API, disposable database, headless Edge) | **7 of 7, no page errors** (`logs/e2e-remediation.log`, `screenshots/01…10`) |

The browser rehearsal covered:
- **F9:** a failed stock load showed the error with a working retry; the Overview flagged sales work as unavailable.
- **F8:** a lost record reply, retried identically, finished as one recorded report; retried with a changed quantity, it was refused and the 3 recorded units stayed.
- **Item 1:** Correct needed a reason.
- **Item 3 and F6/F7:** a refund against the 1–15 Sep promotion sale, with sealed confirmation, was verified.
- **F4:** the 16–31 Oct period was recorded but blocked from verification.
- **Stock:** shelf 33, provisional 29, tie-out balanced.
- **Mobile:** no horizontal scroll at 390 px.

The rate-limit test passed in this full run. That doesn't change the diagnosis in §7: it can still fail on a slow machine.

During the work, the React Compiler lint flagged a manual memo in the wizard after a refactor. It was replaced with plain computation, and the whole lint is clean.

## 7. Remaining risks

- **Contributor history before this change is incomplete.** The backfill records creators and recorders only. Editors were never stored before this migration, so for any report or price edited in a local database before it, an editor could still pass as independent. Production has no Phase 1A data (the Phase 1A migration was never deployed), so this matters only for local databases.
- **Two-person teams.** Contributors are excluded across a report's whole correction chain. If both team members contributed figures somewhere in that chain, nobody can verify it, and they need a third person or Solo Mode. This is deliberate, but worth knowing operationally.
- **Refund origins are limited to report periods at the same branch.** A refund for a sale reported at another branch of the same partner is refused. The design is per branch, so this may need a product decision if partners refund across branches.
- **The wizard lists refund origins from the branch's latest 100 reports.** A refund of a sale older than that can't be chosen in the UI, though the API accepts it. That is acceptable for half-month reporting (100 reports ≈ 4 years), but it is a limit.
- **Refund prices come from the agreement list in memory.** The wizard offers prices from the partner's agreement versions in the summary page it has loaded (the latest 100 agreements). A very old agreement version beyond that would not be offered.
- **The browser F8 rehearsal fakes the lost reply.** It lets the request reach the server, then drops the response in the browser (`route.fetch()` + `abort`). That's a faithful simulation, not a real network partition.
- **The timing-sensitive rate-limit test** (`SmartTagRateLimitingTests.Activation_UsesIndependentAuthenticatedUserPartitions`) is unchanged. Investigation: the test factory uses a **5-second fixed window on the real clock** (`RateLimiting:TagActivation:WindowSeconds = 5`), and no test in that class depends on the window resetting. If the window boundary passes between the second and third requests (a slow first request on a cold host makes this likely under load), the third request gets a fresh permit, so 404 instead of 429. That matches the reported 14-second failure and the independent probe (404, 404, 429, then 404 after 6 s). It is unrelated to Consignment. The recommended fix is a long window (e.g. 3600 s) or a controlled `TimeProvider` in that test factory; it was not changed here because it is outside Phase 1A.

## 8. Release-isolation notes

- **Ship together.** Everything here belongs to Phase 1A and must ship with it as one unit: the Phase 1A migration (`20261018125029_…`, never committed or deployed) and this additive corrective migration (`20261018164233_HardenConsignmentSalesReporting`), with the matching API and web.
  - The web now sends a correction reason and the sealed-return fields, and reads per-unit tracking.
  - An older web client would hit 400 on corrections and on restocked refunds.
  - An older API can't maintain the new ledger.
- **Migration history.** The corrective migration does not rewrite the Phase 1A migration. The root `migration.sql` grew by 142 lines with no deletions.
- **Unrelated work in the tree is untouched:** Marketing Demo (seeder, options, tests), `Program.cs`, `appsettings.Development.json`, `launchSettings.json`, the Community test edit, the `marketing/` documents and the merchant-directory preflight doc.
  - Those files are mixed into the same working tree, so a release must be cut as a reviewed Phase 1A-only diff, not the whole tree.
  - `MerchantDirectoryRelationalTests.cs` and the four existing consignment test edits do belong to Phase 1A.
- **Unchanged areas.** No financial settlement, invoice, payment, commission or Phase 1B (stocktake, period close, carry forward) code was added. Premium, GPS and tag-type rules are unaffected.
- **Database guards.**
  - Rollback is guarded: 51045 for this migration, 51044 for Phase 1A.
  - Restocked lines from before this change are labelled honestly, never marked confirmed.
  - The `ConsignmentRecordContributors` table is append-only through EF only. It has no SQL trigger, matching the existing `ConsignmentDraftContributors` pattern.

## 9. Readiness recommendation

**Ready for independent re-review; not yet for deployment.**
- All nine findings and the six further items are fixed at the cause and covered by tests that failed before the fix.
- The full suites, lint, typecheck, production build, disposable-database migration rehearsal and browser rehearsal all pass first time.

Before any release:
1. Run an independent re-review of this diff.
2. Cut a Phase 1A-only release diff, separate from the Marketing Demo and other unrelated changes in the tree.
3. Run a separately authorised staging rehearsal from the actual deployed migration head with representative data.
4. Decide the two product points in §7: refunds across branches, and the two-person-team effect of chain-wide independence.

Phase 1B and settlement were not started.
