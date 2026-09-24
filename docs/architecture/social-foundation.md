# MyPetLink Social — foundation architecture

**Status:** Community Phase 1 and Phase 2A Moment Comments are implemented.
Replies, Comment likes, mentions, reporting and moderation remain future work.

This document describes what exists in the codebase today. The product proposal
that preceded it is a separate artefact; where the two disagree, this file is
the one that matches the code.

---

## 1. Three identities, never collapsed

MyPetLink now keeps three separate identities for one human being. Confusing any
two of them is the most damaging mistake available in this area, because the
failure is silent: everything renders normally while publishing something the
owner never agreed to publish.

| Identity | Stored in | Seen by | Set from |
| --- | --- | --- | --- |
| **Account** | `Users.Email`, `Users.DisplayName` | Nobody public. Sign-in and support only. | Google, at sign-in |
| **Finder** | `OwnerProfiles.OwnerDisplayName`, optionally overridden per pet by `PetContacts.OwnerDisplayName` | A person who found a lost pet, and only when the owner enables `PetPublicProfiles.ShowOwnerName` | Seeded from the Google display name by `AuthService` |
| **Social** | `OwnerSocialProfiles` | Other owners on the social side of MyPetLink | **Typed by the owner. Never derived.** |

The finder identity is the one that makes this urgent. Using a real name there
is the *right* choice — someone holding your lost cat should see a human name —
which is exactly why that field cannot be reused as a social name. An owner may
be "Sarah Tan" to a finder and "@mochis_human" to the network, and no endpoint
returns both.

That last sentence is now enforced rather than merely intended:
`PublicProfileService.ResolveAnonymousOwnerDisplayName` omits `ownerDisplayName`
from the anonymous Share Profile response whenever it carries `sharedBy`. It was
previously suppressed only by the React page, which meant the edge preview
function, any other client, and the network tab still saw both names.

**Rules enforced in code:**

- `OwnerSocialProfileFactory.CreateDisabled` is the only place a profile row is
  created, and it writes `Handle = null`, `DisplayName = null`, both switches
  `false`. The backfill in migration A does the same in SQL.
- Handle suggestions in the UI derive from **pet names only**
  (`suggestHandlesFromPetNames`). Never the account name, never the email local
  part.
- `SocialIdentityIsolationTests` asserts structurally that no social response
  type carries an email, phone, account name, finder name, safety code or tag
  code field, and that a rendered response contains none of those values.

---

## 2. Moment authorship

`PetMemories.AuthorUserId` is a **domain relationship, not a denormalisation**.

It records *who wrote the Moment*, and it is immutable:

```
Alice owns Mochi.
Alice creates Moment A.          AuthorUserId = Alice

Mochi is transferred to Bob.
Moment A                          AuthorUserId = Alice   ← unchanged
```

Ownership transfer never rewrites authorship, and neither does an edit. That a
later feed can also join the follow graph straight to Moments on this column,
without a hop through `Pets`, is a **secondary performance benefit** — not the
reason the column exists.

**Backfill caveat.** Authorship was never recorded before migration C, so
historical rows are backfilled from the pet's owner *at migration time*. For any
pet that had already changed hands this names the wrong person. It is the only
evidence available and is documented in the migration itself. Every row created
after the migration takes its author from the authenticated session.

---

## 3. Moment subjects and the plan allowance

`PetMemories.PetId` remains the required **primary subject** — it owns the pet's
Moments tab, the Life Timeline, and the plan allowance. It is referenced in ~31
places and was not disturbed.

`MomentPets` records **membership only**: which pets a Moment is about. It
carries **no `IsPrimary` column**.

> An earlier draft had one, plus a filtered unique index enforcing "one primary
> per Moment". That was removed. It created a second source of truth the database
> could not keep honest — nothing at the schema level stopped
> `PetMemory.PetId = Mochi` coexisting with `MomentPet(Coco, IsPrimary = true)`,
> and application-only synchronisation is not a guarantee. **The primary pet is
> simply the membership row whose `PetId` equals `PetMemories.PetId`.** Deriving
> it from the column that already owns it makes the contradictory state
> unrepresentable rather than merely discouraged.

