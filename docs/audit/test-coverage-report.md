# Test Coverage Report

## Final automated totals

| Suite | Result |
|---|---|
| Frontend Vitest | **22 files, 133 passed, 0 failed** |
| Backend xUnit | **81 passed, 0 failed** |
| Frontend lint | Passed |
| Frontend TypeScript (`tsc --noEmit`) | Passed |
| Frontend production build | Passed (97 static routes generated) |
| Backend Release build/test | Passed, 0 warnings/errors |
| EF pending-model validation | Passed: no changes since latest migration |

## Tests added for F-01

- `apps/api/MyPetLink.Api.Tests/PetFavoriteFieldsTests.cs`
  - Create/update DTO max-length metadata
  - Entity persistence and response mapping
  - Authenticated reload
  - Clear-to-NULL
  - Omitted-field partial-update safety
  - Multilingual/emoji values
  - Privacy-preserving cross-owner 404
  - Controller update envelope
  - Public response mapping
- `apps/web/src/services/petService.favoriteFields.test.ts`
  - backend request payload values
  - explicit clear payloads
  - unrelated partial-update omission
  - API-detail-to-form mapping
- `PetProfileForm.lifecycle.test.tsx`
  - form initialization
  - 80-character input limits
  - save payload
  - reloaded values
  - clear payload
- `PublicSharePetProfile.test.tsx`
  - populated display
  - empty conditional rendering

## Tests added for F-02

- `app/dashboard/page.test.tsx`: server page passes no pet/record/moment/tag/order seed data.
- `DashboardClient.test.tsx`: API-mode loading has no mock content; empty success is legitimate; failure is retryable and has no mock fallback; one dashboard pet request; plan summary receives loaded data.
- `PlanSummaryCard.test.tsx`: dashboard-provided pets/moments do not trigger duplicate service requests.
- `adminService.initialization.test.ts`: `EMPTY_ADMIN_DATA` is empty and API failures reject instead of using local seeds.
- `petService.favoriteFields.test.ts`: intentionally disabled API configuration still supports local-preview mock mode.

## Live verification status

| Scenario | Status |
|---|---|
| Local migration update to latest existing migration | Live-test verified |
| Create/save/query database/reload values | Live-test verified |
| Clear values to database NULL | Live-test verified |
| 81-character API validation | Live-test verified (HTTP 400) |
| Logout/login authenticated API reload | Live-test verified |
| Public API and browser populated/empty conditional display | Live-test verified |
| Signed-in browser Edit Pet form round-trip | **LIVE-TEST REQUIRED** |
| Signed-in browser dashboard empty/failure state | **LIVE-TEST REQUIRED** |
| Production database/API/browser | **LIVE-TEST REQUIRED** |
| Full Public/Safety/privacy/media/responsive matrix | **NOT TESTED in this phase** |

No Playwright/Cypress dependency was added; existing Vitest/Testing Library and xUnit infrastructure was reused.
