# Phase 1 Operations Flow

How MyPetLink operations run in the early launch phase, using the Admin Portal (`/admin`) and manual payment review. See `docs/admin-portal-mvp.md` for page-by-page details.

## Order fulfillment flow (portal orders)

1. **Owner places an order** (`/pets/{id}/tags/order`): a tag is created already bound to the pet (status Pending); the order starts at **Pending Payment**.
2. **Owner pays the merchant QR** (DuitNow QR / TNG Merchant QR) and uploads a receipt/screenshot with an optional transaction reference → order becomes **Payment Proof Submitted**.
3. **Admin reviews the proof** at `/admin/payment-proofs`:
   - **Approve & Confirm Payment** → order becomes **Payment Confirmed** (receipt becomes available to the owner). Payment is never confirmed automatically.
   - **Request Resubmission** → order returns to **Pending Payment** with a friendly note; the order is never deleted.
4. **Admin marks the order Preparing** (`/admin/orders`) → the linked tag also moves to Preparing; tag is printed/assembled.
5. **Admin marks Shipped** (records the ship date) and later **Delivered** → the tag becomes Delivered and waits for the owner to activate it.
6. **Owner activates the delivered tag** → tag becomes **Active**; scans open the pet's QR Safety Page.
7. **Cancellations** are allowed before shipping; an unactivated linked tag is archived so it leaves the owner's tag lists.

## Retail tag flow (pet shops / resellers)

1. Admin generates a batch at `/admin/tag-inventory` (quantity, QR or QR + NFC, shape) → **Unclaimed** stock with `BATCH-YYYY-MM`, no pet, no owner.
2. Export the CSV for printing/manufacturing. (Printed / sent-to-reseller tracking arrives with the backend.)
3. A customer buys a tag, scans it, and lands on the activation page (`/t/{code}` → activation prompt).
4. The customer signs in or creates an account, links the tag to a new or existing pet → tag becomes **Active**.

## Incident handling

- **Lost tag**: mark Lost (owner or admin) — the physical tag stops exposing safety content; the pet's `/q/` safety page keeps working. Owner can order a replacement (old tag becomes Replaced).
- **Lost pet**: owner enables **Lost Mode** — public pages show the lost banner/details. Lost Mode is independent of tag status.
- **Suspicious/abandoned tag**: Disable, then Archive once resolved. Inactive tags never expose owner contact.
- **Memorial pets**: linked tags automatically scan as inactive memorial pages; they are not active safety tags and are excluded from active counts.

## Support and settings

- Support contact: support@gbbsoftwaresolutions.com (shown on receipts and in `/admin/settings`).
- Pricing: QR Pet Tag RM19.90, QR + NFC Smart Tag RM39.90 — one-time. Premium is Coming Soon; GPS Safety is Coming Later.
- Company: GBB Software Solutions, Business Registration No. 202603141718 (AS0515813-P), Malaysia.

## Phase 1 constraints

- All state is local/demo (browser localStorage); the Admin Portal and Owner Portal share the same collections, so status changes are consistent across both.
- Admin access is a local placeholder — before real operations begin, the backend must add real admin auth, roles, and audit logs (`docs/backend-needed-features.md`).
- Payment proof files are names only (no file storage yet); verify against the actual bank/eWallet statement out-of-band.
