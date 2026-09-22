# MyPetLink Owner Portal Flow

> Read [`AI_AGENT_REFERENCE.md`](./AI_AGENT_REFERENCE.md) first. This document
> describes the **signed-in owner portal** only. Public scan/share routes are in
> [`PUBLIC_PROFILE_ROUTING.md`](./PUBLIC_PROFILE_ROUTING.md), and the concepts
> and their canonical names are in
> [`product-model.md`](../../../docs/architecture/product-model.md).
>
> One naming note while reading this file. The page at `/p/{slug}-{publicCode}`
> is the **Share Profile**, and the portal names it that way throughout. The
> owner portal is one half of the product — the **Community** half (`/feed`,
> `/explore`, `/u/{handle}`, `/community/profile`) shares the same shell and is
> described in `product-model.md`; `src/lib/appMode.ts` decides which half a
> route belongs to.

---

## 1. Shell and authentication

Every owner page renders inside **`AppLayout`**
(`src/components/layouts/AppLayout.tsx`), which:

- Wraps children in **`AuthGuard`**, so all portal pages require a signed-in
  owner (mock auth via `src/services/authService.ts`, `localStorage` key
  `mypetlink_mock_owner`).
- Renders the desktop sidebar nav and, on mobile, the `MobileBottomNav`.
- Provides the route-aware header action and logout.

Header create actions are resolved centrally by
`src/lib/ownerHeaderActions.ts` and rendered by
`src/components/portal/OwnerHeaderActions.tsx`:

| Owner context | Header action |
| ------------- | ------------- |
| Dashboard with pets | **Add** menu: Add Pet, Add Care Record, Add Moment |
| Populated pet list | **Add Pet** |
| Populated Moments section or tab | **Add Moment** for the current pet |
| Populated Care Records section or tab | **Add Record** for the current pet |
| Tags, orders, settings, edit/detail flows | No generic create action |

A true empty state keeps one explanatory content CTA instead of duplicating it
in the header. The Dashboard Add menu is an anchored desktop popover and a
mobile action sheet; its panel and backdrop are portalled together so sticky
headers, backdrop filters, and sidebar overflow cannot clip or mis-layer it.

If you add a portal page, render it inside `AppLayout` so it inherits auth and
navigation. Public pages (scan, share, marketing) must **not** use `AppLayout`.

### Sign-in continuation

`AuthGuard` sends unauthenticated users to `/login?redirect={local path}` and
preserves the current query string and fragment where applicable. `LoginPanel`
honors that destination only after `src/lib/authRedirect.ts` validates and
normalizes it as a local URL. External, protocol-relative, encoded-backslash,
control-character, and login-loop destinations fall back to the dashboard.

Static hosting resolves runtime API pet ids through `RuntimeRouteFallback`.
That fallback must confirm the owner session before loading the pet or any
related owner data. A failed refresh/401 returns to login; only an authenticated
403/404 becomes the privacy-preserving **Pet not found** state. Temporary
connection/server failures remain retryable and must never become not found.

---

## 2. Navigation map

The sidebar (`AppLayout`) and `MobileBottomNav` use the shared
`ownerNavItems` config and active-route matcher in
`src/lib/ownerNavigation.ts`. They use the **generic, pet-agnostic** section
routes and must never point at a specific pet id.

| Nav item   | Route        | Notes                                            |
| ---------- | ------------ | ------------------------------------------------ |
| Dashboard  | `/dashboard` | Overview + quick actions                         |
| My Pets    | `/pets`      | Pet list; `/pets/new` to add                     |
| Records    | `/records`   | General landing; multiple pets require an explicit choice |
| Moments    | `/moments`   | General landing; multiple pets require an explicit choice |
| Smart Tags | `/tags`      | All tags across pets                             |
| Orders     | `/orders`    | Tag order history and payment status             |
| Settings   | `/settings`  | Account/profile settings                         |

`getActiveOwnerNavItemId` treats the per-pet routes as belonging to their
section - e.g. `/pets/{id}/records` highlights **Records**,
`/pets/{id}/moments` and `/pets/{id}/moments/new` highlight **Moments**.

On mobile, the current release renders **Home / Pets / Moments / More**.
Care Records and Owner Settings remain in the **More** bottom sheet. Smart
Tags and tag Orders return to this same shared navigation when their build-time
availability flags are enabled; their direct routes remain compatible while
the entry points are hidden. If the active route belongs to a More item, the
**More** button shows the active state.

---

## 3. Pet list vs. pet management page

`/pets` is an **overview list only**. Each pet renders a `PetCard`
(`src/components/portal/PetCard.tsx`) that shows summary info (avatar, name,
species/breed/age, QR/profile status, smart tag status, a short emergency-note
preview) and exactly three controls: a primary **Manage** button
(`ownerRoutes.petProfile`), a secondary **Share Profile** button, and a
**More** menu (Edit, Records, Moments, Smart Tags, Order Tag). Do **not** add a
grid of equal action buttons back onto the card.

