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
status) plus **`PetManagementTabs`** (client) with three tabs, plus a fourth when
Smart Tags are switched on:

| Tab          | Content                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| Overview     | **Sharing & Privacy** (Share Profile, Safety Profile, Community), smart tag status, Lost Mode, emergency note, recent records, recent moments |
| Care Records | `RecordsManager` for this pet                                            |
| Moments      | `PetMomentsManager` (Moments + life timeline)                            |
| Smart Tag    | Only when `smartTagsEnabled`. `TagManagementPanel` scoped to this pet (TagCode, status, view/disable/report tag lost/archive/restore/order replacement) |

**There is no Settings tab, and adding one would be a mistake.** Every setting
the hub reports on is changed in exactly one place - Edit Pet -> Share Profile,
Edit Pet -> Contact & Safety, or Community -> Edit Profile - and the Overview
card links out to those. A Settings tab would become a second route to the same
switches, which is the duplication the next section exists to prevent.

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
- **Silence for a missing feature, honesty about missing data.** The Community
  row is derived from two authenticated reads. It is not rendered at all when
  Community is switched off for the build or there is no connection to ask, so
  a soft launch or a rollback shows nothing. When Community exists but a read
  fails, the row stays and reports *Status temporarily unavailable* with no
  audience line and no participation word. It never guesses "Not in Community",
  because an owner who is in Community would then be told the opposite - and it
  never vanishes on an error, because that would suggest the pet has no
  Community settings at all.

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
  Each compact card starts collapsed and shows the linked pet, **TagCode**,
  product (`QR` vs `QR + NFC`, derived from `hasNfc`), tag variant, status,
  last-scan information, and supported 30-day counts. The default filter is
  **Active**. Tabs retain **Pending**, **Inactive** (including lost, disabled,
  replaced, and tags on inactive pets), **Archived**, and **All**; the shared
  tab overflow menu preserves every filter on small screens.
  **Manage Tag & Details** expands each card independently. Expansion survives
  filtering while the panel stays mounted. Purchase dates appear only for a
  matching owner order. QR/NFC tools, plan-gated history, and lifecycle controls
  live in the expanded details; Free owners see a short Premium-coming-soon
  message instead of a disabled history button.
  An active tag with an available linked Safety Profile offers **View Safety
  Profile** via `getQrSafetyPath(pet)`, in a new tab. It does not resolve a
  physical tag or record a scan. A switched-off Safety Profile instead offers
  **Manage Safety Profile**; pending tags with an order offer the applicable
  order/payment action. Inactive and archived tags have no Safety Profile CTA.
  Physical **View Tag Scan Page**, **Copy QR Link**, **Open NFC Link**, and
  **Copy NFC Link** remain in details where supported. QR and NFC keep their
  distinct `/q/{tagCode}` and `/n/{tagCode}` destinations. Deliberately opening
  either physical link retains scan recording; expanding, filtering, copying,
  viewing a QR image, and opening the pet-level Safety Profile do not.
  Owner Portal pages do **not** show a direct **Activate Tag** button; owners
  activate only after scanning the physical tag's printed QR at `/q/{tagCode}`
  (legacy printed tags at `/t/{tagCode}` still work; NFC never offers
  first-time activation).
  Active tags can be disabled or marked **Report Tag Lost**; inactive tags offer
  **Request Replacement** and **Archive Tag**; archived tags offer **Restore to
  List** and **View Status**. Existing confirmation dialogs remain in place.
  Archived tags stay inactive while archived. Restoring removes the archive
  marker and preserves the stored status, except the legacy `Archived` status
  becomes `Disabled`. The internal `id` is never shown. Reporting a tag lost affects only that
  physical tag; it does not enable pet Lost Mode.
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

## 6a. Care planner (`/records`)

- **Upcoming** (default) is the owner-wide planner; **All records** (`?view=all`)
  is the per-pet history picker. `?pet=<id>` narrows the planner; both live in
  the address and Back restores them.
- The planner shows 50 more items per "Show more care dates". Every read —
  first load, Show more, **Refresh**, a completion, the window regaining
  focus — re-reads the whole shown window from page 1 (100 per request) with
  the summary, rather than appending pages at old offsets. Each read carries
  a generation and the pet filter it was made for; a filter change, a newer
  read or leaving the page retires it, and nothing it returns is applied.
