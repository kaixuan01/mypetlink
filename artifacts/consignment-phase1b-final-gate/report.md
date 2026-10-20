# Phase 1B Final Independent Remediation Verification

19 October 2026 · Current uncommitted implementation · Codex

**NEEDS FIXES — two specific release blockers remain.** The original B1–B8 reproductions are substantially remediated, but a historical close can erase surplus reopened by a later report correction, and the UI prevents an otherwise valid shortage allocation when Sellable is insufficient. Phase 1B is not accepted for release preparation yet.

Read-only review of application source/migrations. Test probes, generated scripts, an isolated API copy and results are under this directory only. No staging, commits, push, deployment, Production access, real-stock changes, settlement or Phase 2 work occurred. SQL used disposable `(localdb)\MSSQLLocalDB` databases with integrated authentication. Preservation comparison: **1,771 project files, zero changed**; see source-preservation.json.

## B1–B8 independent matrix

| Finding | Gate result | Independent assessment |
|---|---|---|
| **B1 — correction/allocation integrity** | **FAIL** | Original Investigation-without-obligation defect is fixed. Explicit correction withdrawals/relinks and ordinary multi-period corrections pass. **R1** exposes a remaining correction/retrospective-close interaction that erases an unresolved surplus. |
| **B2 — explicit, relevant allocation** | **FAIL** | Server selection, evidence, quantity and contributor restrictions pass; automatic oldest-first matching is removed. **R2** makes the required allocation inaccessible in the actual UI for valid sold-out/low-stock cases. |
| **B3 — fabricated physical return** | **PASS** | ReturnedToMyPetLink is rejected and absent from allowed active outcomes. Legacy labels remain for history. Physical return continues through identified per-unit custody actions. |
| **B4 — related-origin independence** | **PASS** | Original A/B/C scenario now rejects both involved count contributors; an independent third operator succeeds. Both discrepancy subjects receive review history. Existing Solo counterpart also exercises nomination and fresh evidence. |
| **B5 — actual CountedAt** | **PASS, with operating limits** | Actual count, cutoff and record time are separate. Cutoff-day, immediately-after-midnight, following-morning and leap/non-leap February probes pass; delayed counts require a reason, recorded interval movements block, >=24 hours is refused. Unreported movement remains an attestation/reconciliation risk described below. |
| **B6 — SQL immutability** | **PASS** | Corrective trigger/EF protections cover insert into recorded/approved parents, recount, delete and reparent. Legitimate draft edit, record and close remain functional. Fresh/upgrade/replay/parity checks pass. |
| **B7 — refund-only correction** | **PASS** | Original refund-only correction no longer assumes a Sale line. A later-shortage/linked-refund correction succeeds without exception; invalid final capacity is a controlled business refusal. |
| **B8 — original evidence reuse** | **PASS** | Exact and case/space variants of original count evidence are refused. Fresh evidence succeeds only through the normal Team/Solo controls; the existing new tests cover mismatched attestation and fresh-request revocation. |

FAIL for B2 concerns end-to-end usability; its server-side automatic-allocation defect is fixed. FAIL for B1 concerns the additional multi-period case, not a recurrence of the original orphan Investigation balance.

## R1 — P1 blocker: a retrospective close erases a surplus reopened after its cutoff

Locations: [Stocktake.cs:127](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:127), [Stocktake.cs:243](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:243), [Stocktake.cs:465](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:465), [Stocktake.cs:483](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:483).

The plan combines ledger balances **before the selected cutoff** with **today's** open surplus quantities. It then settles those current notes as NoLongerPresent. A note reopened by a correction after the physical count/cutoff is therefore treated as though it had been open at that historical count.

Independent **FG11**, on the fully migrated schema, uses chronological application-service actions and keeps every trigger enabled:

