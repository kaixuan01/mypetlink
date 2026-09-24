# MyPetLink Product Model

**This is the canonical reference for what MyPetLink's concepts are, what they
are called, which routes serve them, and how they depend on one another.**

When product terminology, route semantics or profile relationships are unclear,
follow this document. Do not infer behaviour from legacy route names, old
screenshots, historical phase documents, marketing copy or backend entity names.

Two rules about this document itself:

- **Current code is the behavioural source of truth.** If the code does
  something this document does not describe, the code is what ships. Fix the
  document, or fix the code deliberately — do not quietly assume either.
- **This document defines the intended architecture and terminology.** A stale
  historical document that contradicts it does not win. Neither does an entity
  name: `PetPublicProfile`, `PetMemory` and the `Social*` namespace are all
  internal names that predate the vocabulary below and are deliberately not
  being renamed.

---

## The model at a glance

```text
User
├── Account identity            Users.Email, Users.DisplayName
│   └── never public
│
├── Owner contact identity      OwnerProfiles.OwnerDisplayName + contact
│   └── finder-facing, shown on the Safety Profile when the owner allows it
│
├── Community Profile           OwnerSocialProfiles
│   └── /u/{handle}
│
└── Pets
    └── Pet Profile             the whole pet record (umbrella concept)
        ├── Share Profile
        │   └── /p/{slug}-{publicCode}
        │
        ├── Safety Profile
        │   └── /q/{safetyCode}
        │
        ├── Community participation
        │
        ├── Moments
        │
        ├── Care
        │
        └── Smart Tags
            ├── QR     /q/{tagCode}
            ├── NFC    /n/{tagCode}
            └── Legacy /t/{tagCode}
```

---

## Definitions

### Pet Profile

The **umbrella concept**: the complete pet record inside MyPetLink, including
private owner-managed information and each of the pet's publication and safety
experiences.

The authenticated `/pets/{id}` area is the owner's **management hub** for the
Pet Profile.

**"Pet Profile" is not the name of any single public page.** In particular it is
not the name of `/p/...`.

### Share Profile

The pet-facing page an owner **intentionally shares** with friends, family or
anyone else.

- Route: `/p/{slug}-{publicCode}` — resolved by `publicCode`, the segment after
  the last `-`, so renaming a pet never breaks a shared link.
- Audience: anyone with the link; anyone browsing Community when the pet and its
  household are discoverable.
- Switch: `PetPublicProfiles.IsPublicProfileEnabled`.
- Independent of Community participation. A Share Profile can exist and work
  while Community is completely disabled.

Legal copy may use the fuller phrase "Public Share Profile" where precision
matters. Normal product UI converges on **Share Profile**.

### Safety Profile

The **finder-first** experience, whose only job is to help a lost pet get home.

- Route: `/q/{safetyCode}` — belongs to the pet and works with no physical tag.
- Audience: whoever has found the pet.
- Switch: `PetSafetySettings.QrSafetyEnabled`.
- Independent of both the Share Profile and Community.
- Only finder-relevant, owner-approved information belongs here.
- Contact actions are the highest-priority interaction, especially in Lost Mode.
  See *Reading order* below.

Smart Tags resolve into this same Safety Profile. A Smart Tag is an access
method, **not another profile** — and it must never produce a different or
reduced one. Once an eligible tag resolves to a pet, the finder-facing content
and privacy rules are identical to direct access, the Share Profile bridge
included. See *Entry-point parity*.

### Community Profile

The owner's public identity inside MyPetLink Community.

- Route: `/u/{handle}`.
- Opt-in, off by default, and **household-based** — you follow a household, not
  a pet (`OwnerFollows`).
- Typed by the owner. Never seeded from the account name, a Google profile, an
  email local part, or the finder-facing name. `OwnerSocialProfileFactory`
  enforces this.
- Separate from the finder identity and from the Share Profile. It may reference
  participating pets and public Moments. Household identities author Moment
  Comments; pets never author Comments.

Internal code continues to use `Social*` naming. User-facing copy still says
"social profile" and "MyPetLink Social" in several places; converging that on
**Community** is a later terminology stage and is tracked as remaining debt at
the end of this document.

