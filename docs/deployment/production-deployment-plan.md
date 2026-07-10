# MyPetLink Phase 1 Production Deployment Plan

Planning document only. Nothing here deploys automatically. It describes how to take the backend-connected Phase 1 stack (branch `feature/connect-admin-apis`) to production for a solo, Malaysia-based developer.

Companion docs:

- [`environment-variables.md`](environment-variables.md) — every required frontend/backend variable
- [`google-oauth-setup.md`](google-oauth-setup.md) — Google Cloud Console setup
- [`first-admin-setup.md`](first-admin-setup.md) — safe first admin user
- [`release-checklist.md`](release-checklist.md) — pre-release, smoke test, post-release
- Database steps are in section 5 below.

## Current stack

- `apps/web` — Next.js frontend, static export (`output: "export"`), deployed to Cloudflare Pages.
- `apps/api/MyPetLink.Api` — .NET 8 Web API (JWT + rotating refresh tokens, Google ID-token login, active-`AdminUsers` admin policy).
- Database — SQL Server via EF Core (`InitialCreate` migration; dev DB is `MyPetLinkDev` on LocalDB).
- Payment — manual QR / payment-proof metadata only (no gateway, no file storage).
- Premium is Coming Soon; GPS is Coming Later.

## 1. Hosting options

### Backend (.NET 8 Web API)

| Option | Suitability (Phase 1) | Pros | Cons | Complexity | .NET 8 + SQL Server |
| --- | --- | --- | --- | --- | --- |
| **Azure App Service** | High | First-class .NET hosting; pairs natively with Azure SQL; easy `dotnet publish` / GitHub Actions deploy; managed TLS + custom domain; scales later | Cost creeps above free tier; Azure billing/region setup overhead | Low–medium | Excellent |
| **Render** | High | Simple Docker or native deploy from GitHub; free/cheap tier; managed TLS; good DX for solo devs | No managed SQL Server (needs external DB, e.g. Azure SQL); free tier cold starts | Low | Good (via Docker), DB external |
| **Railway** | Medium–high | Very fast setup from GitHub; simple env management; usage-based pricing | No managed SQL Server; pricing can surprise under load; smaller ecosystem | Low | Good (via Docker), DB external |
| **Fly.io** | Medium | Runs Docker close to users (has Singapore region — low latency to Malaysia); scales to zero | More infra concepts (volumes, regions, `fly.toml`); no managed SQL Server | Medium | Good (via Docker), DB external |
| **VPS (e.g. DigitalOcean/Linode/local MY provider)** | Medium | Full control; predictable flat cost; can co-locate SQL Server | You own OS patching, TLS, reverse proxy, backups, uptime; most ops burden | High | Good, but all self-managed |
| **Cloudflare Workers** | Not suitable | — | Workers run JS/Wasm, not a .NET runtime; would require rewriting the API | — | No |

### Database (SQL Server)

| Option | Suitability | Pros | Cons | Complexity |
| --- | --- | --- | --- | --- |
| **Azure SQL Database** | High | Fully managed; automated backups + point-in-time restore; scales; pairs cleanly with EF Core and App Service | Cost; DTU/vCore sizing to learn; Azure account setup | Low–medium |
| **SQL Server on VPS** | Medium | Full control; flat cost; co-located with API for low latency | You manage backups, patching, security, disk; SQL Server licensing/Express limits | High |
| **Managed alternative** | Situational | Some hosts (e.g. managed MSSQL providers) offer SQL Server without Azure | Fewer providers than Postgres/MySQL; verify EF Core compatibility and backup story | Medium |

Note: SQL Server is the only engine the current EF Core model targets (`UseSqlServer`, SQL-Server-specific migration). Switching to Postgres/MySQL would require a new provider and a regenerated migration — out of scope for Phase 1.

### Recommended for MyPetLink Phase 1

**Azure App Service (backend) + Azure SQL Database (database), frontend stays on Cloudflare Pages.**

Why: it's the lowest-friction path that supports .NET 8 **and** managed SQL Server together, with automated DB backups and simple `dotnet publish` deploys — the two things a solo operator least wants to hand-build. Start on the smallest Basic/Serverless tiers.

