# MyPetLink Docs Index

Repo-wide documentation. Frontend-specific docs (agent reference, owner portal flow, public routing) live in [`apps/web/docs/`](../apps/web/docs/).

> **Repository state (2026-08-13):** MyPetLink is a working full-stack product. `apps/web` is a Next.js static export; **`apps/api` is a live ASP.NET Core + EF Core + SQL Server API** (38 migrations), not a placeholder. Documentation that still describes the backend as "future" has been archived. The deployable schema script is the **root `migration.sql`**.

## Start Here

- [`launch/SOFT_LAUNCH_READINESS.md`](launch/SOFT_LAUNCH_READINESS.md) — current launch verdict, findings, and evidence
- [`launch/SOFT_LAUNCH_SCOPE.md`](launch/SOFT_LAUNCH_SCOPE.md) — what ships at soft launch and what is deferred
- [`launch/CODEX_FIX_BACKLOG.md`](launch/CODEX_FIX_BACKLOG.md) — implementation-ready work items and batch order

## Product

- [`product/GROWTH_AND_PREMIUM_ROADMAP.md`](product/GROWTH_AND_PREMIUM_ROADMAP.md) — **current** post-launch direction, Free/Premium boundary, and build order
- [`product/FEATURE_DEVELOPMENT_BACKLOG.md`](product/FEATURE_DEVELOPMENT_BACKLOG.md) — Codex-ready work packages for the growth/Premium phase
- [`product/MARKETING_STRATEGY.md`](product/MARKETING_STRATEGY.md) — positioning, audiences, home/pricing copy rules
- [`product/SMART_TAG_PRODUCT_STRATEGY.md`](product/SMART_TAG_PRODUCT_STRATEGY.md) — physical Smart Tag product/business strategy
- [`product/SMART_TAG_CATALOG_ARCHITECTURE.md`](product/SMART_TAG_CATALOG_ARCHITECTURE.md) — tag catalog, SKUs, and variants
- [`product/mypetlink-development-phases.md`](product/mypetlink-development-phases.md) — historical Phase 0–4 plan and standing product rules
- [`phase-1-product-rules.md`](phase-1-product-rules.md) — non-negotiable Phase 1 product rules
- [`DELIVERY_FEES.md`](DELIVERY_FEES.md) — delivery fee model

## Architecture

- [`architecture/configuration-governance.md`](architecture/configuration-governance.md) — **authoritative** rules for where configuration lives
- [`architecture/communication-preferences.md`](architecture/communication-preferences.md) — communication preference rules
- [`branding/email-design-system.md`](branding/email-design-system.md) — required transactional email design system
- [`frontend-route-map.md`](frontend-route-map.md) — every public, owner, and admin route
- [`current-demo-data-model.md`](current-demo-data-model.md) — the `apps/web` local/demo fallback model (used when the API is not configured)
- [`admin-portal-mvp.md`](admin-portal-mvp.md) — Admin Portal pages, actions, and status rules

## API And Database

- [`api/api-contract-v1-draft.md`](api/api-contract-v1-draft.md) — V1 REST API contract (`/api/v1`)
- [`database/schema-v1-draft.md`](database/schema-v1-draft.md) — V1 relational schema
- [`database/migration-plan.md`](database/migration-plan.md) — migration and seed planning
- [`database/pet-age-migration.md`](database/pet-age-migration.md) — pet age migration notes
- [`backend/backend-architecture.md`](backend/backend-architecture.md) — backend flows and diagrams
- [`backend/backend-project-structure.md`](backend/backend-project-structure.md) — .NET project structure
- [`backend/implementation-plan.md`](backend/implementation-plan.md) — backend implementation phases

## Deployment

- [`deployment/production-deployment-plan.md`](deployment/production-deployment-plan.md) — **current** hosting, architecture, and DB deployment
- [`deployment/environment-variables.md`](deployment/environment-variables.md) — required variables and secrets
- [`deployment/dynamic-social-previews.md`](deployment/dynamic-social-previews.md) — edge OG rewriting and social cards
- [`deployment/database-resilience.md`](deployment/database-resilience.md) — retry and readiness behaviour
- [`deployment/search-indexing.md`](deployment/search-indexing.md) — indexing policy
- [`deployment/google-oauth-setup.md`](deployment/google-oauth-setup.md) — Google OAuth setup
- [`deployment/first-admin-setup.md`](deployment/first-admin-setup.md) — safe first admin promotion
- [`deployment/owner-welcome-email.md`](deployment/owner-welcome-email.md) · [`deployment/payment-confirmation-email.md`](deployment/payment-confirmation-email.md) — email rollout
- [`deployment/release-checklist.md`](deployment/release-checklist.md) · [`deployment/smoke-test-script.md`](deployment/smoke-test-script.md) · [`deployment/pr-checklist.md`](deployment/pr-checklist.md)
- [`cloudflare-r2-media-setup.md`](cloudflare-r2-media-setup.md) — media storage setup

## Operations

- [`operations/configuration-inventory.md`](operations/configuration-inventory.md) — current configuration ownership inventory
- [`operations/product-analytics.md`](operations/product-analytics.md) — event, privacy, and GA4 configuration contract
- [`operations/order-and-payment-proof-flow.md`](operations/order-and-payment-proof-flow.md) — manual order/payment proof flow
- [`operations/smart-tag-lifecycle.md`](operations/smart-tag-lifecycle.md) — smart tag lifecycle and scan behaviour
- [`operations/smart-tag-scan-sources.md`](operations/smart-tag-scan-sources.md) — QR / NFC / legacy scan sources
- [`operations/shipping-fulfilment-settings.md`](operations/shipping-fulfilment-settings.md) — shipping and fulfilment settings
- [`operations/business-reference-numbering.md`](operations/business-reference-numbering.md) — reference number format
- [`operations/phase-1-operations-flow.md`](operations/phase-1-operations-flow.md) · [`operations/phase-1-admin-operations.md`](operations/phase-1-admin-operations.md)

## Testing

- [`testing/development-admin-login.md`](testing/development-admin-login.md) — guarded local admin login
- [`testing/phase-1-e2e-test-script.md`](testing/phase-1-e2e-test-script.md) — repeatable E2E script
- [`testing/phase-1-e2e-test-report.md`](testing/phase-1-e2e-test-report.md) — recorded run results

## Archive

Historical documents, superseded but preserved: [`archive/2026-08/`](archive/2026-08/)

- `audit-2026-07/` — the July 2026 audit snapshot (superseded by `launch/SOFT_LAUNCH_READINESS.md`)
- `backend-needed-features.md` — requirements for the then-future backend, now built
- `hosting-and-deployment.md` — pre-.NET hosting strategy (Supabase/PostgreSQL assumptions)
- `api-contract-draft.md` · `database-draft.md` — earlier contract and schema drafts
