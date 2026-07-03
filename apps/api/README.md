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

Pet creation generates a public share slug/code and a separate pet-level QR Safety code. The QR Safety Page does not require a physical tag. Free plan creation is limited by the configured `PlanLimits.MaxPets` active-pet count; existing pets remain readable even if the owner is over the limit.

Public profile responses are privacy-gated server-side and do not expose owner account email, private care records, private memories, internal ids, or address data. QR Safety responses expose only finder-friendly fields allowed by the pet safety settings. Memorial safety pages return an inactive memorial response without normal finder contact actions; archived pets return unavailable/not found responses.

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
- Audit log service placeholder for admin mutations.
- Local file storage provider abstraction for development only.
- No payment gateway, Premium subscription, GPS tracking, outbound notifications, or real upload workflow yet.
