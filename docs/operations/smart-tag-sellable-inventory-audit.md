# Smart Tag Sellable Inventory and Physical QA Audit

**Date:** 2026-10-10
**Scope:** the full eligibility path from physical tag inventory to shipping, for the QR + NFC variants currently on sale (Pawsome Lightweight, Pawsome Standard, My Boss Lightweight).
**Status:** remediation prepared locally on 2026-10-11 — see [`smart-tag-inventory-safety-remediation.md`](smart-tag-inventory-safety-remediation.md). Production results of the diagnostic were not available; the release is not approved.
**Mode:** audit only. No application code, database data, inventory status, configuration or production system was changed. Nothing was committed, pushed or deployed.

The only file added besides this report is a **read-only** diagnostic query, [`docs/deployment/sql/diagnose-smart-tag-sellable-inventory.sql`](../deployment/sql/diagnose-smart-tag-sellable-inventory.sql), for you to run against production.

## Summary

- **The suspicion is confirmed in the code.** A tag whose Physical QA status is NULL counts as sellable stock: in the public catalogue `inStock`, at checkout, in order reservation, assignment, ready-to-ship, shipping, activation and merchant allocation. This is deliberate (`PhysicalQaReleaseRules.Released`), to keep pre-QA inventory working, but nothing distinguishes *real historical stock* from *new stock that was simply never enrolled*.
- **Verified against the real API.** On a throwaway local database, a single never-enrolled (NULL) tag was enough to turn the catalogue's `inStock` from `false` to `true`. Moving that tag to QA Pending turned it back to `false`.
- **Production counts could not be verified** (no production database or Admin access from this machine). Whether the 900-tag shipment is at risk depends on one fact: **were its codes generated before the QA migration (2026-10-09) and not yet enrolled?** If so, all 900 are NULL and sellable now. The live catalogue currently shows all three variants in stock and on sale, while the QA runbook says sales should be frozen until enrollment. Run the diagnostic query first.
- **Pending, Failed and Needs Review stock is correctly held at every stage.** Disabled, Replaced, Archived, Lost, assigned, reserved and merchant-allocated tags are excluded consistently. Checkout, QA decisions, expiry and merchant allocation share one SKU-level lock, so they cannot interleave.
- **A second, smaller defect.** A delivered order whose tag is later marked Lost, Disabled or Archived keeps reserving one unit of that SKU forever. This under-states stock (verified against the real API); it never oversells.
- **Recommendation.** New commitments (catalogue, checkout, assignment, allocation, send onward) should require **QA Passed**. NULL should remain valid only for tags already in a customer's hands. Historical stock should not be backfilled to Passed: enroll and inspect it, or exempt it explicitly through an audited admin action.

---

## 1. Root cause

`apps/api/MyPetLink.Api/Services/PhysicalQaReleaseRules.cs`:

```csharp
public static readonly Expression<Func<SmartTag, bool>> Released =
    tag => tag.QaStatus == null || tag.QaStatus == PhysicalQaStatus.Passed;
```

- **NULL means two different things.** The migration `20261008040000_AddSmartTagPhysicalQa` added `SmartTags.QaStatus` as a nullable column **with no backfill**, so every tag that existed when it was applied is NULL. The code comment and `docs/operations/smart-tag-physical-qa.md` define NULL as "historical inventory outside the QA cohort … released on purpose". But a tag generated for the 900-piece shipment before the migration is *also* NULL. The database cannot tell "historical stock we trust" from "new stock nobody has inspected".
- **Only enrollment holds it.** New inventory generated *after* the migration starts as `Pending` (`AdminTagInventoryService` generation, the only code path that creates `SmartTags`). A pre-existing code becomes held only when an admin **enrolls** its shipment manifest (`PhysicalQaService.EnrollAsync` sets it to `Pending`).
- **The safety net is a manual freeze.** Until enrollment, the runbook's first step (freezing sales for the affected SKUs) is the only control, and nothing in the system enforces it.

