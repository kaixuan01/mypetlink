# Smart Tag Stock Purpose: Separating Commercial Stock from Testing Samples

**Prepared:** 2026-10-11 (locally; nothing committed, pushed or deployed; no SQL run against Production)
**Builds on:** [`smart-tag-inventory-safety-remediation.md`](smart-tag-inventory-safety-remediation.md) (still BLOCKED for deployment) and SEO Phase 1. Both are preserved.

## Status

| Item | State |
|---|---|
| Code, migration, scripts, tests | Ready for review |
| Commercial batch mapping (900 units) | Encoded exactly in the scripts, **not yet confirmed against Production data** (script 01 does that, read-only) |
| Testing sample mapping (2 MYBOSS-LW + 2 PAWSOME-LW) | **Unresolved:** tag codes not yet identified. Script 01 lists the candidates; nothing is classified Test until each code is confirmed and listed |
| Deployment | **Not approved.** Follows the remediation release and its blockers (X1–X4) |

**The safety property does not depend on the unresolved mapping.** After this change, only `Sale` stock that has also passed QA can be sold. Every existing row starts `Unclassified`, which is never sellable. The older samples are therefore excluded from sale from the moment the API is deployed, whether or not anyone ever labels them `Test`. Labelling them `Test` is for clarity and audit.

---

## 1. Existing architecture and findings

The tables named in the brief (`TagInventory`, `TagInventoryBatch`) do not exist. The actual schema:

| Concept | Table | Notes |
|---|---|---|
| Physical unit | `SmartTags` | One row per tag code. Lifecycle `Status`, `FulfilmentStatus`, physical QA fields (`QaStatus`, `QaShipmentReference`, …), links to owner, pet, retail order, batch, SKU and inventory receipt |
| Generation batch | `SmartTagBatches` | `BatchNo` (unique), `Quantity`, `ProductVariantId`, `GeneratedAt`, `PrintedAt`, `ResellerName`, `Remarks` |
| SKU / catalogue | `TagProducts`, `TagProductVariants` | `Sku`, `SupportsQr/Nfc`, `IsActive`, `IsPurchasable` |
| Received stock and cost | `InventoryReceipts` | Optional link from each tag; costing only |
| QA cohort | `PhysicalQaShipments` + `SmartTags.QaShipmentReference` | Inspection manifests, not commercial purpose |
| Merchant allocation | `MerchantOrderAllocatedTags` | Live while `ReleasedAt IS NULL` |

**No existing field identifies commercial purpose.**

- `SmartTagBatches.Remarks` and `ResellerName` are free text.
- `QaShipmentReference` names an inspection cohort.
- `Pet.IsSampleEligible` concerns the marketing sample pet profile and is unrelated.

**Eligibility is already centralised.** The remediation put every new-sale rule in `SellableInventoryRules`, so the purpose rule is added once and reaches every consumer:

| Consumer | Rule used |
|---|---|
| Public catalogue `inStock`, delivery quote, checkout (pre-check and locked re-check), reservation arithmetic | `SellableUnit` (via `TagOrderInventoryAvailabilityService`) |
| Merchant manual and automatic allocation, eligible-unit lists and counts | `MerchantInventoryEligibility.For` → `SellableUnitOf` |
| Admin assign / change / replace order tag | `RequireSellableForNewCommitment` (new) |
| Bulk Send to Owner / Send to Reseller | `IsPassed` + `IsCommercialStock` (new) |
| Fulfilment hold (ready to ship / shipped) | QA only (unchanged: purpose is checked when a unit is committed, not when it leaves) |
| Retail activation, Admin claim (first hand-over of a unit someone physically holds) | QA and issuance only (unchanged; see §2.4) |
| QR / NFC / legacy scanning, activation of an assigned tag, transfer, pet reassignment | Unchanged; never consult purpose |

**A fact the batch numbers reveal:** `MPL-BAT-260911…` batches were generated on 2026-09-11, before physical QA existed (migration of 2026-10-08, which did no backfill). Unless they were enrolled since, their units are QA `NULL`. Nothing here assumes they are enrolled or passed; script 01 reports the actual QA state per batch.

---

## 2. Database design (implemented)

