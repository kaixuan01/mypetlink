# Operations Docs

Hosting, deployment, and operations documentation.

- Hosting and deployment: see [`../deployment/production-deployment-plan.md`](../deployment/production-deployment-plan.md) (the earlier strategy is archived at [`../archive/2026-08/hosting-and-deployment.md`](../archive/2026-08/hosting-and-deployment.md))
- [`phase-1-operations-flow.md`](phase-1-operations-flow.md) - current frontend/manual operations flow
- [`phase-1-admin-operations.md`](phase-1-admin-operations.md) - Admin Portal MVP limitations and backend requirements
- [`order-and-payment-proof-flow.md`](order-and-payment-proof-flow.md) - manual smart tag order and payment proof review flow
- [`smart-tag-lifecycle.md`](smart-tag-lifecycle.md) - physical tag lifecycle, activation, and scan behavior

Current deployment: the web app (`apps/web`) is a Next.js static export deployed to Cloudflare Pages (root directory `apps/web`, build command `npm run build`, output directory `out`).
