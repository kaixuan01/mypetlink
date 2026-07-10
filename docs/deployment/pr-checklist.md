# MyPetLink Release PR Checklist

Use before merging the backend-connected Phase 1 branch (`feature/connect-admin-apis`) into `main`. This is a stricter, production-gated view of `release-checklist.md` focused on the PR/merge decision.

**Do not merge into `main` until the production backend and database are ready** — `main` builds the live Cloudflare Pages frontend, and merging early would point live login/data at an API that does not exist yet.

## PR readiness

- [ ] All feature/docs branches pushed to origin.
- [ ] **CI green** — the `MyPetLink CI` workflow (web lint + build, API Release build) passes on the PR.
- [ ] No new features snuck in — the diff is backend-connection, tooling, docs only.
- [ ] No secrets in the repo — no real Google client id, JWT signing key, or DB connection string committed; `.env.local` untracked; only `.env.example` / `appsettings.Example.json` templates present.

## Production prerequisites (before merge)

- [ ] Manual Google popup login passed against a preview/prod frontend (real account → dashboard, `/api/v1/auth/me` returns user).
- [ ] Production backend host chosen and deployed (recommended: Azure App Service); `{API}/api/v1/health` returns ok.
- [ ] Production SQL Server database ready; `InitialCreate` migration applied; 24 tables + plan/limit/app-setting seeds present.
- [ ] Backend env configured: `ConnectionStrings__MyPetLinkDb`, `Jwt__SigningKey`, `Jwt__Issuer`, `Jwt__Audience`, `GoogleAuth__ClientId`, `Cors__AllowedOrigins__0`, `ASPNETCORE_ENVIRONMENT=Production`.
- [ ] Frontend env configured in Cloudflare Pages (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`) and the frontend **rebuilt** (values are baked at build time).
- [ ] CORS confirmed: production frontend can call the API; other origins blocked.
- [ ] Google OAuth production origin added to Authorized JavaScript origins; consent screen published.
- [ ] First admin seeded and verified (see `sql/first-admin-template.sql`; `/api/v1/admin/auth/check` → 200 admin / 403 non-admin).
- [ ] Smoke test passed end to end (see `smoke-test-script.md`).

## Merge

- [ ] PR base is `main` (origin/main already contains the chain through `feature/backend-api-skeleton`; this PR stacks the remaining branches). If you prefer, open stacked PRs following the branch chain order instead.
- [ ] Merge triggers the Cloudflare Pages production build — confirm the production frontend env is set first.
- [ ] After merge: monitor API logs, verify the production frontend serves the new build, confirm DB backups are running.

## Known limitations shipping in Phase 1

Payment proofs are metadata only (no file storage); no payment gateway; no shipping integration; admin settings read-only; admin lists load ≤100 rows and filter client-side; printed/reseller batch actions disabled; Premium Coming Soon; GPS Coming Later.
