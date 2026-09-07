# Owner Portal — Visual E2E Test Matrix

- **Baseline commit:** `396e7d03a3553c322847488f3a8db69bed0792b0` (`fix(db): make generated migration script durable`), branch `main`, clean tracked worktree.
- **Audit date:** 29 August 2026 (application "today" = 2026-08-29 — relevant to all care date states).
- **Environment:** Next.js dev server on `localhost:3000`; ASP.NET Core API on `localhost:5281`; SQL Server LocalDB `MyPetLinkDev` at the current migration head.
- **Feature flag:** `NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED=true` — the documented production soft-launch value, so the audit reflects what a real launched owner sees. Set in the gitignored `apps/web/.env.local` for the run and restored byte-identical afterwards.
- **Test identity:** `plain.owner@mypetlink.local` — a real dev account that started with **zero pets and no contact details**, so every empty state is genuine.
- **Test data:** pet "Mochi" (Cat / British Shorthair), one public Moment, one private Moment, and seven care records spanning every date state.
- **Driver:** Playwright `playwright-core@1.62.1` against installed Chrome, `slowMo: 260ms`, deliberate pauses at every state so the recordings are watchable.

## Viewports

| Name | Size | Used for |
|---|---|---|
| Mobile | 390 × 844 | Journeys 1–7 (primary) |
| Desktop | 1280 × 900 | Journey 8 full portal sweep |

## Recordings

All ten are real, playable `.webm` files produced by Playwright's video recorder.

| # | File | Duration | Viewport | Covers |
|---|---|---|---|---|
| 01 | `videos/01-create-pet.webm` | 30s | 390×844 | Landing → dashboard empty → Add Pet → validation → fill → save → post-create CTA |
| 02 | `videos/02-edit-pet.webm` | 114s | 390×844 | Pet page → editor → all four tabs → dirty Cancel → save → reopen persistence |
| 03 | `videos/03-create-edit-moments.webm` | 63s | 390×844 | Empty state → create → validation → audience + timeline → save → edit → dirty Back → persistence |
| 04 | `videos/04-care-records.webm` | 42s | 390×844 | Care empty → type inventory → validation → Vaccine (Sept due) → Grooming → edit prefill → dashboard |
| 04b | `videos/04b-care-date-states.webm` | 13s | 390×844 | All date states rendered side by side + dashboard due-dates surface |
| 05 | `videos/05-dashboard-navigation.webm` | 51s | 390×844 | Dashboard → Pets → Moments hub → Records hub → Settings → pet profile → completion |
| 06 | `videos/06-sharing-privacy-public-profile.webm` | 42s | 390×844 | Owner Settings contact → Sharing & Privacy → Contact & Safety → owner's view of `/p/` and `/q/` |
| 06b | `videos/06b-anonymous-view.webm` | 23s | 390×844 | **Signed-out** visitor: `/p/` About/Moments/Timeline tabs + `/q/` finder page |
| 07 | `videos/07-mobile-owner-portal.webm` | 79s | 390×844 | Full portal sweep + care delete + moment delete |
| 08 | `videos/08-desktop-owner-portal.webm` | 229s | 1280×900 | Full portal sweep at desktop width |

121 ordered screenshots sit in `screenshots/<recording-name>/NN-<state>.png`.

## Journey coverage

### Journey 1 — Create Pet
| Check | Result |
|---|---|
| Initial / empty dashboard state | Pass |
| Required vs optional fields | Pass — only name + type required |
| Validation on empty submit | Pass — "Pet name is required." |
| Pet type control + option list | Pass — 14 species |
| Breed picker | Pass — species-aware list |
| Age behaviour | Pass — defaults to "Unknown", no invented age |
| Photo upload | **Not testable** — R2 unconfigured locally |
| Loading / saving state | Pass |
| Post-create CTA | Pass — "Go to Mochi's page" + "View public profile" |
| Fabricated defaults | **Pass for the pet record** — every optional field stored `null` |
| Default publication state | **Finding F-06** — public + safety live by default, no consent step |

