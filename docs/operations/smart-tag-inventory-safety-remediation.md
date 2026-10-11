# Smart Tag Inventory Safety Remediation: Implementation Report

**Prepared:** 2026-10-11 (locally; nothing committed, pushed or deployed)
**Based on:** [`smart-tag-sellable-inventory-audit.md`](smart-tag-sellable-inventory-audit.md)

## Release status: BLOCKED (not approved)

The production diagnostic results ([`diagnose-smart-tag-sellable-inventory.sql`](../deployment/sql/diagnose-smart-tag-sellable-inventory.sql)) **were not available** when this was prepared. So:

- This report does **not** assume that production inventory is QA-enrolled or approved.
- No data correction of any kind was made or is proposed, and no QA status was changed.
- The code changes and tests are ready for review. The release must not be deployed until the diagnostic has been run and §8 step 1 is complete.
- The final business decisions are implemented (next section). The only open blockers are the production checks X1–X4.

> **Stock purpose (2026-10-11).** A new sale now also requires the unit to be commercial stock (`StockPurpose = Sale`). Testing samples and unclassified stock are never sold. This ships in the same API build and adds one migration. See [`smart-tag-stock-purpose-separation.md`](smart-tag-stock-purpose-separation.md). The diagnostic's `SellableAfterRemediation` column does not account for purpose; use script 03's expected catalogue stock instead.

## Final business decisions (2026-10-11): implemented, deployment still BLOCKED

The decisions below were made after the pre-deployment review and are now implemented and tested. They supersede the recommendations in §R1, §R3 and §R4 and decisions D2, D3 and D5 in §7. Production diagnostic results are **still unavailable**, so deployment remains **BLOCKED** (see "Remaining release blockers" below).

| # | Decision | Status | What is implemented |
|---|---|---|---|
| **B1** | Fulfilment hold | **Approved** | Unchanged from §R2-a. Retail and merchant orders cannot reach Ready to Ship or Shipped unless every tag on them passed QA. Paid orders, payments, reservations and assignments are preserved. An admin can inspect the tag (enroll, then pass) or change the assigned tag to a Passed one. Tags already issued keep working |
| **B2** | Legacy reactivation | **Approved, tightened** | Only evidence recorded **on that tag** counts: fulfilment status Sent to Reseller, Received or Sent to Owner; a delivery date; **its own** merchant allocation shipped; or an owner activation in the audit log for **its** id. The order-level evidence from the review (the tag's order item → the order's ship date) was **removed**. A tag can stay linked to an order item after a different tag shipped in its place (for example, an assigned tag changed out before shipping and later returned to unclaimed), so that order's shipment is not evidence that this tag was issued. Scan history never counts |
| **B3** | Merchant quotations | **Decided: non-binding** | Send and Convert no longer read stock or take a stock lock, for every variant alike. `RequireMerchantQaStockAsync` was deleted. The quotation's own lock is kept, so an edit still cannot interleave with a send or conversion, and lost-commit handling is unchanged. Merchant allocation and fulfilment stay strictly QA-Passed. The quotation PDF and the quotation email (HTML and text) now say: *"Quotation only. Product availability is subject to confirmation at the time of order fulfilment."* Prices, payment, invoices and receipts are unchanged |
| **B4** | Website availability | **Decided** | Three separate states. **Launched / ordering enabled:** the build-time release flags; marketing "Available now" is unchanged and stays crawlable and indexable. **Variant in stock:** the catalogue's `inStock`, from QA-Passed shelf stock minus open reservations. **Variant temporarily out of stock:** the product picker shows every variant, labels each "In stock" or "Temporarily out of stock", and makes out-of-stock options unselectable. The order flow says *"Every tag option is temporarily out of stock. Please check back soon."* or *"Temporarily out of stock. Choose another option."* "Coming Soon" is **never** used for a stock shortage, and the ordering switch must not be turned off for one. The six marketing pages were not changed. Premium and GPS Safety stay Coming Soon |
| **B5** | Legacy tags returned to unclaimed without trustworthy history | **Approved** | Held until enrolled and inspected |
| **B6** | Batch QA | **Approved** | Each variant is released gradually, unit by unit, as it passes. Reservation and concurrency protections are unchanged. No manual stock-release feature was added |

**Final safety verification (new tests, real SQL Server).** A QA failure racing a shipment:

- Shipping re-reads and writes the tag row, and a QA save writes the same row under its concurrency tokens, so one of the two must lose.
- `ARetailShipmentRacingAQaFailureNeverShipsAFailedTag` (×3 rounds) and `AMerchantShipmentRacingAQaFailureNeverShipsAFailedTag` assert three things: an order is never Shipped with a tag that is not Passed; exactly one of the two operations succeeds; and the stored state matches the winner.
- Order history, payment records, reservation locking and QR/NFC activation are covered by the existing suites, which stay green.

**Remaining release blockers**

| # | Blocker | Cleared when |
|---|---|---|
| X1 | **Production diagnostic not run.** Production stock is **not** assumed to be inspected or approved | The SQL checklist in §R6 is completed and the results recorded |
| X2 | Fulfilment hold impact unknown | Result set 4 reviewed; every listed order or allocation has an owner for its resolution (inspect, or change tag) |
| X3 | Availability at deploy unknown | At least one QR + NFC variant has `SellableAfterRemediation > 0`. If none does, the business explicitly accepts that the order flow will show every option as temporarily out of stock until inspections complete. The ordering switch is not the remedy |
| X4 | Unenrolled shelf stock | If `OnShelfNotEnrolled > 0` on any variant, the QA runbook's sales freeze is applied **now**, independent of this release |
| X5 | Business decisions | **Cleared:** B1–B6 decided (above) |

