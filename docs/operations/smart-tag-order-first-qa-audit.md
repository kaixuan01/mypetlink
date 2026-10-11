# Smart Tag Order-First, QA-Before-Shipping: Audit and Design

**Prepared:** 2026-10-11. Audit only: no code, data, configuration or deployment was changed.
**Scope:** whether MyPetLink can take payment for a Smart Tag before that tag has passed physical QA, while still shipping only inspected tags.

Throughout, **Verified** means read from the code at `f7eda5d` or observed on the live site. **Inferred** and **Assumption** are marked where they apply.

---

## 0. Read this first: the live catalogue is selling now

**Verified (2026-10-11 10:33 UTC, public read-only request):** `GET https://api.mypetlink.com.my/api/v1/tag-products` reports **`inStock: true` for all three variants**:

| SKU | Price | In stock |
|---|---|---|
| `PAWSOME-LW-QR-NFC` | MYR 39.90 | true |
| `PAWSOME-SD-QR-NFC` | MYR 39.90 | true |
| `MYBOSS-LW-QR-NFC` | MYR 39.90 | true |

At about 07:00 UTC the same request returned `false` for all three, and you reported 0 QA-passed tags.

At 07:00 UTC the live API behaved like the inventory-safety remediation (`7e55282`). Under that rule, "in stock" means at least one tag of that SKU is:

- on the shelf;
- **QA Passed**;
- not covered by an open reservation.

If the uncommitted stock-purpose code were deployed, the tag would also have to be classified `Sale`. So one of these is true:

1. Tags of all three SKUs were inspected and passed in the Physical QA screen since 07:00 UTC; **or**
2. `QaStatus` was changed outside the inspection screen (for example by SQL); **or**
3. **The API now running does not contain the remediation rule.** An older or different build counts uninspected (QA NULL) stock as available. All 900 tags are QA NULL, so this alone makes all three SKUs "in stock" at once. Such a build would also **ship uninspected tags**, because it lacks the fulfilment hold.

**Customers can place orders right now.** Before anything else, run the read-only checks in §0.1.

### 0.1 Read-only checks to run (Production, SSMS / Azure Query editor)

```sql
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- Which migrations are applied (latest first).
SELECT TOP 5 MigrationId FROM dbo.__EFMigrationsHistory ORDER BY MigrationId DESC;

-- Is the uncommitted Stock Purpose column present? (NULL = not present)
SELECT COL_LENGTH('dbo.SmartTags', 'StockPurpose') AS StockPurposeColumnLength;

-- QA state per batch.
SELECT b.BatchNo, v.Sku, t.QaStatus, COUNT(*) AS Tags
FROM dbo.SmartTags t
JOIN dbo.TagProductVariants v ON v.Id = t.ProductVariantId
LEFT JOIN dbo.SmartTagBatches b ON b.Id = t.BatchId
WHERE t.DeletedAt IS NULL AND v.Sku IN (N'PAWSOME-LW-QR-NFC', N'PAWSOME-SD-QR-NFC', N'MYBOSS-LW-QR-NFC')
GROUP BY b.BatchNo, v.Sku, t.QaStatus
ORDER BY v.Sku, b.BatchNo, t.QaStatus;

-- Every Passed tag, with the evidence a genuine inspection always leaves.
-- A row with any NULL in the evidence columns, or AuditRows = 0, was NOT
-- passed through the inspection screen.
SELECT t.TagCode, v.Sku, b.BatchNo, t.QaShipmentReference, t.QaInspectedAt,
       t.QaInspectionId, t.QaNfcSerialNumber, t.QaQrVerifiedAt, t.QaNfcVerifiedAt, t.QaPhysicalCondition,
       (SELECT COUNT(*) FROM dbo.AuditLogs l
        WHERE l.Entity = N'SmartTag' AND l.EntityId = t.Id AND l.Action = N'tag-inventory.qa-inspected') AS AuditRows
FROM dbo.SmartTags t
JOIN dbo.TagProductVariants v ON v.Id = t.ProductVariantId
LEFT JOIN dbo.SmartTagBatches b ON b.Id = t.BatchId
WHERE t.QaStatus = N'Passed' AND t.DeletedAt IS NULL
ORDER BY v.Sku, t.TagCode;

-- Orders placed since the catalogue went in stock.
SELECT OrderNumber, Status, PaymentStatus, CreatedAt
FROM dbo.TagOrders
WHERE CreatedAt >= '2026-10-11T07:00:00+00:00'
ORDER BY CreatedAt;
```

