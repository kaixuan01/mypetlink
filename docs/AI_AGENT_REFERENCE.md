# MyPetLink AI Agent Reference

**Before making changes, read this document first.**

This is the entry point for any AI agent (or developer) working on MyPetLink. It
explains the product structure, the non-negotiable rules, and where the detailed
guides live. The goal is that every future change follows the same route rules,
tag logic, owner pages, and public profile sharing — instead of each agent
inventing its own conventions.

If anything in the codebase contradicts this document, treat it as a bug to fix,
not a pattern to copy.

---

## 1. Read these in order

1. **This file** — product structure, rules, and the route map.
2. [`SMART_TAG_PRODUCT_STRATEGY.md`](./SMART_TAG_PRODUCT_STRATEGY.md) — the
   full product/business strategy for the physical Smart Tag (TagCode, QR/NFC,
   activation, admin batches, retail, packaging, security). This is the source
   of truth for *what* the tag product should be.
3. [`OWNER_PORTAL_FLOW.md`](./OWNER_PORTAL_FLOW.md) — how the signed-in owner
   portal is structured (dashboard, pets, records, moments, tags, orders) and
   how pet switching works.
4. [`PUBLIC_PROFILE_ROUTING.md`](./PUBLIC_PROFILE_ROUTING.md) — how the public
   `/t/{tagCode}`, `/activate/{tagCode}`, and `/p/{slug}-{publicCode}` routes
   resolve and what each state renders.

---

## 2. What MyPetLink is

A mobile-first web app that gives every pet a **safe public profile**. If a pet
is lost, a finder scans a QR code or taps an NFC tag, opens the pet's public
profile, and contacts the owner. Owners also manage care records, memories
(moments), smart tags, and orders from a private portal.

Core promise: **A safer way home for your pet.**

**Positioning:** MyPetLink is a pet **safety and care** profile — *not* a QR/NFC
gadget. The hero message is *"A safer profile for your pet."* A plain **QR tag
is the MVP / main product**; **QR + NFC is a premium upgrade**, never required.
Never over-emphasize NFC, and never imply finder contact costs money (it's free
on the Free plan). The public marketing pages (Home, Pricing, Privacy) are
separate from the public/finder app pages — keep them warm and calm. The Home
page has a **fixed nine-section order** and features grouped into **three pillars
(Safety / Care / Memories)**. See `MARKETING_STRATEGY.md` §7–§13 for the full
home section order, pricing strategy, privacy messaging, and copy rules.

---

## 3. Tech stack and the one rule that changes everything

- **Next.js (App Router) with `output: "export"`** — see `next.config.ts`. The
  app builds to a **fully static site**. There is **no server at runtime**.
- **`images.unoptimized: true`** because there is no image optimization server.
- All data lives in a **mock service layer** (`src/services/*`) backed by
  **`localStorage`** (`src/services/mockApi.ts`). On the server/at build time
  `readStoredCollection` returns the seed data; in the browser it returns the
  user's persisted data.

> **AGENTS.md warns: this is NOT the Next.js you know.** Read the relevant guide
> in `node_modules/next/dist/docs/` before using an API you are unsure about.

### Consequences you must respect

1. **Every dynamic route must be statically generated.** Each `[param]` route
   exports:
   - `export const dynamicParams = false;`
   - `export function generateStaticParams()` returning the known params.
   The param sources are centralized in `src/data/staticRouteParams.ts`
   (`staticPetIdParams`, `staticPublicPetParams`, `staticTagCodeParams`).
2. **Runtime behavior is client-side.** A server page computes *initial* data
   from the seed at build time and passes it to a client view component that
   **re-fetches from `localStorage` on mount**. Follow this pattern for any page
   whose data can change at runtime (see `TagFinderView`, `TagActivationFlow`,
   `PetSwitcher`, `RecordsManager`).
3. **"Not found" cannot rely on the server.** A param that was not pre-rendered
   404s at the static host. Where runtime data may diverge from the seed (e.g. a
   tag code that only exists in `localStorage`), resolve the missing/invalid
   case **as a rendered state in the client component**, not via `notFound()`.
   The `/t/{tagCode}` finder does this with the `not-found` state.

---

## 4. Route map — the single source of truth

All routes are defined in **`src/lib/routes.ts`**. **Do not hardcode route
strings in pages or components.** Import the helpers instead.