### Smart Tag

The physical **QR + NFC** product. An access and recovery tool.

It is not a Pet Profile, a Safety Profile, a Community Profile, or a separate
social identity.

```text
QR tag scan      /q/{tagCode}
NFC tag scan     /n/{tagCode}
legacy printed   /t/{tagCode}
```

Activation uses the **current canonical QR flow**, `/q/{tagCode}` — not `/t/`.
`routes.ts` `activatePath()` resolves to `/q/{tagCode}`, and `/activate/{tagCode}`
is a compatibility redirect to the same place. `/t/` is retained for
already-issued printed tags and must not be removed.

NFC never offers activation: an unactivated tag tapped over NFC is told to scan
the QR code first.

### Moment

**Moment** is the canonical user-facing term.

The entity is `PetMemory` / `PetMemories`, the plan limit is
`maxMemoriesPerPet`, and the public DTO field is `memories`. These internal
names stay. Removing "Memory"/"Memories" from user-facing UI is a later
terminology stage.

Public Moment detail is the only surface that renders the full Comment thread.
Feed, Explore, Community Profile and Share Profile Moment cards expose only the
viewer-visible Comment count and a link to `/moments/{id}#comments`. Comments
are part of Community and inherit the Moment's visibility; they never change a
Share Profile or Safety Profile into a Community dependency.

---

## Audiences

| Audience | Sees | Where |
| --- | --- | --- |
| The owner | Everything about their own pets | `/dashboard`, `/pets/{id}`, `/settings` |
| A finder | Owner-approved safety information and contact actions | `/q/{safetyCode}`, and any Smart Tag route |
| Someone given a link | The pet's shareable page | `/p/{slug}-{publicCode}` |
| Anyone in Community | Participating households, their participating pets, and public Moments | `/u/{handle}`, `/explore`, `/search`, `/moments/{id}` |
| A follower | The above, plus their feed | `/feed` |

### Where the owner changes each one

Each audience is governed by exactly **one** authoritative control. The pet
Overview tab summarises all three in a read-only **Sharing & Privacy** card and
links out; it never duplicates a switch.

| Audience | Authoritative control | Component |
| --- | --- | --- |
| Someone given a link | Edit Pet -> **Share Profile** | `petForm/SharingPrivacySection.tsx` |
| A finder | Edit Pet -> **Contact & Safety** | `petForm/ContactSafetySection.tsx` |
| Anyone in Community | **Community -> Edit Profile** | `PetSocialSettingsList.tsx`, `OwnerSocialProfileForm` |

Two consequences worth stating, because both have been got wrong before:

- **A summary may not become a second switch.** If the same setting can be
  changed in two places, the two will eventually disagree, and an owner cannot
  tell which one a stranger is actually seeing. Summaries state and link.
- **A summary may not guess.** Community participation is derived from two
  authenticated reads (`/api/v1/social/me/pets` and `/api/v1/social/me/profile`).
  When either fails the row says its status is temporarily unavailable rather
  than asserting "Not in Community" - a wrong reassurance about who can see a
  pet is the one error that matters. See `src/lib/communityParticipation.ts`.
- **A missing feature and missing data are different.** The row is omitted only
  when Community does not exist for this owner at all (switched off for the
  build, or the offline fallback). When Community exists but its state cannot be
  read, the row stays and says so: removing it would tell the owner their pet
  has no Community settings, which is its own false claim.

Discoverability is derived from **both** the pet's `isDiscoverable` and the
household's, because `SocialDiscoveryService` requires both. A pet whose own
switch is on inside a hidden household is described as *in Community, hidden
from discovery* - never as discoverable.

---

## Route map

### Public, no account

