# MyPetLink Phase 1 Release Checklist

Work top to bottom on the exact `main` commit intended for deployment. The
current controlled-launch decisions and environment matrix are in
[`../launch/PRODUCTION_SOFT_LAUNCH_CHECKLIST.md`](../launch/PRODUCTION_SOFT_LAUNCH_CHECKLIST.md).

## Pre-release

- [ ] `main` is pushed and CI is green on the exact intended commit.
- [ ] `dotnet build apps/api/MyPetLink.Api/MyPetLink.Api.csproj` passes.
- [ ] `npm run lint:web` and `npm run build:web` pass.
- [ ] Backend artifact and hosting configuration are ready, but the new API is not started against the old database schema.
- [ ] Production SQL Server database created; complete the exact [database rollout](#database-rollout) below; verify `__EFMigrationsHistory` and expected typed seed rows.
- [ ] Google OAuth: production frontend origin added to Authorized JavaScript origins; consent screen published; frontend and backend use the same client id.
- [ ] **Manual Google popup login test passes** on a preview/prod frontend (real account → `/dashboard`, `/api/v1/auth/me` returns the user).
- [ ] Frontend production env set in Cloudflare Pages, including the explicit feature matrix in the production soft-launch checklist, and the frontend **rebuilt** so values are baked in.
- [ ] Pages Functions runtime env includes `PUBLIC_API_BASE_URL=https://api.mypetlink.com.my`; `/p/*` and `/social/pets/*` are present in the deployed Functions routes.
- [ ] Backend env and secrets match the production soft-launch checklist, including SQL, JWT, Google, exact CORS origins, R2, explicit ordering off, and email off.
- [ ] Smart Tag ordering flags confirmed **false** for this launch: backend `Features__SmartTagOrderingEnabled` and frontend `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED`. Mismatched values must not ship.
- [ ] Leave `PublicSite__BaseUrl` unset only while physical-tag production is deferred; set it to `https://mypetlink.com.my` before any manufacturer QR/NFC export.
- [ ] CORS confirmed: production frontend can call the API; other origins are blocked.
- [ ] Production safety checks pass: `DevAuth__Enabled` and `NEXT_PUBLIC_DEV_AUTH_ENABLED` are unset, `POST /api/v1/dev-auth/admin-login` returns `404`, `/swagger` returns `404`, the Development login action is absent from the production frontend, and no secrets, `.env.local`, or authenticated browser state are committed.
- [ ] First admin `admin@mypetlink.com.my` logged in once via Google, then was manually seeded and verified (`/api/v1/admin/auth/check` returns 200 for admin and 403 for non-admin) — see `first-admin-setup.md`.

## Database rollout

This release adds **eight new migrations** and contains **seven fail-closed
`THROW` guards** in the authoritative root `migration.sql`. A guard failure is
a stop condition for manual investigation; do not remove the guard or choose a
historical financial row automatically.

The eight migration identifiers are:

1. `20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots`
2. `20260907082441_AddInventoryReceiptSupersession`
3. `20260907085637_HardenMerchantCommissionCorrectness`
4. `20260907150516_AddOwnerReferralAttribution`
5. `20260908001234_GeneralizeSalesCommissionAndDirectRetail`
6. `20260908060518_AddResellerAcquisitionAndRepeatCommission`
7. `20260908152551_AddSalesReportingIndexes`
8. `20260909013700_AddCommissionPayoutBatches`

The seven guard error numbers are `51020`, `51030`, `51031`, `51040`, `51041`,
`51042`, and `51043`.

Complete Business Identity is recommended before starting the rollout and is a
hard payout-operational prerequisite: payout preparation cannot create its
immutable issuer snapshot until the required identity fields are complete. It
does not prevent the additive schema migration itself.

### 1. Backup and establish the migration boundary

- [ ] Confirm a restorable production backup and record its timestamp.
- [ ] Stop API rollout activity; do not start the new API against the old schema.
- [ ] Record the current `__EFMigrationsHistory` and compare it with the eight
  pending migration identifiers in the reviewed release artifact.

### 2. Run diagnostics 1–4 before migration

Run these tracked, read-only scripts in order and retain their output:

1. `docs/deployment/sql/diagnose-inventory-receipt-correctness.sql`
2. `docs/deployment/sql/diagnose-merchant-commission-correctness.sql`
3. `docs/deployment/sql/diagnose-phase3b-sales-commissions.sql`
4. `docs/deployment/sql/diagnose-phase3c-reseller-commissions.sql`

The first diagnostic may report that the inventory receipt schema is not yet
present when production predates that migration. Otherwise, its first two result
sets must be empty; its legacy/un-costed inventory count is informational. Stop
for any blocker result from diagnostics 1–4 and resolve it through an approved,
audited data decision before continuing.

### 3. Preserve the approved commercial defaults

- Quantities below 10 intentionally do **not** activate reseller acquisition
  commission.
- Every existing merchant remains `LegacyPercentage` through the blanket
  backfill. Manually review only known commercial exceptions; do not convert or
  re-decide every existing merchant during deployment.

### 4. Apply migration.sql in one sqlcmd session

Do not combine sqlcmd `-Q` or `-q` with `-i`. Choose authentication for the
deployment environment; do not assume `-G` universally:

| Environment authentication | Command option |
| --- | --- |
| Microsoft Entra | `-G` |
| Windows integrated | `-E` |
| SQL authentication | `-U "<login>"`, with `SQLCMDPASSWORD` supplied through the approved deployment secret mechanism |

From the repository root, run both input files in this order in the **same**
sqlcmd process:

```powershell
sqlcmd -S "<server>" -d "<database>" <environment-specific-authentication-options> -I -b -V 11 `
  -i migration-session-settings.sql `
  -i migration.sql `
  -o migration-run.log

if ($LASTEXITCODE -ne 0) {
  throw "Database migration failed with sqlcmd exit code $LASTEXITCODE. Stop the rollout and inspect migration-run.log."
}
```

`-b` makes an error at severity 11 or higher return a failing process exit code;
`-V 11` sets that threshold explicitly. The tracked session-settings file turns
on the required ANSI/index settings and `XACT_ABORT` before `migration.sql` in
that same connection. A log file alone is not proof of success: check the
process exit code before proceeding.

### 5. Validate after migration and before the API

- [ ] Confirm sqlcmd returned exit code 0 and review `migration-run.log`.
- [ ] Compare `__EFMigrationsHistory` with `dotnet ef migrations list`; the
  expected eight new migration rows must each appear exactly once.
- [ ] Run `docs/deployment/sql/diagnose-phase3d-financial-authorization.sql`.
- [ ] Run `docs/deployment/sql/diagnose-phase3d-b-commission-payouts.sql` only
  **post-migration and pre-API**. Its payout tables do not exist at the earlier
  diagnostic boundary.
- [ ] Confirm Business Identity is complete and at least one active SuperAdmin
  is returned before enabling payout operations.
- [ ] Only after these checks pass, deploy/start the new API and verify readiness.

## Smoke test (run against production, admin account)

Owner:

- [ ] Login with Google.
- [ ] Create a pet; confirm backend-generated public slug + safety code.
- [ ] Public share `/p/:publicSlug` renders (no owner email/address/internal ids).
- [ ] Create another pet **after** the frontend deployment. Its raw `/p/:publicSlug` HTML contains that pet's metadata and its `/social/pets/:publicSlug.jpg?v=...` returns a 1200 x 630 JPEG without another deployment.
- [ ] Update that post-deployment pet's name or public photo. Its metadata/card version changes without redeploying, the second card request is a cache hit, and WhatsApp shows the updated pet-specific preview.
- [ ] QR Safety `/q/:safetyCode` renders finder-first content.
- [ ] Create a care record; edit it; confirm it persists after reload.
- [ ] Create a memory (public) and a private memory; confirm the public one appears on `/p/`, the private one does not.
- [ ] If Smart Tag ordering is disabled for launch, confirm order CTAs are hidden/coming soon and direct `POST /api/v1/orders` returns `403 feature_disabled`.
- [ ] If Smart Tag ordering is explicitly enabled later, create a smart tag order (price set server-side); submit a payment proof (metadata only).

Admin:

- [ ] `/admin` dashboard loads real counts.
- [ ] Confirm payment on the submitted proof; owner order reflects Payment Confirmed.
- [ ] Mark Preparing → Shipped → Delivered; linked tag syncs to Delivered.
- [ ] Reject a second proof; order returns to Pending Payment with a friendly reason.
- [ ] Generate retail tag codes in Tag Inventory; export CSV.
- [ ] Confirm `AuditLogs` rows were written for the admin actions.

Public tag states:

- [ ] Active tag `/t/:tagCode` shows safety content.
- [ ] Pending/unclaimed tag shows no owner contact (pending) / activation prompt (unclaimed).
- [ ] Lost/disabled/archived tag and memorial/archived-pet tag show no owner contact.

Public Sample Experience:

- [ ] As a signed-out visitor, follow every visible Sample Profile entry point and confirm `/sample` shows both guided profile sections plus one create-profile action on desktop and mobile.
- [ ] If an approved Featured Sample Pet is selected in `/admin/sample-experience`, confirm only its approved public projection personalizes the previews. Clear the selection and confirm the complete generic journey remains available.

- [ ] Logout clears the session and protected pages redirect to login.

## Post-release

- [ ] Monitor API logs for errors/auth failures for the first hours.
- [ ] Confirm the Cloudflare Pages production deployment serves the new build (correct API base URL baked in).
- [ ] Test the frontend on a mobile viewport (owner and public pages).
- [ ] Verify no browser console errors on key pages.
- [ ] Confirm database backups are running (Azure SQL automated backups on; optional BACPAC export scheduled).
