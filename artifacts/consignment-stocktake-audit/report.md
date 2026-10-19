# Consignment Stocktake & Sales Reporting — Read-only Audit

Date: 18 October 2026 · Scope: current working tree at `C:\Project\MyPetLink` (including the uncommitted Consignment UI redesign) · No source, schema, data or configuration was changed.

---

## 1. Executive summary

**The existing Consignment engine is a strong per-unit custody system, but it has no concept of selling or counting *by SKU and quantity*.** Every sale, loss and partial-delivery finding must be pinned to a specific `ConsignmentUnit` (one Tag Code). That conflicts directly with the shop-friendly workflow you want, where staff sell sealed packages and only ever report "how many of each SKU".

| Your workflow step | Today |
|---|---|
| 1. Allocate and dispatch specific tags | ✅ Works (auto-picked by SKU) |
| 2. Shop confirms received quantity by SKU | ⚠️ Works only if the whole delivery arrived in good condition. Any shortage or damage must be pinned to specific Tag Codes. |
| 3. Shop reports sold quantity and price per SKU | ❌ Not possible. Sales are one unit per record, each with its own Tag Code and reference. |
| 4. MyPetLink reconciles the report | ❌ Not possible in the system; spreadsheet only |
| 5. Shop reports remaining stock per SKU | ❌ No stocktake |
| 6. Expected vs actual comparison | ❌ No SKU-level stock position |
| 7. Missing/damaged/returned handled separately | ⚠️ Returns and damage work per unit. A tag lost *after* receipt has no path at all. |

**Recommendation:** You can **start** the first 100-tag consignment on the current system, because allocation, dispatch, dispatch note, full receipt and returns all work. Keep sales reports and stocktakes in the agreed external tracker for the first month. **Build a small Phase 1 (SKU sales reports + SKU stocktake, both admin-entered, no money) before the first monthly reconciliation**, roughly 30 days after dispatch. Without it, closing out the consignment later forces you to record about 60 separate per-tag handovers, and those would need identities the shop never gives you.

---

## 2. Existing capability matrix