> The runbook itself names this window: *"until the 900-code shipment is enrolled, its tags are NULL and sellable."*

---

## 2. Current eligibility rules

### 2.1 Building blocks (verified in code)

| Predicate | Definition | Source |
|---|---|---|
| **Released** | `QaStatus IS NULL OR QaStatus = Passed` | `PhysicalQaReleaseRules.Released` / `IsReleased` / `AndReleased` / `RequireReleased` |
| **On the shelf (retail stock)** | Released AND `Status = Unclaimed`, not archived/deleted, `FulfilmentStatus ∈ {Generated, Printed}`, no owner, pet, order or order item, no live merchant allocation (`ReleasedAt IS NULL`) | `TagOrderInventoryAvailabilityService.GetAvailableUnitsAsync` |
| **Outstanding retail reservation** | For every order item of a **non-Cancelled** order: `Quantity − tags linked to the item in Pending/Preparing/Delivered/Active (not archived/deleted)`, floored at 0 | Same service |
| **Available units** | `max(0, on the shelf − outstanding reservations)` per SKU | Same service |
| **Publicly offerable SKU** | Product published and not archived; variant active, purchasable, not archived, QR **and** NFC | `TagCatalogService.IsPubliclyOfferable`, `TagCatalogSellability` |
| **Merchant-eligible tag** | Released AND the same shelf conditions | `MerchantInventoryEligibility.For` |

There is **no separate "released for sale" step**. A tag is released the moment it is `Passed` (or if it is NULL). An admin with `inventory.qa.manage` effectively releases stock by passing it; the runbook says so too.

### 2.2 Stage by stage

| # | Stage | Code | Eligibility rule | NULL | Pending | Passed | Failed / Needs Review |
|---|---|---|---|---|---|---|---|
| 1 | Inventory created | `AdminTagInventoryService` generate | Only creation path; new tags start `Pending` | (pre-migration rows only) | ✔ default | — | — |
| 2 | QA enrollment | `PhysicalQaService.EnrollAsync` | NULL → `Pending` for a fixed manifest; takes the SKU lock; keeps existing commitments, with acknowledgement | → Pending | unchanged | unchanged | unchanged |
| 3 | QA decision | `PhysicalQaService` (decision) | Sets `Passed`/`Failed`/`NeedsReview`; takes the SKU lock | — | → decision | → decision | → decision |
| 4 | Public catalogue `inStock` | `TagCatalogService.ToPublicProductsAsync` → `GetAvailableUnitsAsync` | Available units > 0 | **counts** | held | counts | held |
| 5 | Delivery quote | `DeliveryService.ResolveAsync` → `EnsureAvailableAsync` | Available ≥ requested | counts | held | counts | held |
| 6 | Order placement and reservation | `OrderService.CreateAsync`: released shelf count, then **SKU application lock**, then `EnsureAvailableAsync`, then insert | Available ≥ requested; the order item becomes the reservation | **counts** | held | counts | held |
| 7 | Payment proof, cancel, expiry | `OrderService` / `PaymentReservationExpiryService` | Same SKU lock (`AcquireForOrderAsync`); a cancel or expiry releases the reservation | — | — | — | — |
| 8 | Payment confirmation | `AdminService.ConfirmPaymentAsync` | No stock re-check (the order already holds a reservation) | — | — | — | — |
| 9 | Assign tag to order | `AdminService.AssignInventoryTagAsync` → `LoadAvailableInventoryTagAsync` | Payment confirmed; `RequireReleased`; Unclaimed, Generated/Printed, unlinked, not merchant-held, same SKU | **allowed** | refused 409 | allowed | refused 409 |
| 10 | Change or replace assigned tag | `ChangeAssignedTagAsync` / `ReplaceTagAsync` | Same loader for the new tag | **allowed** | refused | allowed | refused |
| 11 | Mark ready to ship | `AdminService` (≈ line 644) | `RequireReleased` on every assigned tag | **allowed** | refused | allowed | refused |
| 12 | Ship | `AdminService` (≈ line 755) | `RequireReleased` again (re-checked after ready to ship) | **allowed** | refused | allowed | refused |
| 13 | Bulk Send to Owner / Reseller | `AdminTagInventoryService` bulk fulfilment | `IsReleased` | **allowed** | refused | allowed | refused |
| 14 | Admin claim / assign pet / transfer | `AdminSmartTagService` | `RequireReleased` | **allowed** | refused | allowed | refused |
| 15 | Public activation (owner with the tag in hand) | `SmartTagService.RequirePhysicallyReleased` | `IsReleased` | **allowed** | "isn't ready to activate yet" | allowed | refused |
| 16 | Merchant quotation Send / Convert | `MerchantSalesService` → `RequireMerchantQaStockAsync` | Checked **only if the SKU has at least one enrolled tag** | counts | held | counts | held |
| 17 | Merchant allocation, ready to ship, shipped | `MerchantInventoryEligibility`, `MerchantFulfilmentService` | `AndReleased` / `RequireReleased`; allocation takes the SKU lock | **allowed** | refused | allowed | refused |

