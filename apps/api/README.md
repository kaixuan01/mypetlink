# MyPetLink API

.NET 8 Web API for the MyPetLink backend.

## Project

```txt
apps/api/
  MyPetLink.Api.sln
  MyPetLink.Api/
    Controllers/
    Data/
    Entities/
    DTOs/
    Services/
    Auth/
    Storage/
    Validation/
    Middleware/
    Common/
```

## Local Database

Development defaults to SQL Server LocalDB:

```txt
Server=(localdb)\MSSQLLocalDB;Database=MyPetLinkDev;Trusted_Connection=True;TrustServerCertificate=True;
```

Override with:

```txt
ConnectionStrings__MyPetLinkDb
```

## Commands

Run from the repository root:

```bash
dotnet tool restore
dotnet restore apps/api/MyPetLink.Api.sln
dotnet build apps/api/MyPetLink.Api.sln
dotnet run --project apps/api/MyPetLink.Api --launch-profile http
```

Local endpoints (Development, `http` profile on port 5281):

```txt
http://localhost:5281/swagger
http://localhost:5281/health
http://localhost:5281/api/v1/health
```

## Auth Phase A Configuration

Phase A implements Google Login first, but the auth design is provider-ready through the existing `ExternalLogins` table. Supported provider values are planned as:

- `Google` - implemented first.
- `Apple` - planned later, not exposed as a working endpoint yet.
- `EmailOtp` - possible future passwordless login, not implemented yet.

No password login is implemented in Phase A.

Required local settings:

```bash
dotnet user-secrets set --project apps/api/MyPetLink.Api "Jwt:SigningKey" "local-dev-long-random-secret-at-least-32-chars"
dotnet user-secrets set --project apps/api/MyPetLink.Api "GoogleAuth:ClientId" "your-google-client-id.apps.googleusercontent.com"
```

Optional overrides:

```bash
dotnet user-secrets set --project apps/api/MyPetLink.Api "Jwt:Issuer" "MyPetLink.Api"
dotnet user-secrets set --project apps/api/MyPetLink.Api "Jwt:Audience" "MyPetLink.Local"
dotnet user-secrets set --project apps/api/MyPetLink.Api "Jwt:AccessTokenMinutes" "15"
dotnet user-secrets set --project apps/api/MyPetLink.Api "Jwt:RefreshTokenDays" "30"
```

Environment variables use the same names with double underscores, for example `Jwt__SigningKey` and `GoogleAuth__ClientId`.

Implemented auth endpoints:

```txt
POST /api/v1/auth/google
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
GET  /api/v1/admin/auth/check
```

Google login validates the Google ID token against `GoogleAuth:ClientId`, creates or updates `Users`, creates or updates the `ExternalLogins` row with `Provider = Google`, creates an owner profile on the Free plan when needed, and returns a JWT access token plus a rotating refresh token. Refresh tokens are stored only as SHA-256 hashes and are rotated on every refresh. Logout revokes the submitted refresh token.

Admin authorization uses the `AdminUsers` table. The admin policy checks that the authenticated user has an active `AdminUsers` record and an active `Users` row; it does not grant admin access from a role claim alone.

### Local dev admin

For local testing, `AdminSeed:Emails` (in `appsettings.Development.json`) is a **Development-only** allowlist. When the API runs in the Development environment and someone logs in with Google using a matching email, `AuthService` ensures they have an active `AdminUsers` row (role `SuperAdmin`) — so `/admin` works without a manual SQL step. Current local dev admin email:

```txt
gbbsoftwaresolutions@gmail.com
```

Rules:

- Runs **only** in Development (`IsDevelopment()`), so it can never become a production auto-admin. Production `appsettings.json` has no `AdminSeed` section.
- Idempotent: an existing `AdminUsers` row is reactivated, never duplicated.
- The user must log in with Google **first** (to create their `Users` row); promotion happens on that login.
- **Production admins are still seeded manually** — see [`../../docs/deployment/first-admin-setup.md`](../../docs/deployment/first-admin-setup.md) and [`../../docs/deployment/sql/first-admin-template.sql`](../../docs/deployment/sql/first-admin-template.sql). Do not rely on the dev auto-admin in production.