| Step | Verified Sellable | Open surplus | What actually happened |
|---|---:|---:|---|
| Receive 10; verify 3 sales; August count 9 | 7 | 2 | Surplus noted, no stock invented. |
| Late sealed refund of 1, explicitly linked | 8 | 1 | One extra explained. |
| September 15 count 8, then September 30 count 8 | 8 | 0 | Remaining note settled; no later physical movement. |
| October 20: correct refund to financial-only | 7 | 1 | Correctly withdraws the old link and reopens one unexplained extra. |
| October 21: record the honest October 15 count of 8 | 7 | **0** | October books were 8, but plan adds the newly reopened note and expects 9; close wrongly settles that note as NoLongerPresent. |

The final current position is **7 verified + 0 unresolved extra**, although the unchanged physical count is 8. An October 20 obligation was cleared by evidence from October 15, using the earlier book value that already included the refund being corrected. The frozen October line shows BookSellable 8, OpenSurplusBefore 1, Expected 9, Counted 8 and SurplusNoLongerPresent 1.

This is not merely a display issue: an append-only resolution is committed and current OpenSurplus drops from 1 to 0. The same count should not erase that later reopening. The current custody sum remains balanced, Investigation remains consistent and sale capacity does not increase—those checks therefore do not detect the error. A correct review fingerprint also does not cure the mixed temporal basis.

Evidence: historical-close-probe.trx, historical-close-observation.json and FG11 in [independent probes](C:/Project/MyPetLink/artifacts/consignment-phase1b-final-gate/probes/IndependentProbes.cs). FG03 first exposed the interaction; FG11 reproduces it with explicit September/October clocks.

**Minimum safe fix:** calculate book and discrepancy quantities on a consistent temporal basis and ensure a historical close cannot consume a note reopened after that cutoff. For the MVP, a clear fail-closed guard on such incompatible retrospective closes is sufficient until reconciliation is supported. Do not solve this by backdating the physical count or silently moving/deleting correction history. Add the exact chronological regression, retaining current note quantity, count evidence and unchanged custody.

## R2 — P2 release blocker: the UI disables the only route to a required valid allocation

Locations: [SalesReportsView.tsx:366](C:/Project/MyPetLink/apps/web/src/components/admin/merchantSales/consignment/SalesReportsView.tsx:366), [SalesReportsView.tsx:228](C:/Project/MyPetLink/apps/web/src/components/admin/merchantSales/consignment/SalesReportsView.tsx:228), [Sales.cs:665](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Sales.cs:665).

Independent **FG10**: receive 10, verify 3 sales, close a physical count of zero. Sellable is 0, Investigation is 7. Enter the late 7-sale report. The real response contains an eligible shortage of 7, but its pre-allocation assessment also contains: sales exceed Sellable; **link them to that shortage**.

The API successfully verifies this exact report when explicitly linked to the shortage, ending at Sellable 0 / Investigation 0 / Sold 10. The UI, however, disables Verify whenever `r.issues.length > 0`. The allocation controls exist only inside the dialog opened by that disabled button. The founder cannot enter the evidence/link needed to remove the issue.

I saved the actual SQL-backed service response as sold-out-report.json and rendered the actual ConsignmentPanel with that response. The independent UI probe confirms Verify is disabled, clicking opens no dialog and sends no verification request. This is additional evidence to the 95 passing existing focused web tests; those tests use a late report whose issues are empty.

**Minimum fix:** distinguish allocation-resolvable capacity issues from structural blockers, or allow the linking review to open while retaining authoritative validation at confirmation. Do not enable final invalid verification or relax Phase 1A price/refund checks. Add the real sold-out response as an end-to-end UI regression, including a valid full link and an insufficient/invalid link.

Evidence: dates-and-ui-data.trx, sold-out-report.json, [UI probe](C:/Project/MyPetLink/artifacts/consignment-phase1b-final-gate/ui-probes/sold-out-report.test.tsx).

## Inventory and multi-period reconciliation

