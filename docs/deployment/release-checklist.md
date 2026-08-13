# MyPetLink Phase 1 Release Checklist

Work top to bottom on the exact `main` commit intended for deployment. The
current controlled-launch decisions and environment matrix are in
[`../launch/PRODUCTION_SOFT_LAUNCH_CHECKLIST.md`](../launch/PRODUCTION_SOFT_LAUNCH_CHECKLIST.md).

## Pre-release

- [ ] `main` is pushed and CI is green on the exact intended commit.
- [ ] `dotnet build apps/api/MyPetLink.Api/MyPetLink.Api.csproj` passes.
- [ ] `npm run lint:web` and `npm run build:web` pass.
- [ ] Backend hosted (e.g. Azure App Service); `/api/v1/health` returns the normal success envelope and `/api/v1/health/ready` returns 200 with database readiness.
- [ ] Production SQL Server database created; the authoritative root `migration.sql` applied with `sqlcmd -I`; `__EFMigrationsHistory` matches `dotnet ef migrations list`; expected typed seed rows are present.
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
