# Issues Found — MyPetLink Audit

**Audit status: PARTIAL.** Sections below separate *confirmed* issues from *not-yet-verified* scenarios and *product decisions*. A verification gap is **not** a confirmed defect. Evidence levels: `CODE-TRACED` · `AUTOMATED-TEST` · `LOCAL-LIVE` · `PRODUCTION-LIVE` · `NOT-TESTED` · `FAILED`.

---

## A. Confirmed open issues
**None.** No issue in the current tree is presently supported by a reproduced failure, a failing automated test, or a code-level defect. (The two previously reported issues are resolved — see section B.) Items still needing verification are in section C; they are not classified as defects here.

---

## B. Resolved issues

### F-01 — Favourite Food / Favourite Toy were not wired through the API
- **Severity:** Medium · **Module:** Owner Portal → Pet edit · **Route:** `/pets/:id/edit`
- **Evidence level:** `CODE-TRACED`, `AUTOMATED-TEST`, `LOCAL-LIVE`
- **Original problem:** the Edit Pet form exposed Favourite Food/Toy inputs, but the values never reached the API and did not reload.
- **Corrected root cause:** the entity properties **and** DB columns already existed (`Pet.FavoriteFood`/`FavoriteToy`, nullable `Pets.FavoriteFood`/`FavoriteToy`, created by `20260703020004_InitialCreate`). The earlier audit's "no column exists" statement was wrong. The real omissions were the frontend request-payload mapping, the create/update **request** DTO properties, the service assignments, and the detail/public **response** DTO fields + mapping.
- **Fix implemented:** wired the full path; retained both Owner Portal inputs (80-char limit); create normalizes blanks to `NULL`; update distinguishes omitted (unchanged) from empty (clear to `NULL`); detail response returns saved values so Edit initializes/reloads; Favourite Food/Toy render on the public profile only when set; QR/Safety output unchanged.
- **Files changed (per implementation phase):** `PetProfileForm.tsx`, `petService.ts`, `apiDtos.ts`, `PetDtos.cs`, `PetService.cs`, `PetDtoMapper.cs`, `PublicDtos.cs`, `PublicProfileService.cs`, `PublicSharePetProfile.tsx`.
- **Tests added:** backend `PetFavoriteFieldsTests.cs`; frontend `petService.favoriteFields.test.ts`, `PetProfileForm.lifecycle.test.tsx`, `PublicSharePetProfile.test.tsx`.
- **Verification level:** `LOCAL-LIVE` (real API + LocalDB + browser public display) verified. **Remaining live checks:** signed-in browser Edit-Pet save/refresh/logout-login; production deployment.
- **Current status:** **Resolved defect.**

### F-02 — Owner dashboard computed discarded mock data at build
- **Severity:** Low (latent) · **Module:** Owner Portal · **Route:** `/dashboard`
- **Evidence level:** `CODE-TRACED`, `AUTOMATED-TEST`
- **Original problem:** `dashboard/page.tsx` `await getPets()` during static generation; with no `window` on the server, `canUseApi()` was false so local mock (Milo/Luna) was produced and passed as `initialPets`. `DashboardClient` then discarded it in API mode — so it was not user-visible, but it was a latent leak.
- **Fix implemented:** the server page is synchronous and passes empty collections; `DashboardClient` loads real data after `AuthGuard` is ready, with distinct loading/empty/error states and no mock fallback; the plan summary reuses loaded data (no duplicate requests); admin pages continue to seed `EMPTY_ADMIN_DATA`.
- **Files changed:** `app/dashboard/page.tsx`, `DashboardClient.tsx`, `PlanSummaryCard.tsx` (and admin init already using `EMPTY_ADMIN_DATA`).
- **Tests added:** `app/dashboard/page.test.tsx`, `DashboardClient.test.tsx`, `PlanSummaryCard.test.tsx`, `adminService.initialization.test.ts`.
- **Verification level:** `AUTOMATED-TEST`. **Remaining live checks:** signed-in production-like dashboard with empty and failing API accounts.
- **Current status:** **Resolved defect.**

---

## C. Verification gaps (not confirmed defects — require live/automated verification)
1. **Owner Portal full round-trip** — every editable owner/pet/care/moment field: save → reload → logout/login → reopen; special chars/emoji/CJK/Malay; empty/null/max-length; rapid double-submit (no duplicate rows). Evidence today: `CODE-TRACED` (+ `LOCAL-LIVE` for F-01 only).
2. **Public Profile route matrix** — metadata/Open Graph, deleted/archived/private-memorial/invalid-slug states, cache-busting after media replace, production media URLs.
3. **Safety Profile route matrix** — found-location flow + scan history, real QR/NFC status per tag variant, tag states (unclaimed/pending/active/lost/disabled/replaced/archived), Lost-Mode combinations.
4. **Media lifecycle/orphans** — replace/delete removes old R2 object & is no longer publicly reachable; no orphaned `MediaFiles`/`MediaFileLinks`; ownership-validated attach.
5. **Responsive device matrix** — small/standard/large mobile, tablet, desktop, wide; tab "4 + More"; keyboard overlap; safe-area.
6. **Production smoke test** — deployed environment, cold DB (`503 database_waking_up`) bounded-retry UI, real auth session.
7. **Smart Tag reassignment & cache behaviour** — change assigned tag, replace tag, scan-page cache after reassignment.
8. **Privacy combinations** — all 11 visibility flags × Public × Safety surfaces produce the expected inclusion/exclusion.
9. **Lost Mode combinations** — safety page remains accessible with Lost Mode ON; banner + prioritised contact.
10. **Found-location flow** — consent, lat/long validation, `TagScans` persistence.
11. **Authorization / IDOR** — non-owner cannot GET/PUT another owner's pet/media/care/tag (expect 403/404); owner id cannot be spoofed via payload.

---

## D. Product decisions required (do not decide silently in docs)
1. **Emergency contact visibility** — currently gated by `ShowPhone`. Should it have an independent visibility flag?
2. **Safety Note publicity** — currently always returned on the Safety Profile (safe-handling intent). Confirm this is intended.
3. **Favourite Food/Toy on the public profile** — currently shown publicly when set. Confirm they should be public (vs owner-only).
4. **Allergies / Medication** — currently only exist as `CareRecordType` enum values (+ dead client-side `allergies`/`medications: []` placeholders). Decide: active structured fields, care-record types only, or future enhancement.
5. **Microchip / identification number** — not implemented. If added, decide whether it belongs on the Public and/or Safety Profile and whether it is privacy-gated.

---

## Unsupported conclusions explicitly withdrawn
This phase does **not** support "all fields persist correctly", "zero Public/Safety/privacy/responsive defects", or "audit complete". Supported statements are limited to F-01/F-02 and the evidence levels recorded in the matrix, `README.md`, and `test-coverage-report.md`.
