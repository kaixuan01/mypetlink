# MyPetLink Database Schema V1 Draft

Planning draft for the future MyPetLink backend. This is not a migration script and must not be treated as approved production SQL.

Target stack: SQL Server, EF Core, C# .NET 8 Web API.

## Phase 1 Rules

- Premium is "Coming Soon" only. No real subscription billing in Phase 1.
- GPS Safety is "Coming Later" only. QR and NFC scans are not GPS tracking.
- Smart tags are optional one-time add-ons.
- Payment is manual merchant QR payment plus payment proof review.
- `/p/:slug-publicCode` is the Public Share Profile.
- `/q/:safetyCode` is the pet-level QR Safety Page.
- `/t/:tagCode` is the physical tag scan link.
- Internal database ids must never be exposed in public routes.
- `publicCode`, `safetyCode`, and `tagCode` must be secure random public identifiers generated with UUID, NanoID, ULID, or an equivalent cryptographically strong random strategy. They must not be sequential or guessable.
- Lost Mode is a pet-level flag. It is not Memorial and it is not the same as a lost physical tag.
- Memorial pets and archived pets are not active pets.
- Lost, disabled, replaced, or archived physical tags must not expose owner contact.
- A physical tag status must not disable the pet-level `/q/:safetyCode` route unless the pet itself is inactive, memorial, archived, or QR Safety is disabled.

## Conventions

- Primary keys: `Id uniqueidentifier` unless EF Core project policy chooses another internal type. Public routes never use these ids.
- Timestamps: every mutable table has `CreatedAt`, `UpdatedAt`; operational lifecycle tables add event timestamps such as `ActivatedAt`, `ArchivedAt`, `DeletedAt`.
- Soft delete:
  - User-owned content should prefer `ArchivedAt` for owner-visible archive behavior and `DeletedAt` for support/privacy deletion workflows.
  - Orders, payment proofs, audit logs, and payment/tax/support history should not be hard deleted during normal operations.
- JSON fields are acceptable for low-query settings in Phase 1. Fields used for filtering, lookup, ownership, status, or reporting should be typed columns with indexes.
- All list APIs should be backed by indexes for owner, pet, tag, order, status, created date, booking/order date, and role mapping where relevant.

## Enums

### UserStatus

`Active`, `Invited`, `Suspended`, `Deleted`

### AdminRole

`OwnerSupport`, `Operations`, `Admin`, `SuperAdmin`

Phase 1 can seed one `SuperAdmin`; controllers should still enforce roles.

### PetLifecycleStatus

`Active`, `Memorial`, `Archived`

Rules:

- Active pets count toward active profile limits.
- Memorial pets do not count as active pets and should not expose emergency finder contact actions.
- Archived pets are hidden from main owner lists and do not count toward Free profile limits.
- Restoring an archived pet must check the owner's configured plan limits unless a grandfather override allows it.

### OrderStatus

`PendingPayment`, `PaymentProofSubmitted`, `PaymentConfirmed`, `PreparingTag`, `Shipped`, `Delivered`, `Cancelled`

Frontend compatibility note: the current local model calls these `Pending Payment`, `Payment Submitted`, `Payment Confirmed`, `Preparing`, `Shipped`, `Delivered`, `Cancelled`.

### PaymentStatus

`Pending`, `ProofSubmitted`, `Confirmed`, `Rejected`, `Refunded`

`Refunded` is future-only in Phase 1 planning.

### PaymentProofStatus

`PendingReview`, `Approved`, `Rejected`, `Superseded`

### SmartTagStatus

`Unclaimed`, `Pending`, `Preparing`, `Delivered`, `Active`, `Lost`, `Disabled`, `Replaced`, `Archived`

Phase 1 keeps `Pending`, `Preparing`, and `Delivered` to match the completed frontend/Admin MVP. A later backend refactor may move fulfillment-only states entirely onto orders, but V1 should avoid breaking the current UI.

### ActorType

`Admin`, `Owner`, `System`

### MediaOwnerType

`Pet`, `PetMemory`, `CareRecord`, `TagOrder`, `PaymentProof`, `Invoice`, `OwnerProfile`, `AppSetting`, `Other`

## Core Account Tables

### Users

Purpose: single account identity for owners and admins.

Key fields:

- `Id` PK
- `Email` unique, normalized
- `DisplayName`
- `PhoneE164`, `WhatsappE164`
- `Status`
- `LastLoginAt`
- `CreatedAt`, `UpdatedAt`, `DeletedAt`

