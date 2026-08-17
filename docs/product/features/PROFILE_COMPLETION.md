# Feature Spec — Profile Completion

**Work package:** `MPL-GROWTH-001` · **Status:** Ready for implementation
**Date:** 2026-08-17 · **Branch:** `main` @ `a06ab48`
**Roadmap:** [`../GROWTH_AND_PREMIUM_ROADMAP.md`](../GROWTH_AND_PREMIUM_ROADMAP.md)
**Backlog:** [`../FEATURE_DEVELOPMENT_BACKLOG.md`](../FEATURE_DEVELOPMENT_BACKLOG.md)

**Scope: frontend only. No API endpoint, no DTO change, no database migration.**

---

## 1. Current Behaviour

**Pet creation is rich; guidance afterwards is thin.**

- `PetProfileForm.tsx` collects a large number of optional fields. Owners
  frequently save after filling only the required ones.
- After creation, `PetCreationSuccess.tsx` presents exactly one primary action
  (View Profile) and one secondary (Add First Moment) — deliberately narrowed by
  launch fix `MPL-SL-P1-004`.
- The **only** existing completeness nudge is
  `apps/web/src/components/portal/OwnerContactSetupCard.tsx`: a single card,
  shown on Home and after pet creation, that appears when the owner has no
  usable phone or WhatsApp.
- `PetManagementTabs.tsx` shows a Safety Profile badge and, when the status is
  **Contact Update Needed**, an inline warning linking to
  `ownerRoutes.petEdit(pet.id)?tab=contact`.
- `SOFT_LAUNCH_READINESS.md` records "Profile completion meter / onboarding
  checklist — not implemented" and rates it *Medium effort, high activation
  value*.

**Nothing tells the owner what is still worth adding, or why.** The result is
profiles that are technically saved but not yet worth sharing — which starves
the acquisition loop that `MPL-GROWTH-002` will build on.

---

## 2. Goal

Give the owner an honest, calm answer to *"what should I add next?"*, and make
each answer one tap from the editor that resolves it.

**Success looks like:** a higher share of pets reaching a shareable state
(photo + basics + at least one Moment), measured by `completion_action_clicked`
against `completion_prompt_viewed`.

**Non-goals.** This is not gamification, not a score, and not a nag. It never
blocks a flow, never appears on a public surface, and never sends a message.

---

## 3. Percentage or Checklist? — Decision

**Show both, with the checklist as the primary element and the percentage as a
small progress line above it.**

- A percentage alone is a judgement with no next action. It also invites the
  worst failure mode of this feature: an owner who has finished everything they
  care about being told they are "70% complete" forever.
- A checklist alone loses the sense of momentum that gets the second and third
  item done.
- **Invariant:** the percentage is derived from the same item weights the
  checklist renders. There must be exactly one calculation. A test asserts that
  `percentage === completedWeight / applicableWeight`.

---

## 4. UX Flow

### 4.1 Placement

| Surface | What appears | When |
| --- | --- | --- |
| Pet detail — Overview tab (`/pets/[id]`) | Full `ProfileCompletionCard` for that pet | Pet is Active **and** has at least one incomplete applicable item |
| Dashboard (`/dashboard`) | Compact card for **one** pet only | At least one Active pet has incomplete items |
| Everywhere else | Nothing | — |

**Dashboard selection rule:** the Active pet with the **lowest completion
percentage**; ties broken by most recently created. Exactly one card. A list of
five pets each with their own checklist is a chore, not a nudge.

**Relationship to the existing contact card.** `OwnerContactSetupCard` is
account-level (owner contact details); the completion card is pet-level. When
the owner has no usable contact, the contact item appears in the checklist
**and** the existing card may still render — they say the same thing in
different scopes. To avoid a doubled message on the dashboard, the completion
card suppresses its *own* contact item when `OwnerContactSetupCard` is already
rendering on the same screen.

### 4.2 Anatomy

```text
┌────────────────────────────────────────────────┐
│  Milo's profile                                │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  70%                     │
│                                                │
│  ✓  Profile photo                              │
│  ✓  Basic information                          │
│  ✓  Personality                                │
│  ○  Add Milo's birthday              [Add]     │
│  ○  Add your first Moment            [Add]     │
│  ○  Add a contact for finders        [Add]     │
└────────────────────────────────────────────────┘
```

- Completed items are shown, muted, and not actionable — visible progress is the
  point.
- Incomplete items carry one action that navigates to the exact editor.
- Maximum **three** incomplete items are shown at once, ordered by weight then
  by the canonical order in §5. Remaining ones surface as they are resolved.

### 4.3 States

