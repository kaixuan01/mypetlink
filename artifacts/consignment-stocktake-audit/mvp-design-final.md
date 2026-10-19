# Consignment Sales Reports, Stocktake & Stock Carry Forward — Final MVP Design

Date: 18 October 2026 · Status: **implementation-ready, awaiting approval — nothing implemented**
Supersedes [mvp-design.md](mvp-design.md). Background: [report.md](report.md).
No application source, migrations, data or deployments were changed.

---

## 0. Decisions recorded

| # | Decision | Where it lands |
|---|---|---|
| D1 | Sales periods are fixed: **1st–15th** and **16th–month end** (Malaysia time) | §1, §3 index, §8 |
| D2 | **Monthly stocktake by SKU**, counted at the end of the last day of the month | §6 |
| D3 | **Founder enters and verifies** under Solo Mode (self-review with reason + evidence) | §5 |
| D4 | **SKU quantity and actual selling price are mandatory** on every sales line | §4 |
| D5 | **WhatsApp summaries are acceptable** evidence; POS reports and sales-record photos are encouraged | §5 |
| D6 | Initial trial **60 days at 35% partner commission**, only once the agreement is signed and approved | Existing agreement flow, unchanged |
| D7 | **Only approved selling prices and promotions** are allowed | §4 (new approved price terms) |
| D8 | **Missing or damaged stock is investigated**, never automatically treated as sold or written off | §6 |
| D9 | **Activated tags never return to sellable stock automatically** | §4.4, §6 |
| D10 | **Unsold stock carries forward on agreed renewal**; no returns or rescans | §7 |
| D11 | **No individual Tag Code scan** for routine shop sales | Whole design |

---

## 1. Final workflow

```
Dispatch & receipt (existing)  →  Sales report 1–15  →  Sales report 16–end  →  Monthly stocktake
        per unit                    SKU qty + price       SKU qty + price         SKU counts
                                    Recorded → Verified   Recorded → Verified     Approve = period close
                                                                                  → Carry forward
```

1. **Delivery.** The existing reserve, manifest, dispatch and dispatch note steps. You and the shop count the delivery together, then record a full receipt.
2. **Sales report** (twice a month). The shop sends its summary. You enter one line per SKU and price: quantity, approved price, and any refunds. You attach the evidence reference, then save it as **Recorded (unverified)**.
3. **Verify** (Solo self-review). The server checks the report (§5). Verification moves sold quantities out of sellable stock. No Tag Code changes.
4. **Monthly stocktake.** The shop counts sealed sellable packages and unsellable ones (damaged or opened) per SKU. You enter the counts with evidence.
5. **Approve the stocktake.** This closes the month and carries the stock forward. Shortages go to investigation; surpluses become open notes that don't change the books (§6). The approved physical count becomes the next opening.
6. **Investigate** discrepancies until each is resolved with evidence.
7. **Renew, replenish, exchange or end** (§7).

---

## 2. On-hand quantity vs per-unit accountability (Q2)

There are two different questions, and the design answers them separately.

| Layer | Question it answers | Source | Can a stocktake confirm it? |
|---|---|---|---|
| **Physically on hand** | What is on the shop's shelf and in its storeroom? | Ledger buckets **Sellable** + **Unsellable on hand**, plus any open **surplus note** | Yes, a count confirms it |
| **Left the shelf, identity unknown** | Where did the other tags go? | Ledger buckets **Sold (unidentified)**, **Lost (unidentified)**, **Under investigation** | No, only reports and investigations |
| **Per-unit accountability** | Which tagged units is the partner still accountable for? | `ConsignmentUnits` still in partner custody (Received/Good, not returned, not handed over, no final disposition) | No, only identified returns, handovers or final disposition close a unit |
| **Delivery holds** | Units disputed at delivery | Existing per-unit Unconfirmed/Missing/Damaged receiving states | Outside the ledger until resolved per unit |

**The tie-out (checked live, and required before a close is approved), per branch and SKU:**

```
Units still in partner custody  =  Sellable + Unsellable on hand + Under investigation
                                 + Sold (unidentified) + Lost (unidentified)
```

Surplus notes are deliberately **outside** the tie-out. They are physical observations, not ledger quantities.

So 80 packages can be on the shelf while the partner is still accountable for all 100 units: 20 have left the shelf, and their identities stay unknown until an identified handover or the final disposition (Phase 2).

---

## 3. Data model — exact counts (Q4) and index budget (Q5)

**The earlier count was wrong.** The earlier draft said "six tables plus two nullable columns" but actually listed **three** nullable columns (`ConsignmentReviewEvents.SubjectType`, `ConsignmentReviewEvents.SubjectId` and `ConsignmentHandoverRecords.Attribution`). Adding approved price terms (D7), a resolution log and stocktake corroboration makes the final count:

| Phase | New tables | New nullable columns on existing tables | Other |
|---|---|---|---|
| **1A — Sales reports** | 4: `ConsignmentStockLedgerEntries`, `ConsignmentPriceTerms`, `ConsignmentSalesReports`, `ConsignmentSalesReportLines` | 3: `ConsignmentReviewEvents.SubjectType`, `ConsignmentReviewEvents.SubjectId`, `ConsignmentHandoverRecords.Attribution` | Rebuild one existing oversized index (§3.9) |
| **1B — Stocktake & carry forward** | 4: `ConsignmentStocktakes`, `ConsignmentStocktakeLines`, `ConsignmentStockDiscrepancies`, `ConsignmentDiscrepancyResolutions` | 1: `ConsignmentSalesReportLines.CorroboratedByStocktakeId` (a column on a 1A table, with its foreign key added in 1B) | — |
| **MVP total** | **8 tables** | **4 nullable columns** (3 on pre-existing tables) | — |
| 2 — End of partnership | 1 (`ConsignmentFinalDispositions`) | 0 | 1 enum value, `ConsignmentUnitStatus.AggregateDisposition`. The status column is `nvarchar(32)`, and the value is 20 characters, so no column change. |

**Conventions for every new table:**
- Enums stored as strings.
- GUID keys.
- `datetimeoffset` UTC.
- Money as `decimal(18,2)`, matching the existing handover columns.
- `RowVersion` on every mutable row.
- Actor columns hold `AdminUsers.Id`.
- Writes audited through `IAuditLogService`.
- Append-only tables (ledger, resolutions) get the same `INSTEAD OF UPDATE, DELETE` trigger and EF guard pattern already used for `ConsignmentReviewEvents`.

**Index rule:** keys contain only GUIDs, dates, ints and short codes (≤ `nvarchar(100)`). No evidence, notes or free-text reference longer than 100 characters is ever a key column; those go in `INCLUDE` or are not indexed. Every new key below is **≤ 220 bytes** against SQL Server's **1,700-byte** nonclustered key limit.

### 3.1 `ConsignmentStockLedgerEntries` (1A, append-only)

| Column | Type |
|---|---|
| Id, MerchantId, MerchantBranchId, ProductVariantId | uniqueidentifier |
| SkuSnapshot | nvarchar(80) |
| FromBucket, ToBucket | nvarchar(24) — `External`, `Sellable`, `Unsellable`, `Investigation`, `SoldUnidentified`, `LostUnidentified` |
| Quantity | int > 0 |
| EntryType | nvarchar(40) — §8 |
| SourceType | nvarchar(32) |
| SourceLineId | uniqueidentifier |
| ReversesEntryId | uniqueidentifier null |
| EffectiveAt, PostedAt | datetimeoffset |
| IsPriorPeriodCorrection | bit |
| ActorAdminUserId | uniqueidentifier |

| Index | Key bytes |
|---|---|
| `UX_Ledger_Source` unique (SourceType, SourceLineId, EntryType) filter `ReversesEntryId IS NULL` | 64 + 16 + 80 = **160** |
| `UX_Ledger_Reverses` unique (ReversesEntryId) filter `IS NOT NULL` | **16** |
| `IX_Ledger_Position` (MerchantBranchId, ProductVariantId, EffectiveAt) INCLUDE (FromBucket, ToBucket, Quantity) | **42** |
| `IX_Ledger_Merchant` (MerchantId, EffectiveAt) | **26** |

### 3.2 `ConsignmentPriceTerms` (1A) — approved selling prices and promotions (D7)

| Column | Type |
|---|---|
| Id, AgreementId, ProductVariantId | uniqueidentifier |
| Kind | nvarchar(16): `Standard` \| `Promotion` |
| Name | nvarchar(100) |
| UnitNetPrice | decimal(18,2) |
| ValidFrom, ValidToExclusive | datetimeoffset, end nullable |
| ApprovalEvidenceReference | nvarchar(1000) |
| Status | nvarchar(16): `Draft` → `Approved` → `Withdrawn` |
| Approver, review mode, RowVersion | — |

