# Owner Sharing Experience

How an owner shares a pet, and where each sharing control lives.

This document is the reference for the owner-facing sharing surfaces only. It
does not change any route, destination, or backend behaviour — the three public
pages keep the meanings defined in `AGENTS.md`.

## The one entry point

`apps/web/src/components/share/ShareCenter.tsx` is the single sharing entry
point. Every owner surface opens the same dialog, so an owner learns sharing
once:

| Surface | Where it appears |
| --- | --- |
| Dashboard pet card | `DashboardClient.tsx` — the primary **Share** action, beside **View** |
| Pet detail hero | `PetDetailHeader.tsx` — the primary **Share** action, beside **Edit** |
| Pet Overview | `PetManagementTabs.tsx` — inside the **Sharing & Safety** section |
| Public Share Profile, viewed by its owner | `PublicProfileOwnerControls.tsx` |

Do not add a second, competing share control to any of these surfaces. If a new
surface needs sharing, render `ShareCenter` there.

## What the dialog offers

The first level answers "I want to share my pet" and stops at four choices:

1. **Share Pet Card** — the rendered image card (`PetShareCard`). This is the
   hero of the dialog: a richer tile carrying the pet's photo, because it is
   the everyday way owners share a pet. The three rows under it are
   deliberately quieter.
2. **Copy Profile Link** — the Public Share Profile address.
3. **Show Profile QR** — the Public Share Profile QR. Named "Profile" because
   MyPetLink also has a Safety QR; the two must never read as the same thing.
4. **More sharing options** — its supporting line depends on what is actually
   available: "Downloads and safety sharing." when the Safety Profile can be
   shared, "More profile options." when it cannot.

The tile is a static preview. The real 1080x1350 image is only requested once
an owner chooses Share Pet Card.

**The profile card is not occasion-dependent.** Any pet with a shareable public
profile can share its profile card, every day of the year. A birthday or
adoption anniversary falling today *adds* a variant to choose from; it never
decides whether the card exists. `ShareCardAvailability.test.tsx` pins this.

Everything rarer sits one level down, under **More sharing options**:

- Download Public Profile QR, Open Public Profile.
- A separate **Safety Profile** block — copy link, show QR, open page — labelled
  "For someone who finds {Pet}." This keeps the finder-facing page distinct from
  the profile an owner shares with friends, without giving it equal weight in
  the everyday sharing flow.

Availability rules:

- Public options require `publicProfilesEnabled` and the pet's public profile to
  be on. When it is off, the dialog says so rather than hiding silently.
- Safety options require `safetyProfilesOwnerUiEnabled`, the pet's safety
  profile to be on, and an active pet.
- The pet card has **no flag of its own**. It is a launched part of the free
  sharing experience, so an eligible public profile always offers it. A
  build-time gate previously hid it whenever a deployment forgot to set the
  variable; do not reintroduce one.

## The Share Card itself

The 1080x1350 portrait card has one canonical composition, and it is owner
approved. It carries, top to bottom: the large hero photo in its rounded frame,
the **circular pet portrait** overlapping below it, the MyPetLink lockup, the
pet's name, one line of metadata, the "Meet {Pet} on MyPetLink" tagline, the
Public Profile QR, the scan instruction, and mypetlink.com.my. **The hero photo
and the circular portrait are both deliberate. Neither is redundant, and
neither may be removed.**

Three refinements are worth knowing about:

- The tagline is a soft tinted pill with dark text, not a saturated primary
  button. The card is a static JPEG, so nothing in it should look pressable.
  The QR is the real action.
- The metadata line drops the species when a breed is present, because a breed
  already implies it: "Domestic Shorthair - 4 years old", not "Cat - Domestic
  Shorthair - 4 years old". With no breed the species leads instead.
- The closing domain line keeps deliberate clear space above the bottom edge.
  `ShareCardFooterSpacingTests` asserts it on the rendered pixels so it cannot
  drift back against the edge.

### Theme awareness

The Share Card follows the pet's selected Public Profile theme through
`ShareCardPalette` - **one layout, a bounded allowlisted palette**. There is no
renderer or template per theme, and no owner-supplied colour ever reaches the
canvas.

