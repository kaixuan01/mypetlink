# Independent Phase 1B Consignment Review

19 October 2026 · Current uncommitted implementation · Codex

**Recommendation: BLOCKED — major reconciliation and review-control defects.** Phase 1B is not accepted for release. Balanced aggregate custody and successful migrations do not establish business correctness.

Application source and migrations were not edited. New material is confined to this review directory: probe source/results, generated scripts, an isolated build and this report. Nothing was staged, committed, pushed or deployed. No Production connection, real inventory, financial posting or Phase 2 work was used. All SQL writes used disposable LocalDB databases.

## Review-area verdicts

| Priority / area | Verdict | Assessment |
|---|---|---|
| 1. Inventory ledger / carry forward | **FAIL** | Ordinary closing, serialization and surplus capacity work; corrections of allocated late reports break Investigation obligations. |
| 2. Discrepancy integrity | **FAIL** | Return certification needs no return; related-shortage independence can be bypassed. |
| 3. Late reports / refunds / corrections | **FAIL** | Allocation ignores origin periods; corrections leave stale resolutions; refund corrections can throw. |
| 4. Dates / period boundaries | **FAIL** | Malaysia cutoffs work, but actual physical CountedAt is absent. |
| 5. Authorization / Solo | **FAIL** | Endpoint capabilities and ordinary independence work; related-subject and fresh-evidence controls do not. |
| 6. SQL Server migration | **NEEDS ATTENTION** | Fresh/upgrade/replay/parity pass; closed-parent line insertion is unprotected. |
| 7. Frontend / shop workflow | **NEEDS ATTENTION** | Focused tests/typecheck pass; timestamp, labeling, return claims and history need attention. |
| 8. Phase 1A regression / isolation | **NEEDS ATTENTION** | Existing consignment/capability regressions pass 161/161, and isolated API/script build passes. New Phase 1B interactions fail business invariants; application rollback remains unsafe. |

## Severity-ranked findings

### B1 — P1: Late-sale corrections restore Investigation without reopening the shortage

Locations: [Sales.cs:425](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Sales.cs:425), [Stocktake.cs:563](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:563), [Stocktake.cs:584](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:584).

**IP02, migrated SQL Server:** receive 10; verify 3 sales; close a count of 5. Position is Sellable 5 / Investigation 2 / Sold 3, open shortage 2. Verify a late report of 2 sales: Sellable 5 / Investigation 0 / Sold 5; shortage resolved. Correct that late report to 1 sale and verify independently. The committed result is **Sellable 4 / Investigation 2 / Sold 4, zero open shortage quantity**. Custody still totals 10 and TieOutBalanced is true.

Verification reverses the original sale and its Investigation-to-Sellable offset, but does not compensate the linked resolution. Positive shelf delta only clears surplus notes. This breaks Investigation = outstanding shortage obligations and misstates shelf stock. Nonnegative buckets and aggregate custody do not detect it.

**Minimum fix:** compensate/recalculate the original report's explicit discrepancy allocations and open obligations, with append-only compensating history, in the correction transaction. Cover sales, refunds and corrections of corrections. Until supported, refuse corrections of allocated reports and require explicit reviewed reconciliation. Add a per-branch/SKU Investigation-to-open-obligations invariant check.

### B2 — P1: Oldest-first allocation resolves unrelated periods

Locations: [Stocktake.cs:567](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:567), [Stocktake.cs:587](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:587), [Sales.cs:646](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Sales.cs:646).

**IP04:** August closes cleanly at 7. September 15 count of 6 opens a September shortage of 1. A late August second-half sale automatically resolves that September shortage. Result: Sellable 6 / Investigation 0 / Sold 4, without evidence connecting that sale to September's shortage.

**IP05:** open one shortage at August 15 and another at August 31. An August 16–31 sale resolves the **August 15** shortage, leaving August 31 open. That sale occurred after the selected count and cannot explain its earlier finding.

Queries restrict branch/SKU correctly, but not origin cutoff/window or evidence. CreatedAt/Id order is deterministic for stored rows, not proof of relevance. Restocks/reduced sales apply the same unsupported selection to surplus. Preview warns about totals, not exact allocations.

**Minimum fix:** a small explicit allocation step at verification, showing discrepancy, count/window, remaining quantity and supporting evidence. Server-validate branch, SKU, temporal eligibility, quantity and contributor independence. Allow unallocated posting when evidence is insufficient. Preserve allocation lineage through B1's correction rules. Do not automatically explain a count before the sale period, or a later unrelated shortage. This matches the approved design's per-line choice without a general allocation engine.

