# Phase 1 Admin Operations

This document maps the Admin Portal to its backend requirements.

Status (2026-07-04): the admin backend is implemented. The Admin Portal now calls `/api/v1/admin/*` APIs (JWT + active `AdminUsers` policy, audited mutations) whenever the frontend is API-configured with an authenticated session; the local/demo state remains only as the unauthenticated fallback. Payment proofs are still metadata only (no file storage/preview), admin settings are read-only, printed/reseller batch tracking stays disabled, and admin lists load up to 100 rows and filter client-side pending server-side pagination in the UI.

## Admin Portal Source Of Truth

Current frontend pages:

- `/admin/login`
- `/admin`
- `/admin/orders`
- `/admin/payment-proofs`
- `/admin/tags`
- `/admin/tag-inventory`
- `/admin/users`
- `/admin/pets`
- `/admin/settings`
- `/admin/plans`

The former `/admin/qr-profiles` module was removed (see "Admin Pets" below); the route now redirects to `/admin/pets`.

Current local services:

- `apps/web/src/services/adminService.ts`
- `apps/web/src/services/tagService.ts`
- `apps/web/src/services/petService.ts`
- `apps/web/src/lib/orders.ts`
- `apps/web/src/lib/tagStatus.ts`
- `apps/web/src/lib/petLifecycle.ts`

## Current MVP Limitations And Backend Fixes

### Admin login is local placeholder

Current state:

- `/admin/login` sets a local demo admin session.
- There are no real credentials, roles, permissions, sessions, or audit logs.

Backend requirement:

- Implement Google Sign-In/JWT auth in Phase A.
- Add `AdminUsers` with role enforcement.
- Protect every `/api/v1/admin/*` endpoint.
- Write audit logs for every admin mutation.

### Payment proofs are file names only

Current state:

- Owner upload stores only the browser-selected file name.
- Admin sees the file name but no real stored receipt or preview/download.

Backend requirement:

- Store real files through the reusable `MediaFiles` system.
- Store provider-neutral metadata: original file name, storage file name, content type, size, provider, path, SHA-256, uploaded time.
- Link proof rows to orders and preserve review history.
- Admin proof review should fetch controlled file preview/download URLs.

### Owner-pet attribution is display-name based

Current state:

- Demo pets do not have reliable owner ids.
- Admin owner summaries infer ownership by display name and fallback rules.

Backend requirement:

- Use real FKs:
  - `Pets.OwnerUserId`
  - `TagOrders.OwnerUserId`
  - `SmartTags.OwnerUserId`
- Admin owner lists should compute counts from relational ownership, never display names.

### Printed/reseller tracking is disabled placeholder

Current state:

- Admin Tag Inventory shows Mark as Printed and Send to Reseller as disabled coming-later actions.

Backend requirement:

- Add batch fields such as `PrintedAt`, `SentToResellerAt`, `ResellerName`, `Remarks`.
- Keep UI actions disabled until backend implementation is explicitly scoped.
- Tag generation and CSV export are Phase 1 admin backend needs; reseller workflows can be later.

### Settings are read-only

Current state:

- `/admin/settings` reads frontend config for payment instructions, tag pricing, feature availability, support, and company info.

Backend requirement:

- Add `AppSettings` for backend-managed operational settings.
- Phase 1 can expose read APIs first.
- Admin write APIs can come later, with audit logs and validation.

### No pagination or search

Current state:

- Tables are local/demo volume and filter in the browser.

Backend requirement:

- All admin lists should support `page` and `pageSize`.
- Add filters/search for:
  - owners: search, status
  - pets: owner, lifecycle, Lost Mode, search
  - orders: status, payment status, owner, pet, search
  - payment proofs: review status, order status
  - tags: status, pet, owner, batch, TagCode, NFC
  - audit logs: actor, action, entity, date range

## Admin Dashboard Backend Requirements

Endpoint:

- `GET /api/v1/admin/dashboard/summary`

Return:

- total owners
- total pets
- active pets in Lost Mode
- pending payment proofs
- orders in preparation (`PaymentConfirmed`, `PreparingTag`)
- active smart tags
- lost/disabled tags
- unclaimed retail tags
- recent orders
- recent payment proof submissions
- recent tag activity

Rules:

- Active tag count excludes tags linked to Memorial or Archived pets.
- Lost Mode count includes active pets only.
- Unclaimed tags have no owner/pet and status `Unclaimed`.

## Admin Order Operations

Endpoints:

- `GET /api/v1/admin/orders`
- `GET /api/v1/admin/orders/{orderId}`
- `POST /api/v1/admin/orders/{orderId}/confirm-payment`
- `POST /api/v1/admin/orders/{orderId}/reject-payment-proof`
- `POST /api/v1/admin/orders/{orderId}/assign-tag`
- `POST /api/v1/admin/orders/{orderId}/status`
- `POST /api/v1/admin/orders/{orderId}/cancel`

Valid actions:

- Confirm Payment: `PaymentProofSubmitted` -> `PaymentConfirmed`
- Request Resubmission: `PaymentProofSubmitted` -> `PendingPayment`
- Assign Inventory Tag: confirmed order receives an unclaimed matching tag
- Mark Preparing: `PaymentConfirmed` -> `PreparingTag`
- Mark Shipped: `PreparingTag` -> `Shipped`
- Mark Delivered: `Shipped` -> `Delivered`
- Cancel Order: before shipping only

Side effects:

- Confirm payment sets payment status to `Confirmed`.
- Reject payment sets proof status to `Rejected`, payment status to `Rejected`, and order status to `PendingPayment`.
- Assigning inventory links an unclaimed tag to the owner, pet, and order, then moves it to `Preparing`.
- Preparing updates linked pending-family tag to `Preparing`.
- Delivered updates linked pending-family tag to `Delivered`.
- Admin order/tag pages do not activate customer tags; activation is completed by the owner from the Physical Tag Scan Page after scanning/tapping the physical tag.
- Cancel archives a linked tag that never became active.

## Admin Payment Proof Review

Endpoint:

- `GET /api/v1/admin/payment-proofs`

Review actions:

- Approve and Confirm Payment
- Request Resubmission
- View Order

Rules:

- Proof upload is never auto-confirmed.
- Rejection requires a friendly reason.
- Rejection never deletes the order or proof history.
- Admin review writes audit logs with old/new state.

## Admin Tag Operations

Endpoints:

- `GET /api/v1/admin/tags`
- `POST /api/v1/admin/tags/{tagId}/status`
- `POST /api/v1/admin/tags/{tagId}/archive`
- `POST /api/v1/admin/tags/{tagId}/restore`

Filters:

- active
- pending
- unclaimed
- lost/disabled
- replaced
- archived
- all

Rules:

- Active tags linked to Memorial/Archived pets display as inactive and must not count as active safety tags.
- View Tag opens `/t/:tagCode`.
- Lost/disabled/replaced/archived scans never expose owner contact.
- Pending-family tags can be archived as an admin correction if they never became active.

## Admin Tag Inventory

Endpoints:

- `POST /api/v1/admin/tags/generate`
- `GET /api/v1/admin/tag-batches/{batchNo}/export`

Rules:

- Generate 1 to 50 codes per MVP batch unless configuration changes this later.
- Generated retail tags are `Unclaimed`, with no `OwnerUserId` and no `PetId`.
- TagCode uses the single public `MPL-XXXX-XXXX` identifier.
- TagCode must be secure random and unique.
- CSV uses the same URL for QR and NFC: `/t/:tagCode`.

## Admin Owners

Endpoint:

- `GET /api/v1/admin/owners`

Return:

- owner account
- contact summary
- joined date
- status
- pet count
- order count

Rules:

- Counts use real FK relationships.
- Account suspension can be planned later but should fit `Users.Status`.

## Admin Pets

Endpoint:

- `GET /api/v1/admin/pets`

Filters:

- active
- Lost Mode
- memorial
- archived
- all

Rules:

- Lost Mode is a flag on active pets, not a lifecycle status.
- Memorial is never active.
- QR Safety enabled status should respect lifecycle.
- Smart tag status should exclude inactive linked tags from active counts.

### QR Safety Pages live in Admin Pets (QR Profiles module removed)

Decision (2026-07-05): the old `/admin/qr-profiles` ("QR Profiles") module was removed rather than renamed. It was a build-time server page mapping ~2 hardcoded demo pets, so it never showed backend-created pets, and its columns (pet, slug, owner, /q URL, status) duplicated Admin Pets.

Pet-level QR Safety Pages (`/q/:safetyCode`) are represented inside Admin Pets, which loads live backend data and already shows QR Safety status, lifecycle, Lost Mode, owner, the QR Safety Page (`/q`) link, and linked tags. A note on the Pets page clarifies that `/q` is pet-level and works without a physical tag, and that physical Smart Tags are managed under Smart Tags and Tag Inventory.

- `/q/:safetyCode` (pet-level QR Safety) is distinct from `/t/:tagCode` (physical Smart Tag scan) and `/p/:petSlug` (public share profile).
- `/q` does not depend on physical tag inventory.
- The `/admin/qr-profiles` route is kept only as a client-side redirect to `/admin/pets` for existing bookmarks.

## Admin Settings

Endpoints:

- `GET /api/v1/admin/settings`
- `PATCH /api/v1/admin/settings` future

Rules:

- Read-only is acceptable for Phase 1.
- Editable settings later must write audit logs.
- Settings should include manual payment mode, support contact, tag pricing labels, feature availability, and legal/company info.

## Security And Audit Requirements

- Admin routes require JWT plus active admin profile.
- Admin role checks should be enforced by policies.
- Every admin mutation writes `AuditLogs`.
- Audit record fields:
  - ActorId
  - ActorType
  - Action
  - Entity
  - EntityId
  - OldValue
  - NewValue
  - IP Address
  - UserAgent
  - CreatedAt
- Do not store secrets, raw refresh tokens, or file contents in audit JSON.
