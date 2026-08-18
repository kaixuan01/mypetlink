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

1. **Share Pet Card** — the rendered image card (`PetShareCard`), including the
   birthday and adoption variants when the occasion applies that day.
2. **Copy Profile Link** — the Public Share Profile address.
3. **Show QR** — the Public Share Profile QR.
4. **More sharing options**.

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
- The pet card requires `shareCardsEnabled`.

The dialog always reopens on the first level, is named on every panel, traps
focus, closes on Escape, and returns focus to the control that opened it.

## Pet Overview: Sharing & Safety

The Pet Overview has one **Sharing & Safety** section instead of two equally
large cards. It holds:

- **Public Profile** — status badge, one line of description, Share Center, and
  a View link.
- **Safety Profile** — status badge (Safety Profile Active / Contact Update
  Needed / Safety Profile Off), one line of description, the contact warning
  when it applies, copy/QR/view actions, and the general area.
- **Lost Mode** — the same `LostModeControl`, rendered in its `compact` variant.
  Lost Mode is a safety state, so it lives with safety rather than as its own
  top-level card. All of its rules, confirmations, and API behaviour are
  unchanged.

Long URLs are not printed by default; the address is available through Copy Link
and the QR panels.

## Section order

Pet Overview reads top to bottom as: hero → profile completion → Sharing &
Safety → Pet Memories → Care Records → Smart Tags. Each of the last three offers
one primary action and one quiet "View All", so no single feature shouts louder
than sharing.

## Analytics

`ShareCenter` reports through the existing provider-neutral events with a
`surface` of `owner_portal` or `public_profile`. It adds no new event names and
no new keys, so the runtime allowlist is unchanged.