| Capability | Status | Evidence |
|---|---|---|
| Consignment agreements (versioned terms, approval, Solo/Team review) | **Fully supported** | `Entities/ConsignmentEntities.cs:9-35`, `Services/ConsignmentService.cs:30-140`, `ConsignmentService.Approval.cs`, UI `consignment/AgreementWizard.tsx`, `AgreementsView.tsx` |
| SKU-level allocation | **Fully supported** (UI auto-pick only) | Lines per `ProductVariantId` with quantity, deterministic pick order or explicit `SmartTagIds`: `DTOs/ConsignmentDtos.cs:18-23`, `ConsignmentService.cs:160-230`, `MerchantInventoryEligibility.cs:37-44`. The UI never sends `SmartTagIds` (`consignment/ReserveStockDialog.tsx`). |
| Eligible stock rule | Fully supported, strict | Only physically received, `QaStatus = Passed`, Sale-purpose, unclaimed stock: `SellableInventoryRules.cs:50-51,61-62,92-97`, `ConsignmentService.Evidence.cs:15-19`. **All 100 tags must be individually Physical-QA Passed first.** |
| Per-unit tag custody | **Fully supported** | `ConsignmentUnit` (`ConsignmentEntities.cs:74-96`), one open hold per tag (`MyPetLinkDbContext.Consignment.cs:124`), append-only `ConsignmentMovement` (`:107-120`), retail and B2C protection (`InventoryCustodyRules.cs:13-49`) |
| Dispatch + issued dispatch note | **Fully supported** | `ConsignmentService.cs:247-270`, frozen PDF grouped by SKU/batch (`ConsignmentDocumentService.cs:41-65`) |
| Receiving: full delivery | **Fully supported** | A first receipt with no unit IDs confirms every unconfirmed unit: `ConsignmentService.Receiving.cs:124-130`. The UI's "Mark all unconfirmed units good" does the same without anyone scanning. |
| Receiving: partial, damaged or short | **Partially supported** | Requires explicit good/damaged/missing **unit IDs**: `ConsignmentService.Receiving.cs:126-138`. A "39 of 40 arrived" report cannot be recorded without naming the missing Tag Code. |
| External handover / reported sale | **Partially supported** (per unit only) | One unit per unique merchant-scoped reference (`ConsignmentService.cs:318-322`, `ConsignmentService.Evidence.cs:30-69`, unique index `MyPetLinkDbContext.Consignment.cs:155`). The unit must be Received/Good. Price and discount are per unit and marked "Unverified external report". |
| Sales reporting by SKU and quantity | **Missing** | No entity, endpoint or UI |
| Periodic physical stocktake | **Missing** | No entity, endpoint or UI (searched code and docs) |
| Expected vs actual stock | **Missing** | Only per-delivery unit counts (`ConsignmentDispatchResponse.PartnerHeld` etc., `ConsignmentService.cs:430-437`). No per-merchant/SKU position, no expected-stock formula. |
| Discrepancy investigation | **Partially supported** | Delivery-time only, per unit, with independent or Solo review (`ConsignmentService.Receiving.cs:139-199`). **No shrinkage path after receipt.** A Received/Good unit that later goes missing at the shop cannot be marked missing: receiving actions accept only Dispatched/Unconfirmed units (`:175-176`), and write-off accepts only physically returned stock (`ConsignmentService.cs:323-328`). |
| Returns (unsold stock back) | **Fully supported** (per unit) | Return → quarantine → fresh Physical QA → release, or write-off: `ConsignmentService.cs:291-328` |
| Damaged stock | **Partially supported** | Damaged on delivery: per unit. Damaged later at the shop: only by physically returning it and failing QA. |
| Missing stock | **Partially supported** | On delivery only, per unit. Stays held indefinitely; there is no loss adjustment or liability record (deliberate, see `docs/architecture/consignment-mvp.md`). |
| Customer refunds / returned sales | **Partially supported** | Reverse-handover puts the unit back to "Received" (`ConsignmentService.Evidence.cs:39-68`). An activated, refunded tag cannot return to stock (`RequireUnowned`, `ConsignmentService.cs:406-411`). |
| Reconciliation CSV exports | **Partially supported** | Per-unit handover CSV (`ConsignmentDocumentService.cs:66-83`), controlled manifest CSV with Tag Codes (`:18-31`), review log (`ConsignmentService.Approval.cs:99-110`). No SKU summary or stock-position export. |
| Financial settlement | **Missing (by design)** | Explicitly deferred to Stage 3: `docs/architecture/consignment-mvp.md` ("External sales and settlement reconciliation", "Deferred roadmap"). Nothing creates invoices, commissions or payments. |
| Activation as a sales signal | Indicator only | `ActivatedWithoutExternalReference` per delivery (`ConsignmentService.cs:437`). Activation is correctly never treated as a sale (`InventoryCustodyRules.cs:59-60`). |

---

## 3. Actual current workflow (as the code enforces it)

1. **Agreement:** draft → signed reference → approve (independent, or Solo self-review). Terms freeze at approval.
2. **Reserve:** choose an agreement, branch and quantity per SKU. The system auto-picks specific inspected tags in batch/Tag Code order and holds them.
3. **Pick and pack:** the founder must physically pick **exactly the tags the system chose**. They are listed only in the controlled manifest (View Tag Codes / CSV). The UI cannot choose "these 40 packages from the shelf".
4. **Dispatch:** a courier reference is recorded and the dispatch note PDF is issued and frozen. Units become Dispatched, and the tags become `SentToReseller` and activatable.
5. **Receipt:** if everything arrived good, "Mark all unconfirmed units good" plus the signed count records receipt with no scanning. Any shortage or damage needs per-unit IDs.
6. **Sales:** for each sale, one "Record customer handover" action against one selected unit, with a unique tracker reference and an optional unverified price and discount. In practice this needs the Tag Code of the sold package.
7. **Returns:** select the units, receive them into quarantine, run Physical QA, then release or write off.
8. **Close agreement:** blocked until every unit is Released, ExternalHandover or WrittenOff (`ConsignmentService.cs:131-136`). That means **every sold tag must eventually get its own handover record**, and every lost tag has no permitted end state at all.
9. **Money:** entirely in the external tracker.

---

## 4. Missing requirements (against your workflow)

1. Record **received quantity by SKU** when it differs from what was dispatched, without naming units.
2. Record **sales by SKU and period**: quantity, actual unit price, discount, reference, customer returns and refunds, and verification status.
3. Record a **stocktake by SKU**: count date, counted quantity, damaged-on-hand, evidence and notes.
4. Compute **expected stock by merchant and SKU** from authoritative figures, with unverified reports shown separately.
5. Record **reviewed adjustments** for post-receipt loss or damage, without returning anything physically.
6. **Close out** a consignment where the sold units' identities are unknown, without inventing identities.
7. A **SKU stock-position export** for the monthly reconciliation pack.