The new late-report algorithm uses explicit discrepancy IDs/evidence, bounded quantities and the first approved count at/after the report period. Earlier count shortages and later unrelated count shortages are not silently selected. No allocation is valid when the relevant count found no eligible difference. Unallocated verification leaves those findings open.

Withdrawals are append-only AllocationWithdrawn rows with unique ReversesResolutionId. Their ledger entries are reversed once; the old discrepancy reopens before the correction's requested links settle it again. No-op corrections, removed sale lines, refund-only corrections and correction chains were exercised. Replayed verification is refused by status/RowVersion; source/reversal and allocation indexes provide additional uniqueness.

**FG01** reproduces the original 10-unit B1 scenario with a corrected one-unit link: Sellable 5 / Investigation 1 / Sold 4, one open obligation. Removing the sale in another version reopens the remaining obligation correctly. Frozen history and per-unit custody remain unchanged.

**FG02** starts with a partly resolved shortage, links the remaining late sales, approves two later counts, renews the agreement, and corrects the old-period report. The original and later shortage remain separately attributed (1 each); current Sellable 4 / Investigation 2 / Sold 4, custody 10. No unrelated discrepancy is consumed. All pre-existing frozen lines and unit identities remain unchanged.

**FG03** verifies that a surplus link can be withdrawn after later counts and then carried through a genuinely subsequent count without duplicating notes. **FG04** exercises the original B7 refund-only shape after a later shortage: the corrected refund's original note is reopened/relinked, while that later shortage stays open.

Every targeted balance check asserts per branch/SKU: nonnegative five buckets; Investigation equals Shortage + UnsellableShortage OpenQuantity; custody equals all five buckets. **R1 additionally checks what those equations omit: expected physical stock and unresolved-note attribution across historical cutoffs.**

Surplus stays outside verified Sellable. The 7-book/9-count example remains 7 sale capacity plus 2 unresolved extras. No aggregate action selects a Tag Code, releases/reserves a custody unit or creates a new tag. Unit snapshots and absence of merchant invoices/payments/commission/payout rows are asserted in the targeted scenarios. Financial settlement and Phase 2 remain absent.

## Team / Solo / physical returns

The three distinct capabilities remain on the controller and are mirrored in the catalogue/web. No new role grants or JWT-role shortcuts were added. Existing HTTP tests exercise view-only denial, record/close/resolve separation, export restrictions and live revocation.

Related settlement now unions contributors from both origins and treats incomplete history as requiring the Solo path. FG06 reruns the original three-admin bypass, including the previously missing review fingerprints, and verifies both subjects are journaled. FG07 replays the original B8 evidence reuse with case/space variants and confirms a fresh reference succeeds under nominated Solo review. The submitted evidence must match the Solo attestation. Genuine evidence content is still an operational judgment; string inequality is not proof that a photo/receipt is authentic.

ReturnedToMyPetLink is removed from active outcomes. Attempts are business errors and leave custody/Unsellable unchanged. Existing per-unit return tests retain the actual custody movement and selected Sellable/Unsellable debit; the correction does not substitute an aggregate return certification.

## CountedAt, cutoff and practical operating limits

CountedAt, CutoffAt and RecordedAt are separate. FG08 tests both 28 February 2027 and 29 February 2028: count-day evening, one second after midnight and next morning retain actual time; the latter two require documented no movement; >=24 hours is rejected. Existing B5 tests reject actual ledger movement between midnight and the later count, at entry and again at closing. Approval waits until the exclusive Malaysia UTC+08 boundary.

**FG09 tests discovery of an unreported morning sale.** A mistakenly confirmed no-movement count can close, since aggregate half-month reports do not identify individual sale times. Reporting the sale in its real September period does not automatically erase August's shortage. A fresh scheduled count and evidenced related-discrepancy resolution reconcile it to Sellable 6 / Sold 4 / Investigation 0, preserving the honest original CountedAt and frozen count.

