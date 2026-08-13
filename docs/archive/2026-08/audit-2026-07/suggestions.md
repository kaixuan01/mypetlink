# Suggestions

Each item is classified as one of: **Already implemented** · **Confirmed bug** · **Verification gap** · **Product decision** · **Improvement suggestion** · **Optional enhancement** · **Technical cleanup**. Confirmed bugs are tracked in `issues-found.md`, not here.

## Implemented Improvements
| Ref | Item | Classification | Status | Verification level |
|---|---|---|---|---|
| S1 | Favourite Food / Favourite Toy end-to-end persistence | Already implemented (was F-01) | Resolved defect | `CODE-TRACED`, `AUTOMATED-TEST`, `LOCAL-LIVE` (API/DB round-trip + Public Profile browser rendering). Signed-in Owner Portal Edit Pet form save/reload + production: **LIVE-TEST REQUIRED** |
| S2 | Remove build-time mock fetch from `dashboard/page.tsx` (empty initial props) | Already implemented (was F-02) | Resolved defect | `CODE-TRACED`, `AUTOMATED-TEST` (production dashboard still to do) |
| S6 | Regression tests: no mock rows rendered in `apiMode`; static pages pass empty initial data; API failure rejects (no local seed) | Already implemented | Done | `AUTOMATED-TEST` (`DashboardClient.test.tsx`, `adminService.initialization.test.ts`, dashboard page test) |
| S7 | Owner-edit tabs use a "4 + More", width-adaptive pattern | Already implemented | Done (runtime visual check outstanding) | `CODE-TRACED` (`SegmentedTabs` has `visibleTabs`/`hiddenTabs` + More menu + width measurement) |

## Active suggestions (not yet done)
| Ref | Item | Classification | User benefit | Complexity | Priority |
|---|---|---|---|---|---|
| S3 | Remove/finish dead `allergies`/`medications` client placeholders (empty `[]` in `petService` mapping; **not** user-editable) | Technical cleanup | Less dead code/confusion | Small | Soon |
| S4 | Standardise empty-state copy across every Owner/Admin list | Improvement suggestion | Clear onboarding; never spinner/error for empty | Small | Soon |
| S5 | Shared `useAdminResource`-style hook (query key + `enabled: adminReady` + abort) for admin managers | Improvement suggestion | One consistent race-free loader | Medium | Later |
| S8 | Surface request-id on unexpected 500 error states | Improvement suggestion | Diagnosable support | Small | Later |
| S9 | Owner-profile field E2E (save/reload/relogin) | Verification gap (test) | Confidence in persistence | Medium | Soon |
| S10 | Media integrity check (Ready rows ↔ R2 objects; orphans) | Optional enhancement (ops) | Catch orphaned media/objects | Medium | Later |

### Note on S3 classification (code evidence)
`PetProfileForm` does **not** expose editable Allergies/Medication inputs; `petService` only sets `allergies: []`/`medications: []` in its mapping. Because users cannot edit them and no value is silently lost, this is **technical cleanup**, not a confirmed data-loss issue. (Whether Allergies/Medication should become real product fields is Product Decision D-4 in `issues-found.md`.)

All items preserve the current theme and features and do not significantly expand scope.