## Pre-deployment review (2026-10-11): deployment approval BLOCKED

This review was done before any deployment. Production diagnostic results are **still not available**, so deployment approval stays **BLOCKED** (§R6). Two narrowly scoped fixes were made and tested (§R2). Every remaining business-policy question is listed for approval (§R1). Sections 1–12 below describe the remediation as amended by this review.

### R1. Remaining business decisions (for approval)

> **Decided.** See "Final business decisions" above. The table below is kept as the review's record.

| # | Decision | Current state | Recommendation |
|---|---|---|---|
| **B1** | Paid, unshipped orders and unshipped merchant allocations holding a legacy (QA NULL) tag | **Fulfilment hold implemented** (§R2-a): they cannot be marked ready to ship or shipped until the tag is inspected or the assigned tag is changed to a Passed one. Nothing is cancelled, released or reassigned automatically | **Approve the hold.** Shipping such a tag is shipping uninspected stock, the very risk QA exists for. The diagnostic's result set 4 lists exactly which orders it will affect; review it before deployment |
| **B2** | Re-activating a legacy tag after an Admin "return to unclaimed" | **Implemented with trustworthy evidence only** (§R2-b). Allowed if the tag was sent out (reseller, owner), received by a reseller, delivered, shipped to a merchant, belonged to a retail order that shipped, or was activated by an owner (audit log). Scan history and a bare Admin claim do not count | Approve. Uninspected warehouse stock cannot be activated through this path (tested) |
| **B3** | Merchant quotations | **Unchanged.** Quotations are non-binding for stock: the Admin screens already say so ("Inventory is not reserved by this quotation. Availability will be confirmed during fulfilment."; conversion "…Inventory is not allocated or reserved by this step."). Allocation and fulfilment require Passed stock (tested). See §R3 for the remaining inconsistency | Decide (a) whether the merchant-facing quotation PDF/email should carry the same "stock is confirmed at fulfilment" statement (commercial wording, not added), and (b) which of the two consistent rules in §R3 to adopt |
| **B4** | Marketing pages say "Available now" from a build-time flag; they cannot see live stock | **Not changed** (§R4) | Decide between the operational rule and the live-availability component in §R4 |
| **B5** | Legacy tags returned to unclaimed **without** trustworthy history | Held until enrolled and inspected | Confirm; support can use Transfer for a tag that stays with an owner |

### R2. Logic gaps found and fixed (narrow, tested)

**a. Gap: an uninspected tag could still leave the warehouse.**

- **The gap.** The first remediation required Passed for every *new* commitment, but kept "NULL or Passed" at ready-to-ship and shipped for commitments made before it. A paid order assigned a legacy tag before deployment, or a merchant allocation of legacy stock, would therefore still ship an uninspected tag.
- **Fix.** `SellableInventoryRules.RequirePassedForFulfilment` now guards the four warehouse exits: retail ready to ship, retail shipped, merchant ready to ship and merchant shipped.
  - For a NULL tag the message is *"Tag X has not been physically inspected yet. Inspect it, or change the assigned tag to one that passed inspection, before it ships."*
  - The error code is the existing `physical_qa_required`, so the Admin UI already surfaces it.
- **Interaction with Admin fulfilment:**

  | Action | Behaviour on a held order |
  |---|---|
  | Mark preparing | Still allowed (the tag has not left) |
  | Change assigned tag | Allowed in Payment Confirmed, Preparing and Ready to Ship. The new tag must be Passed; the old tag returns to the shelf, still unsellable |
  | Enroll and pass the same tag | Enrollment accepts tags committed to Payment Confirmed, Preparing and Ready to Ship orders (with acknowledgement); once Passed, the same order ships with the same tag |
  | Replace Tag (after shipping) | Unchanged: the new tag must be Passed, and the order returns to Preparing |
  | Shipping status, payment status, reservation, order | Untouched by the hold |

- **Merchant orders:** the allocations are kept and readiness is refused. Release-and-reallocate (Passed stock) or inspect.
- **Not held:** tags already with owners (shipped or delivered before deployment) keep activation, scanning, pet reassignment and transfer.

**b. Gap: legacy reactivation after "return to unclaimed".**

- **The gap.** The return action clears `ActivatedAt`, so a genuinely issued legacy tag could lose its only evidence of issuance.
- **Fix.** `MayBeHandedToOwnerAsync` now also accepts an owner activation in the audit log for this tag (`tag.activate-retail` / `tag.activate-assigned`, through the `Entity, EntityId` index), which survives the return.
- **Final decision (B2).** The review also accepted the tag's order item's shipped order. That was **removed**: the order can have shipped a different tag that replaced this one, so only records on the tag itself count.
- **Still not accepted:** scan history, a bare Admin claim, no history. Those stay held, so uninspected warehouse stock cannot be activated.
- The two audit action names now live in one place (`SellableInventoryRules`), shared with `SmartTagService` that writes them.

### R3. Merchant quotations: remaining inconsistency (no code change)

> **Resolved by B3:** option 1 (non-binding) was chosen and implemented, with the merchant-facing disclaimer. The text below records the review's finding.

The QA stock check on quotation Send and Convert (`RequireMerchantQaStockAsync`) runs **only for SKUs that have at least one enrolled tag**:

| SKU state | Send / Convert |
|---|---|
| Has enrolled stock (e.g. once the 900 shipment is enrolled) | Requires enough **Passed** units |
| Never enrolled | Never checked |

Neither case creates a stock commitment: no inventory is reserved or allocated by a quotation or its conversion, and allocation always requires Passed stock (tested). The behaviour is therefore safe but inconsistent. Two consistent options:

1. **Quotations are non-binding:** remove the QA stock check at Send and Convert altogether. This matches the Admin copy.
2. **Quotations reflect sellable stock:** check Passed availability for every SKU. This blocks quoting un-inspected SKUs.

Not changed: this is a commercial decision (B3).

### R4. Product availability

| Surface | Source | Reflects QA-Passed stock? |
|---|---|---|
| Public catalogue `inStock` (per variant) | `SellableUnit` minus pre-ship reservations | Yes (tested) |
| Order flow product picker and "temporarily unavailable" notice | Catalogue `inStock` | Yes |
| Delivery quote and checkout | Same availability service, under the per-SKU lock | Yes (tested) |
| Marketing "Available now", "Get a Smart Tag" (home, pricing, Smart Tag page, Where to Buy, login benefits) | Build-time release flags | **No:** cannot see live stock |

**Gradual QA release by variant is supported.** Each unit becomes sellable for its own SKU the moment it passes; no variant waits for the others, and nothing requires all 900 tags to be inspected. A variant with no Passed units is simply not offered in the order flow.

**Marketing can contradict availability** only when *every* variant has zero sellable units. Options:

> **Decided (B4):** Smart Tags have launched, so a stock shortage is shown per variant as "Temporarily out of stock" in the picker and order flow. Neither "Coming Soon" nor turning ordering off is used for it. Option (a) is kept below without its rebuild step; option (b) was not adopted.

- **(a) Operational rule, no code.** Deploy only when at least one variant has `SellableAfterRemediation > 0`. Run `npm --workspace apps/web run verify:smart-tag-catalog` daily during the QA ramp.
- **(b) Live-availability component (not implemented).**
  - **Behaviour.** One shared client component replaces the static badge and button on the marketing surfaces. It renders the build-time state first. If the public catalogue then answers successfully with no in-stock QR + NFC variant, it shows "Temporarily out of stock" and a non-purchase action. If the catalogue fails, it keeps the build-time state (the order flow remains the authority).
  - **Why not implemented.** It touches six public surfaces and their copy, and adds a catalogue call to marketing page views (which can wake the database). It is a product and UX decision.

Production availability of the three variants **could not be confirmed as QA-Passed**. The live API still runs the pre-remediation rule, so its `inStock` counts NULL stock.

### R5. Diagnostic SQL review

**Production safety (verified):**

- Only `SELECT` statements and session `SET`s; no `INSERT`, `UPDATE`, `DELETE`, `MERGE`, DDL, `EXEC` or temp tables.
- `READ COMMITTED`, plus the review additions `SET LOCK_TIMEOUT 5000` (never waits behind a live checkout for more than 5 s) and `SET DEADLOCK_PRIORITY LOW` (yields first).
- Exits early if the QA schema is absent.

**Correctness (verified):**

- Run against a database built from the repository's deployable `migration.sql`, with synthetic data whose expected values were derived from the code (§3.2 of the audit). Every figure matched.
- Result set 1's "offered publicly" filter matches `TagCatalogService.ListPublicAsync` exactly (product published and not archived; variant active, purchasable, not archived, QR and NFC).
- Enum comparisons use the stored string names.

**Review additions:**

| Result set | Addition |
|---|---|
| 1 | `PhantomReservations` and `SellableAfterRemediation` columns |
| 4 | Now states that every row will be on fulfilment hold |
| 5 | `ReservesAfterRemediation` per order |
| 6 (new) | Per SKU: legacy unclaimed tags that may be handed to an owner after the remediation vs those held until inspected, with the evidence that allows it. After B2, only tag-level evidence: fulfilment step, delivery, its own merchant shipment, recorded owner activation |

### R6. Release blockers

| # | Blocker | Cleared when |
|---|---|---|
| X1 | Production diagnostic not run | The SQL checklist below is completed and the results recorded |
| X2 | Fulfilment hold impact unknown | Result set 4 reviewed; every listed order has an owner for its resolution (inspect, or change tag), and B1 approved |
| X3 | Availability at deploy unknown | At least one QR + NFC variant has `SellableAfterRemediation > 0`, or the business accepts every option showing "Temporarily out of stock" (B4). Never a "Coming Soon" rebuild |
| X4 | Unenrolled shelf stock | If `OnShelfNotEnrolled > 0` on any variant, the QA runbook's sales freeze is applied **now**, independent of this release |
| X5 | Business decisions | **Cleared** (final business decisions above) |

**Exact SQL results needed before deployment** (from `diagnose-smart-tag-sellable-inventory.sql`, run read-only in production):

| Result set | What to record | Action |
|---|---|---|
| 1 | For each of `PAWSOME-LW-QR-NFC`, `PAWSOME-SD-QR-NFC`, `MYBOSS-LW-QR-NFC`: `Registered`, `QaNotEnrolled`, `QaPending`, `QaPassed`, `QaFailed`, `QaNeedsReview`, `OnShelfNotEnrolled`, `OnShelfPassed`, `OutstandingRetailReservations`, `SellableToday`, `PhantomReservations`, `SellableAfterRemediation` | `OnShelfNotEnrolled > 0` → X4 freeze. `SellableAfterRemediation` → X3 |
| 2 | Each batch: `QaNotEnrolled`, `ShipmentReference`, `ShipmentEnrolledAt` | Confirm whether the 900-code batch is enrolled |
| 3 | The enrolled shipment row(s): `ExpectedCount` = 900? | — |
| 4 | Every row (order or allocation number, tag code, QA status) | Each row will be held → assign an owner for resolution (X2) |
| 5 | Rows with `ReservesAfterRemediation = 0` | Confirms the phantom reservations released |
| 6 | `HandOverAllowedAfterRemediation` vs `HeldUntilInspected` per SKU | Confirms legacy activation impact (B2/B5) |