### 2.1 Column

`SmartTags.StockPurpose nvarchar(32) NOT NULL DEFAULT N'Unclassified'`, constrained by `CK_SmartTags_StockPurpose CHECK ([StockPurpose] IN (N'Unclassified', N'Sale', N'Test'))`.

| Value | Admin label | Meaning |
|---|---|---|
| `Sale` | Commercial Stock | May be sold once QA Passed and otherwise eligible |
| `Test` | Testing Sample | Internal or manufacturer sample. Never sold, even when Passed |
| `Unclassified` | Unclassified | Legacy, not reviewed. Never sold. The default for every existing row and for any code path that does not choose |

- **Independent of QA.** `QaStatus` is untouched. A new sale needs `StockPurpose = Sale` **and** `QaStatus = Passed` **and** on the shelf, minus open reservations, under the existing per-SKU locks.
- **Per unit, not per batch.** Samples can be unbatched or share a batch with other units. Classification is still applied by exact batch number (commercial) and exact tag code (samples), and the sellable predicate stays a single-row test that SQL indexes and EF translate directly.
- **The CHECK constraint exists because reviewed SQL writes this column.** A typo such as `'SALE'` would otherwise produce a row the application cannot read.
- **The C# enum's default is `Unclassified`.** Any creation path that forgets to set it produces unsellable stock, never sellable stock.

### 2.2 Why not a separate sample SKU

A sample SKU was evaluated and **not recommended**:

| Consequence | Detail |
|---|---|
| Foreign keys to rewrite | `SmartTags.ProductVariantId` on the sample units; `SmartTagBatches.ProductVariantId` if a sample shares a batch; `InventoryReceipts.TagProductVariantId` (cost receipts, which are immutable by design); retail and merchant order or quotation lines would still point at the real SKU for anything historical |
| Catalogue duplication | A new `TagProductVariant` per sampled SKU, which must be kept non-purchasable forever and excluded from catalogue, reports and costing |
| Weaker guarantee | It moves samples away from a sellable SKU but says nothing about any other unclassified stock. `StockPurpose` makes "not reviewed" unsellable by default |

### 2.3 New stock

Admin **Generate tag codes** now requires a choice: *Commercial stock* or *Testing samples*.

- There is no default. A request without a valid purpose is refused with *"Choose whether this batch is commercial stock or testing samples."*
- The purpose is stamped on every generated unit and recorded in the `tag-inventory.generate` audit entry.
- New units still start QA `Pending`.

### 2.4 Deliberately unchanged

- **Retail activation and Admin claim are not purpose-gated.** They hand over a unit someone already physically holds, so testers can still activate a sample. They keep the existing QA and issuance rule: an on-shelf QA `NULL` sample is not activatable; a Passed sample is.
- **Activation of assigned tags, scanning, transfer and pet reassignment** never consult purpose. Historical owned and issued tags keep working (tested).
- **The fulfilment hold** stays QA-only. A unit can no longer be committed unless it is `Sale`. Pre-existing commitments are listed by script 01.
- **No Admin reclassification screen.** Purpose is set at generation or by the reviewed, audited SQL below. If routine reclassification is needed later, add a purpose-built Admin action behind a new capability (`inventory.classify`) with audit and `RowVersion`, not a generic editor.

### 2.5 Admin Portal (small, no redesign)

- Tag Inventory has a **Stock purpose** filter (Commercial Stock / Testing Samples / Unclassified). The listing total under a filter gives the count for each class.
- Each row has a **Stock purpose** badge.
- The generate form has the required **Stock purpose** choice, with the help text *"Commercial stock can be sold once it passes physical inspection. Testing samples are never sold."*
- Bulk Send to Owner / Send to Reseller is not offered for non-commercial rows (a courtesy; the API refuses on its own).
- The manufacturer export is unchanged and carries no purpose.

---

## 3. Classification mapping

### 3.1 Confirmed commercial batches → `Sale`

| Batch No | SKU | Quantity |
|---|---|---|
| `MPL-BAT-260911002807-9263` | `MYBOSS-LW-QR-NFC` | 300 |
| `MPL-BAT-260911002857-1515` | `PAWSOME-LW-QR-NFC` | 300 |
| `MPL-BAT-260911002959-6486` | `PAWSOME-SD-QR-NFC` | 300 |
| **Total** | | **900** |

