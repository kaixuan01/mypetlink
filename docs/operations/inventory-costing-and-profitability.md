# Inventory costing and profitability

## Scope

Phase 1 uses specific-identification costing for serialized Smart Tags. A
`SmartTagBatch` remains a code-generation and production grouping; it is not a
purchase or costing document. Physical replenishment is recorded separately as
an immutable `InventoryReceipt`.

## Stock receipt workflow

In **Admin → Tag Inventory → Stock receipts**, an administrator selects a SKU,
optionally narrows it to a production batch, enters the received quantity and
date, and records landed cost using either:

- **Simple:** quantity × landed cost per tag; or
- **Detailed:** goods + freight + customs/tax + other cost, converted to MYR by
  the recorded exchange rate.

The server calculates authoritative MYR totals. Monetary totals use two decimal
places; derived per-tag cost uses six decimal places. Receipt creation takes the
same SQL Server SKU application lock used by retail and merchant allocation,
then attaches the requested number of oldest eligible, unreceived serialized
tags. A partial receipt therefore links only the physical quantity received.

Receipts cannot be edited or deleted through the API. A correction is a new
receipt that references the earlier receipt. It may replace the receipt link
only while none of those tags has contributed to shipped COGS, and must keep
the same SKU, batch and quantity. Once used by a shipment, the receipt and its
historical snapshots are immutable; accounting adjustments for already-sold
stock remain a later-phase workflow.

## Shipment-time COGS

Retail COGS freezes when an order first moves from Ready to Ship to Shipped.
Each serialized tag creates an immutable `TagOrderItemCostAllocation` with its
receipt number and six-decimal unit cost. The order item stores the exact sum in
`CostOfGoodsSnapshot`, plus `CostSnapshotAt` and `CostBasis`.

Merchant COGS freezes when active allocated tags are dispatched. The existing
per-tag `MerchantOrderAllocatedTag` records preserve receipt and unit-cost
snapshots, while each merchant order item stores the exact summed COGS.

If any unit lacks a receipt, the line is `Unavailable`, its COGS total is null,
and the report counts the missing unit. Missing cost is never treated as RM0.
Later replenishment cannot reprice an existing snapshot.

A pre-shipment assigned-tag change does not freeze cost. A post-shipment
replacement also does not change the original sale COGS; replacement/warranty
expense is explicitly excluded from the Phase 1 contribution report until a
dedicated append-only expense workflow is added.

## Profitability formulas

The Admin date range selects order lines by their first shipment cost snapshot.

- Product revenue = gross retail line subtotal + gross merchant line amount.
- Discounts = retail line discounts + merchant line discounts + merchant
  order-level discounts.
- Net product revenue = product revenue − discounts.
- COGS = sum of immutable line COGS snapshots.
- Gross profit = net product revenue − COGS, only when all included units are
  costed.
- Gross margin = gross profit ÷ net product revenue.
- Contribution profit = gross profit − recorded courier cost − existing,
  non-reversed sales commission, only when all included units and courier costs
  are present.

Commission is joined by its explicit source. Merchant rows subtract only
non-reversed `MerchantOrder` commission for that merchant order; retail rows
subtract only non-reversed `TagOrder` commission for that retail order. A
commission from one channel can never reduce the other channel's contribution.
For merchant orders this may be a legacy percentage, an acquisition bonus, a
repeat percentage, or no commission after the reseller window. The report sums
the actual non-reversed ledger rows and never assumes every merchant order has
one or subtracts a configured rate independently.

Payment gateway fees, advertising, general operating expenses and replacement
unit expense are not recorded and are therefore clearly excluded rather than
estimated.

## Known availability boundary

Receipt linkage is intentionally **not** part of current sellability checks.
Legacy generated or printed tag rows may already represent physical stock, and
there is not yet enough verified production data to backfill them safely.
Changing availability to require `InventoryReceiptId` would make that legacy
inventory disappear. A separate, operator-reviewed inventory correction must
classify existing Generated/Printed rows before receipt linkage can become a
sellability requirement.
