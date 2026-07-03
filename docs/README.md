# MyPetLink Docs Index

Repo-wide documentation. Frontend-specific docs (agent reference, owner portal flow, public routing) live in [`apps/web/docs/`](../apps/web/docs/).

## Frontend And Product State

- [`frontend-route-map.md`](frontend-route-map.md) - every public, owner, and admin route
- [`current-demo-data-model.md`](current-demo-data-model.md) - the frontend demo data model, persistence, and status values
- [`phase-1-product-rules.md`](phase-1-product-rules.md) - non-negotiable Phase 1 product rules
- [`admin-portal-mvp.md`](admin-portal-mvp.md) - Admin Portal pages, actions, status rules, and limitations
- [`backend-needed-features.md`](backend-needed-features.md) - what the future backend must provide

## Sections

- [`product/`](product/) - product strategy and roadmap
  - [`MARKETING_STRATEGY.md`](product/MARKETING_STRATEGY.md) - positioning, audiences, home/pricing copy rules
  - [`SMART_TAG_PRODUCT_STRATEGY.md`](product/SMART_TAG_PRODUCT_STRATEGY.md) - physical Smart Tag product/business strategy
  - [`mypetlink-development-phases.md`](product/mypetlink-development-phases.md) - development phases and roadmap
- [`backend/`](backend/) - backend planning and architecture
  - [`backend-architecture.md`](backend/backend-architecture.md) - high-level backend flows and Mermaid diagrams
  - [`backend-project-structure.md`](backend/backend-project-structure.md) - recommended .NET 8 project structure
  - [`implementation-plan.md`](backend/implementation-plan.md) - backend implementation phases
- [`architecture/`](architecture/) - system architecture docs
- [`api/`](api/) - API documentation
  - [`api-contract-v1-draft.md`](api/api-contract-v1-draft.md) - V1 REST API contract draft (`/api/v1`)
  - [`api-contract-draft.md`](api/api-contract-draft.md) - earlier draft REST contract for the future .NET API
- [`database/`](database/) - database documentation
  - [`schema-v1-draft.md`](database/schema-v1-draft.md) - V1 relational schema draft
  - [`migration-plan.md`](database/migration-plan.md) - migration and seed planning
  - [`database-draft.md`](database/database-draft.md) - earlier draft SQL Server schema
- [`operations/`](operations/) - hosting, deployment, and operations
  - [`hosting-and-deployment.md`](operations/hosting-and-deployment.md) - hosting and deployment strategy
  - [`phase-1-operations-flow.md`](operations/phase-1-operations-flow.md) - manual order, payment, and tag operations
  - [`phase-1-admin-operations.md`](operations/phase-1-admin-operations.md) - Admin Portal MVP backend requirements
  - [`order-and-payment-proof-flow.md`](operations/order-and-payment-proof-flow.md) - manual order/payment proof flow
  - [`smart-tag-lifecycle.md`](operations/smart-tag-lifecycle.md) - smart tag lifecycle and scan behavior
