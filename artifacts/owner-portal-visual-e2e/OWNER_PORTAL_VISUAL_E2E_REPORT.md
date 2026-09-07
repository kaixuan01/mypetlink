# MyPetLink Owner Portal — Visual E2E / UX Audit

**Baseline** `396e7d03a3553c322847488f3a8db69bed0792b0` · branch `main` · clean tracked worktree
**Date** 29 August 2026 · **Viewports** 390×844 and 1280×900 · **Nothing was modified, committed, pushed or deployed.**

Evidence: 10 playable `.webm` recordings (~11½ minutes total) and 121 ordered screenshots, all produced by driving the real application against the real API and database.

---

## 1. Overall verdict

**The Owner Portal is in good shape and feels finished.** Every core journey — create a pet, edit it, add Moments, add care records, navigate the dashboard, share a profile — completes without a dead end, without a broken layout, and without fabricated pet data. Responsive quality is genuinely strong: **53 layout probes across both viewports found zero clipped elements and zero horizontal scroll.**

Three findings deserve attention before this is put in front of real owners. One is a privacy contradiction where the product does the opposite of what a setting explicitly promises; one silently destroys typed input; one writes invented content into the owner's records. None of them break the product, but all three erode trust in exactly the areas where a pet-safety product needs it most.

**No P0. Three P1. Four P2. Five P3.**

---

## 2. P0 / P1 blockers

There are **no P0 issues**.

| ID | Severity | Title | Journey |
|---|---|---|---|
| **F-01** | **P1** | Edit Pet "Cancel" silently discards typed changes with no warning | 2 |
| **F-02** | **P1** | Blank Provider is stored as the invented string "Owner recorded" | 4 |
| **F-03** | **P1** | "Show owner name" is ignored by the Safety Profile, which its own help text says it controls | 6 |

---

## 3. Journey results

| # | Journey | Result | Notes |
|---|---|---|---|
| 1 | Create Pet | **Pass** | No fabricated pet data. Clean validation, clear post-create CTA. |
| 2 | Edit Pet | **Fail** | All four tabs work and persist; Cancel destroys unsaved input (F-01). |
| 3 | Moments | **Pass** | Strongest flow in the product. Proper discard prompt, correct privacy. |
| 4 | Care Records | **Fail** | Every date state correct including September; provider fabrication (F-02). |
| 5 | Dashboard / Pet Profile | **Pass** | Completion consistent at 47%; no dead ends; no duplicated information. |
| 6 | Sharing / Privacy / Public Profile | **Fail** | Moment and care privacy are correct; owner name leaks to finders (F-03). |
| 7 | Mobile Owner Portal (390) | **Pass** | Zero clipping; delete flows confirm before destroying. |
| 8 | Desktop Owner Portal (1280) | **Pass** | Zero clipping; layout adapts sensibly. |

**Passed: 6 · Failed: 3** (Journeys 2, 4 and 6 each carry one P1; everything else in those journeys passed.)

---

## 4. Functional findings

### F-01 — Edit Pet "Cancel" silently discards typed changes · **P1**

- **Journey** 2 · **Route** `/pets/{id}/edit` · **Viewport** 390×844
- **Video** `videos/02-edit-pet.webm` @ **~0:38–0:52**
- **Screenshots** `screenshots/02-edit-pet/05-bio-typed-dirty.png` → `06-after-cancel-click.png`

**Steps to reproduce**
1. Open a pet, tap **Edit**.
2. Type into any field — e.g. the bio: "Mochi is a shy indoor cat who loves the window."
3. Tap **Cancel**.

**Expected** — Either a confirmation ("Discard your changes?") or the changes preserved. The Moment editor in this same product does exactly this.

**Actual** — Immediate navigation to the pet page. No in-page prompt, no native dialog, no toast. The typed text is gone. Verified with a dialog listener attached: `native dialogs captured: []`, `in-page discard prompt present: false`, and on reopening the field the typed text is absent.