This is acceptable only as a small-shop operating limitation: count after final shop activity, retain actual partner confirmation, and use the next-morning exception only before reopening when no movement is genuinely known. The system cannot prove absence of unreported sales. On discovering movement, stop treating the old count as conclusive; retain the real sale period and reconcile with fresh evidence/count. Never backdate the physical timestamp. Count-day entries before 6 pm are accepted with a warning and require the same care about later activity. This is not a movement-adjusted stocktake system.

R1 is different from that operational uncertainty: it wrongly settles an obligation using **known recorded** correction history and an earlier count.

## SQL Server / migration verification

Migration reviewed: 20261019060824_HardenConsignmentStocktakeReconciliation.

| Independent check | Result |
|---|---|
| Fresh root script + idempotent replay | PASS; 80 migrations |
| Accepted Phase 1A root (78) -> current + replay | PASS; 80 |
| Independently reviewed Phase 1B root (79) -> current + replay | PASS; 80 |
| Model/snapshot | No pending changes |
| Root/regenerated script | Identical after BOM/newline normalization |
| Existing migration identity | All four earlier Phase 1A/1B migrations and designers match accepted/reviewed copies byte-for-byte |
| Earlier root SQL | Reviewed 79-migration script is an unchanged prefix of current root |
| SQL objects | New triggers enabled; filtered allocation/reversal unique indexes present; empty-schema DBCC CHECKCONSTRAINTS has no violations |
| Recorded/approved line integrity | Existing migrated-schema tests exercise SQL and EF insert/update/delete/reparent/recount refusal and legitimate draft/close success |
| Concurrency / history | Existing tests exercise RowVersion, unique sources/reversals, simultaneous link/resolution and append-only history |
| Guarded Down | Existing tests exercise empty hardening Down/Up, 51053 with count-time history and earlier per-migration guards |

The three manually created migration databases were dropped after verification; fixtures create/drop their own disposable databases. No user-owned database or LocalDB instance was shut down/restarted. Independent probes do not disable triggers or backdate ledger rows through SQL.

Down is per migration, not atomic across the chain. Keep additive history during business rollback; inspect migration history after any refused downgrade. Additive Up success does not make an older API safe: pre-hardening code lacks allocation compensation, count-time and closed-period rules.

## UI and evidence quality

Explicit link controls default to zero and require evidence/explanation when selected. The count form/detail now distinguish expected shelf quantity from verified stock and unresolved extras. Actual count time/no-movement note and discrepancy evidence/withdrawals are visible. Stocktake history has Show older stocktakes; discrepancy history still explicitly limits itself to the latest 500.

The approval fingerprint includes book balances, count outcomes, open surplus, custody and warnings. Existing race/stale-preview tests exercise rejection when underlying findings change; the UI sends the reviewed fingerprint. Client validation retains the link dialog on local validation errors. A server failure closes the shared confirmation dialog, so a refresh/re-entry may still be needed; this is a usability limit, not evidence that a failed request committed.

R2 remains the blocking workflow gap. The report's 5/5 browser result is author evidence, not independently rerun here. I inspected the new browser script and supplied mobile screenshot: count time, no-movement text and stock breakdown are visible; tables need internal horizontal scrolling. The script's window.scrollX check is a narrow overflow test, not proof every mobile control/table column is usable. This review provides independent component evidence, not a fresh full mobile-browser rehearsal.

## Independent test results / integrity

