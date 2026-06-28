# MyPetLink Owner Portal Flow

> Read [`AI_AGENT_REFERENCE.md`](./AI_AGENT_REFERENCE.md) first. This document
> describes the **signed-in owner portal** only. Public scan/share routes are in
> [`PUBLIC_PROFILE_ROUTING.md`](./PUBLIC_PROFILE_ROUTING.md).

---

## 1. Shell and authentication

Every owner page renders inside **`AppLayout`**
(`src/components/layouts/AppLayout.tsx`), which:

- Wraps children in **`AuthGuard`**, so all portal pages require a signed-in
  owner (mock auth via `src/services/authService.ts`, `localStorage` key
  `mypetlink_mock_owner`).
- Renders the desktop sidebar nav and, on mobile, the `MobileBottomNav`.
- Provides the "Add Pet" CTA and logout.

If you add a portal page, render it inside `AppLayout` so it inherits auth and
navigation. Public pages (scan, share, marketing) must **not** use `AppLayout`.

### Sign-in continuation

`AuthGuard` sends unauthenticated users to `/login?next={path}`. `LoginPanel`
honors a `next` query param (guarded with `next.startsWith("/")` to prevent
open redirects) and returns the user to where they were headed — this is what
lets the activation flow resume after sign-in. Do not bypass this.

---

## 2. Navigation map

The sidebar (`AppLayout`) and `MobileBottomNav` use the **generic, pet-agnostic**
section routes. They must never point at a specific pet id.

| Nav item   | Route        | Notes                                            |
| ---------- | ------------ | ------------------------------------------------ |
| Dashboard  | `/dashboard` | Overview + quick actions                         |
| My Pets    | `/pets`      | Pet list; `/pets/new` to add                     |
| Records    | `/records`   | Generic landing → first pet, then pet switcher   |
| Moments    | `/moments`   | Generic landing → first pet, then pet switcher   |
| Smart Tags | `/tags`      | All tags across pets                             |
| Orders     | `/orders`    | Tag order history and payment status             |
| Settings   | `/settings`  | Account/profile settings                         |

`isActiveNav` in `AppLayout` (and the matcher in `MobileBottomNav`) treats the
per-pet routes as belonging to their section — e.g. `/pets/{id}/records`
highlights **Records**, `/pets/{id}/moments` and `/pets/{id}/moments/new`
highlight **Moments**.

---

## 3. Pet list vs. pet management page

`/pets` is an **overview list only**. Each pet renders a `PetCard`
(`src/components/portal/PetCard.tsx`) that shows summary info (avatar, name,
species/breed/age, QR/profile status, smart tag status, a short emergency-note
preview) and exactly three controls: a primary **Manage** button
(`ownerRoutes.petProfile`), a secondary **Public Profile** button, and a
**More** menu (Edit, Records, Moments, Smart Tags, Order Tag). Do **not** add a
grid of equal action buttons back onto the card.

The **Public Profile** button (and any owner-facing public profile link) must use
`pet.publicProfilePath` / `publicProfilePath(slug, publicCode)` →
`/p/{petSlug}-{publicCode}`. The slug-only `/p/{petSlug}` form is **deprecated**;
never display or copy it. See `PUBLIC_PROFILE_ROUTING.md`.

`/pets/{petId}` (`src/app/pets/[id]/page.tsx`) is the **main management page**
for a single pet. The server page loads the pet, records, moments, and tags,
then renders a pet header (photo, name, species/breed/age, QR + smart tag
status) plus **`PetManagementTabs`** (client) with five tabs:

| Tab        | Content                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| Overview   | Public profile status + share link, smart tag status, emergency note, contact privacy summary, recent records, recent moments |
| Records    | `RecordsManager` for this pet                                            |
| Moments    | `PetMomentsManager` (memories + life timeline)                           |
| Smart Tag  | `TagManagementPanel` scoped to this pet (TagCode, status, view/disable/report lost/order replacement) |
| Settings   | Links to edit profile, privacy, public profile theme, contact preferences |

Tabs are in-page client state (static export has no server). The per-pet
sub-routes below still exist for deep links, the `MobileBottomNav`, and the
`PetSwitcher`; the tabs reuse the **same** manager components, so behaviour stays
consistent. Records, Moments, and Smart Tag are reached **through this hub** (its
tabs) or via the deep routes that render the same manager components — never as
disconnected standalone dashboards.

The pet hub and edit form use the shared responsive `SegmentedTabs` component.
It measures the available tab row width and keeps the row to one line by moving
overflow tabs into a **More** menu; do not replace this with horizontal scrolling
or fixed mobile-only tab limits.

### Edit page is also tabbed

`/pets/{petId}/edit` (`PetProfileForm`) is a **focused, tabbed edit form**, not a
dashboard. Its tabs are **Basic Info | Photos | Theme | Public Profile | Contact
& Safety**, and the two public surfaces are deliberately split:

| Edit tab          | Configures                                                          |
| ----------------- | ------------------------------------------------------------------ |
| Basic Info        | name, species, breed, gender, color, birthday/age, description, personality, favourites |
| Photos            | profile + cover photo, live preview                                |
| Theme             | `profileTheme` (applies to **both** the public share profile and the QR safety page) |
| Public Profile    | slug, adoption day, share-page visibility flags, **Public Profile URL** (`/p/{slug}-{publicCode}`) + View Public Profile |
| Contact & Safety  | owner display name, WhatsApp/phone, general area, safety + emergency notes, finder visibility flags, **QR Safety Page URL** (`/t/{tagCode}`) + View QR Safety Page |

