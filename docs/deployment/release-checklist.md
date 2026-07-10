# MyPetLink Phase 1 Release Checklist

Work top to bottom. Do not merge `feature/connect-admin-apis` into `main` until the pre-release items pass against a production API + database (see `production-deployment-plan.md` §8).

## Pre-release

- [ ] All feature/docs branches pushed to origin (`feature/connect-admin-apis` at the latest verified commit).
- [ ] `dotnet build apps/api/MyPetLink.Api/MyPetLink.Api.csproj` passes.
- [ ] `npm run lint:web` and `npm run build:web` pass.
- [ ] Backend hosted (e.g. Azure App Service) and reachable at `https://api.mypetlink.com.my/api/v1/health` → `{ "status": "ok" }`.
- [ ] Production SQL Server database created; `InitialCreate` migration applied; 24 tables present; plan/limit/app-setting seed rows present.
- [ ] Google OAuth: production frontend origin added to Authorized JavaScript origins; consent screen published; frontend and backend use the same client id.
- [ ] **Manual Google popup login test passes** on a preview/prod frontend (real account → `/dashboard`, `/api/v1/auth/me` returns the user).
- [ ] Frontend production env set in Cloudflare Pages (`NEXT_PUBLIC_SITE_URL=https://mypetlink.com.my`, `NEXT_PUBLIC_API_BASE_URL=https://api.mypetlink.com.my`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED=false`) and the frontend **rebuilt** so values are baked in.
- [ ] Backend env set: `ASPNETCORE_ENVIRONMENT=Production`, `ConnectionStrings__MyPetLinkDb`, `Jwt__SigningKey`, `Jwt__Issuer`, `Jwt__Audience`, `GoogleAuth__ClientId`, `Cors__AllowedOrigins__0=https://mypetlink.com.my`, `Cors__AllowedOrigins__1=https://www.mypetlink.com.my` if `www` is served, and `Features__SmartTagOrderingEnabled=false` for the free-profiles launch.
- [ ] Smart Tag ordering flag confirmed for the intended launch: backend `Features__SmartTagOrderingEnabled` and frontend `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED` both **false** for the free-profiles launch (default), or both **true** only when physical tags are ready. Mismatched values (frontend shows CTAs but backend blocks) should be avoided.
- [ ] Confirm `PublicApp__BaseUrl` is not required by the current backend; public links are generated from frontend `NEXT_PUBLIC_SITE_URL=https://mypetlink.com.my`.
- [ ] CORS confirmed: production frontend can call the API; other origins are blocked.
- [ ] Production safety checks pass: `POST /api/v1/dev/test-login` returns `404`, `/swagger` returns `404`, developer hints are absent from the production frontend build, no frontend `/dev-login` route is generated, and no secrets or `.env.local` are committed.
- [ ] First admin `gbbsoftwaresolutions@gmail.com` logged in once via Google, then was manually seeded and verified (`/api/v1/admin/auth/check` returns 200 for admin and 403 for non-admin) — see `first-admin-setup.md`.

## Smoke test (run against production, admin account)

Owner:

- [ ] Login with Google.
- [ ] Create a pet; confirm backend-generated public slug + safety code.
- [ ] Public share `/p/:publicSlug` renders (no owner email/address/internal ids).
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

- [ ] Logout clears the session and protected pages redirect to login.

## Post-release

- [ ] Monitor API logs for errors/auth failures for the first hours.
- [ ] Confirm the Cloudflare Pages production deployment serves the new build (correct API base URL baked in).
- [ ] Test the frontend on a mobile viewport (owner and public pages).
- [ ] Verify no browser console errors on key pages.
- [ ] Confirm database backups are running (Azure SQL automated backups on; optional BACPAC export scheduled).