**The membership invariant.** Every Moment has a membership row for its primary
pet. This is maintained by `MemoryService` and covered by unit and relational
tests. Note its failure mode is weak by construction: a membership row can only
ever be *missing*, never *contradictory*, and `ReplaceMomentPetsAsync` repairs a
missing one on the next write. `ReplaceMomentPetsAsync` never removes the primary
row, so editing the "who else is in this" list cannot drop it.

**Quota rule — approved and implemented:**

```
Moment: PrimaryPetId = Mochi, AuthorUserId = Alice
MomentPets: Mochi, Coco, Lucky

→ consumes ONE private allowance, against Mochi only (and none at all if public).
```

`MomentPets` rows never count against a plan limit.

**Phase 1 restriction:** only the authenticated user's own pets may be tagged.
A cross-owner tag puts someone else's animal on a page they do not control, and
that needs their consent rather than a notification afterwards. The API returns
`403 pet_not_owned`.

## 4. Publication time

`PetMemories.PublishedAt` is the social publication timestamp, deliberately
distinct from:

- `MomentDate` — the date the memory is *about*, routinely backdated years. Using
  it for feed order would sort by when things happened to a pet rather than by
  when they were shared.
- `CreatedAt` — when the row was written, set even for a Moment never made
  public.

Semantics:

| Event | `PublishedAt` |
| --- | --- |
| Created private | `null` |
| Created public | now |
| Private → public | now, if not already set |
| Ordinary edit while public (caption, title, media, tagged pets, timeline) | **unchanged** |
| Public → private | **unchanged** — the historical time is kept, not destroyed |
| Public → private → public | **unchanged** (keeps the original) |

The last two rows are the same decision: re-publishing is not a new Moment, and
letting it reset the clock would be a way to resurface old content on demand.
Fixing a typo must not push an old Moment back to the top of a feed.

---

## 5. Filtered indexes are not privacy or security controls

Several indexes here are filtered — the handle uniqueness index is filtered on
`NormalizedHandle IS NOT NULL`, the unread-notification index on
`ReadAt IS NULL`, and a later feed index will be filtered on
`Visibility = 'Public' AND DeletedAt IS NULL`.

> **A SQL filtered index is a performance optimisation only. It is not a
> security or privacy control.**

A filtered index narrows what the *optimiser* can use. A query whose predicate
is wrong simply falls back to the base table and reads everything, including
private, deleted and archived rows. Privacy must therefore be enforced
explicitly and independently in every one of:

- the LINQ/SQL predicate,
- authorization (the actor is always the JWT subject),
- the projection (social DTOs never select a private field),
- the social visibility checks (`IsSocialEnabled`, `IsDiscoverable`, blocks).

Never rely on an index filter to keep a row out of a result.

---

## 6. Social privacy defaults

Everything is **off**, for existing rows and new ones alike.

| Switch | Default | Meaning |
| --- | --- | --- |
| `OwnerSocialProfiles.IsSocialEnabled` | `false` | The household participates at all |
| `OwnerSocialProfiles.IsDiscoverable` | `false` | Findable by people without the link |
| `OwnerSocialProfiles.AllowFollowers` | `true` | Effective only once social is on |
| `PetSocialProfiles.IsSocialEnabled` | `false` | This pet appears as a social subject |
| `PetSocialProfiles.IsDiscoverable` | `false` | This pet may surface in discovery |

### Three controls, not one

An owner passes through three separate gates before a stranger can meet a pet,
and each is given independently:

| Control | Where the owner sets it | What it decides |
| --- | --- | --- |
| **Owner Social** — `OwnerSocialProfiles.IsSocialEnabled` | Community → Edit profile, "Turn on my Community Profile" | Whether the household participates at all. A master switch: with it off, no pet of theirs is visible however its own switches are set. |
| **Pet Social** — `PetSocialProfiles.IsSocialEnabled` | Community → Edit profile → Pets, "Show {pet} in Community" | Whether this particular pet appears on the owner's Social profile, in Social Moments, and in their followers' feeds. |
| **Pet discoverability** — `PetSocialProfiles.IsDiscoverable` | Community → Edit profile → Pets, "Let people find {pet} when browsing" | Whether somebody who was *not* given a link may meet this pet through Explore and Search. |

