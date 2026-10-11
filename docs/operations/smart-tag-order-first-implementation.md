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
  Pending tags are never offered. Only orders that assignment, change or
  replacement can act on are served: an order awaiting payment or cancelled
  is refused (422), an unknown order is 404, and a line from another order is
  400. Every tag offered is one the assignment endpoint accepts.
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
| `docs/deployment/sql/smart-tag-order-first/03-release-readiness.sql` | Release gate: migration history, the confirmed 900 / 3 / 897 baseline, samples still Unclassified, no double commitment; orderable stock per SKU and every open order line that reserves units. Fails with an error if any check fails |
| `docs/deployment/sql/smart-tag-stock-purpose/03-verify-smart-tag-stock-purpose.sql` | Updated: expected catalogue stock uses the orderable rule; fulfillable shown beside it |

Classifying the samples as Test needs separate approval. It is done with the
stock-purpose apply script (`02-apply-…`, idempotent), listing the lines from
the sample preview and `@ExpectedTestCount = 4`, dry run first. Stock receipts
are not changed by classification.

## Release runbook

Nothing here changes tags, orders or receipts. The only Production change
before the release is the purchase pause, an audited Admin Portal setting.

**0. Readiness (read only).** Run
`docs/deployment/sql/smart-tag-order-first/03-release-readiness.sql`. Every
check must be PASS or INFO: stock purpose is the latest migration, 900 Sale
tags, all receipt-linked, 3 Passed and 897 Pending, both sample batches still
Unclassified, no double commitment. Result sets 2 and 3 list orderable stock
per SKU and every open order line that reserves units. Keep the output.

**1. Pause purchases (backend enforced).** Admin Portal → Tag Products → for
each of `MYBOSS-LW-QR-NFC`, `PAWSOME-LW-QR-NFC` and `PAWSOME-SD-QR-NFC`, turn
off **Available for purchase** and save. Checkout and the delivery quote then
refuse the SKU on the server (`409 product_unavailable`, in the build that is
live today and in this release), and the public catalogue stops offering it.
Orders already placed are unaffected: they keep their reservation, can still
submit payment proof, and can be confirmed and fulfilled.
(The global App Setting `Features__SmartTagOrderingEnabled=false` also blocks
every new order, but it restarts the app and blocks all SKUs; use it only if
the per-SKU pause cannot be applied.)

**2. Prove the pause.** `GET https://api.mypetlink.com.my/api/v1/tag-products`
no longer offers the three SKUs. Signed in as a test owner, the order flow
offers no Smart Tag. Do not continue until both are true.

**3. Publish the API.** Source: the release commit on
`feature/order-first-qa-shipping`, checked out clean in
`D:\Project\MyPetLink-order-first` (`git status` empty). Never publish from
`C:\Project\MyPetLink`: it carries uncommitted local changes. Visual Studio →
`apps/api/MyPetLink.Api` → Publish (Release) with the existing Production
profile. No migration.

**4. Smoke test the API (still paused).**
- `GET /health` → 200.
- Build identity: unauthenticated
  `GET /api/v1/admin/orders/00000000-0000-0000-0000-000000000000/assignable-tags`
  → **401** (the previous build returns 404).
- Run `03-release-readiness.sql` again: same results as step 0.
- `GET /api/v1/tag-products`: the three SKUs are still not offered (pause holds).
- As an operator, open a Payment Confirmed order (if one exists): the picker
  lists only QA Passed tags and shows Awaiting Physical QA for units without one.
  Do not assign anything unless it is a real order being fulfilled.

**5. Release the web.** After the API is verified and you approve: push the
branch, then merge it to `main` (fast-forward). `main` is the Cloudflare Pages
production branch, so the merge deploys the web.

**6. Confirm the web deployment.** The "Cloudflare Pages" check on the merge
commit succeeds, and the live site serves the new build: the checkout
confirmation reads "Every MyPetLink Smart Tag is individually quality-checked
before dispatch."

**7. Verify end to end.** Admin Portal → Orders: the Assign picker searches by
tag code and batch, shows the QA pass date, and never offers Pending tags. The
catalogue still hides the three SKUs (paused).

**8. Resume purchases.** Turn **Available for purchase** back on for the three
SKUs. `GET /api/v1/tag-products` shows them in stock. Run
`01-preview-order-first-stock.sql`: `AvailableToOrder` per SKU is the number
customers can now order.

## Rollback

- **Before the web release** (step 4 fails): keep the SKUs paused and
  republish the previous API build. The probe in step 4 returns 404 again.
- **After the web release:** revert the merge on `main` first
  (`git revert -m 1 <merge>`, push), then republish the previous API if needed.
  The previous web works with the new API, but the new web picker needs the
  new API.
- **Orders keep working.** No order is cancelled or changed by a rollback.
  Orders placed against Pending stock keep their reservation; under the
  previous API the catalogue counts Passed stock only, so it may show the SKU
  out of stock until enough tags pass. Unverified tags never ship under either
  build: assignment, Ready to Ship and Shipped require QA Passed in both.
- **Data:** nothing to restore. Resume purchases only after the rollback is
  verified.