Foreign keys:

- Referenced by `OwnerProfiles.UserId`, `AdminUsers.UserId`, `ExternalLogins.UserId`, `RefreshTokens.UserId`, owner-owned tables, and audit logs.

Indexes:

- Unique `Email`
- `Status`
- `CreatedAt`

Rules:

- A user can have an owner profile, admin profile, or both.
- Deleting a user should be a support/privacy workflow, not a cascade that destroys orders or audit history.

### ExternalLogins

Purpose: Google Sign-In and future identity providers without changing user records.

Key fields:

- `Id` PK
- `UserId` FK `Users`
- `Provider` (`Google` initially)
- `ProviderSubjectId`
- `ProviderEmail`
- `ProviderDisplayName`
- `CreatedAt`, `UpdatedAt`

Indexes:

- Unique `(Provider, ProviderSubjectId)`
- `UserId`

Rules:

- Google Sign-In is the preferred initial login method.
- Additional providers can be added without changing auth schema.

### RefreshTokens

Purpose: support JWT access tokens plus refresh token rotation.

Key fields:

- `Id` PK
- `UserId` FK `Users`
- `TokenHash`
- `ExpiresAt`
- `RevokedAt`
- `ReplacedByTokenId` nullable FK `RefreshTokens`
- `CreatedByIp`
- `RevokedByIp`
- `UserAgent`
- `CreatedAt`

Indexes:

- `UserId`
- `TokenHash` unique
- `ExpiresAt`

Rules:

- Store only token hashes, never raw refresh tokens.
- Rotate refresh tokens on use.
- Revoking a refresh token should invalidate the token family if reuse is detected.

### OwnerProfiles

Purpose: owner-specific settings and plan assignment.

Key fields:

- `Id` PK
- `UserId` unique FK `Users`
- `PlanId` FK `Plans`
- `OwnerDisplayName`
- `DefaultGeneralArea`
- `PrivacyDefaultsJson`
- `NotificationPreferencesJson`
- `GrandfatheredAt` nullable
- `PlanOverrideJson` nullable
- `CreatedAt`, `UpdatedAt`, `ArchivedAt`

Indexes:

- Unique `UserId`
- `PlanId`

Rules:

- Existing over-limit data should be grandfathered by preserving existing records and using `GrandfatheredAt` or owner-level overrides.
- Owner profile settings should become defaults for new pets but should not silently overwrite pet-level contact overrides.

### AdminUsers

Purpose: admin authorization profile separate from owner data.

Key fields:

- `Id` PK
- `UserId` unique FK `Users`
- `Role`
- `IsActive`
- `CreatedByAdminUserId` nullable FK `AdminUsers`
- `CreatedAt`, `UpdatedAt`, `DisabledAt`

Indexes:

- Unique `UserId`
- `Role`
- `IsActive`

Rules:

- All `/api/v1/admin/*` endpoints require an active admin profile.
- Every admin mutation writes an `AuditLogs` row.

## Plans And Limits

### Plans

Purpose: configurable product plans without hardcoding Free/Premium limits in application logic.

Key fields:

- `Id` PK
- `Code` unique (`Free`, `Premium`)
- `Name`
- `Status` (`Available`, `ComingSoon`, `Disabled`)
- `PriceLabel`
- `BillingNote`
- `Description`
- `CreatedAt`, `UpdatedAt`, `ArchivedAt`

Indexes:

- Unique `Code`
- `Status`

Rules:

- Phase 1 seeds `Free` as available and `Premium` as coming soon.
- No subscription checkout is exposed in Phase 1.

### PlanLimits

Purpose: configurable limits per plan.

Key fields:

- `Id` PK
- `PlanId` FK `Plans`
- `MaxPets`
- `MaxMemoriesPerPet`
- `MaxMediaPerMemory`
- `MaxFamilyMembers`
- `MaxCareRecords`
- `ScanHistoryDays`
- `AllowsSmartTagAddOns`
- `AllowsFoundReports`
- `AllowsAdvancedThemes`
- `CreatedAt`, `UpdatedAt`

Indexes:

- Unique `PlanId`

Rules:

- Phase 1 Free defaults to current product rules: 3 non-archived pet profiles and 10 memories per pet.
- Application code should always read limits from plan records or owner overrides, not constants.

## Pet Tables

### Pets

Purpose: owner-managed pet profile root.

Key fields:

- `Id` PK
- `OwnerUserId` FK `Users`
- `Slug`
- `Name`
- `Species`, `CustomSpecies`
- `Breed`, `Gender`, `Color`
- `Birthday`, `AdoptionDay`, `EstimatedAgeLabel`
- `GeneralArea`
- `ProfileTheme`
- `LifecycleStatus`
- `PreviousLifecycleStatus`
- `MemorialPassedAwayDate`
- `MemorialMessage`
- `ShowMemorialOnPublicProfile`
- `LostModeEnabled`
- `LostLastSeenArea`
- `LostLastSeenDateTime`
- `LostMessage`
- `LostRewardNote`
- `LostExtraContactInstruction`
- `Bio`
- `PersonalityTagsJson`
- `FavoriteFood`, `FavoriteToy`
- `SafetyNote`, `EmergencyNote`
- `CreatedAt`, `UpdatedAt`, `ArchivedAt`, `DeletedAt`

Foreign keys:

- `OwnerUserId` -> `Users.Id`

Indexes:

- `OwnerUserId`
- `(OwnerUserId, LifecycleStatus)`
- `LifecycleStatus`
- `LostModeEnabled`
- `CreatedAt`

Rules:

- Owner portal routes use internal `petId` only after authenticated owner authorization.
- Public routes must use public code tables below, not `Pets.Id`.
- Memorial is not Active. Archived is not Active.

### PetContacts

Purpose: pet-level contact settings and owner default override support.

Key fields:

- `Id` PK
- `PetId` unique FK `Pets`
- `UseOwnerDefaults`
- `OwnerDisplayName`
- `PhoneE164`
- `WhatsappE164`
- `EmergencyContactE164`
- `GeneralAreaOverride`
- `CreatedAt`, `UpdatedAt`

Indexes:

- Unique `PetId`

Rules:

- Public pages must apply visibility settings before exposing phone or WhatsApp.
- Full delivery addresses never belong here.

### PetPublicProfiles

Purpose: share-profile identity and visibility projection for `/p/:slug-publicCode`.

Key fields:

- `Id` PK
- `PetId` unique FK `Pets`
- `PublicCode` unique secure random
- `SlugSnapshot`
- `ShowOwnerName`
- `ShowGeneralArea`
- `ShowCareBadges`
- `ShowMoments`
- `ShowTimeline`
- `ShowBirthdayOnTimeline`
- `ShowAdoptionDayOnTimeline`
- `ShowHealthSummary`
- `IsPublicProfileEnabled`
- `CreatedAt`, `UpdatedAt`

Indexes:

- Unique `PublicCode`
- Unique `PetId`
- `(IsPublicProfileEnabled, UpdatedAt)`

Rules:

- Lookup by `PublicCode`; slug is cosmetic.
- Server must return a public projection only. Do not ship hidden or private fields.

### PetSafetySettings

Purpose: QR Safety Page identity and finder contact visibility for `/q/:safetyCode`.

Key fields:

- `Id` PK
- `PetId` unique FK `Pets`
- `SafetyCode` unique secure random
- `QrSafetyEnabled`
- `ShowPhone`
- `ShowWhatsapp`
- `ShowEmergencyNote`
- `ShowFoundLocationAction`
- `CreatedAt`, `UpdatedAt`

Indexes:

- Unique `SafetyCode`
- Unique `PetId`
- `(QrSafetyEnabled, UpdatedAt)`

Rules:

- `/q/:safetyCode` is pet-level and works without a physical tag while enabled and allowed by lifecycle.
- Memorial/archived pets must not expose emergency finder contact actions.

## Care, Memories, And Media

### PetMemories

Purpose: owner-created memories/moments.

Key fields:

- `Id` PK
- `PetId` FK `Pets`
- `Title`
- `MomentDate`
- `Type`
- `Caption`
- `Visibility` (`Public`, `Private`, `FamilyOnly`)
- `ShowOnPublicProfile`
- `ShowInLifeTimeline`
- `TimelineNote`
- `CoverMediaFileId` nullable FK `MediaFiles`
- `CreatedAt`, `UpdatedAt`, `ArchivedAt`, `DeletedAt`

Indexes:

- `(PetId, CreatedAt)`
- `(PetId, Visibility)`
- `(PetId, ShowOnPublicProfile)`
- `(PetId, ShowInLifeTimeline)`

Rules:

- Free plan limit defaults to 10 memories per pet, but use `PlanLimits`.
- Existing over-limit memories should remain editable and visible according to their visibility rules.