A fourth, older control sits underneath and belongs to a different screen:
**`PetPublicProfiles.IsPublicProfileEnabled`**, on the pet's own profile page,
which decides whether the pet has a shareable link at all. Social requires it,
and never switches it on: the API reports `publicProfile` as a missing
requirement and the settings screen asks the owner to turn it on themselves.
Handing somebody a link and joining a browsable network are different decisions
with different audiences.

The write path for the two pet switches is `PUT /api/v1/social/me/pets/{petId}`
(`PetSocialSettingsService`). It is the **only** production write path to
`PetSocialProfiles`; the switches were readable by every social surface and
writable by nothing until it existed.

### Consent belongs to a person

`PetSocialProfiles.ConsentedByUserId` records *who* turned participation on, and
`SocialVisibility` requires it to still equal the pet's current owner.

Pet ownership transfer is not implemented anywhere in the product — `OwnerUserId`
is written once, at creation — so there is no transfer path to reset. Storing
the stamp makes the reset structural instead: whenever transfer does ship, a pet
that changes hands leaves Social by itself and stays out until its new owner
opts in, without the transfer code having to remember. It is null for every row
the migrations created, which is the honest record that nobody has consented.

Three more deliberate design points:

1. **`PetSocialProfile` is separate from `PetPublicProfile`.**
   `IsPublicProfileEnabled` means *"I am happy to hand this link to friends"*.
   Being browsable by strangers is a different consent. Reusing the existing flag
   would have enrolled every already-public pet into a network its owner never
   joined.
2. **Turning social off also clears discoverability.** Otherwise switching it
   back on later would silently republish the account to discovery without
   anyone choosing that again.

---

## 7. Handle lifecycle

A handle is an **address**, never an authorization. Holding `@support` would let
someone look official, which is what the reservation list prevents.

```
claim → (rename, cooldown) → release → hold → claimable again
```

| Rule | Value | Owner |
| --- | --- | --- |
| Length | 3–30 | `OwnerHandleRules` |
| Characters | `a-z`, `0-9`, `_`, `.` — starts with a letter, ends alphanumeric, no doubled separator | `OwnerHandleRules` |
| Uniqueness | Case-insensitive, on `NormalizedHandle`, filtered unique index | Database |
| Reserved | 80 seeded `System` rows: every top-level route plus brand/support terms | Migration A seed |
| Rename cooldown | 30 days (`Social:HandleRenameCooldownDays`) | `SocialOptions` |
| Release hold | 90 days (`Social:ReleasedHandleHoldDays`) | `SocialOptions` |
| History | `OwnerHandleHistories` — supports a later 301 and gives moderation a rename trail | — |

**Why the cooldown:** an account cycling through names faster than anyone can
report it is what impersonation looks like.

**Why the release hold:** without it, a link shared last week starts resolving to
a stranger's profile the moment the original owner renames. The previous holder
is recorded so they can reclaim their own name during the hold.

**Uniqueness is decided by the database.** Two accounts submitting the same
handle simultaneously both pass the pre-check; the unique index lets exactly one
through and the loser is told the name is unavailable. Proven by
`TwoAccountsClaimingTheSameHandleAtOnce_LeaveExactlyOneHolder`.

**Availability is deliberately uninformative.** Taken, system-reserved, held
after release and screened-out all return the identical shape
(`{ handle, isAvailable: false }`). This endpoint answers questions about names
nobody has claimed, which makes it the natural place to enumerate from. Format
problems are computable on the client from the same published rules, so
withholding the reason costs the owner nothing.

Owner handles live at `/u/{handle}`, a **new route namespace**. This is why they
were safe to build now while *pet* custom URLs remain deferred: the recorded
objections to pet handles were all properties of the `/p/` namespace
(`publicCode` uniqueness, `parsePublicProfileParam` splitting on the last hyphen,
the edge slug validator, the version-keyed social-card cache key). None applies
to `/u/`. The public page itself is Phase 1F.

---

## 8. General area

Before this work, `Pet.GeneralArea` was 200 characters of unconstrained free
text, published to finders and to visitors, on a field labelled as a rough area.
A full postal address fitted comfortably.

`GeneralAreaRules` is now the single authority for every surface that accepts
one — a pet's area, a per-pet contact override, the owner's default, and the
owner's social area.

### Numbers are normal here