### 2.3 Other states

| State | Effect | Verdict |
|---|---|---|
| Disabled, Replaced, Archived, Lost | Not `Unclaimed`, so never on the shelf; activation refused for these statuses | Correct |
| Already assigned (owner, pet, order or order item set) | Excluded from the shelf; assignment refuses linked tags | Correct |
| Merchant-allocated (live allocation) | Excluded from retail shelf and from retail assignment | Correct |
| Reserved by unpaid or paid orders | Subtracted at SKU level until a tag is assigned; cancel or expiry releases it | Correct, but see the phantom defect in §4 |
| Fulfilment `SentToReseller` / `Received` / `SentToOwner` | Not on the shelf | Correct |
| Historical inventory created before QA | NULL, therefore sellable everywhere | **By design, and the root cause** |

---

## 3. Inventory state matrix

### 3.1 Production: not verified

| Variant | Registered | Not yet tested (NULL / Pending) | QA Passed | QA Failed | Released | Reserved | Allocated | Actually sellable |
|---|---|---|---|---|---|---|---|---|
| Pawsome Lightweight (`PAWSOME-LW-QR-NFC`) | unknown | unknown | unknown | unknown | unknown | unknown | unknown | **> 0 (catalogue `inStock: true`)** |
| Pawsome Standard (`PAWSOME-SD-QR-NFC`) | unknown | unknown | unknown | unknown | unknown | unknown | unknown | **> 0** |
| My Boss Lightweight (`MYBOSS-LW-QR-NFC`) | unknown | unknown | unknown | unknown | unknown | unknown | unknown | **> 0** |

**Limitation.** There are no production database credentials on this machine: the API's local configuration targets LocalDB only. The Admin APIs require an admin session, and signing in is something you must do yourself. The only production fact available is the public catalogue (read-only GET, 2026-10-10): all three variants are offered and `inStock: true`, MYR 39.90. That proves only "available units > 0"; it cannot distinguish Passed stock from NULL stock.

**To fill this table**, run [`diagnose-smart-tag-sellable-inventory.sql`](../deployment/sql/diagnose-smart-tag-sellable-inventory.sql) against production. It is read-only, takes no locks and writes nothing.

| Result set | Shows |
|---|---|
| 1 | Per SKU: Registered, QaNotEnrolled, QaPending, QaPassed, QaFailed, QaNeedsReview, ReleasedByRule, OnShelf, OnShelfNotEnrolled, OnShelfPassed, OnShelfHeldByQa, AssignedOrActive, MerchantAllocated, LostDisabledReplacedArchived, OutstandingRetailReservations, **SellableToday** (what `inStock` uses) and **SellableIfOnlyPassedCounted** |
| 2 | Per production batch: whether its tags are enrolled. A batch that is entirely `QaNotEnrolled` was never enrolled |
| 3 | Enrolled shipments (look for the 900-code manifest) |
| 4 | Open retail orders and merchant allocations already holding a tag that has not passed QA |
| 5 | Open orders still holding SKU-level reservations |

