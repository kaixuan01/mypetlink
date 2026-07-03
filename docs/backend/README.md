# Backend Docs

Backend planning documents for the future C# .NET 8 API. The backend is not implemented yet.

- [`backend-architecture.md`](backend-architecture.md) - high-level flows and Mermaid diagrams
- [`backend-project-structure.md`](backend-project-structure.md) - recommended project structure
- [`implementation-plan.md`](implementation-plan.md) - backend implementation phases

Related: [`../database/schema-v1-draft.md`](../database/schema-v1-draft.md), [`../api/api-contract-v1-draft.md`](../api/api-contract-v1-draft.md), [`../database/migration-plan.md`](../database/migration-plan.md), and the operations flow docs in [`../operations/`](../operations/).

## Phase 1 Decisions (review outcome, 2026-07-03)

Resolved open questions so the API skeleton can be generated without re-deciding them:

1. **File storage provider** — implement `IFileStorageProvider` with a `Local` provider only for Phase 1; design paths/metadata provider-neutral (already in `MediaFiles`) so Cloudflare R2 (S3-compatible) can be added without schema changes. R2 is the preferred first cloud provider since the frontend already ships on Cloudflare.
2. **Login method** — Google Sign-In only for Phase 1 launch. No passwords, ever. The email "login link" UI on the current `/login` page becomes a fast-follow once an outbound email provider exists (magic links need email sending, which is out of MVP scope); until then it should present as coming soon at integration time.
3. **Admin role granularity** — one simple `Admin` capability for Phase 1: seed a single `SuperAdmin`, treat `Admin`/`SuperAdmin` as equivalent in policies, keep `OwnerSupport`/`Operations` as reserved enum values for later. Do not build a permission matrix for a solo operator.
4. **Refresh tokens** — rotating refresh tokens with hashed storage and family revocation on reuse (as drafted). Keep it simple: access token 30 minutes, refresh token 30 days, one active family per device/session, no sliding-window complexity in Phase 1.
5. **IP geolocation** — optional and non-blocking. Leave `TagScans.Country/City` null when no source is configured; if wanted later, resolve asynchronously from a free-tier source. Never a launch dependency, and never presented as GPS tracking.