Rules:
- At most one approved **Standard** price per agreement version and SKU at any time.
- Promotions may overlap; a sales line names its price term explicitly.
- Approval goes through `Review()` (Solo self-review with the partner's agreement as evidence).
- Approved terms are immutable; withdrawing one only ends it from a date onward.

| Index | Key bytes |
|---|---|
| `IX_PriceTerms` (AgreementId, ProductVariantId, Kind, ValidFrom) | 16 + 16 + 32 + 10 = **74** |

### 3.3 `ConsignmentSalesReports` (1A)

| Column | Type |
|---|---|
| Id, MerchantId, MerchantBranchId, AgreementId | uniqueidentifier |
| PeriodStart, PeriodEndExclusive | datetimeoffset — canonical 1st/16th boundaries; split only at an agreement-version boundary (§7) |
| PartnerReference | nvarchar(100), normalized upper-case |
| Version | int |
| SupersedesReportId | uniqueidentifier null |
| ReportReceivedAt | datetimeoffset |
| EvidenceLevel | nvarchar(16): `Documented` \| `Summary` |
| EvidenceKind | nvarchar(24): `WhatsApp summary` \| `POS report` \| `Sales record photo` \| `Other` |
| EvidenceReference | nvarchar(1000) |
| Notes | nvarchar(2000) |
| Status | nvarchar(16): `Draft`, `Recorded`, `Verified`, `Disputed`, `Superseded`, `Voided` |
| Recorded / verified / disputed actor and time, ReviewMode, DisputeReason | — |
| IdempotencyKey | nvarchar(80) |
| RowVersion | — |

| Index | Key bytes |
|---|---|
| `UX_Reports_Reference` unique (MerchantId, PartnerReference, Version) | 16 + 200 + 4 = **220** |
| `UX_Reports_Idempotency` unique (IdempotencyKey) | **160** |
| `UX_Reports_ActivePeriod` unique (MerchantBranchId, PeriodStart) filter `Status IN ('Draft','Recorded','Verified','Disputed')` | **26**. Fixed periods turn "no overlapping reports" into a simple unique key. |
| `IX_Reports_Status` (MerchantBranchId, Status, PeriodStart) | **58** |

### 3.4 `ConsignmentSalesReportLines` (1A)

| Column | Type |
|---|---|
| Id, SalesReportId, ProductVariantId | uniqueidentifier |
| SkuSnapshot | nvarchar(80) |
| LineType | nvarchar(16): `Sale` \| `Refund` |
| PriceTermId | uniqueidentifier, **required** |
| UnitListPriceSnapshot | decimal(18,2) — the approved Standard price at the time |
| UnitNetPrice | decimal(18,2), **required**, must equal the term's `UnitNetPrice` |
| Quantity | int > 0, **required** |
| *Refund lines only:* RefundOfPeriodStart | date |
| *Refund lines only:* RestockableQuantity | int — sealed, unopened, not activated |
| *Refund lines only:* UnsellableReturnedQuantity | int — opened, damaged or activated, physically back at the shop |
| QuantityExplainingDiscrepancyId, QuantityExplainingDiscrepancy | (§8) |
| Notes | nvarchar(1000) |

| Index | Key bytes |
|---|---|
| `UX_Lines` unique (SalesReportId, LineType, ProductVariantId, PriceTermId) | **80** |

### 3.5 `ConsignmentStocktakes` (1B)

| Column | Type |
|---|---|
| Id, MerchantId, MerchantBranchId | uniqueidentifier |
| CountDate | date, Malaysia time |
| CutoffAt | end of that day |
| CountedBy | nvarchar(200) |
| EvidenceKind, EvidenceReference, Notes | — |
| Status | `Draft`, `Recorded`, `Approved`, `Voided` |
| PreviousStocktakeId | uniqueidentifier |
| Approver, ReviewMode, IdempotencyKey, RowVersion | — |

| Index | Key bytes |
|---|---|
| `UX_Stocktake_Open` unique (MerchantBranchId) filter `Status IN ('Draft','Recorded')` | **16** |
| `UX_Stocktake_Cutoff` unique (MerchantBranchId, CutoffAt) filter `Status = 'Approved'` | **26** |
| `UX_Stocktake_Idempotency` unique (IdempotencyKey) | **160** |

### 3.6 `ConsignmentStocktakeLines` (1B, frozen at approval)

Columns per SKU: opening (each bucket), movements by type, ExpectedSellable, ExpectedUnsellable, OpenSurplusBefore, **CountedSellable**, **CountedUnsellable**, computed variances, ClosingBuckets (all five), OpenSurplusAfter.

| Index | Key bytes |
|---|---|
| `UX_StocktakeLines` unique (StocktakeId, ProductVariantId) | **32** |

### 3.7 `ConsignmentStockDiscrepancies` (1B)

| Column | Type |
|---|---|
| Id, MerchantId, MerchantBranchId, ProductVariantId, OriginStocktakeId | uniqueidentifier |
| Kind | `Shortage` \| `Surplus` \| `UnsellableFound` \| `UnsellableShortage` |
| Quantity, OpenQuantity | int |
| Status | `Open` \| `Resolved` |
| Notes, RowVersion | — |

| Index | Key bytes |
|---|---|
| `IX_Discrepancies_Open` (MerchantBranchId, ProductVariantId, Status) | **64** |
| `IX_Discrepancies_Origin` (OriginStocktakeId) | **16** |

### 3.8 `ConsignmentDiscrepancyResolutions` (1B, append-only)

| Column | Type |
|---|---|
| Id, DiscrepancyId | uniqueidentifier |
| Outcome | nvarchar(32) — §6.4 |
| Quantity | int |
| LinkedSalesReportId, LinkedUnitId, ReviewEventId | uniqueidentifier, nullable |
| Notes | nvarchar(1000) |
| Actor, RecordedAt | — |

| Index | Key bytes |
|---|---|
| `IX_Resolutions` (DiscrepancyId) | **16** |

**New index on an existing table:** `IX_ReviewEvents_Subject` (SubjectType nvarchar(32), SubjectId) = **80**.

### 3.9 Pre-existing index over the limit — fix in the 1A migration

`IX_ConsignmentReviewEvents_DispatchId_Action_RequestReference` (`migration.sql:12098`) keys `uniqueidentifier` (16) + `nvarchar(40)` (80) + `RequestReference nvarchar(1000)` (2,000) = **2,096 bytes**.

SQL Server creates such an index with only a warning. But any review event whose action reference is longer than about **800 characters** will fail to insert at runtime, surfacing as a server error, even though the API accepts references up to 1,000 characters (`ConsignmentDtos.cs:25`).

**Fix:** drop the index and recreate it as (DispatchId, Action) INCLUDE (RequestReference). That is **96 bytes**, and it still serves the receipt replay lookup (`ConsignmentService.Receiving.cs:101-102`). The table's data is unchanged.

---

## 4. Prices, promotions and refunds without double counting (Q3)

### 4.1 One way to express each thing
| Real-world event | Recorded as | Never recorded as |
|---|---|---|
| Normal sale | `Sale` line, Standard price term, quantity | — |
| Approved promotion | `Sale` line referencing the **Promotion** price term. Net price = the term's price. | A separate "discount" amount |
| Unapproved price | **Cannot be verified.** Dispute the report, or approve a promotion first if the partner genuinely had one, with evidence. | Accepted silently |
| Customer refund (real event) | `Refund` line in the **current** report, referencing the period of the original sale | An edit to the earlier report |
| Mistake in an earlier report | A **correction** (new version that supersedes the old one) | A refund line |

### 4.2 Value arithmetic (all derived, so a discount is never entered twice)
- Line gross at list = `Quantity × UnitListPriceSnapshot` (for information only).
- Line net value = `Quantity × UnitNetPrice` (Sale), or `−Quantity × UnitNetPrice` (Refund).
- Line promotional discount = `Quantity × (UnitListPriceSnapshot − UnitNetPrice)`. **Computed, never typed.**
- Report net sales value = Σ line net values. This is reported and informational only; no invoice, commission or payment is created (`ConsignmentService` creates none today, and this MVP adds none).

### 4.3 Refund validation
- Refunded quantity per (SKU, price term) can't exceed the cumulative verified sold quantity at that price, net of earlier refunds.
- Refund `UnitNetPrice` must equal the original line's net price.
- `RestockableQuantity + UnsellableReturnedQuantity ≤ Quantity`. The rest are refunds where the customer kept the tag, which has no stock effect.

### 4.4 Refund stock effect (D9)
| Refund kind | Ledger |
|---|---|
| Sealed, unopened, not activated, back on the shelf | Sold (unidentified) → **Sellable** (`CustomerReturnRestockable`). Requires an explicit "sealed and unopened" confirmation; the next stocktake corroborates it. |
| Opened, damaged or **activated**, physically back at the shop | Sold (unidentified) → **Unsellable on hand** (`CustomerReturnUnsellable`). It never goes back to sellable automatically. When collected, you identify it per unit. An activated tag still needs the separate customer-ownership procedure, because the existing return action refuses owner-linked tags (`ConsignmentService.cs:406-411`). |
| Customer kept the tag | No ledger entry; the financial refund only |

---

## 5. Verification procedure, including limited evidence (D3, D5)

Verification is **Recorded → Verified** by the founder using Solo self-review. The reason must be at least 10 characters, and the evidence reference must equal the report's `EvidenceReference`, following the existing self-review pattern. The review is journalled with `SubjectType = SalesReport`.

**Checks the server enforces (all levels):**
1. Every line has a SKU, a quantity > 0 and an **approved** price term valid for the period and agreement version.
2. The period is a canonical 1st–15th or 16th–end period (or a version-boundary split), with no other active report for that branch and period.
3. The period lies within **one** approved agreement version's effective dates.
4. Verifying can't take Sellable below zero for any SKU. If the shop reports more sales than the books allow, dispute the report or resolve a discrepancy first.
5. Refund limits (§4.3).

**Checks shown as warnings that you must acknowledge in the reason:**
- **Activation cross-check:** activated units still in partner custody for a SKU exceeded Sold (unidentified) after this report. That points to under-reporting or packages leaving another way; activation is never treated as a sale.
- The report arrived more than 7 days after the period ended.
- A Summary-level report is followed by a stocktake variance in the same SKU (shown in 1B).

**Evidence levels:**
| Level | Examples | Outcome |
|---|---|---|
| `Documented` | POS report, photo of the sales book or receipts with per-SKU detail | Verified, corroborated at verification |
| `Summary` | WhatsApp summary from the shop's agreed contact | Verified **pending corroboration**. Line `CorroboratedByStocktakeId` stays empty until the next approved stocktake shows zero unexplained variance for that SKU (1B). If a variance appears, the discrepancy lists the Summary reports in that window as the first thing to check. |

A future settlement phase can require "Documented or Corroborated" lines. This MVP calculates no money.

**Disputed:** you record a reason. Nothing posts. The shop's corrected summary becomes version 2, which supersedes version 1.

---

## 6. Stocktake, surplus and investigation (Q1, D2, D8)

### 6.1 Expected figures at the cutoff (per branch and SKU)
`BookSellable` and `BookUnsellable` = ledger balances with `EffectiveAt ≤ CutoffAt`. `OpenSurplus` = the sum of open Surplus discrepancies (notes only).

### 6.2 Approval algorithm (one transaction, approval policy applies)
1. **Unsellable first.**
   - `newUnsellable = max(0, CountedUnsellable − BookUnsellable)` → post Sellable → Unsellable for `min(newUnsellable, BookSellable)`, and open an `UnsellableFound` discrepancy. Damaged stock is investigated, not written off.
   - `unsellableShort = max(0, BookUnsellable − CountedUnsellable)` → post Unsellable → Investigation, and open an `UnsellableShortage` discrepancy.
2. **Sellable.** `expectedPhysical = BookSellable′ + OpenSurplus` (where `BookSellable′` is after step 1). Then `diff = CountedSellable − expectedPhysical`.
   - `diff < 0` (**shortage**): first reduce OpenSurplus by `min(OpenSurplus, |diff|)` and resolve those surplus notes as "no longer present". Post the remainder `r` as Sellable → Investigation and open a `Shortage` discrepancy. `r ≤ BookSellable′` always holds because counts can't be negative, so the ledger never goes negative.
   - `diff > 0` (**surplus**): open a `Surplus` discrepancy for `diff`. **Nothing is posted.** Sellable stays at book.
3. **Gates:**
   - the custody tie-out balances;
   - no **Recorded** (unverified) report ends on or before the cutoff;
   - no report straddles the cutoff.
4. **Freeze** the lines and set corroboration on the Summary report lines in this window for SKUs where this approval opened **no new discrepancy of any kind**.

**Why surplus is safe:** physical stock can only exceed book stock if units recorded as sold, lost or under investigation are actually on the shelf, or because of a counting error. The system never creates sellable units from nowhere. A surplus stays as an open note until one of the bounded resolutions below moves real quantity back from the bucket it actually came from. Each such move is limited by that bucket's balance, so no ledger balance can go negative. The note carries forward, so the next stocktake compares against book + open surplus and doesn't raise the same surplus twice.

### 6.3 Approved closing and carry forward
After approval, **book + open surplus = counted**. The next period's opening is exactly the frozen closing buckets, and its expected sellable at any time is the ledger balance. No new stock movement, reservation or unit change happens.

### 6.4 Resolution outcomes (each one recorded, reviewed, and limited by the discrepancy's open quantity and the source bucket's balance)
| Discrepancy | Outcome | Ledger |
|---|---|---|
| Shortage | **Found** at the shop | Investigation → Sellable |
| Shortage | **Explained by a verified late report** (§8.3) | Investigation → Sold (unidentified) |
| Shortage | **Approved loss** under the agreement's loss terms, with evidence | Investigation → Lost (unidentified). Units stay accountable; nothing is written off. |
| Shortage | **Found damaged** | Investigation → Unsellable |
| UnsellableFound | **Collected and returned** | Per-unit identified return (existing) → Unsellable → External |
| UnsellableFound | **Recount: actually sellable** | Unsellable → Sellable |
| Surplus | **Sales over-reported** | Correction report (§8.2) reverses Sold → Sellable |
| Surplus | **Unreported sealed customer return** | Refund line, restockable |
| Surplus | **Earlier shortage found** | Investigation → Sellable |
| Surplus | **Earlier approved loss found** | Lost → Sellable |
| Surplus | **Delivery-time missing unit is actually at the shop** | Existing per-unit receiving resolution; you identify the specific package |
| Surplus | **Recount error** | No posting; the note is closed |

---

## 7. Carry forward, renewal, replenishment, exchange, end

| Event | Rule |
|---|---|
| **Monthly carry forward** | §6.3. It is a close, not a movement. |
| **Renewal / revision (D10)** | A new agreement version is created and approved through the existing flow. **The ledger is keyed by merchant branch and SKU, not agreement version, so nothing is posted.** Units keep their original dispatch and version history. The new version needs its own approved Standard price terms: the previous ones are offered as drafts to approve, never applied automatically. Reports from the new effective date reference the new version. If the effective date isn't the 1st or 16th, that one period is split into two reports at the boundary. |
| **Gap between expiry and renewal** | Reports for the gap can be **recorded** but not **verified** until an approved version covers those dates. Nothing is lost, and nothing is verified without signed terms. |
| **Replenishment** | Normal reserve → dispatch → receipt of the new units only. Each Good unit posts External → Sellable once (§8.1). |
| **Exchange** | You collect and identify the specific packages. The existing per-unit return posts Sellable (or Unsellable) → External, then QA, release or write-off as today. Replacements are a normal dispatch. |
| **End of partnership** (Phase 2) | Final stocktake, then identified collection of unsold stock, then all discrepancies resolved and Unsellable = 0. Final disposition marks the remaining custody units `AggregateDisposition`; their count must equal Sold + Lost (unidentified). No claim is made about which unit was sold vs lost. The action is refused if the numbers don't match. Nothing is written off or released automatically. |

---

## 8. Posting rules — no double posting, no false identities (Q6)

### 8.1 Every source posts once
`UX_Ledger_Source (SourceType, SourceLineId, EntryType)`:

| EntryType | From → To | SourceType / SourceLineId | Posted when |
|---|---|---|---|
| `UnitCountedAtPartner` | External → Sellable | `ConsignmentUnit` / unit Id | A unit becomes Received/Good, at receipt or when a delivery discrepancy is resolved to Good. A unit can only become Good at the partner once per custody row. A re-dispatched tag is a new unit row. |
| `UnitReturned` | Sellable or Unsellable → External | `ConsignmentUnit` / unit Id | The existing return action on a unit counted at the partner |
| `IdentifiedHandover` | Sold (unidentified) → External (`AggregateSale`) or Sellable → External (`NonSaleWithdrawal`) | `HandoverRecord` / record Id | The existing per-unit handover. `Attribution` is required on tracked branches, and `AggregateSale` is refused if Sold (unidentified) = 0. A reported price is refused on tracked branches, because sales only enter through reports. |
| `Sale` | Sellable → Sold | `SalesReportLine` / line Id | Report verified |
| `SaleExplainsShortage` | Investigation → Sold | `SalesReportLine` / line Id | Report verified, for the part of the line linked to an open shortage (§8.3) |
| `CustomerReturnRestockable` / `CustomerReturnUnsellable` | Sold → Sellable / Unsellable | `SalesReportLine` / line Id | Report verified |
| `StocktakeUnsellableFound`, `StocktakeUnsellableShortage`, `StocktakeShortage` | §6.2 | `StocktakeLine` / line Id | Stocktake approved |
| `Resolution` | §6.4 | `DiscrepancyResolution` / resolution Id | Resolution recorded |
| `Reversal` | Inverse of the original | `ReversesEntryId` unique | Correction, or reverse handover |

All postings happen in the **same transaction** as the status change that causes them. That transaction uses the existing `RunAsync` transaction, the global consignment lock and the existing per-SKU locks, and checks `RowVersion`. A retried or replayed request either finds the status already changed (and returns the current record) or hits the unique key; it never posts twice.

### 8.2 Report corrections
Verifying version 2 does the following in one transaction:
1. Mark version 1 `Superseded`.
2. Post a `Reversal` for each of version 1's ledger entries.
3. Post version 2's entries.

If version 1's period is already closed, version 2's entries are dated now and flagged `IsPriorPeriodCorrection`; closed stocktake lines are never changed. Correcting a correction follows the same chain; the unique `ReversesEntryId` stops an entry from being reversed twice.

### 8.3 Late reports vs open shortages
When verifying a report for a period at or before the last approved cutoff, and a shortage is still open for that SKU, you choose a quantity per line that **explains the shortage**. That quantity posts Investigation → Sold and records a discrepancy resolution in the same transaction. The rest posts as a prior-period `Sale`. One sale can therefore never reduce stock twice.

### 8.4 No false identities
None of these postings change a `ConsignmentUnit`. Unit rows change only through the existing identified actions (receipt, return, handover) and, in Phase 2, final disposition by elimination. Activation never posts anything.

### 8.5 Bringing an existing delivery into tracking
The one-time **"Start stock tracking"** action replays `UnitCountedAtPartner` and `UnitReturned` for existing unit history, using the **same keys** as the live hooks. Running it twice, or running it after the hooks have already posted, adds nothing.

---

## 9. API (`/api/v1/admin/merchant-sales/consignment`)

| Phase | Endpoint | Capability |
|---|---|---|
| 1A | `GET stock-positions?merchantId=&branchId=` — buckets, provisional figures, activation cross-check, tie-out, delivery holds | `consignment.view` (existing) |
| 1A | `POST stock-tracking/start` | `consignment.sales_reports.verify` |
| 1A | `GET/POST price-terms`, `POST price-terms/{id}/approve`, `/withdraw` | `consignment.price_terms.manage`. Approval reuses `consignment.agreements.approve` (existing). |
| 1A | `GET/POST sales-reports`, `GET/PUT sales-reports/{id}` (Draft only), `POST …/{id}/record`, `/void` (Draft only) | `consignment.sales_reports.record` |
| 1A | `POST sales-reports/{id}/verify`, `/dispute`, `/correct` | `consignment.sales_reports.verify` |
| 1A | `GET stock-ledger.csv`, `GET sales-reports.csv` (date range ≤ 366 days, 10,000 rows, sanitized) | `consignment.manifest.export` (existing) |
| 1A | Existing receive, resolve, return and handover: add ledger hooks; handover gains `attribution` | Unchanged |
| 1B | `GET/POST stocktakes`, `PUT stocktakes/{id}` (Draft), `POST …/{id}/record`, `/void` | `consignment.stocktake.record` |
| 1B | `POST stocktakes/{id}/approve` (close and carry forward) | `consignment.periods.close` |
| 1B | `GET discrepancies`, `POST discrepancies/{id}/resolve` | `consignment.discrepancies.resolve` |

There are 6 new capabilities: `price_terms.manage`, `sales_reports.record`, `sales_reports.verify`, `stocktake.record`, `periods.close`, `discrepancies.resolve`. Each is added to `AdminCapabilities.cs`, `AdminCapabilityCatalog.cs` and `apps/web/src/lib/adminCapabilities.ts`. None is granted to a built-in role automatically; you grant them to your own role. All are covered by `AdminCapabilityCoverageTests`.

All writes take the actor from the JWT, require a `RowVersion` token, use idempotency keys on creation, and are audited. Verify, approve and resolve go through `Review()`.

---

## 10. Admin UI (redesigned Consignment workspace)

Tabs:
- **1A:** Overview · Agreements · **Dispatches** (renamed from Stock custody) · **Sales reports** · Reconciliation (existing exports) · Settings.
- **1B:** Reconciliation becomes **Stocktake & reconciliation**.

**Agreement detail (1A):** an "Approved selling prices" card, with Standard prices per SKU and promotions, each Draft or Approved.

**Sales reports (1A):**
- List: period, partner, status, evidence level, units, net value, next step.
- **Record sales report** wizard (same pattern as the agreement wizard):
  1. Partner and period. The next canonical period is suggested.
  2. One line per SKU and price term. The price is chosen from approved terms only; promotions appear only inside their dates. Add refund lines here.
  3. Evidence and review: evidence level and kind, reference, net value, provisional stock effect, warnings. Then **Save draft** or **Record as unverified**.
- Detail page:
  - original values and the version chain;
  - **Verify** (Solo self-review dialog, warnings to acknowledge);
  - **Dispute**;
  - **Correct**.
- Persistent notice: *"Reported sales never create invoices, payments or commission records."*

**Stock position card (1A, on Overview and the partner):** per SKU, on hand (sellable / unsellable), provisional, left the shelf (sold / lost / investigating), delivery holds, a ✓/✗ tie-out, and the activation cross-check.

**Stocktake & reconciliation (1B):**
- **Record stocktake:** expected shown read-only; enter counted sellable and unsellable. Live variance shows whether each SKU is a shortage, surplus or unsellable.
- **Close and carry forward** review, showing the gates, the resulting discrepancies and the next opening balance.
- A discrepancies list with outcome-specific **Resolve** forms.
- Stocktake history and exports.

---

## 11. Phase independence

| | 1A alone | 1A + 1B |
|---|---|---|
| Expected stock | Ledger balances, live | Plus frozen monthly closes |
| Monthly count | Recorded outside the system, with the shop's photo kept as evidence | In the system |
| Summary corroboration | Shown as "pending corroboration" | Set at stocktake approval |
| Late reports | Normal postings (no closed periods exist yet) | §8.2 / §8.3 rules |

1A needs nothing from 1B: no foreign key to stocktake tables, and its posting rules don't depend on stocktakes. 1B only **adds** tables, one nullable column (with its foreign key) on a 1A table, and new entry types. It changes no 1A posting. The "closed period" checks in the 1A code read "latest approved stocktake cutoff", which returns none until 1B exists.

---

## 12. Example — 100 tags (40 / 30 / 30), Pawsome LW / Pawsome SD / My Boss LW

Approved price terms: Standard RM39.90 for all three SKUs; promotion "Opening week" RM34.90 for Pawsome LW, 1–7 Oct.

| Step | Pawsome LW | Pawsome SD | My Boss LW |
|---|---|---|---|
| 1 Oct joint count → full receipt (`UnitCountedAtPartner` ×100) | Sellable 40 | 30 | 30 |
| Report 1–15 Oct (WhatsApp **Summary**, verified): sold | 3 @ 34.90 + 2 @ 39.90 | 2 @ 39.90 | 4 @ 39.90 |
| Report 16–31 Oct (POS photo, **Documented**, verified) | 3 @ 39.90 | 3 | 3 |
| Book at 31 Oct | Sellable 32 · Sold 8 | 25 · 5 | 23 · 7 |
| Stocktake 31 Oct counted sellable / unsellable | 32 / 0 | 25 / 0 | 22 / 1 |
| Approval (§6.2) | diff 0 | diff 0 | Unsellable found 1 → Sellable 22, Unsellable 1, diff 0 |
| Discrepancies opened | — | — | UnsellableFound 1 |
| Summary report corroborated? | Yes | Yes | **No** (variance in this SKU) |
| Tie-out | 40 = 32 + 8 ✓ | 30 = 25 + 5 ✓ | 30 = 22 + 1 + 7 ✓ |
| Carry forward → 1 Nov opening | 32 | 25 | 22 (+1 unsellable) |
| Report 1–15 Nov: 1 refund, sealed, restockable, of an Oct 34.90 sale | Sold → Sellable 1 → 33 | | |
| Stocktake 30 Nov counts **34** Pawsome LW (book 33 after Nov sales of 0) | **Surplus note +1**; Sellable stays 33 | | |
| Shop's corrected 16–31 Oct report: 2 sold, not 3 (v2 verified) | Reversal 3 + Sale 2 → Sold −1, Sellable 34; surplus resolved "sales over-reported" | | |
| My Boss damaged package collected 5 Dec (identified, returned) | | | Unsellable → External; QA, then write-off decision per unit |
| Trial ends 30 Nov → v2 approved effective 1 Dec, prices re-approved | No posting; all balances carry forward | | |

No Tag Code is ever marked sold. At the end of November, 6 Pawsome LW units are still accountable in custody as "sold, identity unknown", until an identified handover or the final disposition.

---

## 13. Risks

| Risk | Control |
|---|---|
| Double posting on retry or replay | Status change + posting in one transaction; unique source key; `RowVersion` |
| Duplicate or overlapping reports | Fixed periods + filtered unique index; partner reference unique per version; idempotency key |
| Discount double counted | Discount derived from list − net; never entered |
| Refund double counted | Refunds only as refund lines, limited by cumulative sales; errors only as corrections |
| Aggregate sale + identified handover counted twice | `Attribution` required; prices refused on per-unit handovers; tie-out gate |
| Fictitious stock from a surplus | Surplus never posts; only bounded resolutions move quantity back |
| Negative balances | Every posting is checked against its source bucket |
| Variance silently becoming approved stock | Shortages go to Investigation; surpluses become notes; both carry forward until resolved |
| Activated tags back to sellable | Only sealed, unopened refunds are restockable; activated ones go to Unsellable; per-unit return refuses owner-linked tags |
| Unapproved prices | Verification requires an approved price term for the period and version |
| Weak evidence (WhatsApp) | Evidence level recorded; corroboration by the next stocktake; activation cross-check warning |
| Self-verification | Solo Mode only for the named founder, with reason, evidence and journal; Team Mode still enforces independence |
| Renewal gap | Reports can be recorded but not verified without an approved version |
| Over-long index keys | All new keys ≤ 220 bytes; the existing 2,096-byte key is fixed in 1A (§3.9) |
| Production data | All migrations additive; no backfill except the explicit, idempotent "Start stock tracking" action |

---

## 14. Phases and timing

| Phase | Deliverable | Needed by |
|---|---|---|
| 0 | Operate on the existing system: QA-pass the tags, pack from the manifest, joint count, full receipt; keep the shop's reports as evidence | First dispatch — **no development needed** |
| **1A** | Ledger, price terms, sales reports (record / verify / dispute / correct), stock position card, handover attribution, CSVs, index fix | Before the **first report verification**. Reports can be entered late without loss, but aim for about 2 weeks after dispatch. |
| **1B** | Stocktakes, approval = close and carry forward, discrepancies and resolutions, corroboration | Before the **first month-end close** (about 30 days after dispatch) |
| 2 | Final disposition, private evidence attachments, activation-assisted identification | Before any partnership ends |
| 3 | Settlement and e-Invoice (out of scope) | After tax review |

**Recommendation:** the MVP is **not** required before the first physical dispatch. **1A is required before you verify the first sales report, and 1B before the first month-end close.**

---

## 15. Remaining small decisions (defaults proposed)

1. **Who is the shop's authorized reporting contact** for WhatsApp summaries? Default: one name, recorded in the agreement's terms text.
2. **Late-report warning threshold.** Default: 7 days after the period ends.
3. **Approved loss timing.** Default: a shortage can be approved as a loss only after at least one further stocktake confirms it.
4. **Renewal effective date.** Default: prefer the 1st or 16th, to avoid splitting a period.

## 16. Approval checklist

- [ ] Workflow (§1) and on-hand vs accountability model (§2)
- [ ] 8 tables, 4 nullable columns (§3), and the existing index fix (§3.9)
- [ ] Pricing, promotion and refund model (§4)
- [ ] Verification with Summary evidence and corroboration (§5)
- [ ] Surplus and shortage algorithm (§6)
- [ ] Renewal and carry-forward rules (§7)
- [ ] Posting and idempotency rules (§8)
- [ ] Phase 1A scope, then 1B (§11, §14)