| Route | Surface |
| --- | --- |
| `/p/{slug}-{publicCode}` | Share Profile |
| `/q/{safetyCode}` | Safety Profile (pet-level; no tag needed) |
| `/q/{tagCode}` | Smart Tag QR entry → Safety Profile, or activation |
| `/n/{tagCode}` | Smart Tag NFC entry → Safety Profile, or "scan the QR first" |
| `/t/{tagCode}` | Legacy printed-tag entry, retained for issued tags |
| `/activate/{tagCode}` | Compatibility redirect → `/q/{tagCode}` |
| `/u/{handle}` (+ `/followers`, `/following`) | Community Profile |
| `/moments/{momentId}` | One public Moment |
| `/explore`, `/search` | Community discovery |
| `/`, `/pricing`, `/how-it-works`, `/pet-profile`, `/safety-profile`, `/smart-pet-tags`, `/where-to-buy`, `/sample`, `/privacy`, `/terms` | Marketing |
| `/login` | Owner sign-in (real auth: password or Google) |

`/q` resolves a pet Safety Profile first, then a tag. One route, two kinds of
code, Safety Profile taking precedence.

### Authenticated — owner portal ("My Pets")

`/dashboard`, `/pets`, `/pets/new`, `/pets/{id}` (+ `/edit`, `/records`,
`/moments`, `/timeline`, `/tags`, `/tags/order`), `/records`, `/moments`,
`/tags`, `/orders`, `/orders/view`, `/settings`.

`/pets/{id}/qr` is a legacy redirect to `/pets/{id}`.

### Authenticated — Community

`/feed`, `/notifications`, `/community/profile`, `/community/profile/edit`.

`/moments` (the owner's cross-pet Moments manager) and `/moments/{id}` (a public
Moment page) are different surfaces in different halves of the product.
`lib/appMode.ts` is the single place that decides which half a route belongs to.

### Admin

`/admin/**`, capability-based. See
[`admin-access-management.md`](admin-access-management.md).

---

## Dependencies

This is the part most often got wrong, so it is stated twice: as a diagram and
as prose.

```text
Share Profile enabled
    └── /p/... works

Safety Profile enabled
    └── /q/... works

Owner Community enabled
+ Pet Community enabled
    └── Community participation

Community discoverability enabled (owner AND pet)
    └── Explore / Search discoverability
```

**Share Profile must never require Community.**

```text
Share Profile
    X must not require Community
```

Community participation for a pet **does** require an enabled Share Profile,
because the Share Profile is that pet's public representation — a pet cannot
appear in Community without a page for people to open.
`PetSocialSettingsService.MissingRequirements` enforces this and reports
`"publicProfile"` when it is the blocker.

The reverse dependency does not exist, and must not be reintroduced:

- The Safety Profile's link to the Share Profile ("View Share Profile") depends
  only on the Share Profile being switched on and the pet's lifecycle still
  serving that page, on every entry point. `ShareProfileBridge.ResolveSlug`.
  It previously also required the pet and household to be in Community, which
  silently withheld the link from every owner who had not joined Community.
- Discoverability is not a condition of that link either. A finder scanned the
  animal in front of them; that is the opposite of discovery, and treating it as
  discovery would turn `IsDiscoverable` into a private-profile switch.

An owner must be able to run:

```text
Share Profile: ON
Safety Profile: ON
Community: OFF
```

…and have `/p/...`, `/q/...` and the Safety → Share bridge all work. A Smart Tag
must open the Safety Profile regardless of Community participation.

### Entry-point parity

**A Smart Tag never produces a different or reduced Safety Profile.** Once an
eligible tag resolves to a pet, the finder-facing content and every privacy rule
are the same as for a finder who opened `/q/{safetyCode}` directly — the Share
Profile bridge included.

```text
Safety Profile
├── direct access: /q/{safetyCode}
└── Smart Tag access
    ├── QR:     /q/{tagCode}
    ├── NFC:    /n/{tagCode}
    └── legacy: /t/{tagCode}
```

`ShareProfileBridge.ResolveSlug` is the single rule, and both `QrSafetyService`
and `TagScanService` ask it. It did not used to be: the rule lived in
`QrSafetyService` alone, and `TagScanService` simply stopped constructing the
response one argument early. `PublicSafetyPageResponse.PublicProfileSlug` is now
a required parameter with no default, so a new construction site has to answer
the question rather than inherit an answer.