**A digit never makes an area invalid.** Numbered neighbourhoods are the norm in
Malaysia, and rejecting them would reject a large share of the country. All of
these are accepted, and covered by tests:

```
SS2                SS15                  USJ 9
Section 17         Bandar Kinrara 5      Taman Melawati
Taman Melawati 2   Desa ParkCity         Bangsar South
Mont Kiara         Petaling Jaya         Bangsar, Kuala Lumpur
Setia Alam, Shah Alam                    59100 Kuala Lumpur
Jalan Bangsar area                       Off Jalan Ipoh
```

### What is refused

Only the shapes that appear in a precise residential address:

| Pattern | Example |
| --- | --- |
| Keyword then number | `No. 18, Jalan Example`, `Lot 5`, `Unit A-12-3`, `Blok C, Tingkat 3` |
| Malaysian unit number | `A-12-3`, `12-2`, `Block B, Unit 10-2` |
| House number *before* a street word | `12 Jalan ABC` |
| Slash-numbered street reference | `Jalan Example 2/3`, `Jalan SS15/4A` |

Note the asymmetry in row three: a number **after** a street word is an ordinary
area name (`Jalan Bangsar 2`, `USJ 9`) and is accepted; a number **before** one is
a house number and is not.

### What this deliberately is not

This is **not a postal-address detector** and does not try to be — that would
cost more false rejections than it prevents. The real protections are the short
length, the single line, and helper text that says what the field is for. The
pattern matching only catches the obvious cases.

Other rules: **80 character limit** (down from 200 for *new* values), **one
line** (line breaks, tabs and control characters collapse to a single space,
because a multi-line value is the shape a pasted postal address arrives in).

**The `Pets.GeneralArea` column stays `nvarchar(200)`.** Narrowing it would
truncate or reject existing rows. Validation applies to new writes; historical
values remain readable. Deliberate, not an oversight.

The owner's social `GeneralArea` uses **the same rules and the same code path**,
on an `nvarchar(80)` column since it is new and has no legacy data.

Nothing anywhere derives a location from a device, an IP address, or any other
automatic source, and no coordinates are stored.

## 9. Image derivatives (thumbnails)

`MediaFiles.ThumbnailObjectKey` existed as a mapped, migrated column that
**nothing ever wrote or read**, so every public image was served at full
resolution.

**How it works now:**

1. Upload is unchanged — presigned PUT direct to R2, then `complete`, which
   verifies size and content-type against a HEAD.
2. `complete` commits the upload first, then attempts a derivative.
3. `ImageDerivativeGenerator` (SkiaSharp, already a dependency) reads the
   header, decodes **at a reduced size**, applies EXIF orientation, and encodes
   JPEG.
4. The derivative is written beside its original: `photo.png` → `photo_thumb.jpg`.
5. `MediaDerivatives.ResolveThumbnailUrl` returns the derivative when
   `DerivativeStatus = Ready`, and **the original otherwise**.

### Memory protection

The decode is **never** done at full size. Dimensions come from the header
before anything is allocated, and the decode itself is requested at a reduced
size — JPEG supports 1/2, 1/4 and 1/8 natively — so a small file describing an
enormous canvas cannot turn into an enormous allocation.

| Bound | Value | Checked |
| --- | --- | --- |
| `MaxSourceEdge` | 20,000 px | Declared dimensions, before any allocation |
| `MaxSourcePixels` | 100,000,000 | Declared dimensions, before any allocation |
| `MaxDecodedPixels` | 16,000,000 | The *scaled* decode, ≈64 MB at 4 bytes/px |

File byte size is **not** relied on as the protection: a decompression bomb is
small on disk by definition.

### EXIF orientation

Phone photos routinely store a landscape buffer plus "rotate me". Re-encoding
without applying that would silently turn every portrait photo on its side, so
`SKCodec.EncodedOrigin` is read and the full transform applied — including the
four origins that swap the axes, where the derivative's width and height are
swapped too. Covered by tests that check corner **colours**, not just dimensions,
so a wrong rotation cannot pass.

### Metadata

The derivative is drawn onto a fresh surface and re-encoded, so **no original
EXIF survives** — including GPS coordinates. This matters: a geotagged photo
published to a public bucket would be a location leak that no privacy switch in
the product covers. Asserted by a test that builds a JPEG with a real GPS IFD and
checks the derivative carries no EXIF marker.