### B3 — P1: “Collected and returned” certifies a physical event that never occurred

Locations: [Stocktake.cs:41](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:41), [Stocktake.cs:535](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:535), [model.ts:650](C:/Project/MyPetLink/apps/web/src/components/admin/merchantSales/consignment/model.ts:650).

**IP01, migrated schema:** receive 10, sell 3, close 6 sellable / 1 damaged. Resolve the damaged discrepancy as ReturnedToMyPetLink. It succeeds as Resolved despite **no unit return, no physical return movement, Unsellable still 1 and unchanged custody**.

This is broader than the reported wrong-bucket limitation: no corresponding return is required at all. UI text claims collection through the dispatch return action.

**Minimum safe MVP fix:** disable/remove this outcome until it can reference actual posted per-unit returns from Unsellable for the same branch/SKU, with sufficient quantity and no reuse. Keep the discrepancy open until physical return exists. Never manufacture per-unit movement from aggregate resolution.

### B4 — P1: Related-shortage settlement bypasses Team independence

Locations: [Stocktake.cs:518](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:518), [Stocktake.cs:528](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:528), [Stocktake.cs:542](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:542).

**IP09:** A records a shortage; A's direct Found resolution is correctly refused. B records a later surplus and C independently closes it. A resolves B's surplus as EarlierShortageFound, selecting A's shortage. Both close with **Independent (Team)**. The review subject identifies only the surplus; there is no review event whose SubjectId is the related shortage.

The independence check examines only the primary discrepancy's origin contributors, although settlement mutates both.

**Minimum fix:** check contributor/history restrictions across every affected origin; require the Solo exception if the actor contributed to either. Journal both exact subjects. Apply the same rule to reviewed late-report allocations so report verification cannot launder a discrepancy decision.

### B5 — P2: Physical counting time is conflated with period cutoff

Locations: [Stocktake.cs:57](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:57), [Stocktake DTO:8](C:/Project/MyPetLink/apps/api/MyPetLink.Api/DTOs/ConsignmentStocktakeDtos.cs:8), [Stocktake entity:22](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Entities/ConsignmentStocktakeEntities.cs:22).

**IP08:** at September 1, 09:00 Malaysia time, September 1 CountDate is rejected; entering August 31 is accepted and approved. There is no CountedAt field. CreatedAt/RecordedAt describe entry events, not actual counting time.

The implementation report's instruction to enter a next-morning count as the previous month end fabricates the physical count date. Intervening sales/receipts/returns can become false discrepancies.

**Minimum fix:** retain actual CountedAt separately from PeriodCutoff and reconcile interval movements, or require documented no movement. Until supported, state/refuse the unsupported delayed-count workflow; do not instruct backdating.

### B6 — P2: Closed-stocktake protection misses inserted/reparented lines

Locations: [migration:387](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Migrations/20261019025050_AddConsignmentStocktakeAndCarryForward.cs:387), [DbContext:19](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Data/MyPetLinkDbContext.ConsignmentStocktake.cs:19).

**IP06, real migration/all triggers enabled:** SQL INSERT adds an unfrozen second-SKU line to an approved stocktake. Its read now returns two lines. UPDATE of the inserted count from 999 to 888 also succeeds. No trigger was disabled.

The trigger checks UPDATE/DELETE only when old FrozenAt is non-null. EF also lacks an Added-line/approved-parent guard. Normal controller editing is blocked; this finding concerns the promised database/history protection across write paths, not an exposed endpoint bypass.

**Minimum fix:** cover insertion/reparenting into approved parents and corresponding EF additions, preserving legitimate initial atomic close. Add raw SQL/EF insertion/reparenting regressions.

### B7 — P2: Refund-only late correction throws an unhandled exception

Location: [Stocktake.cs:572](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:572).

**IP03:** close surplus 2; verify a late sealed refund of 2; close a later shortage of 1; correct refund to 1. Verification enters the negative shelf-delta path and calls First(Sale), although the report contains only Refund. It throws InvalidOperationException (a normal HTTP request would receive 500).

Rollback works: ledger/balances remain unchanged. A legitimate correction is nevertheless blocked by a coding assumption.

**Minimum fix:** handle refund reductions/removed lines explicitly and use a valid correction/allocation source. Negative shelf delta does not imply an existing sale line. Resolve B1/B2 semantics concurrently; unsupported cases need clear 4xx review errors.

### B8 — P2: Solo resolution reuses the original missing-stock evidence

Location: [Stocktake.cs:528](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:528).