| State | Presentation |
| --- | --- |
| Incomplete | Card as above |
| All applicable items complete | One-line confirmation for one session, then the card disappears. **No trophy, no confetti, no badge.** |
| Memorial pet | No card |
| Archived pet | No card |
| Pet still loading | No card (no skeleton — avoid layout shift on the dashboard) |
| Moments/records fetch failed | Card renders with those items **omitted from numerator and denominator**, never shown as incomplete |

That last row matters: a failed fetch must never accuse an owner of not having
added something they did add.

---

## 5. Completion Rules

### 5.1 Where completion is calculated

**Frontend, in `apps/web/src/lib/profileCompletion.ts`.** Not the API.

Justification from the code:

- Every input already exists on the client. `apps/web/src/types.ts:59` (`Pet`)
  carries `photoUrl`, `breed`, `gender`, `birthday`, `bio`, `personalityTags`,
  `favoriteFoods`, `favoriteToys`, `generalArea`, `publicProfileEnabled`,
  `qrSafetyEnabled`, `hasUsableSafetyContact`, and `lifecycleStatus`.
- `DashboardClient.tsx:108` **already** fetches moments and care records for
  every active pet via `Promise.allSettled`. The data for the two count-based
  items is already in hand.
- The pet detail page already loads the same per-pet data.
- Completion is a **presentation rule**, not a business fact. It has no
  authorization dimension, is never enforced, and will be tuned repeatedly.
  Putting it in the API would mean a migration and a deploy for every copy
  change, and would violate the project's own preference for deriving rather
  than storing (`AGENTS.md` configuration rule 4 — no duplicate sources for one
  business fact).
- The static export has no server render step, so an API-computed value would
  arrive later than the client-derived one anyway.

**Move it server-side only if** completion later drives an email or a
server-side decision. It does not, in MVP or in any planned follow-up.

### 5.2 The checklist

Weights are relative; only ratios matter.

| # | Item | Weight | Complete when | Action target |
| --- | --- | ---: | --- | --- |
| 1 | Profile photo | 3 | `photoUrl` is non-empty | `ownerRoutes.petEdit(id)` |
| 2 | Basic information | 2 | `breed` **and** `gender` are non-empty and not `"Not set"` | `ownerRoutes.petEdit(id)` |
| 3 | Personality | 2 | `personalityTags.length >= 1` | `ownerRoutes.petEdit(id)` |
| 4 | Birthday or age | 2 | `birthday` is a real date **or** `estimatedBirthYear` is set | `ownerRoutes.petEdit(id)` |
| 5 | First Moment | 3 | the pet has ≥1 non-archived, non-deleted Moment | `ownerRoutes.petMomentNew(id)` |
| 6 | Contact for finders | 3 | `hasUsableSafetyContact === true` | `ownerRoutes.petEdit(id)?tab=contact` |
| 7 | About / bio | 1 | `bio` is non-empty | `ownerRoutes.petEdit(id)` |
| 8 | First care record | 1 | the pet has ≥1 care record | `ownerRoutes.petRecords(id, { create: true })` |

**Total applicable weight when everything applies: 17.**

### 5.3 Applicability rules

An item is **excluded from both numerator and denominator** when:

- **Item 6** and `safetyProfilesOwnerUiEnabled === false`
  (`apps/web/src/lib/features.ts`). Do not ask an owner to configure a surface
  the build has hidden.
- **Items 5 and 8** when the corresponding fetch failed (`Promise.allSettled`
  rejection).
- **All items** when the pet is Memorial or Archived — use `isMemorialPet` /
  `isArchivedPet` from `apps/web/src/lib/petLifecycle.ts`.

**Deliberately excluded from the checklist entirely:**

- Anything about Smart Tags or ordering — flagged off, and it would read as an
  upsell inside a helpfulness surface.
- Public Profile *enablement*. Whether to publish is a privacy choice, not an
  incompleteness. Never present "make your pet public" as a missing step.
- Cover photo, favourite foods/toys, allergies, safety note, emergency note,
  general area. All genuinely optional; including them makes 100% unreachable
  for a normal owner and turns the meter into background guilt.

### 5.4 First pet vs additional pets

**Same checklist, different framing.**

- **First pet** (owner has exactly one Active pet): heading emphasises getting
  started — *"Finish Milo's profile"*.
- **Additional pets:** heading is neutral — *"Add more about Milo"*.
- The item set, weights, and thresholds are **identical**. Owners who have done
  this before do not need a different definition of complete, and divergent
  rules would be untestable.

### 5.5 Public Profile readiness

A separate, derived line — **not** a checklist item:

> When items 1, 2 and 5 are complete, show: *"Milo's profile is ready to
> share"* with a link to the Public Share Profile.

Rationale: this is the actual bridge to `MPL-GROWTH-002`. It is a reward for
progress, not another task. It renders only when `publicProfilesEnabled` is true
and the pet's public profile is enabled.