### CareRecords

Purpose: owner care records such as vaccines, grooming, vet visits, medication, allergy notes, and future documents.

Key fields:

- `Id` PK
- `PetId` FK `Pets`
- `Type`
- `Title`
- `RecordDate`
- `DueDate`
- `Provider`
- `Notes`
- `PublicVisibility` (`Private`, `PublicBadgeOnly`, `PublicDetails`)
- `Status` (`Complete`, `DueSoon`, `Upcoming`)
- `CreatedAt`, `UpdatedAt`, `ArchivedAt`, `DeletedAt`

Indexes:

- `(PetId, RecordDate)`
- `(PetId, DueDate)`
- `(PetId, Type)`
- `(PetId, PublicVisibility)`
- `Status`

Rules:

- Public projections should include care badges/details only when both record visibility and pet public settings allow it.

### MediaFiles

Purpose: reusable storage record for all uploaded files.

Can support memories, medical documents, vaccination attachments, invoices, receipts, payment proofs, owner/pet photos, and future uploads without adding duplicate media tables.

Key fields:

- `Id` PK
- `OwnerUserId` nullable FK `Users`
- `OriginalFileName`
- `StorageFileName`
- `ContentType`
- `FileSize`
- `StorageProvider` (`Local`, `AzureBlob`, `S3`, `CloudflareR2`, `Other`)
- `StoragePath`
- `Sha256`
- `Width` nullable
- `Height` nullable
- `DurationSeconds` nullable
- `CreatedAt`
- `UploadedAt`
- `DeletedAt`

Indexes:

- `OwnerUserId`
- `StorageProvider`
- `Sha256`
- `UploadedAt`
- `DeletedAt`

Rules:

- Supports changing storage provider without database changes.
- `StoragePath` should be provider-relative, not a public URL.
- Serve files through controlled URLs or signed URLs when needed.
- Store payment proof uploads as media records and link them to `PaymentProofs`.

### MediaFileLinks

Purpose: attach media files to different domain entities without creating a new join table for every upload feature.

Key fields:

- `Id` PK
- `MediaFileId` FK `MediaFiles`
- `OwnerType`
- `OwnerId`
- `SortOrder`
- `Caption`
- `AltText`
- `CreatedAt`, `ArchivedAt`

Indexes:

- `(OwnerType, OwnerId, SortOrder)`
- `MediaFileId`

Rules:

- For memories, max media count comes from `PlanLimits.MaxMediaPerMemory`.
- Application services must validate that `OwnerId` exists for the selected `OwnerType`.

## Smart Tags And Orders

### SmartTagBatches

Purpose: generated tag inventory batches for retail/pet-shop stock and manufacturing exports.

Key fields:

- `Id` PK
- `BatchNo` unique
- `Quantity`
- `HasNfc`
- `Variant` (`Lightweight` or `Standard`; renamed from legacy `Shape`)
- `GeneratedByAdminUserId` FK `AdminUsers`
- `GeneratedAt`
- `ExportedAt`
- `PrintedAt`
- `SentToResellerAt`
- `ResellerName`
- `Remarks`
- `CreatedAt`, `UpdatedAt`, `ArchivedAt`

Indexes:

- Unique `BatchNo`
- `GeneratedAt`
- `HasNfc`
- `Variant` (`Lightweight` or `Standard`; renamed from legacy `Shape`)

Rules:

- Phase 1 supports code generation and CSV export.
- Printed/reseller tracking can stay documented/planned until backend fields are used by UI.

### SmartTags

Purpose: physical QR or QR + NFC tag registry.

Key fields:

- `Id` PK
- `TagCode` unique secure random, public
- `OwnerUserId` nullable FK `Users`
- `PetId` nullable FK `Pets`
- `OrderId` nullable FK `TagOrders`
- `BatchId` nullable FK `SmartTagBatches`
- `HasNfc`
- `Variant` (`Lightweight` or `Standard`; renamed from legacy `Shape`)
- `Status`
- `ActivatedAt`
- `DeliveredAt`
- `LastScannedAt`
- `ReplacementForTagId` nullable FK `SmartTags`
- `CreatedAt`, `UpdatedAt`, `ArchivedAt`, `DeletedAt`

Indexes:

- Unique `TagCode`
- `OwnerUserId`
- `PetId`
- `OrderId`
- `BatchId`
- `Status`
- `(Status, PetId)`
- `LastScannedAt`

Rules:

- Retail tags start as `Unclaimed` with no owner and no pet.
- Portal-purchased tags must have `OwnerUserId`, `PetId`, and `OrderId` from order creation.
- One physical tag can be linked to one active pet at a time.
- A pet can have multiple tags.
- Lost/disabled/replaced/archived tags must not expose owner contact from `/t/:tagCode`.

### TagOrders

Purpose: owner smart tag orders and fulfillment state.

Key fields:

- `Id` PK
- `OrderNumber` unique public-safe operational number
- `OwnerUserId` FK `Users`
- `PetId` FK `Pets`
- `SmartTagId` nullable FK `SmartTags`
- `ReplacementForTagId` nullable FK `SmartTags`
- `TagType` (`QrPetTag`, `QrNfcSmartTag`)
- `Variant` (`Lightweight` or `Standard`; renamed from legacy `Shape`)
- `Amount`
- `Currency`
- `DeliveryFee`
- `Status`
- `PaymentStatus`
- `RecipientName`
- `DeliveryPhoneE164`
- `AddressLine1`
- `AddressLine2`
- `Postcode`
- `City`
- `State`
- `DeliveryNotes`
- `TrackingStatus`
- `TrackingNumber`
- `ShippedAt`
- `DeliveredAt`
- `CancelledAt`
- `CreatedAt`, `UpdatedAt`

Indexes:

- Unique `OrderNumber`
- `OwnerUserId`
- `PetId`
- `SmartTagId`
- `Status`
- `PaymentStatus`
- `CreatedAt`
- `(Status, CreatedAt)`
- `(PaymentStatus, CreatedAt)`

Rules:

- Portal orders must include `PetId`.
- Orders are never auto-confirmed by proof upload.
- Cancel before shipping only.
- Order history should not be deleted during normal support operations.

### PaymentProofs

Purpose: manual payment proof upload and review history for Phase 1.

Provider-neutral file fields:

- `Id` PK
- `OrderId` FK `TagOrders`
- `MediaFileId` FK `MediaFiles`
- `OriginalFileName`
- `StorageFileName`
- `ContentType`
- `FileSize`
- `StorageProvider`
- `StoragePath`
- `Sha256`
- `UploadedAt`

Review/payment fields:

- `PaymentMethod`
- `PaymentReference`
- `OwnerNote`
- `Status`
- `ReviewedByAdminUserId` nullable FK `AdminUsers`
- `ReviewedAt`
- `RejectionReason`
- `CreatedAt`, `UpdatedAt`

Indexes:

- `OrderId`
- `MediaFileId`
- `Status`
- `UploadedAt`
- `ReviewedByAdminUserId`

Rules:

- Keep every submitted proof for review history unless a privacy/legal retention workflow says otherwise.
- Rejecting a proof sets proof status to `Rejected`, returns order to `PendingPayment`, and keeps the order.
- Approving a proof sets proof status to `Approved`, order status to `PaymentConfirmed`, and payment status to `Confirmed`.
- File fields mirror `MediaFiles` so reports and exports remain stable even if media storage metadata changes later.

## Scans, Found Reports, And Analytics

### TagScans

Purpose: record physical tag scan events for safety operations, abuse prevention, and future analytics/Premium scan history.

Key fields:

- `Id` PK
- `SmartTagId` nullable FK `SmartTags`
- `PetId` nullable FK `Pets`
- `TagCode`
- `ResolvedState` (`Active`, `Unclaimed`, `Pending`, `Inactive`, `NotFound`)
- `ScanTime`
- `Latitude` nullable
- `Longitude` nullable
- `Country` nullable
- `City` nullable
- `IpAddress`
- `Browser`
- `OperatingSystem`
- `DeviceType`
- `Referer`
- `UserAgent`
- `FinderConsentPreciseLocation`
- `CreatedAt`

Indexes:

- `SmartTagId`
- `PetId`
- `TagCode`
- `ResolvedState`
- `ScanTime`
- `(SmartTagId, ScanTime)`
- `(PetId, ScanTime)`
- `(Country, City)`

Privacy rule:

- Precise latitude/longitude must only be collected and stored with explicit finder consent.
- If precise consent is not granted, do not store latitude/longitude.
- Without consent, store only non-precise IP-based `Country` and `City` when available.
- QR/NFC scan analytics must not be described as GPS tracking.

### FoundReports

Purpose: optional finder-submitted report after scanning an active safety page.

Key fields:

- `Id` PK
- `PetId` FK `Pets`
- `SmartTagId` nullable FK `SmartTags`
- `TagScanId` nullable FK `TagScans`
- `FinderMessage`
- `FinderContact`
- `Latitude` nullable
- `Longitude` nullable
- `Country`
- `City`
- `PreciseLocationConsent`
- `SubmittedAt`
- `CreatedAt`, `ArchivedAt`

Indexes:

- `PetId`
- `SmartTagId`
- `TagScanId`
- `SubmittedAt`

Rules:

- Precise location uses the same explicit-consent rule as `TagScans`.
- Found reports are future-facing and may be disabled in Phase 1 UI.

## Operations And Settings

### AuditLogs

Purpose: production debugging, compliance, and operations accountability.

Key fields:

- `Id` PK
- `ActorId` nullable
- `ActorType`
- `Action`
- `Entity`
- `EntityId`
- `OldValue` JSON nullable
- `NewValue` JSON nullable
- `IpAddress`
- `UserAgent`
- `CreatedAt`

Indexes:

- `(Entity, EntityId)`
- `(ActorType, ActorId)`
- `Action`
- `CreatedAt`

Rules:

- Every admin mutation must write an audit log.
- Important owner mutations such as tag activation, Lost Mode changes, payment proof upload, and profile lifecycle changes should also write audit logs.
- Do not store raw secrets, tokens, payment credentials, or full uploaded files in audit JSON.

### AppSettings

Purpose: backend-managed operational settings after the current read-only frontend settings become editable.

Key fields:

- `Id` PK
- `Key` unique
- `ValueJson`
- `Category`
- `Description`
- `IsPublic`
- `UpdatedByAdminUserId` nullable FK `AdminUsers`
- `CreatedAt`, `UpdatedAt`

Indexes:

- Unique `Key`
- `Category`
- `IsPublic`

Examples:

- manual payment instructions
- merchant QR media file id
- tag pricing labels
- support email
- feature flags for Premium/GPS visibility

## Future Notification Tables

These are planning-only in Phase 1. They should not force notification implementation into the MVP.

### Notifications

Purpose: owner-visible notification records.

Key fields:

- `Id` PK
- `UserId` FK `Users`
- `Type`
- `Title`
- `Body`
- `Channel` (`InApp`, `Email`, `Whatsapp`, `Sms`)
- `Status` (`Unread`, `Read`, `Archived`)
- `RelatedEntity`
- `RelatedEntityId`
- `CreatedAt`, `ReadAt`, `ArchivedAt`

Indexes:

- `(UserId, Status, CreatedAt)`
- `(RelatedEntity, RelatedEntityId)`

### NotificationQueue

Purpose: queued outbound notifications for future provider dispatch.

Key fields:

- `Id` PK
- `UserId` nullable FK `Users`
- `Channel`
- `Recipient`
- `TemplateKey`
- `PayloadJson`
- `Status` (`Pending`, `Sending`, `Sent`, `Failed`, `Cancelled`)
- `Attempts`
- `NextAttemptAt`
- `LastError`
- `CreatedAt`, `SentAt`

Indexes:

- `(Status, NextAttemptAt)`
- `UserId`
- `CreatedAt`

### ReminderJobs

Purpose: scheduled jobs for future care reminders and Lost Mode/order updates.

Key fields:

- `Id` PK
- `UserId` FK `Users`
- `PetId` nullable FK `Pets`
- `CareRecordId` nullable FK `CareRecords`
- `Type` (`Vaccination`, `Medication`, `Grooming`, `LostMode`, `OrderUpdate`, `Other`)
- `ScheduledFor`
- `Status` (`Scheduled`, `Queued`, `Completed`, `Cancelled`, `Failed`)
- `PayloadJson`
- `CreatedAt`, `UpdatedAt`, `CompletedAt`

Indexes:

- `(Status, ScheduledFor)`
- `UserId`
- `PetId`
- `CareRecordId`

## Data Consistency Rules

- Creating a portal order must create or reserve a tag linked to the selected pet.
- Retail/unclaimed tag activation must validate the tag is unclaimed or delivered and the selected pet belongs to the authenticated owner.
- Replacing a tag must mark the old tag `Replaced` and create a new order/tag reference.
- Marking a pet Memorial or Archived must not delete tags, orders, memories, or care records; it changes public scan behavior.
- Restoring a pet to Active must check configurable plan limits and grandfather overrides.
- Public API projections must be built server-side and privacy-gated; frontend clients should never receive hidden owner/contact fields and decide locally.