Script 02 refuses to change anything unless, for every batch:

- the batch exists;
- its SKU matches the table;
- `Quantity = 300`;
- exactly 300 live tags, no deleted tags, and every tag carries the batch's SKU;
- no unit is already `Test`.

Units in these batches that are no longer plain shelf stock (sold, allocated, archived) are still commercial units and are classified `Sale`. Their orders and QA are untouched. Script 01 result set 3 lists them.

### 3.2 Testing samples → `Test` (unresolved)

| SKU | Older units reported by the Production diagnostic | Tag codes |
|---|---|---|
| `MYBOSS-LW-QR-NFC` | 2 | **Not yet identified** |
| `PAWSOME-LW-QR-NFC` | 2 | **Not yet identified** |
| `PAWSOME-SD-QR-NFC` | 0 | — |

Until each code is confirmed, the samples stay `Unclassified`, which is already never sellable. To resolve:

1. Run script 01 and read **result set 4**. It shows every unit of the three SKUs outside the confirmed batches, with batch, generation date, receipt, QA, lifecycle, owner/pet, order, allocation, activation, scan count and owner-activation history.
2. Confirm each of the four is a manufacturer sample, from its batch and history rather than its SKU.
3. Put the exact codes into `@TestTags` (with their SKU) in scripts 01, 02 and 03, and set `@ExpectedTestCount = 4` in script 02.

Script 02 refuses a listed code that:

- is not found;
- is inside a commercial batch;
- has a different SKU;
- is already `Sale`;
- is on an open retail order or an unshipped merchant allocation.

Do not classify any other historical unit without the same verification. Everything not listed stays `Unclassified`.

---

## 4. SQL scripts

Location: [`docs/deployment/sql/smart-tag-stock-purpose/`](../deployment/sql/smart-tag-stock-purpose/). Each is a single batch (no `GO`); run with `sqlcmd -I` or any client with `QUOTED_IDENTIFIER ON`.

| Script | Writes? | Purpose |
|---|---|---|
| `01-preview-smart-tag-stock-purpose.sql` | No | Readiness; the three batches with QA, lifecycle and purpose counts and a verdict; non-shelf commercial units; **sample candidates**; all other inventory; **exactly which rows 02 would change and every conflict that would stop it**; expected stock per SKU after classification. Runs before or after the migration |
| `02-apply-smart-tag-stock-purpose.sql` | Yes, `StockPurpose` + `AuditLogs` only | **Dry run by default** (`@Commit = 0` rolls back). Validates everything first, holds the per-SKU inventory locks the API uses, snapshots and `UPDLOCK`s every target row, writes only `Unclassified` rows, asserts the affected-row counts, and proves 23 protected columns (tag code, QA, QR/NFC data, lifecycle, fulfilment, owner, pet, order, batch, SKU, archive/delete, activation, versions, `UpdatedAt`) are unchanged before commit. One audit row per changed tag, carrying a `RunId`. Idempotent: a re-run changes nothing |
| `03-verify-smart-tag-stock-purpose.sql` | No | PASS/FAIL/INFO checks, expected catalogue stock per SKU, and the unexpected rows one by one. Ends with an error if anything FAILs |
| `04-rollback-smart-tag-stock-purpose.sql` | Yes, `StockPurpose` + `AuditLogs` only | **Dry run by default.** Reverses one `RunId`, using the before-value in that run's audit rows. **Skips any tag whose purpose changed after the run.** Refuses a second rollback of the same run. Same locks, snapshot proof and per-tag audit |

Error numbers: `5200x`/`5201x`/`5202x` are validation stops, `5203x`/`5204x` are post-write assertions (rolled back), `52090` means verification failed, and `5210x`/`5211x` come from the rollback script. Every stop changes nothing.

### 4.1 Expected preview results

What script 01 should show in Production if the mapping is right:

| Result set | Expected |
|---|---|
| 1 | `StockPurposeColumnPresent = 1`, `MigrationApplied = 1` (after the migration), `ExpectedSaleUnits = 900`, `TestCodesListed = 0` (4 once confirmed) |
| 2 | Three rows, each `Verdict = OK`: `BatchFound = found`, `BatchSku` equals `ExpectedSku`, `BatchQuantity = 300`, `LiveTags = 300`, `DeletedTags = 0`, `TagsWithAnotherSku = 0`, `PurposeUnclassified = 300`. The QA columns show the real inspection state (expected mostly `QaNotEnrolled` or `QaPending`; **not assumed**) |
| 3 | Usually empty (or the few commercial units already sold or allocated) |
| 4 | The **4 sample candidates** (2 `MYBOSS-LW-QR-NFC`, 2 `PAWSOME-LW-QR-NFC`). Any extra row needs investigation before classifying anything |
| 6 | `SaleChanges = 900` and no `STOP:` row; `TestChanges = 4` once listed |
| 7 | `SaleUnits = 300` per SKU; `AvailableAfterClassification` = Sale and QA Passed shelf units minus open reservations (0 until inspections pass); samples appear only under `TestUnits` / `UnclassifiedUnits` / `PassedButNotForSale` |

These expectations were exercised end to end on LocalDB with a database shaped like this (three 300-unit batches, four samples including one with a tester and one Passed on the shelf, unrelated legacy stock). See §6.

---

## 5. Files changed

**API**

| File | Change |
|---|---|
| `Entities/Enums.cs` | `SmartTagStockPurpose { Unclassified, Sale, Test }` |
| `Entities/TagOrderEntities.cs` | `SmartTag.StockPurpose` |
| `Data/MyPetLinkDbContext.cs` | String conversion, default `Unclassified`, CHECK constraint |
| `Migrations/20261011034923_AddSmartTagStockPurpose(.Designer).cs`, `MyPetLinkDbContextModelSnapshot.cs` | New migration |
| `Services/SellableInventoryRules.cs` | `CommercialStock`, `IsCommercialStock`; `SellableUnit` now requires Sale; `RequireSellableForNewCommitment`, `NotForSaleMessage` |
| `Services/AdminService.cs` | Order tag assignment / change / replacement requires commercial stock (`409 stock_not_for_sale`) |
| `Services/AdminTagInventoryService.cs` | Generation requires and stamps purpose (audited); listing filter and projection; bulk send onward refuses non-commercial units |
| `Services/MerchantFulfilmentService.cs` | Specific `stock_not_for_sale` explanation when a non-commercial unit is chosen |
| `DTOs/AdminDtos.cs`, `DTOs/AdminTagInventoryDtos.cs` | Generation request and response purpose; inventory query filter and item field |

**Root `migration.sql`:** regenerated. The diff is the new migration's idempotent section only (+34 lines).

**Web (`apps/web/src`)**

| File | Change |
|---|---|
| `types.ts` | `TagStockPurpose` |
| `services/tagService.ts` | `adminGenerateRetailTags(count, sku, stockPurpose)`; refuses a missing purpose before sending |
| `services/adminTagInventoryService.ts` | Purpose on items, filter param (server and local paths), labels, bulk courtesy rule |
| `components/admin/AdminTagInventoryManager.tsx` | Filter, row badge, required generate choice and help text, messages |

**Tests:**

- API: `Relational/SellableInventoryRelationalTests.StockPurpose.cs` and `.StockPurposeScripts.cs` are new. The main file became `partial` and gained 2 catalogue cases.
- `AdminTagInventoryServiceTests` gained 2 tests.
- Fixtures that model commercial shelf stock are now `Sale`, so QA stays the variable they test: 16 test files, plus `AdminGenerateTagsRequest` callers passing `Sale`.
- Web: `AdminTagInventoryManager.test.tsx` and `tagService.generation.test.ts`.

**Scripts and docs:** the four scripts and this report. The remediation report links here.

**Not changed:** tag codes, QR/NFC URLs, QA statuses or rules, prices, catalogue records, orders, payments, ownership, marketing pages, SEO Phase 1, production data and configuration.

---

## 6. Test results (2026-10-11, local)