### Other decisions

| Decision | Value | Why |
| --- | --- | --- |
| Sizes | **One**: 640px longest edge | Covers a 3-up grid on a 430px phone at 3× DPR. A second "feed-sized" derivative is not justified until the feed exists (Phase 1I) — decide it with the feed. |
| Format | JPEG, quality 80 | Universally decodable; one output type keeps the served content-type predictable. |
| Transparency | Composited onto **plain white** | JPEG has no alpha; without the fill a transparent PNG decodes black. Deliberately not a brand colour — image processing is not the place to introduce one. |
| Timing | Synchronous, after the commit | The upload is already committed, so a failure cannot roll it back. |
| Small images | No derivative | Nothing to gain; `DerivativeStatus` records `NotApplicable`. |
| Private media | Never | A private object must not acquire a public URL by way of its thumbnail. |

**Failure is a handled state, not an error.** Generation swallows every
exception, records `DerivativeStatus = Failed`, and the original serves.

**Trip point for a background worker:** if generation measurably raises p95 on
`POST /media/uploads/{id}/complete`, move it to the existing hosted-worker
pattern (`EmailDispatchWorker`) driven by `DerivativeStatus = Pending`.

## 9a. Owner avatar — threat model

The avatar is stored in the **public** bucket, like every pet photo already is.
That is a deliberate choice, and this is the reasoning:

| Question | Answer |
| --- | --- |
| Is the URL guessable? | No. The key is `owner-avatars/{random guid}.jpg` — a flat prefix carrying **no account identifier**, and a random filename. |
| Does the path leak anything? | No. It deliberately does **not** contain the user id, so an owner who shares the image URL does not disclose an internal identifier. |
| Can it be enumerated? | Only if bucket listing were public. R2 buckets are not list-public; this is a deployment invariant worth re-checking. |
| Who learns the URL? | Only the owner, through their own authenticated settings screen. |
| Is it exposed while Social is off? | No. There is no public owner-profile endpoint yet, and the only response carrying the URL is the authenticated self-view. |
| Is a Google/account picture ever published? | **Never.** Nothing copies an external avatar. The owner uploads a file or has none. |
| Replace / delete | The previous `MediaFile` is soft-deleted and both its original and its thumbnail objects are removed. Covered by tests. |

**Phase 1F acceptance criterion, recorded here so it is not forgotten:** when the
public `/u/{handle}` projection is built, it must return the avatar **only** when
`OwnerSocialProfile.IsSocialEnabled` is true, and turning Social off must remove
it from every social projection. The object may remain in the bucket — its URL is
unguessable and already known only to the owner — but it must stop being
*published*.

## 10. Rate limiting

Before this work, **no authenticated endpoint anywhere was rate limited**. Two
policies existed, covering five endpoints, all tag-related.

Eight social policies are now registered in `Program.cs` from
`SocialRateLimitingOptions`. Controllers name a policy and never carry a number.

| Policy | Default | Applied to |
| --- | --- | --- |
| `social-follow` | 30 / hour | Phase 1G |
| `social-like` | 120 / hour | Phase 1H |
| `social-comment` | 20 / 10 min | creating a Moment Comment |
| `social-moment-create` | 20 / hour | Phase 1E |
| `social-search` | 30 / min | Phase 1J |
| `social-handle-availability` | 20 / min | **`GET /social/handles/{handle}/available`** |
| `social-profile-mutation` | 20 / hour | **`PUT /social/me/profile`, `POST /social/me/handle`** |
| `social-withdraw` | 200 / hour | unfollow, unlike, unblock, delete/remove Comment, **`PUT /social/me/pets/{petId}`** |

`PUT /social/me/pets/{petId}` sits under the withdraw budget rather than the
profile-mutation one deliberately. One route carries both joining and leaving,
and the generous budget is the only one that cannot trap a withdrawal behind an
exhausted enable budget — the failure the withdraw policy exists to prevent.
Nothing is opened up by it: the route only ever moves two switches on the
caller's own pets, so it is neither an enumeration surface nor a spam vector,
and the number of pets an owner has is bounded by their plan.