### 5.6 Safety and contact privacy

- Item 6 uses the **server-computed** `hasUsableSafetyContact` when present
  (`apps/web/src/types.ts:104`), falling back to
  `hasUsableSafetyContact()` in `apps/web/src/lib/safetyProfile.ts` for locally
  stored pets. Do not re-derive contact validity in the new module.
- The card **must never display a phone number, WhatsApp number, or email** —
  only whether a usable contact exists.
- Copy reuses the existing vocabulary: *Contact Update Needed*,
  *Safety Profile Active*. It must not invent a competing status label
  (`AGENTS.md` route-conventions section).

---

## 6. API and Data Model Changes

**None.**

No endpoint, no DTO field, no entity, no migration, no App Setting, no admin
screen. If implementation appears to require any of these, stop and revisit this
spec — it means an item was chosen that the client cannot see.

---

## 7. Analytics

Extend `apps/web/src/lib/analytics.ts` using its existing pattern: add to
`AnalyticsEvent`, `AnalyticsPayloads`, `allowedKeys`, and `allowedValues`.

| Event | Fires when | Payload |
| --- | --- | --- |
| `completion_prompt_viewed` | The card becomes visible, **once per pet per page view** | `surface: "owner_portal"` |
| `completion_action_clicked` | An incomplete item's action is activated | `surface: "owner_portal"`, `completion_item: <controlled value>` |

`completion_item` is a new controlled dimension added to `allowedValues` with
exactly these values:

```text
photo · basics · personality · birthday · moment · contact · bio · care_record
```

**Privacy — non-negotiable, and already enforced by the runtime allowlist:**

- ✗ No pet id, name, slug, public code, or safety code.
- ✗ No owner id, name, email, or phone.
- ✗ No completion percentage as a free numeric (it is an unbounded value and is
  not needed to answer the question; the item dimension is sufficient).
- ✗ No free text of any kind.

Analytics remains inert unless `NEXT_PUBLIC_GA_MEASUREMENT_ID` is configured.

---

## 8. Privacy

- The card is **owner-portal only**. It must never render on `/p`, `/q`, `/t`,
  `/n`, `/sample`, or any marketing page.
- Nothing about completion is written to the server, so nothing is exposed
  through any public projection.
- The card reveals no information the signed-in owner does not already have.
- The complete/incomplete state of another owner's pet is unreachable by
  construction — the module is pure and takes only data the client already
  fetched under its own session.

---

## 9. Responsive Behaviour