The **production** first admin is `gbbsoftwaresolutions@gmail.com`: it logs in once with Google, then is promoted **manually** via the first-admin SQL (no production auto-promote). A Cloudflare Email Routing address is not a Google Login account; if a Google Workspace/domain account is adopted later, promote that account instead.

## Phase A2 Owner And Pet APIs

Implemented owner endpoints:

```txt
GET /api/v1/owner/profile
PUT /api/v1/owner/profile
GET /api/v1/pets
POST /api/v1/pets
GET /api/v1/pets/{petId}
PUT /api/v1/pets/{petId}
POST /api/v1/pets/{petId}/mark-memorial
POST /api/v1/pets/{petId}/restore-active
POST /api/v1/pets/{petId}/archive
```

Implemented public read endpoints:

```txt
GET /api/v1/public/pets/{publicSlug}
GET /api/v1/public/safety/{safetyCode}
```

Implemented owner Care Records endpoints:

```txt
GET /api/v1/pets/{petId}/care-records
POST /api/v1/pets/{petId}/care-records
GET /api/v1/care-records/{recordId}
PUT /api/v1/care-records/{recordId}
DELETE /api/v1/care-records/{recordId}
```

Care Records require owner authentication. Owners can only access records for pets they own. Active, Memorial, and Archived pets remain readable; new records are blocked for Archived pets. Deletes are soft archives, so archived records are hidden from active owner/public projections unless explicitly requested by API filters. Attachment/file upload storage is not implemented yet; clients must not send attachment ids in Phase A/B local development.

Implemented owner Memories endpoints:

```txt
GET /api/v1/pets/{petId}/memories
POST /api/v1/pets/{petId}/memories
GET /api/v1/memories/{memoryId}
PUT /api/v1/memories/{memoryId}
DELETE /api/v1/memories/{memoryId}
```

Memories require owner authentication. Owners can only access memories for pets they own. Active, Memorial, and Archived pets remain readable; new memories are blocked for Archived pets. Free plan memory creation uses `PlanLimits.MaxMemoriesPerPet` and returns `plan_limit_reached` when the active memory limit is reached. Deletes are soft archives. Public profile projections include only `Public` memories marked for the Memories gallery or Life Timeline; `Private` and `FamilyOnly` memories stay owner-only. Real photo/video upload storage is not implemented yet, so clients must not send media attachment ids in Phase B local development.

Implemented owner Smart Tags endpoints:

```txt
GET /api/v1/tags
GET /api/v1/pets/{petId}/tags
GET /api/v1/tags/{tagId}
POST /api/v1/tags/{tagCode}/activate
POST /api/v1/tags/{tagId}/mark-lost
POST /api/v1/tags/{tagId}/disable
POST /api/v1/tags/{tagId}/archive
POST /api/v1/tags/{tagId}/restore
GET /api/v1/public/tags/{tagCode}
```

Activation requests are intended to come from the Physical Tag Scan Page flow (`/t/{tagCode}`). Owner Portal tag/order pages should show View Tag Scan Page and Copy Tag Link, but not direct Activate Tag actions.

Implemented owner Orders endpoints:

```txt
GET /api/v1/orders
GET /api/v1/orders/{orderNumber-or-id}
POST /api/v1/orders
POST /api/v1/orders/{orderNumber-or-id}/payment-proof
POST /api/v1/orders/{orderNumber-or-id}/cancel
GET /api/v1/payment-proofs/{paymentProofId}
```

Owner tag orders require an active owned pet. The server calculates amounts (`QrPetTag` RM19.90, `QrNfcSmartTag` RM39.90), creates the order in `PendingPayment`, and does not expose a physical tag code until an admin assigns an existing unclaimed inventory tag after payment confirmation. Payment proof submission stores metadata only (`fileName`, payment reference/method, owner note, and metadata-only `MediaFiles`/`PaymentProofs` rows); real file upload/storage, payment gateway integration, and shipping provider integration are not implemented yet. Public `/api/v1/public/tags/{tagCode}` returns safety content only for active tags linked to active pets; pending/preparing/delivered, lost, disabled, replaced, archived, Memorial-linked, and Archived-linked tags never expose owner contact.

