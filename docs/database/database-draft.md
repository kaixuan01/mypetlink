# Database Draft

> Historical draft. For current backend planning, use [`schema-v1-draft.md`](schema-v1-draft.md), which adds Phase A auth, configurable plans, reusable media files, provider-neutral payment proofs, production audit logs, scan analytics consent rules, and secure random public identifiers.

Draft relational schema for the future SQL Server database (EF Core). **Not implemented — for planning only.** No production database exists yet. The current frontend demo model (`docs/current-demo-data-model.md`) maps onto these tables; the key correction over the demo is real foreign keys (the demo links pets to owners only by display name).

## Core tables

### Users
`Id (PK)`, `Email (unique)`, `Name`, `Role (Owner|Admin)`, `Status (Active|Invited|Suspended)`, `PhoneE164`, `WhatsappE164`, `DefaultGeneralArea`, `PrivacyDefaultsJson`, `NotificationPrefsJson`, `CreatedAt`.

### Pets
`Id (PK)`, `OwnerUserId (FK Users)`, `Slug`, `Name`, `Species`, `CustomSpecies`, `Breed`, `Gender`, `Color`, `Birthday`, `AdoptionDay`, `GeneralArea`, `PhotoUrl`, `CoverUrl`, `ProfileTheme`,
`PublicCode (unique, stable)`, `SafetyCode (unique, stable)`, `QrSafetyEnabled`,
`LifecycleStatus (Active|Memorial|Archived)`, `PreviousLifecycleStatus`, `MemorialJson`,
`LostModeEnabled`, `LostModeJson`, `ContactOverrideJson`, `VisibilityJson`,
`Bio`, `PersonalityTagsJson`, `SafetyNote`, `EmergencyNote`, `CreatedAt`, `UpdatedAt`.

Rules: public lookup by `PublicCode`/`SafetyCode` only; never expose `Id` publicly. Memorial/Archived pets are excluded from active counts and make linked tags scan-inactive.

### CareRecords
`Id (PK)`, `PetId (FK)`, `Type`, `Title`, `Date`, `DueDate`, `Provider`, `Notes`, `PublicVisibility (Private|BadgeOnly|Details)`, `CreatedAt`.

### Moments + MomentMedia
`Moments`: `Id (PK)`, `PetId (FK)`, `Title`, `Date`, `Type`, `Caption`, `Visibility`, `ShowOnPublicProfile`, `ShowInLifeTimeline`, `TimelineNote`, `CoverMediaId`.
`MomentMedia`: `Id (PK)`, `MomentId (FK)`, `MediaType (Image|Video)`, `StorageUrl`, `Caption`, `AltText`, `SortOrder` (max 5 per moment on Free).

## Tags and orders

### Tags
`Id (PK)`, `TagCode (unique, MPL-XXXX-XXXX)`, `PetId (FK, nullable)`, `OwnerUserId (FK, nullable)`, `HasNfc`, `Shape`,
`Status (Unassigned|Active|Disabled|Lost|Replaced)` — 5 logical states only; fulfillment lives on the order,
`BatchId (FK TagBatches, nullable)`, `ActivatedAt`, `LastScannedAt`, `ReplacementForTagId (FK Tags)`, `IsArchived`, `CreatedAt`.

Retail stock: `Status = Unassigned`, no `PetId`/`OwnerUserId`, created via batches. Portal orders: tag created bound to the pet.

### TagBatches
`Id (PK)`, `BatchNo (e.g. BATCH-2026-07)`, `Quantity`, `HasNfc`, `Shape`, `GeneratedByUserId (FK)`, `GeneratedAt`, `PrintedAt (nullable)`, `SentToResellerAt (nullable)`, `ResellerName (nullable)`.

### Orders
`Id (PK)`, `OrderNumber (unique, MPL-ORD-YYYY-XXXX)`, `OwnerUserId (FK)`, `PetId (FK)`, `TagId (FK, nullable)`, `TagType`, `Shape`, `Price`, 
`Status (Draft|PendingPayment|PaymentSubmitted|PaymentConfirmed|Preparing|Shipped|Delivered|Cancelled)`,
`DeliveryJson (recipient, phone, address, notes)`, `TrackingStatus`, `TrackingNumber`, `ShippedAt`, `DeliveredAt`, `ReplacementForTagId`, `CreatedAt`.

### PaymentProofs
`Id (PK)`, `OrderId (FK)`, `FileStorageUrl`, `FileName`, `PaymentMethod`, `PaymentReference`, `OwnerNote`, `SubmittedAt`,
`ReviewStatus (Pending|Approved|Rejected)`, `ReviewedByUserId (FK Users, nullable)`, `ReviewedAt`, `RejectionReason`.

Manual review only in Phase 1; approval sets the order to PaymentConfirmed.

## Operations

### AuditLogs
`Id (PK)`, `ActorUserId (FK)`, `Action` (e.g. `order.confirm-payment`, `tag.mark-lost`, `batch.generate`), `EntityType`, `EntityId`, `BeforeJson`, `AfterJson`, `CreatedAt`. Every admin mutation writes one row.

### TagScans (later; Premium scan history)
`Id (PK)`, `TagId (FK)`, `ScannedAt`, `ResolvedState`, coarse location if consented.

## Migration notes from the demo

1. Introduce `OwnerUserId` FKs everywhere (demo attributes pets to owners by display name).
2. Collapse `TagStatus` Pending/Preparing/Delivered into order fulfillment status.
3. Move payment proof fields off the order row into `PaymentProofs` (supports resubmission history).
4. Convert display-string dates (`"02 May 2026"`) to proper datetimes.
5. Seed data in `apps/web/src/data/*` can become the dev-environment seed.
