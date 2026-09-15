# Owner Settings — rendered responsive verification

The automated frontend stack is Vitest with jsdom. **jsdom has no CSS box
model**: it never lays anything out, and every `getBoundingClientRect()` returns
zeroes. No test in this repository can prove a pixel.

So the structural cause is covered by a test
(`apps/web/src/components/portal/SettingsShrinkChain.test.tsx`) and the rendered
result is measured by hand and recorded here. Re-run this table whenever the
Settings layout primitives change.

---

## What broke

At 375px the Social profile card rendered about 30px left of the content area
and was clipped. The measurements at the time:

| Element | Value |
|---|---|
| Viewport | 375 |
| App shell `scrollWidth` / `clientWidth` | 429 / 375 — **54px of overflow** |
| "Your social profile" section `scrollWidth` / `clientWidth` | 412 / 341 |
| Every other settings section | 341 / 341 — fitting exactly |

The shell carries `overflow-x-hidden`, so the excess was clipped rather than
scrollable. That is why it read as "content cut off the left" instead of "the
page scrolls sideways", and why `document.scrollWidth` looked healthy.

### Cause

Two elements have a min-content width far wider than a phone, and a flex or
grid item defaults to `min-width: auto` — it refuses to shrink below that.

1. **A visible `<input type="file">`** (the social avatar picker). Its
   user-agent intrinsic width covers "Choose file / No file chosen" plus the
   `file:` button padding — measured at 312px. The avatar beside it is 64px and
   the gap 16px: **64 + 16 + 312 = 392px**, which is exactly the grid track the
   whole card was being held open to.
2. **Anything with `truncate`**, which sets `white-space: nowrap` and therefore
   makes the min-content the entire unwrapped string. A long pet name in the
   per-pet consent list measured 400px on its own.

Neither could shrink because the flex chain above them had no `min-w-0`.

### Fix

`min-w-0` on the chain, `w-full min-w-0` on the file input so it takes the width
it is given rather than the width it wants, and `flex-wrap` with a sensible
`basis` so the avatar and its control stack instead of colliding. No negative
margins, no fixed widths, and nothing hidden — the shell's `overflow-x-hidden`
now has nothing to hide.

---

## Rendered results

Measured against the dev server at `/settings`, signed in, Social enabled, with
three pets — including one named *Bartholomew Wigglesworth Fluffington the
Third* and a household display name of *The Extraordinarily Long Household Name
of Petaling Jaya*, so the longest realistic strings were on screen throughout.

At each width the check asserted: the shell and `main` overflow by 0px; no
section has a negative left or a right past the viewport; no section's content
overflows its own box; every switch sits inside its card and inside the
viewport; no label overlaps its control; and no element in `main` escapes
either edge.

| Width | Result |
|---|---|
| 320 | pass — 0px overflow, 7 sections, 3 pet rows |
| 360 | pass |
| 375 | pass |
| 390 | pass |
| 430 | pass |
| 768 | pass (753 with scrollbar) |
| 1280 | pass (1265 with scrollbar) |
| 1440 desktop | pass, sidebar visible |

Pet-count states at 375: **0 pets** (empty explanation, 0px overflow), **1 pet**
(row 301px, right edge 338), **3 pets** (all rows 301px). The long pet name
ellipsises instead of widening the card.

Non-Social sections were measured in the same sweep and were correct before and
after: Contact details, Communication preferences and its three nested cards,
Plan & usage. The fix touched only the Social card's avatar row and the per-pet
list, so the other sections were regression checks rather than repairs.
