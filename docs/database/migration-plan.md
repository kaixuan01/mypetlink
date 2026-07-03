# MyPetLink Migration Plan

Planning draft only. Do not create SQL migration scripts until the schema is approved and the .NET API project exists.

Target database: SQL Server via EF Core migrations.

## Goals

- Create a stable relational foundation for real users, pets, public profiles, QR Safety, smart tags, manual payment proofs, Admin Portal operations, and audit logs.
- Preserve current Phase 1 product rules.
- Avoid destructive schema changes.
- Keep public identifiers secure and non-sequential.
- Support future storage providers, Premium plans, scan analytics, and notifications without obvious schema rewrites.

## Initial Migration Order

### 1. Platform And Identity Foundation

Create first:

- `Users`
- `ExternalLogins`
- `RefreshTokens`
- `AdminUsers`
- `Plans`
- `PlanLimits`
- `OwnerProfiles`
- `AppSettings`

Why:

- Auth is Phase A and every protected API depends on it.
- Plans must exist before owner profiles so owners can be assigned to Free.
- App settings can seed support/payment/product defaults used by later modules.

Seed:

- `Free` plan: available now.
- `Premium` plan: coming soon.
- Free plan limits matching Phase 1 defaults: 3 non-archived pets, 10 memories per pet, current media defaults.
- Initial admin user and admin profile.
- App settings for support email, manual payment instructions, merchant QR label, delivery fee, tag pricing labels, Premium coming soon, GPS coming later.

### 2. Pet Profile Foundation

Create:

- `Pets`
- `PetContacts`
- `PetPublicProfiles`
- `PetSafetySettings`

FK order:

- `Pets.OwnerUserId` -> `Users`
- `PetContacts.PetId` -> `Pets`
- `PetPublicProfiles.PetId` -> `Pets`
- `PetSafetySettings.PetId` -> `Pets`

Seed:

- demo owner profiles and demo pets from current frontend seed data.
- secure random `publicCode` and `safetyCode` values for demo pets if importing legacy values is not required.

Important:

- `publicCode` and `safetyCode` must have unique indexes.
- Do not use internal pet ids in public routes.

### 3. Reusable Media And Owner Content

Create:

- `MediaFiles`
- `MediaFileLinks`
- `PetMemories`
- `CareRecords`

FK order:

- `MediaFiles.OwnerUserId` -> `Users`
- `PetMemories.PetId` -> `Pets`
- `PetMemories.CoverMediaFileId` -> `MediaFiles`
- `CareRecords.PetId` -> `Pets`
- `MediaFileLinks.MediaFileId` -> `MediaFiles`

Seed:

- demo memories and care records from `apps/web/src/data/mockMoments.ts` and `mockRecords.ts`.
- media rows only where real demo files exist. Current blank image labels should not become fake file records.

Important:

- Existing over-limit memories are grandfathered.
- Application logic reads plan limits from `PlanLimits`.

### 4. Smart Tag Inventory

Create:

- `SmartTagBatches`
- `SmartTags`

FK order:

- `SmartTagBatches.GeneratedByAdminUserId` -> `AdminUsers`
- `SmartTags.OwnerUserId` -> `Users`
- `SmartTags.PetId` -> `Pets`
- `SmartTags.BatchId` -> `SmartTagBatches`
- `SmartTags.ReplacementForTagId` -> `SmartTags`

Seed:

- demo tags from current frontend seed data.
- optional starter unclaimed retail batch if needed for local testing.

Important:

- `TagCode` unique index is mandatory.
- TagCode must be secure random, not sequential.
- Retail/unclaimed tags can have no owner and no pet until activation.

### 5. Orders And Manual Payment Proofs

Create:

- `TagOrders`
- add or validate `SmartTags.OrderId` FK after `TagOrders` exists
- `PaymentProofs`

FK order:

- `TagOrders.OwnerUserId` -> `Users`
- `TagOrders.PetId` -> `Pets`
- `TagOrders.SmartTagId` -> `SmartTags`
- `TagOrders.ReplacementForTagId` -> `SmartTags`
- `PaymentProofs.OrderId` -> `TagOrders`
- `PaymentProofs.MediaFileId` -> `MediaFiles`
- `PaymentProofs.ReviewedByAdminUserId` -> `AdminUsers`

Seed:

- demo orders from `apps/web/src/data/mockOrders.ts`.
- payment proof rows for demo proof file names only if useful for local admin review. If there is no real stored file, seed them as metadata-only local placeholders.

Important:

- Portal orders must have `PetId`.
- Payment confirmation remains manual.
- Payment proofs keep provider-neutral file fields so Local, Azure Blob, S3, Cloudflare R2, or future providers work without schema changes.

### 6. Scan Analytics And Finder Reports

Create:

- `TagScans`
- `FoundReports`

FK order:

- `TagScans.SmartTagId` -> `SmartTags`
- `TagScans.PetId` -> `Pets`
- `FoundReports.PetId` -> `Pets`
- `FoundReports.SmartTagId` -> `SmartTags`
- `FoundReports.TagScanId` -> `TagScans`

Important:

- Precise latitude/longitude must only be stored with explicit finder consent.
- If consent is not granted, store only non-precise IP-based country/city when available.
- Scan analytics must not be represented as real GPS tracking.

### 7. Audit Logs

Create:

- `AuditLogs`

FK approach:

- `ActorId` is nullable and polymorphic with `ActorType`.
- Do not enforce one FK because actors can be Admin, Owner, or System.

Important:

- Add indexes for actor, entity, action, and created date.
- Seed is not required, but future migrations should start writing logs as soon as admin mutations exist.

### 8. Future Notifications

Create later or include as dormant planning tables:

- `Notifications`
- `NotificationQueue`
- `ReminderJobs`

Recommendation:

- Do not implement dispatch providers in the MVP.
- If tables are created early, keep services disabled behind feature flags.

## Environment Variables

Expected local/deployment settings:

- `ConnectionStrings__MyPetLinkDb`
- `Jwt__Issuer`
- `Jwt__Audience`
- `Jwt__SigningKey`
- `Jwt__AccessTokenMinutes`
- `Jwt__RefreshTokenDays`
- `GoogleAuth__ClientId`
- `Storage__Provider`
- `Storage__LocalRoot`
- `Storage__PublicBaseUrl`
- `Storage__AzureBlob__ConnectionString`
- `Storage__AzureBlob__Container`
- `Storage__S3__Bucket`
- `Storage__S3__Region`
- `Storage__S3__AccessKeyId`
- `Storage__S3__SecretAccessKey`
- `Storage__R2__AccountId`
- `Storage__R2__Bucket`
- `Storage__R2__AccessKeyId`
- `Storage__R2__SecretAccessKey`
- `AdminSeed__Email`
- `AdminSeed__GoogleSubjectId`
- `AdminSeed__DisplayName`

Only configure provider-specific storage values for the active provider.

## Local Development DB Setup

Recommended local flow after backend generation:

1. Install SQL Server Developer Edition or use a SQL Server Docker container.
2. Configure `ConnectionStrings__MyPetLinkDb` in user secrets.
3. Run EF Core initial migration generation from `apps/api/MyPetLink.Api`.
4. Apply migrations to local DB.
5. Run seed routine for plans, app settings, admin user, demo owner, demo pets, demo tags/orders.
6. Verify owner login with Google dev client or a local development auth bypass only if explicitly implemented and never enabled in production.

## Seed Data Strategy

### Required Seeds

- Plans:
  - Free: available now.
  - Premium: coming soon.
- Plan limits:
  - Free current defaults.
  - Premium placeholder limits/status for future.
- Admin:
  - one active admin user/profile.
- App settings:
  - manual payment mode.
  - support email.
  - tag prices.
  - delivery fee.
  - Premium/GPS availability states.

### Optional Local Demo Seeds

- demo owner user/profile
- demo pets
- demo care records
- demo memories
- demo smart tags
- demo orders and payment proofs
- starter unclaimed retail tag inventory

Demo data must be clearly local/development seed data and should not be used as production business state.

## Rollback Considerations

- Initial local migrations can be dropped and recreated before production data exists.
- Once production exists, rollback should prefer forward-fix migrations.
- Avoid destructive migrations such as dropping columns or tables unless there is an approved data backup and migration path.
- For enum changes, prefer additive values and application compatibility windows.
- For storage provider changes, do not rewrite historical rows; provider-neutral `MediaFiles` fields should allow mixed providers.
- For public identifier changes, never regenerate existing public codes unless a security incident requires it.

## Future Production Migration Notes

- Run migrations in staging before production.
- Back up the database before production migrations.
- Validate unique indexes for `Email`, `PublicCode`, `SafetyCode`, `TagCode`, `OrderNumber`.
- Validate all required FKs before enabling public traffic.
- Use idempotent seeds for plans, app settings, and initial admin user.
- Keep audit logs append-only.
- Document any data correction performed during migration.

## Data Import From Current Frontend Seeds

Source files:

- `apps/web/src/data/mockUsers.ts`
- `apps/web/src/data/mockPets.ts`
- `apps/web/src/data/mockRecords.ts`
- `apps/web/src/data/mockMoments.ts`
- `apps/web/src/data/mockTags.ts`
- `apps/web/src/data/mockOrders.ts`

Mapping corrections:

- Add real `OwnerUserId` FKs instead of owner display-name attribution.
- Convert display dates to UTC datetimes or date-only fields as appropriate.
- Move payment proof file names into `PaymentProofs` and `MediaFiles` when actual files exist.
- Preserve tag codes as public values only if they already match secure random format and are acceptable for local demo.
- Keep `publicCode` and `safetyCode` stable for seeded public pages when needed by frontend route tests.