- Existing focused API/SQL/authorization regression run: **178 passed, 0 failed, 0 skipped**, one complete independent run (15m49s), including all 17 remediation cases, earlier Consignment cases and capability coverage. See focused-api.trx.
- Existing focused web: **95 passed, 0 failed**, five files, single run. App/functions TypeScript checks pass.
- Final independent SQL-backed probe run: **12/12 observations verified**, no skips. Includes positive intended-behavior cases and a diagnostic assertion reproducing R1; FG10 also supplies the real response used for R2. Passing diagnostic assertions are not acceptance passes.
- Independent UI diagnostic: **1/1 confirms R2** using that actual response.
- Initial probe run: 7 passed / 3 failed. Two February cases used a mistaken assertion comparing the real-clock CreatedAt with a future simulated count; the probe was corrected to compare the separately injected RecordedAt. FG03's third failure exposed R1; it was retained and expanded into chronological FG11. FG03 then tests a genuinely subsequent count, with all final cases rerun together. Application source was not altered to make tests pass.

Evidence: independent-final-probes.trx (initial), dates-and-ui-data.trx, historical-close-probe.trx, independent-final-complete.trx, sold-out-report.json, historical-close-observation.json and source-preservation.json.

Critical accepted Phase 1A protections in those runs:

| Protection | Result |
|---|---|
| F1 ledger/handover source and reversal identity | PASS, including corrected handover and migrated-schema cases |
| F2 refund capacity after corrections | PASS |
| F3 / N1 substantive contributors, delimiter collisions and no-op semantics | PASS |
| F4 exclusive Malaysia verification boundary | PASS, including leap-February cases |
| F5 grouped movements / refused-write atomicity | PASS |
| F6 / N4 renewal periods, original prices and refunds | PASS |
| F7 original-period refund capacity | PASS |
| F8 retries and changed submissions | PASS |
| F9 unavailable inventory versus empty inventory | PASS in the focused web run |
| N2 contributor SQL/EF append-only protection | PASS |
| N3 unknown historical contributor fail-closed/re-entry | PASS |

These passes do not cover the missing R1/R2 cases; the new diagnostic probes demonstrate why the existing green suite cannot establish Phase 1B acceptance by itself.

The author's full API evidence is **not one green run**: environment-affected run, 2,923 passed/9 failed run, then 21 passing supplementary tests cannot be called an all-green full suite. The reported LocalDB outage and known rate-limit timing issue are documented rather than reclassified as business failures. I did not repeat a full unrelated suite while two targeted blockers are confirmed. After fixes and release isolation, obtain one complete run on a stable disposable environment and preserve failed/skipped totals; do not union reruns into a green claim.

## Release preparation and final recommendation

The exact application/schema dependency set includes matching API/services, entities/DTOs, data model/snapshot, web service/types/components and all five migrations:

1. 20261018125029_AddConsignmentSalesReportingLedger
2. 20261018164233_HardenConsignmentSalesReporting
3. 20261019010452_ProtectConsignmentContributorHistory
4. 20261019025050_AddConsignmentStocktakeAndCarryForward
5. 20261019060824_HardenConsignmentStocktakeReconciliation

Earlier custody/Solo migrations remain base dependencies. A scratch API made from committed HEAD plus only Consignment changes/catalogue/snapshot/migrations builds with **0 errors/warnings**; its generated SQL matches root. Program.cs stays at committed HEAD. See release-dependency-files.txt. This proves API/schema separability, not a completed tested release package.

Exclude unrelated Marketing Demo source/tests/Program.cs hunks, development/launch settings, Community tests, marketing content, root marketing scripts/ignore changes and unrelated artifacts. Preserve them in the working tree. Do not deploy the combined uncommitted tree or assume an older application can safely run on the additive schema.

The final accepted [Phase 1A release gate](C:/Users/User/Documents/Codex/2026-10-18/referenced-chatgpt-conversation-this-is-an/outputs/phase1a-final-release-gate-verification.md) was read and preserved as accepted context. Original F1–F9/N1–N4 protections are not deliberately relaxed. The remaining failures are Phase 1B cross-period/workflow interactions.

**NEEDS FIXES.** Resolve R1 and R2, add their exact regressions, then repeat the targeted final gate. Do not reopen the whole design, invent financial posting or Phase 2 behavior, or weaken accepted Phase 1A checks. This review grants no Production or deployment approval.