All of them partition by **user id**, not by IP: a household behind one carrier NAT
must not share an allowance, and an attacker rotating addresses must not be
handed a fresh one.

> ### ⚠ In-process limiting is per application instance
>
> These counters live in the memory of **one process**. Two instances behind a
> load balancer allow **twice** these numbers, and a restart resets every window.
>
> This is an accepted trade for a single-instance soft launch.
>
> **Move to a distributed store or to Cloudflare before any of:**
> - a second application instance is run (scale-out, blue/green, or rolling
>   deploys that overlap),
> - autoscaling is enabled,
> - a limit becomes a commercial or safety control rather than an abuse brake.
>
> See `docs/deployment/environment-variables.md`.

The two existing Smart Tag policies are untouched.

---

## 11. Static export constraints

`apps/web` builds with `output: "export"`. **There is no Next.js server in
production.** Consequences for social:

- No Server Actions, no route handlers, no server-side data fetching.
- Social screens (`/feed`, `/explore`, `/search`, `/notifications`) must be
  **fixed paths with no dynamic segment**, statically exported and fetching on
  mount — the pattern `TagFinderView` and `PetSwitcher` already use.
- `/u/{handle}` carries a dynamic segment and must therefore be served by a
  **Cloudflare Pages Function**, mirroring `functions/p/[slug].ts` →
  `edge/publicProfileEdge.ts`. That is Phase 1F; the schema and API support it
  already.

---

## 12. Denormalised counters — none, on purpose

An earlier draft carried stored `FollowerCount`, `FollowingCount`,
`PublicMomentCount`, `LikeCount` and `CommentCount`. **No stored counter column
ships.**

Every one of them had no mutation path and no Phase 1 consumer. A counter that
nothing writes reads zero forever, and the first screen to bind to one would
display that zero as fact. Worse, it invites a later reader to trust a number
whose consistency model was never defined.

The rule adopted: **a denormalised counter ships in the same change as the
transaction that maintains it, and the concurrency test that proves it.**

When each is added, its change must document:

| Counter | Authoritative rows | Updating transaction | Drift risk | Phase |
| --- | --- | --- | --- | --- |
| `FollowerCount` / `FollowingCount` | `OwnerFollows` | Same `SaveChanges` as the follow row | Only if a write path bypasses the service | 1G |
| `LikeCount` | `MomentLikes` | Same `SaveChanges` as the like row | Same | 1H |
| `PublicMomentCount` | `PetMemories` where `Visibility = Public` | Same `SaveChanges` as the visibility change | Same | 1F/1I |
| `CommentCount` | `MomentComments` visible to the current viewer | computed in one grouped query per Moment page | none: rows are authoritative | 2A |

Until then, counts are computed. At current volumes that is correct and fast.

## 12a. Notification deduplication semantics

`OwnerNotifications` has an index on
`(RecipientUserId, Type, ActorUserId, MomentId)` — **an index, not a unique
constraint.** That is deliberate.

A unique constraint here would make a legitimate later event permanently
impossible:

```
Alice likes Mochi's moment      → notify
Alice unlikes
Alice likes again 6 months later → must be able to notify again
```

The same applies to follow → unfollow → follow. A schema rule cannot know
whether a repeat is a genuine new event or a toggle, so it must not be the thing
deciding.

**The chosen policy, to be implemented by the services in 1G/1H:**

- **New follower** — notify on each new follow edge. A re-follow months later is
  a real event and notifies again. A follow/unfollow/follow within a short window
  should be suppressed by the service, not by the schema.
- **Moment liked** — notify the first time an account likes a Moment. A re-like
  after an unlike is a toggle, not news, and is suppressed by the service.
- Suppression windows live in the service, where the intended lifecycle is known
  and can be changed without a migration.

Retention: 90 days, pruned by a job implemented in Phase 2.

## 12b. What Phase 1 actually shipped

The sections above describe the foundation. This is the surface built on it,
as of the end of Phase 1L.

| Surface | Route | Audience |
|---|---|---|
| Per-pet Social consent | Settings → Social profile → Your pets | signed in only |
| Owner social profile | `/u/{handle}` | public |
| Followers / Following | `/u/{handle}/followers`, `/following` | public, `noindex` |
| Home feed | `/feed` | signed in only |
| Explore | `/explore` | public |
| Search | `/search` | public, `noindex` |
| Activity | `/notifications` | signed in only |
| Pet Moments | `/p/{slug}` Moments tab | public |
| Safety → Share Profile bridge | bottom of `/q/{code}` | finder |

