# MyPetLink Backend Implementation Plan

Planning draft for building the future backend after the documentation is approved. Do not generate backend code until explicitly requested.

## Guiding Rules

- Build auth in Phase A so every protected API is created on the final security model.
- Keep Premium as "Coming Soon" and GPS Safety as "Coming Later".
- Keep smart tags as optional one-time add-ons.
- Keep payment manual: merchant QR plus proof review.
- Use versioned REST endpoints under `/api/v1`.
- Keep controllers thin and business rules in services.
- Use configurable plan limits, not hardcoded pet/memory limits.
- Use provider-neutral media storage from the start.
- Use secure random public identifiers for `publicCode`, `safetyCode`, and `tagCode`.

## Phase A - Foundation, Auth, Pets, Public Reads

Goal: create a usable authenticated backend foundation and replace the most important owner/public local state.

Build:

- .NET 8 Web API skeleton in `apps/api/MyPetLink.Api`
- SQL Server connection and EF Core DbContext
- shared response and error envelopes
- request id middleware
- global error handling middleware
- JWT access token support
- refresh token support and rotation
- Google Sign-In validation
- current-user service
- owner/admin authorization policies
- `Users`, `ExternalLogins`, `RefreshTokens`, `OwnerProfiles`, `AdminUsers`
- `Plans`, `PlanLimits` seed data
- `Pets`, `PetContacts`, `PetPublicProfiles`, `PetSafetySettings`
- owner pet list/detail/create/update
- pet lifecycle endpoints: mark memorial, restore active, archive
- Lost Mode endpoint
- public profile read by `publicCode`
- QR Safety Page read by `safetyCode`

Acceptance criteria:

- Owner can sign in with Google and receive JWT + refresh token.
- Refresh token rotation works and old refresh token reuse is rejected.
- Protected owner endpoints require JWT.
- Admin endpoints reject non-admin users.
- Owner can create and update pets.
- Backend generates `publicCode` and `safetyCode` with secure random identifiers.
- `/api/v1/public/profiles/{publicCode}` returns only privacy-safe share profile data.
- `/api/v1/public/safety/{safetyCode}` returns only privacy-safe QR Safety data.
- Memorial/archived pets do not expose emergency finder contact.

Tests:

- auth token validation and refresh rotation
- owner cannot access another owner's pet
- create pet generates unique public/safety codes
- plan limit enforcement uses `PlanLimits`
- public projection hides private fields
- QR Safety disabled/memorial/archived behavior

## Phase B - Owner Settings, Plans, Memories, Care Records, Media

Goal: replace owner portal content modules with real relational data and provider-neutral uploads.

Build:

- owner profile/settings update
- configurable plan limit service
- grandfather/owner override support
- `MediaFiles`
- `MediaFileLinks`
- local file storage provider implementation for development
- storage provider interface for future Azure Blob, S3, Cloudflare R2
- memory list/create/update/archive
- care record list/create/update/archive
- public memory/care projections with visibility checks
- media linking for memories and care records

Acceptance criteria:

- Owner settings update default contact/privacy behavior for new pets.
- Free plan defaults come from DB/config, not constants.
- Existing over-limit data remains visible/editable.
- New memory creation respects configured memory limit unless overridden.
- New media attachment respects configured media limits.
- Public pages show only public memories/care records allowed by owner settings.

Tests:

- plan limits and grandfather behavior
- memory visibility filtering
- care record public visibility filtering
- media ownership validation
- upload content-type and size validation

## Phase C - Smart Tag Orders And Payment Proofs

Goal: support owner smart tag orders and manual payment proof submission.

Build:

- `SmartTagBatches`
- `SmartTags`
- `TagOrders`
- `PaymentProofs`
- owner tag list/detail
- owner order list/detail/create
- portal order creation linked to selected `petId`
- tag reservation/creation on order
- replacement order support
- manual payment proof upload
- payment proof media storage using `MediaFiles`
- owner order cancellation before shipping
- receipt/read endpoint after payment confirmation
- physical tag scan public endpoint by `tagCode`
- retail/unclaimed tag activation endpoint
- basic `TagScans` recording without precise location unless consent is explicitly granted

