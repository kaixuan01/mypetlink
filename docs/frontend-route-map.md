# MyPetLink Frontend Route Map

All routes live in the Next.js app at `apps/web` (App Router, static export in production builds). Route strings are centralized in `apps/web/src/lib/routes.ts` — pages and components must use the helpers, never hardcoded strings.

What each surface *is*, who it is for, and how they depend on one another is defined in [`architecture/product-model.md`](architecture/product-model.md). This file is the inventory; that one is the meaning.

## Public routes (no login)

| Route | Purpose |
| --- | --- |
| `/` | Marketing landing page |
| `/pet-profile` | Product page — what a Pet Profile includes |
| `/safety-profile` | Product page — the finder-facing Safety Profile |
| `/smart-pet-tags` | Product page — the QR + NFC Smart Tag |
| `/how-it-works` | Product page — the end-to-end story |
| `/pricing` | Free Profile, Smart Tag add-on, Premium Coming Soon, GPS Safety Coming Later |
| `/where-to-buy` | Buying guide. Promoted only when `publicCommerceAvailability.showWhereToBuy` |
| `/sample` | Sample Share Profile and Safety Profile experiences |
| `/privacy` | Privacy Notice |
| `/terms` | Terms of Use |
| `/login` | Owner sign-in (email/password or Google) |
| `/p/{petSlug}-{publicCode}` | **Share Profile** — the page an owner shares. Resolved by `publicCode`, the segment after the last `-` |
| `/q/{safetyCode}` | **Safety Profile** — finder-first, belongs to the pet, works without any physical tag |
| `/q/{tagCode}` | Smart Tag QR entry. The shared resolver tries a pet Safety Profile first, then a tag; eligible unactivated tags enter the authenticated activation flow |
| `/n/{tagCode}` | Smart Tag NFC entry. Active tags show the same Safety Profile; unactivated tags show QR-first setup instructions and never offer activation |
| `/t/{tagCode}` | Legacy printed-tag entry, retained for already-issued tags |
| `/activate/{tagCode}` | Compatibility redirect to `/q/{tagCode}` |

Key rule: the Share Profile (`/p/`) and the Safety Profile (`/q/`) are different surfaces and must never be mixed. See `apps/web/docs/PUBLIC_PROFILE_ROUTING.md`.

## Community routes

Public unless marked. Every **entry point** to these is gated by `socialEnabled`; the routes themselves resolve in both flag states so a saved link keeps working.

| Route | Purpose |
| --- | --- |
| `/explore` | Community discovery — suggested pets and latest Moments |
| `/search` | Search households and pets |
| `/u/{handle}` | **Community Profile** — a household's public identity |
| `/u/{handle}/followers`, `/u/{handle}/following` | Connections |
| `/moments/{momentId}` | One public Moment on its own page |
| `/feed` | **Signed in.** The following feed. Titled "Home" |
| `/notifications` | **Signed in.** Activity |
| `/community/profile` | **Signed in.** The owner's own Community profile |
| `/community/profile/edit` | **Signed in.** Handle, display name, photo, social switches, per-pet participation |

`/moments` (the owner's cross-pet Moments manager, below) and `/moments/{momentId}` (a public Community page) are different surfaces. `apps/web/src/lib/appMode.ts` is the single place that decides which half of the product a route belongs to.

## Owner Portal routes (signed in)

| Route | Purpose |
| --- | --- |
| `/dashboard` | Owner dashboard |
| `/pets` | Pet overview list |
| `/pets/new` | Create pet |
| `/pets/{petId}` | Tabbed pet management hub |
| `/pets/{petId}/edit` | Tabbed edit form (`?tab=basic\|appearance\|public\|contact`) |
| `/pets/{petId}/records` | Care records |
| `/pets/{petId}/moments` | Moments |
| `/pets/{petId}/moments/new` | Add a Moment (compatibility route; new entry points open the editor over `/moments`) |
| `/pets/{petId}/timeline` | Life timeline |
| `/pets/{petId}/qr` | Legacy compatibility redirect to `/pets/{petId}` |
| `/pets/{petId}/tags` | Pet Smart Tags |
| `/pets/{petId}/tags/order` | Order a tag (query: `petId`, `replacementFor`) |
| `/moments`, `/records` | Cross-pet views |
| `/tags` | All Smart Tags |
| `/orders` | Order list |
| `/orders/view?order={orderNumber}` | Order detail (query-string based so runtime-created orders work under static export) |
| `/settings` | Owner settings |

Owner routes always use the `petId`, never the slug.

Navigation for `/tags` and `/orders` is gated by `smartTagsEnabled` / `tagOrdersEnabled`; the routes stay reachable.

## Admin Portal routes (`/admin/login`)

Authorization is capability-based — see [`architecture/admin-access-management.md`](architecture/admin-access-management.md).

| Route | Purpose |
| --- | --- |
| `/admin/login` | Admin access entry |
| `/admin` | Operations dashboard: summary counts, quick actions, recent activity |
| `/admin/orders` | Order review and status management (query: `order` opens a specific order) |
| `/admin/payment-proofs` | Manual payment proof review queue |
| `/admin/tags` | Physical Smart Tag management |
| `/admin/tag-inventory` | Retail/unclaimed tag stock and tag code generation |
| `/admin/tag-products` | Tag catalogue |
| `/admin/users` | Owner accounts overview |
| `/admin/pets` | Pet profiles overview with lifecycle/Lost Mode status |
| `/admin/plans` | Plan catalogue and owner plan assignments |
| `/admin/merchant-sales` | Merchant sales workspace |
| `/admin/business-identity` | Business identity used on documents |
| `/admin/delivery-rates` | Delivery rate configuration |
| `/admin/shipping-fulfilment` | Shipping and fulfilment settings |
| `/admin/order-checkout` | Order checkout settings |
| `/admin/sample-experience` | Featured sample pet configuration |
| `/admin/email-templates` | Transactional email templates |
| `/admin/operational-status` | Read-only operational status |
| `/admin/access/users` | Access Management — who can use the Admin Portal, and the roles they hold |
| `/admin/access/roles` | Access Management — roles and the permissions each one grants |
| `/admin/access/activity` | Access Management — a record of who changed what, and when |
| `/admin/qr-profiles` | Legacy redirect to `/admin/pets`; nothing links to it |

## Static export rules

Every dynamic route (`[param]`) exports `dynamicParams = false` and `generateStaticParams()` sourced from `apps/web/src/data/staticRouteParams.ts`. Runtime data is re-fetched on mount by client components; "not found" for runtime-only params is a rendered client state, not `notFound()`. Admin routes are all static (no dynamic params) — detail views use query strings, matching the `/orders/view` pattern.

`/u/{handle}` and `/moments/{momentId}` export a single placeholder shell each. The Cloudflare Pages Functions in `apps/web/functions/` rewrite that shell's `<head>` per handle or Moment, so the exported params list only has to produce a page to serve — it is never the set of live profiles or Moments.