### R7. Deployment order

1. Run the diagnostic (X1); apply the freeze if needed (X4); review result set 4 (X2).
2. Decisions: done (X5 cleared).
3. Ensure sellable stock, or record the business's acceptance of a temporary out-of-stock (X3).
4. **Deploy the API** (this remediation; no migration, no configuration).
5. Verify:
   - `GET /api/v1/tag-products` `inStock` matches `SellableAfterRemediation > 0` per variant;
   - `verify:smart-tag-catalog` passes;
   - one held order (if any) refuses ready to ship with the new message;
   - re-run the diagnostic.
6. **Web:** the picker and order-flow stock labels (B4) read the catalogue's `inStock` and work against either API build. Deploy them with SEO Phase 1, before or after the API.

### R8. Rollback safety

- **Code-only rollback.** Redeploy the previous API build; no data, schema or configuration was changed.
- **The previous build sells and ships NULL stock again immediately.** Before rolling back, if `OnShelfNotEnrolled > 0` or result set 4 is non-empty, pause purchasing (SKU purchasing off, or `Features:SmartTagOrderingEnabled=false`). That is a safety measure against selling uninspected stock, not a response to a stock shortage. Also tell fulfilment staff not to ship held orders until they are inspected.
- **Rolling back also restores** the old quotation stock check (enrolled SKUs only) and removes the quotation disclaimer.
- **Rolling back the phantom fix** only makes stock look lower again; it cannot oversell.
- **Rolling back the legacy-evidence rule** only makes fewer legacy tags activatable.
- Never clear `QaStatus`, un-enroll stock or edit order records as a rollback shortcut.

---

## Summary

| Area | Result |
|---|---|
| Business rule | New sales and new allocations consume only units that are **on the shelf AND passed physical QA**. QA NULL is never treated as Passed |
| Historical compatibility | Legacy (QA NULL) tags already **owned, assigned, issued or committed** keep activation, scanning, pet reassignment, transfer and the fulfilment of their existing order or allocation |
| Phantom reservations | Fixed: only orders that have **not yet shipped** reserve stock. Order history, payment records and replacement traceability are untouched |
| Catalogue agreement | `inStock`, the delivery quote and checkout read one number; a test checks they agree across 11 inventory states |
| Locking and expiry | Unchanged. The same per-SKU SQL Server application locks; reservation expiry unchanged |
| Schema / data migration | **None.** No `Exempt` status was introduced (§6) |
| Merchant quotations | Non-binding for every variant: no stock check or stock lock; a disclaimer on the PDF and email. Allocation and fulfilment remain Passed-only |
| Website availability | Per-variant "In stock" / "Temporarily out of stock" in the picker and order flow; marketing pages and Coming Soon features unchanged |
| API tests | **2,614 passed, 0 failed** (see §10) |
| Web tests | **4,203 passed, 4 skipped** (one unrelated, intermittently failing Moments editor test passed on rerun); typecheck and lint clean; SEO Phase 1 work intact |

---

## 1. Why the rule changed

The audit found one rule, `PhysicalQaReleaseRules.Released` ("QA NULL **or** Passed"), answering two different questions:

1. **May this unit be committed now?** That covers a sale, an order assignment, a merchant allocation, sending it out, or handing it to an owner for the first time.
2. **May a tag already in, or promised to, a customer's hands keep working?**

NULL had to be "released" for question 2, so that historical owners were not locked out. But that made every never-inspected tag sellable under question 1, including any shipment that was not yet enrolled.

The remediation answers the two questions separately.

---

## 2. Centralised eligibility: `SellableInventoryRules`

New file: `apps/api/MyPetLink.Api/Services/SellableInventoryRules.cs`. This is the only place the new-sale rule is written.

| Member | Definition | Kind |
|---|---|---|
| `PassedPhysicalQa` / `IsPassed` | `QaStatus = Passed` (NULL is not Passed) | Expression and in-memory form |
| `OnShelf(db)` | `Unclaimed`, not archived or deleted, `Generated`/`Printed`, no owner / pet / order / order item, no live merchant allocation | Expression |
| `SellableUnit(db)`, `SellableUnitOf(db, sku)` | `OnShelf AND PassedPhysicalQa` | Expression |
| `ItemHoldsReservation` | Order item whose order is `PendingPayment`, `PaymentProofSubmitted`, `PaymentConfirmed`, `PreparingTag` or `ReadyToShip` | Expression |
| `RequirePassedForNewCommitment(tags)` | 409 `physical_qa_required` (same code and message as before) | Guard |
| `RequirePassedForFulfilment(tags)` (review) | Fulfilment hold at the four warehouse exits; 409 `physical_qa_required`, with a resolution message for NULL tags | Guard |
| `MayBeHandedToOwnerAsync(db, tag)` | Passed; **or** QA NULL **and** demonstrably issued, by records on the tag itself (sent to reseller or owner, received by a reseller, delivered, its own merchant shipment, or a recorded owner activation). Pending, Failed and Needs Review never | Guard |

