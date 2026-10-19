# Consignment Sales Reporting, Stocktake & Stock Carry Forward — MVP Design

Date: 18 October 2026 · Status: **design for approval, nothing implemented** · Builds on [report.md](report.md) (read-only audit)

No application source, migrations, data or deployments were changed. The separate Consignment UI redesign browser QA failure is **resolved**: the end-to-end run passes 10/10, and two UI bugs were fixed with regression tests (`artifacts/consignment-ux-redesign/report.md` §5). That work is still uncommitted and not deployed.

---

## 1. The design in one paragraph

Keep every Tag Code in **per-unit custody** exactly as today. Add a small, append-only **SKU stock ledger** per partner branch that moves *quantities* between five buckets: **Sellable, Damaged on hand, Under investigation, Sold (unidentified), Lost (unidentified)**. Verified 14-day sales reports, monthly stocktakes and discrepancy resolutions post to that ledger. A **monthly stocktake approval is the period close**: it freezes everything up to the count cutoff, moves any unexplained variance into *Under investigation*, and becomes the opening balance of the next period. That is the carry forward. No stock moves, no unit is released, and no Tag Code identity is ever guessed. A live **custody tie-out** checks that the bucket total always equals the number of tagged units still at that partner.

---

## 2. Updated business workflow

| # | Step | Who | In the system |
|---|---|---|---|
| 1 | Allocate, pack and deliver by SKU | MyPetLink | Existing: reserve → manifest → dispatch → dispatch note |
| 2 | Joint count of sealed packages; signed acknowledgment | Shop + MyPetLink | Existing full receipt ("Mark all unconfirmed units good") → **posts Sellable +n per SKU** |
| 3 | Sales report every 14 days (qty, price, refunds, evidence) | Shop sends; founder enters | **New** Sales report: Draft → *Recorded (unverified)* → Verified / Disputed → Corrected. Only *Verified* posts Sellable → Sold (unidentified). |
| 4 | Monthly count of remaining sealed packages (and damaged) | Shop counts; founder enters | **New** Stocktake: expected (server-computed) vs counted |
| 5 | Reconcile and close the month | Founder (Team: second admin; Solo: self-review with evidence) | **New** Approve stocktake = period close. Variance → *Under investigation* (never "sold", never "approved stock"). Closing balance = next opening. |
| 6 | Investigate variances | Founder | **New** Discrepancy resolution: found / explained by a verified report / damaged / approved loss |
| 7 | Next period | — | Nothing to re-dispatch, re-reserve or re-scan. The ledger simply continues. |
| 8 | Trial end | Founder + shop | Renew (new agreement version), replenish (normal dispatch), exchange (identified returns), or end (final disposition, Phase 2) |

**Recommended cadence:** use **semi-monthly calendar periods (1st–15th and 16th–month end)** rather than rolling 14-day windows. Two reports then always end exactly at the monthly stocktake cutoff, so no report ever straddles a period close.

---

## 3. Reuse and gap matrix