- **Best-effort live list.** The pages and the summary are separate requests,
  not one snapshot, and nothing proves they describe the same set of items:
  a completion that creates a next due date keeps every total the same while
  shifting items between pages. The planner detects some changes (a total
  or Malaysia day that moved, a repeat, a gap, counts that don't fit) and
  reads again; if they persist it shows the rows without counts under
  "Some care dates changed while loading. Refresh to check again." A list
  read in more than one request is always shown with "Care dates may change
  while you're browsing. Refresh to check the latest list." and a **Refresh
  the list** button, and without counts — including when there is nothing
  more to load. **Refresh** is always available. A list read in one request
  shows the summary's counts when they agree. Rows it has received are
  never hidden behind an empty state, and "No pending care dates" appears
  only when the list read and summary agree on it. No read claims the list
  stays current afterwards.
- **Done** opens "Mark as done": Done on (Malaysia today, not in the future),
  Next due date (optional, from the vet card), Note (optional). It calls
  `POST /api/v1/care-records/{id}/complete`. The attempt — its key and, once
  sent, its frozen details — belongs to the page, not the dialog. While
  sending, nothing can dismiss the dialog and the full-form link is
  disabled. After an unknown outcome the details lock and **Try again**
  resends exactly the same request; closing keeps the attempt on the page
  ("isn't confirmed yet" with **Review** and **Discard**, kept until the page
  is left or reloaded — leaving doesn't cancel a sent request). Reopening
  Done for the item reopens the same attempt. Refusals (already logged,
  deleted, undated, archived pet) are explained with no save offered.
  **Add documents or a clinic** opens the Phase 1 full form; with details
  already entered it first says they won't carry over.
- **Open** goes to the pet's care records. The history there pages too:
  **Show older records** re-reads the history from page 1 one page further
  and replaces what was shown. A detected disagreement replaces nothing and
  says the records changed while loading. Once more than one page is shown,
  the history always carries "Records may change while you browse. Reload to
  check again." with **Reload records** (which re-reads the same window), even
  when there are no older records left to show.
- Empty, loading, error and "more to load" states are distinct; a failed read
  is never shown as nothing due.

## 6. Dashboard

`/dashboard` is pets first. In order: the Lost Mode notice (when any pet is
in Lost Mode), a short greeting, **Your pets**, a pet filter (only when there
is more than one active pet), **Care coming up**, **Recent Moments**, and at
most one next step. There are no statistic tiles, navigation tiles or plan
card; the header Add menu stays the global create entry point.

- **Your pets** shows up to four compact cards (64px photo, management link,
  Share through the Share Center, View in a new tab; Enable profile when the
  Share Profile is off) and View all for larger households. It never
  duplicates the pet list and never silently selects a pet.
- **The pet filter** starts on All pets, is never remembered between visits,
  and narrows only Care coming up and Recent Moments.
- **Care coming up** reads one consistent summary,
  `GET /api/v1/care-records/upcoming/summary` (all pets and each pet, exact
  counts, at most three items each), never pages stitched together and never
  the per-pet history list. It keeps the most recently missed item plus the
  nearest coming ones: three rows where there is room, two on phones, with an
  exact "N more care dates". A failed or malformed read shows Try again; an
  incomplete summary (more than 1000 pending items) says so. Neither is ever
  shown as "nothing due". A complete read distinguishes "No care records
  yet", "No pending care dates" and "Nothing due through {date}".
- **View all** (and "N more care dates") opens the **Care planner** at
  `ownerRoutes.care({ petId })` — `/records`, narrowed to the pet when one is
  in view — which lists every pending date page by page.
- **Log as done** links to `ownerRoutes.petRecords(petId, { complete: id })`.
  The id is consumed once from the address; `RecordsManager` reads the item's
  completion status (`GET /api/v1/care-records/{id}/completion`) through the
  owner's session and opens the ordinary create form prefilled only while it
  is pending (type, title, care name, the fulfilment link, Malaysia's today as
  the editable date; private, with no notes, provider, documents or next date
  copied). Success appears only after a confirmed save, or when the status
  shows an active completing record with the draft's details **and exactly
  the attachments the request carried** (stored media ids, compared as a set;
  never file names). With attachments it says the item "is logged as done
  with your details and attachments"; without, only "Care is already logged
  with these details.", because which request wrote it can't be shown.
  While files stage or the request waits for its response, the save owns the
  editor: the draft is read-only and the editor can't be cancelled, closed or
  replaced by another record's editor. Every result first checks that its
  editor is still the one on screen, so a late result can never reset, close
  or overwrite a newer editor.
  An unknown outcome (dropped connection, 408, 5xx) keeps the draft, read-only,
  and locks Save **for as long as it stays unknown** — no time-based unlock.
  The owner can Check again or View care records; closing the editor keeps the
  save and its draft on this page (not across a reload or navigation; leaving
  never cancels a sent request) as "isn't confirmed yet" with Review my save
  and Discard my details. Same text with other attachments, other details, or
  an item deleted, undated or on an archived pet are each explained and keep
  the draft. Staged files are never deleted while the outcome is unknown.
  The recovery flow never offers another write: a refusal only shows that
  that request wrote nothing, not that an earlier one for the item stopped.
  To log a separate event, the owner uses the ordinary Add record flow.
  Disappearing from pending care is never read as completion.
- **Recent Moments** shows the newest Moments for the pets in view (three on
  phones, four where there is room), ordered by Moment date, then creation
  time, then id, with the owner's own photos; a Moment
  without a photo shows its category, never a stand-in picture. It makes no
  weekly claims.
- **Next step** is one card: finder contact setup first, then today's
  birthday card (not for a pet in Lost Mode), then profile completion. A
  quiet note appears for a pet at 80% of its private-Moment allowance, only
  from a complete count.

When there are no pets, the dashboard renders one focused Add Pet empty state.
A household whose pets are all in Memorial Mode sees only a quiet link to each
pet, with no care, celebration or prompt to add another pet.