---

## 5. B — Sales without scanning Tag Codes

| Field | Supported today without a Tag Code? |
|---|---|
| Sale date / reporting period | ❌ Only a per-unit `EventAt` |
| Merchant and SKU | ❌ Derived from the selected unit only |
| Quantity sold | ❌ Always exactly one unit (`ids.Length != 1` → 400, `ConsignmentService.cs:320-321`) |
| Actual unit selling price | ⚠️ Per unit only (`SellingPrice`) |
| Discount | ⚠️ Per unit only, with explanation required |
| Sales reference | ⚠️ Unique per merchant **per unit**, so a report covering 12 tags would need 12 references |
| Returned/refunded quantity | ❌ Reverse-handover per unit only |
| Unverified vs confirmed status | ⚠️ Every record is hard-coded "Unverified external report" (`ConsignmentDtos.cs:64`). There is no confirmed state. |

**Limitation:** the API requires a specific `ConsignmentUnitId` for every sale, and the unit must be confirmed Good. If the shop doesn't know which package it sold, the only way to record the sale is to pick an arbitrary Tag Code. That would corrupt the custody record: the unsold tag still on the shelf would show as sold, and a later customer activation of it would look like a phantom.

**Proposed design (no arbitrary Tag Codes):**

- A new aggregate record: **ConsignmentSalesReport** (header) with **ConsignmentSalesReportLine** (per SKU).
  - Header: merchant, agreement (version), branch, period from/to, partner's report reference (unique per merchant), date received, evidence reference (for example "WhatsApp POS photo 2026-11-30"), status **Recorded → Verified / Rejected**, plus corrections that supersede earlier versions, actor, and review mode.
  - Line: `ProductVariantId` plus SKU snapshot, quantity sold, quantity returned by customers (back on the shelf, sealed), gross unit price (or total gross), total discount, discount explanation, notes.
- **No unit IDs.** Custody units stay "with the partner" until a full reconciliation event identifies them by elimination (see §8).
- **Verified** means MyPetLink checked the report against the partner's own evidence (POS printout, sales book photo). It is a review status, never a payment, invoice or commission. It uses the existing approval policy: an independent reviewer, or Solo self-review with reason and evidence.
- Per-unit "Record customer handover" stays available for the rare case where a specific unit's identity *is* known. For a partner whose sales are reported in aggregate, that per-unit action must not also carry a reported sale, or the sale counts twice (see §7).

---

## 6. C — Physical stocktake

**Today:** not supported in any form.

**Minimal design:** **ConsignmentStocktake** (merchant, agreement, branch, count date and time, counted by — the partner staff name as given, evidence reference, status Recorded → Reviewed, notes) with **ConsignmentStocktakeLine** per SKU: *expected* (snapshot computed at recording), *counted sealed good*, *counted damaged on hand*, *variance*, investigation note.

Review produces one of: **variance accepted as investigation** (stays open), or **reviewed adjustment(s)**: Lost, Damaged-on-hand, Found. Each adjustment is quantity-only per SKU, with reason, evidence and approval policy, and is append-only.

**Expected stock — safe formula (per merchant/agreement/branch, per SKU):**

```
Received at partner      = units confirmed Good at partner (per-unit custody, authoritative)
− Physically returned    = of those, units now ReturnedQuarantine / Released / WrittenOff
− Unit-level handovers   = units in ExternalHandover (identity known)
− Verified sold qty      = Σ verified sales-report lines (quantity sold)
+ Verified customer returns back on shelf = Σ verified lines (quantity returned)
− Approved adjustments   = Σ reviewed Lost/Damaged adjustments (Found adds back)
= EXPECTED ON HAND (authoritative)

Pending (shown separately, never subtracted above):
  Unverified sold qty, unverified returns, unreviewed stocktake variance
  → "Expected if pending reports are verified"
```

**Worked example** (40 / 30 / 30 dispatched, all received good; Nov report: 12 / 8 / 5 sold, verified; stocktake counts 28 / 22 / 24):

| SKU | Received | Verified sold | Expected | Counted | Variance |
|---|---|---|---|---|---|
| Pawsome Lightweight | 40 | 12 | 28 | 28 | 0 |
| Pawsome Standard | 30 | 8 | 22 | 22 | 0 |
| My Boss Lightweight | 30 | 5 | 25 | 24 | **−1 → investigate** |