Budget-conscious alternative: **Render (backend, Docker) + Azure SQL Database (database)**. Render is cheaper and simpler to deploy, but you still need Azure (or another host) for managed SQL Server, so you end up spanning two providers — the App Service + Azure SQL pairing keeps everything in one place. Avoid a single VPS-for-everything setup for Phase 1: the backup/TLS/patching burden outweighs the savings.

## 2. Recommended production architecture

```txt
                 ┌─────────────────────────────┐
   End users ───▶│  Cloudflare (DNS, CDN, TLS) │
                 └───────────────┬─────────────┘
                                 │
              ┌──────────────────┴───────────────────┐
              ▼                                       ▼
   ┌──────────────────────┐               ┌────────────────────────┐
   │ Cloudflare Pages      │  HTTPS/JSON   │ .NET 8 Web API          │
   │ apps/web (static)     │──────────────▶│ Azure App Service       │
   │ mypetlink.com.my      │  /api/v1/*    │ api.mypetlink.com.my    │
   │ NEXT_PUBLIC_API_BASE  │◀──────────────│ CORS: frontend origin   │
   │ NEXT_PUBLIC_GOOGLE_ID │   (CORS)      │ JWT + refresh tokens    │
   └──────────┬────────────┘               └───────────┬────────────┘
              │ Google ID token                        │ EF Core
              ▼ (GIS button)                           ▼
   ┌──────────────────────┐               ┌────────────────────────┐
   │ Google Identity       │   validate    │ Azure SQL Database      │
   │ Services (OAuth)      │◀──ID token────│ MyPetLink (prod)        │
   └──────────────────────┘               │ InitialCreate migration │
                                          │ + manual AdminUsers seed │
                                          └────────────────────────┘
```

Flow in words:

1. The browser loads the static frontend from **Cloudflare Pages** at the production domain.
2. The user clicks the Google button; **Google Identity Services** returns an ID token to the frontend.
3. The frontend calls `POST /api/v1/auth/google` on the **.NET API** (separate `api.` subdomain). The API validates the ID token against `GoogleAuth:ClientId`, upserts the `User`/`ExternalLogin`, and returns a JWT access token + rotating refresh token.
4. All subsequent owner/admin calls go to the API with the bearer token. **CORS** on the API allows only the production frontend origin.
5. The API reads/writes **Azure SQL Database** through EF Core. Admin access is gated by an active `AdminUsers` row (seeded manually once).

Key decisions:

- **Separate API subdomain** (`api.mypetlink.com.my`) rather than a path on the frontend — the frontend is a static export on Cloudflare Pages and cannot proxy a .NET runtime.
- **Frontend env is baked at build time.** Because `apps/web` is a static export, `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` are compiled into the bundle during the Cloudflare Pages build. Changing them requires a **rebuild + redeploy**, not just an env edit.
- **CORS locks to the exact production origin** (no wildcard) once live.

## 3. Required production environment variables

See [`environment-variables.md`](environment-variables.md) for the full table with secret flags and the real config-key names (note: the backend connection-string key is `ConnectionStrings__MyPetLinkDb`, not `DefaultConnection`).

## 4. Google OAuth production setup

See [`google-oauth-setup.md`](google-oauth-setup.md).

## 5. Database deployment plan

Do **not** create new migrations. Production uses the existing `InitialCreate` migration.

1. **Create the production database.** Provision Azure SQL Database (e.g. `MyPetLink` on a serverless/Basic tier). Record the server name and credentials.
2. **Configure the connection string** as `ConnectionStrings__MyPetLinkDb` in the API host's configuration (App Service → Configuration → Connection strings, or an env var). Use an Azure SQL connection string with `Encrypt=True;TrustServerCertificate=False;`. This is a **secret**.
3. **Apply migrations.** Two safe approaches:
   - Generate an idempotent SQL script and run it against the prod DB (preferred for production — reviewable, no tooling on the server):
     ```bash
     dotnet ef migrations script --idempotent \
       --project apps/api/MyPetLink.Api \
       --startup-project apps/api/MyPetLink.Api \
       --output mypetlink-prod.sql
     ```
     Review, then execute `mypetlink-prod.sql` against the production database with SSMS/`sqlcmd`.
   - Or, from a trusted machine with the prod connection string configured, run `dotnet ef database update`. Simpler, but runs live DDL directly.