A tag that may not expose finder information exposes no Share Profile either.
Unclaimed, pending, lost, disabled, replaced and archived tags, and tags on a
deleted, archived or memorial pet, are all refused before the Safety Profile is
built — the Share Profile existing changes none of that.

---

## Privacy boundaries

### Three owner identities, never collapsed

| Identity | Stored as | Who sees it |
| --- | --- | --- |
| Account | `Users.Email`, `Users.DisplayName` | Nobody but the owner |
| Owner contact (finder) | `OwnerProfiles.OwnerDisplayName` + phone/WhatsApp, per-pet override in `PetContacts` | A finder, gated by `PetPublicProfiles.ShowOwnerName` and the per-channel switches |
| Community | `OwnerSocialProfiles.DisplayName`, `Handle` | Anyone in Community |

**One anonymous payload must never name two of them.** The Share Profile
response omits `ownerDisplayName` whenever it carries `sharedBy` — the
household's Community identity — so an anonymous caller cannot correlate the
chosen community name with the real name a finder is given.
`PublicProfileService.ResolveAnonymousOwnerDisplayName` enforces this in the
projection, not in the page: a rule kept only by a React component is not kept
at all.

The Safety Profile is unaffected. A finder needs a human being to ask for, and
that page carries no Community attribution to correlate against.

### Per-surface visibility

- Fail closed. `conservativePetVisibility` is the baseline; saved values merge
  over it.
- A general area is never an address. `GeneralAreaRules` is the only validator.
- `PetMemories.AuthorUserId` is immutable; ownership transfer never rewrites it.
- Filtered SQL indexes are a performance optimisation, never a privacy control.
- The actor is always the JWT subject. No social endpoint accepts a user, owner
  or actor id from a client.

### Moment audience

One switch, `PetMemories.Visibility`, decides everything.
`showOnPublicProfile` is derived from it, not chosen separately.

A **Shared publicly** Moment appears on: the pet's Share Profile, the
household's Community Profile, its own `/moments/{id}` page, the feed of
everyone who follows that household, and — when the household and the pet are
both discoverable — Explore.

The editor must describe that full audience. It previously said "Anyone with the
link", which is the phrase people read as *unlisted*.

---

## Reading order on the Safety Profile

The page exists so a stranger holding somebody's pet can reach the owner. In
Lost Mode the order is:

1. Pet identity and missing state
2. Where and when the pet was last seen
3. Primary contact action
4. Secondary contact action
5. The owner's Lost Mode message, reward, and any extra instructions
6. Handling information — allergies, safety note, emergency note
7. The Share Profile link
8. Privacy footer

The first contact action must be reachable without scrolling on a normal phone.
`QrSafetyPageView.test.tsx` pins this order.

---

## Feature flags

| Flag | Default | Gates |
| --- | --- | --- |
| `NEXT_PUBLIC_PUBLIC_PROFILES_ENABLED` | `true` | `/p/` and owner sharing UI |
| `NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED` | `false` | Owner-facing Safety Profile cards and QR; `/q/` is always live |
| `NEXT_PUBLIC_SMART_TAGS_ENABLED` | `false` | Smart Tags navigation, pet tab, pet actions |
| `NEXT_PUBLIC_TAG_ORDERS_ENABLED` | `false` | Orders navigation and ordering |
| `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED` | `false` | Buy CTAs, Where to Buy |
| `NEXT_PUBLIC_SOCIAL_ENABLED` | `false` | Every Community entry point |

A flag decides what is **offered**, never what exists: routes and APIs stay
reachable in both states so saved links keep working.

`socialEnabled` covers the public navigation, the landing teaser, the owner
sidebar and phone bar, Owner Settings, the sitemap, **and the visitor header
above a Share Profile**. That last one is easy to miss because it is client
rendered and therefore invisible to an export-only check — see
`scripts/verify-social-flag.mjs`, which checks it at source, and
`SocialLayoutVisitorShell.test.tsx`, which renders both states.

Release builds must state the flag rather than inherit it from a developer's
`.env.local`: `npm run build:social-off` / `build:social-on`. Rollout and
rollback live in
[`../operations/social-soft-launch-runbook.md`](../operations/social-soft-launch-runbook.md).