**Cross-check (signal, not proof):** activated tags per SKU among units at the partner (`IsActivated` already exists per unit). If activations exceed verified sales for a SKU, either sales went unreported or packages left the shelf another way.

---

## 7. D — Data integrity and reconciliation risks

| Risk | Where it bites | Mitigation |
|---|---|---|
| **Double-counting sales** | Same sale entered as an aggregate line *and* a per-unit handover with a reported price | One sales mode per agreement for retail sales (aggregate). Per-unit handovers for that partner are custody-only, or carry a link to the report line they attribute. |
| **Overlapping reporting periods** | Two reports covering the same days for the same SKU | Reject overlapping periods per merchant/branch/SKU unless the new report explicitly supersedes the old one |
| **Duplicate submissions** | Same report entered twice | Unique (merchant, partner report reference) plus a client idempotency key, reusing the existing reservation fingerprint pattern (`ConsignmentService.cs:168-190`) |
| **Corrections / refunds / reversals** | Editing a verified report hides history | Append-only, with corrections as superseding versions (the same pattern as handover `SupersedesRecordId`). A refund *with* the package returned sealed adds stock back; a refund of an **activated** tag reduces sold quantity but **not** stock, and needs a customer-ownership procedure. |
| **Stocktake variance** | Silently "fixing" stock | Variance never changes stock on its own. Only a reviewed adjustment does, and an unresolved shortage stays visible. |
| **Unknown sold-unit identities** | Pressure to pick Tag Codes | Never assign mid-period. Identify only by elimination at a full reconciliation event (§8). |
| **Lost / damaged stock after receipt** | No allowed end state, so agreement closure is blocked forever | Quantity adjustments in Phase 1. Unit-level end state by elimination at close-out. |
| **Activation before reported sale** | Customer activates the day of sale; report arrives at month end | Activation is only a cross-check. It never decrements expected stock. |
| **Activation of a "lost" or stolen tag** | Theft looks like a sale | Adjustments and activation are compared at review; flag "activated but adjusted as lost". |
| **Activation after a unit was assumed sold** | Fine, consistent | — |
| **SKU changes / renames** | Report lines keyed by SKU text | Key on `ProductVariantId` and snapshot the SKU text (units already snapshot it, `ConsignmentEntities.cs:83-85`) |
| **Mixed batches** | Irrelevant to aggregate counts | Batches stay on units for QA traceability only |
| **Agreement revision mid-period** | Units from v1 sold after v2 is approved: which rate applies? | Unknown identity makes this undecidable in the system. **Avoid revising terms mid-period**, or agree a rule in the contract (for example, by sale date). Settlement phase only. |
| **Settlement against unverified sales** | Paying commission on a guess | Settlement (later phase) may read **Verified** lines only. Nothing in Phase 1 computes money owed. |
| **Authorization** | One operator records and verifies their own report | New separate capabilities (record vs verify vs adjust) and the existing Solo policy, with no role checks. Coverage via `AdminCapabilityCoverageTests`. |
| **Personal data** | Shop reports with customer names | Report and stocktake fields hold references only; reuse the existing "exclude customer personal details" copy. |
| **Pick mismatch** | The system auto-picks tags A–Z; you pack tags X–Y | Use the manifest as the pick list, or (small UI change) let you choose specific tags. The API already supports `SmartTagIds`. |

---

## 8. E — Recommended minimal design

**Shape:** `Consignment → Sales Reports → Stocktake → Reconciliation`, all admin-entered from partner evidence. No partner portal, no money.

**1. Reuse unchanged**
- Agreements, approval and Solo policy, review journal, capabilities pattern.
- Reservation by SKU, dispatch, frozen dispatch note, manifest.
- Full receipt with no scanning ("Mark all unconfirmed units good").
- Returns → Physical QA → release / write-off.
- Per-unit custody as the authoritative record of *where each tag can be*.
- The redesigned UI shell: Reconciliation tab, workflow stepper, action runner, wizard pattern.

**2. Backend changes genuinely necessary (Phase 1)**
- New tables: `ConsignmentSalesReports` + `…Lines`, `ConsignmentStocktakes` + `…Lines`, `ConsignmentStockAdjustments` (append-only, `RowVersion`, UTC, audit).
- Endpoints: record, verify or reject, and supersede a sales report; record and review a stocktake; record and approve an adjustment; a **stock position** read (per merchant/branch/SKU: authoritative expected + pending); a SKU reconciliation CSV.
- New capabilities, for example `consignment.sales_reports.record`, `consignment.sales_reports.verify`, `consignment.stocktake.manage`, `consignment.adjustments.approve`. Add each to the catalogue and the web mirror, and grant none automatically.
- Review-journal entries for verify and approve, honouring Team/Solo.