`PhysicalQaReleaseRules` remains, but is now explicitly the **historical-compatibility rule** (NULL or Passed) for tags already in, or committed to, customers' hands. Its unused `AndReleased` helper was removed, so a new-sale query cannot be built from the historical rule by mistake.

`TagOrderInventoryAvailabilityService` now:

- counts `SellableUnit` stock;
- exposes the single reservation computation (`GetOutstandingReservationsAsync`), which the physical-QA enrollment preview also uses (it used to keep its own copy);
- implements the single-SKU form through the batch form, so the two can never disagree.

---

## 3. Stage-by-stage behaviour

| Stage | Before | After | Rule |
|---|---|---|---|
| Public catalogue `inStock` | NULL or Passed | **Passed only** | `SellableUnit` |
| Delivery quote, checkout (pre-lock check and locked re-check) | NULL or Passed | **Passed only** | `SellableUnit` |
| Admin assign / change / replace order tag (the new tag) | NULL or Passed | **Passed only** | `RequirePassedForNewCommitment` |
| Merchant allocation (manual and automatic), eligible-unit counts | NULL or Passed | **Passed only** | `MerchantInventoryEligibility.For` → `SellableUnitOf` |
| Bulk Send to Owner / Send to Reseller (shelf → issued) | NULL or Passed | **Passed only** | `IsPassed` |
| Bulk Mark Received (reseller → received) | no QA check | unchanged | — |
| Admin **claim** of an unowned tag | NULL or Passed | Passed, or NULL **issued** | `MayBeHandedToOwnerAsync` |
| Public **retail activation** of an unowned tag | NULL or Passed | Passed, or NULL **issued** | `MayBeHandedToOwnerAsync` |
| Activation of a tag **assigned** to the owner | NULL or Passed | **unchanged** | historical rule |
| Admin assign-pet / transfer of an owned tag | NULL or Passed | **unchanged** | historical rule |
| Retail mark ready-to-ship / shipped | NULL or Passed | **Passed only: fulfilment hold** (pre-review: unchanged; see §R2-a) | `RequirePassedForFulfilment` |
| Merchant ready-to-ship / shipped | NULL or Passed | **Passed only: fulfilment hold** (see §R2-a) | `RequirePassedForFulfilment` |
| QR / NFC / legacy scanning | QA not consulted | **unchanged** | — |
| Merchant quotation Send / Convert | Stock check only for SKUs with an enrolled tag | **No stock check and no stock lock, for any variant** (B3). Non-binding; disclaimer on PDF and email | — |
| Reservation | Every non-cancelled order | Only orders not yet shipped | `ItemHoldsReservation` |

The SKU application locks (`SqlServerInventoryReservationLock`), lock order, retry strategy, reservation-expiry worker, payment flows, prices, catalogue, QR/NFC scan behaviour and public-profile privacy are unchanged.

---

## 4. Phantom reservations

| | |
|---|---|
| **Before** | An order item reserved `Quantity − assigned tags in Pending/Preparing/Delivered/Active` for any **non-cancelled** order. Once a delivered order's tag became Lost, Disabled or Archived, the item reserved one unit again, forever. |
| **After** | Only orders that have not shipped (`PendingPayment`, `PaymentProofSubmitted`, `PaymentConfirmed`, `PreparingTag`, `ReadyToShip`) reserve. Shipped and Delivered orders have physically consumed their units. |

**Unchanged, verified by tests:**

- **Open orders keep their reservation.** An open, unshipped order whose assigned tag is damaged and archived before shipping still reserves its unit, so no oversell is possible there.
- **Replacement after delivery is traced and counted once.** Admin Replace Tag moves the order back to `PreparingTag` and links the new tag to the same order item. The old tag becomes `Replaced` and keeps its order and order-item links. The replacement consumes exactly one shelf unit.
- **Order history is untouched.** Delivered orders, their items, their tag links and payment records are not modified. The fix changes only how stock is computed, never stored data.

---

## 5. Historical compatibility rules (explicit policy)

| Legacy (QA NULL) tag state | Allowed | Refused |
|---|---|---|
| Owned / assigned (Pending, Preparing, Delivered, Active) | Activation by its owner, scanning, pet reassignment, transfer | — |
| Assigned to a paid order **before** this release | Preparing; the order, payment and reservation are kept | Ready to ship / shipped until inspected or changed to a Passed tag (§R2-a) |
| Allocated to a merchant **before** this release | The allocation is kept | Merchant ready to ship / shipped until inspected, or released and reallocated (§R2-a) |
| Issued: sent to reseller, received, sent to owner, delivered, or shipped to a merchant | First hand-over to an owner (retail activation, admin claim) | — |
| **On our shelf** (Unclaimed, Generated/Printed, unlinked) | — | Catalogue stock, checkout, order assignment, merchant allocation, bulk send onward, claim, retail activation |
| Returned to unclaimed by an admin, **with** trustworthy history on the tag (recorded owner activation, fulfilment step, delivery, or its own merchant shipment) | Re-activation by its owner (§R2-b, B2) | — |
| Returned to unclaimed by an admin **without** such history (scan history or a bare claim alone do not count) | — | Re-issue until enrolled and inspected (B5) |

A legacy shelf tag becomes sellable only through the existing QA path: enroll its manifest, then inspect it to Passed.