---

## Anti-confusion rules

```text
Share Profile        ≠  Community Profile
Share Profile        ≠  Safety Profile
Safety Profile       ≠  Smart Tag
Pet Profile          ≠  /p/ page
Community identity   ≠  finder identity
Moment               ≠  a separate pet identity
```

Also:

- Never call `/q/...` a "QR Safety Page", "QR Safety Profile" or "QR Profile".
  QR and NFC name the **access technology**, not the page. "Download QR Code",
  "Tap NFC Tag" and "QR + NFC Smart Tag" are correct uses.
- The three public pages are three distinct surfaces. Do not lump them together
  as a generic "QR Profile".
- Safety Profile status labels are **Safety Profile Active**, **Contact Update
  Needed**, **Safety Profile Off** (`lib/safetyProfile.ts`). Tag linkage has its
  own labels and is never part of that status.
- Smart Tag scanning stays Safety Profile first. `/q`, `/n` and `/t` must never
  route to a Community surface.

---

## Canonical terminology

| Concept | Canonical term | Not |
| --- | --- | --- |
| The whole pet record | Pet Profile | — |
| `/p/{slug}-{publicCode}` | Share Profile | "Pet Profile", "Public Profile" as a page name |
| `/q/{safetyCode}` | Safety Profile | "QR Safety Page", "QR Profile" |
| `/u/{handle}` | Community Profile | — |
| The physical product | Smart Tag | "QR Pet Tag" (discontinued SKU; kept only for historical rows) |
| `PetMemory` | Moment | "Memory" / "Memories" in user-facing copy |
| The community half | Community | "MyPetLink Social", "social profile" in user-facing copy |
| `OwnerProfiles.OwnerDisplayName` | the name finders see | a bare "display name" |
| `OwnerSocialProfiles.DisplayName` | the Community name | a bare "display name" |

### Terminology debt, paid

The four inconsistencies this document was written to settle are settled in the
product UI: `/p/` is the **Share Profile** everywhere a reader meets it, a
`PetMemory` is a **Moment**, the social half is **Community**, and `/explore` is
the Community discovery surface with **Explore** as the way to reach it.

`src/lib/productTerminology.test.ts` guards them by reading the source of every
surface that names one, so a second name cannot quietly come back.

**What deliberately still reads the old way, and why:**

- **`"Memory"` is one of eleven Moment categories**, beside "Vet Visit" and
  "Achievement". It is a stored `MomentType` value, so renaming it would be a
  data change, and in that list it means something specific — a keepsake.
- **"memorial" and "In memory of"** are ordinary English about a pet that has
  died. They have nothing to do with the Moments feature.
- **Internal names are untouched by design**: `PetMemory`, `PetPublicProfile`,
  `OwnerSocialProfile`, `maxMemoriesPerPet`, `MemoryVisibility`, the `Social*`
  namespace, the `/api/v1/memories` routes and every DTO property. Code and
  schema keep the names they were built with.
- **Legal copy stays explicit where the sentence depends on it.** The Terms say
  "Share Profiles and Safety Profiles are publicly shared pages", and the
  Privacy Notice says "publicly shared Share Profiles", because a reader of a
  legal clause should not have to recognise a product name to understand what is
  public.

---

## Where the rules actually live

| Rule | Enforced in |
| --- | --- |
| Route strings | `apps/web/src/lib/routes.ts` |
| Which half a route belongs to | `apps/web/src/lib/appMode.ts` |
| Feature flags | `apps/web/src/lib/features.ts` |
| Safety Profile status | `apps/web/src/lib/safetyProfile.ts` |
| Visibility fail-closed baseline | `apps/web/src/lib/petVisibility.ts` |
| Anonymous Share Profile projection | `PublicProfileService` |
| Safety → Share bridge, every entry point | `ShareProfileBridge.ResolveSlug` |
| Community participation prerequisites | `PetSocialSettingsService` |
| Community identity never seeded | `OwnerSocialProfileFactory` |
| Sellable tag capability | `TagCatalogSellability`, `lib/tagCapabilities.ts` |
