# Consignment Phase 1A — Sales reports, approved prices and SKU stock ledger

Date: 18 October 2026 · Design: [mvp-design-final.md](../consignment-stocktake-audit/mvp-design-final.md) · **Local only — nothing staged, committed, pushed or deployed. No Production data touched.**

## What was built

**Backend (additive):**
- **Migration** `20261018125029_AddConsignmentSalesReportingLedger`:
  - 4 tables: `ConsignmentStockLedgerEntries` (append-only, with SQL trigger and EF guard), `ConsignmentPriceTerms`, `ConsignmentSalesReports`, `ConsignmentSalesReportLines`.
  - 3 nullable columns: `ConsignmentReviewEvents.SubjectType`/`SubjectId` and `ConsignmentHandoverRecords.Attribution`.
  - Index fix: the existing `IX_ConsignmentReviewEvents_DispatchId_Action_RequestReference` (2,096-byte key) is now `(DispatchId, Action) INCLUDE (RequestReference)`.
  - Guarded rollback: THROW 51044 once any sales, price or ledger history exists.
  - Root `migration.sql` regenerated (insertions only).
- **Ledger** (`ConsignmentService.Ledger.cs`):
  - Moves quantities between External, Sellable, Unsellable, Investigation, Sold (unidentified) and Lost (unidentified).
  - Each source posts at most once, through a unique source key, and in the same transaction as the status change that causes it.
  - Corrections post exact reversals.
  - A movement that would take any bucket below zero is refused.
- **Hooks in existing custody actions:**
  - A unit counted good at the partner (at receipt or on discrepancy resolution) adds 1 to shelf stock.
  - A counted unit that is physically returned leaves the chosen bucket (sellable or unsellable).
  - An identified handover on a tracked branch needs an **attribution** (aggregate sale or non-sale withdrawal) and refuses a per-unit price.
  - Reversing a handover reverses its ledger entry.
- **Approved prices** (`ConsignmentService.Sales.cs`):
  - Standard prices and Promotions per agreement version and SKU.
  - Draft → Approved through `Review()`, with the partner's acceptance reference (Solo self-review must cite it).
  - Overlapping standard prices are refused. An approved price can be ended from a date onward; a draft can be withdrawn.
  - A renewed version can receive the previous prices as drafts.
- **Sales reports:**
  - Fixed half-month periods in Malaysia time, clamped to the agreement's dates.
  - Draft → Recorded (frozen, unverified) → Verified or Disputed; Correct creates the next version.
  - Verification refuses: unapproved or mismatched prices, prices outside their validity, periods outside the agreement, unfinished periods, negative stock, and refunds above verified sales at that price.
  - Activations exceeding sales, and late reports, are warnings that must be acknowledged.
  - Discount is always derived (list − net), never typed.
  - Refunds: sealed returns go back to sellable; opened or activated ones go to unsellable.
- **Stock position** endpoint:
  - Per branch and SKU: shelf, provisional (including unverified reports), unsellable, sold, investigating, tagged units in custody, tie-out, delivery holds, activations in custody, and units not yet tracked.
  - "Bring into stock tracking" brings earlier deliveries in. It is idempotent: it uses the same source keys as the live hooks.
- **CSV exports:** sales reports and stock ledger (sanitised, date range limited, export permission required).
- **Capabilities** (catalogue + web mirror; added to no ordinary built-in role template, while Super Admin resolves them like every catalogue capability — see the remediation report): `consignment.price_terms.manage`, `consignment.sales_reports.record`, `consignment.sales_reports.verify`. Approving a price reuses `consignment.agreements.approve`.
- The dispatch detail response now includes `stockTracked`.

**Admin UI (redesigned workspace):**
- Tabs: Overview · Agreements · **Dispatches** (renamed from Stock custody) · **Sales reports** · Reconciliation · Settings.
- **Sales reports tab:**
  - Partner stock card (shelf / provisional / sold / tie-out).
  - Report list with status, evidence level and next step.
  - A 3-step wizard (partner and period → SKU lines with approved-price picker → evidence and review).
  - Report detail with contextual Verify / Dispute / Correct / Record / Discard.
- **Approved selling prices** card on the agreement: add, edit, approve, withdraw, end, copy previous prices.
- **Dispatch handovers** on tracked partners ask "What happened to this tag?" instead of a price. Returns ask where the package was counted.
- **Overview** gains attention items: reports awaiting verification, disputed reports, received tags not yet in SKU stock.
- **Reconciliation** gains two exports: sales reports and stock ledger.
- **Shared confirmation dialog** now handles warnings that must be acknowledged, and pre-fills the self-review evidence.

**Docs:** `docs/architecture/consignment-mvp.md` (Phase 1A section) and `docs/deployment/consignment-mvp-rollout.md` (migration, index fix, rollback guard, tracking start, capabilities).

## Verification

| Check | Result |
|---|---|
| Consignment relational tests (SQL Server) | **68/68** (12 new). Covers: posting once, receipt replay, tracking idempotency, verified sales without unit changes or money, unapproved prices, correction reversal once, refund limits, sealed vs unsellable returns, negative-stock refusal, duplicate/overlap/idempotency, attribution, returns by bucket, Solo evidence, activation warnings, price approval, append-only and unique-key enforcement |
| New HTTP authorization test | View-only operators get 403 on every new write and export; a recorder can't verify |
| Full API suite | 2,849/2,850. The one failure (`SmartTagRateLimitingTests`, a timing test unrelated to consignment) passes on rerun, 8/8. An earlier run made while the web build was also running hit 40 SQL timeouts; the uncontended rerun is clean. |
| Web tests | **4,381 passed**. New: 13 sales-report/price/handover UI tests and a period-helper unit test. Two unrelated Community-shell tests timed out under load and pass in isolation (16/16). |
| Typecheck, ESLint | Clean |
| Production build (all four release flags) | Succeeds |
| Migration | Applies to a fresh database and replays idempotently. Largest consignment index key is **316 bytes**. Rollback is blocked with data and succeeds when empty. |
| Browser QA (real API, disposable DB, Edge headless) | **6/6**: 40/30/30 delivery → shelf 35/28/26 after the seeded verified report, tie-out balanced. Unapproved price recorded but blocked. Dispute → correction v2 → Solo verify with late-report acknowledgment → shelf 32/28/23, original kept as Superseded. Prices on the agreement. Attribution on handovers. No horizontal scroll at 390px. No page errors. |

**Bug found and fixed in QA:** choosing the same agreement again in the report wizard cleared its prices without reloading them. A regression test covers it and was confirmed to fail without the fix.

Screenshots: `artifacts/consignment-sales-reporting/screenshots/01…12`. Logs: `artifacts/consignment-sales-reporting/logs/`.

## Behaviour changes to note
- On a branch with SKU tracking, a per-unit customer handover can no longer carry a sale price, and must state its attribution. Units received before tracking starts keep the legacy per-unit path until "Bring into stock tracking" is run. Four existing tests were updated to use these legacy and attribution paths.
- The merchant-directory migration test fixture now also drops and restores the two new foreign keys to `MerchantBranches`.

## Not in Phase 1A
- Monthly stocktake, period close and carry forward, discrepancies (Phase 1B).
- Evidence file attachments.
- End-of-partnership disposition.
- Settlement.

## Environment
- The disposable QA databases were dropped.
- `.claude/launch.json` was restored byte-for-byte (sha256 `cb74ac9a…`).
- No servers are left running.
- Unrelated work in the tree (Marketing Demo, appsettings, Program.cs, other docs) was not touched.