Acceptance criteria:

- Portal order requires `petId` and active pet.
- Portal-purchased tag is linked to selected pet from order creation.
- Owner uploads payment proof; order becomes `PaymentProofSubmitted`, not confirmed.
- Payment proof stores provider-neutral file metadata.
- Retail/unclaimed tag starts with no owner/pet and activates only after authenticated owner selects an active pet.
- Active `/t/:tagCode` returns same safety content as `/q/:safetyCode`.
- Lost/disabled/replaced/archived tags never expose owner contact.
- `/q/:safetyCode` remains available when a physical tag is lost/disabled.
- Tag scan latitude/longitude is stored only with explicit finder consent; otherwise only non-precise IP-based country/city is stored when available.

Tests:

- order creation requires active owned pet
- proof upload state transition
- proof rejection/approval guards prepared for admin phase
- tag activation ownership checks
- inactive tag scan projections hide owner contact
- scan analytics consent behavior

## Phase D - Admin APIs, Payment Review, Tag Inventory, Audit Logs

Goal: replace the Admin Portal local/demo operations with real backend APIs.

Build:

- admin dashboard summary
- admin owner list with counts and pagination
- admin pet list with filters for lifecycle and Lost Mode
- admin order list/detail with status filters and pagination
- admin payment proof review queue
- confirm payment action
- reject payment proof action with reason
- update order status: Preparing Tag, Shipped, Delivered
- cancel order before shipping
- smart tag registry list/search/filter
- generate retail tag codes
- export tag batch CSV
- update tag status
- archive/restore tag
- `AuditLogs`
- audit log list/search

Acceptance criteria:

- Admin login is real auth + admin role, not local placeholder.
- Admin payment approval/rejection updates owner order state immediately through API.
- Rejecting a proof returns order to Pending Payment with friendly reason and keeps history.
- Preparing/Delivered order status updates linked pending-family tag state.
- Tag code generation creates secure random unique `MPL-XXXX-XXXX` values.
- Retail tags are unclaimed and have no owner/pet until activation.
- Every admin mutation writes an audit log with actor, actor type, action, entity, entity id, old value, new value, IP address, user agent, and created timestamp.
- Admin lists support pagination and practical filters/search.

Tests:

- admin policy rejects owner-only sessions
- admin status transition matrix
- payment proof approval/rejection audit logs
- tag generation uniqueness and count bounds
- CSV export shape
- owner-visible order state after admin changes

## Phase E - Hardening, Deployment, Notifications Planning Hooks

Goal: make the backend safe enough for early production and prepare future modules without overbuilding them.

Build:

- request validation hardening
- centralized logging and structured logs
- rate limiting for auth, public profile, QR safety, and tag lookup endpoints
- CORS policy for production frontend origin
- security headers where applicable
- secrets/user-secrets setup documentation
- health check endpoint
- deployment configuration
- backup/restore notes
- notification planning hooks only:
  - `Notifications`
  - `NotificationQueue`
  - `ReminderJobs`
  - no outbound provider integration unless separately requested

Acceptance criteria:

- Public lookup abuse is rate-limited.
- Failed auth and suspicious public tag lookup patterns are logged.
- Production environment can configure DB, JWT, Google Auth, and storage provider through environment variables.
- Health check verifies API and DB connectivity.
- Notification tables/services are documented or stubbed only if useful; no MVP dependency on notification providers.

Tests:

- rate limit behavior
- validation error envelope consistency
- health check
- environment config binding
- smoke tests for deployed API

## Cross-Phase Non-Negotiables

- No public endpoint returns internal database ids.
- No frontend-facing API decides privacy on the client; server returns privacy-safe projections.
- No automatic payment confirmation from uploaded proof.
- No real payment gateway in Phase 1.
- No real subscription in Phase 1.
- No real GPS in Phase 1.
- QR + NFC tag means scan/tap opens the same safety URL, not tracking.
- Audit admin mutations from the first admin API.
- Keep app settings and plan limits configurable so future Premium does not require rewriting core logic.