How to read the results:

- **No Passed rows at all, but the catalogue says in stock:** the live API is not enforcing the remediation (case 3). Pause purchasing for the three SKUs (Admin → Tag Products → purchasable off) and republish the API from a clean checkout of `f7eda5d`.
- **Passed rows, all with full evidence and an audit row:** the passes are genuine. The live behaviour is correct: those inspected tags are sellable.
- **Any Passed row lacking evidence:** that tag was never inspected (case 2). It can be sold, assigned and shipped, because the fulfilment hold trusts `QaStatus = Passed`. Pause purchasing for the affected SKUs and tell me before any order is fulfilled.

---

## 1. Current production-aligned version

| Item | Status | How established |
|---|---|---|
| Git `main` / `origin/main` | `f7eda5d` "fix(inventory): stock receipts could never be saved". Nothing newer on any branch | **Verified** (`git fetch`) |
| Live website | **`f7eda5d`**. The admin bundle `/_next/static/chunks/16-dwz23lz6b9.js` contains that commit's new receipt message ("couldn't confirm whether this stock receipt was saved") and **none** of the stock-purpose text ("Commercial Stock", "Choose whether this batch is commercial stock or testing samples") | **Verified** (public JS) |
| Live API | **At or after `5bbe7c1`** (SEO): every response carries `X-Robots-Tag: noindex`. Whether it currently enforces the remediation (`7e55282`) **cannot be proven from outside**. It did at 07:00 UTC (all SKUs out of stock with 0 Passed); today's in-stock change is consistent with either genuine passes or a build without it (§0). Whether it includes `f7eda5d` is not visible either: the receipt endpoint answers 401 before validation runs | **Verified (partial)** |
| Uncommitted Stock Purpose code in the live API? | **Unknown.** If the API had been published from `C:\Project\MyPetLink` (which holds the uncommitted Stock Purpose work) **without** its migration, every catalogue request would fail. It succeeds, so either Stock Purpose is not in the API, or it is **and** the migration was applied | **Inferred**. Confirm with §0.1 |
| Database migrations | Committed code needs nothing newer than `20261008040433_AddCommunityModerationActions`. `20261011034923_AddSmartTagStockPurpose` exists only uncommitted | **Verified (code)**. Production table not visible: §0.1 |
| Stock Purpose Separation | Implemented locally, **not committed, not on the live website**. Probably not in the live API (above) | See above |

**Assumption used below:** the live API is `f7eda5d` without Stock Purpose. If §0.1 shows otherwise, §2–§3 describe the intended code, not what is running.

---

## 2. Actual current order-to-fulfilment workflow (Verified, `f7eda5d`)

| Step | What happens | Stock effect | Code |
|---|---|---|---|
| 1. Catalogue | `inStock` = sellable units minus open reservations > 0 | none | `TagCatalogService` → `TagOrderInventoryAvailabilityService.GetAvailableUnitsAsync` |
| 2. Checkout | Pre-check, then a re-check under a per-SKU SQL Server application lock; `409 out_of_stock` if short | **Reserves a quantity per SKU** (the order item). **No tag is chosen** | `OrderService.CreateAsync`, `EnsureAvailableAsync` |
| 3. Unpaid order | `PendingPayment`, `PaymentReservationExpiresAt` = now + setting (default **120 min**, range 30 min–72 h) | Reserved until paid or expired | `OrderCheckoutSettingsService`, `PaymentReservationExpiryWorker` |
| 4. Expiry | Cancels **only `PendingPayment`** orders past their deadline | Reservation released | `PaymentReservationExpiryService` |
| 5. Proof uploaded | `PaymentProofSubmitted`. **No expiry**: holds stock until an admin reviews | Still reserved, indefinitely | `OrderService` (proof) |
| 6. Proof rejected | Back to `PendingPayment` with a fresh payment window | Still reserved | `AdminService.ReviewPaymentProofAsync` |
| 7. Payment confirmed | `PaymentConfirmed` ("Payment confirmed. Tag preparation is next."). **No stock or tag check** | Still reserved | same |
| 8. Assign tag | Admin picks a shelf tag per unit. **Requires QA Passed** and the right SKU/variant | Tag leaves the shelf; the quantity reservation is now covered by the tag | `AdminService.AssignInventoryTagAsync` → `RequirePassedForNewCommitment` |
| 9. Preparing | Requires every unit to have an assigned tag | — | `MarkOrderPreparingAsync` |
| 10. Ready to Ship | **Fulfilment hold: every tag must be QA Passed** | — | `MarkOrderReadyToShipAsync` → `RequirePassedForFulfilment` |
| 11. Shipped | **Fulfilment hold again**, re-read under concurrency tokens | Order stops reserving | `MarkOrderShippedAsync` |
| 12. Delivered / activation | Owner activates the assigned tag (historical rule: QA NULL or Passed) | — | `SmartTagService` |
| Cancel | Allowed before shipping, **including paid orders**. Assigned tags return to the shelf. **`PaymentStatus` stays `Confirmed`: refunds are recorded off-system** | Reservation released | `AdminService.CancelOrderAsync` |
| Change assigned tag | Before shipping; the new tag must be Passed; the old tag returns to the shelf | — | `ChangeAssignedTagAsync` |
| Replace tag | After shipping; the new tag must be Passed; the old tag becomes `Replaced` | One unit consumed | `ReplaceTagAsync` |

