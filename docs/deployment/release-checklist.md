# MyPetLink Phase 1 Release Checklist

Work top to bottom. Do not merge `feature/connect-admin-apis` into `main` until the pre-release items pass against a production API + database (see `production-deployment-plan.md` §8).

## Pre-release

- [ ] All feature/docs branches pushed to origin (`feature/connect-admin-apis` at `08c34c2` or later).
- [ ] `dotnet build apps/api/MyPetLink.Api/MyPetLink.Api.csproj` passes.
- [ ] `npm run lint:web` and `npm run build:web` pass.
- [ ] Backend hosted (e.g. Azure App Service) and reachable at `https://api.mypetlink.com.my/api/v1/health` → `{ "status": "ok" }`.
- [ ] Production SQL Server database created; `InitialCreate` migration applied; 24 tables present; plan/limit/app-setting seed rows present.
- [ ] Google OAuth: production frontend origin added to Authorized JavaScript origins; consent screen published; frontend and backend use the same client id.
- [ ] **Manual Google popup login test passes** on a preview/prod frontend (real account → `/dashboard`, `/api/v1/auth/me` returns the user).
- [ ] Frontend production env set in Cloudflare Pages (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`) and the frontend **rebuilt** so values are baked in.
- [ ] Backend env set: `ConnectionStrings__MyPetLinkDb`, `Jwt__SigningKey`, `Jwt__Issuer`, `Jwt__Audience`, `GoogleAuth__ClientId`, `Cors__AllowedOrigins__0` = production frontend origin, `ASPNETCORE_ENVIRONMENT=Production`.
- [ ] CORS confirmed: production frontend can call the API; other origins are blocked.
- [ ] First admin seeded and verified (`/api/v1/admin/auth/check` → 200 for admin, 403 for non-admin) — see `first-admin-setup.md`.

## Smoke test (run against production, admin account)

Owner:

- [ ] Login with Google.
- [ ] Create a pet; confirm backend-generated public slug + safety code.
- [ ] Public share `/p/:publicSlug` renders (no owner email/address/internal ids).
- [ ] QR Safety `/q/:safetyCode` renders finder-first content.
- [ ] Create a care record; edit it; confirm it persists after reload.
- [ ] Create a memory (public) and a private memory; confirm the public one appears on `/p/`, the private one does not.
- [ ] Create a smart tag order (price set server-side); submit a payment proof (metadata only).

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