Pet creation generates a public share slug/code and a separate pet-level QR Safety code. The QR Safety Page does not require a physical tag. Free plan creation is limited by the configured `PlanLimits.MaxPets` active-pet count; existing pets remain readable even if the owner is over the limit.

Public profile responses are privacy-gated server-side and do not expose owner account email, private care records, private memories, internal ids, or address data. QR Safety responses expose only finder-friendly fields allowed by the pet safety settings. Memorial safety pages return an inactive memorial response without normal finder contact actions; archived pets return unavailable/not found responses.


## Phase D Admin APIs

All `/api/v1/admin/*` endpoints require a JWT plus an active `AdminUsers` record (enforced by the `ActiveAdminRequirement` policy, not a role claim). A signed-in owner without an admin record receives `403`. Every admin mutation writes an `AuditLogs` row (actor, action, entity, old/new state, IP, user agent) saved in the same transaction as the change.

Implemented admin endpoints:

```txt
GET  /api/v1/admin/auth/check
GET  /api/v1/admin/dashboard            (alias: /dashboard/summary)
GET  /api/v1/admin/orders
GET  /api/v1/admin/orders/{orderId}
POST /api/v1/admin/orders/{orderId}/confirm-payment
POST /api/v1/admin/orders/{orderId}/reject-payment-proof
POST /api/v1/admin/orders/{orderId}/assign-tag
POST /api/v1/admin/orders/{orderId}/mark-preparing
POST /api/v1/admin/orders/{orderId}/mark-shipped
POST /api/v1/admin/orders/{orderId}/mark-delivered
POST /api/v1/admin/orders/{orderId}/status        (contract-compat dispatcher)
POST /api/v1/admin/orders/{orderId}/cancel
GET  /api/v1/admin/payment-proofs
GET  /api/v1/admin/payment-proofs/{paymentProofId}
POST /api/v1/admin/payment-proofs/{paymentProofId}/approve
POST /api/v1/admin/payment-proofs/{paymentProofId}/reject
GET  /api/v1/admin/tags
GET  /api/v1/admin/tags/{tagId}
POST /api/v1/admin/tags/{tagId}/disable|mark-lost|replace|archive|restore
GET  /api/v1/admin/tag-inventory
POST /api/v1/admin/tag-inventory/generate
GET  /api/v1/admin/tag-inventory/export           (CSV: safe fields only)
GET  /api/v1/admin/owners
GET  /api/v1/admin/owners/{ownerId}
GET  /api/v1/admin/pets
GET  /api/v1/admin/pets/{petId}
GET  /api/v1/admin/settings                       (read-only in Phase 1)
GET  /api/v1/admin/audit-logs
```

Order transitions follow the documented matrix: confirm/reject require a submitted proof with a pending review; assigning inventory requires confirmed payment and an unclaimed matching tag; preparing requires a confirmed order with an assigned tag; shipped requires preparing; delivered requires shipped; cancel is blocked once shipped. Assigned tags remain no-contact until the owner activates the physical tag by scanning or tapping it. Rejecting a proof returns the order to `PendingPayment` with a friendly reason and keeps the proof history.

### Local dev admin setup

Admin access is data-driven. After signing in once with Google (so your `Users` row exists), promote that local user with SQL against `MyPetLinkDev` (development only — never run against production):

```sql
INSERT INTO AdminUsers (Id, UserId, Role, IsActive, CreatedAt, UpdatedAt)
SELECT NEWID(), Id, 'SuperAdmin', 1, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
FROM Users WHERE Email = 'your-local-google-email@example.com'
  AND NOT EXISTS (SELECT 1 FROM AdminUsers WHERE AdminUsers.UserId = Users.Id);
```