A theme may influence: the card background tint, the two decorative blobs, the
supporting metadata text colour, the circular portrait's accent ring, the
tagline fill and text, and the halo around the QR panel.

A theme may never influence: the MyPetLink lockup, the dark primary text, the
white QR panel, the dark QR modules, the quiet zone, the 1080x1350 dimensions,
the composition, or the QR destination. Accessibility and scanability outrank
theme fidelity, and an unknown or retired theme falls back to the MyPetLink
default rather than failing the render.

The theme travels to the renderer as a single bounded key on the public social
projection - normalised to a known value before it leaves the service. No
owner, contact, safety, tag, or internal identifier rides along with it.

### Cache versions

The portrait template versions are the only lever that releases a changed
drawing; the rest of the cache key is identical. Bump the matching constant in
`PublicProfileSocialCardVariants` **and** its mirror in
`apps/web/edge/publicProfileEdge.ts` whenever rendered bytes change - the edge
rejects a mismatched origin response rather than serving a stale card. Leave
the Open Graph version alone when only the portrait cards change.

The dialog always reopens on the first level, is named on every panel, traps
focus, closes on Escape, and returns focus to the control that opened it.

## Pet Overview: Sharing & Safety

The Pet Overview has one **Sharing & Safety** section. Inside it the two
profiles are **equal siblings** — side by side on desktop, stacked on mobile —
built from the same `ProfileSubcard` so neither can drift into looking like the
more important half:

| | Public Profile | Safety Profile |
| --- | --- | --- |
| Status | Public / Private | Safety Profile Active / Contact Update Needed / Safety Profile Off |
| Description | one line | one line |
| Metadata | — | `General area · {area}` |
| Action | Share (opens the Share Center) | Show Safety QR |
| Link | View profile → | View profile → |

Rules that keep the two halves balanced:

- One action and one quiet link per side. **No Copy Link here** — copying
  belongs to the Share Center, and repeating it made the safety half heavier.
- The general area is a line of metadata, never a filled panel with its own
  label.
- The contact warning is a compact inline notice, not a full card.

**Lost Mode** is the same `LostModeControl` in its `compact` variant, rendered
as one full-width row *below* both subcards. It belongs to safety conceptually,
but nesting it inside the Safety subcard made that column tower over the other.
All of its rules, confirmations, and API behaviour are unchanged.

Urgent styling belongs to an urgent state. While Lost Mode is **off** the row is
a status line and a quiet teal text action ("Turn on Lost Mode →") with no coral
anywhere. Coral appears only in the activation confirmation and once Lost Mode
is actually **on**, where the missing-pet notice stays prominent.

Long URLs are not printed by default; the address is available through Copy Link
and the QR panels.

## Section order

Pet Overview reads top to bottom as: hero → profile completion → Sharing &
Safety → Pet Memories → Care Records → Smart Tags. Each of the last three offers
one primary action and one quiet text "View all", so no single feature shouts louder
than sharing.

## Sharing a card versus sharing a link

These are two different things and should stay that way.

- **Plain profile share** - the owner sends the Public Profile URL, and the
  receiving platform renders its own preview from our Open Graph metadata and
  the 1200x630 OG image.
- **Share Pet Card** - the owner sends the 1080x1350 JPEG with a short caption
  and the profile link. The QR lives inside the image.

Do not replace platform OG previews with the portrait card, and do not expect a
messaging app to show both.

## One share, one native call

`Share` inside the Share Card makes **exactly one** `navigator.share` call.
Where the target accepts files it receives `{ files: [card], text, title }`,
with the profile URL inside `text`; the URL is not also passed as `url`,
because targets that take files commonly drop it, and those that keep both
would show the same link twice. Where files are unsupported the single call
carries `{ text, title, url }` instead.

**The receiving app decides how to present that payload.** WhatsApp, for
example, attaches the image and places the caption as its own message. That is
WhatsApp's choice, not two share actions on our side. Do not try to defeat it
by automating the target app or by using undocumented attachment links.

Fallbacks stay explicit: a cancelled share is silent, a failed share copies the
profile link, and an image is never downloaded on the owner's behalf.

## Analytics

`ShareCenter` reports through the existing provider-neutral events with a
`surface` of `owner_portal` or `public_profile`. It adds no new event names and
no new keys, so the runtime allowlist is unchanged.
