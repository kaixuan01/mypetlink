# Deployment Docs

Phase 1 production deployment planning for the backend-connected MyPetLink stack (branch `feature/connect-admin-apis`). Planning only — nothing here deploys automatically.

- [`production-deployment-plan.md`](production-deployment-plan.md) — hosting options, recommended architecture, database deployment, merge strategy, launch limitations
- [`environment-variables.md`](environment-variables.md) — required frontend/backend variables with secret flags and real config-key names
- [`google-oauth-setup.md`](google-oauth-setup.md) — Google Cloud Console setup for the GIS ID-token login
- [`first-admin-setup.md`](first-admin-setup.md) — safe, data-driven first admin promotion
- [`release-checklist.md`](release-checklist.md) — pre-release, smoke test, post-release

Recommended Phase 1 hosting: Azure App Service (.NET API) + Azure SQL Database, frontend on Cloudflare Pages.