**Decision rule after running it:**

| Result set 1 shows… | Meaning |
|---|---|
| `OnShelfNotEnrolled > 0` for a variant | Untested stock is being sold right now |
| `SellableIfOnlyPassedCounted = 0` while `SellableToday > 0` | The catalogue's "in stock" depends entirely on untested tags |

You can also check in Admin → Tag Inventory with the QA filter.

### 3.2 Verified on a synthetic dataset

To check that the query mirrors the API exactly, the repository's deployable `migration.sql` was applied to a throwaway LocalDB database (`MyPetLinkInventoryAuditTmp`, since dropped), and 13 synthetic tags and 4 orders were inserted:

| Tags | Orders |
|---|---|
| 3 NULL on the shelf · 2 Pending · 2 Passed · 1 Failed · 1 Needs Review | A: unpaid, quantity 2, no tags |
| 1 Passed but merchant-allocated | B: delivered, tag Active |
| 1 NULL Active (delivered) · 1 NULL sent to reseller | C: cancelled, quantity 5 |
| 1 Passed tag on a delivered order, later Replaced | D: delivered, tag later Replaced |

| Measure | Expected from code | Query result |
|---|---|---|
| Registered | 13 | 13 |
| NULL / Pending / Passed / Failed / Needs Review | 5 / 2 / 4 / 1 / 1 | 5 / 2 / 4 / 1 / 1 |
| On the shelf (all QA) / NULL / Passed / held | 9 / 3 / 2 / 4 | 9 / 3 / 2 / 4 |
| Merchant-allocated / assigned-or-active / lost-replaced | 1 / 1 / 1 | 1 / 1 / 1 |
| Outstanding reservations | 3 (A: 2, plus 1 phantom from D) | 3 |
| Sellable today | max(0, 5 − 3) = **2** | **2** |
| Sellable if only Passed counted | max(0, 2 − 3) = **0** | **0** |

The real API was then run locally against the same database (`GET /api/v1/tag-products`), changing one row at a time:

| Step | Change | Catalogue `inStock` | Proves |
|---|---|---|---|
| 1 | Two NULL tags moved to Pending: 3 released on the shelf, 3 reserved including the phantom | **false** | The phantom reservation is counted |
| 2 | Order D's Replaced tag restored to Active (no phantom) | **true** | A delivered order's later Lost, Disabled or Replaced tag re-reserves stock |
| 3 | The one remaining NULL tag moved to Pending | **false** | A never-enrolled tag alone makes the SKU sellable |
| 4 | That tag back to NULL | **true** | Same, reversed |

---

## 4. Risk assessment