**IP10:** nominated founder with live self-review capability resolves Found using the original missing-count EvidenceReference for both resolution and attestation. It succeeds as Self-reviewed (Solo).

The existing receiving flow rejects that reuse at [Receiving.cs:87](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Receiving.cs:87), and the runbook requires new supporting evidence. Phase 1B compares attestation only with submitted resolution evidence, not the original finding.

**Minimum fix:** require supporting evidence distinct from the original/relevant earlier findings, consistently with receiving. Evidence that stock was missing cannot alone establish it was subsequently found/returned/lost.

## Ledger, surplus and custody assessment

Ordinary writes share RunAsync's transaction/global consignment lock. Approval checks RowVersion/status and ledger source uniqueness. Retries return conflicts requiring reload rather than double posting. Carry forward creates no second receipt, reservation, dispatch, Tag Code or unit reassignment. Stocktake/resolution code does not change ConsignmentUnits.

Independent migrated-schema probes IP11–IP13 passed simultaneous partial resolution/replay, concurrent report verification/close, and failed-close rollback. The rollback probe compared ledger, stocktakes/lines, discrepancies/resolutions, review events, units, reports/lines and audit count.

| Surplus example | Quantity | Meaning |
|---|---:|---|
| Verified book Sellable | 7 | Actual ledger sale capacity |
| Physical sellable count | 9 | Shop's physical observation |
| Open surplus note | 2 | Unresolved difference; no posting/new Tag Codes |
| Next expected physical count | 9 | Book 7 + note 2, before later activity |

Calculation: [Stocktake.cs:195](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:195). Closing verified Sellable stays 7. **IP07 verifies 7/2/9 and refuses a subsequent sale of 8 without changing balances.** Repeated count 9 does not add another note of 2; lower counts consume prior notes before posting shortage. Surplus is excluded from custody tie-out and sale capacity.

Restoration moves existing Investigation/Lost back to Sellable and is source-balance bounded. EarlierShortageFound bounds both obligations but has B4. Late corrections/refunds are intended to explain surplus from existing Sold quantities, but B1/B2 make that unsafe. Unknown surplus must never directly become verified stock. EarlierLossFound is bounded by branch/SKU Lost, without a specific prior-loss link.

Several reproduced bugs still satisfy custody = Sellable + Unsellable + Investigation + SoldUnidentified + LostUnidentified. **Numerical tie-out does not prove correct obligation or period attribution.** Individual tag identity remained unchanged in the tested aggregate flows; no financial rows are posted by these methods.

## Discrepancy outcomes

| Outcome | Assessment |
|---|---|
| Missing found / found damaged | Correct Investigation -> Sellable/Unsellable mapping and quantity/source bounds; B8 applies. |
| Approved loss | Investigation -> Lost; later approved branch count required. Gate tests existence of a later close, not a specific corroborating line/evidence; add that regression. |
| Unsellable missing found / found sellable | Correct Investigation -> Unsellable/Sellable mapping; bounded. |
| Damaged confirmed | No movement; correctly stays Unsellable. |
| Damaged recovered as sellable | Unsellable -> Sellable; bounded. |
| Collected and returned | Unsafe: B3. |
| Surplus recount error | No posting; note reduced/closed. |
| Earlier shortage found | Both quantities bounded; B4 bypasses related independence. |
| Earlier loss found | Lost -> Sellable, bounded by branch/SKU Lost balance. |
| Late-report explanation | Unsafe allocation/correction paths B1/B2/B7. |

Partial/concurrent manual resolution is protected by lock, RowVersion and source/open quantity checks (IP11). Resolution history is append-only through EF and SQL triggers. Report corrections need compensating events; immutability alone does not maintain correct obligations.

## Dates and the browser setup limitation

Malaysia uses UTC+08 here. Cutoff is midnight after the 15th/month end; month length uses DateTime.DaysInMonth. Books use EffectiveAt < cutoff; approval waits until cutoff. Existing report tests cover mid-month/month-end/leap-February verification; web model tests cover count dates. Equal/earlier closed cutoffs and multiple open branch counts are refused. Late normal postings use now/IsPriorPeriodCorrection, preserving frozen lines.

There is no explicit first-dispatch-date prohibition: a prior cutoff sees zero books and current custody separately. Do not mistake a successfully entered historical date for evidence of an actual count. Exact delivery/sale/return timing depends on real EffectiveAt.