**Impact** — Silent data loss on a routine action. It is worse on mobile, where Cancel sits next to Save and is easy to hit. It is also an internal inconsistency: the Moment editor guards this correctly, so the product teaches owners that unsaved work is protected, then breaks that promise in the pet editor.

**Likely cause** — Cancel is a plain `Link` to the pet route; the pet form has no dirty-state guard equivalent to the Moment editor's `FormDialog` discard flow.

**Recommended fix** — Reuse the Moment editor's discard confirmation for the pet form's Cancel and any in-app navigation away from a dirty pet form.

---

### F-02 — Blank Provider is stored as the invented string "Owner recorded" · **P1**

- **Journey** 4 · **Route** `/pets/{id}/records` · **Viewport** 390×844
- **Video** `videos/04-care-records.webm` @ **~0:22–0:38**
- **Screenshots** `screenshots/04-care-records/08-care-names-filled.png`, `12-care-edit-open.png`

**Steps to reproduce**
1. Add a care record. Leave **Provider** empty (its placeholder reads "Happy Paws Vet").
2. Save, then reopen the record for editing.

**Expected** — Provider stays empty; the card may *display* a neutral fallback.

**Actual** — The stored record has `provider: "Owner recorded"`, and that literal string is pre-filled into the editable Provider input on reopen, as if the owner had typed it.

**This is a frontend-only fabrication.** Creating the same record straight against the API with the provider omitted or blank correctly stores `provider: null`. Confirmed both ways.

**Impact** — This is the one place where the product invents content the owner never entered, and it lands in a health record. A record can end up asserting a care provider that does not exist. On reopening, the owner cannot tell what they actually entered. It also makes "blank means blank" untrue in the one area — pet health — where accuracy matters most.

**Likely cause** — `apps/web/src/components/portal/RecordsManager.tsx:345`: `provider: form.provider.trim() || "Owner recorded"` substitutes at write time. A separate display-time fallback already exists at `recordService.ts:590`, so the write-time substitution is redundant as well as wrong.

**Recommended fix** — Send `null` when the field is blank and keep the display-time fallback for presentation only.

---

### F-04 — Pet editor Save can fire multiple concurrent updates · **P2**

- **Journey** 2 · **Route** `/pets/{id}/edit` · Evidence `scripts/_probe-ux.mjs`
- Three rapid taps on **Save Changes** produced **3 PUT requests**; the button was **not disabled** after the first click.
- **Impact** — Redundant concurrent writes on slow mobile connections. Harm is bounded (same payload, last write wins), so this is not a P1.
- **Good news** — *Creation* flows are safe: three rapid taps on **Add Moment** produced exactly **1 POST** and one record, because the dialog unmounts immediately.
- **Recommended fix** — Disable the pet editor's submit button while a save is in flight, matching the create flows.

---

### F-05 — Owner pet routes return HTTP 404 while rendering correctly · **P3**

- **Route** `/pets/{id}` and `/pets/{id}/edit` · Evidence `scripts/_probe-cancel-and-404.mjs`
- Every owner pet page returns **HTTP 404** and then renders correctly via the client-side route fallback. This is the documented consequence of static export plus runtime-resolved pet ids, and these routes are `noindex`, so there is no SEO impact.
- **Impact** — Cosmetic today, but it will pollute error monitoring and analytics once real traffic arrives, and it makes genuine 404s harder to spot.
- **Recommended fix** — None required for launch; worth a note in monitoring configuration so these are filtered.

---

## 5. Privacy / truth findings

### F-03 — "Show owner name" is ignored by the Safety Profile · **P1**