| # | Risk | Severity | Verified? | Exposure |
|---|---|---|---|---|
| R1 | **Untested tags sold, assigned, shipped and activated.** NULL tags from an un-enrolled shipment are counted in `inStock`, accepted at checkout, assignable to paid orders, pass ready-to-ship and ship checks, and can be activated by whoever holds them | **Critical, if the 900 codes are not enrolled.** Low once enrolled | Code: verified. Production state: **not verified** | A customer could receive a tag with a faulty or mis-encoded chip, a duplicated package or a wrong QR. These are exactly the defects QA exists to catch, and they hit a finder-safety product |
| R2 | **No system-enforced freeze.** Before enrollment, safety depends on admins following the runbook's capability removals and purchasing-off steps | High | Verified (runbook vs code) | The live site shows all three SKUs purchasable and in stock. Either enrollment happened and stock passed, or the freeze is not in place |
| R3 | **NULL is permanent and ambiguous.** Any future pre-existing tag or import that skips enrollment is silently sellable | Medium | Verified | Recurs with every future manifest generated before enrollment |
| R4 | **Phantom reservations.** A delivered order whose tag becomes Lost, Disabled or Archived (owner or admin action) keeps reserving one unit of that SKU indefinitely | Medium (under-sells, never oversells) | **Verified against the real API** | "Out of stock" shown while units exist; grows with every lost or disabled tag |
| R5 | **Merchant QA check is conditional.** `RequireMerchantQaStockAsync` only runs if the SKU has an enrolled tag | Low (allocation itself still requires Released) | Verified | With NULL stock, quotations can be sent against untested units |
| R6 | **Paid orders held by a later QA downgrade.** If a Passed tag later fails, reserved orders stay paid but cannot ship until another Passed tag is assigned | Low (intended; the runbook covers it) | Verified (code) | Fulfilment delay, not a wrong shipment |
| R7 | **Concurrency.** Checkout, QA decisions, enrollment, expiry, cancel, payment proof and merchant allocation share per-SKU SQL Server application locks; assignment uses row-version concurrency | Low | Code verified; existing relational tests cover allocation races, duplicate-key order creation and inventory receipts. **No relational test covers two concurrent checkouts for the last unit, or checkout racing a QA decision** | Oversell under concurrency is designed against but not regression-tested end to end |

**Not a risk (verified):** Pending, Failed and Needs Review stock cannot be sold, reserved, assigned, shipped, activated, sent onward or merchant-allocated. Existing tests cover the held statuses for stock counts, merchant eligibility, claim, shipping and catalogue `inStock`.

---

## 5. Affected code and API endpoints

| Area | File | Endpoint(s) |
|---|---|---|
| Release rule | `Services/PhysicalQaReleaseRules.cs` | — |
| Stock and reservations | `Services/TagOrderInventoryAvailabilityService.cs` | — |
| Public catalogue | `Services/TagCatalogService.cs` | `GET /api/v1/tag-products`, `GET /api/v1/tag-products/{slug}` |
| Delivery quote | `Services/DeliveryService.cs` | Delivery quote used by checkout |
| Checkout | `Services/OrderService.cs`, `Services/SqlServerInventoryReservationLock.cs` | `POST /api/v1/orders`, payment proof, owner cancel |
| Expiry | `Services/PaymentReservationExpiryService.cs` (+ hosted worker) | — |
| Admin fulfilment | `Services/AdminService.cs` | `POST /api/v1/admin/orders/{orderId}/confirm-payment`, `/assign-tag`, `/change-assigned-tag`, `/replace-tag`, `/mark-ready-to-ship`, `/mark-shipped`, `PUT …/shipment` |
| Tag administration | `Services/AdminSmartTagService.cs`, `Services/AdminTagInventoryService.cs` | `POST /api/v1/admin/tags/{tagId}/assignment/claim` (and assign pet / transfer); bulk fulfilment; inventory generation |
| Physical QA | `Services/PhysicalQaService.cs` | Admin QA preview, enroll, inspect and decide |
| Activation | `Services/SmartTagService.cs` | Public activation from `/q/{tagCode}` |
| Merchant | `Services/MerchantInventoryEligibility.cs`, `MerchantFulfilmentService.cs`, `MerchantSalesService.cs` | Merchant quotation send/convert, allocation, shipping |
| Web (displays only) | `apps/web/src/components/portal/TagOrderFlow.tsx`, `TagProductPickerDialog.tsx` | Shows only `inStock` variants |

---

## 6. Recommended solution

### 6.1 Immediately: no code, operations only

