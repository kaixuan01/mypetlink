# Deployment Docs

Phase 1 production deployment planning for the backend-connected MyPetLink stack (branch `feature/connect-admin-apis`). Planning only — nothing here deploys automatically.

- [`production-deployment-plan.md`](production-deployment-plan.md) — hosting options, recommended architecture, database deployment, merge strategy, launch limitations
- [`environment-variables.md`](environment-variables.md) — required frontend/backend variables with secret flags and real config-key names
- [`google-oauth-setup.md`](google-oauth-setup.md) — Google Cloud Console setup for the GIS ID-token login
- [`first-admin-setup.md`](first-admin-setup.md) — safe, data-driven first admin promotion
- [`release-checklist.md`](release-checklist.md) — pre-release, smoke test, post-release
- [`pr-checklist.md`](pr-checklist.md) — production-gated PR/merge checklist
- [`smoke-test-script.md`](smoke-test-script.md) — step-by-step manual smoke test (backend, owner, admin, public states)
- [`sql/first-admin-template.sql`](sql/first-admin-template.sql) — placeholder SQL to promote the first admin

Release tooling: CI runs on every PR via [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) (web lint + build, API Release build; no database, no secrets). Env templates: [`apps/web/.env.example`](../../apps/web/.env.example) and [`apps/api/MyPetLink.Api/appsettings.Example.json`](../../apps/api/MyPetLink.Api/appsettings.Example.json).

Recommended Phase 1 hosting: Azure App Service (.NET API) + Azure SQL Database, frontend on Cloudflare Pages.