- **Journey** 6 · **Routes** `/pets/{id}/edit` (Contact & Safety) vs `/q/{safetyCode}` · **Viewport** 390×844
- **Videos** `videos/06-sharing-privacy-public-profile.webm` @ **~0:24–0:36** (the owner's setting), `videos/06b-anonymous-view.webm` @ **~0:14–0:23** (what a stranger sees)
- **Screenshots** `screenshots/06-sharing-privacy-public-profile/07-safety-tab.png`, `screenshots/06b-anonymous-view/10-anon-safety-profile-top.png`

The control's own help text reads:

> "Show the owner name to people viewing this pet's **Public Profile or Safety Profile**."

**Steps to reproduce**
1. Edit a pet → **Contact & Safety** → leave **Show owner name** unchecked (the default).
2. Open `/q/{safetyCode}` in a signed-out browser.

**Expected** — No owner name anywhere on the finder page.

**Actual** — The finder page shows **"Owner: Plain Owner"**. The anonymous API response carries `contact.ownerDisplayName: "Plain Owner"` regardless of the setting.

**Controlled proof** — toggling the single setting and re-reading both public endpoints:

| `showOwnerName` | `/p/` Public Profile | `/q/` Safety Profile |
|---|---|---|
| `false` (owner's choice) | `null` ✅ | `"Plain Owner"` ❌ |
| `true` | `"Plain Owner"` ✅ | `"Plain Owner"` |
| `false` (restored) | `null` ✅ | `"Plain Owner"` ❌ |

The Public Profile honours the setting exactly. The Safety Profile ignores it in both states.

**Impact** — The owner's real name is disclosed to anyone who scans a QR tag, taps an NFC tag, or opens the link, after the owner explicitly chose to withhold it. For a lost-pet product the finder page is the most widely shared surface that exists. This is a settings-integrity failure, not merely a copy problem — the control is present, explicit about this surface, and disregarded.

It is P1 rather than P0 because the exposed datum is a display name rather than contact details or credentials, and no other private data leaks.

**Recommended fix** — Apply `showOwnerName` when projecting `contact.ownerDisplayName` in the safety endpoint. If showing a name to finders is a deliberate safety decision, then the setting must not claim to govern the Safety Profile, and the finder page should say why the name is shown.

---

### What privacy gets right

This deserves equal weight, because it was tested adversarially from a genuinely signed-out browser and held up:

- A **private Moment's title and caption never appear** on `/p/` or `/q/`, including inside the lazily-rendered Moments and Timeline tabs.
- A **public Moment appears exactly where the owner said it should**, and nowhere else.
- **No care record leaks**: no care name, due date, status, provider, or notes reaches any public surface.
- The **owner's email is never exposed**.
- The **WhatsApp finder action is correctly built** — `0123456789` typed in Settings became `wa.me/60123456789`, properly normalised to Malaysian E.164.

### F-06 — New pets are published by default with no consent moment · **P2**

- **Journey** 1 · Evidence: pet created through the UI immediately has `publicProfileEnabled: true` and `qrSafetyEnabled: true`.
- Nothing in the Add Pet flow mentions that saving creates a **publicly reachable page** at `/p/{slug}` and a live finder page at `/q/{code}`. The owner discovers this afterwards on the pet page.
- **Impact** — The defaults are defensible for this product, and the public page exposes only benign fields. But "your pet now has a public web page" is a meaningful fact to learn *after* the fact. A single line in the Add Pet form or the post-create screen would close the gap.
- **Recommended fix** — State it on the post-create screen next to the existing "View public profile" CTA.

---

## 6. Visual / UX findings

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| **F-07** | P2 | **Inconsistent dropdown implementations.** Add Pet uses custom button/listbox comboboxes for Pet type and Breed; the Moment and Care dialogs use native `<select>`. They look and behave differently — native pickers open the OS wheel on mobile, the custom ones open an in-page list. | `screenshots/01-create-pet/06-pet-type-open.png` vs `screenshots/03-create-edit-moments/…-moment-category-chosen.png` |
| **F-08** | P3 | **Dialog focus lands on the Close button.** Opening the Moment editor focuses "Close moment editor" rather than the first field or the dialog itself. The focus trap is otherwise correct — 25 Tab presses never escaped, and Escape closes. | `scripts/_probe-ux.mjs` |
| **F-09** | P3 | **Touch targets below 24px.** Settings communication checkboxes are 20×20px (three are the disabled "Premium care reminders", one is the live "MyPetLink news and offers"). The dashboard "View all" link is 54×19px. | `screenshots/07-mobile-owner-portal/08-settings.png` |
| **F-10** | P3 | **"Memory note" header on every text-only Moment**, while "Memory" is also a selectable category. A Moment categorised "First Day Home" still displays "Memory note" above it, which reads as a contradiction. | `screenshots/03-create-edit-moments/…-moment-persisted.png` |
| **F-11** | P3 | **Disabled checkboxes for Coming Soon features.** The three Premium reminder controls render as unchecked disabled checkboxes, which reads as "you switched these off" rather than "not available yet" — though the "COMING SOON" badge and explanatory copy above them do mitigate it. | `screenshots/07-mobile-owner-portal/08-settings.png` |
| **F-12** | P2 | **Pet page loading state is slow enough to be caught repeatedly.** "Getting this pet's profile ready…" persisted past 2.2s on every visit during recording. It is a friendly placeholder, but it appears on every pet-page navigation. | `videos/02-edit-pet.webm` @ 0:00–0:04 |

### What the UI gets right

- **Zero horizontal overflow anywhere.** 53 probes, both viewports, every screen — `scrollX` stayed 0 and no visible leaf element crossed the viewport edge.
- **No bottom-nav overlap.** No control was ever trapped under a fixed bar.
- **Validation is clear and specific** — "Pet name is required.", "Add a moment title.", "Choose a moment date.", "Choose a moment category." All plain language, no jargon.
- **Destructive actions confirm.** Both care-record and Moment deletion showed a confirmation step before destroying anything.
- **Type-aware terminology in care records** — "Next due" for vaccines, "Next review" for medication, "Next follow-up" for surgery and lab tests.
- **Focus indicators are visible** on every real interactive element in the tab order.
- **Completion percentage is consistent** between the pet page and the expanded step list (47%/47%), and the step list correctly marks what is done.

---

## 7. Responsive findings

**Nothing to fix.** Both viewports were measured with real scroll attempts rather than `scrollWidth`, with absolutely-positioned and `aria-hidden` measurement nodes excluded — the SegmentedTabs measurement row in particular reports a false overflow if naively measured, and was correctly excluded.

| Screen | 390×844 | 1280×900 |
|---|---|---|
| Dashboard | Clean | Clean |
| Pets list | Clean | Clean |
| Pet profile | Clean | Clean |
| Edit — all four tabs | Clean | Clean |
| Moments (+ dialog) | Clean | Clean |
| Care records | Clean | Clean |
| Life Timeline | Clean | Clean |
| Settings | Clean | Clean |
| Share sheet | Clean | Clean |
| Public profile (anon) | Clean | — |
| Safety profile (anon) | Clean | — |

All four Edit tabs remain visible and reachable at 390px.

---

## 8. Recommended fix batches

**Batch A — trust and correctness (do before real owners arrive)**
1. **F-03** — honour `showOwnerName` in the safety endpoint's contact projection, or correct the setting's help text and explain the finder-page behaviour.
2. **F-02** — stop writing "Owner recorded"; send `null` and keep the existing display-time fallback.
3. **F-01** — reuse the Moment editor's discard confirmation for the pet editor's Cancel.

Three small, independent changes; each has an obvious test.

**Batch B — polish**
4. **F-04** — disable the pet editor submit button while saving.
5. **F-06** — one line on the post-create screen about the public page.
6. **F-07** — pick one dropdown pattern and apply it everywhere.
7. **F-12** — review pet-page load; consider skeleton content over a full-screen placeholder.

**Batch C — accessibility backlog**
8. **F-09** — raise checkbox and small-link hit areas to 24px minimum.
9. **F-08** — focus the dialog container or first field instead of Close.
10. **F-10**, **F-11** — copy and control-style cleanups.

---

## 9. Evidence index

### Videos — `artifacts/owner-portal-visual-e2e/videos/`
```
01-create-pet.webm                      30s   390x844   1.0 MB
02-edit-pet.webm                       114s   390x844   2.7 MB
03-create-edit-moments.webm             63s   390x844   1.5 MB
04-care-records.webm                    42s   390x844   1.6 MB
04b-care-date-states.webm               13s   390x844   0.8 MB
05-dashboard-navigation.webm            51s   390x844   1.2 MB
06-sharing-privacy-public-profile.webm  42s   390x844   1.3 MB
06b-anonymous-view.webm                 23s   390x844   0.9 MB
07-mobile-owner-portal.webm             79s   390x844   2.9 MB
08-desktop-owner-portal.webm           229s  1280x900   7.6 MB
```

### Screenshots — `artifacts/owner-portal-visual-e2e/screenshots/`
121 PNGs in ten folders named after their recording, numbered in the order they occurred:
`01-create-pet/` (14) · `02-edit-pet/` (11) · `03-create-edit-moments/` (25) · `04-care-records/` (13) · `04b-care-date-states/` (4) · `05-dashboard-navigation/` (7) · `06-sharing-privacy-public-profile/` (8) · `06b-anonymous-view/` (11) · `07-mobile-owner-portal/` (16) · `08-desktop-owner-portal/` (12)

### Supporting material
- `scripts/` — every journey and probe script, so any finding can be re-run.
- `_notes/` — raw JSON captures: layout probes, extracted page text, control inventories, console errors.
- `TEST_MATRIX.md` — full coverage matrix and environment detail.

---

## 10. Issue count

| Severity | Count | IDs |
|---|---|---|
| P0 | 0 | — |
| P1 | 3 | F-01, F-02, F-03 |
| P2 | 4 | F-04, F-06, F-07, F-12 |
| P3 | 5 | F-05, F-08, F-09, F-10, F-11 |

---

## 11. Tests that could not be performed

| Item | Why |
|---|---|
| Photo / video upload (pet photo, Moment media) | Cloudflare R2 is unconfigured in this environment — `AccountId` and `AccessKeyId` are empty, so no upload can complete. Only the "Add photo" / "Add video" affordances were observed. **No upload defect is claimed or ruled out.** |
| Google sign-in | OAuth cannot be driven headlessly. A signed dev JWT was injected instead; every screen after authentication is genuine. |
| Real device behaviour — software keyboard, safe-area insets, native file picker, iOS Safari, PWA standalone | Emulated viewports in headless Chrome only. These need physical hardware. |
| Email behaviour | Email is globally disabled and no SMTP credentials exist in this environment. |
| Smart Tags, tag ordering, payments, receipts | Off behind production feature flags; outside the Owner Portal surface. |
| Multi-pet and plan-limit UX | The audit account deliberately held one pet to keep journeys legible. |

### Methodology notes worth knowing

Two things in this codebase produce **false** audit findings if measured naively, and were explicitly controlled for:

1. **The public profile renders its tabs lazily.** An initial page-text capture shows only the About panel, which makes a correctly-published public Moment look missing. The Moments and Timeline tabs must be clicked before the panel exists in the DOM. My first pass hit this and the "missing public moment" reading was discarded as a measurement gap, not reported as a bug.
2. **`scrollWidth` is not evidence of horizontal scroll** here — `body` sets `overflow-x: hidden`, and the SegmentedTabs component renders an `aria-hidden`, absolutely-positioned measurement row that inflates it. All overflow conclusions in this report come from attempting a real scroll and reading `scrollX`, with those helper nodes excluded.

---

*Audit only. No application code was modified. Nothing was committed, pushed or deployed. The `apps/web/.env.local` feature flag used for the run was restored byte-identical, and the tracked worktree is clean.*
