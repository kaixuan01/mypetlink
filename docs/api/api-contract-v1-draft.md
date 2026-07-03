# MyPetLink API Contract V1 Draft

Planning draft for the future C# .NET 8 API. This API is not implemented yet.

Base path: `/api/v1`

All endpoints below are versioned from day one to avoid future breaking route changes.

## Response Style

Use the frontend-compatible envelope:

```json
{
  "data": {},
  "meta": {
    "requestId": "01J...",
    "page": 1,
    "pageSize": 20,
    "total": 42
  }
}
```

Error envelope:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Please check the submitted fields.",
    "details": {
      "petId": ["Pet is required."]
    }
  },
  "meta": {
    "requestId": "01J..."
  }
}
```

Common status codes:

- `200 OK`: successful read/update
- `201 Created`: successful create
- `202 Accepted`: queued/future asynchronous work
- `204 No Content`: successful logout/delete/archive without body
- `400 Bad Request`: invalid shape or invalid transition
- `401 Unauthorized`: missing/invalid token
- `403 Forbidden`: authenticated but not allowed
- `404 Not Found`: missing resource or resource not owned by caller
- `409 Conflict`: uniqueness or state conflict
- `413 Payload Too Large`: upload exceeds configured limit
- `415 Unsupported Media Type`: invalid upload type
- `422 Unprocessable Entity`: valid JSON but business validation failed
- `429 Too Many Requests`: rate limited public lookup/login attempt

## Auth Rules

- Protected endpoints require a JWT bearer access token.
- Refresh token endpoints use a secure refresh token value and rotate tokens.
- Admin endpoints require an active `AdminUsers` record; a role claim alone is not enough.
- Public endpoints must never expose internal ids or private owner fields.
- Owner endpoints must scope every read/write by the authenticated user.
- Every admin mutation writes an `AuditLogs` record.
- Phase A implements Google Login first through `ExternalLogins.Provider = Google`.
- `ExternalLogins` is designed for multiple provider values: `Google`, `Apple` later, and `EmailOtp` later if passwordless email login is approved.
- No password login is implemented in Phase A.

## Pagination And Filtering

List endpoints accept:

- `page`: integer, default `1`, minimum `1`
- `pageSize`: integer, default `20`, minimum `1`, maximum `100`
- Domain filters documented per endpoint group

Responses include `meta.page`, `meta.pageSize`, and `meta.total`.

## Auth / Account

### POST `/api/v1/auth/google`

Purpose: sign in or register with Google as preferred initial login method.

Auth: public.

Request:

- `idToken`: required Google ID token

Response:

- `accessToken`
- `refreshToken`
- `expiresIn`
- `user`: `id`, `email`, `displayName`, `roles`
- `ownerProfile`: owner profile summary if present

Validation:

- Validate Google token issuer, audience, expiry, and subject.
- Normalize and verify email from token.
- Create or update `Users`.
- Create or update `ExternalLogins` with `provider = Google`.
- Create owner profile on the Free plan when needed.
- Issue JWT access token and rotating refresh token.

Errors:

- `401` invalid Google token
- `403` user suspended
- `500` Google auth provider not configured
- `409` email linked to unsupported login state

### POST `/api/v1/auth/refresh`

Purpose: rotate refresh token and issue a new access token.

Auth: refresh token.

Request:

- `refreshToken`: required

Response:

- `accessToken`
- `refreshToken`
- `expiresIn`

Validation:

- Token hash exists, not expired, not revoked.
- Rotate token on every successful refresh.

Errors:

- `401` invalid/expired/reused refresh token
- `403` user suspended

### POST `/api/v1/auth/logout`

Purpose: revoke the current refresh token/session.

Auth: required.

Request:

- `refreshToken`: optional; if omitted revoke current session where identifiable

Response:

- `204 No Content`

Errors:

- `401` invalid access token

### GET `/api/v1/auth/me`

Purpose: get current authenticated user and roles.

Auth: required.

Response:

- `user`: id, email, displayName, status
- `ownerProfile`: id, displayName, plan, settings
- `admin`: role and active status if applicable

Errors:

- `401` unauthenticated

### Future auth endpoints - planned only

These routes are planning notes and must not be exposed as working behavior until implemented:

- `POST /api/v1/auth/apple`
- `POST /api/v1/auth/email-otp/request`
- `POST /api/v1/auth/email-otp/verify`

Apple Login is planned for later. Email OTP/passwordless login may be considered later. Password login is not part of Phase A.

### PATCH `/api/v1/account/owner-profile`

Purpose: update owner settings.

Auth: owner.

Request:

- `ownerDisplayName`
- `phoneE164`
- `whatsappE164`
- `defaultGeneralArea`
- `privacyDefaults`
- `notificationPreferences`

Response:

- updated owner profile

Validation:

- E.164 phone/WhatsApp when supplied.
- Email is not changed here.
- Privacy defaults must match known keys.

Errors:

- `400` invalid phone
- `422` invalid privacy settings

## Pets

### GET `/api/v1/pets`

Purpose: list authenticated owner's pets.

Auth: owner.

Query:

- `page`, `pageSize`
- `lifecycleStatus`: optional `Active`, `Memorial`, `Archived`, `All`

Response:

- pet summaries including public/QR paths, lifecycle, Lost Mode, smart tag summary

Errors:

- `401` unauthenticated

### POST `/api/v1/pets`

Purpose: create a pet.

Auth: owner.

Request:

- basic profile fields: `name`, `species`, `customSpecies`, `breed`, `gender`, `color`, `birthday`, `adoptionDay`, `generalArea`, `bio`, `profileTheme`
- contact/safety fields: `contact`, `visibility`, `safetyNote`, `emergencyNote`

Response:

- created pet with generated `publicCode`, `safetyCode`, `publicProfilePath`, `qrSafetyPath`

Validation:

- owner must be under configured plan limit unless grandfather override allows create.
- `name` required.
- `species` must be known or `Other` with `customSpecies`.
- public identifiers generated server-side only.

Errors:

- `422` plan limit reached
- `400` invalid field

### GET `/api/v1/pets/{petId}`

Purpose: get owner pet detail.

Auth: owner.

Response:

- full owner-authorized pet detail

Errors:

- `404` not found or not owned

### PATCH `/api/v1/pets/{petId}`

Purpose: update profile, contact, safety, public visibility, and QR settings.

Auth: owner.

Request:

- partial pet fields

Response:

- updated pet

Validation:

- `publicCode` and `safetyCode` cannot be changed by client.
- lifecycle changes should use lifecycle endpoints.

Errors:

- `404` not found or not owned
- `422` invalid visibility/contact fields

### POST `/api/v1/pets/{petId}/mark-memorial`

Purpose: move active pet to Memorial.

Auth: owner.

Request:

- `passedAwayDate`
- `memorialMessage`
- `showMemorialOnPublicProfile`

Response:

- updated pet lifecycle

Rules:

- Memorial pets are not active pets.
- Emergency finder contact actions are hidden on public safety surfaces.
- Linked physical tags scan as inactive/memorial but are not deleted.

Errors:

- `400` already archived
- `404` not found or not owned

### POST `/api/v1/pets/{petId}/restore-active`

Purpose: restore Memorial or Archived pet to Active.

Auth: owner.

Response:

- updated pet lifecycle

Validation:

- archived restore checks configured plan limits and grandfather overrides.

Errors:

- `422` plan limit reached
- `404` not found or not owned

### POST `/api/v1/pets/{petId}/archive`

Purpose: archive a pet profile.

Auth: owner.

Response:

- updated pet lifecycle

Rules:

- Archive hides from main owner list.
- Records, memories, orders, and tags remain saved.
- Linked tags scan inactive and do not expose owner contact.

Errors:

- `404` not found or not owned

### POST `/api/v1/pets/{petId}/lost-mode`

Purpose: enable, update, or disable pet-level Lost Mode.

Auth: owner.

Request:

- `enabled`
- `lastSeenArea`
- `lastSeenDateTime`
- `lostMessage`
- `rewardNote`
- `extraContactInstruction`

Response:

- updated pet Lost Mode state

Rules:

- Lost Mode is not Memorial.
- Lost Mode does not change physical tag status.
- Lost Mode only applies to active pets.

Errors:

- `400` cannot enable on memorial/archived pet
- `404` not found or not owned

## Public

### GET `/api/v1/public/profiles/{publicCode}`

Purpose: resolve Public Share Profile by stable pet public code.

Auth: public.

Response:

- public share projection
- public memories/care summaries allowed by owner visibility

Rules:

- Lookup by `publicCode`, not slug.
- Never expose internal ids, owner email, private notes, full address, or hidden phone/WhatsApp.
- Lost Mode may add missing-pet banner/contact CTA when public contact is allowed.

Errors:

- `404` profile not found or not public
- `429` rate limited lookup abuse

### GET `/api/v1/public/safety/{safetyCode}`

Purpose: resolve pet-level QR Safety Page.

Auth: public.

Response:

- finder-first safety projection

Rules:

- `/q/:safetyCode` works without physical tag purchase.
- Active pets expose only allowed contact/safety fields.
- Memorial/archived pets return inactive/memorial-safe projection without emergency contact actions.
- Disabled `QrSafetyEnabled` returns safe unavailable state.

Errors:

- `404` not found
- `403` safety page disabled

### GET `/api/v1/public/tags/{tagCode}`

Purpose: resolve physical tag scan page.

Auth: public.

Response:

- `state`: `active`, `unclaimed`, `pending`, `inactive`, `notFound`
- `tagCode`
- `profile` only when active or safe inactive memorial projection is allowed

Rules:

- Active tag linked to active pet opens same safety content as `/q/:safetyCode`.
- Unclaimed retail tags show activation prompt.
- Lost/disabled/replaced/archived tags never expose owner contact.
- Bound tags linked to Memorial/Archived pets return inactive safe state.
- Record a `TagScans` event for valid and invalid scans where appropriate.

Errors:

- `429` rate limited scan/lookup abuse

### POST `/api/v1/public/tags/{tagCode}/scan-location-consent`

Purpose: optional finder consent for precise location attached to a scan/found report.

Auth: public.

Request:

- `tagScanId`
- `latitude`
- `longitude`
- `consent`

Response:

- updated scan or found-report location state

Validation:

- Precise latitude/longitude stored only when `consent = true`.
- Without consent, ignore/discard precise coordinates and only retain non-precise IP-based country/city when available.

Errors:

- `400` invalid coordinates
- `404` scan not found

## Memories

### GET `/api/v1/pets/{petId}/memories`

Purpose: list owner memories for one pet.

Auth: owner.

Query:

- `page`, `pageSize`
- `visibility`

Response:

- memory list with linked media summaries

Errors:

- `404` pet not found or not owned

### POST `/api/v1/pets/{petId}/memories`

Purpose: create a memory.

Auth: owner.

Request:

- `title`, `date`, `type`, `caption`
- `visibility`
- `showOnPublicProfile`
- `showInLifeTimeline`
- `timelineNote`
- `mediaFileIds`

Validation:

- configured memory limit per pet.
- configured media limit per memory.
- media files must belong to owner.

Errors:

- `422` plan limit reached
- `404` pet not found or media not found

### PATCH `/api/v1/pets/{petId}/memories/{memoryId}`

Purpose: update memory.

Auth: owner.

Rules:

- Existing grandfathered over-limit memories remain editable.
- Adding new media still checks configured media limit unless override applies.

Errors:

- `404` not found or not owned

### DELETE `/api/v1/pets/{petId}/memories/{memoryId}`

Purpose: archive/delete memory from owner view.

Auth: owner.

Response:

- `204 No Content`

Rules:

- Prefer soft delete/archival.

## Care Records

### GET `/api/v1/pets/{petId}/care-records`

Purpose: list care records.

Auth: owner.

Query:

- `page`, `pageSize`, `type`, `status`

### POST `/api/v1/pets/{petId}/care-records`

Purpose: create care record.

Auth: owner.

Request:

- `type`, `title`, `date`, `dueDate`, `provider`, `notes`, `publicVisibility`, `mediaFileIds`

Validation:

- known record type or `Other`.
- public visibility must be known.
- media files must belong to owner.

### PATCH `/api/v1/pets/{petId}/care-records/{recordId}`

Purpose: update care record.

Auth: owner.

### DELETE `/api/v1/pets/{petId}/care-records/{recordId}`

Purpose: archive/delete care record.

Auth: owner.

Response:

- `204 No Content`

## Media Files

### POST `/api/v1/media-files`

Purpose: upload a file or create an upload record, depending on storage provider implementation.

Auth: owner or admin depending on owner type.

Request:

- multipart file or pre-signed upload completion payload
- `ownerType`
- `ownerId`

Response:

- `mediaFile`: id, originalFileName, contentType, fileSize, storageProvider, sha256, uploadedAt

Validation:

- file size within configured limit.
- content type allowed for target owner type.
- caller owns target entity or is authorized admin.

Errors:

- `413` too large
- `415` unsupported type

### GET `/api/v1/media-files/{mediaFileId}`

Purpose: return metadata or controlled download URL.

Auth: owner/admin; public access only through public projection endpoints.

Errors:

- `403` not allowed
- `404` not found

### DELETE `/api/v1/media-files/{mediaFileId}`

Purpose: soft-delete uploaded file metadata and schedule physical deletion.

Auth: owner/admin.

Response:

- `204 No Content`

## Smart Tags

### GET `/api/v1/tags`

Purpose: list authenticated owner's smart tags.

Auth: owner.

Query:

- `page`, `pageSize`
- `status`
- `petId`

Response:

- tag summaries with linked pet/order display data

### GET `/api/v1/tags/{tagId}`

Purpose: owner tag detail.

Auth: owner.

Errors:

- `404` not found or not owned

### POST `/api/v1/tags/{tagCode}/activate`

Purpose: activate retail/unclaimed or delivered tag to selected pet.

Auth: owner.

Request:

- `petId`

Response:

- active tag summary

Validation:

- tag exists and is `Unclaimed` or `Delivered`.
- selected pet belongs to owner and is Active.
- active tag cannot be claimed by another owner.

Errors:

- `400` invalid tag state
- `403` tag belongs to another owner
- `404` tag or pet not found

### POST `/api/v1/tags/{tagId}/mark-lost`

Purpose: owner marks physical tag lost.

Auth: owner.

Rules:

- Sets tag status to `Lost`.
- Does not enable pet Lost Mode.
- `/q/:safetyCode` remains unaffected.

### POST `/api/v1/tags/{tagId}/disable`

Purpose: owner disables physical tag.

Auth: owner.

### POST `/api/v1/tags/{tagId}/replace`

Purpose: mark tag as replaced, usually through replacement order flow.

Auth: owner.

### POST `/api/v1/tags/{tagId}/archive`

Purpose: archive tag from owner list.

Auth: owner.

### POST `/api/v1/tags/{tagId}/restore`

Purpose: restore archived tag to owner list.

Auth: owner.

Rules for all owner tag actions:

- Owner must own linked tag or linked pet.
- Inactive states never expose owner contact.
- Invalid transitions return `400`.

## Orders And Payment Proofs

### GET `/api/v1/orders`

Purpose: list owner tag orders.

Auth: owner.

Query:

- `page`, `pageSize`
- `status`
- `paymentStatus`

### GET `/api/v1/orders/{orderNumber}`

Purpose: get owner order detail by operational order number.

Auth: owner.

Errors:

- `404` not found or not owned

### POST `/api/v1/orders`

Purpose: create owner portal smart tag order.

Auth: owner.

Request:

- `petId`: required
- `tagType`: `QrPetTag` or `QrNfcSmartTag`
- `shape`
- delivery: `recipientName`, `phoneE164`, `addressLine1`, `addressLine2`, `postcode`, `city`, `state`, `notes`
- `replacementForTagId` optional

Response:

- order and reserved/created smart tag

Validation:

- pet belongs to owner and is Active.
- portal order must have `petId`.
- tag price comes from backend config/app settings, not client.
- replacement tag must belong to owner and be replaceable.

Errors:

- `422` memorial/archived pet
- `400` invalid delivery phone/address

### POST `/api/v1/orders/{orderNumber}/payment-proof`

Purpose: submit manual payment proof.

Auth: owner.

Request:

- `mediaFileId` or multipart file
- `paymentReference`
- `ownerNote`

Response:

- order with status `PaymentProofSubmitted`
- payment proof metadata including provider-neutral file fields

Validation:

- order belongs to owner.
- order status must be `PendingPayment`.
- file content type allowed: image or PDF.

Errors:

- `400` invalid order state
- `413` file too large
- `415` unsupported media type

### POST `/api/v1/orders/{orderNumber}/cancel`

Purpose: owner cancels order if allowed.

Auth: owner.

Rules:

- Allowed before shipping only.
- Linked unactivated tag is archived.

Errors:

- `400` cannot cancel after shipped

### GET `/api/v1/orders/{orderNumber}/receipt`

Purpose: get receipt after payment confirmation.

Auth: owner.

Rules:

- Available when payment is confirmed or later.

Errors:

- `403` payment not confirmed

## Admin

All admin endpoints require an active admin profile. Mutations write audit logs.

### GET `/api/v1/admin/auth/check`

Purpose: verify the current JWT belongs to an active admin user.

Auth: admin policy.

Rules:

- Requires a valid JWT.
- Requires an active `AdminUsers` row for the current user.
- Does not trust the `Admin` role claim by itself.

Errors:

- `401` unauthenticated
- `403` not an active admin

### GET `/api/v1/admin/dashboard/summary`

Purpose: dashboard counts and recent activity.

Query:

- optional date range for future reports

Response:

- total owners, pets, Lost Mode pets, pending payment proofs, orders in preparation, active tags, lost/disabled tags, unclaimed tags, recent orders/proofs/tag activity

### GET `/api/v1/admin/owners`

Purpose: list owners with counts.

Query:

- `page`, `pageSize`, `search`, `status`

### GET `/api/v1/admin/pets`

Purpose: list pets across owners.

Query:

- `page`, `pageSize`, `search`, `ownerId`, `lifecycleStatus`, `lostMode`

### GET `/api/v1/admin/orders`

Purpose: list orders.

Query:

- `page`, `pageSize`, `status`, `paymentStatus`, `search`, `ownerId`, `petId`

### GET `/api/v1/admin/orders/{orderId}`

Purpose: admin order detail.

Response:

- order, owner, pet, tag, payment proofs, delivery detail, audit summary

### POST `/api/v1/admin/orders/{orderId}/confirm-payment`

Purpose: approve submitted proof and confirm payment.

Validation:

- order must be `PaymentProofSubmitted`.
- there must be a pending payment proof.

Transition:

- order `PaymentProofSubmitted` -> `PaymentConfirmed`
- payment `ProofSubmitted` -> `Confirmed`
- proof `PendingReview` -> `Approved`

Errors:

- `400` invalid transition

### POST `/api/v1/admin/orders/{orderId}/reject-payment-proof`

Purpose: reject payment proof and request resubmission.

Request:

- `reason`: required friendly reason

Transition:

- order `PaymentProofSubmitted` -> `PendingPayment`
- payment `ProofSubmitted` -> `Rejected`
- proof `PendingReview` -> `Rejected`

Rules:

- Order is never deleted.
- Existing proof remains in history.

### POST `/api/v1/admin/orders/{orderId}/status`

Purpose: update fulfillment status.

Request:

- `status`: `PreparingTag`, `Shipped`, `Delivered`
- `trackingNumber` optional

Transitions:

- `PaymentConfirmed` -> `PreparingTag`
- `PreparingTag` -> `Shipped`
- `Shipped` -> `Delivered`

Side effects:

- preparing updates linked tag to `Preparing` when still pending-family.
- delivered updates linked tag to `Delivered`.

Errors:

- `400` invalid transition

### POST `/api/v1/admin/orders/{orderId}/cancel`

Purpose: cancel order before shipping.

Rules:

- Allowed before `Shipped`.
- Linked unactivated tag is archived.

### GET `/api/v1/admin/payment-proofs`

Purpose: payment proof review queue.

Query:

- `page`, `pageSize`, `status`, `orderStatus`

Response:

- proof file metadata, owner note, payment reference, order/pet/owner summary

### GET `/api/v1/admin/tags`

Purpose: smart tag registry.

Query:

- `page`, `pageSize`, `status`, `petId`, `ownerId`, `batchNo`, `tagCode`, `hasNfc`

### POST `/api/v1/admin/tags/generate`

Purpose: generate unclaimed retail tag codes.

Request:

- `count`: 1 to 50 for MVP
- `hasNfc`
- `shape`
- `batchNo` optional; backend can generate

Response:

- created batch and generated tag codes

Validation:

- tag codes generated server-side with secure random IDs.
- enforce unique `TagCode`.

### GET `/api/v1/admin/tag-batches/{batchNo}/export`

Purpose: export manufacturer CSV.

Response:

- CSV or signed download URL

CSV fields:

- `tag_code`, `url`, `shape`, `batch_no`, `has_nfc`

### POST `/api/v1/admin/tags/{tagId}/status`

Purpose: admin tag status update.

Request:

- `status`: `Lost`, `Disabled`, `Replaced`, `Archived`, `Active` where valid
- `reason` optional

Validation:

- reject unsafe transitions such as activating a tag without owner/pet binding.

### GET `/api/v1/admin/audit-logs`

Purpose: operations audit trail.

Query:

- `page`, `pageSize`, `actorType`, `actorId`, `action`, `entity`, `entityId`, date range

### GET `/api/v1/admin/settings`

Purpose: read backend app settings.

### PATCH `/api/v1/admin/settings`

Purpose: future editable settings.

Request:

- key/value changes

Rules:

- Phase 1 can keep UI read-only; endpoint may be implemented later.
- Mutations write audit logs.

## Future Notifications

These endpoints are planning-only and should not block the MVP.

### GET `/api/v1/notifications`

Purpose: owner-visible notifications.

Auth: owner.

### POST `/api/v1/admin/notification-queue`

Purpose: future admin/system enqueue notification.

Auth: admin/system.

### GET `/api/v1/admin/reminder-jobs`

Purpose: future operations view for reminder jobs.

Auth: admin.

## Status Transition Rules

### Orders

Valid transitions:

- `PendingPayment` -> `PaymentProofSubmitted`: owner submits proof.
- `PaymentProofSubmitted` -> `PaymentConfirmed`: admin confirms proof.
- `PaymentProofSubmitted` -> `PendingPayment`: admin rejects proof and requests resubmission.
- `PaymentConfirmed` -> `PreparingTag`: admin starts fulfillment.
- `PreparingTag` -> `Shipped`: admin marks shipped.
- `Shipped` -> `Delivered`: admin marks delivered.
- `PendingPayment`, `PaymentProofSubmitted`, `PaymentConfirmed`, `PreparingTag` -> `Cancelled`: owner/admin cancellation before shipping.

Invalid transitions:

- Any automatic proof confirmation.
- `Delivered` -> earlier status without support-only correction workflow.
- `Shipped` or `Delivered` -> `Cancelled`.

### Payments

Valid transitions:

- `Pending` -> `ProofSubmitted`
- `ProofSubmitted` -> `Confirmed`
- `ProofSubmitted` -> `Rejected`
- `Rejected` -> `ProofSubmitted` on resubmission

### Smart Tags

Valid transitions:

- Retail: `Unclaimed` -> `Active`
- Portal order: `Pending` -> `Preparing` -> `Delivered` -> `Active`
- `Active` -> `Lost`
- `Active` -> `Disabled`
- `Active` -> `Replaced`
- `Lost` or `Disabled` -> `Replaced`
- Any non-active operational state -> `Archived` where safe
- `Archived` -> previous safe state only through owner/admin restore rules

Invalid transitions:

- `Lost`, `Disabled`, `Replaced`, or `Archived` tag exposing owner contact.
- `Unclaimed` tag becoming active without owner, pet, and authorization.
- Physical tag Lost status enabling pet Lost Mode.

### Pets

Valid transitions:

- `Active` -> `Memorial`
- `Active` -> `Archived`
- `Memorial` -> `Active`
- `Memorial` -> `Archived`
- `Archived` -> previous safe lifecycle status if plan limits allow

Invalid transitions:

- Treating Memorial as Active.
- Treating Lost Mode as Memorial.
- Exposing emergency finder contact for Memorial/Archived pets.
