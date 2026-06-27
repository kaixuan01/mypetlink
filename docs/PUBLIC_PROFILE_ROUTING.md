# MyPetLink Public Profile & Tag Routing

> Read [`AI_AGENT_REFERENCE.md`](./AI_AGENT_REFERENCE.md) first. This document
> covers the **public, unauthenticated** routes: scanning a tag, activating a
> tag, and the shareable public profile. Owner portal routing is in
> [`OWNER_PORTAL_FLOW.md`](./OWNER_PORTAL_FLOW.md).

---

## 1. The three public routes

| Route                        | Purpose                          | Lookup key            |
| ---------------------------- | -------------------------------- | --------------------- |
| `/t/{tagCode}`               | A physical tag was scanned/tapped | `tagCode`             |
| `/activate/{tagCode}`        | Bind an unassigned tag to a pet  | `tagCode`             |
| `/p/{slug}-{publicCode}`     | Share a pet's public profile     | `publicCode`          |

QR codes and NFC chips both point at **`/t/{tagCode}`** — never at a pet id,
slug, internal id, or sequential id. There is one URL per physical tag.

Build these URLs with the helpers in `src/lib/routes.ts` (`tagPath`,
`activatePath`, `publicProfilePath`). Never hand-write them.

---

## 2. `/t/{tagCode}` — the finder state machine

`src/app/t/[tagCode]/page.tsx` is a static-export server page
(`dynamicParams = false`, params from `staticTagCodeParams()`). It computes the
initial `FinderResult` at build time via `getFinderState(tagCode)` and passes it
to **`TagFinderView`** (client), which **re-fetches `getFinderState` on mount**
so runtime (`localStorage`) data wins.

`getFinderState` (`src/services/tagService.ts`) returns one of four states:

| State        | When                                                       | What `TagFinderView` renders                              |
| ------------ | ---------------------------------------------------------- | -------------------------------------------------------- |
| `not-found`  | No tag with that code                                      | Branded **"Tag not found"** card (no info leaked)        |
| `unassigned` | `status === "Unassigned"` **or** the tag has no `petId`    | **Activation prompt** → CTA to `/activate/{tagCode}`     |
| `inactive`   | `status` in `Disabled / Lost / Replaced`, or bound pet gone | Safe **"This tag is not active"** message                |
| `active`     | Has a `petId`, status not disabled                         | The pet's **public profile** (`PublicFinderProfile`)     |

Why "not found" is a rendered state, not `notFound()`: with static export there
is no server at runtime. A tag that exists only in `localStorage` was never
pre-rendered, so relying on Next's `notFound()` would 404 a valid tag. The state
machine handles every case client-side instead.

The unassigned activation prompt uses the exact product copy:

- **Title:** `Activate your MyPetLink Tag`
- **Body:** `This tag is not linked to any pet yet. Activate it now so your pet
  can be identified if they ever get lost.`
- **Button:** `Activate Tag`

A finder scanning an **active** tag must see the public profile directly — never
the activation page.

---

## 3. `/activate/{tagCode}` — activation flow

`src/app/activate/[tagCode]/page.tsx` (static, same param source) renders
**`TagActivationFlow`** (client) with the initial `FinderResult`. The flow keeps
the TagCode in the URL the whole time and never forces a re-scan or an early
dashboard redirect. Render precedence:

1. **Success** (just activated) → "Activated" screen with: Preview Public
   Profile, View Tag Page, Go to Dashboard.
2. **Already active** → cannot re-activate; offer to view the profile.
3. **Inactive** (Disabled/Lost/Replaced) → safe "cannot activate" message.
4. **Not found** → branded not-found.
5. **Not signed in** → sign-in card. Signing in happens **inline**
   (`loginMockOwner()` then stay on the page) so the TagCode is preserved.
6. **Signed in, unassigned** → **pet selection**: pick an existing pet
   (avatar + name) or "Create a new pet profile instead"
   (`ownerRoutes.petNew`), then **Activate Tag**.

`activateTag(tagCode, petId)` binds the pet, sets status `Active`, and stamps
`activatedAt`. **The TagCode never changes during activation** — only the pet
binding and status do.

> Full activation product requirements (retail flow, no-account flow, existing
> user flow, edge cases) live in `SMART_TAG_PRODUCT_STRATEGY.md` §15–§21, §29–§30.

---

## 4. `/p/{slug}-{publicCode}` — shareable public profile

`src/app/p/[slug]/page.tsx` is the warm, shareable profile (distinct from the
finder safety page). It is **looked up by `publicCode`, never by slug**:

- `generateStaticParams()` uses `staticPublicPetParams()` →
  `"{slug}-{publicCode}"`.