**One card projection.** `SocialMomentProjection` turns an already-narrowed
query into Moment cards for every surface. Selection is each caller's job — it
is their only real difference — and the card is built once, so no surface can
quietly start showing a field the others decided not to.

**One visibility policy.** `SocialVisibility` answers "may this appear
socially"; `SocialBlocks.BlockedAccountIds` answers "is either side blocked".
Explore and search add discoverability on top of the first; nothing overrides
it. Cards are built for a named audience — `Discovery` names only subjects that
are themselves discoverable, `Direct` names every socially-enabled subject.

**Discoverability is a discovery control, not a secrecy switch.** A pet or
household with social on and discovery off is still on its own page, still in
the feed of anybody who already follows it, and still refused to Explore,
search, and the subject list of a discovery card.

**The Safety → Share Profile bridge is not a social surface at all.** It depends
only on the Share Profile being switched on and the pet's lifecycle still
serving that page — not on discoverability, and *not on Community
participation*. It briefly required both social switches, which silently
withheld an owner's own share link from every household that had not joined
Community, and it answers the same way whether the finder opened
`/q/{safetyCode}` or scanned a tag. See `ShareProfileBridge.ResolveSlug` and
[`product-model.md`](product-model.md).

**Counts are computed, never stored.** Followers, following and likes are
indexed `COUNT`s. Comment counts use the same `VisibleComments` query as the
thread and are grouped for a whole Moment page, so Block rules cannot make a
card promise rows the viewer cannot open. There is still no counter column
anywhere in Community (see §12).

**Activity is in-app only.** `OwnerNotification` rows carry ids and never
identity; the actor's handle, name and avatar resolve at read time from their
current public profile, which is what stops a blocked or departed account
keeping an identity alive in somebody else's list. No social email exists and
none is planned for Phase 1.

## 12c. Phase 2A Moment Comments

Comments are plain-text household-authored discussion on the canonical Moment
detail page. Pets are never authors. Creating one requires an active account
with an enabled Community profile, handle and display name; reading a public
thread remains anonymous with an optional viewer session for Block filtering.

`SocialVisibility.VisibleComments` is the only read/count predicate. It first
requires the Moment to remain socially visible. It then requires an active,
complete Community identity for the Comment author and applies both Block
boundaries: viewer ↔ Comment author is viewer-specific, while Comment author ↔
Moment author hides that Comment from everybody. Discoverability is not a
secrecy control. Blocking stores no Comment changes, so unblocking restores an
otherwise eligible row.

Threads page from the newest end with a stable `(CreatedAt DESC, Id DESC)`
cursor and render each returned page oldest-to-newest. A `#comment-{id}` link
(Activity uses one) sends that id as `anchor` with the first read: when the
Comment passes the same `VisibleComments` rules and sits within the newest
`MomentCommentService.AnchorWindow` (100) visible Comments, the first page is
widened just enough to include it; otherwise the read is answered exactly as
if no anchor had been sent, and the page lands on `#comments`. An anchor
therefore never reveals whether a hidden or deleted Comment exists. Deletion is a scrubbed
tombstone, not evidence retention: `Body = ''`, with `DeletedAt` and
`DeletedByUserId` set together. The database constraint rejects an active empty
body or an unscrubbed tombstone.

Repeated unread Comment activity from one actor on one Moment is coalesced to
the latest active Comment. Deleting that Comment retargets the unread row to the
actor's latest remaining Comment, or removes it. Read history carries no body
preview. A transaction-scoped SQL Server application lock per actor/Moment pair
makes the 60-second normalized duplicate guard and unread-activity coalescing
deterministic under concurrent retries without permanently forbidding the same
text.

### Known limits at soft launch

- Rate-limit counters are per application instance (§10). Two instances allow
  twice the documented numbers.
- `OwnerNotifications` has a documented 90-day retention and no pruning worker.
  Reads are cursor-paged and bounded; pruning is post-soft-launch ops work.