| Need | Reuse as-is | Additive change |
|---|---|---|
| Agreements, versions, renewal | `ConsignmentAgreement`, wizard, approval, supersession (`ConsignmentService.cs:30-140`) | None. Reports resolve the version in effect for their dates. |
| Allocation, dispatch, dispatch note, manifest | Unchanged | None |
| Delivery receipt by SKU without scanning | Full receipt path (`ConsignmentService.Receiving.cs:124-130`) | Hook: post *Sellable +1* per Good unit |
| Delivery shortage/damage | Per-unit discrepancy flow (unchanged) | Hook: *Sellable +1* when a unit is resolved to Good |
| Returns / exchange | Per-unit return → QA → release/write-off (`ConsignmentService.cs:291-328`) | Hook: *Sellable −1* (or *Damaged −1*) when a unit counted at the partner is physically returned |
| Identified handover | Per-unit handover record (`ConsignmentService.Evidence.cs:30-69`) | New `Attribution` field: *Aggregate sale* (Sold (unidentified) −1) or *Non-sale withdrawal* (Sellable −1). Reported price is refused on tracked branches, so a sale can't be entered twice. |
| Custody protection | Unreleased units stay out of central stock (`SellableInventoryRules.cs:86`, `InventoryCustodyRules.cs:37-49`) | None. That is exactly the "not resold while unresolved" rule. |
| Review controls | `Review()` + `ConsignmentReviewEvents` + Solo policy (`ConsignmentService.Approval.cs:69-95`) | Add a `SubjectType`/`SubjectId` to the journal so verify/close/resolve events can be recorded |
| Audit | `IAuditLogService` | None |
| Exports | Shared CSV sanitizer, date-range pattern (`ConsignmentDocumentService.cs:66-83`) | Two new CSVs |
| Evidence files | Private presigned uploads exist (`Storage/IObjectStorageService.cs`) | **Deferred.** The MVP stores an evidence *reference* (kind + text) only. |
| SKU sales, stocktake, period close, carry forward, discrepancies | — | **New** (§4) |
| Unit end-state for unknown sold/lost units | — | **Phase 2**: one enum value (§7.4) |

---

## 4. Data model (additive only)

Six new tables plus two nullable columns. Enums are stored as strings, as they are today. Every new row carries UTC timestamps and the acting admin, and is audited. Mutable rows use `RowVersion`.

### 4.1 `ConsignmentStockLedgerEntries` — append-only, the single source of SKU quantities
| Column | Notes |
|---|---|
| Id, MerchantId, MerchantBranchId, ProductVariantId, SkuSnapshot | Branch = the stock location the dispatch went to |
| FromBucket, ToBucket | `External` (outside partner custody) · `Sellable` · `DamagedOnHand` · `UnderInvestigation` · `SoldUnidentified` · `LostUnidentified` |
| Quantity | Positive int; direction is From → To |
| EntryType | `DeliveryReceived`, `DeliveryResolvedGood`, `PhysicalReturn`, `VerifiedSale`, `VerifiedCustomerReturn`, `StocktakeDamaged`, `StocktakeVariance`, `DiscrepancyResolution`, `IdentifiedHandover`, `CorrectionReversal`, `OpeningFromCustody` |
| EffectiveAt | Business time (receipt time, report period end, count cutoff) |
| PostedAt, ActorAdminUserId | |
| SourceType, SourceId, SourceLineId | Dispatch/unit, report line, stocktake line, discrepancy, handover |
| ReversesEntryId | Corrections reverse, never edit |
| IsPriorPeriodCorrection | True when EffectiveAt would fall before the last approved cutoff |

**Unique** on (SourceType, SourceLineId, EntryType, ReversesEntryId), so a source can post only once. An append-only SQL trigger works like the review journal. **Posting is refused** if it would make any bucket negative for that SKU/branch, or if `EffectiveAt ≤ last approved stocktake cutoff` (unless it is a flagged prior-period correction, which is then dated now).

