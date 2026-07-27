# Business reference numbering

MyPetLink uses separate, persisted business references for orders, payment
receipts, and inventory batches. Their timestamp segment is readable Malaysia
Time (MYT, UTC+08:00); authoritative database timestamps remain UTC.

| Reference | New format | Assigned once from | Persistence |
| --- | --- | --- | --- |
| Order | `MPL-ORD-yyMMddHHmmss-NNNN` | `TagOrder.CreatedAt` | `TagOrders.OrderNumber` |
| Receipt | `MPL-RCP-yyMMddHHmmss-NNNN` | `TagOrder.PaymentConfirmedAt` | `TagOrders.ReceiptNumber` |
| Inventory batch | `MPL-BAT-yyMMddHHmmss-NNNN` | `SmartTagBatch.GeneratedAt` | `SmartTagBatches.BatchNo` |

`NNNN` is a cryptographically generated number from 1000 through 9999.
Formatting is centralized in `BusinessReferenceGenerator`; services use the
registered `TimeProvider`, explicitly convert UTC to `+08:00`, and never depend
on the host operating-system timezone. The embedded timestamp is display
information only and is never parsed for business logic.

## Architecture audit and compatibility

Before this change:

- order creation generated `MPL-ORD-yyyyMMdd-NNNN` directly inside
  `OrderService`, using UTC and a 12-attempt pre-check;
- receipts had no stored reference; each PDF download replaced `-ORD-` with
  `-RCP-` in the order number;
- inventory creation used a dedicated `SmartTagBatch`, but generated
  `BATCH-yyyyMM-NNNN` inside `AdminTagInventoryService` and allowed the Admin
  Portal to submit an optional manual batch reference;
- `OrderNumber`, `BatchNo`, and physical `TagCode` already had unique indexes
  and 80-, 80-, and 32-character storage respectively;
- owner/admin PDFs were already served by one canonical
  `OrderDocumentService`, and manufacturer exports already read the persisted
  `SmartTagBatch.BatchNo`.

After this change:

- new order, receipt, and batch references use the formats above;
- historical order and batch references are never renamed;
- migration `20260727075018_AddBusinessReferenceNumbers` backfills confirmed
  orders with the exact receipt reference the old PDF renderer displayed and
  leaves unconfirmed orders null;
- payment confirmation assigns `ReceiptNumber` in the same serializable
  transaction as `PaymentConfirmedAt`, proof approval, audit records, and the
  confirmation-email outbox record;
- normal inventory generation is server-only and creates one batch plus all of
  its tags atomically; manual batch-reference input is rejected;
- PDF downloads and manufacturer exports only read stored references and never
  regenerate them.

The three business-reference columns have unique database indexes.
`ReceiptNumber` uses a filtered unique index because it is null before payment
confirmation. Candidate generation uses bounded retries, with the unique
indexes as the concurrency guard; only the expected SQL Server unique-index
conflicts are classified as reference collisions.

## Physical tag codes are separate

Physical tag codes remain `MPL-XXXX-XXXX`, using the existing unambiguous
uppercase alphabet, secure random generation, unique index, and bounded
collision retry. Order, receipt, and batch references are never embedded in a
tag code. QR content remains `/q/{tagCode}` and NFC content remains
`/n/{tagCode}`.

## API and presentation

`TagOrderResponse` exposes nullable `receiptNumber`; it remains null until
payment is confirmed. The owner and admin receive the same persisted
`orderNumber` and `receiptNumber`. Admin order search/export supports receipt
references. The standard inventory-generation request does not trust a client
batch reference.

Canonical filenames are:

- `MyPetLink-Order-Summary-{OrderNumber}.pdf`
- `MyPetLink-Receipt-{ReceiptNumber}.pdf`

Filename references are restricted to ASCII letters, digits, hyphens, and
underscores and capped at 80 characters. Both legacy and new references remain
valid for display, filtering, exports, and downloads.