**3. Frontend changes**
- Reconciliation tab gains **Sales reports** (list + entry form per SKU), **Stocktakes** (expected pre-filled from the server, counted entered, variance shown) and a **Stock position** card per partner.
- Overview attention items: unverified reports, unreviewed variances.

**4. Migrations: yes.** These are additive tables only, with no change to existing columns. Seed nothing, and follow the existing guarded-rollback pattern.

**5. Keeping Tag Code custody correct**
- Units stay "with partner" (Received) until physically returned or identified.
- **Close-out by elimination (Phase 2, not needed for the first month):** at agreement end, the shop returns all unsold stock and MyPetLink scans the returned packages itself. Once every returned unit is identified, the *remaining* units at the partner are exactly the units that left the shelf. A single reviewed "close-out" action then marks those remaining units as handed over or lost, in quantities that must equal verified sold + approved lost per SKU. If the numbers don't match, the action is refused. This assigns identities only where elimination proves them, never arbitrarily.

**6. Expected stock without inventing identities:** the §6 formula combines per-unit facts (received, returned) with aggregate facts (verified sales, adjustments). No unit is ever attributed to an aggregate sale before elimination.

**7. What stays manual for the first partner**
- Money: commission at 35% / 65%, remittance and payment matching (the external tracker; the doc's worked example still applies).
- Collecting the shop's report: a WhatsApp photo of a sales book or POS page, typed in by you.
- Investigating shortages: notes and evidence references only.
- Monthly cadence and reminders.

**8. Defer to the settlement phase:** settlement statements, commission calculation, invoices or credit notes, payment allocation, e-Invoice and tax treatment, partner portal, CSV import of shop reports, multi-branch analytics, per-unit attribution links.

---

## 9. Suggested phases

| Phase | Content | Needed before |
|---|---|---|
| **0 — Operate now** (no development) | QA-pass the 100 tags. Reserve 40/30/30. **Pack from the manifest.** You deliver in person and do a joint count with the shop. If it's exact, record a full receipt. Keep sales and stocktakes in the external tracker by SKU. | First dispatch |
| **1 — SKU sales reports + stocktake + adjustments + stock position** (backend, migration, UI) | §8 items 2–4 | First monthly reconciliation (about 30 days after dispatch) |
| **1b — small UI:** choose specific tags when reserving (the API already supports it) | Optional; removes the pick-list mismatch | Second consignment |
| **2 — Close-out by elimination** + SKU-quantity delivery shortage | §8.5 | Before the first agreement ends or the first damaged/short delivery |
| **3 — Settlement** | Statements, commission and remittance from **verified** lines only, after tax/e-Invoice review | Before automating any money |

---

## 10. Clear recommendation

- **No development is required to *start* the first 100-tag consignment**, provided (a) all 100 tags are Physical-QA Passed, (b) you pack exactly the tags in the controlled manifest, and (c) the delivery is counted jointly so a full receipt can be recorded. A short or damaged delivery today forces you to name specific Tag Codes. The safe fallback is for you, not the shop, to scan the affected packages at delivery.
- **Development is recommended before the first monthly reconciliation.** Phase 1 is small: five additive tables, a handful of endpoints, and two new sections inside the existing Reconciliation tab. It is the minimum that lets the system — rather than a spreadsheet — answer "what should be on the shelf" without inventing Tag Code identities.
- **Do not** use per-unit "Record customer handover" with reported prices for this partner in the meantime. It will force arbitrary Tag Code choices and later double-count against Phase 1 reports.

### Questions to agree before implementation
1. Does each sealed package show its Tag Code or QR on the outside? If yes, identification at delivery and return is cheap for you, though still not for shop staff.
2. Will you deliver in person, so a joint count is possible, or by courier?
3. Reporting cadence: monthly sales and stocktake together, or sales fortnightly and stocktake monthly?
4. What evidence will the shop give: POS export, sales-book photo, or a WhatsApp message? This decides what "Verified" means.
5. Customer refunds: does the shop take back activated tags? That needs a customer-ownership rule outside consignment.
6. Will you keep terms fixed for the trial period, so there are no mid-period version changes?