**Paid or reserved orders are evaluated before deployment, then held.** After the pre-deployment review, an existing order or allocation holding a legacy tag keeps its payment, reservation and assignment, but cannot leave the warehouse until the tag is inspected or changed (§R2-a). The diagnostic's result set 4 lists every order this affects; reviewing it is release blocker X2.

---

## 6. Why no `Exempt` status and no migration

An `Exempt` QA status (or exemption columns) is only needed if the business wants to **sell historical shelf stock without inspecting it**. This release does not need one:

- Legacy tags already in customers' hands, or already issued, are covered by the historical rule and by issuance evidence (§5).
- Legacy shelf stock can be made sellable by the existing, audited enrollment and inspection path. That is the safer default for a finder-safety product.

If you decide that some historical stock should be sellable without inspection, that is the point to introduce an audited, capability-gated exemption, as an additive change with its own documentation. Until then: **no schema change, no data migration, no backfill**.

---

## 7. Decisions needing your input

| # | Decision | Current choice in this change |
|---|---|---|
| D1 | Run the production diagnostic and approve the release | **Not done**: release not approved |
| D2 | A legacy tag returned to unclaimed by an admin, then re-activated | **Superseded by B2:** tag-level history (recorded owner activation, fulfilment, delivery, its own merchant shipment) counts; order-level links and scan history do not |
| D3 | Merchant quotations | **Superseded by B3:** non-binding for every variant; disclaimer added |
| D4 | Open paid orders already holding a legacy NULL tag | **Superseded by §R2-a / B1:** fulfilment hold until inspected or changed |
| D5 | Customer-facing effect at deploy | **Superseded by B4:** a variant without Passed stock shows "Temporarily out of stock"; marketing "Available now" means launched and ordering open. Do not use the ordering switch for a shortage |

---

## 8. Production deployment sequence (when approved)

> Superseded in detail by §R6 (blockers and SQL checklist) and §R7 (deployment order). The steps below remain valid.

**0. Freeze still applies.** If the diagnostic (step 1) shows unenrolled stock on the shelf, follow the QA runbook's sales freeze (`smart-tag-physical-qa.md` §1) **now**. It does not depend on this release.

**1. Run the read-only diagnostic** in production and record, per QR + NFC variant:

| Column | Meaning |
|---|---|
| `OnShelfNotEnrolled` | Untested stock that is sellable today |
| `SellableToday` | What the live catalogue sells now |
| `SellableAfterRemediation` | **What it will sell after this release** |
| `PhantomReservations` | Units the fix frees |

Also record result set 4 (open commitments holding non-Passed tags) and result set 5 (open reservations).

**2. Review commitments** (decision D4). Change assigned tags to Passed ones where appropriate, using the Admin order's change-assigned-tag action (audited). Never change QA status directly.

**3. Ensure sellable stock** (B4, X3). Enroll and inspect until `SellableAfterRemediation` covers expected demand, or accept a temporary out-of-stock (shown per variant, never as Coming Soon).

**4. Deploy the API only.**
- No database migration; no new configuration or secrets.
- The web app reads `inStock`. Its stock-label change (B4) ships with SEO Phase 1, in either order relative to the API.
- `Program.cs` also carries your uncommitted marketing-demo edits and the SEO Phase 1 middleware line, so stage selectively.

**5. Post-deploy checks** (read-only):
- `GET /api/v1/tag-products`: each variant's `inStock` equals `SellableAfterRemediation > 0` from step 1.
- `PUBLIC_API_BASE_URL=… NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED=true NEXT_PUBLIC_TAG_ORDERS_ENABLED=true npm --workspace apps/web run verify:smart-tag-catalog`.
- Re-run the diagnostic: `SellableToday` now matches what the catalogue reports.
- Watch for `409 out_of_stock` and `physical_qa_required` in the API logs. They are expected only for untested stock.
- Admin → Operational Status: Smart Tag ordering matches the website.

## 9. Rollback

- **Redeploy the previous API build.** No data was changed by this release, so there is nothing to restore.
- **Before rolling back,** check the diagnostic's `OnShelfNotEnrolled`. The previous API sells QA-NULL shelf stock again **immediately**. If any exists, pause purchasing first (SKU purchasing off, or `Features:SmartTagOrderingEnabled=false`), exactly as the QA runbook requires before returning to an older API.
- Rolling back the phantom-reservation fix only makes stock look lower again; it cannot oversell.
- Never clear `QaStatus` or un-enroll stock as a rollback shortcut.

---

## 10. Regression test results (2026-10-11)

| Suite | Result |
|---|---|
| API, full (`dotnet test MyPetLink.Api.Tests`, SQL Server LocalDB available, nothing skipped), after the final business decisions | **2,614 passed, 0 failed** (pre-deployment review: 2,609) |
| Web typecheck (`tsc --noEmit`) and lint (`eslint`) | Clean |
| New: `Relational/SellableInventoryRelationalTests` | 19 passed |
| New: `PhysicalQaReleaseGateRelationalTests.ALegacyTagOnAPaidOrderShipsOnceItHasBeenInspected` | passed |
| New case: `TagCatalogServiceTests.Catalog_AdvertisesStockOnlyWhenPhysicalQaHasPassed(null → false)` | passed |
| Web, both flag projects (`npx vitest run`) | **4,203 passed, 4 skipped**. One run had a single failure in `PetMomentsManager.editor.test.tsx` (an existing, intermittent test this work did not touch); that file passed 17/17 on rerun. SEO Phase 1 intact |
| Diagnostic SQL with the new columns, against a throwaway LocalDB database built from `migration.sql` | Ran clean. Phantom = 1 and SellableAfterRemediation = 0 on the synthetic dataset, matching the new rule. Database dropped |