4. **Verify tables** (expect 24 including `__EFMigrationsHistory`): `Users`, `ExternalLogins`, `RefreshTokens`, `OwnerProfiles`, `AdminUsers`, `Plans`, `PlanLimits`, `Pets`, `PetContacts`, `PetPublicProfiles`, `PetSafetySettings`, `PetMemories`, `CareRecords`, `MediaFiles`, `MediaFileLinks`, `SmartTagBatches`, `SmartTags`, `TagOrders`, `PaymentProofs`, `TagScans`, `FoundReports`, `AuditLogs`, `AppSettings`.
5. **Seed data.** The `InitialCreate` migration already seeds via EF `HasData` (idempotent, safe for prod): the **Free** plan (Available), the **Premium** plan (ComingSoon), **PlanLimits** for both (Free = 3 pets / 10 memories per pet), and 5 **AppSettings** (tag prices, Premium/GPS status labels, manual payment mode). No separate seed script is needed for these.
6. **Seed the first admin** manually — see [`first-admin-setup.md`](first-admin-setup.md). This is **not** part of any migration.

### Backup strategy

- Azure SQL Database: automated backups with point-in-time restore are on by default — confirm the retention window meets your needs. Optionally schedule periodic exports (BACPAC) to Blob storage.
- Before any future migration: take a manual backup/export first.
- Keep `AuditLogs` append-only; never truncate it as part of routine ops.

### Migration rollback considerations

- Phase 1 has a single migration, so there is no down-migration path worth relying on in prod. Prefer **forward-fix** migrations over `database update <previous>`.
- Never drop columns/tables in a future migration without a reviewed backup and data-migration path.
- For enum-like changes, add values rather than renaming.
- Never regenerate existing `PublicCode` / `SafetyCode` / `TagCode` values.

## 6. First admin user setup

See [`first-admin-setup.md`](first-admin-setup.md). Summary: the operator logs in once with Google (creating a normal `User`), then a one-time SQL insert activates a matching `AdminUsers` row. No admin email is hardcoded anywhere in the code.

## 7. Release checklist

See [`release-checklist.md`](release-checklist.md).

## 8. Merge / branch strategy

**Do not merge `feature/connect-admin-apis` into `main` until the production API and database are live and verified.** `main` powers the live Cloudflare Pages frontend; merging the backend-connected frontend before its production API exists would point live login/data at an API that isn't there and break the site.

Recommended sequence:

1. Stand up the production API + database first (sections 5–6), configure Cloudflare Pages **preview**/env, and run the smoke test against a preview deployment of the frontend pointed at the production API.
2. Only after the preview smoke test passes, open the final PR.
3. **PR base = `main`.** As of this writing `origin/main` has merged the chain up through `feature/backend-api-skeleton` (PR #3), so a PR from `feature/connect-admin-apis` into `main` cleanly stacks the remaining branches (`backend-auth-phase-a` → `backend-pets-phase-a2` → `connect-owner-pets-api` → `connect-care-records-api` → `connect-memories-api` → `connect-smart-tags-orders-api` → `connect-admin-apis`). If you prefer smaller reviews, open stacked PRs following that chain order instead. If any of those branches are already merged into `main` by the time you do this, the PR base stays `main` and only the unmerged tail is included.
4. Merging to `main` triggers the Cloudflare Pages production build — so the frontend production env (API base URL, Google client id) must be configured **before** the merge, because the values are baked at build time.

## 9. Known limitations to show before launch

- Payment proofs are **metadata only** — file name + reference, no file upload/preview/storage.
- **No payment gateway** — payment is manual QR + admin proof review.
- **No shipping provider integration** — fulfillment status is set manually by admin.
- **Admin settings are read-only.**
- **Admin lists** load up to 100 rows per collection and filter client-side (no server-side pagination yet).
- **Printed / sent-to-reseller** batch actions are disabled placeholders.
- **Google Login** still needs a one-time manual production popup verification with the production OAuth client.
- **Premium** is Coming Soon (no subscription/checkout). **GPS Safety** is Coming Later.

## 10. Related docs

The older [`../operations/hosting-and-deployment.md`](../operations/hosting-and-deployment.md) predates the .NET/SQL Server direction and still references Supabase/PostgreSQL as historical assumptions — treat this deployment plan (SQL Server + .NET App Service) as the current source of truth for Phase 1 infrastructure.
