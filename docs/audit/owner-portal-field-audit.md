# Owner Portal Field Audit

## F-01 — Favourite Food and Favourite Toy

**Status:** resolved; code-level, automated-test, and local API/DB round-trip verified.

### Files and flow changed

- Form/payload: `apps/web/src/components/portal/PetProfileForm.tsx`
- Frontend request/response mapping: `apps/web/src/services/petService.ts`, `apps/web/src/services/apiDtos.ts`
- API DTOs: `CreatePetRequest`, `UpdatePetRequest`, and `PetDetailResponse` in `apps/api/MyPetLink.Api/DTOs/PetDtos.cs`
- Backend persistence: `apps/api/MyPetLink.Api/Services/PetService.cs`
- Backend response mapping: `apps/api/MyPetLink.Api/Services/PetDtoMapper.cs`
- Public response/display: `PublicDtos.cs`, `PublicProfileService.cs`, and `PublicSharePetProfile.tsx`

### Corrected behavior

- Form values are trimmed and sent in the frontend request.
- Both API request DTOs accept the fields with an 80-character limit.
- Create normalizes optional blanks to `NULL`.
- Update distinguishes an omitted field (leave unchanged) from an empty string (clear to `NULL`).
- Detail responses return saved values, so Edit Pet initializes and reloads them.
- Special characters, emoji, Chinese, and Malay text are covered by tests and a local database round-trip.
- The normal Public Share Profile shows optional Favourite Food/Toy cards only when values exist.
- QR/Safety pages remain unchanged and do not expose these non-safety personality fields.

### Database correction

The prior audit statement that no entity property or column existed was wrong. Both properties and nullable columns were created by `20260703020004_InitialCreate`. No new migration is needed.

## F-02 — Owner dashboard initialization

**Root cause:** the static server page called client/local-data services during build. With no browser `window`, `canUseApi()` selected local mock data; `DashboardClient` later discarded those seed props in API mode.

**New behavior:**

- `app/dashboard/page.tsx` is synchronous and passes five empty collections.
- `DashboardClient` mounts only after the enclosing `AuthGuard` has confirmed the owner session/API readiness.
- Loading, empty, and retryable error states remain distinct.
- API errors do not substitute mock pets.
- The plan summary consumes the already-loaded dashboard pets/moments, avoiding duplicate pet/moment requests.
- Intentional no-API local preview mode still loads local records through the service layer.

## Evidence boundaries

The local live test exercised the real API and database, not a signed-in browser Edit Pet form. A browser save/refresh/logout/login pass using a real frontend auth session remains **LIVE-TEST REQUIRED**. Other Owner Portal fields were not re-certified by this phase.
