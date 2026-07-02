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

## Route conventions

- QR Safety Page: `/q/:safetyCode`
- Physical Tag Scan Link: `/t/:tagCode`
- Public Share Profile: `/p/:petSlug` (slug ends with the pet's public code)
- Owner Portal routes currently live in the same Next.js app (`/dashboard`, `/pets`, `/tags`, `/orders`, `/settings`, ...).
- The Admin Portal UI will also be added later under `/admin` in `apps/web`, unless the project is split later.

Route strings are centralized in `apps/web/src/lib/routes.ts` — never hardcode route strings in pages or components.

## Future work (planned, not started)

- The backend API is planned for `apps/api` (C# .NET 8 Web API, SQL Server, EF Core) but must not be generated until explicitly requested.
- Real auth, payments, subscriptions, and GPS are all out of scope until explicitly requested.
