# Phase 1B Independent Review Remediation (B1–B8)

19 October 2026 · uncommitted working tree on `main` (HEAD 2ff3b79) · local only

**Readiness: READY FOR INDEPENDENT REVIEW.** All eight findings are fixed and covered by intended-behaviour tests; every validation step passed, with the environment incidents and reruns listed below. This is not a release decision.

Scope: the eight findings in `artifacts/consignment-phase1b-independent-review/report.md` and the ten
additional checks in the remediation brief. Phase 1A (F1–F9, N1–N4) is untouched; no settlement,
invoice, payment, commission or Phase 2 work; no Production access; nothing staged, committed, pushed
or deployed; Marketing Demo, Community, configuration and marketing files untouched. Every database
used was a disposable local SQL Server (LocalDB) database.

## B1–B8 matrix

| # | Finding | Root cause | Fix | Evidence (post-fix) |
|---|---|---|---|---|
| B1 (P1) | Correcting an explained late report restored Investigation without reopening the shortage | The late-report settlement linked a report to discrepancies but a correction only reversed the sale postings; the `ExplainedByLateReport` resolution and its Investigation→Sellable movement stayed in force | Every link is now its own resolution row (lineage: `LinkedSalesReportId` = the version). Verifying a correction first withdraws every link of the versions it replaces: an append-only `AllocationWithdrawn` row (`ReversesResolutionId`, unique) reopens the quantity and the link's ledger entry is reversed exactly once, then the correction's own links apply — one transaction, one lock | `B1_CorrectingAnExplainedLateSaleReopensTheShortageThroughEveryCorrection` (Codex's 10-unit scenario, migrated schema, v1→v4 incl. correction of correction and removed sale line), `B1_ReducingAnExplainedLateRefundReopensTheSurplusNote` |
| B2 (P1) | Oldest-first automatic allocation resolved unrelated periods | Allocation picked any open discrepancy of the branch/SKU by creation order | No automatic allocation. Only the **first count after the report's period** can have been affected, so only its open discrepancies (same branch, SKU, kind) are candidates. The reviewer links explicitly, per discrepancy, with evidence (never the count sheet) and an explanation, bounded by open quantity and by the shelf change the count couldn't see (report effect minus postings its versions made while the month was open). Unlinked is allowed and resolves nothing. Linking settles the count's finding, so the count's contributors aren't independent of it; each linked discrepancy gets its own review-event subject | `B2_ALateSaleNeverExplainsAShortageFromALaterUnrelatedCount` (IP04), `B2_ASaleNeverExplainsACountTakenBeforeItsPeriodAndEveryLinkIsChecked` (IP05 + every refusal + contributor 403) |
| B3 (P1) | "Collected and returned" certified a return that never happened | Outcome had no posting and no link to a physical return | Outcome removed (preferred option). Damaged stock stays Unsellable until it leaves through the existing per-unit dispatch return. Existing labels kept only for history | `B3_DamagedStockCanNotBeResolvedAsReturned` |
| B4 (P1) | Related-shortage settlement bypassed Team independence | Independence checked only the primary discrepancy's origin count | Independence covers every affected count (both origins for *EarlierShortageFound*; unknown history forces Solo). Both discrepancies are journaled with their own review event | `B4_SettlingARelatedShortageNeedsIndependenceFromBothCounts` (three-admin scenario, then Solo) |
| B5 (P2) | Physical count time conflated with the cutoff | No `CountedAt`; operators were told to enter next-morning counts as the month end | `CountedAt` stored separately from `CutoffAt` and `RecordedAt`. Accepted on the count day (before 6 pm adds a warning); after midnight only within 24 h, with a documented confirmation (`CountedAfterCutoffNote`) and no stock movement recorded in between (checked at entry and at close); otherwise refused with guidance to count again. The earlier backdating instruction is withdrawn | `B5_CountTimeIsRecordedAndADelayedCountNeedsConfirmationWithNoMovement` |
| B6 (P2) | INSERT into an approved stocktake was possible | Trigger covered only UPDATE/DELETE of frozen rows; EF guard didn't check additions | Corrective migration replaces both stocktake triggers: lines can be added, re-counted, moved or removed only while the stocktake is a draft; new lines can't arrive frozen; freezing only at close; a recorded count keeps its details; a discarded one never changes (51052). EF guard mirrors it | `B6_ClosedAndRecordedStocktakeLinesCanNotBeInsertedMovedOrRecounted`, `B6_HardeningRollbackIsCleanWhenEmptyAndBlockedByItsHistory`, SQL checks below |
| B7 (P2) | Refund-only late correction threw `InvalidOperationException` | Negative shelf delta assumed a sale line as the posting source | Link postings are sourced to their own resolution row; no sale line is assumed. A correction the shelf can't support is a 400 business error (with guidance to link or dispute) | `B7_RefundOnlyCorrectionsOfALateReportAreHandled` (IP03), `B7_ACorrectionTheShelfCannotSupportIsAClearBusinessError` |
| B8 (P2) | Solo resolution reused the missing-count evidence | Attestation was compared only with the submitted evidence | Every resolution (Team and Solo) needs evidence different from each affected count's evidence and its close review attestation; Solo attestation must cite that new evidence | `B8_AResolutionNeedsEvidenceBeyondTheCountItselfInTeamAndSolo` (exact reuse, case/space variant, genuine new reference, attestation mismatch, stale retry 409, live revocation 403) |

## Additional checks

| Check | Result |
|---|---|
| 1. A loss needs a genuinely relevant later count | `ApprovedLoss` now needs a later approved count with a line for that SKU, and no open surplus of that SKU from a later count (it may be the missing units) — `ALossNeedsALaterCountOfTheSkuWithNoUnexplainedExtras` |
| 2. Multiple and partly resolved discrepancies across periods | `B2_…BeforeItsPeriod…` (15 Aug partly resolved, 15 Sep linked), `ALoss…` (shortage + later surplus) |
| 3. Concurrent report verification vs approval | `AReportVerifiedWhileTheMonthClosesNeverClosesOnFiguresNobodyReviewed` |
| 4. Changes between preview and approval | Close now requires the `ReviewFingerprint` of the reviewed findings whenever warnings are acknowledged; any change → 409 `review_outdated` — `AClosedMonthNeedsTheFindingsAsTheyWereReviewed` |
| 5. Surplus notes stay outside verified Sellable | `ASurplusNoteIsNeverVerifiedSellableStock` (IP07 shape) |
| 6. Duplicate close / duplicate resolution retries | Existing `AMonthClosesOnceEvenWhenApprovedTwiceOrConcurrently`; `ConcurrentLinksAndResolutionsSettleExactlyOnce`; B8 stale retry |
| 7. History completeness and evidence visibility | Stocktake list pages (Show older stocktakes); resolution evidence shown in history; withdrawn links shown as "Explanation withdrawn … (open again)"; discrepancy list says when it shows the latest 500 |
| 8. Ledger vs physical vs surplus | Count dialog and detail show "expected on the shelf" as *N verified + M extra noted*; footers corrected |
| 9. No Tag Code assignment or custody release | B1 asserts every `ConsignmentUnit` (status, handover, Smart Tag) unchanged |
| 10. No invoices, payments, commission or settlement | B1 asserts no merchant invoices, payments, sales commissions or payouts |

## Invariants and authorization

- **Investigation = open shortage obligations** (per branch/SKU; one SKU per fixture) is asserted after every
  movement in B1 (v1→v4), B2, B7, B8, the concurrency tests and the existing Phase 1B tests. Custody tie-out
  stays balanced throughout; surplus notes never enter verified Sellable.
- **Explicit links only.** Nothing is settled from a late report without a reviewer's link; candidates are
  the first count after the report's period only; links are bounded by open quantity and by the shelf change
  the count couldn't see; duplicate links are refused (request validation and a unique filtered index).
- **Append-only lineage.** Links and withdrawals are resolution rows; withdrawals reference the link they
  reverse (unique) and its ledger entry is reversed once (existing unique reversal key). No resolution is
  ever updated or deleted (SQL 51048, EF guard).
- **Independence.** Team Mode refuses (403) anyone who counted, edited or recorded any count a decision
  settles — directly, through a related discrepancy (B4) or through a late-report link. Solo Mode allows
  only the nominated founder with live self-review capability (revocation takes effect on the next request)
  and new evidence. Every settled discrepancy has its own review-event subject.
- **Atomicity.** Withdrawals, links, sale/refund postings and status changes run in one transaction under the
  global consignment lock; a refused correction leaves ledger, discrepancies and report status unchanged
  (`B7_ACorrectionTheShelfCannotSupportIsAClearBusinessError`). Concurrent duplicate links/resolutions:
  exactly one wins, the other gets 409.
- **No custody, Tag Code or financial side effects** (checks 9–10). Capabilities unchanged: no new
  capability, endpoint or role grant was added.

## Changed files (this remediation only)

The working tree also holds earlier uncommitted Phase 1A/1B work and the user's unrelated work
(Marketing Demo, `Program.cs`, `appsettings.Development.json`, `launchSettings.json`, `.gitignore`,
marketing content, Community test edits). None of those were touched here; `.claude/launch.json` was
temporarily extended for QA and restored byte-for-byte (sha256 prefix `cb74ac9a7853df4f`).

API
- `apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs` — count timing, review fingerprint,
  removed returned outcome, resolve independence/evidence/loss rules, late-report plan/links/withdrawals
  (replaces `SettleLateReportAsync`), CSV count-time columns.
- `apps/api/MyPetLink.Api/Services/ConsignmentService.Sales.cs` — verify uses the explicit links; preview
  (`LateReport`) and simulation; business error for unsupported corrections.
- `apps/api/MyPetLink.Api/Entities/ConsignmentStocktakeEntities.cs` — `CountedAt`, `CountedAfterCutoffNote`,
  `ReversesResolutionId`.
- `apps/api/MyPetLink.Api/Data/MyPetLinkDbContext.ConsignmentStocktake.cs` — EF line guard, columns,
  indexes, check constraint, self-reference.
- `apps/api/MyPetLink.Api/DTOs/ConsignmentStocktakeDtos.cs`, `.../DTOs/ConsignmentSalesDtos.cs` — request and
  response fields (all additive/optional).
- Migration (new): `apps/api/MyPetLink.Api/Migrations/20261019060824_HardenConsignmentStocktakeReconciliation.cs`
  + `.Designer.cs`; `MyPetLinkDbContextModelSnapshot.cs`; root `migration.sql` regenerated (+136 lines,
  nothing earlier changed).

Tests
- New: `apps/api/MyPetLink.Api.Tests/Relational/ConsignmentStocktakeRemediationRelationalTests.cs` (17 tests).
- Updated: `ConsignmentStocktakeRelationalTests.cs` (count time, fingerprint, explicit links, outcome list,
  rollback now meets 51053 first), `ConsignmentSalesMigrationRelationalTests.cs` and
  `ConsignmentSalesFinalRemediationRelationalTests.cs` (pending-migration lists now include the new migration).

Web
- `apps/web/src/services/adminConsignmentService.ts` — types for count time, fingerprint, late links.
- `apps/web/src/components/admin/merchantSales/consignment/LateReportLinks.tsx` (new) — link step in Verify.
- `.../consignment/SalesReportsView.tsx`, `.../consignment/useConsignmentActions.tsx` (optional `validate`
  keeps the dialog open with entries on a problem), `.../consignment/StocktakeDialog.tsx` (Counted at,
  after-midnight reason, *verified + extra noted*), `.../consignment/StocktakeView.tsx` (count time, fingerprint
  on close, breakdown, evidence and withdrawals in history, older stocktakes, resolve copy),
  `.../consignment/model.ts` (+ `model.test.ts`), `ConsignmentStocktake.test.tsx`, `ConsignmentSalesReports.test.tsx`.

Docs and artifacts
- `docs/architecture/consignment-mvp.md`, `docs/deployment/consignment-mvp-rollout.md`.
- `artifacts/consignment-stocktake/report.md` — the next-morning backdating instruction struck through and
  marked withdrawn.
- This folder: `report.md`, `e2e-remediation.mjs`, `screenshots/01–07`, `logs/`.

## Migration and SQL Server results

Disposable LocalDB databases only; `sqlcmd -I -b` with `migration-session-settings.sql` first
(`logs/sql-results.txt`).

| Check | Result |
|---|---|
| Fresh root `migration.sql` / replay | PASS / PASS — 80 migrations, head `20261019060824_HardenConsignmentStocktakeReconciliation` |
| Accepted Phase 1A head (78, independent review's script) → current / replay | PASS / PASS — 80 |
| Reviewed Phase 1B head (79, the root script Codex reviewed) → current | PASS — 80 |
| Triggers | All five consignment history triggers present and enabled in all three databases; lines trigger fires on INSERT; both stocktake triggers raise 51052 |
| New columns / indexes / check | Present in all three; `DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS`: no violations |
| Model / snapshot | `has-pending-model-changes`: no changes |
| Root script parity | Byte-identical to a fresh idempotent regeneration (same sha256) |
| Historical identity | All three Phase 1A migrations and the Phase 1B migration (+ designers) byte-identical to the independent review's isolated copies; three older committed migrations differ only in line endings and are unmodified in git (`logs/migration-identity.txt`) |
| Raw SQL INSERT / UPDATE / DELETE / reparent (migrated schema) | Refused: insert into approved or recorded parent, frozen insert, reparent, re-count/delete of recorded lines, recorded→draft, recorded count-time change, discarded changes (51052); approved/frozen unchanged (51050/51049); legitimate draft edit, record and atomic close still work (`B6_…`) |
| Guarded Down | Empty: hardening rolls back to the reviewed 1B schema with the exact earlier triggers, then Up again. With a count time: 51053, nothing rolled back. Non-atomic chain: after the hardening rolls back the stocktake guard still refuses (51051) and Up restores it (existing rollback tests updated) |
| RowVersion / source uniqueness | Concurrent links and resolutions: one 200, one 409; one link posting |

## Test results (first runs reported as they happened; reruns listed separately)

| Run | Result |
|---|---|
| Pre-fix: Codex probes IP01–IP10 on unfixed code (`logs/prefix-probes.trx`) | 10/10 reproduce the defects |
| Run 1: focused stocktake + B1–B8 (`run1-stocktake-focused`) | 28/30. Both failures were test-authoring errors: B6 tried to reparent a same-SKU line (the unique SKU key refused it first, 2601); B8 took `.Last()` of two resolutions with the same fixed timestamp |
| Run 1b (after fixing those) | 0/2: B6's frozen-line insert then collided with the same key; B8 reused a service instance whose access is resolved once per request, so the revocation wasn't seen. Both test-side |
| Run 1c | 2/2 pass |
| Web focused, first run | 399/400: the existing record-count test lacked the new required count time (expected); after updating and adding tests 409/409 |
| Run 2: full API (`run2-full-api`) | **Invalid — environment.** The LocalDB `(localdb)\MSSQLLocalDB` alias had stopped resolving (the instance process kept running, unregistered): 156 failed, 359 skipped, all connection errors. The first SQL-check attempt failed for the same reason |
| Run 3: full API, same instance addressed by its named pipe (`run3-full-api`) | 2,923 passed, 9 failed of 2,932. Eight web-host tests (Health, CORS, TagCatalog request validation) use the app's own `(localdb)` connection string and couldn't connect; one is the known `SmartTagRateLimitingTests.PublicTagRoute_UsesIndependentClientIpPartitions` real-clock timing test. All relational and consignment tests passed |
| LocalDB restarted cleanly (graceful `SHUTDOWN` of the orphan, `sqllocaldb start`; no other client connected) | Alias restored |
| Run 4: supplementary rerun of the four affected classes + one new test (`run4-supplementary-rerun`) | 21/21 pass, including the rate-limit test |
| Run 5: full Consignment relational + HTTP + capability coverage (`run5-consignment-set`), includes F1–F9, N1–N4, Phase 1B and B1–B8 | **178/178** (independent review's 161 + 17 new) |
| Post-fix: Codex probes (`postfix-probes.trx`) | The 9 defect probes (IP01–06, IP08–10) now fail on their defect assertions (e.g. IP01 "Choose an outcome that fits this discrepancy", IP06 "Lines can be added only to a draft stocktake", IP10 "Record new evidence…"); IP07 and IP11–IP13 safety probes still pass. IP09 stops earlier than intended — its own close omits the new review fingerprint (409) — so its independence path is covered by `B4_…` instead |
| Web: full Vitest (`web-full.txt`) | 4,418 passed, 7 skipped, 0 failed |
| Web: typecheck (app + functions), lint | Pass / pass |
| Web: production build (four release flags on) | Pass |

## Browser QA (`e2e-remediation.mjs`, headless Edge, production static build, local API, disposable DB)

Setup no longer disables any trigger: September's history (agreement, prices, 1 Sep delivery, 1–15 Sep
report, 15 Sep count with one extra, two missing and one damaged, the partner's corrected report) was built
by a fixed-clock harness calling the real `ConsignmentService` (scratchpad `qa-harness`). Every step below
ran in the browser at today's real time.

First attempt: script path argument error (no step ran). Second: an ambiguous selector failed before any
action. Third run: **5/5 PASS, no page errors**:

1. Late corrected report: Verify shows the closed-period step; only the 15 Sep Pawsome SD shortage is a
   candidate; linking without evidence is stopped in the dialog; linked with evidence → shortage resolved,
   Pawsome SD 25 sellable / 0 investigating / 5 sold, balanced (screenshot 01).
2. Damaged My Boss package: two outcomes only, no "returned"; the count sheet is refused as evidence; new
   evidence accepted; evidence visible in the history (02, 03).
3. 30 Sep count taken 1 Oct 8:30 am: the dialog shows *35 verified + 1 extra noted*; the after-midnight reason
   is required; the detail shows the real count time (04).
4. Close month (Solo self-review with the count's evidence): the after-midnight count is a finding to
   acknowledge; closed; 35 / 25 / 27 (+1 unsellable), the extra Pawsome LW still only a note (05, 06).
5. Mobile (390 px): no horizontal page scroll on the report, reconciliation and stocktake views (07).

Cleanup: servers stopped, `.claude/launch.json` restored byte-for-byte, the QA database and all three
migration-check databases dropped. Only the pre-existing `MyPetLinkQA_MerchantDir` remains.

## Limitations and risks

- **Full API suite** was not green in a single run: run 3 (all relational tests green) plus the
  supplementary run 4 together cover every test. The LocalDB alias failure was environmental: the instance
  process outlived its registration (startup likely slowed by ~180 leftover test databases). After the
  restart, the instance lists the user's databases (MyPetLinkDev, MarketingDemo, …) but not the leftover
  `MyPetLinkTest_*` databases the orphaned process had attached. Nothing user-owned was dropped by this
  session; worth a look if any of those were expected.
- **Late-report links** cover sales against shortages and restocked returns (or fewer sales) against surplus
  notes from the first count after the period. Unsellable returns and unsellable shortages are never
  linkable; they stay open for a normal reviewed resolution. Linking is a reviewed judgement backed by
  evidence references; the system can't verify that the referenced receipt really shows the sale.
- **Withdrawals after later counts** reopen notes/shortages that later counts didn't see as open. The
  arithmetic stays consistent (book + open notes = physical; Investigation = open shortages, shown in
  `B1_ReducingAnExplainedLateRefund…` with a later count), but not every multi-period combination has its own
  test.
- **Count time.** The no-movement check sees recorded ledger movements (deliveries, returns, handovers). Sales
  made between midnight and a next-morning count are only covered by the documented confirmation. A count
  earlier on the count day is accepted with a warning. Counts entered before this change (no `CountedAt`)
  can't close a month — none exist outside disposable databases.
- **Review fingerprint** is required whenever findings are acknowledged; a clean count closes without it.
- Discrepancy list shows the latest 500 (export holds everything); stocktakes page 20 at a time.
- **Release isolation.** Ship API, web, DTOs, entities, snapshot and all five consignment migrations together
  (three Phase 1A + `AddConsignmentStocktakeAndCarryForward` + `HardenConsignmentStocktakeReconciliation`),
  with the root script regenerated. Downgrades are per migration and non-atomic (51053 → 51051 → 51047 …);
  check `__EFMigrationsHistory` after any refusal. The unrelated uncommitted work in this tree must be excluded
  file by file.

## Recommendation

**Ready for independent review.** B1–B4 (P1) and B5–B8 (P2) are fixed at the root, with intended-behaviour
regressions replacing the defect probes, an additive corrective migration with a guarded Down, and passing
API, SQL, web and browser validation. No release, Production upgrade or real stock change is proposed
before that review. Stopped here.

