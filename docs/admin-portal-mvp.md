# MyPetLink Admin Portal MVP

The Admin Portal is the operations workspace for Phase 1 manual operations. It lives in the same Next.js app (`apps/web`) under `/admin`, uses the same local/demo state as the Owner Portal, and is protected by a local demo admin session only. **The future backend must enforce real admin roles and permissions.**

## Design direction

Clean, compact, dashboard-style, and status-focused: tables, filter pills with counts, status badges, and inline detail panels. It reuses MyPetLink design tokens but is deliberately more operational than the owner/public surfaces. Desktop-first layout that stays usable on mobile (2-column nav, internally scrolling tables, no horizontal page overflow).

## Routes and pages

### `/admin/login` — Admin access
Local placeholder login ("Admin access — This area is for MyPetLink operations."). One button enters the operations workspace with a local admin session. No real authentication; do not present it as secure sign-in.

### `/admin` — Operations dashboard
- Summary cards: total owners, total pets (+ Lost Mode count), pending payment proofs, orders in preparation (Payment Confirmed + Preparing), active smart tags, lost/disabled tags, unclaimed retail tags.
- Quick actions: Review Payment Proofs, View Orders, Manage Tags, Generate Tag Codes, View Tag Inventory.
- Recent activity: latest orders, latest payment proof submissions, recent tag activity. Order items deep-link to `/admin/orders?order={orderNumber}`.

### `/admin/orders` — Order management
- Filters (with counts): Pending Payment, Payment Proof Submitted, Payment Confirmed, Preparing Tag, Shipped, Delivered, Cancelled, All.
- Columns: order number, owner, pet, tag type, amount, payment status, order status, created date, delivery status, actions.
- Inline detail panel: payment method/reference/proof/dates, resubmission note, recipient, address, phone, notes, shipped/delivered dates, linked tag.
- Actions (status-gated by `getAdminOrderActions` in `apps/web/src/lib/orders.ts`):
  - **Confirm Payment** — Payment Submitted → Payment Confirmed (sets `paymentConfirmedDate`).
  - **Request Resubmission** — Payment Submitted → Pending Payment with a friendly `paymentRejectionReason`; never deletes the order.
  - **Mark Preparing** — Payment Confirmed → Preparing; linked pending tag also moves to Preparing.
  - **Mark Shipped** — Preparing → Shipped (sets `shippedDate`).
  - **Mark Delivered** — Shipped → Delivered (sets `deliveredDate` on order and linked tag; tag becomes Delivered, awaiting activation).
  - **Cancel Order** — allowed before shipping; archives a linked tag that never became active.
- `?order=` opens a specific order (used by payment proofs and dashboard links).

### `/admin/payment-proofs` — Manual payment review
Queue of orders with submitted proof (Awaiting review / Reviewed / All). Each item: order number, owner, pet, amount, payment reference, uploaded proof name, submitted date, owner note, status. Actions: Approve & Confirm Payment, Request Resubmission, View Order. No real file storage — the proof is the uploaded file name in this phase.

### `/admin/tags` — Smart tag management
- Filters (with counts): Active, Pending, Unclaimed, Lost / Disabled, Replaced, Archived, All. Supports `?pet={petId}` scoping from the pets page.
- Columns: tag code, type (QR / QR + NFC), linked pet, linked owner, order, status, activation date, last scanned, created date.
- Status display uses the shared `getTagDisplayStatus`: a tag linked to a Memorial/Archived pet shows as inactive ("Inactive - memorial profile") and is never counted as an active safety tag.
- Actions by state: Active → Mark Lost / Disable / Archive; Lost or Disabled → Mark Replaced / Archive; Replaced → Archive; Unassigned → Disable / Archive; pending-family → Archive; Archived → Restore. "View Tag" opens `/t/{tagCode}` in a new tab.

### `/admin/tag-inventory` — Retail stock
- Generate tag codes (1–50 per batch): creates **Unclaimed** stock — a TagCode with no pet and no owner — with an auto `BATCH-YYYY-MM` number. Customers activate via scan/tap on `/t/{tagCode}` → link to a pet → Active.
- Export CSV: simple frontend-only CSV download of the stock list.
- Mark as Printed / Send to Reseller: visible but disabled ("coming later") — printing/reseller tracking needs backend fields.
- Portal-purchased tags are bound to a pet from the start and never appear as unclaimed stock.

### `/admin/users` — Owners
Owner accounts with live pet/order counts, phone/WhatsApp, joined date, status, and links to pets/orders. Account suspension is not implemented (noted as a later update). Because demo pets carry only an owner display name (no owner id), pets that match no account name are attributed to the signed-in demo owner.

### `/admin/pets` — Pet profiles
Filters: Active, Lost Mode, Memorial, Archived, All (Lost Mode is a flag on active pets, not a lifecycle status; Memorial is never treated as Active). Columns: pet, owner, type/breed, QR Safety status, smart tag status (active/pending/none via `getPetSmartTagStatus`), lifecycle badge, Lost Mode badge, created date. Actions: Public Profile and QR Safety Page (new tab), View Tags (scoped), View Owner.

### `/admin/settings` — Operations settings (read-only)
Order settings, payment proof instructions, tag pricing (RM19.90 / RM39.90 one-time), feature availability (Free available, Premium Coming Soon, GPS Coming Later), support contact, and company/legal info — all sourced from `src/config/site.ts`, `src/config/payment.ts`, and `src/lib/planLimits.ts`. Editing arrives with a later update.

### Kept earlier pages
`/admin/qr-profiles` and `/admin/plans` remain from the earlier admin skeleton.

## Shared state and consistency

Admin pages read and write through the same services as the Owner Portal (`petService`, `tagService` — localStorage collections `mypetlink_pets`, `mypetlink_tags`, `mypetlink_orders`). `getAdminData()` in `src/services/adminService.ts` is the shared read helper; admin mutations live in `src/services/tagService.ts` (`adminConfirmOrderPayment`, `adminRejectOrderPayment`, `adminMarkOrderPreparing/Shipped/Delivered`, `adminCancelOrder`, `adminGenerateRetailTags`). Verified consistency: an admin status change is immediately visible on the owner `/orders` page.

## Limitations (this phase)

- Local demo admin session only; no roles, permissions, or audit logs.
- Payment proof is a file name; no real file storage or image preview.
- Owner↔pet attribution is by display name (no owner id on pets in the demo).
- Print/reseller tracking, account suspension, and settings editing are placeholders.
- No pagination/search on tables (demo data volumes are small).
- Every admin action needs a backend audit trail later — see `backend-needed-features.md`.