1. **Run the diagnostic query** against production (read-only).
2. **If any QR + NFC variant has `OnShelfNotEnrolled > 0`:**
   1. Apply the runbook's sales freeze (`docs/operations/smart-tag-physical-qa.md` §1). Fastest: turn off purchasing on the three SKUs in Admin → Tag Catalog, or set `Features:SmartTagOrderingEnabled=false`.
   2. Enroll the 900-code manifest (runbook §2–5). That moves the codes to Pending, so they are held immediately and atomically under the SKU lock.
   3. Inspect them. Passed units become sellable one by one.
   4. Lift the freeze once Passed quantities cover open commitments (result sets 4 and 5).
3. **If result set 4 lists any order or allocation holding a non-Passed tag,** change the assigned tag to a Passed one before it ships. Shipping already refuses Pending, Failed and Needs Review; it does **not** refuse NULL.
4. **Do not** update `QaStatus` with SQL, and do not mark anything Passed without inspection.

### 6.2 Code change (proposed, not implemented): split the rule by purpose

The single rule serves two different questions. Separate them:

| Predicate | Proposed rule | Used by |
|---|---|---|
| **`SellableForNewCommitment`** | `QaStatus = Passed` (plus `Exempt`, if you adopt §6.3) | Catalogue `inStock`, delivery quote, checkout, order assignment / change / replace (new tag), bulk Send to Owner / Reseller, merchant eligibility, quotation checks (drop the "only if enrolled" condition), admin claim of **unclaimed** stock |
| **`UsableInCustomerHands`** | `QaStatus IS NULL OR Passed OR Exempt` | Activation, transfer and claim of tags **already delivered to or linked with** a customer; ready-to-ship and ship for orders whose tag was assigned **before** the change |

**Why this split.** Historical tags that customers already hold (Delivered, Active, assigned before QA existed) must keep working: owners must still be able to activate and transfer them. That is the legitimate reason NULL was made "released". Unclaimed NULL stock on the shelf has no such reason, and is exactly the untested-inventory case.

Compatibility after the change:

| Tag group | Effect |
|---|---|
| Historical tags in customers' hands | Unaffected |
| Historical **unclaimed** NULL stock | Stops being sellable until enrolled and Passed, or explicitly exempted |
| NULL tags assigned to open, unshipped orders | Keep shipping under `UsableInCustomerHands`, so the change does not strand paid customers. They are listed by result set 4; review each one |

### 6.3 Optional: explicit, audited exemption for trusted historical stock

If some historical unclaimed stock is known to be good (for example, tags you have already used without problems) and you do not want to inspect it:

- Add `Exempt` to `PhysicalQaStatus`. The column is `nvarchar(32)` storing the enum name, so **no schema change** is needed for the value itself. Alternatively, add nullable columns `QaExemptedAt`, `QaExemptedByAdminUserId` and `QaExemptReason` (an additive migration).
- Set it only through a new Admin action that takes an explicit list of tag codes and a reason. It is audited through `IAuditLogService`, behind `inventory.qa.manage` (or a new, narrower capability, per `AGENTS.md`).
- Never set it by migration or bulk SQL. **Do not mark legacy or untested tags as Passed.** `Exempt` is visibly different from `Passed` in Admin, exports and audit.

### 6.4 Fix phantom reservations (R4)

In `TagOrderInventoryAvailabilityService`, count an order item's assigned units as **every tag still linked to it** (`OrderItemId = item.Id`, not deleted), whatever its lifecycle. Changing an assigned tag unlinks the old one, so it is not double counted. Admin Replace links the new tag to the same item. Equivalent, and simpler to reason about: orders in `Shipped` or `Delivered` hold no outstanding reservation.

Keep `CurrentAssignmentCount` (the fulfilment check) as it is: it answers a different question. Both the batch and single-SKU forms must change together.

### 6.5 Release approval

Today, Passed means released, with no second approval. If you want a release step separate from inspection, the safest addition is a **shipment-level** release: `PhysicalQaShipments.ReleasedAt` and `ReleasedByAdminUserId` (additive), set by an audited Admin action. `SellableForNewCommitment` would then also require it. Adding it later only reduces sellable stock, so it can be introduced safely. Whether you need it is a business decision. With a small QA team, restricting `inventory.qa.manage` may be enough.