The **Share Profile** button (and any owner-facing Share Profile link) must use
`pet.publicProfilePath` / `publicProfilePath(slug, publicCode)` â†’
`/p/{petSlug}-{publicCode}`. The slug-only `/p/{petSlug}` form is **deprecated**;
never display or copy it. See `PUBLIC_PROFILE_ROUTING.md`.

`/pets/{petId}` (`src/app/pets/[id]/page.tsx`) is the **main management page**
for a single pet. The server page loads the pet, records, moments, and tags,
then renders a pet header (photo, name, species/breed/age, QR + smart tag
status) plus **`PetManagementTabs`** (client) with five tabs:

| Tab        | Content                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| Overview   | **Sharing & Privacy** (Share Profile, Safety Profile, Community), smart tag status, emergency note, recent records, recent moments |
| Records    | `RecordsManager` for this pet                                            |
| Moments    | `PetMomentsManager` (memories + life timeline)                           |
| Smart Tag  | `TagManagementPanel` scoped to this pet (TagCode, status, view/disable/report tag lost/archive/restore/order replacement) |
| Settings   | Links to edit profile, privacy, public profile theme, contact preferences |

Tabs are in-page client state (static export has no server). The per-pet
sub-routes below still exist for deep links, the `MobileBottomNav`, and the
`PetSwitcher`; the tabs reuse the **same** manager components, so behaviour stays
consistent. Records, Moments, and Smart Tag are reached **through this hub** (its
tabs) or via the deep routes that render the same manager components â€” never as
disconnected standalone dashboards.

Pet-level **Lost Mode** uses the same shared control on the pet management
Overview tab and in **Edit Pet -> Contact & Safety**. Owners can mark the pet as
lost or found directly from either place; both update the same saved pet state
and immediately refresh their local view. Do not use `tag.status === "Lost"` to
mark the pet as missing; that status means a physical tag has been deactivated.

The pet hub and edit form use the shared responsive `SegmentedTabs` component.
It measures the available tab row width and keeps the row to one line by moving
overflow tabs into a **More** menu; do not replace this with horizontal scrolling
or fixed mobile-only tab limits.

### Sharing & Privacy is a summary, not a second set of switches

The Overview tab opens with one **Sharing & Privacy** card that answers the
same three questions for each audience a pet can have:

| Row             | Audience                                              | Where it is changed                      |
| --------------- | ----------------------------------------------------- | ---------------------------------------- |
| Share Profile   | anyone the owner sends the link to                     | Edit Pet -> **Share Profile**            |
| Safety Profile  | whoever finds the pet and scans a tag or opens a link  | Edit Pet -> **Contact & Safety**         |
| Community       | people who visit the Community Profile, plus browsers when both the pet and the household are discoverable | **Community -> Edit Profile** |

Every row shows a status, a plain-language "Seen by" line, and a **Manage**
link out to the one screen that owns the setting. **Nothing in the card is
editable.** Each of these settings has exactly one authoritative control, and
duplicating a switch here would let an owner change the same thing in two
places and disagree with themselves about which one won.

Two rules the card must keep:

- **No link to a page nobody can open.** When the Share Profile is off, the
  View link disappears. When the Safety Profile is off, the QR button, the View
  link and the finder-facing general area all disappear too - handing out a QR
  code for a page that shows a finder nothing is worse than showing no QR.
- **Silence when the answer is unknown.** The Community row is derived from two
  authenticated reads. When Community is switched off for the build, the owner
  is offline, or either read fails, the row is not rendered at all. It never
  guesses "Not in Community", because an owner who is in Community would then
  be told the opposite.

The Community status itself lives in `src/lib/communityParticipation.ts`
(`derivePetCommunityStatus`) and is read through
`src/components/portal/usePetCommunityStatus.ts`. Discoverability needs **both**
the pet's switch and the household's, which is why a pet-level
`isDiscoverable` alone is never described as discoverable. See
`docs/architecture/product-model.md`.

### Edit page is also tabbed

`/pets/{petId}/edit` (`PetProfileForm`) is a **focused, tabbed edit form**, not a
dashboard. Its tabs are **Basic Info | Photos | Theme | Share Profile | Contact
& Safety**, and the two public surfaces are deliberately split:

| Edit tab          | Configures                                                          |
| ----------------- | ------------------------------------------------------------------ |
| Basic Info        | name, species, breed, gender, color, exact birthday/estimated birth year/unknown age, description, personality, favourites |
| Photos            | profile + cover photo, live preview                                |
| Theme             | `profileTheme` (applies to **both** the public share profile and the Safety Profile) |
| Share Profile     | slug, adoption day, share-page visibility flags, **Share Profile URL** (`/p/{slug}-{publicCode}`) + View Share Profile |
| Contact & Safety  | owner display name, WhatsApp/phone, general area, safety + emergency notes, finder visibility flags, **Safety Profile link** (`/q/{safetyCode}`) + View Safety Profile |

