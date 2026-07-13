# Field Mapping Matrix — MyPetLink Owner Portal / Public Profile / Safety Profile

**Method:** code trace plus targeted automated tests. F-01 also has a local SQL Server/API/browser round-trip. Rows outside F-01 were not re-run end to end in this implementation phase.

Legend: ✅ verified for the stated evidence · ⚠️ conditional or live test still required · ➖ not applicable.

## Pet fields

| Field | Frontend | API request/endpoint | Entity / DB | Owner reload | Public | Safety | Evidence / issue |
|---|---|---|---|---|---|---|---|
| Name | `PetProfileForm.name` | `Name`, `POST/PUT /api/v1/pets` | `Pet.Name` / `Pets.Name` | ✅ code | ✅ code | ✅ code | Not live-retested here |
| Species / custom species | `species`, `customSpecies` | `Species`, `CustomSpecies` | `Pets.Species`, `Pets.CustomSpecies` | ✅ code | ✅ code | species only | Not live-retested here |
| Breed / gender / colour | matching form fields | matching DTO properties | matching nullable `Pets` columns | ✅ code | ✅ code | ➖ | Not live-retested here |
| Birthday / estimated birth year | age mode fields | `AgeInformationMode`, `Birthday`, `EstimatedBirthYear` | `Pets.Birthday`, `Pets.EstimatedBirthYear` | ✅ automated in existing suite | derived age | derived age | Existing age tests; no new live test |
| Adoption day | `adoptionDate` | `AdoptionDay` | `Pets.AdoptionDay` | ✅ code | ⚠️ timeline flag | ➖ | Not live-retested here |
| General area | profile/contact fields | `GeneralArea`, contact override | `Pets.GeneralArea`, `PetContacts.GeneralAreaOverride` | ✅ code | ⚠️ visibility | ⚠️ visibility | Not live-retested here |
| Bio | `bio` | `Bio` | `Pets.Bio` | ✅ code | ✅ code | ➖ | Not live-retested here |
| Personality tags | `personalityTags` | `PersonalityTags[]` | `Pets.PersonalityTagsJson` | ✅ automated | ✅ code | ➖ | Existing backend tests |
| **Favourite Food** | `favoriteFood`, max 80 | `FavoriteFood`, `POST/PUT /api/v1/pets` | `Pet.FavoriteFood` / nullable `Pets.FavoriteFood` | ✅ automated + local live | ✅ optional | ➖ | **F-01 resolved**; empty input normalizes to `NULL` |
| **Favourite Toy** | `favoriteToy`, max 80 | `FavoriteToy`, `POST/PUT /api/v1/pets` | `Pet.FavoriteToy` / nullable `Pets.FavoriteToy` | ✅ automated + local live | ✅ optional | ➖ | **F-01 resolved**; empty input normalizes to `NULL` |
| Profile theme | `profileTheme` | `ProfileTheme` | `Pets.ProfileTheme` | ✅ code | ✅ code | ➖ | Not live-retested here |
| Profile / cover media | upload controls | media upload flow | media FKs / `MediaFiles` | ✅ code | ✅ code | profile media | Media lifecycle remains live-test required |
| Cover position | X/Y controls | `CoverPositionX/Y` | `Pets.CoverPositionX/Y` | ✅ existing automated test | ✅ code | current safety mapping | Not live-retested here |
| Safety / emergency notes | matching form fields | matching DTO properties | matching `Pets` columns | ✅ code | ➖ | ⚠️ safety visibility | Not changed |
| Lifecycle / memorial / Lost Mode | dedicated controls | dedicated lifecycle endpoints / update flow | matching `Pets` fields | ✅ existing tests/code | conditional | conditional | Not re-run live here |

### F-01 exact round-trip

`PetProfileForm` → `PetPayload.favoriteFood/favoriteToy` → `buildBackendPetPayload` → `CreatePetRequest`/`UpdatePetRequest` → `PetsController` → `PetService` → existing `Pet.FavoriteFood/FavoriteToy` → existing nullable `Pets` columns → `PetDetailResponse` → `BackendPetDetail` → `mapBackendPetToFrontend` → Edit Pet initialization.

Public flow: `PublicProfileService` → `PublicPetProfileResponse` → `BackendPublicPetProfile` → `PublicSharePetProfile`. Values render only when non-empty. QR/Safety response contracts do not include these personality fields.

## Contact and visibility fields

The previously documented contact and 11 visibility mappings remain code-level verified but were not re-executed in this phase. Do not interpret this as a zero-defect or live-verified privacy conclusion.

## Owner profile and care records

These groups were outside F-01/F-02. Their prior static mappings remain, but save/reload/logout-login, authorization, privacy, and error-state behavior are **LIVE-TEST REQUIRED**.

## Product coverage gaps

Weight, microchip/identification, vet details, feeding instructions, behaviour notes, health conditions, structured allergies/medication, and multiple emergency contacts remain product decisions in `enhancements.md`; they were not implemented here.
