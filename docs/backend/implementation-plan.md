# MyPetLink Backend Implementation Plan

Planning draft for building the future backend after the documentation is approved.

Implementation status: the .NET 8 API lives in `apps/api/MyPetLink.Api`. As of 2026-07-03 the `InitialCreate` EF Core migration exists and is validated against SQL Server LocalDB, `dotnet-ef` is pinned as a repo-local tool (`.config/dotnet-tools.json`), and the API runs locally with Swagger and `/api/v1/health`. Auth, owner profile, pets, public profile, QR Safety, care records, memories, the owner Smart Tags + Orders slice, and the Admin Portal APIs are implemented. Real payment gateway, real shipping integration, real file storage, Premium subscription, GPS, and production deployment remain planned later.

## Phase 1 Release Readiness (stabilization audit, 2026-07-04)

Backend-connected and verified end to end against a local SQL Server database: Google-token auth foundation with rotating refresh tokens, owner profile, pets CRUD + lifecycle (Memorial/Archive/Restore with plan limits), care records, memories with public visibility gating, smart tag orders with manual payment proof metadata, admin operations (dashboard, orders with the full confirm → preparing → shipped → delivered flow and linked tag sync, payment proof review, tag registry actions, tag inventory generation + CSV export, owners, pets, read-only settings, audit logs), public share/QR Safety/tag scan routes with safe no-contact states, and route guards for owner and admin surfaces.

Before production deployment:

1. **Manual Google popup login check** — every token flow behind the button is verified with real backend-issued sessions, but the interactive Google credential exchange still needs one manual click-through by the owner with the production OAuth client.
2. **Production backend + database hosting** — the API currently runs only on LocalDB/dev settings; production needs hosted SQL Server, environment configuration (JWT signing key, Google client id, CORS origins), and a deployment target for the API.
3. **Production admin seeding** — promote the operations account via the documented `AdminUsers` insert.

Known non-blocking follow-ups: admin pages load up to 100 rows per collection and filter client-side (server-side pagination later); the admin payment-proofs page derives its queue from order data rather than the dedicated `/admin/payment-proofs` endpoint (functionally consistent); payment proofs are metadata only until file storage exists; admin settings are read-only; printed/reseller batch tracking stays disabled; admin pet lifecycle actions remain owner-only.

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
- provider-ready external auth foundation with Google Sign-In validation first
- current-user service
- owner/admin authorization policies
- `Users`, `ExternalLogins`, `RefreshTokens`, `OwnerProfiles`, `AdminUsers`
- `Plans`, `PlanLimits` seed data
- `Pets`, `PetContacts`, `PetPublicProfiles`, `PetSafetySettings`
- owner profile read/update
- owner pet list/detail/create/update
- pet lifecycle endpoints: mark memorial, restore active, archive
- Lost Mode endpoint planned after Phase A2
- public profile read by `publicSlug` ending in `publicCode`
- QR Safety Page read by `safetyCode`

Acceptance criteria:

- Owner can sign in with Google and receive JWT + refresh token.
- `ExternalLogins` supports multiple provider values (`Google`, later `Apple`, later `EmailOtp` if approved) without a Google-only service design.
- Refresh token rotation works and old refresh token reuse is rejected.
- Protected owner endpoints require JWT.
- Admin endpoints reject non-admin users.
- No password login is implemented in Phase A.
- Owner can create and update pets.
- Backend generates `publicCode` and `safetyCode` with secure random identifiers.
- `/api/v1/public/pets/{publicSlug}` returns only privacy-safe share profile data.
- `/api/v1/public/safety/{safetyCode}` returns only privacy-safe QR Safety data.
- Memorial/archived pets do not expose emergency finder contact.
- Free-plan active-pet creation is blocked at the configured plan limit without hiding existing pets.

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
- memory list/create/update/archive (implemented for the backend-connected Moments slice)
- care record list/create/update/archive (implemented for the backend-connected Records slice)
- public memory/care projections with visibility checks
- media linking for memories and care records

Acceptance criteria:

- Owner settings update default contact/privacy behavior for new pets.
- Free plan defaults come from DB/config, not constants.
- Existing over-limit data remains visible/editable.
- New memory creation respects configured memory limit unless overridden.
- New media attachment respects configured media limits.
- Public pages show only public memories/care records allowed by owner settings.
- Owner Records UI persists care records through authenticated API calls when backend mode is configured.
- Owner Moments UI persists memories through authenticated API calls when backend mode is configured.

Tests:

- plan limits and grandfather behavior
- memory visibility filtering
- memory ownership, validation, archive behavior, and plan-limit enforcement
- care record public visibility filtering
- care record ownership, validation, and archive behavior
- media ownership validation
- upload content-type and size validation

## Phase C - Smart Tag Orders And Payment Proofs

Goal: support owner smart tag orders and manual payment proof submission.

Current implementation status: the owner-facing Phase C slice is implemented for backend-connected Owner Portal pages. Admin review/fulfillment APIs and real file upload/storage remain planned.

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
- manual payment proof metadata submission
- metadata-only payment proof records using `MediaFiles`/`PaymentProofs`; real file bytes are not stored yet
- owner order cancellation before shipping
- receipt/read endpoint after payment confirmation (planned with admin payment confirmation)
- physical tag scan public endpoint by `tagCode`
- retail/unclaimed tag activation endpoint
- basic `TagScans` recording without precise location unless consent is explicitly granted

Acceptance criteria:

- Portal order requires `petId` and active pet.
- Portal-purchased tag is linked to selected pet from order creation.
- Owner uploads payment proof; order becomes `PaymentProofSubmitted`, not confirmed.
- Payment proof stores provider-neutral metadata only in the current owner slice; real file storage is a later phase.
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

Status (2026-07-04): implemented. All `/api/v1/admin/*` endpoints exist and are policy-guarded by an active `AdminUsers` lookup; every admin mutation writes a real `AuditLogs` row in the same transaction as the change. The Admin Portal UI calls these APIs when the frontend is API-configured with an authenticated session, keeping local/demo state as the unauthenticated fallback. Follow-ups: admin pet lifecycle actions (owner-only for now), editable settings, payment proof file preview (needs file storage), and server-side pagination in the admin UI (it currently loads up to 100 rows per collection and filters client-side).

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