**Answers to the specific questions:**

| Question | Answer |
|---|---|
| When is inventory reserved? | At checkout, as a **quantity per SKU**, under the SKU lock |
| Quantity, tag IDs or both? | **Quantity only**, until an admin assigns tags after payment |
| When is a Tag Code chosen or exposed? | At admin assignment, after payment confirmation |
| Two customers ordering concurrently? | Serialised by the per-SKU lock; the last unit sells once (tested: `TheLastPassedUnitSellsExactlyOnceUnderConcurrentCheckouts`) |
| Can an unpaid order hold stock indefinitely? | `PendingPayment`: no (expires). **`PaymentProofSubmitted`: yes, until reviewed** |
| Can payment be approved without a Passed tag? | **Yes.** Payment confirmation checks nothing about tags |
| A paid order that cannot be fulfilled? | It stays `PaymentConfirmed`. The only exit is admin **Cancel**, with the refund made outside the system |

---

## 3. Actual current inventory and QA eligibility logic (Verified)

All rules are in `apps/api/MyPetLink.Api/Services/SellableInventoryRules.cs`.

| Term | Definition |
|---|---|
| On the shelf | `Unclaimed`, not archived or deleted, fulfilment `Generated` or `Printed`, no owner, pet, order, order item or live merchant allocation |
| **Sellable unit** (catalogue, checkout, assignment, merchant allocation, bulk send onward) | On the shelf **AND `QaStatus = Passed`**. With the uncommitted Stock Purpose code, also `StockPurpose = Sale` |
| Reservation | Order items of orders that have not shipped (`PendingPayment`…`ReadyToShip`), minus assigned tags |
| Catalogue `inStock` | sellable − reservations > 0 |

**Stock Purpose (local only):** `Unclassified` (the default for every existing tag), `Sale`, `Test`. Nothing is `Sale` until script `02` runs, and the four older samples are only `Test` once you confirm their codes.

**Stock receipts are accounting only.**

- A receipt links unsold, unassigned shelf tags to a cost record (`SmartTags.InventoryReceiptId`).
- It does **not** affect sellability, QA or reservations (tested in `AReceiptNeverChangesPhysicalQaFulfilmentOrWhatIsSellable`).
- A receipt saved **without a batch** claims the *oldest* unreceived tags of the SKU. That could be the four older samples. **A receipt is not a trustworthy "this is commercial stock" signal by itself.**

**Physical QA (Verified, `PhysicalQaService`):**

