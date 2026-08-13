# MyPetLink Monorepo — Agent Rules

This is the **MyPetLink monorepo**. Read this file before making changes anywhere in the repository.

## Layout

- The frontend app lives in **`apps/web`** (Next.js App Router, TypeScript, Tailwind CSS, static export). Before working on it, read `apps/web/AGENTS.md` and `apps/web/docs/AI_AGENT_REFERENCE.md`.
- **`apps/api` is a live C# .NET Web API** (ASP.NET Core, EF Core, SQL Server) — not a placeholder. It backs owner auth, pets, public profiles, safety pages, media, care records, moments, Smart Tags, orders, payment proofs, transactional email, and the Admin Portal.
- Database schema is owned by **EF Core migrations in `apps/api/MyPetLink.Api/Migrations`**. The deployable script is the **root `migration.sql`**; regenerate it whenever a migration is added.
- `database/` holds documentation placeholders only. **Do not treat `database/migration.sql` as authoritative — it is stale.**
- `docs/` holds product, architecture, API, database, and operations documentation.

## Hard rules

1. **Do not edit generated folders**: `node_modules`, `.next`, `out`, build caches.
2. **Data lives in SQL Server behind `apps/api`.** The `apps/web` mock/localStorage layer (`src/services/mockApi.ts`, `src/data/mock*.ts`) is only the fallback used when `NEXT_PUBLIC_API_BASE_URL` is not configured. Keep both paths in sync when changing a data contract.
3. **Never expose internal wording in user-facing UI** — no "mock", "demo", "backend", "API", "payload", "service", or "frontend-only" text in anything a visitor or owner can see.
4. **Premium is Coming Soon only.** No subscription, upgrade, or checkout flow.
5. **GPS Safety is Coming Later only.**
6. **Smart Tags are optional one-time add-ons** (QR Pet Tag and QR + NFC Smart Tag), not subscriptions. Each tag has a **tag variant** — **Lightweight** (cats/small pets) or **Standard** (dogs/medium-large pets) — separate from the tag type. There is no shape/design option (deprecated).
7. **Assigned inventory tags are not final.** Before an order ships, an admin can change the assigned tag (the old tag returns to unclaimed stock). After shipping/delivery/activation, use Replace Tag (the old tag becomes `Replaced` and its `/t` scan page stops showing owner contact). Both are admin-only, validate tag type/variant, and are audited. Inventory stock is consumed at assignment, not at order creation.

## Configuration ownership

Every configurable value has exactly one authoritative owner. Before adding or
relocating one, classify it using
[`docs/architecture/configuration-governance.md`](docs/architecture/configuration-governance.md);
the current inventory is
[`docs/operations/configuration-inventory.md`](docs/operations/configuration-inventory.md).

1. Classify the value with the decision tree in the governance document.
2. Do not add a new App Setting for a runtime business value without
   documenting why deployment ownership is required.
3. Never put secrets, credentials, signing keys, or connection strings in
   application database tables or the Admin Portal.
4. Do not create duplicate App Settings, database values, frontend constants,
   or hardcoded fallbacks for the same business fact.
5. Admin-editable settings need typed validation, authorization, audit logging,
   UTC timestamps, and `RowVersion` concurrency.
6. Infrastructure settings may appear in Admin only as safe read-only status,
   derived from the value actually in effect — never a hardcoded status string.
7. Admin Portal must never expose raw secrets or complete configuration dumps.
8. Missing financial, security, tag-routing, and external-service configuration
   must fail closed.
9. A feature-level database switch must never override a global infrastructure
   kill switch. Two-level controls are `AND` — see `EmailTemplateGate`.
10. Configuration migrations must preserve historical snapshots, seed new
    switches as disabled, and define rollout and rollback steps.
11. Update the configuration inventory and deployment documentation whenever
    configuration ownership changes.
12. Do not build generic key/value setting editors. Every setting needs typed
    validation and a purpose-built UI.

## Production UI copy rules

All user-facing **and** admin-facing UI text must read as production-ready copy for non-developers.

- Do not write sentences for developers unless the UI is explicitly a developer/debug-only screen.
- Avoid internal route names, API/backend/database wording, and implementation details in normal UI copy. Routes may still appear as actual URLs or links when the user needs the URL itself.
- Explain the user benefit or operational meaning, not the technical mechanism.
  - Good: "If this tag is disabled, the scan page will not show owner contact details."
  - Bad: "Uses /t so disabled tags stay protected."
  - Good: "We couldn't connect right now. Please try again in a moment."
  - Bad: "Check that the backend and local database are running."
- Development-only hints (e.g. connection debug hints) must be gated so they only render in development, never in a production build.
- Admin Portal copy can be operational, but must still be clear and non-technical.

## Transactional email design

All customer-facing MyPetLink email templates must follow
`docs/branding/email-design-system.md`.

Reuse the shared transactional email layout, header, footer, CTA, typography,
spacing, and brand tokens. Do not create standalone email visual styles or
duplicate full email layouts inside individual templates.

### User-facing terms for our routes

Refer to the three public pages by name in copy, not by their path:

- `/p/:petSlug` → **Public Share Profile** (or "Public Profile" / "Share Profile")
- `/q/:safetyCode` → **Safety Profile** — the finder-facing safety page. QR codes, NFC taps, and direct links are *access methods* to this one profile, so never call it "QR Safety Page", "QR Safety Profile", or "QR Profile". Use "QR" / "NFC" wording only for the specific access technology or physical tag capability (e.g. "Download QR Code", "Tap NFC Tag", "QR + NFC Smart Tag").
- `/t/:tagCode` → **Physical Tag Scan Page** (or "Physical Tag QR" / "Tag Scan Page")

Do not lump these together as a generic "QR Profile" — they are three distinct pages.

Safety Profile status labels are: **Safety Profile Active**, **Contact Update Needed**, and **Safety Profile Off** (derived in `apps/web/src/lib/safetyProfile.ts`). Never present a linked Smart Tag as part of that status — tag linkage has its own labels (e.g. "No Smart Tag Linked", "Smart Tag Linked").

## Route conventions

- Safety Profile: `/q/:safetyCode`
- Physical Tag Scan Link and tag activation entry point: `/t/:tagCode`
- Public Share Profile: `/p/:petSlug` (slug ends with the pet's public code)
- Owner Portal routes currently live in the same Next.js app (`/dashboard`, `/pets`, `/tags`, `/orders`, `/settings`, ...).
- The Admin Portal UI will also be added later under `/admin` in `apps/web`, unless the project is split later.

Route strings are centralized in `apps/web/src/lib/routes.ts` — never hardcode route strings in pages or components.

Physical tag activation must be started from the Physical Tag Scan Page (`/t/:tagCode`) after the owner scans/taps the physical tag. Owner Portal tag/order pages may offer View Tag Scan Page and Copy Tag Link, but must not show direct Activate Tag actions.

## Future work (planned, not started)

- The backend API is planned for `apps/api` (C# .NET 8 Web API, SQL Server, EF Core) but must not be generated until explicitly requested.
- Real auth, payments, subscriptions, and GPS are all out of scope until explicitly requested.