**New relational tests** (real SQL Server, real services):

| Test | Proves |
|---|---|
| `TheLastPassedUnitSellsExactlyOnceUnderConcurrentCheckouts` | 6 concurrent checkouts: exactly 1 succeeds, 5 get `out_of_stock`. NULL, Pending and Failed units alongside are never sold; `inStock` ends false |
| `ACheckoutRacingAQaFailureNeverSellsTheFailedUnit` (×3 rounds) | Checkout and a QA Fail race under the shared SKU lock. Either the checkout lost (`out_of_stock`, no order), or it won and its reservation can never be fulfilled by the failed tag (`physical_qa_required`). Stock ends at 0 |
| `TheCatalogueAdvertisesExactlyWhatCheckoutAccepts` | 11 states (5 QA states on the shelf; Passed but Lost, archived, sent to reseller, owned, reserved; partially reserved): `inStock` equals checkout acceptance and the expected rule for every state |
| `TheOrderingSwitchGatesCheckoutWithoutChangingWhatIsInStock` (on / off) | Ordering on: Passed sells, NULL is `out_of_stock`. Ordering off: `403 feature_disabled` for both. `inStock` unaffected |
| `AShippedOrderStopsReservingStockWhateverLaterHappensToItsTag` | Delivered orders with Lost, Disabled or Archived tags no longer reserve; a cancelled order holds nothing; an open order with a damaged tag still reserves; history links preserved |
| `AReplacementAfterDeliveryKeepsTraceabilityAndConsumesExactlyOneUnit` | Old tag `Replaced` and still linked; new tag on the same order item; exactly one unit consumed |
| `LegacyStockOnTheShelfIsNeverUsedForANewCommitment` | A NULL shelf tag is refused by the catalogue, merchant eligibility, checkout, assignment, claim, retail activation and bulk send. Nothing is written |
| `APaidOrderHoldingALegacyTagIsHeldUntilItsTagIsChangedToAnInspectedOne` (review) | A pre-existing NULL assignment can be prepared but not marked ready to ship (`physical_qa_required`, "not been physically inspected yet"). Order, payment, reservation and assignment are untouched. Changing to a Passed tag lets it ship; the legacy tag returns to the shelf, still unsellable |
| `AMerchantAllocationOfLegacyTagsIsHeldAtReadyToShipAndKept` (review) | Merchant readiness is refused for NULL allocations; all 14 allocations are kept |
| `ALegacyTagOnAPaidOrderShipsOnceItHasBeenInspected` (review, release-gate suite) | The same held order ships with the same tag once it is enrolled and passed |
| `ALegacyTagAlreadyWithItsOwnerActivatesScansAndTransfersAsBefore` | A legacy tag shipped before the release: the owner activates it, it scans exactly like a Passed tag, it transfers |
| `ALegacyTagReturnedToUnclaimedIsReactivatedOnlyWithTrustworthyIssuanceHistory` (×7, final) | After Admin "return to unclaimed": a recorded owner activation for this tag, or this tag's own fulfilment record of being sent to its owner, allows re-activation. Scan history only, a bare Admin claim, no history, another tag's activation, or a link to an order that shipped a different tag are all refused. Never stock for a new sale |
| `ARetailShipmentRacingAQaFailureNeverShipsAFailedTag` (×3), `AMerchantShipmentRacingAQaFailureNeverShipsAFailedTag` (final) | A shipment and a QA failure race on the same tag: never shipped with a non-Passed tag; exactly one wins; stored state matches the winner |
| `QuotationsAreNonBindingWhateverTheQaStateOfTheirStock` (final) | Send with only Pending stock and Convert with only Failed stock both succeed; nothing is allocated, no tag changes, sellable stock stays 0 |
| `F4_SendAndConvertNeitherWaitForNorAreRefusedByAQaDecisionInProgress` (×2, final) | While a QA decision holds the SKU lock, Send and Convert complete without waiting and are not refused |
| `F4A_*`, `F4B_*` quotation races (converted, final) | A draft edit still waits for Send or Convert (quotation lock) and the written lines are the ones loaded. Lost sessions and ambiguous commits still commit exactly once. **No SKU stock lock or stock count is ever taken** |
| `MerchantEmailTests.QuotationEmail_SaysAvailabilityIsConfirmedAtFulfilment`, `MerchantDocumentServiceTests.Quotation_SaysPlainlyThatItIsNotAnInvoiceOrAReceipt` (final) | The disclaimer appears in the email's HTML and text bodies and on the PDF |
| `ALegacyTagSoldThroughAMerchantOrResellerCanStillBeHandedToItsOwner` | A merchant-shipped NULL tag activates; a reseller-received NULL tag can be claimed |

**Mutation checks.**

- Restoring the original rules (NULL sellable, every non-cancelled order reserving) made 6 of the first 12 tests fail. The others assert behaviour both rule sets must preserve.
- In the pre-deployment review, letting NULL through the fulfilment hold and removing the order and audit evidence made all 5 tests aimed at those fixes fail.
- In the final round, putting the SKU stock lock back into quotation Send and Convert made 7 of the converted quotation tests fail.
- Each time the rules were restored byte for byte, rebuilt from a fresh timestamp, and the suites re-run green.

**Existing tests changed to the new policy** (none deleted):