The author's browser rehearsal backdated synthetic receipts with the ledger trigger temporarily disabled. I inspected its report and rehearsal code, did not repeat that setup, and do not count its reported six browser passes as independent evidence. **Independent service probes used real dispatch/receipt/report/stocktake paths with controlled time, including migrated schemas, without disabling triggers.** This supplies temporal application coverage, but not the unsupported next-morning workflow, every cutoff-adjacent combination, or real hardware behavior.

## Authorization / Solo

The controller requires consignment.view plus each write's separate catalogued capability: stocktake.record, periods.close or discrepancies.resolve. Constants/catalogue/web mirror match; ordinary installed roles are not silently broadened. Existing HTTP tests exercise read/write separation, export denial and live revocation. Access remains database-resolved, not role-name/JWT-role based.

Creators/substantive editors/recorders remain contributors; typed comparisons preserve the Phase 1A delimiter/no-op protections. Price/report unknown-history gates remain. Solo still requires nomination, live capability, confirmation, reason and matching submitted evidence. B4/B8 are additional domain gaps. Ordinary review events identify their stocktake/discrepancy; related/automatic settlements do not supply equally explicit independently reviewed subjects.

## SQL Server results

Only `(localdb)\MSSQLLocalDB`, integrated authentication, disposable databases. sqlcmd -I -b ran migration-session-settings.sql before scripts in the same connection.

| Check | Independent result |
|---|---|
| Fresh root migration.sql / replay | PASS / PASS; 79 migrations |
| Phase 1A head | Applied through 20261019010452; 78 migrations |
| Phase 1A -> 1B / replay | PASS / PASS; 79 migrations |
| Model/snapshot parity | No pending model changes |
| Root/generated script | Identical after BOM/newline normalization |
| Isolated API/script | Build 0 errors/warnings; script matches root |
| Triggers/FKs | Three new triggers enabled; empty-schema DBCC CHECKCONSTRAINTS reports no violations |
| Unique constraints | One open per branch, one approved per cutoff, unique submission and stocktake/SKU line |
| Native concurrency | Stocktake/discrepancy RowVersion; IP11/IP12 pass |
| Resolution append-only | UPDATE/DELETE refused by SQL/EF |
| Closed history | Incomplete: B6 |
| Guarded Down | PASS in independently rerun regressions: empty Down/Up and 51051 with stocktake history; all 161 selected API tests pass |

Migration is additive. No previously tracked migration is modified; only the snapshot changes among tracked migration files. After the user supplied the final Phase 1A evidence location, I compared all three Phase 1A migration files and their three designers with the accepted gate's isolated review copy: **all six match byte-for-byte**. The independently generated 78-migration Phase 1A baseline also matches that accepted copy's root migration.sql after BOM/newline/outer-whitespace normalization. This closes the earlier historical-identity evidence limitation.

See sql-results.txt and SQL logs/scripts here. All three manually created migration databases were dropped, including an initial disposable setup database. Probe fixtures drop their own unique databases. No Production configuration/connection was used.

## Frontend / practical workflow

Independent targeted Vitest: **86 passed, 0 failed**, five files: Stocktake, SalesReports, Panel, ApprovalPolicy and model. App/functions TypeScript checks pass. Full web suite/production build were not independently rerun.

Counter/evidence/approval/Solo badges are visible. Ordinary count/report entry needs SKU quantities, not Tag Code scans. Loading errors remain errors. Count submission has a stable key/content-aware retry; close/resolve rely on server tokens and reload after conflicts.

I inspected the supplied mobile screenshot: page/badges fit, while 640/760px tables scroll horizontally and hide some columns initially. This was supplied-image inspection, not a fresh mobile-browser rehearsal.

Practical follow-ups:

- Label verified Sellable, expected physical count and unresolved extras separately. “Expected sellable” includes notes; its footer incorrectly describes it as verified books. The detail table shows 9 Expected / 7 Closing without its note breakdown. Show 7 + 2 = 9 explicitly.
- Acknowledgement is a boolean, not bound to versions of every ledger/report dependency. Test new receipt/report/return activity between preview and approval; require refreshed review if outcome changes materially.
- Stocktake list loads first 20 and discards pagination metadata. Discrepancies truncate at 500 without paging. Old stocktake IDs remain fetchable and appear in CSV, but ordinary old-history browsing is incomplete. Add simple paging/branch filters.
- Resolution history omits evidence reference although the response contains it. Make evidence inspectable.
- Fix unsupported return claims and actual counting time before accepting the shop workflow.

## Critical missing regressions

