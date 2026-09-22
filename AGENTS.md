# MyPetLink Monorepo — Agent Rules

This is the **MyPetLink monorepo**. Read this file before making changes anywhere in the repository.

## Product model — read this first

[`docs/architecture/product-model.md`](docs/architecture/product-model.md) is the
**canonical reference** for MyPetLink's concepts, terminology, route semantics
and the relationships between Pet Profile, Share Profile, Safety Profile,
Community Profile, Smart Tags and Moments.

When product terminology, route semantics or profile relationships are unclear,
follow that document. **Do not infer behaviour from legacy route names, old
screenshots, historical phase documents or backend entity names.**

- **Current code remains the behavioural source of truth.** Where the code and
  that document disagree, the code is what ships — fix the document, or change
  the code deliberately.
- **The product-model document defines the intended terminology and
  architecture.** A stale historical document does not override it.

The rules below are the operational ones. They do not repeat the product model.

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
6. **The QR + NFC Smart Tag is the only physical tag we sell.** It is an optional one-time add-on, never a subscription. Each tag has a **tag variant** — **Lightweight** (cats/small pets) or **Standard** (dogs/medium-large pets). There is no shape/design option (deprecated).
   - The separate **QR Pet Tag** (QR-only, no NFC) is **discontinued**. QR scanning itself is unchanged: the QR + NFC Smart Tag still carries a QR code, and `/q`, `/n`, and `/t` all keep working.
   - No new QR-only SKU can be created, made purchasable, generated as inventory, quoted, or ordered — the rule lives in `TagCatalogSellability` (API) and `src/lib/tagCapabilities.ts` (web).
   - QR-only rows produced before this decision stay readable so existing tags, inventory, orders, invoices, and receipts remain correct. Do not delete the `TagType.QrPetTag` enum value, the legacy display fallbacks, or the admin filters that find that history.
7. **Assigned inventory tags are not final.** Before an order ships, an admin can change the assigned tag (the old tag returns to unclaimed stock). After shipping/delivery/activation, use Replace Tag (the old tag becomes `Replaced` and its `/t` scan page stops showing owner contact). Both are admin-only, validate tag type/variant, and are audited. Inventory stock is consumed at assignment, not at order creation.

## Social identity boundaries

MyPetLink Social is under construction. Only the foundation exists — read
[`docs/architecture/social-foundation.md`](docs/architecture/social-foundation.md)
before touching anything social.

1. **Three owner identities exist and must never be collapsed.**
   - *Account*: `Users.Email` / `Users.DisplayName`. Never public.
   - *Finder*: `OwnerProfiles.OwnerDisplayName` (and the per-pet override).
     Shown to someone who found a lost pet, gated by `ShowOwnerName`.
   - *Social*: `OwnerSocialProfiles`. Typed by the owner, never derived.

   Never seed a social name or handle from an account name, a Google profile,
   an email local part, or the finder-facing name. Handle suggestions may come
   from pet names only.

   **One anonymous payload must never name two of them.** The Share Profile
   response omits `ownerDisplayName` whenever it carries `sharedBy`
   (`PublicProfileService.ResolveAnonymousOwnerDisplayName`). Enforce this in the
   projection, never only in a component.
2. **Social is opt-in and starts off** — for owners and for pets, existing rows
   and new ones. `PetPublicProfiles.IsPublicProfileEnabled` means "I will share
   this link"; it never implies social participation. That is why
   `PetSocialProfiles` is a separate table.

   **The dependency runs one way only.** Community participation for a pet
   requires an enabled Share Profile; a Share Profile must never require
   Community. Nothing that depends on the Share Profile may test a social switch
   instead — including the Safety Profile's link to it
   (`QrSafetyService.ResolveShareProfileSlug`). An owner with Share ON, Safety
   ON and Community OFF must have every one of those surfaces working.
3. **`PetMemories.AuthorUserId` is immutable.** It records who wrote the Moment.
   Pet ownership transfer never rewrites it.
4. **A multi-pet Moment consumes one allowance**, against the primary
   `PetMemories.PetId`. `MomentPets` rows never count against a plan limit.
   Phase 1 permits tagging only the authenticated user's own pets.
5. **Filtered SQL indexes are a performance optimisation, never a privacy
   control.** A wrong predicate still reads the base table. Enforce privacy
   explicitly in the query, the authorization, the projection and the
   visibility checks.
6. **The actor is always the JWT subject.** No social endpoint accepts a user
   id, owner id or actor id from a client.
7. **Smart Tag scanning stays Safety Profile first.** `/q`, `/n` and `/t` must
   never route to a social surface.