| Purpose            | Pattern                       | Helper                                   |
| ------------------ | ----------------------------- | ---------------------------------------- |
| Owner portal pages | `/pets/{petId}/...`           | `ownerRoutes.*`                          |
| Physical tag scan  | `/t/{tagCode}`                | `tagPath(tagCode)` / `getTagScanPath(tag)` |
| Tag activation     | `/activate/{tagCode}`         | `activatePath(tagCode)`                  |
| Public share       | `/p/{petSlug}-{publicCode}`   | `publicProfilePath(slug, publicCode)` / `getPublicProfilePath(pet)` |

`getPublicProfilePath(pet)` and `getTagScanPath(tag)` are convenience wrappers
that take the whole object — prefer them when you already have a `Pet` / `PetTag`
in hand. Pets also carry pre-built `pet.publicProfilePath` and
`pet.finderProfileUrl` fields (kept in sync by `petService`), which existing UI
reads directly.

Key rules baked into these helpers:

- **Owner routes always use the `petId`**, never the slug.
- **Public share routes are looked up by `publicCode`** (the final segment),
  never the slug. The slug is cosmetic. Parse with `parsePublicProfileParam`
  (it splits on the **last** `-` because slugs can contain hyphens).
- **`samplePet`** (exported from `routes.ts`, = `mockPets[0]`) is the only
  approved source for demo/marketing links. Never hardcode a specific pet id,
  slug, or tag code (e.g. `pet_milo`, `/p/milo`, `/t/8KX29A`) in a page or
  component. Seed values may only live in `src/data/*`.

---

## 5. The TagCode — one public identifier

There is exactly **one** public identifier per physical tag: the **TagCode**.

- Format: `MPL-XXXX-XXXX` (e.g. `MPL-26A7-K9Q2`).
- Charset: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — **no `O 0 I 1`**.
- Random, **not sequential**. Generated by `generateTagCode()` in
  `src/lib/tagCodes.ts`.
- The **same** TagCode is used for: printed tag text, QR URL, NFC URL, owner
  display, admin search, support lookup, and manufacturer CSV.

**Never** introduce a separate `publicToken`, `displayCode`, or any hidden
token. **Never** expose the internal database `id` in a URL or in owner-facing
UI. Owner UI shows the TagCode prominently labelled `TAG CODE`.

The public profile share link uses a separate stable **`publicCode`** (lowercase
4 chars, `generatePublicCode()`) — this is the pet's public key, distinct from
the tag's TagCode. See `PUBLIC_PROFILE_ROUTING.md`.

---

## 6. Tag status model

`TagStatus` (in `src/types.ts`) currently has **8 values**:

```
Unassigned | Pending | Preparing | Delivered | Active | Disabled | Lost | Replaced
```

The strategy doc (§8) lists 5 *logical* tag states: `Unassigned, Active,
Disabled, Lost, Replaced`. This frontend prototype adds **`Pending`,
`Preparing`, `Delivered`** because there is no separate orders backend — the
order-fulfillment lifecycle is folded into the tag record. When a real backend
exists, fulfillment status should move to the order/batch model and `TagStatus`
should collapse back to the 5 logical states.

How status maps to what a scan shows (`getFinderState` in `tagService.ts`):

| Condition                                          | Finder state  | Renders                          |
| -------------------------------------------------- | ------------- | -------------------------------- |
| No tag with that code                              | `not-found`   | Branded "Tag not found"          |
| `status === "Unassigned"` **or** no `petId`        | `unassigned`  | Activation prompt                |
| `status` in `Disabled / Lost / Replaced`           | `inactive`    | Safe "not active" message        |
| Bound pet missing                                  | `inactive`    | Safe "not active" message        |
| Otherwise (has `petId`, not disabled)              | `active`      | Public pet profile               |

Note: owner-ordered tags are created with a `petId` already set (status
`Pending`), so they resolve to `active` once data exists. Retail stock has no
`petId` (status `Unassigned`) and goes through the activation flow.

---

## 7. Hard rules for any change

1. **Keep the visual style.** Reuse existing UI primitives
   (`CTAButton`, `Badge`, `PageHeader`, `EmptyState`, `PetAvatar`, `Icon`,
   `StatCard`) and the `brand-*` / `pet-*` Tailwind tokens. Do not introduce a
   new design language.