---

## 7. Regression tests required

✅ = already covered by existing tests (listed in brackets) · ➕ = recommended new test

**Untested and failed stock (Phase A)**

| Test | Layer | Status |
|---|---|---|
| Pending / Failed / Needs Review excluded from both stock counters | Unit (InMemory) | ✅ [`PhysicalQaTests.UnpassedStockIsExcludedFromBothStockCounters…`] |
| Catalogue `inStock` false for Pending / Failed / Needs Review, true for Passed | Unit | ✅ [`TagCatalogServiceTests.Catalog_AdvertisesStockOnlyWhenPhysicalQaHasReleasedIt`, added in SEO Phase 1] |
| Claim / assign-pet / transfer refuse unpassed tags | Unit | ✅ [`AdminSmartTagServiceTests.ClaimCannotAssignAnUnpassedTag`] |
| Shipping re-checks QA after ready to ship | Unit | ✅ [`AdminOrderServiceTests.ShippingRechecksQaAfterReadyToShip`] |
| Merchant auto-allocation cannot pick Pending or Failed stock | Relational | ✅ [`MerchantFulfilmentRelationalTests.MerchantAutoAllocationCannotPickPendingOrFailedStock`] |
| **Unclaimed NULL stock is not sellable for a new commitment** (catalogue, quote, checkout, assignment, bulk send, merchant) | Unit, one theory per stage | ➕ (after §6.2) |
| **Historical NULL tag already delivered can still be activated and transferred**; NULL tag assigned to an open order can still ship | Unit | ➕ (after §6.2) |
| Checkout refuses a SKU whose only shelf stock is Pending / Failed / Needs Review (`409 out_of_stock`) | Unit | ➕ |
| Admin assign refuses a Pending / Failed / Needs Review tag (`409 physical_qa_required`) | Unit | ➕ |
| Activation of a Pending / Failed / Needs Review tag returns `tag_not_ready` | Unit | ➕ (confirm existing coverage) |

**Release, reservation and agreement**

| Test | Layer | Status |
|---|---|---|
| QA Passed but unreleased follows policy: today, Passed is sellable immediately; with §6.5, Passed is not sellable until the shipment is released | Unit | ➕ |
| Reserved stock cannot be sold twice: unpaid order holds the unit; cancel or expiry releases it | Unit | ✅ [`TagOrderCatalogIntegrationTests.Create_ReservesOutstandingSkuUnits_AndPreventsOverselling`, `TagCatalogServiceTests.Catalog_MarksFullyReservedSkuOutOfStock…`] |
| Merchant-allocated tags are not retail stock, and become stock again when released | Relational | ✅ [`MerchantAllocationRelationalTests`] |
| **Delivered order whose tag becomes Lost / Disabled / Archived does not reserve stock** (R4) | Unit | ➕ (after §6.4) |
| **Catalogue `inStock` agrees with checkout:** for every combination of QA status × lifecycle × allocation × reservation, `inStock == (checkout of 1 unit succeeds)` | Unit, property-style table | ➕ |
| **Two concurrent checkouts for the last unit:** exactly one succeeds, the other gets `409 out_of_stock` | Relational (SQL Server LocalDB) | ➕ |
| **Checkout racing a QA Fail of the last Passed unit:** never ends with an order reserving a unit that is no longer released, beyond the documented downgrade case | Relational | ➕ |
| Enrollment racing checkout leaves stock consistent | Relational | ➕ |
| Historical policy is explicit: a test names the rule for NULL stock in customers' hands vs on the shelf, so a future change has to update it deliberately | Unit | ➕ |

---

## 8. Database migration impact

