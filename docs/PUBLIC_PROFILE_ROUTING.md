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

### Why `publicCode`, not slug

`publicCode` is a **stable, lowercase 4-char public key** per pet
(`generatePublicCode()`), set once and preserved across edits (see
`updatePet` / `normalizePet` in `petService.ts`). Renaming a pet changes the
slug but **not** the `publicCode`, so an already-shared link never breaks. The
slug in the URL is cosmetic.

`publicCode` (pet share key) is **not** the same as `tagCode` (physical tag id).
Keep them distinct.

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