### 4.2 `ConsignmentSalesReports` + `ConsignmentSalesReportLines`
- **Report:** MerchantId, MerchantBranchId, AgreementId (the version in effect; the period must fall within one version's dates, otherwise split it), PeriodStart, PeriodEndExclusive (Malaysia time boundaries stored as UTC instants), PartnerReference (unique per merchant, normalized), ReportReceivedAt, EvidenceKind (`WhatsApp`, `POS report`, `Sales book photo`, `Other`), EvidenceReference, Notes, **Status** (`Draft`, `Recorded`, `Verified`, `Disputed`, `Superseded`, `Voided`), Version, SupersedesReportId, recorded/verified/disputed actor and time, ReviewMode, DisputeReason, IdempotencyKey, RowVersion.
- **Line:** ProductVariantId, SkuSnapshot, ProductNameSnapshot, QuantitySold, UnitSellingPrice (MYR, 2dp), DiscountTotal and DiscountNote (required if > 0), CustomerReturnsRestockable (sealed, back on shelf), RefundsNotRestockable (informational; no stock effect). Several lines per SKU are allowed when prices differ (promotions); (Report, Variant, UnitSellingPrice) is unique.
- **Immutable after `Recorded`.** Original reported values are never edited. A correction is a new version that supersedes the old one.

### 4.3 `ConsignmentStocktakes` + `ConsignmentStocktakeLines` — a stocktake approval *is* the period close
- **Stocktake:** MerchantId, MerchantBranchId, CountedAt (Malaysia-time date → cutoff = end of that day), CountedBy (partner staff name as given), EvidenceKind/Reference, Notes, **Status** (`Draft`, `Recorded`, `Approved`, `Voided`), PreviousStocktakeId, approved actor/time/ReviewMode, RowVersion. A filtered unique index allows only one non-voided, non-approved stocktake per branch.
- **Line (frozen at approval):** ProductVariantId, Opening (per bucket, from the previous approval), period movements by type, **ExpectedSellable**, ExpectedDamaged, **CountedSellable**, **CountedDamaged**, **Variance** (= expected − counted sellable, may be negative), ProvisionalSoldUnverified (shown, never posted), InvestigationNote, **ApprovedClosingSellable** (= counted), ClosingInvestigation, ClosingSoldUnidentified, ClosingLostUnidentified.

### 4.4 `ConsignmentStockDiscrepancies`
MerchantId, BranchId, ProductVariantId, StocktakeId (origin), Quantity (+ shortage / − surplus), OpenQuantity, Status (`Open`, `Resolved`), Notes, RowVersion. Resolutions are ledger entries referencing it, and partial resolutions are allowed.

### 4.5 Column additions
- `ConsignmentReviewEvents.SubjectType` / `SubjectId` (nullable). This lets *verify report*, *approve stocktake* and *resolve discrepancy* reuse `Review()` and the review-log CSV.
- `ConsignmentHandoverRecords.Attribution` (nullable: `AggregateSale` | `NonSaleWithdrawal`). Older rows stay null.
- **Phase 2 only:** `ConsignmentUnitStatus.AggregateDisposition` (§7.4).

**Why a ledger rather than recomputing:** carry forward requires *freezing* a period, and corrections arrive after close. A dated, append-only ledger makes the closed balance provable (Σ entries ≤ cutoff = approved closing). Late reports become explicit flagged corrections rather than silent rewrites, and duplicate posting is blocked by a unique key.

---

## 5. Expected stock rules

Per merchant branch and SKU, everything derives from the ledger:

```
Expected Sellable(T) = Approved closing Sellable at last cutoff T0
  + DeliveryReceived + DeliveryResolvedGood                (confirmed additional deliveries)
  + VerifiedCustomerReturn + DiscrepancyResolution→Sellable (approved restockable returns / found)
  − VerifiedSale                                           (verified sales only)
  − PhysicalReturn(from Sellable) − IdentifiedHandover(NonSaleWithdrawal)  (physical withdrawals)
  − StocktakeDamaged                                       (moved to Damaged on hand)
  (each counted only for entries with T0 < EffectiveAt ≤ T)

Provisional Sellable(T) = Expected − Σ Recorded (unverified) sold + Σ unverified restockable returns
   → always labelled "Provisional — includes unverified reports"
```

| Figure | Meaning | Ever posted? |
|---|---|---|
| Unverified reported sales | Shop's claim, awaiting review | No |
| Verified sales | Founder checked against evidence | Yes (Sellable → Sold unidentified) |
| Actual count | What the shop counted | Stored on the stocktake |
| Expected stock | Ledger figure | — |
| Variance | Expected − counted | Moved to *Under investigation* at approval |
| Damaged on hand | Counted damaged, still at shop | Yes |
| Under investigation | Unexplained shortage or surplus | Yes, until resolved |

**Custody tie-out (integrity check, shown on every position and required to approve a close):**
`units in partner custody for SKU at branch (Status = Received, ReceivingState = Good)` **=** `Sellable + DamagedOnHand + UnderInvestigation + SoldUnidentified + LostUnidentified`.

**Integrity rules:**
- Report periods may not overlap other active (non-voided, non-superseded) reports for the branch.
- A report may not straddle an approved cutoff.
- Verification is refused if it would make Sellable negative; record a discrepancy instead.
- A stocktake can't be approved while any *Recorded* report ends on or before its cutoff (verify or dispute it first).
- Each source posts once (unique key).
- Identified returns hit a unit only once (existing per-unit state machine).

---

## 6. Stock Carry Forward and agreement events

### 6.1 Period close (monthly)
1. Record the stocktake. The server fills in *expected* per SKU as of the count cutoff.
2. Review the variance table, the blocking unverified reports and the custody tie-out.
3. **Approve and carry forward.** Under the approval policy this needs a different admin in Team Mode, or Solo self-review with reason and evidence. In one transaction it:
   - posts `StocktakeDamaged` (Sellable → Damaged) for newly counted damaged packages;
   - posts `StocktakeVariance` (Sellable ↔ Under investigation) and opens a discrepancy per non-zero SKU;
   - freezes the lines, so the approved closing equals counted and becomes the next opening.
4. Nothing else changes: no unit status, reservation, dispatch or agreement change.

**After close:** a period is never reopened. A correction to a verified report (or a late report for closed dates) is verified as a new version. It posts `CorrectionReversal` for the old lines and new entries flagged `IsPriorPeriodCorrection`, dated now, and the closed stocktake keeps its frozen numbers. If a late report *explains* an open discrepancy, resolve that discrepancy with it: the entry posts Under investigation → Sold (unidentified), not Sellable → Sold, so the sale is never counted twice.

### 6.2 Trial expiry and renewal
| Outcome | What happens |
|---|---|
| **A. Continue / renew** | Create a new agreement version with new dates and signed acceptance, then approve it (existing; approval closes the predecessor). The ledger is keyed by merchant branch and SKU, **not** agreement version, so balances carry forward untouched. Unit custody and dispatch history stay linked to their original dispatch and version. Reports after the renewal date reference the new version. |
| **B. Replenish** | Normal reserve → dispatch → receipt of the new tags only. Receipt posts Sellable +n. Existing stock is untouched. |
| **C. Exchange variants** | The founder collects the specific packages and scans them (the shop doesn't). Existing per-unit return → quarantine → QA → release or write-off; each return posts Sellable −1. Replacements are a normal dispatch (B). |
| **D. End partnership** | Final stocktake and approval. Collect unsold stock (identified returns). Resolve all discrepancies and damaged stock. Then **Final disposition** (Phase 2, §7.4). Nothing is written off or released automatically. |

**Gap between trial end and renewal:** the existing `RequireEffective` already blocks *new* reservations and dispatches after `EffectiveTo`. Whether the shop may keep *selling* existing stock during that gap is a founder policy decision (Q6). The system should accept reports for that period only if you choose to allow it.

---

## 7. Compatibility with per-unit custody

1. **Manifest preserved:** units, snapshots and the controlled manifest are unchanged.
2. **No random identities:** aggregate sales move *quantities* only (Sellable → Sold unidentified). No unit row changes.
3. **Activation ≠ sale:** activation is shown only as a cross-check: activated units at partner per SKU vs. *Sold (unidentified)*. If activations exceed it, the founder sees a "possible unreported sales" flag.
4. **No release on report:** units stay unreleased consignment custody, so they remain excluded from central stock and can't be reassigned or resold.
5. **Aggregate vs identified:** an identified handover must declare `Attribution`. `AggregateSale` consumes one Sold (unidentified) and is refused if that bucket is 0; it carries no price. `NonSaleWithdrawal` consumes one Sellable. Reported prices on per-unit handovers are refused on tracked branches, so a sale can't be entered twice.
6. **Later identity:** if a specific sold tag becomes known (for example, a customer support case), recording it as an `AggregateSale` handover moves that unit out of custody and decrements the bucket. The tie-out stays balanced.
7. **Returns, QA, write-off:** unchanged per-unit rules. Write-off still applies only to physically returned stock.
8. **Final disposition (Phase 2):** only when Sellable = Damaged = Under investigation = 0 for every SKU at the branch. By elimination, the remaining custody units are exactly the units that left the shop, and their count must equal Sold (unidentified) + Lost (unidentified). One reviewed action marks them `AggregateDisposition`, linked to the disposition record that states the sold and lost counts per SKU. It never claims *which* unit was sold vs lost; they stay activatable, and agreement closure accepts this state. If the numbers don't match, the action is refused.

---

## 8. API (all under `/api/v1/admin/merchant-sales/consignment`)

| Endpoint | Capability (new unless noted) |
|---|---|
| `GET stock-positions?merchantId=&branchId=` — per SKU: buckets, expected, provisional, activation cross-check, tie-out, open discrepancies | `consignment.view` (existing) |
| `GET stock-ledger?…` + `GET stock-ledger.csv?from=&to=` | `consignment.view` / `consignment.manifest.export` (existing) |
| `POST stock-tracking/start {merchantId, branchId}` — posts `OpeningFromCustody` from current Good units (one-time, reviewed) | `consignment.periods.close` |
| `GET/POST sales-reports`, `GET/PUT sales-reports/{id}` (Draft only), `POST …/{id}/record`, `/verify`, `/dispute`, `/correct`, `/void` (Draft only) | `consignment.sales_reports.record`; verify/dispute → `consignment.sales_reports.verify` |
| `GET sales-reports.csv?from=&to=` | `consignment.manifest.export` (existing) |
| `GET/POST stocktakes`, `PUT stocktakes/{id}` (Draft), `POST …/{id}/record`, `/approve` (= close and carry forward), `/void` | record → `consignment.stocktake.record`; approve → `consignment.periods.close` |
| `GET discrepancies`, `POST discrepancies/{id}/resolve {outcome, quantity, salesReportId?, evidence}` | `consignment.discrepancies.resolve` |
| Existing receive/resolve/return/handover | Unchanged capabilities; add ledger hooks and the `Attribution` field |

Every write uses the existing `RunAsync` transaction and consignment lock, `RowVersion` tokens, idempotency keys (reports, stocktakes), the actor from the JWT, and `IAuditLogService`. Verify, approve and resolve go through `Review()`: in Team Mode the reviewer must not be the recorder; in Solo, self-review with reason and evidence. Capabilities are added to `AdminCapabilities.cs`, `AdminCapabilityCatalog.cs` and `apps/web/src/lib/adminCapabilities.ts`, granted to no built-in role automatically, and covered by `AdminCapabilityCoverageTests`.

---

## 9. Admin UI (reusing the redesigned workspace)

Tabs: **Overview · Agreements · Dispatches** (renamed from "Stock custody") **· Sales reports · Stocktake & reconciliation · Settings**. The current Reconciliation tab content (exports, per-unit open items) moves into *Stocktake & reconciliation*.

**Sales reports**
- List: partner, period, status pill, units sold, reported value, next step.
- **Record sales report** wizard (same pattern as the agreement wizard):
  1. Partner and period. The next semi-monthly period is suggested and the agreement version is resolved automatically.
  2. One row per SKU the partner holds: qty sold, unit price (add a price row for promotions), customer returns, refunds.
  3. Evidence and review: evidence kind and reference, totals, and the provisional stock effect. Then **Save draft** or **Record as unverified**.
- Detail: original values, version history, timeline, and contextual actions (Verify / Dispute / Correct).
- Persistent notice: *"Reported sales never create invoices, payments or commission records."*

**Stocktake & reconciliation**
- Per partner, a **stock position** card: per SKU opening → received → verified sold → other → **expected**, *provisional*, under investigation, damaged on hand, sold (unidentified), and a ✓/✗ custody tie-out.
- **Record stocktake**: count date, expected shown read-only, counted sellable and damaged entered, live variance, evidence.
- **Close and carry forward** review: variance table, blocking unverified reports, tie-out, and the Solo/Team confirmation from the existing action runner. The result shows the next opening balance.
- Open discrepancies with **Resolve** (found / explained by a verified report / moved to damaged / approved loss), stocktake history, and exports.

**Overview** gains attention items: reports awaiting verification, disputed reports, stocktake due, open discrepancies, tie-out mismatch, and activations exceeding sold.

---

## 10. Data-integrity and security risks

| Risk | Control |
|---|---|
| Duplicate report | Unique partner reference per merchant + idempotency key + non-overlap rule |
| Overlapping or straddling periods | Server validation; semi-monthly cadence avoids it by design |
| Double-counted sale (aggregate + identified) | `Attribution` on handovers; prices refused on per-unit handovers for tracked branches; tie-out check |
| Late report after close | Flagged prior-period correction or a discrepancy resolution, never an edit of a closed period |
| Repeated close or variance posting | One active stocktake per branch; ledger unique key; `RowVersion` |
| Negative stock from bad data | Posting refused; record a discrepancy instead |
| Variance silently becoming stock | Variance always goes to *Under investigation* with an open discrepancy; only an authorized resolution moves it |
| Reports straddling a renewal | Report must fit one agreement version's dates |
| Self-verification abuse | Separate record/verify capabilities; existing Solo policy with evidence and journal |
| Settlement on unverified sales | The MVP computes no money. The future settlement phase may read only *Verified* lines. |
| Customer personal data in references | Reference-only fields with the existing guidance copy; no customer fields at all |
| Evidence files | Deferred. When added, reuse the private presigned bucket pattern, never the public media bucket. Local dev points at the production bucket (team note), so test uploads must stay isolated. |
| Lost tags still activatable | Unavoidable without identity (Q10). The activation cross-check makes it visible. |

---

## 11. Example — 100 tags (40 / 30 / 30)

| Event | Pawsome LW | Pawsome SD | My Boss LW |
|---|---|---|---|
| Delivery 1 Oct, full receipt (joint count) | Sellable 40 | 30 | 30 |
| Report 1–15 Oct (verified): sold | 5 | 2 | 4 |
| Report 16–31 Oct (verified): sold | 3 | 3 | 3 |
| **Expected 31 Oct** | **32** | **25** | **23** (total 80) |
| Stocktake 31 Oct counted | 32 | 25 | 23 |
| **Approve & carry forward** → opening 1 Nov | Sellable 32 · Sold (unid.) 8 | 25 · 5 | 23 · 7 |
| Tie-out | 40 units in custody = 32 + 8 ✓ | 30 = 25 + 5 ✓ | 30 = 23 + 7 ✓ |
| Replenish 10 Pawsome LW, received 5 Nov | 42 | 25 | 23 |
| Report 1–15 Nov: 6 / 4 / 5 (verified) | 36 | 21 | 18 |
| Report 16–30 Nov: 4 / 3 / 3 — **disputed** (shop's photo unreadable) | 36 (provisional 32) | 21 (prov. 18) | 18 (prov. 15) |
| Corrected report verified 2 Dec, before close | 32 | 18 | 15 |
| Stocktake 30 Nov counted | 32 | 18 | **14** (1 damaged on hand) |
| Approve | 32 | 18 | Sellable 14, Damaged on hand 1, variance 0 |
| — alternative: counted 13 + 1 damaged | | | Sellable 13, Damaged 1, **Under investigation 1** (discrepancy open) |
| Later: shop finds the package in the storeroom | | | Resolve "found": Investigation → Sellable (14) |
| Trial ends 30 Nov → renew v2 | Balances unchanged; reports from 1 Dec reference v2 | | |

At no point is any Tag Code marked sold. The 8 + 10 + … sold Pawsome LW units remain *in custody* until either a specific identity becomes known or the final disposition at partnership end.

---

## 12. Implementation phases

| Phase | Scope | Must be live before |
|---|---|---|
| **0 — Operate (no code)** | QA-pass the tags; pack from the manifest; joint count → full receipt. Shop's reports and stocktakes kept as evidence (WhatsApp/photos); optionally a spreadsheet mirror. | First dispatch |
| **1A — Ledger + Sales reports** | Ledger table and hooks into existing receipt, resolve, return and handover; `stock-tracking/start` (posts the delivery already received); sales reports with the full status flow; stock position card; journal subject columns; capabilities; Sales reports tab. | **The first stocktake approval (about day 30).** Reports from day 1 can be back-entered because entries are dated. |
| **1B — Stocktake, close, carry forward, discrepancies** | Stocktake tables, approval = close, discrepancies, tie-out gate, Stocktake & reconciliation tab, two CSVs | The first month-end close |
| **2 — End and identity tools** | `AggregateDisposition` final disposition; handover `Attribution` UI polish; private evidence attachments; activation-based attribution assist | Before any partnership end, or the first exchange with unknown identities |
| **3 — Settlement** (out of scope) | Statements, commission from verified lines only, invoices, e-Invoice | After tax/e-Invoice review |

**Size estimate:** 1A ≈ 3–4 tables' worth of work (ledger, reports + lines, journal columns) plus hooks in 4 existing actions. 1B ≈ 3 tables plus close logic. Each phase is one additive migration, with the root `migration.sql` regenerated and the rollback guarded like the existing consignment migrations.

---

## 13. Recommendation

**The MVP is not required before the first physical dispatch.** It is required **before the first sales reconciliation, and specifically before the first month-end stocktake is approved (about day 30)**. Because ledger entries are dated, 14-day reports collected before Phase 1A ships can be entered afterwards without loss, as long as no period has been closed yet. Start the consignment now under Phase 0, and target 1A within about 2 weeks and 1B within about 4 weeks of dispatch.

---

## 14. Founder decisions needed before coding

1. **Quantities per SKU** for the first delivery (40/30/30 is only an example).
2. **Cadence:** semi-monthly calendar periods (1–15, 16–end) with stocktake on the last day? (Recommended.)
3. **What counts as "Verified"**: which evidence is acceptable (POS export, sales-book photo, WhatsApp message), and is a total-only report acceptable without a per-SKU breakdown? (Recommend per-SKU required.)
4. **Price freedom:** may the shop sell below RM39.90 without approval? (Prices are recorded as reported either way; this decides whether the UI warns.)
5. **Variance policy:** is a shortage the shop's liability immediately (per `LossTerms`), or only after an investigation window (for example, one month)? This affects when "approved loss" is used.
6. **After trial end without a signed renewal:** may the shop keep selling existing stock (holdover), or must sales pause until renewal?
7. **Customer refunds of activated tags:** allowed? (Not restockable; needs a customer-ownership step outside consignment.)
8. **Damaged on hand:** collect at each monthly visit, or at partnership end?
9. **Close gate:** confirm that unverified reports must be verified or disputed before the month can close.
10. **Lost tags:** accept that lost units stay activatable (identity unknown), or prefer the shop to report stolen packages immediately so the founder can try to identify them?
11. **Who enters data:** the founder only, or could a future staff member record reports and stocktakes while the founder verifies? This decides whether Team Mode separation is used day to day.
12. **Renewal terms:** keep the 35% rate and terms fixed for the trial, so no mid-period version change?
