# Order And Payment Proof Flow

Phase 1 uses manual payment proof review. There is no payment gateway, no automatic payment confirmation, and no subscription billing.

## Product Rules

- Smart tags are optional one-time add-ons.
- QR Pet Tag: RM19.90 one-time.
- QR + NFC Smart Tag: RM39.90 one-time.
- Delivery fee is Free in the current frontend.
- Premium is Coming Soon only.
- GPS Safety is Coming Later only.
- QR + NFC is not GPS tracking.
- Payment proof is manually reviewed by admin.

## Owner Portal Order Flow

1. Owner chooses an active pet.
2. Owner chooses tag type:
   - QR Pet Tag
   - QR + NFC Smart Tag
3. Owner chooses shape:
   - Round
   - Bone
   - Rounded Square
   - Paw
4. Owner enters delivery details.
5. Owner confirms order.
6. Backend creates:
   - `TagOrders` row with status `PendingPayment`
   - `SmartTags` row linked to selected `PetId`, `OwnerUserId`, and order
7. Owner pays with merchant QR.
8. Owner uploads receipt/screenshot and optional transaction reference.
9. Backend stores proof and changes order to `PaymentProofSubmitted`.
10. Admin reviews proof.

Important:

- Portal orders must have `PetId`.
- Portal-purchased tags are bound to the selected pet from order creation.
- Portal-purchased tags are never treated as unclaimed retail stock.
- Memorial and archived pets cannot place new physical tag orders.

## Payment Proof Storage

Current owner slice: payment proof submission stores metadata only. The frontend captures the selected filename, optional payment reference, and optional owner note; the backend creates a metadata-only `MediaFiles` row plus a `PaymentProofs` row. It does not upload or store actual file bytes, base64 payloads, or local uploaded files yet.

Future real upload/storage must use the reusable media system and provider-neutral file metadata.

Required file metadata:

- `OriginalFileName`
- `StorageFileName`
- `ContentType`
- `FileSize`
- `StorageProvider`
- `StoragePath`
- `Sha256`
- `UploadedAt`

Supported storage provider design:

- `Local`
- `AzureBlob`
- `S3`
- `CloudflareR2`
- `Other`

Rules:

- Store only provider-relative storage paths in the database.
- Do not expose raw storage paths publicly.
- Admin preview/download should use controlled URLs or signed URLs.
- Keep rejected proof history.
- Uploading proof never confirms payment automatically.
- Until real storage is implemented, `StorageProvider = MetadataOnly` means the proof is an owner-submitted metadata placeholder, not a retrievable file.

## Order Statuses

Canonical backend statuses:

- `PendingPayment`
- `PaymentProofSubmitted`
- `PaymentConfirmed`
- `PreparingTag`
- `Shipped`
- `Delivered`
- `Cancelled`

Frontend display labels:

- `PendingPayment` -> Pending Payment
- `PaymentProofSubmitted` -> Payment Proof Submitted
- `PaymentConfirmed` -> Payment Confirmed
- `PreparingTag` -> Preparing Tag
- `Shipped` -> Shipped
- `Delivered` -> Delivered
- `Cancelled` -> Cancelled

## Payment Statuses

- `Pending`
- `ProofSubmitted`
- `Confirmed`
- `Rejected`
- `Refunded` future only

## Payment Proof Statuses

- `PendingReview`
- `Approved`
- `Rejected`
- `Superseded`

## Valid Transitions

### Owner submits payment proof

Trigger:

- Owner calls `POST /api/v1/orders/{orderNumber}/payment-proof`.

Required current state:

- order `PendingPayment` or `PaymentProofSubmitted`
- payment `Pending`, `ProofSubmitted`, or `Rejected`

Result:

- order `PaymentProofSubmitted`
- payment `ProofSubmitted`
- new proof `PendingReview`
- prior pending proof metadata is marked `Superseded`

Owner portal shows:

- payment proof under review
- no receipt yet
- order not yet preparing

### Admin confirms payment

Trigger:

- Admin calls `POST /api/v1/admin/orders/{orderId}/confirm-payment`.

Required current state:

- order `PaymentProofSubmitted`
- latest proof `PendingReview`

Result:

- order `PaymentConfirmed`
- payment `Confirmed`
- proof `Approved`
- `PaymentConfirmedAt` recorded
- audit log written

Owner portal shows:

- payment confirmed
- receipt available
- tag preparation is next

### Admin rejects proof

Trigger:

- Admin calls `POST /api/v1/admin/orders/{orderId}/reject-payment-proof`.

Required current state:

- order `PaymentProofSubmitted`
- latest proof `PendingReview`

Result:

- order `PendingPayment`
- payment `Rejected`
- proof `Rejected`
- rejection reason saved
- audit log written

Owner portal shows:

- pending payment / resubmission needed
- friendly rejection reason
- option to upload a new proof

Rules:

- Never delete the order.
- Never delete the rejected proof record during normal operations.

### Admin marks preparing

Trigger:

- Admin calls `POST /api/v1/admin/orders/{orderId}/status` with `PreparingTag`.

Required current state:

- order `PaymentConfirmed`

Result:

- order `PreparingTag`
- linked pending-family tag `Preparing`
- audit log written

Owner portal shows:

- tag is being prepared

### Admin marks shipped

Trigger:

- Admin calls `POST /api/v1/admin/orders/{orderId}/status` with `Shipped`.

Required current state:

- order `PreparingTag`

Result:

- order `Shipped`
- shipped timestamp recorded
- tracking number/status saved when provided
- audit log written

Owner portal shows:

- tag is on the way

### Admin marks delivered

Trigger:

- Admin calls `POST /api/v1/admin/orders/{orderId}/status` with `Delivered`.

Required current state:

- order `Shipped`

Result:

- order `Delivered`
- delivered timestamp recorded
- linked pending-family tag `Delivered`
- audit log written

Owner portal shows:

- delivered
- activation available for delivered tag

### Owner activates delivered tag

Trigger:

- Owner calls `POST /api/v1/tags/{tagCode}/activate`.

Required state:

- tag `Delivered`
- linked order `Delivered`
- pet belongs to owner and is Active

Result:

- tag `Active`
- `ActivatedAt` recorded
- scan link `/t/:tagCode` opens pet QR Safety content
- audit log written

## Cancellation Rules

Current owner API allows cancellation only while:

- `PendingPayment`
- `PaymentProofSubmitted`

Future admin cancellation may additionally allow:

- `PaymentConfirmed`
- `PreparingTag`

Not allowed:

- `Shipped`
- `Delivered`

Result:

- order `Cancelled`
- linked unactivated tag archived
- order history remains visible
- audit log written when audit integration is enabled for this mutation

## Invalid Transitions

- Proof upload directly to `PaymentConfirmed`.
- Admin payment confirmation when no pending proof exists.
- Rejecting proof after payment is already confirmed.
- Preparing an order before payment is confirmed.
- Shipping an order before preparing.
- Delivering an order before shipping.
- Cancelling after shipping.
- Activating a delivered tag for a Memorial or Archived pet.
- Activating a tag for a pet owned by another user.

## Owner Portal Reflection

Owner order list/detail should show:

- order number
- selected pet
- tag type and shape
- amount
- payment status
- order status
- payment proof upload/resubmission area when needed
- rejection reason if rejected
- receipt only after payment confirmed
- delivery tracking status
- activation prompt when delivered tag is ready

## Admin Portal Reflection

Admin order/payment proof pages should show:

- order number
- owner
- pet
- amount
- tag type and shape
- current order status
- current payment status
- payment proof metadata and preview/download
- payment reference and owner note
- rejection reason history
- delivery details
- linked tag
- available actions based on current state

## Audit Logging

Write audit logs for:

- payment proof submitted
- payment confirmed
- payment proof rejected
- order marked preparing
- order marked shipped
- order marked delivered
- order cancelled
- delivered tag activated

Audit fields:

- `ActorId`
- `ActorType`
- `Action`
- `Entity`
- `EntityId`
- `OldValue`
- `NewValue`
- `IpAddress`
- `UserAgent`
- `CreatedAt`
