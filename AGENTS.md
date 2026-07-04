# MyPetLink Monorepo — Agent Rules

This is the **MyPetLink monorepo**. Read this file before making changes anywhere in the repository.

## Layout

- The current frontend app lives in **`apps/web`** (Next.js App Router, TypeScript, Tailwind CSS, static export). Before working on it, read `apps/web/AGENTS.md` and `apps/web/docs/AI_AGENT_REFERENCE.md`.
- `apps/api` is a **placeholder** for the future C# .NET API. Do not generate backend code until explicitly requested.
- `database/` holds **placeholders** for future migrations, seed scripts, and database docs. Do not create real SQL scripts until the schema is approved.
- `docs/` holds product, architecture, API, database, and operations documentation.

## Hard rules

1. **Do not edit generated folders**: `node_modules`, `.next`, `out`, build caches.
2. **Do not implement the backend or database unless explicitly asked.** Keep frontend-only behavior for now; all data is local/demo state inside `apps/web`.
3. **Never expose internal wording in user-facing UI** — no "mock", "demo", "backend", "API", "payload", "service", or "frontend-only" text in anything a visitor or owner can see.
4. **Premium is Coming Soon only.** No subscription, upgrade, or checkout flow.
5. **GPS Safety is Coming Later only.**
6. **Smart Tags are optional one-time add-ons** (QR Pet Tag and QR + NFC Smart Tag), not subscriptions.

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

### User-facing terms for our routes

Refer to the three public pages by name in copy, not by their path:

- `/p/:petSlug` → **Public Share Profile** (or "Share Profile")
- `/q/:safetyCode` → **QR Safety Page** (or "Safety QR")
- `/t/:tagCode` → **Physical Tag Scan Page** (or "Physical Tag QR" / "Tag Scan Page")

Do not lump these together as a generic "QR Profile" — they are three distinct pages.

## Route conventions

- QR Safety Page: `/q/:safetyCode`
- Physical Tag Scan Link and tag activation entry point: `/t/:tagCode`
- Public Share Profile: `/p/:petSlug` (slug ends with the pet's public code)
- Owner Portal routes currently live in the same Next.js app (`/dashboard`, `/pets`, `/tags`, `/orders`, `/settings`, ...).
- The Admin Portal UI will also be added later under `/admin` in `apps/web`, unless the project is split later.

Route strings are centralized in `apps/web/src/lib/routes.ts` — never hardcode route strings in pages or components.

Physical tag activation must be started from the Physical Tag Scan Page (`/t/:tagCode`) after the owner scans/taps the physical tag. Owner Portal tag/order pages may offer View Tag Scan Page and Copy Tag Link, but must not show direct Activate Tag actions.

## Future work (planned, not started)

- The backend API is planned for `apps/api` (C# .NET 8 Web API, SQL Server, EF Core) but must not be generated until explicitly requested.
- Real auth, payments, subscriptions, and GPS are all out of scope until explicitly requested.