| Change | Schema migration | Data migration | Notes |
|---|---|---|---|
| §6.1 Enroll the 900 codes | None | Done by the existing Enroll action (audited); **not** by SQL | The manifest is immutable once enrolled |
| §6.2 Split the rule | None | None | Pure code. Effect at deploy: unclaimed NULL stock stops being sellable immediately |
| §6.3 `Exempt` status | None for the enum value (string column); optional additive columns for who and why | None automatic: set per tag by an audited admin action | Never backfill |
| §6.4 Phantom reservations | None | None | Pure code |
| §6.5 Shipment release | Additive nullable columns on `PhysicalQaShipments` | None (existing shipments start unreleased, or are released by an explicit action) | Regenerate root `migration.sql` per `AGENTS.md` |

**Not recommended:** any `UPDATE SmartTags SET QaStatus = …` backfill. Marking NULL as Passed claims an inspection that never happened. Marking it Pending in bulk skips the manifest fingerprint and the per-tag audit that the Enroll action records.

---

## 9. Deployment and rollback considerations

**Order of operations for the recommended changes:**

1. **Read-only first.** Run the diagnostic; decide the freeze; enroll the 900 codes and inspect them. This is independent of any code change and is the step that removes the current risk.
2. **Deploy §6.2 and §6.4 together** (API only; no migration; the web is unaffected because it reads `inStock`).
   - **Before deploying,** compare `SellableIfOnlyPassedCounted` with expected demand. After the deploy, the catalogue shows only Passed stock, so a variant with no Passed units will show "temporarily unavailable" in the order flow while the marketing pages still say "Available now" (see SEO Phase 1 report, §6.2).
   - Review result set 4: NULL tags already assigned to open orders keep shipping under `UsableInCustomerHands`.
3. **Optional §6.3 / §6.5** as separate releases, with their own audited Admin actions and capability entries (`AdminCapabilities.cs` and the web mirror).

**Rollback:**

- **§6.2 / §6.4:** redeploy the previous API. No data to restore. Before rolling back, check for unclaimed NULL stock (result set 1, `OnShelfNotEnrolled`): the old rule makes it sellable again instantly. Pause purchasing first if any exists, exactly as the QA runbook requires before returning to an older API.
- **Enrollment and inspection:** not rolled back. The runbook forbids clearing `QaStatus` or un-enrolling as a shortcut. If an enrollment was wrong, use the documented conflict and review paths.
- **§6.3 / §6.5 schema:** additive columns stay; reverting the code ignores them.

---

## 10. Verified vs assumed

| Verified | How |
|---|---|
| Eligibility rule and every stage in §2.2 | Code reading, file by file |
| NULL-QA unclaimed tags count toward `inStock`; Pending removes them | Real API against a throwaway LocalDB (§3.2) |
| Phantom reservation from a delivered order's later Lost / Disabled / Replaced tag | Real API against the throwaway database (§3.2), plus code (the reservation counts only Pending, Preparing, Delivered and Active assigned tags) |
| The diagnostic query reproduces the API's counts | Synthetic dataset, every figure matched (§3.2) |
| Production catalogue: three QR + NFC variants offered, all `inStock: true`, MYR 39.90 | Read-only GET, 2026-10-10 |
| `migration.sql` includes the QA migration; only generation creates tags; generation starts them Pending | Code and the script |

| Assumed or not verified | Why |
|---|---|
| Whether the 900 codes are NULL (generated before 2026-10-09) or enrolled / Pending / Passed | No production database or Admin access from this machine |
| Production per-variant counts in §3.1 | Same |
| Whether the runbook's sales freeze is currently applied | The public catalogue shows the SKUs purchasable and in stock; the API ordering switch is not externally visible |
| Concurrency behaviour under real SQL Server load for checkout vs checkout and checkout vs QA | Locks verified in code; not covered by a relational test (§7) |

The throwaway database `MyPetLinkInventoryAuditTmp` was created only on this machine's LocalDB and has been dropped. `.claude/launch.json` was temporarily extended to run the local API and was restored byte for byte (SHA-256 `cb74ac9a…` matches the original).
