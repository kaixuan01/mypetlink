# MyPetLink Frontend Route Map

All routes live in the Next.js app at `apps/web` (App Router, static export in production builds). Route strings are centralized in `apps/web/src/lib/routes.ts` — pages and components must use the helpers, never hardcoded strings.

## Public routes (no login)

| Route | Purpose |
| --- | --- |
| `/` | Marketing landing page (fixed nine-section order, three pillars: Safety / Care / Memories) |
| `/sample` | Sample public profile and finder safety experiences |
| `/pricing` | Free Profile, Smart Tag add-ons, Premium Coming Soon, GPS Safety Coming Later |
| `/privacy` | Privacy Notice |
| `/terms` | Terms of Use |
| `/p/{petSlug}-{publicCode}` | Public Share Profile (friendly, shareable; resolved by `publicCode`, the segment after the last `-`) |
| `/q/{safetyCode}` | Pet-level QR Safety Page (finder-first, emergency-focused; belongs to the pet, works without a physical tag) |
| `/t/{tagCode}` | Physical tag scan link. Active tags render the same safety content as `/q/`; unassigned tags show the activation prompt; lost/disabled/replaced/archived tags show a safe inactive page with no owner contact |
| `/activate/{tagCode}` | Tag activation flow for unassigned (retail) or delivered tags |

Key rule: the Public Share Profile (`/p/`) and the QR Safety Page (`/q/`) are different surfaces and must never be mixed. See `apps/web/docs/PUBLIC_PROFILE_ROUTING.md`.

## Owner Portal routes (localStorage demo login via `/login`)

| Route | Purpose |
| --- | --- |
| `/login` | Owner login (demo/local session) |
| `/dashboard` | Owner dashboard |
| `/pets` | Pet overview list |
| `/pets/new` | Create pet |
| `/pets/{petId}` | Tabbed pet management hub |
| `/pets/{petId}/edit` | Tabbed edit form |
| `/pets/{petId}/records` | Care records |
| `/pets/{petId}/moments` | Memories (moments) |
| `/pets/{petId}/moments/new` | Add moment |
| `/pets/{petId}/timeline` | Life timeline |
| `/pets/{petId}/qr` | Owner QR Safety management page |
| `/pets/{petId}/tags` | Pet smart tags |
| `/pets/{petId}/tags/order` | Order a tag (query: `type`, `replacementFor`) |
| `/moments`, `/records` | Cross-pet views |
| `/tags` | All tags |
| `/orders` | Order list |
| `/orders/view?order={orderNumber}` | Order detail (query-string based so runtime-created orders work under static export) |
| `/settings` | Owner settings |

Owner routes always use the `petId`, never the slug.

## Admin Portal routes (localStorage demo login via `/admin/login`)

| Route | Purpose |
| --- | --- |
| `/admin/login` | Admin access entry |
| `/admin` | Operations dashboard: summary counts, quick actions, recent activity |
| `/admin/orders` | Order review and status management (query: `order` opens a specific order) |
| `/admin/payment-proofs` | Manual payment proof review queue |
| `/admin/tags` | Physical smart tag management |
| `/admin/tag-inventory` | Retail/unclaimed tag stock and tag code generation |
| `/admin/users` | Owner accounts overview |
| `/admin/pets` | Pet profiles overview with lifecycle/Lost Mode status |
| `/admin/settings` | Operations settings overview (read-only in this phase) |
| `/admin/qr-profiles` | QR profile status list (earlier admin page, kept) |
| `/admin/plans` | Plan catalogue view (earlier admin page, kept) |

## Static export rules

Every dynamic route (`[param]`) exports `dynamicParams = false` and `generateStaticParams()` sourced from `apps/web/src/data/staticRouteParams.ts`. Runtime data (localStorage) is re-fetched on mount by client components; "not found" for runtime-only params is a rendered client state, not `notFound()`. Admin routes are all static (no dynamic params) — detail views use query strings, matching the `/orders/view` pattern.