| Test file | Change |
|---|---|
| `Relational/MerchantFulfilmentFixture`, `TagOrderCatalogIntegrationTests`, `TagCatalogServiceTests`, `Relational/ConcurrencyRelationalTests`, `PaymentReservationExpiryTests`, `Relational/PaymentReservationConcurrencyRelationalTests`, `Relational/SmartTagAssignmentRetryRelationalTests`, `InventoryCostingTests`, `AdminTagInventoryServiceTests` | Stock seeded to be sold, assigned, allocated or sent onward is now **inspected stock** (`QaStatus = Passed`). Each test's purpose is unchanged |
| `AdminSmartTagServiceTests` | The unclaimed registry tag and the returned tag are inspected stock |
| `AdminOrderServiceTests`, `AdminTagInventoryServiceTests` (review) | The tag a test ships is inspected stock, because of the fulfilment hold |
| `PhysicalQaTests` | NULL is now asserted unsellable and not merchant-eligible, while the historical rule still accepts it; Passed is sellable |
| `Relational/PhysicalQaReleaseGateRelationalTests` (+ `.Identity`) | Commitments made "before enrollment" are seeded as **historical** NULL assignments (`LinkHistoricalOrderTagAsync`, mirroring `LinkTagToOrder`), because the service no longer creates them. Bulk send now leaves a legacy shelf tag behind. Activation now refuses a never-issued legacy shelf tag and accepts a reseller-issued one |
| `Relational/PhysicalQaReleaseGateRelationalTests` (`.Quotations`, `.Identity`, main) (final) | The 12 quotation tests that asserted a stock check or stock lock now assert the non-binding rule (B3); each keeps its concurrency purpose (edit serialization, lost session, ambiguous commit, cancellation). None deleted |
| `PhysicalQaTests` (final) | The merchant check now uses allocation eligibility (`MerchantInventoryEligibility`) instead of the deleted quotation check |
| Web: `TagProductPickerDialog.test.tsx`, `TagOrderFlow.catalog.test.tsx` (final) | Per-variant "In stock" / "Temporarily out of stock" labels; an out-of-stock option can never be selected; no "coming soon" for stock |

---

## 11. Files changed (this remediation only)

**API (`apps/api/MyPetLink.Api/Services/`)**

| File | Change |
|---|---|
| `SellableInventoryRules.cs` | New |
| `TagOrderInventoryAvailabilityService.cs` | Sellable-unit count; single reservation computation; phantom fix |
| `PhysicalQaReleaseRules.cs` | Re-scoped to historical compatibility; `AndReleased` removed; `RequireMerchantQaStockAsync` deleted (final, B3) |
| `MerchantInventoryEligibility.cs` | Uses `SellableUnitOf` |
| `OrderService.cs` | Pre-lock stock check uses `SellableUnitOf` |
| `AdminService.cs` | New order tag requires Passed; retail ready to ship / shipped use `RequirePassedForFulfilment` (review) |
| `AdminTagInventoryService.cs` | Bulk send onward requires Passed |
| `AdminSmartTagService.cs` | Claim uses `MayBeHandedToOwnerAsync`; assign-pet and transfer unchanged |
| `SmartTagService.cs` | Retail activation uses `MayBeHandedToOwnerAsync`; assigned activation unchanged; activation audit action names shared (review) |
| `MerchantFulfilmentService.cs` (review) | Merchant ready to ship / shipped use `RequirePassedForFulfilment` |
| `PhysicalQaService.cs` | Enrollment preview uses the shared reservation computation |
| `MerchantSalesService.cs` (final) | Quotation Send / Convert: no stock check, no stock lock; quotation lock kept |
| `MerchantDocumentService.cs`, `MerchantEmailTemplateRenderers.cs` (final) | Quotation disclaimer on the PDF and in the email |

**Web (`apps/web/src/components/portal/`, final, B4):** `TagProductPickerDialog.tsx` (every variant shown, per-variant stock label, out-of-stock options disabled) and `TagOrderFlow.tsx` (out-of-stock wording), with their tests.

**Tests:** `Relational/SellableInventoryRelationalTests.cs` and `Relational/PhysicalQaReleaseGateRelationalTests.Races.cs` (new), `MerchantEmailTests.cs` and `MerchantDocumentServiceTests.cs` (disclaimer), and the updated test files listed in §10.

**Docs and SQL:**
- `docs/operations/smart-tag-inventory-safety-remediation.md` (this report).
- `docs/operations/smart-tag-physical-qa.md`: rule note, with the pre-release behaviour kept and labelled.
- `docs/operations/smart-tag-sellable-inventory-audit.md`: status line.
- `docs/deployment/sql/diagnose-smart-tag-sellable-inventory.sql`: `PhantomReservations` and `SellableAfterRemediation` columns; result set 6 counts tag-level evidence only (final, B2).

**Not changed:** marketing pages, prices, payment flows, catalogue data, QR/NFC scanning, public-profile privacy, database schema, migrations, production configuration, Premium and GPS Coming Soon. The completed SEO Phase 1 changes are preserved.

## 12. Verified vs assumed

| Verified | Assumed or not verified |
|---|---|
| Behaviour of every stage in §3 on SQL Server through the real services (tests) | Production inventory state: the diagnostic was not run (no production access from this machine) |
| Last-unit and QA-failure races serialised by the existing SKU locks; shipment-vs-QA races never ship a non-Passed tag | Behaviour under production-scale concurrency beyond the 6-way test |
| Diagnostic SQL runs against the deployable schema and matches the rule on synthetic data | Production volumes for result sets 4 and 5 |
| No schema, data or configuration change is needed | — |
