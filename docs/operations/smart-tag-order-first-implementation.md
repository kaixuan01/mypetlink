# Smart Tag: Order First, QA Before Shipping

**Prepared:** 2026-10-11 on branch `feature/order-first-qa-shipping` (worktree
`D:\Project\MyPetLink-order-first`, base `f7eda5d`). Not pushed, not merged,
not deployed. No Production data changed and no migration applied.
**Design and audit:** [`smart-tag-order-first-qa-audit.md`](smart-tag-order-first-qa-audit.md).
**Includes:** the stock purpose separation
([`smart-tag-stock-purpose-separation.md`](smart-tag-stock-purpose-separation.md)),
whose migration is already applied in Production.

## The flow

Order → Payment Confirmed → Physical QA → Tag Assignment → Shipping.

Customers can order received commercial stock that is still waiting for its
inspection. Each unit is inspected and must pass before an admin can assign
it. Nothing is inspected, assigned, cancelled or refunded automatically.

## Rules (`SellableInventoryRules`)

| Rule | Definition | Used by |
|---|---|---|
| `OrderableUnit` | `OnShelf` AND `Sale` AND received (`InventoryReceiptId` set) AND QA `Pending` or `Passed` | Catalogue `inStock`, checkout (pre-check and the locked re-check), delivery quote, reservation arithmetic (`TagOrderInventoryAvailabilityService`) |
| `FulfillableUnit` (was `SellableUnit`) | `OnShelf` AND QA `Passed` AND `Sale` | Merchant allocation eligibility (`MerchantInventoryEligibility.For`), the Assign picker |
| `RequireSellableForNewCommitment` | Passed AND Sale, per tag | Admin assign, change and replace; admin claim; retail activation of an unowned tag |
| `RequirePassedForFulfilment` | Passed, per tag | Retail Ready to Ship and Shipped; merchant handoffs |

- QA NULL, Failed and Needs Review are never orderable. Test and Unclassified
  stock is never orderable or fulfillable, even when received and Passed.
- Available to order = orderable units − outstanding reservations, under the
  existing per-SKU application lock. Reservations are SKU quantities, never
  specific tags, so a paid order keeps its reservation until a Passed tag is
  assigned (assignment consumes it; stock is consumed at assignment).
- A stock receipt only links tags. It never changes QA status or stock
  purpose, so it cannot make unenrolled, failed or non-commercial stock
  orderable.
- Every Passed guard on assignment, change, replacement, Ready to Ship,
  Shipped, merchant allocation and bulk distribution is unchanged. Legacy
  issued tags and owner activation keep their existing behaviour.

## Admin experience

- **Assign / Change / Replace picker** searches on the server
  (`GET /api/v1/admin/orders/{orderId}/assignable-tags`, capability
  `orders.tags.assign`): every Passed tag of the order line's product, by tag
  code or batch, 20 per page with Show more. Each row shows its QA pass date.
  Pending tags are never offered.
- **Awaiting Physical QA** appears in the picker and in the order drawer for a
  Payment Confirmed order with units still missing a tag, with the number of
  units and the number of received tags waiting for inspection.
- **No inspected stock left**: the picker tells the admin to keep the order on
  hold, contact the customer, and arrange any refund manually.

## QA failure after payment

A tag that fails (or is set aside for review) stops being orderable and can
never be assigned. The paid order keeps its reservation and stays Payment
Confirmed; the admin inspects another package and assigns it. If none passes,
the order waits on hold. Refunds remain outside MyPetLink.

## Customer copy

The checkout confirmation and the owner's order page say: "Every MyPetLink
Smart Tag is individually quality-checked before dispatch." No dispatch time
is promised.

## SQL (read only)

| Script | Purpose |
|---|---|
| `docs/deployment/sql/smart-tag-order-first/01-preview-order-first-stock.sql` | Per SKU: orderable, fulfillable, reservations, available to order, previous rule's availability, expected catalogue `inStock`; paid orders awaiting an inspected tag |
| `docs/deployment/sql/smart-tag-order-first/02-preview-sample-classification.sql` | The four older samples by exact batch (`BATCH-202607-9013`, `BATCH-202607-8221`): identity, links, QA, proposed purpose, linked stock receipts and their accounting meaning, and the exact `@TestTags` lines |
| `docs/deployment/sql/smart-tag-stock-purpose/03-verify-smart-tag-stock-purpose.sql` | Updated: expected catalogue stock uses the orderable rule; fulfillable shown beside it |

Classifying the samples as Test needs separate approval. It is done with the
stock-purpose apply script (`02-apply-…`, idempotent), listing the lines from
the sample preview and `@ExpectedTestCount = 4`, dry run first. Stock receipts
are not changed by classification.

## Rollout

1. Run `01-preview-order-first-stock.sql` (read only) and confirm the
   expected per-SKU numbers.
2. Publish the API from the approved commit. No migration is needed: the only
   schema change (`AddSmartTagStockPurpose`) is already applied.
3. Run `03-verify-…` and compare `ExpectedCatalogueInStock` with
   `GET /api/v1/tag-products`.
4. Merge to `main` to release the web app (the picker calls the new endpoint,
   so the API must be live first).

## Rollback

Roll back the web first, then the API (the new picker needs the new endpoint).

- **Web:** revert the merge. The previous picker reads tag inventory directly.
- **API:** republish the previous build. Orderable reverts to Passed-only
  stock (stricter). Orders placed against Pending stock stay valid and
  reserved; while their reservations exceed the Passed stock, the catalogue
  shows the SKU out of stock, and the orders wait for a Passed tag exactly as
  under this release.
- **Data:** none changed.