### Journey 2 — Edit Pet
| Check | Result |
|---|---|
| Basic Info / Appearance / Sharing & Privacy / Contact & Safety | All four reachable at 390px |
| Populated values on open | Pass |
| Clearing optional fields | Pass (verified separately via API contract earlier) |
| Save + persistence after reopen | Pass |
| Cancel while dirty | **FAIL — F-01**, silent data loss |
| Navigation between sections | Pass |
| Mobile layout | Pass — no clipping |

### Journey 3 — Moments
| Check | Result |
|---|---|
| Empty state | Pass |
| Validation (title, date, category all required) | Pass |
| Create → save → list | Pass |
| Audience control (Only me / Anyone with the link) | Pass — defaults to **Only me** |
| Life Timeline toggle | Pass |
| Edit prefill | Pass |
| Dirty Back → discard prompt | Pass — "Discard your changes?" |
| Persistence | Pass |
| Delete + confirmation | Pass |
| Photo/video upload | **Not testable** — R2 unconfigured locally |
| Real privacy behaviour | Pass — verified signed-out (Journey 6b) |

### Journey 4 — Care Records
Types exposed to owners: **Vaccine, Deworming, Grooming, Vet Visit, Medication, Surgery, Lab Test, Other** (8). `Allergy` is correctly excluded from new-record creation.

| Date state | Due date | UI chip | Result |
|---|---|---|---|
| Overdue | 15 Jul 2026 | `Overdue` | Pass |
| Due today | 29 Aug 2026 | `Due today` | Pass |
| Due soon (September) | 01 Sep 2026 | `Due soon` — renders "01 Sept 2026" | Pass |
| Due soon (September) | 03 Sep 2026 | `Due soon` — renders "03 Sept 2026" | Pass |
| Upcoming | 01 Dec 2026 | `Upcoming` | Pass |
| No due date | — | no chip | Pass |

Dashboard "Care due dates" surfaces Overdue + Due today only. Type-specific wording ("Next due" / "Next review" / "Next follow-up") is consistent per type.

| Check | Result |
|---|---|
| Create / validation / edit prefill / delete | Pass |
| Blank provider | **FAIL — F-02**, stored as literal "Owner recorded" |

### Journey 5 — Dashboard / Pet Profile
| Check | Result |
|---|---|
| Completion percentage consistency | Pass — 47% on pet page and expanded steps |
| Recommended actions | Pass |
| Upcoming care | Pass |
| Navigation to all hubs | Pass |
| Empty vs non-empty states | Pass |
| Dead ends | None found |

### Journey 6 — Sharing / Privacy / Public Profile
| Owner selection | Anonymous result | Verdict |
|---|---|---|
| Private Moment (title + caption) | Not present on `/p/` or `/q/` | Pass |
| Public Moment | Visible under `/p/` Moments tab | Pass |
| Care record names / due dates / status | Not present publicly | Pass |
| Provider | Not present publicly | Pass |
| Owner email | Never exposed | Pass |
| `showOwnerName = false` → Public Profile | `ownerDisplayName: null` | Pass |
| `showOwnerName = false` → Safety Profile | **"Owner: Plain Owner" shown** | **FAIL — F-03** |
| WhatsApp finder action | `wa.me/60123456789` correctly normalised | Pass |

### Journeys 7 & 8 — Responsive sweep
53 layout probes across both viewports and every owner screen: **0 clipped elements, 0 horizontal scroll** (`scrollX === 0` everywhere, measured by real scroll attempt, with absolutely-positioned and `aria-hidden` measurement nodes excluded).

## Not performed, and why

| Item | Reason |
|---|---|
| Photo / video upload for pets and Moments | Cloudflare R2 is unconfigured in this environment (`AccountId` and `AccessKeyId` empty), so no upload can complete. Only the affordance ("Add photo" / "Add video") was observed. |
| Google sign-in | OAuth cannot be driven headlessly. The session was injected as a signed dev JWT; every screen after authentication is genuine. |
| Real iOS / Android hardware behaviour | Emulated viewports only — no physical device. Software keyboard, safe-area and native file-picker behaviour remain unverified here. |
| Email delivery | `Email:Enabled=false` and no SMTP credentials in this environment. |
| Smart Tags / tag ordering / payments | Off behind production feature flags; not part of the Owner Portal surface under audit. |
| Multi-pet plan-limit UX | The audit account intentionally held a single pet to keep journeys clean. |