- Explore's suggestion ordering runs a correlated `MAX` per candidate pet.
  Measured at 10,000 households on a developer machine: ~166 ms. Revisit with a
  maintained `LastPublicMomentAt` when discoverable pets pass roughly 25,000 or
  the query exceeds ~250 ms at p95 in production.
- The single image derivative (640px longest edge) serves both grid tiles and
  the full-width feed card. It is generous for tiles and below 1× density for a
  feed card at DPR 2. Raising the single size costs bytes on every tile for a
  partial fix on one surface; the real answer is a second, larger derivative,
  which is a schema and backfill change deliberately not made before launch.

## 12d. Moment media: one renderer, one route

A Moment card used to draw whatever was in `media[0]` with an `<img>`, whatever
that item actually was. A Moment whose cover was a video therefore arrived as a
broken picture with the file name painted across it. Two things fixed it, and
both are worth keeping.

**The kind comes from the server and nothing guesses it.** Every media item in a
social response carries `type` (`"image"` or `"video"`), taken from
`MediaFiles.MediaType`, and `MediaDerivatives.ResolveListUrl` resolves the URL
from that same fact: an image gets its derivative, a video gets its own file. A
video must never be handed a `_thumb.jpg` — a still frame in a `<video>` element
is a player that cannot play. No client reads the file extension; the extension
of a URL is a naming convention, not evidence.

**One renderer, reused.** `MomentMedia` (grid tiles) and `MomentMediaCarousel`
(full-width cards and the Moment page) are the only two places Community draws
media, and both route videos to the existing `MomentVideoPlayer` / `VideoPoster`
rather than to a second implementation. A surface that grew its own MIME check
would be free to get this wrong again; `socialMomentMedia.test.ts` asserts that
none of them has.

### Resolutions

| Surface | Image | Video |
| --- | --- | --- |
| Grid tile, feed card | derivative (`_thumb.jpg`) | the video file, `preload="metadata"` |
| Moment page (`/moments/{id}`) | original | the video file, `preload="metadata"` |

`SocialMediaResolution.Full` is reached only by loading a single Moment, so the
larger file never multiplies across a listing.

### Video posters are the element's own first frame

`MediaService.ExpectsDerivative` excludes `MediaUploadCategory.MomentVideo`, so a
video row never has a `ThumbnailObjectKey` and there is no generated poster.
Both players instead load metadata and seek to the first frame, which costs a
range request rather than a transcoding pipeline. **Server-side poster
generation is deliberate future work**, not an oversight: it would let a grid
tile render a video without opening a media connection at all. Until then,
`preload="metadata"` is the launch-safe answer, and a video that will not load
says so in words rather than showing a broken frame.

### Autoplay

Off by default. `MomentVideoPlayer` accepts `autoplayWhenVisible`, which the feed
card and the Moment page pass and a grid tile never does. When on it is muted,
`playsInline`, starts at 60% visibility, stops below 15%, yields to any other
video that starts, and never overrules somebody who has pressed pause. The
`autoplay` attribute is never written to the element — visibility decides, so the
browser is never given a standing instruction.

### Alt text is never a file name

Uploads used to seed a media link's alt text from the chosen file, which is how
`KyCatVideo1.mp4` reached a public page: a browser paints alt text the moment the
image behind it fails. `MediaService` no longer seeds it, and
`resolveMomentMediaAlt` drops any stored value shaped like a file name or an
object key in favour of the Moment's title. Legacy rows are covered by the
second rule; no data migration was needed.

---

## 13. Deliberately deferred Community work

Deliberately absent, to be added only in later phases:

- Comment replies, likes, mentions, editing or media
- Reporting and moderation workflows
- Pet-level follow — evaluated, deferred; revisit with real engagement data
- Any social email — a new consent category, not built

---

## 14. Regression boundary

The Smart Tag and finder path is **read-only to this work**. Untouched:

- `/q/{safetyCode}` — Safety Profile
- `/n/{tagCode}`, `/t/{tagCode}` — tag scan entry points
- `QrSafetyService`, `TagScanService`, `SmartTagService`
- Lost Mode, found reports, scan history
- Orders, payments, merchant sales, commissions, inventory
- The email outbox and dispatcher
- Every admin controller

Scanning a physical tag still opens the Safety Profile. No social surface reads
`TagScans` or `FoundReports`.