The edit form does **not** embed Records / Moments / Smart Tag managers — only
small text links back to those hub routes. On submit, a validation error focuses
the tab that contains the first invalid field.

> **Phone, WhatsApp, and call numbers** on **Contact & Safety** (and on
> `/settings`, and the tag-order **Delivery Details** step) use the shared
> `PhoneNumberInput` (country-code selector defaulting to Malaysia `+60`) and
> are stored as E.164 strings. Never add a plain phone text input. See
> `AI_AGENT_REFERENCE.md` §9.

All owner pet pages key off the **`petId`** (`ownerRoutes.*` helpers):

| Page          | Route                          | Helper                      |
| ------------- | ------------------------------ | --------------------------- |
| Profile       | `/pets/{id}`                   | `ownerRoutes.petProfile`    |
| Edit          | `/pets/{id}/edit`              | `ownerRoutes.petEdit`       |
| Records       | `/pets/{id}/records`           | `ownerRoutes.petRecords`    |
| Moments       | `/pets/{id}/moments`           | `ownerRoutes.petMoments`    |
| New moment    | `/pets/{id}/moments/new`       | `ownerRoutes.petMomentNew`  |
| Timeline      | `/pets/{id}/timeline`          | `ownerRoutes.petTimeline`   |
| Tags          | `/pets/{id}/tags`              | `ownerRoutes.petTags`       |
| Order tag     | `/pets/{id}/tags/order`        | `ownerRoutes.petTagOrder`   |

> **There is no owner-portal QR Safety management page.** The QR/NFC safety
> profile is the public route `/t/{tagCode}` (`tagPath` / `pet.finderProfileUrl`).
> The owner portal only **previews** it. QR safety *settings* live in
> **Edit Pet → Contact & Safety**; tag *management* lives in the hub **Smart Tag**
> tab. Any "View / Preview QR Safety Page" or "View / Preview Public Profile"
> button opens its public route in a **new tab** (`target="_blank"`
> `rel="noopener noreferrer"`) so the portal stays open behind it.

These are static-export dynamic routes: each exports `dynamicParams = false` and
`generateStaticParams()` from `staticPetIdParams()`. A pet created at runtime
(in `localStorage`) is reflected through client re-fetching, not new static
routes.

`ownerRoutes.petTagOrder(petId, { type?, replacementFor? })` builds the order
URL with an optional `type=qr|nfc` and `replacementFor={tagId}` query string —
use it instead of hand-writing the query.

---

## 4. Pet switching (Moments & Records)

Both sections are **pet-aware**. The pattern:

- **Generic route** (`/records`, `/moments`): `GenericPetSection` loads the pet
  list, selects the **first pet**, fetches that pet's data, and renders the
  section. If there are no pets it shows an `EmptyState` linking to
  `ownerRoutes.petNew`.
- **Specific route** (`/pets/{id}/records`, `/pets/{id}/moments`): the server
  page loads that pet and renders the section for it.
- Both render a **`PetSwitcher`** at the top. It self-fetches the live pet list,
  renders one pill per pet, and navigates between the per-pet routes
  (`ownerRoutes.petMoments` / `ownerRoutes.petRecords`). It returns `null` when
  the owner has one pet or fewer (nothing to switch).

The section managers (`RecordsManager`, `PetMomentsManager`) re-fetch their data
whenever the active `petId` changes, so switching pets updates the title, stats,
cards, and timeline. **There is no hardcoded "first pet" logic beyond
`pets[0]`** — never special-case a named pet.

When adding a new pet-aware section, follow this exact shape: generic landing →
first pet, specific route → that pet, `PetSwitcher` on top, manager re-fetches on
`petId` change.

---

## 5. Tags & orders in the portal

- **`/tags`** lists every tag across the owner's pets via `TagManagementPanel`.
  Each card shows the **TagCode prominently** (labelled `TAG CODE`), the linked
  pet, product name (`QR` vs `QR + NFC`, derived from `hasNfc`), shape, and
  status. Actions depend on status: an `Unassigned` tag offers **Activate Tag**
  (`activatePath`); an active tag offers **Request Replacement** / **Disable** /
  **Report Lost**. "View Tag" (`tagPath`) is always available. The internal `id`
  is never shown.
- **`/orders`** lists `TagOrder` history using customer-facing order numbers
  from `formatOrderNumber(order)` (for example `MPL-ORD-2026-0001`), never the
  internal `id`. Orders carry `tagType` + `shape` (there is no `design` field).
  `/orders/{orderNumber}` shows the static order detail page for seeded orders.
  Replacement links use `ownerRoutes.petTagOrder(petId, { type,
  replacementFor })`.

Ordering a tag (`createTagOrder`) creates the `PetTag` already bound to the pet
with status `Pending`, plus a `TagOrder` with status `Pending Payment`. After
the owner submits a Manual QR Payment reference or proof, the order moves to
`Payment Submitted` for manual verification. The owner-facing receipt only
appears once the order is `Payment Confirmed`, `Preparing`, `Shipped`, or
`Delivered`. A replacement order marks the old tag `Replaced`.

---

## 6. Dashboard

`/dashboard` is a server page that derives everything from `firstPet = pets[0]`
and guards every quick-action link: when there are no pets, links fall back to
`ownerRoutes.petNew` / `ownerRoutes.pets` instead of pointing at a missing pet.
Reuse this guarded pattern for any new dashboard shortcut — do not assume a pet
exists and never hardcode a pet id.