Verify with `GET /api/v1/admin/auth/check` using your bearer token. Do not commit personal emails or secrets.

Known Phase 1 limitations: payment proofs are metadata only (no file storage or preview), no payment gateway, no shipping provider integration, admin settings are read-only, and admin pet lifecycle actions are owner-only for now.
## EF Core Migrations

`dotnet-ef` is installed as a **local tool** pinned in the repo-root manifest at `.config/dotnet-tools.json` (version matches the EF Core packages). After cloning, restore it once:

```bash
dotnet tool restore
```

The `InitialCreate` migration exists in `apps/api/MyPetLink.Api/Migrations/` and creates all 23 Phase 1 tables plus the Free/Premium plan, plan limit, and app-setting seed rows.

Create the local database / apply migrations (run from the repository root):

```bash
dotnet ef database update --project apps/api/MyPetLink.Api --startup-project apps/api/MyPetLink.Api
```

Add a new migration after entity changes:

```bash
dotnet ef migrations add <MigrationName> --project apps/api/MyPetLink.Api --startup-project apps/api/MyPetLink.Api
```

Reset the local database (safe while it only holds local dev data):

```bash
dotnet ef database drop --project apps/api/MyPetLink.Api --startup-project apps/api/MyPetLink.Api
dotnet ef database update --project apps/api/MyPetLink.Api --startup-project apps/api/MyPetLink.Api
```

Do not run production migrations from local development settings.

LocalDB recovery:

- The stable local development database name is `MyPetLinkDev`.
- If `$env:USERPROFILE\MyPetLinkDev.mdf` and `$env:USERPROFILE\MyPetLinkDev_log.ldf` exist but `MyPetLinkDev` is not attached to `(localdb)\MSSQLLocalDB`, attach the existing files instead of deleting them:

```powershell
sqllocaldb start MSSQLLocalDB
$mdf = Join-Path $env:USERPROFILE "MyPetLinkDev.mdf"
$ldf = Join-Path $env:USERPROFILE "MyPetLinkDev_log.ldf"
sqlcmd -S "(localdb)\MSSQLLocalDB" -Q "IF DB_ID(N'MyPetLinkDev') IS NULL CREATE DATABASE [MyPetLinkDev] ON (FILENAME = N'$mdf'), (FILENAME = N'$ldf') FOR ATTACH;"
dotnet ef database update --project apps/api/MyPetLink.Api --startup-project apps/api/MyPetLink.Api
```

- Do not delete `.mdf` or `.ldf` files without confirming they are disposable.
- Use `ConnectionStrings__MyPetLinkDb` only for temporary isolated verification; remove that override before normal local development.

## Current Backend Scope

- SQL Server EF Core `MyPetLinkDbContext` with Phase 1 entities, indexes, restrictive FK behavior, and seed defaults for Free/Premium plans and app settings.
- `/api/v1` controller route skeletons with response envelopes.
- JWT bearer authentication with Swagger Bearer auth support.
- Auth Phase A: Google ID token validation, user/external-login upsert, JWT access tokens, hashed rotating refresh tokens, logout, current-user lookup, and active `AdminUsers` policy foundation.
- Phase A2: owner profile read/update, owner-scoped pet CRUD and lifecycle endpoints, privacy-gated public profile reads, and pet-level QR Safety reads.
- Backend-connected Records slice: owner-scoped care record list/create/read/update/archive with validation and public-profile projection support.
- Backend-connected Memories slice: owner-scoped memory list/create/read/update/archive, public/private visibility projection, and configurable Free plan memory limit enforcement.
- Backend-connected Smart Tags + Orders owner slice: owner tag/order list/detail/create/action endpoints, physical tag public scan endpoint, server-calculated one-time tag pricing, and metadata-only payment proof submission.
- Audit log service placeholder for admin mutations.
- Local file storage provider abstraction for development only.
- No payment gateway, Premium subscription, GPS tracking, outbound notifications, admin order fulfillment APIs, or real upload workflow yet.