8. **A general area is never an address.** Every surface that accepts one uses
   `GeneralAreaRules`. Do not add a second validation path, and do not
   introduce any automatic or precise location.

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

## Admin Portal access control

Admin Portal authorization is **capability based**, not role based. Read
[`docs/architecture/admin-access-management.md`](docs/architecture/admin-access-management.md)
before touching it.

1. Every protected Admin endpoint must name a capability from
   `apps/api/MyPetLink.Api/Auth/AdminCapabilities.cs`:
   `[Authorize(Policy = AdminCapabilities.InventoryGenerate)]`. A new Admin
   endpoint behind nothing but the shared active-admin policy fails
   `AdminCapabilityCoverageTests`.
2. **Never write a role-name check** — no `role == "Sales"`, in C# or in
   TypeScript. Ask for a capability.
3. Add a capability by adding the constant, describing it in
   `AdminCapabilityCatalog.cs`, mirroring it in
   `apps/web/src/lib/adminCapabilities.ts`, and granting it to the built-in
   roles that should have it. There is no other way to create one: a key that
   is not in the catalogue grants nothing and is refused on save.
4. A module with a high-risk action needs separate capabilities for viewing,
   changing and that action — never one broad `module.access`.
5. **Frontend visibility is not authorization.** Hiding a menu item or a button
   is a courtesy; the API must refuse the request with `403` on its own.
6. Access is resolved from the database on every request, never from a token
   claim. Do not cache it across requests or reintroduce a role claim as an
   authorization input.
7. Access-management changes must be audited through `IAuditLogService`, with
   the actor, the target, and both sides of the change.

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

Canonical terminology, and the debt still owed on it, live in
[`docs/architecture/product-model.md`](docs/architecture/product-model.md).
The short version — refer to the public pages by name in copy, not by their path:

- `/p/:petSlug` → **Share Profile** (legal copy may use the fuller "Public Share Profile"). **Pet Profile** is the umbrella concept — the whole pet record — and is not the name of this page.
- `/q/:safetyCode` → **Safety Profile** — the finder-facing safety page. QR codes, NFC taps, and direct links are *access methods* to this one profile, so never call it "QR Safety Page", "QR Safety Profile", or "QR Profile". Use "QR" / "NFC" wording only for the specific access technology or physical tag capability (e.g. "Download QR Code", "Tap NFC Tag", "QR + NFC Smart Tag").
- `/u/:handle` → **Community Profile** — the owner's public identity in Community.
- `/t/:tagCode` → **Physical Tag Scan Page** (or "Physical Tag QR" / "Tag Scan Page")

Do not lump these together as a generic "QR Profile" — they are distinct pages.

**Moment** is the user-facing word for a `PetMemory`. Do not introduce new
"Memory"/"Memories" copy; the existing occurrences are tracked debt.

Safety Profile status labels are: **Safety Profile Active**, **Contact Update Needed**, and **Safety Profile Off** (derived in `apps/web/src/lib/safetyProfile.ts`). Never present a linked Smart Tag as part of that status — tag linkage has its own labels (e.g. "No Smart Tag Linked", "Smart Tag Linked").

## Route conventions

Full map and semantics: [`docs/architecture/product-model.md`](docs/architecture/product-model.md).

- Safety Profile: `/q/:safetyCode`
- Smart Tag entry: `/q/:tagCode` (QR), `/n/:tagCode` (NFC), `/t/:tagCode` (legacy printed tags)
- Share Profile: `/p/:petSlug` (slug ends with the pet's public code)
- Community Profile: `/u/:handle`
- Owner Portal routes currently live in the same Next.js app (`/dashboard`, `/pets`, `/tags`, `/orders`, `/settings`, ...).
- The Admin Portal UI lives under `/admin` in `apps/web`, unless the project is split later.

Route strings are centralized in `apps/web/src/lib/routes.ts` — never hardcode route strings in pages or components.

Physical tag activation must be started by scanning or tapping the tag, and runs
from the **current QR entry, `/q/:tagCode`** (`activatePath()`); `/activate/:tagCode`
redirects there. `/t/:tagCode` is retained for already-issued printed tags and must
not be removed. NFC never offers activation — an unactivated tag tapped over NFC is
told to scan the QR code first. Owner Portal tag/order pages may offer View Tag Scan
Page and Copy Tag Link, but must not show direct Activate Tag actions.

## Future work (planned, not started)

- Premium, payments, subscriptions, and GPS Safety are all out of scope until explicitly requested.
