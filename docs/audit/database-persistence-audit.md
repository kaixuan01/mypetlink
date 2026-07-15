Audit status: PARTIAL
This report includes static code inspection of all persistence flows, one local-live round-trip (F-01), and the automated tests that exist. It is not a complete production persistence certification.

# Database Persistence Audit

Evidence: `CODE-TRACED` · `AUTOMATED-TEST` · `LOCAL-LIVE` · `PRODUCTION-LIVE` · `NOT-TESTED`. Per-flow: Input → DTO → Service/endpoint → Entity → Table/Column → Create/Update/Clear/Reload behaviour → Test coverage → Live → Risk.

## 1. Pet core (`Pets`)
- **Input:** `PetProfileForm` → `PetPayload` → `buildBackendPetPayload` → `CreatePetRequest`/`UpdatePetRequest` → `PetsController` → `PetService` → `Pet` → `Pets.*` → `PetDetailResponse`.
- **Create:** assigns normalized values. **Update:** `if (request.X is not null)` per field → no null-overwrite on partial saves. **Clear:** empty strings normalize to `NULL` where nullable. **Reload:** detail response returns saved values.
- **Test coverage:** age (`PetServiceAgeTests`), personality tags (`PetServicePersonalityTagsTests`), favourite fields (`PetFavoriteFieldsTests`), cover position. **Live:** favourite fields only. **Risk/gap:** all other columns not live round-tripped; concurrency/duplicate-submit not tested.

## 2. Favourite Food / Toy (F-01) — `Pets.FavoriteFood`/`FavoriteToy`
Columns pre-existed (`20260703020004_InitialCreate`, `nvarchar(max) NULL`; product limit 80 enforced in UI+API). No new/alter migration was added (would duplicate columns or misrepresent schema). Create normalizes blanks→`NULL`; update omitted=unchanged vs empty=clear; detail/public responses map values. **Test:** `AUTOMATED-TEST`. **Live:** `LOCAL-LIVE` (create, GET, direct `sqlcmd`, clear-to-NULL, 81-char→HTTP 400, logout/login reload). **Risk:** production SQL config + browser Edit-form pass outstanding.

## 3. Owner profile (`OwnerProfiles`, `Users`)
- DisplayName, PhoneE164, WhatsappE164, DefaultGeneralArea, PrivacyDefaultsJson, NotificationPreferencesJson via `UpdateOwnerProfileRequest`. Email read-only. **Evidence:** `CODE-TRACED`. **Live:** `NOT-TESTED`. **Risk:** save/reload/logout-login round-trip unverified; JSON blobs (privacy/notifications) shape unverified live.

## 4. Pet contact (`PetContacts`) & visibility (`PetPublicProfiles`/`PetSafetySettings`)
- Contact override + 11 visibility flags persist and drive public/safety filtering. **Evidence:** `CODE-TRACED`. **Live:** `NOT-TESTED`. **Risk:** privacy-flag combinations unverified live.

## 5. Care records (`CareRecords` + `MediaFileLinks`)
- Type/Title/Date/DueDate/Provider/Notes/PublicVisibility + attachments. **Evidence:** `CODE-TRACED`. **Live:** `NOT-TESTED`. **Risk:** attachment linkage + public-visibility gating unverified live.

## 6. Moments / memories (`PetMemories` + `MediaFileLinks`)
- Title/Date/Type/Caption/Visibility/flags/TimelineNote + ordered media + cover. **Evidence:** `CODE-TRACED`. **Live:** `NOT-TESTED`. **Risk:** media ordering (`SortOrder`), cover selection, visibility unverified live.

## 7. Media (`MediaFiles`, `MediaFileLinks`, `Pets.ProfileMediaFileId`/`CoverMediaFileId`)
- init→PUT→complete validates size + content-type before `Ready`; replace marks old deleted + deletes object. **Evidence:** `CODE-TRACED`. **Live:** `NOT-TESTED`. **Risk:** orphan prevention (Ready row ↔ R2 object), replace/delete public-reachability — see `media-audit.md`.

## 8. Smart tags / scans (`SmartTags`, `TagScans`, `TagOrders`, `PaymentProofs`)
- Tag status transitions, assignment (assign/change/replace), scan recording, found-location consent. **Evidence:** `CODE-TRACED`. **Live:** `NOT-TESTED`. **Risk:** reassignment/cache, found-flow persistence.

## Cross-cutting risks (not verified this phase)
Duplicate-record creation on rapid double-submit; partial-success within a transaction; enum parity (species/lifecycle/care-type/visibility) frontend↔API↔DB; `DateOnly` timezone integrity; decimal precision (order amounts); expired-session-during-save (single-flight refresh → retry-once vs clean login redirect, no duplicate write).

## Migration note
No table or migration was added in the audit or in the F-01/F-02 implementation. The local DB was updated only to the repository's latest existing migration (`20260712094248_AddPetCoverFocalPosition`); `dotnet ef migrations has-pending-model-changes` reports no changes. Production was not changed. Verify production migration history before release; do not apply migrations blindly.