The edit form does **not** embed Records / Moments / Smart Tag managers â€” only
small text links back to those hub routes. On submit, a validation error focuses
the tab that contains the first invalid field.

> **Phone, WhatsApp, and call numbers** on **Contact & Safety** (and on
> `/settings`, and the tag-order **Delivery Details** step) use the shared
> `PhoneNumberInput` (country-code selector defaulting to Malaysia `+60`) and
> are stored as E.164 strings. Never add a plain phone text input. See
> `AI_AGENT_REFERENCE.md` Â§9.

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

> **Legacy QR route:** `/pets/{id}/qr` is kept only as a compatibility redirect
> to `/pets/{id}`. Do not link to it as a management page. The pet overview owns
> the compact Share Profile, Safety Profile, and Physical Smart Tag
> Copy/View/Show QR actions. Safety/contact/privacy settings live in
> `Edit Pet -> Contact & Safety`; physical tag management lives in the hub
> **Smart Tag** tab and `/tags`.

These are static-export dynamic routes: each exports `dynamicParams = false` and
`generateStaticParams()` from `staticPetIdParams()`. A pet created at runtime
(in `localStorage`) is reflected through client re-fetching, not new static
routes.

`ownerRoutes.petTagOrder(petId, { replacementFor? })` builds the order URL with
an optional `replacementFor={tagId}` query string â€” use it instead of
hand-writing the query. Product selection is catalog-driven; there is no
QR-only product query parameter.

---

## 4. Pet switching (Moments & Records)

Both sections are **pet-aware**. The pattern:

- **Generic route** (`/records`, `/moments`): `GenericPetSection` loads the pet
  list. A single pet opens immediately; when multiple pets exist, the owner
  chooses one before any pet-specific content is fetched. If there are no pets
  it shows an `EmptyState` linking to `ownerRoutes.petNew`.
- **Specific route** (`/pets/{id}/records`, `/pets/{id}/moments`): the server
  page loads that pet and renders the section for it.
- Both render a **`PetSwitcher`** at the top. It self-fetches the live pet list,
  renders one pill per pet, and navigates between the per-pet routes
  (`ownerRoutes.petMoments` / `ownerRoutes.petRecords`). It returns `null` when
  the owner has one pet or fewer (nothing to switch).

The section managers (`RecordsManager`, `PetMomentsManager`) re-fetch their data
whenever the active `petId` changes, so switching pets updates the title, stats,
cards, and timeline. Never special-case a named pet or silently select one of
several pets.

When adding a new pet-aware section, follow this shape: generic landing,
explicit choice when needed, specific route for that pet, `PetSwitcher` on top,
and manager re-fetches on `petId` change.

---

## 5. Tags & orders in the portal

- **`/tags`** lists tags across the owner's pets via `TagManagementPanel`.
  Each card shows the **TagCode prominently** (labelled `TAG CODE`), the linked
  pet, product name (`QR` vs `QR + NFC`, derived from `hasNfc`), shape, and
  status. The default view focuses current tags (`Active`, `Pending`,
  `Preparing`, `Delivered`) and hides archived tags. Filter tabs expose
  **Active**, **Pending**, **Lost / Disabled**, **Archived**, and **All**.
  Actions depend on status: unassigned or assigned-but-not-active tags offer
  **View Tag Scan Page**, **Copy Tag Link**, and **View Order** where applicable.
  Owner Portal pages do **not** show a direct **Activate Tag** button; owners
  activate only after scanning the physical tag's printed QR at `/q/{tagCode}`
  (legacy printed tags at `/t/{tagCode}` still work; NFC never offers
  first-time activation).
  Active tags can be disabled or marked **Report Tag Lost**; inactive tags offer
  **Request Replacement** and **Archive Tag**; archived tags offer **Restore to
  List** and **View Status**. "View Tag" / "View Status" (`tagPath`) is always
  available. The internal `id` is never shown. Reporting a tag lost affects only
  that physical tag; it does not enable pet Lost Mode.
- **`/orders`** lists `TagOrder` history using customer-facing order numbers
  from `formatOrderNumber(order)` (new backend orders use, for example,
  `MPL-ORD-260727123029-9916`), never the internal `id`. Confirmed orders also
  expose their persisted receipt reference. Orders carry `tagType` + `variant`
  (there is no `design` field).
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

`/dashboard` reuses its already-loaded pet collection for one consolidated
**Your pets** section. Each compact card has a dedicated management link plus
separate Share Profile Share, QR, and View actions when that profile is public;
private profiles show an Enable profile action instead. The dashboard never
duplicates the pet list and never silently selects the first pet.

General Quick actions use pet-agnostic routes for Care Records, Moments, and
Owner Settings. Pet management lives in the consolidated section's
**Manage pets** link, so it is not repeated in Quick actions. When there are no
pets, the dashboard renders one focused Add Pet empty state.