Verified target: **375 × 812** (the launch audit's mobile baseline).

- Single column below `sm`; the progress line sits above the list.
- Item rows: label wraps; the action stays on one line and never shrinks below a
  **40 px** tap target — the launch audit flagged sub-40 px targets as a P2
  issue, so new controls must not repeat it.
- Long pet names wrap in the heading; no horizontal overflow at any width.
- The progress bar is decorative: it carries `aria-hidden`, and the percentage is
  announced as text.
- Uses existing Tailwind tokens (`pet-ink`, `pet-muted`, `pet-border`,
  `pet-cream`) and existing `ui/` primitives. **No new design system.**

---

## 10. Edge Cases

| Case | Required behaviour |
| --- | --- |
| Pet created seconds ago, moments not yet fetched | Item 5 excluded from both numerator and denominator; no flicker from "incomplete" to "complete" |
| Moments fetch rejects | Item 5 excluded; card still renders |
| Care records fetch rejects | Item 8 excluded; card still renders |
| Owner has 0 Active pets | No dashboard card |
| Owner is over the Free pet limit (early access) | Unaffected — completion is per pet and never mentions limits |
| Pet at the Moments limit with 0 Moments | Impossible; but if the limit is 0, exclude item 5 |
| `birthday` stored as `"Not set"` | Treated as absent (matches `hasDate()` in `lib/petTimeline.ts`) |
| Only `estimatedBirthYear` set | Item 4 **complete** — an estimate is a legitimate answer |
| `safetyProfilesOwnerUiEnabled === false` | Item 6 excluded entirely |
| Pet becomes Memorial while card is on screen | Card disappears on next render |
| Archived pet restored | Card returns |
| All items complete | Confirmation for one session, then nothing |
| Local/mock mode (no `NEXT_PUBLIC_API_BASE_URL`) | Works identically against the local data path |
| Very long pet name (60+ chars) | Wraps; no overflow |
| Screen reader | List is a real `<ul>`; each incomplete item's action has an accessible name including the item, e.g. "Add Milo's birthday" |

---

## 11. Acceptance Criteria

1. `apps/web/src/lib/profileCompletion.ts` exports a **pure** function producing
   `{ percentage, items, isComplete, isReadyToShare }` with no I/O and no
   `Date`-dependent branching beyond what callers pass in.
2. No new network request is introduced anywhere.
3. `percentage` equals completed weight ÷ applicable weight, using the same
   weights the checklist renders.
4. Excluded items affect **neither** numerator **nor** denominator.
5. Every incomplete item's action uses `ownerRoutes` — no hardcoded route
   strings (`AGENTS.md` route conventions).
6. Memorial and Archived pets render no card.
7. Item 6 is absent when `safetyProfilesOwnerUiEnabled` is false.
8. The dashboard renders at most one completion card.
9. No contact value, code, or identifier is rendered in the card.
10. Copy contains no internal or developer wording — no "field", "record type",
    "API", "score", "metadata", "profile completeness".
11. Both analytics events pass the runtime allowlist; no identifier or free text
    is emitted.
12. `completion_prompt_viewed` fires at most once per pet per page view.
13. No horizontal overflow at 375 × 812; all actions ≥ 40 px tall.
14. `npm run lint`, `npm run typecheck`, and `npm run test` pass in `apps/web`.
15. No file under `apps/api`, `migration.sql`, or any migration folder is
    modified.

---

## 12. Test Matrix

### Unit — `profileCompletion.test.ts`

| # | Input | Expected |
| --- | --- | --- |
| 1 | Pet with no optional data, 0 moments, 0 records | All 8 items incomplete; percentage 0 |
| 2 | Everything filled, ≥1 moment, ≥1 record | `isComplete === true`; percentage 100 |
| 3 | Photo + basics + 1 moment only | `isReadyToShare === true`; `isComplete === false` |
| 4 | `birthday: "Not set"` | Item 4 incomplete |
| 5 | `estimatedBirthYear: 2021`, no birthday | Item 4 complete |
| 6 | `hasUsableSafetyContact: false` | Item 6 incomplete |
| 7 | `hasUsableSafetyContact` undefined, visibility+numbers present | Falls back to `safetyProfile.ts`; item 6 complete |
| 8 | `safetyProfilesOwnerUiEnabled === false` | Item 6 absent; denominator reduced by 3 |
| 9 | Moments fetch failed | Item 5 absent from both sides |
| 10 | Care records fetch failed | Item 8 absent from both sides |
| 11 | Memorial pet | Empty item list; card suppressed |
| 12 | Archived pet | Empty item list; card suppressed |
| 13 | Any pet | **Invariant:** percentage equals the ratio of the rendered item weights |
| 14 | `personalityTags: []` | Item 3 incomplete |
| 15 | `personalityTags: ["Playful"]` | Item 3 complete |

### Component — `ProfileCompletionCard.test.tsx`

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | Incomplete pet | Renders heading, percentage, and at most 3 incomplete items |
| 2 | Complete pet | Renders the confirmation state, no checklist |
| 3 | Memorial pet | Renders nothing |
| 4 | First pet vs additional pet | Heading copy differs; items identical |
| 5 | Action activated | `completion_action_clicked` fires once with the correct `completion_item` |
| 6 | Card mounts | `completion_prompt_viewed` fires exactly once |
| 7 | Card re-renders | No duplicate `completion_prompt_viewed` |
| 8 | Ready to share | Public Share Profile link rendered, using `getPublicProfilePath` |
| 9 | `publicProfilesEnabled === false` | No share link |
| 10 | Accessibility | Items form a list; every action has an accessible name |

### Dashboard — extend `DashboardClient.test.tsx`

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | Three incomplete Active pets | Exactly one card, for the lowest-percentage pet |
| 2 | All pets complete | No card |
| 3 | Only Memorial/Archived pets | No card |
| 4 | Moments request rejects | Dashboard still renders; card omits item 5 |
| 5 | `OwnerContactSetupCard` also rendering | Contact item suppressed in the card; message not doubled |

### Manual verification

- `/dashboard` and `/pets/[id]` at 375 × 812 and at desktop width: no horizontal
  overflow, no console errors, tap targets ≥ 40 px.
- Complete one item and confirm the card updates without a page reload.

---

## 13. Explicitly Out of Scope

- ✗ Any API endpoint, DTO field, entity, or migration.
- ✗ Server-side storage of completion or dismissal state.
- ✗ Points, streaks, badges, levels, confetti, or celebratory animation.
- ✗ An account-wide completion percentage across all pets.
- ✗ Email, push, or any out-of-app nudge.
- ✗ Admin Portal visibility of completion.
- ✗ Checklist items for Smart Tags, orders, Premium, or Document Vault.
- ✗ "Make your profile public" as a checklist item.
- ✗ Owner-configurable checklists or dismissible individual items.
- ✗ Changes to `PetProfileForm.tsx` field ordering or validation.
- ✗ A/B testing infrastructure.