| Suite | Result |
|---|---|
| API, full (`dotnet test MyPetLink.Api.Tests`, SQL Server LocalDB, nothing skipped) | **2,638 passed, 0 failed** (remediation report baseline: 2,614) |
| Web, both flag projects (`npx vitest run`) | **4,209 passed, 4 skipped** |
| Web typecheck (`tsc --noEmit`) and lint (`eslint`) | Clean |

**New regression tests (real SQL Server, real services):**

| Test | Proves |
|---|---|
| `StockPurposeAndPhysicalQaTogetherDecideWhatIsSellable` (×7) | Catalogue count, `inStock`, merchant eligibility and checkout all agree. Sale+NULL, Sale+Pending, Test+Passed, Test+NULL, Unclassified+Passed and Unclassified+NULL are never sellable; Sale+Passed is |
| `TheCatalogueAdvertisesExactlyWhatCheckoutAccepts` (+2 states) | A Passed testing sample and a Passed unclassified unit are neither advertised nor accepted |
| `TestingAndUnclassifiedStockIsNeverReservedAssignedOrSentOnward` | Checkout `out_of_stock`; order assignment `stock_not_for_sale` with the right explanation; bulk Send to Reseller/Owner refused; nothing written |
| `TestingSamplesAreNeverAllocatedToAMerchant` | Not eligible; manual allocation `stock_not_for_sale`; auto-allocation `insufficient_inventory`; no allocation row |
| `TestingSamplesInInternalHandsKeepActivationScanningAndTransfer` | A sample with a tester activates, scans exactly like commercial stock and transfers. A Passed sample on the shelf can still be activated by a tester. No order is created |
| `TheLastCommercialUnitSellsExactlyOnceWithPassedSamplesBesideIt` | 6 concurrent checkouts with one Sale+Passed unit beside three Passed non-commercial units: exactly one succeeds |
| `Generate_RequiresAStockPurposeAndStampsItOnEveryNewTag` | Missing, `Unclassified` or out-of-range purpose is refused and creates nothing. Test and Sale batches are stamped and audited; new units start Pending |
| `List_FiltersByStockPurposeAndShowsItOnEveryRow` | Filter by each class (case-insensitive); the totals add up; unsupported values are refused |

**The production scripts, run verbatim on LocalDB** (only their documented parameters filled in):

| Test | Proves |
|---|---|
| `ThePreviewAndADryRunChangeNothing` | Every row, including the row versions, is byte-identical after 01 and a 02 dry run; no audit rows |
| `ApplyClassifiesExactlyTheConfirmedBatchesAndVerifiedSamplesAndNothingElse` | 03 fails before classification. After 02: exactly 900 Sale (exactly the batch units), 4 Test, the rest Unclassified. All other columns are identical. 904 audit rows, one RunId. The availability service then counts only Sale+Passed. 03 passes. A second 02 run changes nothing |
| `ApplyStopsWithoutChangingAnythingWhenTheDataDiffers` (×7) | Deleted batch unit, batch with another SKU, sample listed from a commercial batch, unknown code, wrong SKU, count mismatch, sample on an open order: each stops with its own error number and changes nothing |
| `RollbackRevertsOnlyTheRowsThatRunSetAndNothingChangedSince` | A dry run changes nothing. Commit reverts 903 tags and **leaves the one changed after the run alone**; 903 rollback audit rows. A second rollback is refused; 03 then fails |
| `ThePreviewRunsBeforeTheMigrationAndTheOtherScriptsRefuseToStart` | Without the column: 01 runs; 02 cannot compile (nothing changed); 03 fails |

**Mutation checks:**

- Dropping the purpose term from `SellableUnit` made 7 tests fail: the matrix rows for a Passed sample and a Passed unclassified unit, the catalogue agreement, assignment and send-onward, merchant allocation, the concurrent last-unit test and the script classification test.
- Letting order assignment accept any Passed unit made `TestingAndUnclassifiedStockIsNeverReservedAssignedOrSentOnward` fail.
- Defaulting generation to Sale made `Generate_RequiresAStockPurposeAndStampsItOnEveryNewTag` fail.
- Each time the source was restored byte for byte (hash-checked) and rebuilt from a fresh timestamp. The full-suite result above is for that identical code.