| Requirement | Detail |
|---|---|
| Enrollment | A manifest (the shipment's code list) puts tags into `Pending`. It only accepts tags that are `Generated`/`Printed` and not sent onward. An enrolled shipment can never change its manifest |
| Pass | All of: a **camera** scan of the printed QR matching the tag code; a **Web NFC** read whose URL matches; a **chip UID** (one chip can pass for only one code); condition **Good**. Reader results are server-signed and tied to that inspection |
| Fail / Needs Review | A remark is required. The tag is then excluded from every sale and shipping step |
| Repeat inspection | Allowed with a remark. Every inspection is audited (`tag-inventory.qa-inspected`) |
| Printed Tag Code | Verified **indirectly**: if the operator looks the tag up by its printed code and the QR scan must match that code, printed text ↔ QR ↔ NFC are all compared. If the operator starts by scanning the QR, the printed text is not separately compared (a procedural point, §9) |

**Every guard that requires QA Passed (Verified):**

| Step | Requires Passed? | Notes |
|---|---|---|
| 1. Order creation (catalogue, checkout) | **Yes** (sellable unit) | **This is what blocks order-first** |
| 2. Payment confirmation | No | Already order-first friendly |
| 3. Tag assignment / change / replacement | **Yes** | Keep |
| 4. Ready to Ship | **Yes** (fulfilment hold) | Keep |
| 5. Shipment | **Yes** (re-checked, race-tested) | Keep |
| 6. Owner activation | Retail activation of an unowned tag: Passed, or NULL with tag-level issuance evidence. Assigned tag: NULL or Passed | Keep |
| 7. Merchant allocation / ready / shipped; bulk Send to Reseller/Owner | **Yes** | Keep |

---

## 4. What blocks "payment before QA" today

1. **Catalogue and checkout count only Passed stock.** With 0 Passed, nothing is orderable. This is the only *rule* that blocks order-first.
2. **Admin tag picker (confirmed UI gap):**
   - "Assign inventory tag" loads only the **first 100** unclaimed tags of the SKU, by code (`AdminOrdersManager.requestAction`). Its search filters only those 100.
   - It neither shows nor filters QA status. Uninspected tags are offered and then refused by the API, and a passed tag outside those 100 cannot be picked.
   - With 300 tags per SKU and inspection at fulfilment time, this matters.
3. **No "awaiting QA" signal.** The existing statuses can express it, but the admin has no count of "paid units still needing a passed tag" per SKU.
4. **Stock Purpose is not live.** Order-first makes uninspected tags orderable, so it would also make the four older samples orderable unless Stock Purpose (`Sale`) is live and applied first.

Everything after payment (inspect → pass → assign → ship, with holds) **already works** for order-first. An admin can inspect a shelf tag at fulfilment time, pass it, then assign it.

---

## 5. Risks and gaps

| # | Finding | Type | Severity |
|---|---|---|---|
| R1 | Live catalogue in stock since today; origin of the Passed tags unknown (§0) | **Open: needs your check** | **High** until checked |
| R2 | Admin tag picker shows only 100 tags and no QA status | **Confirmed defect** | Medium |
| R3 | `PaymentProofSubmitted` orders hold stock with no expiry | Confirmed (by design today) | Low–Medium |
| R4 | Paid cancellations keep `PaymentStatus = Confirmed`; refunds live outside the system | Confirmed (known limitation) | Medium with order-first, since unfulfillable paid orders become possible |
| R5 | Receipt without a batch can claim the old samples' tags | Confirmed behaviour | Low (always choose the batch) |
| R6 | Older samples sellable once Passed, while Stock Purpose is not live | Confirmed (Stock Purpose pending) | Medium with order-first |
| R7 | Oversell when more reserved units fail QA than spare stock exists | Hypothetical; new risk introduced by order-first | Depends on failure rate; bounded by §6 |
| R8 | QA evidence is trusted from admin devices (API-level forgery by an admin is possible) | Assumption: admins are trusted | Low |
| R9 | Printed text ↔ QR only compared if the operator types the printed code first | Procedural | Low |
| R10 | Same tag on two orders | Prevented (assignment re-checks shelf state; row-version tokens; tested) | — |
| R11 | Passed tag later damaged | Re-inspect → Failed; holds re-check at Ready to Ship and Shipped (race-tested) | — |
| R12 | Multi-tag orders | All tags must be assigned before Preparing, and all Passed before shipping; no partial shipments | — |

---

## 6. Recommended design: Orderable vs Fulfillable stock

**Two numbers, one rule file.**

| | Definition | Used by |
|---|---|---|
| **Fulfillable unit** (today's "sellable unit", unchanged) | On the shelf ∧ `Sale` ∧ **QA Passed** | Tag assignment / change / replacement, merchant allocation, bulk send onward, Ready to Ship, Shipped |
| **Orderable unit** (new) | On the shelf ∧ **`Sale`** ∧ **has a stock receipt** (`InventoryReceiptId` not null) ∧ **QA `Pending` or `Passed`** (enrolled, never Failed or Needs Review) | Catalogue `inStock`, delivery quote, checkout |
| Orderable stock | orderable units − open reservations | Same SKU lock as today |
| Fulfillable headroom (admin only) | fulfillable units − paid-but-unassigned units | Admin "awaiting QA" view |

**Why each condition:**

- **`Sale`** keeps the samples (`Test`) and every unreviewed tag (`Unclassified`) unorderable. Stock Purpose must therefore be live first.
- **A receipt** proves the stock physically arrived. Tag codes generated for a future production run can never become orderable.
- **Enrolled (`Pending`/`Passed`)** proves the code is on the received shipment's manifest. **Failed / Needs Review are excluded immediately**, so each failure lowers orderable stock at once, under the same lock.
- **QA NULL is not orderable.** Enrolling is one manifest upload per batch.

**Batch sampling as the "release for sale" gate (no new code).**

- Before a batch is classified `Sale` (script `02`), open and inspect a sample, for example 10–20 tags per batch.
- Classify the batch `Sale` only if the sample passes your threshold.
- The sample tags keep their own individual Passed status. The batch's other tags stay `Pending` until inspected at fulfilment.
- Sampling **never** marks untested tags Passed.

**Overselling (R7) stays bounded:** checkout can never reserve more than orderable stock, and each failure removes a unit from it. A paid order only goes short if more of its SKU fails *after* payment than the spare enrolled stock. For example, with 300 tags and a 2% failure rate, about 6 failures are spread across 300 units of headroom.

**Paid order → fulfilment (existing statuses, no new ones):**

| Status | Meaning in this workflow | Customer-facing text (existing) |
|---|---|---|
| Payment Confirmed | Paid; awaiting physical QA and tag selection | "Payment confirmed. Tag preparation is next." |
| Preparing Tag | A **Passed** tag is assigned | "Tag is being prepared." |
| Ready to Ship | Holds pass | existing |
| Shipped / Delivered | existing | existing |

**Operator flow per paid unit:**

1. Take a package of the SKU and open it.
2. In Physical QA, **type the printed code**, then scan the QR, read the NFC and check the condition.
3. Pass: assign that exact code to the order (the picker fix shows Passed tags first and searches all of them).
4. Fail: record Failed with the reason and **quarantine the package** physically (a "hold" tray). Take the next package.
5. No passing tag available: the order stays Payment Confirmed. Contact the customer: wait, switch variant, or cancel and refund (off-system, R4).

**Catalogue and checkout:** keep "In stock" / "Temporarily out of stock". Optionally add one line on the order page: *"Every tag is individually quality-checked before it ships."* That's a business decision; no dispatch-time promise is implied.

**Merchant / reseller:** no change. Allocation stays fulfillable-only, so QA happens before allocation. Merchant order creation already takes no stock (non-binding quotations).

**Backward compatibility:** historical orders, already-issued tags, activation, transfer and scanning are untouched. Only what counts as *orderable* changes.

---

## 7. Files, services and endpoints likely to change

| Area | File | Change |
|---|---|---|
| Rules | `apps/api/MyPetLink.Api/Services/SellableInventoryRules.cs` | Add `OrderableUnit` / `OrderableUnitOf`; keep `SellableUnit` as the fulfillable rule (rename for clarity) |
| Availability | `Services/TagOrderInventoryAvailabilityService.cs` | Catalogue and checkout use orderable units. Add a fulfillable count for the admin |
| Checkout | `Services/OrderService.cs` | Pre-lock check uses `OrderableUnitOf` |
| Catalogue | `Services/TagCatalogService.cs` | No change (reads the availability service) |
| Assignment, merchant, bulk send, holds | `AdminService.cs`, `MerchantInventoryEligibility.cs`, `MerchantFulfilmentService.cs`, `AdminTagInventoryService.cs` | **No rule change** (stay Passed-only) |
| Admin picker | `apps/web/src/components/admin/AdminOrdersManager.tsx`, `TagAssignmentModal.tsx`, `services/adminTagInventoryService.ts` | Server-side search by code/batch (not the first 100); show QA status; offer Passed tags first; link to inspect a code |
| Admin overview | Orders list (existing status filter) plus a small per-SKU "paid units awaiting a passed tag" count on Tag Inventory | New read-only query |
| Prerequisite | Stock Purpose Separation (uncommitted) | Commit, migrate, classify (scripts 01–04) |
| Tests | `Relational/SellableInventoryRelationalTests*.cs`, catalogue agreement test, checkout concurrency, a new "QA fails after payment" scenario, picker tests | Update and add |

**Endpoints:** `GET /api/v1/tag-products` (inStock meaning), `POST /api/v1/orders` (checkout), delivery quote, `GET /api/v1/admin/tag-inventory` (picker search). No new endpoint is strictly required.

## 8. Database changes

- **Order-first itself: none.** It reuses `StockPurpose`, `InventoryReceiptId` and `QaStatus`.
- **Stock Purpose** brings its own (already written) migration `20261011034923_AddSmartTagStockPurpose`.
- **Optional:** an explicit per-batch "released for sale" record (who, when, sample result). It would need a migration. The recommendation above uses the `Sale` classification as that gate instead, so it isn't needed now.

---

## 9. Smallest safe implementation plan

| Phase | What | Code | Migration | Deploy order | Rollback |
|---|---|---|---|---|---|
| **0. Now** | Run §0.1. Explain today's in-stock change; pause purchasing if any Passed tag lacks inspection evidence | none | none | — | — |
| **1. Stock Purpose** | Review, commit and test the existing work. Migration → scripts 01/02/03 (900 `Sale`, 4 samples `Test` once codes are confirmed) → API → web | existing | **Yes** (existing) | migration → classify → API → web | Script 04, then the previous API |
| **2. Receive and enrol** (ops) | Record the three receipts **with the batch selected**; enrol each batch (manifest → `Pending`) | none | none | — | — |
| **3. Sampling** (ops, recommended) | Inspect a sample per batch before treating it as releasable | none | none | — | — |
| **4. Orderable vs fulfillable** | The `OrderableUnit` rule for catalogue and checkout; the admin picker fix; the awaiting-QA count; tests (matrix, concurrency, failure after payment, picker) | API + web | **No** | API, then web | Redeploy the previous API: orderable falls back to Passed-only (safe, only stricter) |
| **5. Operations** | Fulfilment runbook (§6); quarantine tray; customer messages for delays and refunds | docs | none | — | — |
| **Optional later** | Review deadline or expiry for `PaymentProofSubmitted` (R3); in-system refund record (R4); batch release record | API + web | maybe | — | — |

Every phase keeps the existing Passed-only shipping, assignment and merchant guards unchanged, and nothing marks an uninspected tag Passed.

---

## 10. Decisions for you

1. **§0:** confirm how today's Passed tags were produced, and whether purchasing should be paused meanwhile.
2. **Orderable definition:** require enrollment (`Pending`) and a receipt, as recommended? Or allow unenrolled (QA NULL) `Sale` stock?
3. **Sampling:** sample size per batch and the pass threshold for treating a batch as releasable.
4. **Unfulfillable paid order:** your policy (wait / switch variant / cancel and refund) and the customer message.
5. **Customer wording:** whether to mention individual QA and any extra preparation time.
6. **Proof review:** a review deadline for `PaymentProofSubmitted` orders (R3)?
7. **Stock Purpose:** approve the existing implementation for commit (phase 1), and confirm the 4 sample codes.

---

## Recommendation

**Yes. MyPetLink can safely adopt "Payment Confirmed → QA → Shipping" without inspecting all 900 tags upfront**, provided:

1. **Stock Purpose ships first** and the 900 are classified `Sale` (samples `Test`), so only commercial stock can ever be ordered.
2. **Orderable stock is redefined** to on-shelf ∧ `Sale` ∧ received (receipt) ∧ enrolled-and-not-failed, minus reservations. Fulfillable stock stays exactly as today (Passed). This is one rule change in `SellableInventoryRules` plus `TagOrderInventoryAvailabilityService` and `OrderService`; **no migration** beyond Stock Purpose's.
3. **The admin tag picker is fixed** to search all tags and show QA status.
4. **Every existing Passed-only guard stays:** assignment, merchant allocation, Ready to Ship, Shipped, bulk send onward.
5. **An operational procedure** covers failed tags (quarantine, next tag) and paid orders with no passing tag (hold, contact, cancel and refund).

Fulfilment already works this way today. The change is limited to what counts as orderable, and it is only safe once Stock Purpose is live. Nothing here is implemented; it waits for your approval.