2. **Mobile-first.** Large tap targets, single-action screens, works on a phone
   held by a stranger who found a pet.
3. **No hardcoded pet/tag identifiers** outside `src/data/*`. Use `routes.ts`
   helpers and `samplePet`.
4. **Centralize data and routes.** Mock data in `src/data/*`, route strings in
   `src/lib/routes.ts`, tag/profile logic in `src/services/*`.
5. **Respect static export** (§3). New dynamic routes need
   `dynamicParams = false` + `generateStaticParams()` + a client re-fetch.
6. **Privacy by default.** Public pages must never expose internal IDs, owner
   address, email, or full phone unless the owner explicitly enabled it. See the
   `visibility` flags on `Pet` and `toPublicProfile`.
7. **Don't break existing pages.** Run `npm run build` before considering a task
   done; a static-export build fails on any unrendered dynamic param or type
   error.
8. **Keep owner portal and public pages distinct.** The owner portal is for
   *management* (`/pets` is an overview list; `/pets/{petId}` is the tabbed
   management hub; `/pets/{petId}/edit` is the tabbed edit form — see
   `OWNER_PORTAL_FLOW.md` §3). Public pages are never an owner dashboard.
9. **The two public pages are DIFFERENT — never mix them.**
   - **`/p/{petSlug}-{publicCode}` = Public Share Profile.** Friendly, IG-style,
     shareable. Primary action is *Share*. Tabs: About / Moments / Timeline. No
     emergency CTAs, no "I found this pet", no "Send Found Location", no safety-
     page wording — except the **Lost Mode** banner when a bound tag is `Lost`.
   - **`/t/{tagCode}` = QR/NFC Safety Profile.** Finder-first and emergency-
     focused (the page a stranger sees after scanning the physical tag). Big
     "I found this pet - Contact Owner", WhatsApp / Call / Send Found Location,
     emergency + safety notes. Minimal lifestyle content.
   See `PUBLIC_PROFILE_ROUTING.md` §2 (safety page) and §4 (share page). A past
   change wrongly made the share page finder-first; do not reintroduce that.
10. **No owner-portal QR Safety page.** There is no `/pets/{id}/qr` route and no
    `ownerRoutes.petQr`. The QR/NFC safety profile *is* the public `/t/{tagCode}`
    page. QR safety **settings** live in `Edit Pet → Contact & Safety`; tag
    **management** lives in the hub **Smart Tag** tab. The owner portal only
    **previews** the safety page.
11. **Public previews open in a new tab.** Every owner-portal button that opens a
    public route — "View / Preview Public Profile" (`/p/{slug}-{publicCode}`),
    "View / Preview QR Safety Page" (`/t/{tagCode}`), "View Tag" — must use
    `target="_blank"` + `rel="noopener noreferrer"` so the portal stays open in
    the original tab. `CTAButton` forwards `target`/`rel` to both internal `Link`
    and external `<a>`. When the logged-in owner views their own `/p/` page, a
    small "Viewing as public" bar (Copy Link + Back to Edit) is shown; normal
    visitors only get a compact Share button (no raw URL box).

---

## 8. Where things live

| Area                         | Location                                      |
| ---------------------------- | --------------------------------------------- |
| Route map & helpers          | `src/lib/routes.ts`                           |
| TagCode / publicCode helpers | `src/lib/tagCodes.ts`                         |
| Types (Pet, PetTag, etc.)    | `src/types.ts`                                |
| Static param sources         | `src/data/staticRouteParams.ts`               |
| Seed/mock data               | `src/data/*`                                  |
| Mock persistence layer       | `src/services/mockApi.ts`                     |
| Pet / profile logic          | `src/services/petService.ts`                  |
| Tag / finder / activation    | `src/services/tagService.ts`                  |
| Mock auth                    | `src/services/authService.ts`                 |
| Owner portal shell           | `src/components/layouts/AppLayout.tsx`        |
| Pet list card (overview)     | `src/components/portal/PetCard.tsx`           |
| Pet management tabs          | `src/components/portal/PetManagementTabs.tsx` |
| Public tag finder            | `src/app/t/[tagCode]/` + `TagFinderView`      |
| Activation flow              | `src/app/activate/[tagCode]/` + `TagActivationFlow` |
| Public share profile         | `src/app/p/[slug]/` + `PublicSharePetProfile` |