**Not verified visually:** the Admin UI changes are covered by component tests only. The local browser path needs the dev API on a migrated local database, and was not run.

---

## 7. Migration requirements

- **Migration:** `20261011034923_AddSmartTagStockPurpose`, ordered after `20261008040433_AddCommunityModerationActions`. Additive: one `NOT NULL` column with a default (metadata-only on SQL Server / Azure SQL) and one CHECK constraint. No data migration, no backfill: existing rows become `Unclassified`.
- **Compatibility:**
  - The currently deployed API ignores the column. Its inserts receive `Unclassified` from the default.
  - The new API requires the column.
- **No configuration, App Setting, secret or feature flag** is added or changed. Classification is data, owned by the reviewed scripts and Admin generation.

---

## 8. Production deployment order

This ships **with** the inventory-safety remediation (same API build) and inherits its blockers: X1 diagnostic results, X2 hold review, X3 stock at deploy, X4 freeze. Do not start until those are cleared.

1. **Backup.** Confirm a restorable backup and record its time.
2. **Freeze check (existing risk).** The API that is live today sells QA `NULL` shelf stock and knows nothing of purpose. Any on-shelf older sample could therefore be sold **today**. If the remediation's X4 applies (`OnShelfNotEnrolled > 0`), the sales freeze stays in force until step 7.
3. **Apply `migration.sql`** (`sqlcmd -I`). The live API keeps working.
4. **Preview.** Run script 01 and check result set 2 (three `OK`), 4 (exactly the expected candidates) and 6 (`SaleChanges = 900`, no `STOP:`).
5. **Resolve samples (optional for safety, required for the labels).** Confirm the four codes and list them in 01/02/03 with `@ExpectedTestCount = 4`. Re-run 01.
6. **Classify.** Run 02 with `@Commit = 0`, review, then `@Commit = 1`. Record the printed **RunId**. Run 03; every check must PASS, and record its expected catalogue stock.
7. **Deploy the API** (remediation + stock purpose). Classification must come first: before it, the new API would treat all 900 units as unclassified and offer nothing.
8. **Deploy the web app** (with SEO Phase 1). API first is preferred. The other order is safe: the old API ignores the purpose field, so a batch generated in that window is `Unclassified` and never sold.
9. **Post-deploy:**
   - `GET /api/v1/tag-products`: each variant's `inStock` equals 03's `ExpectedCatalogueInStock`.
   - Admin → Tag Inventory → Stock purpose = Commercial Stock shows 900 (Testing Samples shows the confirmed samples).
   - Re-run 03.
   - Units become sellable one by one as they pass inspection (gradual QA release, unchanged).

---

## 9. Rollback procedure

| Layer | How | Effect |
|---|---|---|
| Data (classification) | Script 04 with the RunId: dry run, then `@Commit = 1` | Reverts that run's tags to `Unclassified`, except any whose purpose changed since. Audited. With the new API, reverted units become unsellable; existing orders and allocations keep their flows |
| Application | Redeploy the previous API build | It ignores `StockPurpose`. As the remediation report warns, it also sells QA `NULL` stock again, and any older sample on the shelf with it. Pause purchasing first if `OnShelfNotEnrolled > 0` |
| Schema (only if required) | After the previous API is live, generate and run the down script: `dotnet ef migrations script 20261011034923_AddSmartTagStockPurpose 20261008040433_AddCommunityModerationActions` | Drops the constraint and column. **Prefer keeping the column**: it is harmless to the old API, and dropping it loses the classification (the audit rows remain) |

Never clear `QaStatus`, edit tag codes, or move units between SKUs as a rollback shortcut.

---

## 10. Open items for your review

1. **Sample tag codes** (§3.2): confirm the four codes from script 01 result set 4.
2. **Any other historical stock** of other SKUs, or older commercial stock, stays `Unclassified` and unsellable. Classify it only by exact identity, with the same review.
3. **Reclassification later:** SQL-only for now (scripts 02 and 04 patterns). Say if you want an Admin action behind a new capability.
4. **Testers activating Passed samples** stays allowed (§2.4). Say if samples should also be blocked from first activation.