1. Allocated late report/refund corrections, removed lines, no-op/correction-of-correction and partial allocations; assert buckets, open obligations and compensating history.
2. Multiple discrepancy periods, pre-sale counts, later unrelated shortages, partial resolutions, branch separation and renewed agreements; assert exact allocation/evidence.
3. Return outcome with no return/wrong bucket/branch/SKU, insufficient/reused return quantity, and actual Unsellable return success.
4. Contributors across both related origins and report allocations; exact review subjects. Solo original-evidence reuse and capability revocation.
5. CountedAt vs cutoff, next morning with/without interval movement, exact cutoff receipts/returns, leap/non-leap February and pre-dispatch counts.
6. SQL/EF insert/reparent into closed stocktakes; Down with each new history category.
7. UI book/physical/note distinction, old-history paging, lost close/resolve reply and changed approval preview.

Promote defect probes into intended-behavior tests rather than permanently asserting today's broken results. Retain IP11–IP13's equivalent concurrency/atomicity protections.

## Release isolation / Production risks

Ship matching API, DTOs, entities/model/snapshot, web services/types/components and **all four** new migrations:

- 20261018125029_AddConsignmentSalesReportingLedger
- 20261018164233_HardenConsignmentSalesReporting
- 20261019010452_ProtectConsignmentContributorHistory
- 20261019025050_AddConsignmentStocktakeAndCarryForward

Earlier custody/Solo migrations remain base dependencies. Do not pick only the newest migration/remediation patch. Regenerate root script after approved corrective migrations; grant capabilities deliberately.

An isolated scratch tree from committed HEAD plus current consignment API/catalogue/snapshot/migrations builds with **0 errors, 0 warnings** and generates the same root script. Program.cs stayed at HEAD; Marketing Demo and development config were excluded. This establishes API/schema separability, not a fully tested release package.

Exclude Demo source/tests and Program.cs hunks, launchSettings/appsettings.Development/.claude changes, marketing scripts/ignore/content, Community test edits and unrelated artifacts. Review a complete file/hunk manifest; do not discard the user's unrelated work.

**Additive schema success does not prove application rollback safe.** Pre-1B code lacks closed-period posting/allocation semantics and could backdate into closed periods despite connecting successfully. Keep compatible custody/period-aware code, freeze affected writers for recovery, retain history and approve a specific forward-repair/rollback plan. Down guards are per migration: earlier refusal can follow removal of later empty migrations. Inspect migration history and restore Up rather than assuming a refusal changed nothing.

## Evidence, limits and recommendation

Read project guidance, product/access architecture, stocktake report/final MVP design, Phase 1A final remediation, earlier release-gate/independent QA, code/tests/migrations and rollout docs. Root Project-design-doc.md is absent. After the initial review, the user supplied the missing evidence folder. I read the [final Phase 1A release gate](C:/Users/User/Documents/Codex/2026-10-18/referenced-chatgpt-conversation-this-is-an/outputs/phase1a-final-release-gate-verification.md), dated 19 October 2026, and inspected its accompanying evidence JSON and accepted isolated migration files. It explicitly states **“GO — Phase 1A accepted, Phase 1B may begin”**, verifies N1–N4 and F1–F9, and keeps Production deployment separately controlled. This is the requested final acceptance report; it supersedes the earlier missing-report limitation. Its Phase 1A acceptance remains valid context and does not resolve the independently reproduced Phase 1B defects in this report.

Independent probes: **13/13 observations verified**, split 8 + 2 + 3 in independent-probes-final.trx, independent-auth-probes.trx and independent-atomicity-probes.trx. These include safety checks and reproductions of broken behavior; passing probe assertions **do not mean acceptance passes**. Initial probe setup had two failures (missing synthetic reviewer; draft correction blocking later close); corrected setups yielded final 8/8. Application source was unchanged. SQL command setup retries affected only disposable databases.

**Independent existing API regression run: 161 passed, 0 failed, 0 skipped (13m16s).** This includes the Phase 1A F1–F8 and N1–N4 cases, stocktake relational scenarios, migrated-schema/rollback checks, HTTP authorization and capability coverage. F9's frontend error/empty-state protections pass in the selected 86-test web run. See consignment-independent.trx, phase1a-regressions.txt and test-summary.txt. No full API/full web or fresh browser run is claimed. Outcome mappings above were also reviewed statically; not every possible outcome/partial/concurrent combination has a dedicated independent probe.

**BLOCKED.** Fix B1–B4 before any release decision; complete B5–B8 and critical regression coverage before accepting the stated Phase 1B workflow. Preserve accepted Phase 1A safeguards. No Production upgrade, real stock release or financial automation is recommended.