- The page parses the param with `parsePublicProfileParam(slug)`, which splits on
  the **last** `-` (slugs may contain hyphens like `milo-the-dog`), then calls
  `getPublicPetProfileByPublicCode(publicCode)`.
- It renders `PublicSharePetProfile` with the profile, public moments, and
  records.

### Clean shareable layout (NOT the finder page)

> **This is the single most important rule for this page.** The share profile
> (`/p/{slug}-{publicCode}`) is the **friendly, IG-style** page an owner shares
> with friends, family, and pet communities. It is **NOT** the emergency finder
> page. The finder/emergency experience lives **only** on the QR/NFC safety page
> (`/t/{tagCode}`, see §2 and the `PublicFinderProfile` component). Never mix
> them. A previous version wrongly made the share page finder-first — do not
> reintroduce that.

`PublicSharePetProfile` is **clean, mobile-first, and shareable**. The first
screen is an identity hero: cover, large pet photo, name, species/breed/age,
short bio, and personality tags. The **primary action is "Share profile"**, not
contact. Then three simple tabs:

| Tab      | Shows                                                                   |
| -------- | ----------------------------------------------------------------------- |
| About    | breed, color, gender, age, birthday, favourite toy, and public care badges (gated by `showCareBadges`) |
| Moments  | public memories only (`visibility === "Public"` + `showOnPublicProfile`, gated by `showMoments`) |
| Timeline | life timeline events (birthday/adoption gated by their flags + public moments where `showInLifeTimeline`, gated by `showTimeline`) |

**Do NOT show on the share page by default:** "I found this pet - Contact
Owner", "Send Found Location", a big emergency WhatsApp/Call block, safety/
emergency notes as primary content, "safety page" wording, or any lost-pet
finder wording. The only contact affordance is **one small, optional "Message
owner"/"Call owner" button** rendered after the share link, and only when the
owner enabled `visibility.showWhatsapp` / `showPhone`.

**Lost Mode exception:** when any tag bound to the pet has status `Lost`
(`isPetReportedLost` in `tagService.ts`, passed in as `initialLostMode` and
re-checked on mount), the share page shows a **lost banner + a single "I found
this pet - Contact Owner" CTA**. This is the *only* case where the share page
turns finder-first.

Keep it clean: minimal badges, plenty of whitespace, one strong primary action
(share). The pet's `profileTheme` themes colors. When adding public fields,
route them through `toPublicProfile` and gate them behind a `visibility` flag —
the share page never reads raw `Pet` fields or shows private owner info.

### Why `publicCode`, not slug

`publicCode` is a **stable, lowercase 4-char public key** per pet
(`generatePublicCode()`), set once and preserved across edits (see
`updatePet` / `normalizePet` in `petService.ts`). Renaming a pet changes the
slug but **not** the `publicCode`, so an already-shared link never breaks. The
slug in the URL is cosmetic.

`publicCode` (pet share key) is **not** the same as `tagCode` (physical tag id).
Keep them distinct.

> **Deprecated:** `/p/{petSlug}` alone (e.g. `/p/milo`) must never be displayed,
> copied, or navigated to. Every public profile link is `/p/{petSlug}-{publicCode}`.
> Build it with `publicProfilePath(slug, publicCode)` (or `pet.publicProfilePath`),
> never by concatenating the slug by itself. The QR/NFC safety page is a separate
> route, `/t/{tagCode}` using the official `MPL-XXXX-XXXX` TagCode — never an old
> short token.

---

## 5. Privacy — what public pages may show

Public output goes through `toPublicProfile(pet)` (`petService.ts`), which
returns a `PublicPetProfile` (a `Pick` of `Pet`) and applies the pet's
`visibility` flags. Public pages must **never** expose:

- internal `id`
- owner full address, email, IC/ID
- full phone unless `visibility.showPhone` (and/or `showWhatsapp`) is enabled
- private notes / records not marked public

Default visibility is safe. When adding a field to a public page, route it
through `toPublicProfile` and gate it behind a `visibility` flag rather than
reading raw `Pet` fields.

---

## 6. Adding or changing a public route — checklist

1. Add the URL helper to `src/lib/routes.ts`; don't hardcode strings.
2. If it has a `[param]`: export `dynamicParams = false` and
   `generateStaticParams()` from a `staticRouteParams.ts` source.
3. Compute initial data on the server from the seed, then **re-fetch in a client
   component on mount** so runtime data wins.
4. Handle missing/invalid input as a **rendered state**, not `notFound()`.
5. Send all pet data through `toPublicProfile` and respect `visibility`.
6. Never expose internal ids; never leak whether a similar tag/pet exists.
7. Run `npm run build` — static export fails on any unrendered param.
