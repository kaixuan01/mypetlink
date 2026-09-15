IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [AuditLogs] (
        [Id] uniqueidentifier NOT NULL,
        [ActorId] uniqueidentifier NULL,
        [ActorType] nvarchar(32) NOT NULL,
        [Action] nvarchar(120) NOT NULL,
        [Entity] nvarchar(120) NOT NULL,
        [EntityId] uniqueidentifier NULL,
        [OldValue] nvarchar(max) NULL,
        [NewValue] nvarchar(max) NULL,
        [IpAddress] nvarchar(64) NULL,
        [UserAgent] nvarchar(max) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_AuditLogs] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [Plans] (
        [Id] uniqueidentifier NOT NULL,
        [Code] nvarchar(64) NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [PriceLabel] nvarchar(64) NOT NULL,
        [BillingNote] nvarchar(240) NULL,
        [Description] nvarchar(max) NULL,
        [ArchivedAt] datetimeoffset NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_Plans] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [Users] (
        [Id] uniqueidentifier NOT NULL,
        [Email] nvarchar(320) NOT NULL,
        [NormalizedEmail] nvarchar(320) NOT NULL,
        [DisplayName] nvarchar(200) NOT NULL,
        [PhoneE164] nvarchar(32) NULL,
        [WhatsappE164] nvarchar(32) NULL,
        [Status] nvarchar(32) NOT NULL,
        [LastLoginAt] datetimeoffset NULL,
        [DeletedAt] datetimeoffset NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_Users] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [PlanLimits] (
        [Id] uniqueidentifier NOT NULL,
        [PlanId] uniqueidentifier NOT NULL,
        [MaxPets] int NOT NULL,
        [MaxMemoriesPerPet] int NOT NULL,
        [MaxMediaPerMemory] int NOT NULL,
        [MaxFamilyMembers] int NOT NULL,
        [MaxCareRecords] int NOT NULL,
        [ScanHistoryDays] int NOT NULL,
        [AllowsSmartTagAddOns] bit NOT NULL,
        [AllowsFoundReports] bit NOT NULL,
        [AllowsAdvancedThemes] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PlanLimits] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_PlanLimits_Plans_PlanId] FOREIGN KEY ([PlanId]) REFERENCES [Plans] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [AdminUsers] (
        [Id] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [Role] nvarchar(32) NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedByAdminUserId] uniqueidentifier NULL,
        [DisabledAt] datetimeoffset NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_AdminUsers] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AdminUsers_AdminUsers_CreatedByAdminUserId] FOREIGN KEY ([CreatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_AdminUsers_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [ExternalLogins] (
        [Id] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [Provider] nvarchar(64) NOT NULL,
        [ProviderSubjectId] nvarchar(200) NOT NULL,
        [ProviderEmail] nvarchar(320) NOT NULL,
        [ProviderDisplayName] nvarchar(200) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_ExternalLogins] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_ExternalLogins_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [MediaFiles] (
        [Id] uniqueidentifier NOT NULL,
        [OwnerUserId] uniqueidentifier NULL,
        [OriginalFileName] nvarchar(260) NOT NULL,
        [StorageFileName] nvarchar(260) NOT NULL,
        [ContentType] nvarchar(120) NOT NULL,
        [FileSize] bigint NOT NULL,
        [StorageProvider] nvarchar(64) NOT NULL,
        [StoragePath] nvarchar(600) NOT NULL,
        [Sha256] nvarchar(128) NOT NULL,
        [Width] int NULL,
        [Height] int NULL,
        [DurationSeconds] int NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UploadedAt] datetimeoffset NOT NULL,
        [DeletedAt] datetimeoffset NULL,
        CONSTRAINT [PK_MediaFiles] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MediaFiles_Users_OwnerUserId] FOREIGN KEY ([OwnerUserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [OwnerProfiles] (
        [Id] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [PlanId] uniqueidentifier NOT NULL,
        [OwnerDisplayName] nvarchar(200) NOT NULL,
        [DefaultGeneralArea] nvarchar(200) NULL,
        [PrivacyDefaultsJson] nvarchar(max) NOT NULL,
        [NotificationPreferencesJson] nvarchar(max) NOT NULL,
        [GrandfatheredAt] datetimeoffset NULL,
        [PlanOverrideJson] nvarchar(max) NULL,
        [ArchivedAt] datetimeoffset NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_OwnerProfiles] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_OwnerProfiles_Plans_PlanId] FOREIGN KEY ([PlanId]) REFERENCES [Plans] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_OwnerProfiles_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [Pets] (
        [Id] uniqueidentifier NOT NULL,
        [OwnerUserId] uniqueidentifier NOT NULL,
        [Slug] nvarchar(160) NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [Species] nvarchar(80) NOT NULL,
        [CustomSpecies] nvarchar(120) NULL,
        [Breed] nvarchar(max) NULL,
        [Gender] nvarchar(max) NULL,
        [Color] nvarchar(max) NULL,
        [Birthday] date NULL,
        [AdoptionDay] date NULL,
        [EstimatedAgeLabel] nvarchar(max) NULL,
        [GeneralArea] nvarchar(200) NULL,
        [ProfileTheme] nvarchar(64) NOT NULL,
        [LifecycleStatus] nvarchar(32) NOT NULL,
        [PreviousLifecycleStatus] nvarchar(32) NULL,
        [MemorialPassedAwayDate] date NULL,
        [MemorialMessage] nvarchar(max) NULL,
        [ShowMemorialOnPublicProfile] bit NOT NULL,
        [LostModeEnabled] bit NOT NULL,
        [LostLastSeenArea] nvarchar(max) NULL,
        [LostLastSeenDateTime] datetimeoffset NULL,
        [LostMessage] nvarchar(max) NULL,
        [LostRewardNote] nvarchar(max) NULL,
        [LostExtraContactInstruction] nvarchar(max) NULL,
        [Bio] nvarchar(max) NULL,
        [PersonalityTagsJson] nvarchar(max) NOT NULL,
        [FavoriteFood] nvarchar(max) NULL,
        [FavoriteToy] nvarchar(max) NULL,
        [SafetyNote] nvarchar(max) NULL,
        [EmergencyNote] nvarchar(max) NULL,
        [ArchivedAt] datetimeoffset NULL,
        [DeletedAt] datetimeoffset NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_Pets] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Pets_Users_OwnerUserId] FOREIGN KEY ([OwnerUserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [RefreshTokens] (
        [Id] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [TokenHash] nvarchar(128) NOT NULL,
        [ExpiresAt] datetimeoffset NOT NULL,
        [RevokedAt] datetimeoffset NULL,
        [ReplacedByTokenId] uniqueidentifier NULL,
        [CreatedByIp] nvarchar(64) NULL,
        [RevokedByIp] nvarchar(64) NULL,
        [UserAgent] nvarchar(max) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_RefreshTokens] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_RefreshTokens_RefreshTokens_ReplacedByTokenId] FOREIGN KEY ([ReplacedByTokenId]) REFERENCES [RefreshTokens] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_RefreshTokens_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [AppSettings] (
        [Id] uniqueidentifier NOT NULL,
        [Key] nvarchar(160) NOT NULL,
        [ValueJson] nvarchar(max) NOT NULL,
        [Category] nvarchar(80) NOT NULL,
        [Description] nvarchar(max) NULL,
        [IsPublic] bit NOT NULL,
        [UpdatedByAdminUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_AppSettings] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AppSettings_AdminUsers_UpdatedByAdminUserId] FOREIGN KEY ([UpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [SmartTagBatches] (
        [Id] uniqueidentifier NOT NULL,
        [BatchNo] nvarchar(80) NOT NULL,
        [Quantity] int NOT NULL,
        [HasNfc] bit NOT NULL,
        [Shape] nvarchar(80) NOT NULL,
        [GeneratedByAdminUserId] uniqueidentifier NULL,
        [GeneratedAt] datetimeoffset NULL,
        [ExportedAt] datetimeoffset NULL,
        [PrintedAt] datetimeoffset NULL,
        [SentToResellerAt] datetimeoffset NULL,
        [ResellerName] nvarchar(200) NULL,
        [Remarks] nvarchar(max) NULL,
        [ArchivedAt] datetimeoffset NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SmartTagBatches] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_SmartTagBatches_AdminUsers_GeneratedByAdminUserId] FOREIGN KEY ([GeneratedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [MediaFileLinks] (
        [Id] uniqueidentifier NOT NULL,
        [MediaFileId] uniqueidentifier NOT NULL,
        [OwnerType] nvarchar(64) NOT NULL,
        [OwnerId] uniqueidentifier NOT NULL,
        [SortOrder] int NOT NULL,
        [Caption] nvarchar(240) NULL,
        [AltText] nvarchar(240) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [ArchivedAt] datetimeoffset NULL,
        CONSTRAINT [PK_MediaFileLinks] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MediaFileLinks_MediaFiles_MediaFileId] FOREIGN KEY ([MediaFileId]) REFERENCES [MediaFiles] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [CareRecords] (
        [Id] uniqueidentifier NOT NULL,
        [PetId] uniqueidentifier NOT NULL,
        [Type] nvarchar(32) NOT NULL,
        [Title] nvarchar(160) NOT NULL,
        [RecordDate] date NULL,
        [DueDate] date NULL,
        [Provider] nvarchar(160) NULL,
        [Notes] nvarchar(max) NULL,
        [PublicVisibility] nvarchar(32) NOT NULL,
        [ArchivedAt] datetimeoffset NULL,
        [DeletedAt] datetimeoffset NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_CareRecords] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_CareRecords_Pets_PetId] FOREIGN KEY ([PetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [PetContacts] (
        [Id] uniqueidentifier NOT NULL,
        [PetId] uniqueidentifier NOT NULL,
        [UseOwnerDefaults] bit NOT NULL,
        [OwnerDisplayName] nvarchar(200) NULL,
        [PhoneE164] nvarchar(32) NULL,
        [WhatsappE164] nvarchar(32) NULL,
        [EmergencyContactE164] nvarchar(32) NULL,
        [GeneralAreaOverride] nvarchar(200) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PetContacts] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_PetContacts_Pets_PetId] FOREIGN KEY ([PetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [PetMemories] (
        [Id] uniqueidentifier NOT NULL,
        [PetId] uniqueidentifier NOT NULL,
        [Title] nvarchar(160) NOT NULL,
        [MomentDate] date NULL,
        [Type] nvarchar(80) NULL,
        [Caption] nvarchar(max) NULL,
        [Visibility] nvarchar(32) NOT NULL,
        [ShowOnPublicProfile] bit NOT NULL,
        [ShowInLifeTimeline] bit NOT NULL,
        [TimelineNote] nvarchar(max) NULL,
        [CoverMediaFileId] uniqueidentifier NULL,
        [ArchivedAt] datetimeoffset NULL,
        [DeletedAt] datetimeoffset NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PetMemories] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_PetMemories_MediaFiles_CoverMediaFileId] FOREIGN KEY ([CoverMediaFileId]) REFERENCES [MediaFiles] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PetMemories_Pets_PetId] FOREIGN KEY ([PetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [PetPublicProfiles] (
        [Id] uniqueidentifier NOT NULL,
        [PetId] uniqueidentifier NOT NULL,
        [PublicCode] nvarchar(80) NOT NULL,
        [SlugSnapshot] nvarchar(160) NOT NULL,
        [ShowOwnerName] bit NOT NULL,
        [ShowGeneralArea] bit NOT NULL,
        [ShowCareBadges] bit NOT NULL,
        [ShowMoments] bit NOT NULL,
        [ShowTimeline] bit NOT NULL,
        [ShowBirthdayOnTimeline] bit NOT NULL,
        [ShowAdoptionDayOnTimeline] bit NOT NULL,
        [ShowHealthSummary] bit NOT NULL,
        [IsPublicProfileEnabled] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PetPublicProfiles] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_PetPublicProfiles_Pets_PetId] FOREIGN KEY ([PetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [PetSafetySettings] (
        [Id] uniqueidentifier NOT NULL,
        [PetId] uniqueidentifier NOT NULL,
        [SafetyCode] nvarchar(80) NOT NULL,
        [QrSafetyEnabled] bit NOT NULL,
        [ShowPhone] bit NOT NULL,
        [ShowWhatsapp] bit NOT NULL,
        [ShowEmergencyNote] bit NOT NULL,
        [ShowFoundLocationAction] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PetSafetySettings] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_PetSafetySettings_Pets_PetId] FOREIGN KEY ([PetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [FoundReports] (
        [Id] uniqueidentifier NOT NULL,
        [PetId] uniqueidentifier NOT NULL,
        [SmartTagId] uniqueidentifier NULL,
        [TagScanId] uniqueidentifier NULL,
        [FinderMessage] nvarchar(max) NULL,
        [FinderContact] nvarchar(max) NULL,
        [Latitude] decimal(9,6) NULL,
        [Longitude] decimal(9,6) NULL,
        [Country] nvarchar(120) NULL,
        [City] nvarchar(120) NULL,
        [PreciseLocationConsent] bit NOT NULL,
        [SubmittedAt] datetimeoffset NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [ArchivedAt] datetimeoffset NULL,
        CONSTRAINT [PK_FoundReports] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_FoundReports_Pets_PetId] FOREIGN KEY ([PetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [PaymentProofs] (
        [Id] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [MediaFileId] uniqueidentifier NOT NULL,
        [OriginalFileName] nvarchar(260) NOT NULL,
        [StorageFileName] nvarchar(260) NOT NULL,
        [ContentType] nvarchar(120) NOT NULL,
        [FileSize] bigint NOT NULL,
        [StorageProvider] nvarchar(64) NOT NULL,
        [StoragePath] nvarchar(600) NOT NULL,
        [Sha256] nvarchar(128) NOT NULL,
        [UploadedAt] datetimeoffset NOT NULL,
        [PaymentMethod] nvarchar(80) NOT NULL,
        [PaymentReference] nvarchar(160) NULL,
        [OwnerNote] nvarchar(max) NULL,
        [Status] nvarchar(32) NOT NULL,
        [ReviewedByAdminUserId] uniqueidentifier NULL,
        [ReviewedAt] datetimeoffset NULL,
        [RejectionReason] nvarchar(max) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PaymentProofs] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_PaymentProofs_AdminUsers_ReviewedByAdminUserId] FOREIGN KEY ([ReviewedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PaymentProofs_MediaFiles_MediaFileId] FOREIGN KEY ([MediaFileId]) REFERENCES [MediaFiles] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [SmartTags] (
        [Id] uniqueidentifier NOT NULL,
        [TagCode] nvarchar(32) NOT NULL,
        [OwnerUserId] uniqueidentifier NULL,
        [PetId] uniqueidentifier NULL,
        [OrderId] uniqueidentifier NULL,
        [BatchId] uniqueidentifier NULL,
        [HasNfc] bit NOT NULL,
        [Shape] nvarchar(80) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [ActivatedAt] datetimeoffset NULL,
        [DeliveredAt] datetimeoffset NULL,
        [LastScannedAt] datetimeoffset NULL,
        [ReplacementForTagId] uniqueidentifier NULL,
        [ArchivedAt] datetimeoffset NULL,
        [DeletedAt] datetimeoffset NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SmartTags] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_SmartTags_Pets_PetId] FOREIGN KEY ([PetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SmartTags_SmartTagBatches_BatchId] FOREIGN KEY ([BatchId]) REFERENCES [SmartTagBatches] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SmartTags_SmartTags_ReplacementForTagId] FOREIGN KEY ([ReplacementForTagId]) REFERENCES [SmartTags] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SmartTags_Users_OwnerUserId] FOREIGN KEY ([OwnerUserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [TagOrders] (
        [Id] uniqueidentifier NOT NULL,
        [OrderNumber] nvarchar(80) NOT NULL,
        [OwnerUserId] uniqueidentifier NOT NULL,
        [PetId] uniqueidentifier NOT NULL,
        [SmartTagId] uniqueidentifier NULL,
        [ReplacementForTagId] uniqueidentifier NULL,
        [TagType] nvarchar(32) NOT NULL,
        [Shape] nvarchar(80) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [DeliveryFee] decimal(18,2) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [PaymentStatus] nvarchar(32) NOT NULL,
        [PaymentConfirmedAt] datetimeoffset NULL,
        [RecipientName] nvarchar(160) NOT NULL,
        [DeliveryPhoneE164] nvarchar(32) NOT NULL,
        [AddressLine1] nvarchar(240) NOT NULL,
        [AddressLine2] nvarchar(240) NULL,
        [Postcode] nvarchar(20) NOT NULL,
        [City] nvarchar(120) NOT NULL,
        [State] nvarchar(120) NOT NULL,
        [DeliveryNotes] nvarchar(max) NULL,
        [TrackingStatus] nvarchar(max) NULL,
        [TrackingNumber] nvarchar(120) NULL,
        [ShippedAt] datetimeoffset NULL,
        [DeliveredAt] datetimeoffset NULL,
        [CancelledAt] datetimeoffset NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TagOrders] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_TagOrders_Pets_PetId] FOREIGN KEY ([PetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TagOrders_SmartTags_ReplacementForTagId] FOREIGN KEY ([ReplacementForTagId]) REFERENCES [SmartTags] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TagOrders_SmartTags_SmartTagId] FOREIGN KEY ([SmartTagId]) REFERENCES [SmartTags] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TagOrders_Users_OwnerUserId] FOREIGN KEY ([OwnerUserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE TABLE [TagScans] (
        [Id] uniqueidentifier NOT NULL,
        [SmartTagId] uniqueidentifier NULL,
        [PetId] uniqueidentifier NULL,
        [TagCode] nvarchar(32) NOT NULL,
        [ResolvedState] nvarchar(32) NOT NULL,
        [ScanTime] datetimeoffset NOT NULL,
        [Latitude] decimal(9,6) NULL,
        [Longitude] decimal(9,6) NULL,
        [Country] nvarchar(120) NULL,
        [City] nvarchar(120) NULL,
        [IpAddress] nvarchar(64) NULL,
        [Browser] nvarchar(max) NULL,
        [OperatingSystem] nvarchar(max) NULL,
        [DeviceType] nvarchar(max) NULL,
        [Referer] nvarchar(max) NULL,
        [UserAgent] nvarchar(max) NULL,
        [FinderConsentPreciseLocation] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TagScans] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_TagScans_Pets_PetId] FOREIGN KEY ([PetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TagScans_SmartTags_SmartTagId] FOREIGN KEY ([SmartTagId]) REFERENCES [SmartTags] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'Category', N'CreatedAt', N'Description', N'IsPublic', N'Key', N'UpdatedAt', N'UpdatedByAdminUserId', N'ValueJson') AND [object_id] = OBJECT_ID(N'[AppSettings]'))
        SET IDENTITY_INSERT [AppSettings] ON;
    EXEC(N'INSERT INTO [AppSettings] ([Id], [Category], [CreatedAt], [Description], [IsPublic], [Key], [UpdatedAt], [UpdatedByAdminUserId], [ValueJson])
    VALUES (''6193a01f-686c-4b11-9a05-8a6e68ae8449'', N''Products'', ''2026-01-01T00:00:00.0000000+00:00'', N''QR + NFC Smart Tag one-time price.'', CAST(1 AS bit), N''tag.qr_nfc.price'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''"RM39.90"''),
    (''661dfec1-4635-44d6-818a-22b6b46ceeb8'', N''Payments'', ''2026-01-01T00:00:00.0000000+00:00'', N''Manual payment proof review mode for Phase 1.'', CAST(0 AS bit), N''payment.mode'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''"Manual QR Payment"''),
    (''aa394a86-9c14-4f89-b3ad-1f013097d7e6'', N''Features'', ''2026-01-01T00:00:00.0000000+00:00'', N''GPS availability label.'', CAST(1 AS bit), N''gps.status'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''"Coming Later"''),
    (''b60a097e-9407-4307-b224-e91f79838098'', N''Products'', ''2026-01-01T00:00:00.0000000+00:00'', N''QR Pet Tag one-time price.'', CAST(1 AS bit), N''tag.qr.price'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''"RM19.90"''),
    (''eac37b9d-aa41-4067-8f67-e481aa3d4fec'', N''Features'', ''2026-01-01T00:00:00.0000000+00:00'', N''Premium availability label.'', CAST(1 AS bit), N''premium.status'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''"Coming Soon"'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'Category', N'CreatedAt', N'Description', N'IsPublic', N'Key', N'UpdatedAt', N'UpdatedByAdminUserId', N'ValueJson') AND [object_id] = OBJECT_ID(N'[AppSettings]'))
        SET IDENTITY_INSERT [AppSettings] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'ArchivedAt', N'BillingNote', N'Code', N'CreatedAt', N'Description', N'Name', N'PriceLabel', N'Status', N'UpdatedAt') AND [object_id] = OBJECT_ID(N'[Plans]'))
        SET IDENTITY_INSERT [Plans] ON;
    EXEC(N'INSERT INTO [Plans] ([Id], [ArchivedAt], [BillingNote], [Code], [CreatedAt], [Description], [Name], [PriceLabel], [Status], [UpdatedAt])
    VALUES (''1faefb03-9b58-4889-a03b-c9ed34c5fa0f'', NULL, N''Not available in Phase 1'', N''Premium'', ''2026-01-01T00:00:00.0000000+00:00'', N''Premium features are planned for a future phase.'', N''Premium'', N''Coming Soon'', N''ComingSoon'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''4e5e2a13-34c0-4a36-b1b3-30830ca642e9'', NULL, N''Available now'', N''Free'', ''2026-01-01T00:00:00.0000000+00:00'', N''Free MyPetLink pet profiles for Phase 1.'', N''Free'', N''RM0'', N''Available'', ''2026-01-01T00:00:00.0000000+00:00'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'ArchivedAt', N'BillingNote', N'Code', N'CreatedAt', N'Description', N'Name', N'PriceLabel', N'Status', N'UpdatedAt') AND [object_id] = OBJECT_ID(N'[Plans]'))
        SET IDENTITY_INSERT [Plans] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'AllowsAdvancedThemes', N'AllowsFoundReports', N'AllowsSmartTagAddOns', N'CreatedAt', N'MaxCareRecords', N'MaxFamilyMembers', N'MaxMediaPerMemory', N'MaxMemoriesPerPet', N'MaxPets', N'PlanId', N'ScanHistoryDays', N'UpdatedAt') AND [object_id] = OBJECT_ID(N'[PlanLimits]'))
        SET IDENTITY_INSERT [PlanLimits] ON;
    EXEC(N'INSERT INTO [PlanLimits] ([Id], [AllowsAdvancedThemes], [AllowsFoundReports], [AllowsSmartTagAddOns], [CreatedAt], [MaxCareRecords], [MaxFamilyMembers], [MaxMediaPerMemory], [MaxMemoriesPerPet], [MaxPets], [PlanId], [ScanHistoryDays], [UpdatedAt])
    VALUES (''8d6684b1-b25f-4e1a-a353-48621f6fb2c2'', CAST(0 AS bit), CAST(1 AS bit), CAST(1 AS bit), ''2026-01-01T00:00:00.0000000+00:00'', 100, 0, 5, 10, 3, ''4e5e2a13-34c0-4a36-b1b3-30830ca642e9'', 0, ''2026-01-01T00:00:00.0000000+00:00''),
    (''d65c4c7d-821b-496c-bb3d-ea5bf951d65d'', CAST(1 AS bit), CAST(1 AS bit), CAST(1 AS bit), ''2026-01-01T00:00:00.0000000+00:00'', 500, 5, 20, 100, 10, ''1faefb03-9b58-4889-a03b-c9ed34c5fa0f'', 365, ''2026-01-01T00:00:00.0000000+00:00'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'AllowsAdvancedThemes', N'AllowsFoundReports', N'AllowsSmartTagAddOns', N'CreatedAt', N'MaxCareRecords', N'MaxFamilyMembers', N'MaxMediaPerMemory', N'MaxMemoriesPerPet', N'MaxPets', N'PlanId', N'ScanHistoryDays', N'UpdatedAt') AND [object_id] = OBJECT_ID(N'[PlanLimits]'))
        SET IDENTITY_INSERT [PlanLimits] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AdminUsers_CreatedByAdminUserId] ON [AdminUsers] ([CreatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AdminUsers_IsActive] ON [AdminUsers] ([IsActive]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AdminUsers_Role] ON [AdminUsers] ([Role]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_AdminUsers_UserId] ON [AdminUsers] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AppSettings_Category] ON [AppSettings] ([Category]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AppSettings_IsPublic] ON [AppSettings] ([IsPublic]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_AppSettings_Key] ON [AppSettings] ([Key]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AppSettings_UpdatedByAdminUserId] ON [AppSettings] ([UpdatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_Action] ON [AuditLogs] ([Action]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_ActorType_ActorId] ON [AuditLogs] ([ActorType], [ActorId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_CreatedAt] ON [AuditLogs] ([CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_Entity_EntityId] ON [AuditLogs] ([Entity], [EntityId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_CareRecords_PetId_DueDate] ON [CareRecords] ([PetId], [DueDate]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_CareRecords_PetId_PublicVisibility] ON [CareRecords] ([PetId], [PublicVisibility]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_CareRecords_PetId_RecordDate] ON [CareRecords] ([PetId], [RecordDate]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_CareRecords_PetId_Type] ON [CareRecords] ([PetId], [Type]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ExternalLogins_Provider_ProviderSubjectId] ON [ExternalLogins] ([Provider], [ProviderSubjectId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_ExternalLogins_UserId] ON [ExternalLogins] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_FoundReports_PetId] ON [FoundReports] ([PetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_FoundReports_SmartTagId] ON [FoundReports] ([SmartTagId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_FoundReports_SubmittedAt] ON [FoundReports] ([SubmittedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_FoundReports_TagScanId] ON [FoundReports] ([TagScanId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_MediaFileLinks_MediaFileId] ON [MediaFileLinks] ([MediaFileId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_MediaFileLinks_OwnerType_OwnerId_SortOrder] ON [MediaFileLinks] ([OwnerType], [OwnerId], [SortOrder]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_MediaFiles_DeletedAt] ON [MediaFiles] ([DeletedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_MediaFiles_OwnerUserId] ON [MediaFiles] ([OwnerUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_MediaFiles_Sha256] ON [MediaFiles] ([Sha256]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_MediaFiles_StorageProvider] ON [MediaFiles] ([StorageProvider]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_MediaFiles_UploadedAt] ON [MediaFiles] ([UploadedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_OwnerProfiles_PlanId] ON [OwnerProfiles] ([PlanId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_OwnerProfiles_UserId] ON [OwnerProfiles] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_PaymentProofs_MediaFileId] ON [PaymentProofs] ([MediaFileId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_PaymentProofs_OrderId] ON [PaymentProofs] ([OrderId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_PaymentProofs_ReviewedByAdminUserId] ON [PaymentProofs] ([ReviewedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_PaymentProofs_Status] ON [PaymentProofs] ([Status]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_PaymentProofs_UploadedAt] ON [PaymentProofs] ([UploadedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PetContacts_PetId] ON [PetContacts] ([PetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_PetMemories_CoverMediaFileId] ON [PetMemories] ([CoverMediaFileId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_PetMemories_PetId_CreatedAt] ON [PetMemories] ([PetId], [CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_PetMemories_PetId_ShowInLifeTimeline] ON [PetMemories] ([PetId], [ShowInLifeTimeline]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_PetMemories_PetId_ShowOnPublicProfile] ON [PetMemories] ([PetId], [ShowOnPublicProfile]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_PetMemories_PetId_Visibility] ON [PetMemories] ([PetId], [Visibility]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_PetPublicProfiles_IsPublicProfileEnabled_UpdatedAt] ON [PetPublicProfiles] ([IsPublicProfileEnabled], [UpdatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PetPublicProfiles_PetId] ON [PetPublicProfiles] ([PetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PetPublicProfiles_PublicCode] ON [PetPublicProfiles] ([PublicCode]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Pets_CreatedAt] ON [Pets] ([CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Pets_LifecycleStatus] ON [Pets] ([LifecycleStatus]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Pets_LostModeEnabled] ON [Pets] ([LostModeEnabled]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Pets_OwnerUserId] ON [Pets] ([OwnerUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Pets_OwnerUserId_LifecycleStatus] ON [Pets] ([OwnerUserId], [LifecycleStatus]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PetSafetySettings_PetId] ON [PetSafetySettings] ([PetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_PetSafetySettings_QrSafetyEnabled_UpdatedAt] ON [PetSafetySettings] ([QrSafetyEnabled], [UpdatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PetSafetySettings_SafetyCode] ON [PetSafetySettings] ([SafetyCode]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PlanLimits_PlanId] ON [PlanLimits] ([PlanId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Plans_Code] ON [Plans] ([Code]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Plans_Status] ON [Plans] ([Status]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_RefreshTokens_ExpiresAt] ON [RefreshTokens] ([ExpiresAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_RefreshTokens_ReplacedByTokenId] ON [RefreshTokens] ([ReplacedByTokenId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_RefreshTokens_TokenHash] ON [RefreshTokens] ([TokenHash]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_RefreshTokens_UserId] ON [RefreshTokens] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SmartTagBatches_BatchNo] ON [SmartTagBatches] ([BatchNo]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_SmartTagBatches_GeneratedAt] ON [SmartTagBatches] ([GeneratedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_SmartTagBatches_GeneratedByAdminUserId] ON [SmartTagBatches] ([GeneratedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_SmartTagBatches_HasNfc] ON [SmartTagBatches] ([HasNfc]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_SmartTagBatches_Shape] ON [SmartTagBatches] ([Shape]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_SmartTags_BatchId] ON [SmartTags] ([BatchId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_SmartTags_LastScannedAt] ON [SmartTags] ([LastScannedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_SmartTags_OrderId] ON [SmartTags] ([OrderId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_SmartTags_OwnerUserId] ON [SmartTags] ([OwnerUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_SmartTags_PetId] ON [SmartTags] ([PetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_SmartTags_ReplacementForTagId] ON [SmartTags] ([ReplacementForTagId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_SmartTags_Status] ON [SmartTags] ([Status]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_SmartTags_Status_PetId] ON [SmartTags] ([Status], [PetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SmartTags_TagCode] ON [SmartTags] ([TagCode]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagOrders_CreatedAt] ON [TagOrders] ([CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TagOrders_OrderNumber] ON [TagOrders] ([OrderNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagOrders_OwnerUserId] ON [TagOrders] ([OwnerUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagOrders_PaymentStatus] ON [TagOrders] ([PaymentStatus]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagOrders_PaymentStatus_CreatedAt] ON [TagOrders] ([PaymentStatus], [CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagOrders_PetId] ON [TagOrders] ([PetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagOrders_ReplacementForTagId] ON [TagOrders] ([ReplacementForTagId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagOrders_SmartTagId] ON [TagOrders] ([SmartTagId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagOrders_Status] ON [TagOrders] ([Status]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagOrders_Status_CreatedAt] ON [TagOrders] ([Status], [CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagScans_Country_City] ON [TagScans] ([Country], [City]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagScans_PetId] ON [TagScans] ([PetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagScans_PetId_ScanTime] ON [TagScans] ([PetId], [ScanTime]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagScans_ResolvedState] ON [TagScans] ([ResolvedState]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagScans_ScanTime] ON [TagScans] ([ScanTime]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagScans_SmartTagId] ON [TagScans] ([SmartTagId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagScans_SmartTagId_ScanTime] ON [TagScans] ([SmartTagId], [ScanTime]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TagScans_TagCode] ON [TagScans] ([TagCode]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Users_CreatedAt] ON [Users] ([CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Users_NormalizedEmail] ON [Users] ([NormalizedEmail]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Users_Status] ON [Users] ([Status]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    ALTER TABLE [FoundReports] ADD CONSTRAINT [FK_FoundReports_SmartTags_SmartTagId] FOREIGN KEY ([SmartTagId]) REFERENCES [SmartTags] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    ALTER TABLE [FoundReports] ADD CONSTRAINT [FK_FoundReports_TagScans_TagScanId] FOREIGN KEY ([TagScanId]) REFERENCES [TagScans] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    ALTER TABLE [PaymentProofs] ADD CONSTRAINT [FK_PaymentProofs_TagOrders_OrderId] FOREIGN KEY ([OrderId]) REFERENCES [TagOrders] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    ALTER TABLE [SmartTags] ADD CONSTRAINT [FK_SmartTags_TagOrders_OrderId] FOREIGN KEY ([OrderId]) REFERENCES [TagOrders] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260703020004_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260703020004_InitialCreate', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260705013926_RenameTagShapeToVariant'
)
BEGIN
    EXEC sp_rename N'[TagOrders].[Shape]', N'Variant', N'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260705013926_RenameTagShapeToVariant'
)
BEGIN
    EXEC sp_rename N'[SmartTags].[Shape]', N'Variant', N'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260705013926_RenameTagShapeToVariant'
)
BEGIN
    EXEC sp_rename N'[SmartTagBatches].[Shape]', N'Variant', N'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260705013926_RenameTagShapeToVariant'
)
BEGIN
    EXEC sp_rename N'[SmartTagBatches].[IX_SmartTagBatches_Shape]', N'IX_SmartTagBatches_Variant', N'INDEX';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260705013926_RenameTagShapeToVariant'
)
BEGIN
    UPDATE [TagOrders] SET [Variant] = 'Standard' WHERE [Variant] IS NULL OR [Variant] NOT IN ('Lightweight', 'Standard');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260705013926_RenameTagShapeToVariant'
)
BEGIN
    UPDATE [SmartTags] SET [Variant] = 'Standard' WHERE [Variant] IS NULL OR [Variant] NOT IN ('Lightweight', 'Standard');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260705013926_RenameTagShapeToVariant'
)
BEGIN
    UPDATE [SmartTagBatches] SET [Variant] = 'Standard' WHERE [Variant] IS NULL OR [Variant] NOT IN ('Lightweight', 'Standard');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260705013926_RenameTagShapeToVariant'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260705013926_RenameTagShapeToVariant', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    ALTER TABLE [Pets] ADD [CoverMediaFileId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    ALTER TABLE [Pets] ADD [ProfileMediaFileId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    ALTER TABLE [MediaFiles] ADD [BucketName] nvarchar(160) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    ALTER TABLE [MediaFiles] ADD [Category] nvarchar(64) NOT NULL DEFAULT N'Other';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    ALTER TABLE [MediaFiles] ADD [CompletedAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    ALTER TABLE [MediaFiles] ADD [IsPublic] bit NOT NULL DEFAULT CAST(0 AS bit);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    ALTER TABLE [MediaFiles] ADD [MediaType] nvarchar(32) NOT NULL DEFAULT N'Document';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    ALTER TABLE [MediaFiles] ADD [ObjectKey] nvarchar(600) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    ALTER TABLE [MediaFiles] ADD [PetId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    ALTER TABLE [MediaFiles] ADD [ThumbnailObjectKey] nvarchar(600) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    ALTER TABLE [MediaFiles] ADD [UploadStatus] nvarchar(32) NOT NULL DEFAULT N'Ready';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    CREATE INDEX [IX_Pets_CoverMediaFileId] ON [Pets] ([CoverMediaFileId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    CREATE INDEX [IX_Pets_ProfileMediaFileId] ON [Pets] ([ProfileMediaFileId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_MediaFiles_BucketName_ObjectKey] ON [MediaFiles] ([BucketName], [ObjectKey]) WHERE [ObjectKey] <> ''''');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    CREATE INDEX [IX_MediaFiles_Category] ON [MediaFiles] ([Category]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    CREATE INDEX [IX_MediaFiles_CompletedAt] ON [MediaFiles] ([CompletedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    CREATE INDEX [IX_MediaFiles_IsPublic] ON [MediaFiles] ([IsPublic]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    CREATE INDEX [IX_MediaFiles_MediaType] ON [MediaFiles] ([MediaType]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    CREATE INDEX [IX_MediaFiles_PetId] ON [MediaFiles] ([PetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    CREATE INDEX [IX_MediaFiles_UploadStatus] ON [MediaFiles] ([UploadStatus]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    ALTER TABLE [MediaFiles] ADD CONSTRAINT [FK_MediaFiles_Pets_PetId] FOREIGN KEY ([PetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    ALTER TABLE [Pets] ADD CONSTRAINT [FK_Pets_MediaFiles_CoverMediaFileId] FOREIGN KEY ([CoverMediaFileId]) REFERENCES [MediaFiles] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    ALTER TABLE [Pets] ADD CONSTRAINT [FK_Pets_MediaFiles_ProfileMediaFileId] FOREIGN KEY ([ProfileMediaFileId]) REFERENCES [MediaFiles] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260710061633_AddCloudflareR2MediaUploads'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260710061633_AddCloudflareR2MediaUploads', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260711040325_AddEstimatedBirthYear'
)
BEGIN
    ALTER TABLE [Pets] ADD [EstimatedBirthYear] smallint NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260711040325_AddEstimatedBirthYear'
)
BEGIN
    ;WITH LegacyAge AS
    (
        SELECT
            [Id],
            LOWER(LTRIM(RTRIM([EstimatedAgeLabel]))) AS [NormalizedLabel],
            CASE
                WHEN YEAR([CreatedAt]) BETWEEN 1900 AND YEAR(SYSUTCDATETIME())
                    THEN YEAR([CreatedAt])
                ELSE YEAR(SYSUTCDATETIME())
            END AS [ReferenceYear]
        FROM [Pets]
        WHERE [Birthday] IS NULL
          AND [EstimatedBirthYear] IS NULL
          AND [EstimatedAgeLabel] IS NOT NULL
    ),
    ParsedAge AS
    (
        SELECT
            [Id],
            [ReferenceYear],
            CASE
                WHEN [NormalizedLabel] IN ('estimated under 1 year', 'under 1 year') THEN 0
                WHEN [NormalizedLabel] LIKE 'estimated % year'
                  OR [NormalizedLabel] LIKE 'estimated % years'
                  OR [NormalizedLabel] LIKE '% year'
                  OR [NormalizedLabel] LIKE '% years'
                    THEN TRY_CONVERT(
                        int,
                        REPLACE(
                            REPLACE(
                                REPLACE([NormalizedLabel], 'estimated ', ''),
                                ' years', ''),
                            ' year', ''))
                ELSE NULL
            END AS [EstimatedYears]
        FROM LegacyAge
    )
    UPDATE pet
    SET [EstimatedBirthYear] = CONVERT(smallint, parsed.[ReferenceYear] - parsed.[EstimatedYears])
    FROM [Pets] AS pet
    INNER JOIN ParsedAge AS parsed ON parsed.[Id] = pet.[Id]
    WHERE parsed.[EstimatedYears] BETWEEN 0 AND parsed.[ReferenceYear] - 1900;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260711040325_AddEstimatedBirthYear'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260711040325_AddEstimatedBirthYear', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260712094248_AddPetCoverFocalPosition'
)
BEGIN
    ALTER TABLE [Pets] ADD [CoverPositionX] tinyint NOT NULL DEFAULT CAST(50 AS tinyint);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260712094248_AddPetCoverFocalPosition'
)
BEGIN
    ALTER TABLE [Pets] ADD [CoverPositionY] tinyint NOT NULL DEFAULT CAST(50 AS tinyint);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260712094248_AddPetCoverFocalPosition'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260712094248_AddPetCoverFocalPosition', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260714045218_FavoriteFoodsAndToysAsLists'
)
BEGIN
    ALTER TABLE [Pets] ADD [FavoriteFoodsJson] nvarchar(max) NOT NULL DEFAULT N'[]';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260714045218_FavoriteFoodsAndToysAsLists'
)
BEGIN
    ALTER TABLE [Pets] ADD [FavoriteToysJson] nvarchar(max) NOT NULL DEFAULT N'[]';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260714045218_FavoriteFoodsAndToysAsLists'
)
BEGIN
    EXEC(N'UPDATE Pets SET FavoriteFoodsJson = N''["'' + STRING_ESCAPE(LTRIM(RTRIM(FavoriteFood)), ''json'') + N''"]'' WHERE FavoriteFood IS NOT NULL AND LTRIM(RTRIM(FavoriteFood)) <> N'''';');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260714045218_FavoriteFoodsAndToysAsLists'
)
BEGIN
    EXEC(N'UPDATE Pets SET FavoriteToysJson = N''["'' + STRING_ESCAPE(LTRIM(RTRIM(FavoriteToy)), ''json'') + N''"]'' WHERE FavoriteToy IS NOT NULL AND LTRIM(RTRIM(FavoriteToy)) <> N'''';');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260714045218_FavoriteFoodsAndToysAsLists'
)
BEGIN
    DECLARE @var0 sysname;
    SELECT @var0 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[Pets]') AND [c].[name] = N'FavoriteFood');
    IF @var0 IS NOT NULL EXEC(N'ALTER TABLE [Pets] DROP CONSTRAINT [' + @var0 + '];');
    ALTER TABLE [Pets] DROP COLUMN [FavoriteFood];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260714045218_FavoriteFoodsAndToysAsLists'
)
BEGIN
    DECLARE @var1 sysname;
    SELECT @var1 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[Pets]') AND [c].[name] = N'FavoriteToy');
    IF @var1 IS NOT NULL EXEC(N'ALTER TABLE [Pets] DROP CONSTRAINT [' + @var1 + '];');
    ALTER TABLE [Pets] DROP COLUMN [FavoriteToy];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260714045218_FavoriteFoodsAndToysAsLists'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260714045218_FavoriteFoodsAndToysAsLists', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260715175811_AddPetAllergies'
)
BEGIN
    ALTER TABLE [Pets] ADD [AllergiesJson] nvarchar(max) NOT NULL DEFAULT N'[]';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260715175811_AddPetAllergies'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260715175811_AddPetAllergies', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716075929_AddPublicAllergyVisibility'
)
BEGIN
    ALTER TABLE [PetPublicProfiles] ADD [ShowAllergiesOnPublicProfile] bit NOT NULL DEFAULT CAST(0 AS bit);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716075929_AddPublicAllergyVisibility'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260716075929_AddPublicAllergyVisibility', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716181516_AddTagFulfilmentStatus'
)
BEGIN
    ALTER TABLE [SmartTags] ADD [FulfilmentStatus] nvarchar(32) NOT NULL DEFAULT N'Generated';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716181516_AddTagFulfilmentStatus'
)
BEGIN
    ALTER TABLE [SmartTags] ADD [PrintedAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716181516_AddTagFulfilmentStatus'
)
BEGIN
    ALTER TABLE [SmartTags] ADD [ReceivedAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716181516_AddTagFulfilmentStatus'
)
BEGIN
    ALTER TABLE [SmartTags] ADD [SentToOwnerAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716181516_AddTagFulfilmentStatus'
)
BEGIN
    ALTER TABLE [SmartTags] ADD [SentToResellerAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716181516_AddTagFulfilmentStatus'
)
BEGIN
    UPDATE t
    SET t.FulfilmentStatus = N'SentToOwner',
        t.SentToOwnerAt = COALESCE(o.ShippedAt, t.DeliveredAt, t.ActivatedAt)
    FROM [SmartTags] t
    INNER JOIN [TagOrders] o ON o.Id = t.OrderId
    WHERE o.ShippedAt IS NOT NULL
       OR o.DeliveredAt IS NOT NULL
       OR t.DeliveredAt IS NOT NULL
       OR t.ActivatedAt IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716181516_AddTagFulfilmentStatus'
)
BEGIN
    UPDATE [SmartTags]
    SET FulfilmentStatus = N'Received',
        ReceivedAt = ActivatedAt
    WHERE OrderId IS NULL
      AND ActivatedAt IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716181516_AddTagFulfilmentStatus'
)
BEGIN
    UPDATE t
    SET t.FulfilmentStatus = N'SentToReseller',
        t.SentToResellerAt = b.SentToResellerAt,
        t.PrintedAt = b.PrintedAt
    FROM [SmartTags] t
    INNER JOIN [SmartTagBatches] b ON b.Id = t.BatchId
    WHERE t.FulfilmentStatus = N'Generated'
      AND b.SentToResellerAt IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716181516_AddTagFulfilmentStatus'
)
BEGIN
    UPDATE t
    SET t.FulfilmentStatus = N'Printed',
        t.PrintedAt = b.PrintedAt
    FROM [SmartTags] t
    INNER JOIN [SmartTagBatches] b ON b.Id = t.BatchId
    WHERE t.FulfilmentStatus = N'Generated'
      AND b.PrintedAt IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716181516_AddTagFulfilmentStatus'
)
BEGIN
    CREATE INDEX [IX_SmartTags_CreatedAt] ON [SmartTags] ([CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716181516_AddTagFulfilmentStatus'
)
BEGIN
    CREATE INDEX [IX_SmartTags_FulfilmentStatus] ON [SmartTags] ([FulfilmentStatus]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716181516_AddTagFulfilmentStatus'
)
BEGIN
    CREATE INDEX [IX_SmartTags_FulfilmentStatus_CreatedAt] ON [SmartTags] ([FulfilmentStatus], [CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260716181516_AddTagFulfilmentStatus'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260716181516_AddTagFulfilmentStatus', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717000154_AddSmartTagQueryIndexes'
)
BEGIN
    CREATE INDEX [IX_SmartTags_ActivatedAt] ON [SmartTags] ([ActivatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717000154_AddSmartTagQueryIndexes'
)
BEGIN
    CREATE INDEX [IX_SmartTags_UpdatedAt] ON [SmartTags] ([UpdatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717000154_AddSmartTagQueryIndexes'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260717000154_AddSmartTagQueryIndexes', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717002730_AddAdminOrderQueryIndexes'
)
BEGIN
    CREATE INDEX [IX_TagOrders_DeliveredAt] ON [TagOrders] ([DeliveredAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717002730_AddAdminOrderQueryIndexes'
)
BEGIN
    CREATE INDEX [IX_TagOrders_PaymentConfirmedAt] ON [TagOrders] ([PaymentConfirmedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717002730_AddAdminOrderQueryIndexes'
)
BEGIN
    CREATE INDEX [IX_TagOrders_ShippedAt] ON [TagOrders] ([ShippedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717002730_AddAdminOrderQueryIndexes'
)
BEGIN
    CREATE INDEX [IX_TagOrders_UpdatedAt] ON [TagOrders] ([UpdatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717002730_AddAdminOrderQueryIndexes'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260717002730_AddAdminOrderQueryIndexes', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717020159_AddAdminPaymentAndPetProfileQueryIndexes'
)
BEGIN
    CREATE INDEX [IX_Pets_Species] ON [Pets] ([Species]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717020159_AddAdminPaymentAndPetProfileQueryIndexes'
)
BEGIN
    CREATE INDEX [IX_Pets_UpdatedAt] ON [Pets] ([UpdatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717020159_AddAdminPaymentAndPetProfileQueryIndexes'
)
BEGIN
    CREATE INDEX [IX_PaymentProofs_PaymentReference] ON [PaymentProofs] ([PaymentReference]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717020159_AddAdminPaymentAndPetProfileQueryIndexes'
)
BEGIN
    CREATE INDEX [IX_PaymentProofs_ReviewedAt] ON [PaymentProofs] ([ReviewedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717020159_AddAdminPaymentAndPetProfileQueryIndexes'
)
BEGIN
    CREATE INDEX [IX_PaymentProofs_Status_UploadedAt] ON [PaymentProofs] ([Status], [UploadedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717020159_AddAdminPaymentAndPetProfileQueryIndexes'
)
BEGIN
    CREATE INDEX [IX_PaymentProofs_UpdatedAt] ON [PaymentProofs] ([UpdatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717020159_AddAdminPaymentAndPetProfileQueryIndexes'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260717020159_AddAdminPaymentAndPetProfileQueryIndexes', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717025444_AddAdminOwnerQueryIndex'
)
BEGIN
    CREATE INDEX [IX_Users_UpdatedAt] ON [Users] ([UpdatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260717025444_AddAdminOwnerQueryIndex'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260717025444_AddAdminOwnerQueryIndex', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [RowVersion] rowversion NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    ALTER TABLE [SmartTags] ADD [ProductVariantId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    ALTER TABLE [SmartTags] ADD [RowVersion] rowversion NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    ALTER TABLE [SmartTagBatches] ADD [ProductVariantId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE TABLE [Promotions] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [InternalDescription] nvarchar(1000) NULL,
        [DisplayLabel] nvarchar(160) NULL,
        [IsActive] bit NOT NULL,
        [IsAutomatic] bit NOT NULL,
        [DiscountType] nvarchar(32) NOT NULL,
        [DiscountValue] decimal(18,2) NOT NULL,
        [StartsAt] datetimeoffset NOT NULL,
        [EndsAt] datetimeoffset NOT NULL,
        [Priority] int NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_Promotions] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE TABLE [TagProducts] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [Slug] nvarchar(120) NOT NULL,
        [ShortDescription] nvarchar(300) NULL,
        [Description] nvarchar(4000) NULL,
        [IsPublished] bit NOT NULL,
        [IsArchived] bit NOT NULL,
        [SortOrder] int NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TagProducts] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE TABLE [TagProductVariants] (
        [Id] uniqueidentifier NOT NULL,
        [TagProductId] uniqueidentifier NOT NULL,
        [PublicKey] nvarchar(32) NOT NULL,
        [Sku] nvarchar(80) NOT NULL,
        [DisplayName] nvarchar(160) NOT NULL,
        [SupportsQr] bit NOT NULL,
        [SupportsNfc] bit NOT NULL,
        [TagVariant] nvarchar(80) NOT NULL,
        [WidthMm] decimal(10,2) NULL,
        [HeightMm] decimal(10,2) NULL,
        [ThicknessMm] decimal(10,2) NULL,
        [WeightGrams] decimal(10,2) NULL,
        [Material] nvarchar(160) NULL,
        [Shape] nvarchar(120) NULL,
        [Colour] nvarchar(120) NULL,
        [PackagingType] nvarchar(200) NULL,
        [BasePrice] decimal(18,2) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [CompareAtPrice] decimal(18,2) NULL,
        [PrintTemplateCode] nvarchar(120) NULL,
        [ProductionNotes] nvarchar(1000) NULL,
        [IsActive] bit NOT NULL,
        [IsPurchasable] bit NOT NULL,
        [SortOrder] int NOT NULL,
        [ArchivedAt] datetimeoffset NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TagProductVariants] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_TagProductVariants_TagProducts_TagProductId] FOREIGN KEY ([TagProductId]) REFERENCES [TagProducts] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE TABLE [PromotionVariants] (
        [PromotionId] uniqueidentifier NOT NULL,
        [TagProductVariantId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PromotionVariants] PRIMARY KEY ([PromotionId], [TagProductVariantId]),
        CONSTRAINT [FK_PromotionVariants_Promotions_PromotionId] FOREIGN KEY ([PromotionId]) REFERENCES [Promotions] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PromotionVariants_TagProductVariants_TagProductVariantId] FOREIGN KEY ([TagProductVariantId]) REFERENCES [TagProductVariants] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE TABLE [TagOrderItems] (
        [Id] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [ProductVariantId] uniqueidentifier NULL,
        [SkuSnapshot] nvarchar(80) NOT NULL,
        [ProductNameSnapshot] nvarchar(160) NOT NULL,
        [VariantNameSnapshot] nvarchar(160) NOT NULL,
        [UnitBasePrice] decimal(18,2) NOT NULL,
        [Quantity] int NOT NULL,
        [Subtotal] decimal(18,2) NOT NULL,
        [PromotionId] uniqueidentifier NULL,
        [PromotionNameSnapshot] nvarchar(160) NULL,
        [DiscountAmount] decimal(18,2) NOT NULL,
        [FinalUnitPrice] decimal(18,2) NOT NULL,
        [FinalAmount] decimal(18,2) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TagOrderItems] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_TagOrderItems_Promotions_PromotionId] FOREIGN KEY ([PromotionId]) REFERENCES [Promotions] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TagOrderItems_TagOrders_OrderId] FOREIGN KEY ([OrderId]) REFERENCES [TagOrders] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TagOrderItems_TagProductVariants_ProductVariantId] FOREIGN KEY ([ProductVariantId]) REFERENCES [TagProductVariants] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE TABLE [TagProductMedia] (
        [Id] uniqueidentifier NOT NULL,
        [TagProductId] uniqueidentifier NOT NULL,
        [TagProductVariantId] uniqueidentifier NULL,
        [MediaFileId] uniqueidentifier NOT NULL,
        [SortOrder] int NOT NULL,
        [AltText] nvarchar(300) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [ArchivedAt] datetimeoffset NULL,
        CONSTRAINT [PK_TagProductMedia] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_TagProductMedia_MediaFiles_MediaFileId] FOREIGN KEY ([MediaFileId]) REFERENCES [MediaFiles] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TagProductMedia_TagProductVariants_TagProductVariantId] FOREIGN KEY ([TagProductVariantId]) REFERENCES [TagProductVariants] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TagProductMedia_TagProducts_TagProductId] FOREIGN KEY ([TagProductId]) REFERENCES [TagProducts] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_SmartTags_ProductVariantId] ON [SmartTags] ([ProductVariantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_SmartTagBatches_ProductVariantId] ON [SmartTagBatches] ([ProductVariantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_Promotions_IsActive_IsAutomatic_StartsAt_EndsAt] ON [Promotions] ([IsActive], [IsAutomatic], [StartsAt], [EndsAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_Promotions_Priority] ON [Promotions] ([Priority]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_Promotions_UpdatedAt] ON [Promotions] ([UpdatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_PromotionVariants_TagProductVariantId] ON [PromotionVariants] ([TagProductVariantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagOrderItems_OrderId] ON [TagOrderItems] ([OrderId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagOrderItems_ProductVariantId] ON [TagOrderItems] ([ProductVariantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagOrderItems_PromotionId] ON [TagOrderItems] ([PromotionId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProductMedia_MediaFileId] ON [TagProductMedia] ([MediaFileId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProductMedia_TagProductId_SortOrder] ON [TagProductMedia] ([TagProductId], [SortOrder]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProductMedia_TagProductVariantId_SortOrder] ON [TagProductMedia] ([TagProductVariantId], [SortOrder]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProducts_IsPublished_IsArchived_SortOrder] ON [TagProducts] ([IsPublished], [IsArchived], [SortOrder]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TagProducts_Slug] ON [TagProducts] ([Slug]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProducts_UpdatedAt] ON [TagProducts] ([UpdatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProductVariants_IsActive_IsPurchasable_ArchivedAt] ON [TagProductVariants] ([IsActive], [IsPurchasable], [ArchivedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TagProductVariants_PublicKey] ON [TagProductVariants] ([PublicKey]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TagProductVariants_Sku] ON [TagProductVariants] ([Sku]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProductVariants_SupportsQr_SupportsNfc] ON [TagProductVariants] ([SupportsQr], [SupportsNfc]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProductVariants_TagProductId] ON [TagProductVariants] ([TagProductId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    ALTER TABLE [SmartTagBatches] ADD CONSTRAINT [FK_SmartTagBatches_TagProductVariants_ProductVariantId] FOREIGN KEY ([ProductVariantId]) REFERENCES [TagProductVariants] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    ALTER TABLE [SmartTags] ADD CONSTRAINT [FK_SmartTags_TagProductVariants_ProductVariantId] FOREIGN KEY ([ProductVariantId]) REFERENCES [TagProductVariants] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720115204_AddTagVariantPresets'
)
BEGIN
    ALTER TABLE [TagProductVariants] ADD [TagVariantPresetId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720115204_AddTagVariantPresets'
)
BEGIN
    CREATE TABLE [TagVariantPresets] (
        [Id] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [DisplayName] nvarchar(80) NOT NULL,
        [Description] nvarchar(400) NULL,
        [IsActive] bit NOT NULL,
        [SortOrder] int NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TagVariantPresets] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720115204_AddTagVariantPresets'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'Code', N'CreatedAt', N'Description', N'DisplayName', N'IsActive', N'SortOrder', N'UpdatedAt') AND [object_id] = OBJECT_ID(N'[TagVariantPresets]'))
        SET IDENTITY_INSERT [TagVariantPresets] ON;
    EXEC(N'INSERT INTO [TagVariantPresets] ([Id], [Code], [CreatedAt], [Description], [DisplayName], [IsActive], [SortOrder], [UpdatedAt])
    VALUES (''3f2c8f5e-08d4-4c5f-9a51-b96f8a4f7c01'', N''STANDARD'', ''2026-01-01T00:00:00.0000000+00:00'', N''Standard-size tag for dogs and medium to large pets.'', N''Standard'', CAST(1 AS bit), 0, ''2026-01-01T00:00:00.0000000+00:00''),
    (''3f2c8f5e-08d4-4c5f-9a51-b96f8a4f7c02'', N''LIGHTWEIGHT'', ''2026-01-01T00:00:00.0000000+00:00'', N''Lighter tag for cats and small pets.'', N''Lightweight'', CAST(1 AS bit), 1, ''2026-01-01T00:00:00.0000000+00:00'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'Code', N'CreatedAt', N'Description', N'DisplayName', N'IsActive', N'SortOrder', N'UpdatedAt') AND [object_id] = OBJECT_ID(N'[TagVariantPresets]'))
        SET IDENTITY_INSERT [TagVariantPresets] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720115204_AddTagVariantPresets'
)
BEGIN
    CREATE INDEX [IX_TagProductVariants_TagVariantPresetId] ON [TagProductVariants] ([TagVariantPresetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720115204_AddTagVariantPresets'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TagVariantPresets_Code] ON [TagVariantPresets] ([Code]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720115204_AddTagVariantPresets'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TagVariantPresets_DisplayName] ON [TagVariantPresets] ([DisplayName]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720115204_AddTagVariantPresets'
)
BEGIN
    CREATE INDEX [IX_TagVariantPresets_IsActive_SortOrder] ON [TagVariantPresets] ([IsActive], [SortOrder]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720115204_AddTagVariantPresets'
)
BEGIN
    ALTER TABLE [TagProductVariants] ADD CONSTRAINT [FK_TagProductVariants_TagVariantPresets_TagVariantPresetId] FOREIGN KEY ([TagVariantPresetId]) REFERENCES [TagVariantPresets] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720115204_AddTagVariantPresets'
)
BEGIN
    UPDATE [TagProductVariants] SET [TagVariantPresetId] = '3f2c8f5e-08d4-4c5f-9a51-b96f8a4f7c01' WHERE [TagVariantPresetId] IS NULL AND UPPER(LTRIM(RTRIM([TagVariant]))) = 'STANDARD';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720115204_AddTagVariantPresets'
)
BEGIN
    UPDATE [TagProductVariants] SET [TagVariantPresetId] = '3f2c8f5e-08d4-4c5f-9a51-b96f8a4f7c02' WHERE [TagVariantPresetId] IS NULL AND UPPER(LTRIM(RTRIM([TagVariant]))) = 'LIGHTWEIGHT';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720115204_AddTagVariantPresets'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260720115204_AddTagVariantPresets', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721001123_AddTagOrderIdempotencyKey'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [IdempotencyKey] nvarchar(80) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721001123_AddTagOrderIdempotencyKey'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [RequestFingerprint] nvarchar(128) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721001123_AddTagOrderIdempotencyKey'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_TagOrders_OwnerUserId_IdempotencyKey] ON [TagOrders] ([OwnerUserId], [IdempotencyKey]) WHERE [IdempotencyKey] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721001123_AddTagOrderIdempotencyKey'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260721001123_AddTagOrderIdempotencyKey', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721095353_AddOrderItemCapabilitySnapshots'
)
BEGIN
    ALTER TABLE [TagOrderItems] ADD [SupportsNfcSnapshot] bit NOT NULL DEFAULT CAST(0 AS bit);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721095353_AddOrderItemCapabilitySnapshots'
)
BEGIN
    ALTER TABLE [TagOrderItems] ADD [SupportsQrSnapshot] bit NOT NULL DEFAULT CAST(0 AS bit);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721095353_AddOrderItemCapabilitySnapshots'
)
BEGIN

                    UPDATE item
                    SET item.SupportsQrSnapshot = 1,
                        item.SupportsNfcSnapshot = CASE WHEN o.TagType = 'QrNfcSmartTag' THEN 1 ELSE 0 END
                    FROM TagOrderItems AS item
                    INNER JOIN TagOrders AS o ON o.Id = item.OrderId;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260721095353_AddOrderItemCapabilitySnapshots'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260721095353_AddOrderItemCapabilitySnapshots', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260723064015_AddTagScanSource'
)
BEGIN
    ALTER TABLE [TagScans] ADD [Source] nvarchar(16) NOT NULL DEFAULT N'Legacy';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260723064015_AddTagScanSource'
)
BEGIN
    CREATE INDEX [IX_TagScans_SmartTagId_Source_ScanTime] ON [TagScans] ([SmartTagId], [Source], [ScanTime]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260723064015_AddTagScanSource'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260723064015_AddTagScanSource', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726175435_AddPaymentConfirmationEmailOutbox'
)
BEGIN
    CREATE TABLE [EmailOutbox] (
        [Id] uniqueidentifier NOT NULL,
        [MessageType] nvarchar(64) NOT NULL,
        [RecipientEmail] nvarchar(320) NOT NULL,
        [RecipientName] nvarchar(160) NOT NULL,
        [Subject] nvarchar(240) NOT NULL,
        [TemplateDataJson] nvarchar(max) NOT NULL,
        [RelatedOrderId] uniqueidentifier NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [AttemptCount] int NOT NULL,
        [MaxAttempts] int NOT NULL,
        [NextAttemptAt] datetimeoffset NOT NULL,
        [LastAttemptAt] datetimeoffset NULL,
        [SentAt] datetimeoffset NULL,
        [LastError] nvarchar(600) NULL,
        [LockToken] uniqueidentifier NULL,
        [LockedUntil] datetimeoffset NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_EmailOutbox] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_EmailOutbox_TagOrders_RelatedOrderId] FOREIGN KEY ([RelatedOrderId]) REFERENCES [TagOrders] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726175435_AddPaymentConfirmationEmailOutbox'
)
BEGIN
    CREATE INDEX [IX_EmailOutbox_LockedUntil] ON [EmailOutbox] ([LockedUntil]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726175435_AddPaymentConfirmationEmailOutbox'
)
BEGIN
    CREATE UNIQUE INDEX [IX_EmailOutbox_RelatedOrderId_MessageType] ON [EmailOutbox] ([RelatedOrderId], [MessageType]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726175435_AddPaymentConfirmationEmailOutbox'
)
BEGIN
    CREATE INDEX [IX_EmailOutbox_Status_NextAttemptAt] ON [EmailOutbox] ([Status], [NextAttemptAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726175435_AddPaymentConfirmationEmailOutbox'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260726175435_AddPaymentConfirmationEmailOutbox', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    DROP INDEX [IX_EmailOutbox_RelatedOrderId_MessageType] ON [EmailOutbox];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    ALTER TABLE [ExternalLogins] ADD [EmailVerifiedAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    DECLARE @var2 sysname;
    SELECT @var2 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[EmailOutbox]') AND [c].[name] = N'RelatedOrderId');
    IF @var2 IS NOT NULL EXEC(N'ALTER TABLE [EmailOutbox] DROP CONSTRAINT [' + @var2 + '];');
    ALTER TABLE [EmailOutbox] ALTER COLUMN [RelatedOrderId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    ALTER TABLE [EmailOutbox] ADD [RelatedUserId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_EmailOutbox_RelatedOrderId_MessageType] ON [EmailOutbox] ([RelatedOrderId], [MessageType]) WHERE [RelatedOrderId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_EmailOutbox_RelatedUserId_MessageType] ON [EmailOutbox] ([RelatedUserId], [MessageType]) WHERE [RelatedUserId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    EXEC(N'ALTER TABLE [EmailOutbox] ADD CONSTRAINT [CK_EmailOutbox_RelatedEntity] CHECK (([RelatedOrderId] IS NOT NULL AND [RelatedUserId] IS NULL) OR ([RelatedOrderId] IS NULL AND [RelatedUserId] IS NOT NULL))');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    ALTER TABLE [EmailOutbox] ADD CONSTRAINT [FK_EmailOutbox_Users_RelatedUserId] FOREIGN KEY ([RelatedUserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260726183156_AddOwnerWelcomeEmail', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [Country] nvarchar(80) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [DeliveryMethodName] nvarchar(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [DeliveryZoneName] nvarchar(80) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [FreeShippingReason] nvarchar(240) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [StateCode] nvarchar(8) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [TotalAmount] decimal(18,2) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    CREATE TABLE [DeliveryRates] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [ZoneCode] nvarchar(16) NOT NULL,
        [ApplicableStateCodesJson] nvarchar(500) NOT NULL,
        [Fee] decimal(18,2) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [FreeShippingThreshold] decimal(18,2) NULL,
        [IsActive] bit NOT NULL,
        [DisplayOrder] int NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_DeliveryRates] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'Name', N'ZoneCode', N'ApplicableStateCodesJson', N'Fee', N'Currency', N'FreeShippingThreshold', N'IsActive', N'DisplayOrder', N'CreatedAt', N'UpdatedAt') AND [object_id] = OBJECT_ID(N'[DeliveryRates]'))
        SET IDENTITY_INSERT [DeliveryRates] ON;
    EXEC(N'INSERT INTO [DeliveryRates] ([Id], [Name], [ZoneCode], [ApplicableStateCodesJson], [Fee], [Currency], [FreeShippingThreshold], [IsActive], [DisplayOrder], [CreatedAt], [UpdatedAt])
    VALUES (''6c50d914-8550-41e8-a923-010cc3b8a101'', N''Peninsular Standard Delivery'', N''PEN'', N''["JHR","KDH","KTN","MLK","NSN","PHG","PRK","PLS","PNG","SGR","TRG","KUL","PJY"]'', 0.0, N''MYR'', NULL, CAST(0 AS bit), 10, ''2026-07-27T00:00:00.0000000+00:00'', ''2026-07-27T00:00:00.0000000+00:00''),
    (''6c50d914-8550-41e8-a923-010cc3b8a102'', N''Sabah Standard Delivery'', N''SBH'', N''["SBH"]'', 0.0, N''MYR'', NULL, CAST(0 AS bit), 20, ''2026-07-27T00:00:00.0000000+00:00'', ''2026-07-27T00:00:00.0000000+00:00''),
    (''6c50d914-8550-41e8-a923-010cc3b8a103'', N''Sarawak Standard Delivery'', N''SWK'', N''["SWK"]'', 0.0, N''MYR'', NULL, CAST(0 AS bit), 30, ''2026-07-27T00:00:00.0000000+00:00'', ''2026-07-27T00:00:00.0000000+00:00''),
    (''6c50d914-8550-41e8-a923-010cc3b8a104'', N''Labuan Standard Delivery'', N''LBN'', N''["LBN"]'', 0.0, N''MYR'', NULL, CAST(0 AS bit), 40, ''2026-07-27T00:00:00.0000000+00:00'', ''2026-07-27T00:00:00.0000000+00:00'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'Name', N'ZoneCode', N'ApplicableStateCodesJson', N'Fee', N'Currency', N'FreeShippingThreshold', N'IsActive', N'DisplayOrder', N'CreatedAt', N'UpdatedAt') AND [object_id] = OBJECT_ID(N'[DeliveryRates]'))
        SET IDENTITY_INSERT [DeliveryRates] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    CREATE INDEX [IX_DeliveryRates_IsActive_DisplayOrder] ON [DeliveryRates] ([IsActive], [DisplayOrder]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DeliveryRates_ZoneCode] ON [DeliveryRates] ([ZoneCode]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260727011256_AddMalaysiaDeliveryRates', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727075018_AddBusinessReferenceNumbers'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [ReceiptNumber] nvarchar(80) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727075018_AddBusinessReferenceNumbers'
)
BEGIN
    UPDATE [TagOrders]
    SET [ReceiptNumber] =
        CASE
            WHEN CHARINDEX(N'-ORD-', UPPER([OrderNumber])) > 0
                THEN STUFF(
                    [OrderNumber],
                    CHARINDEX(N'-ORD-', UPPER([OrderNumber])),
                    5,
                    N'-RCP-')
            ELSE N'MPL-RCP-' + [OrderNumber]
        END
    WHERE [PaymentConfirmedAt] IS NOT NULL
      AND [ReceiptNumber] IS NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727075018_AddBusinessReferenceNumbers'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_TagOrders_ReceiptNumber] ON [TagOrders] ([ReceiptNumber]) WHERE [ReceiptNumber] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727075018_AddBusinessReferenceNumbers'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260727075018_AddBusinessReferenceNumbers', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260729094414_AddEmailTemplateSettings'
)
BEGIN
    ALTER TABLE [EmailOutbox] ADD [SuppressionReason] nvarchar(200) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260729094414_AddEmailTemplateSettings'
)
BEGIN
    CREATE TABLE [EmailTemplateSettings] (
        [Id] uniqueidentifier NOT NULL,
        [MessageType] nvarchar(64) NOT NULL,
        [IsEnabled] bit NOT NULL,
        [EnabledFromUtc] datetimeoffset NULL,
        [UpdatedByAdminUserId] uniqueidentifier NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_EmailTemplateSettings] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_EmailTemplateSettings_AdminUsers_UpdatedByAdminUserId] FOREIGN KEY ([UpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260729094414_AddEmailTemplateSettings'
)
BEGIN
    CREATE INDEX [IX_EmailOutbox_MessageType_Status_CreatedAt] ON [EmailOutbox] ([MessageType], [Status], [CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260729094414_AddEmailTemplateSettings'
)
BEGIN
    CREATE UNIQUE INDEX [IX_EmailTemplateSettings_MessageType] ON [EmailTemplateSettings] ([MessageType]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260729094414_AddEmailTemplateSettings'
)
BEGIN
    CREATE INDEX [IX_EmailTemplateSettings_UpdatedByAdminUserId] ON [EmailTemplateSettings] ([UpdatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260729094414_AddEmailTemplateSettings'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260729094414_AddEmailTemplateSettings', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730074753_AddDeliveryStateRateOverrides'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [DeliveryRateSource] nvarchar(32) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730074753_AddDeliveryStateRateOverrides'
)
BEGIN
    CREATE TABLE [DeliveryStateRateOverrides] (
        [Id] uniqueidentifier NOT NULL,
        [StateCode] nvarchar(8) NOT NULL,
        [Fee] decimal(18,2) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [FreeShippingThreshold] decimal(18,2) NULL,
        [IsEnabled] bit NOT NULL,
        [UpdatedByAdminUserId] uniqueidentifier NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_DeliveryStateRateOverrides] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_DeliveryStateRateOverrides_AdminUsers_UpdatedByAdminUserId] FOREIGN KEY ([UpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730074753_AddDeliveryStateRateOverrides'
)
BEGIN
    CREATE INDEX [IX_DeliveryStateRateOverrides_IsEnabled] ON [DeliveryStateRateOverrides] ([IsEnabled]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730074753_AddDeliveryStateRateOverrides'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DeliveryStateRateOverrides_StateCode] ON [DeliveryStateRateOverrides] ([StateCode]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730074753_AddDeliveryStateRateOverrides'
)
BEGIN
    CREATE INDEX [IX_DeliveryStateRateOverrides_UpdatedByAdminUserId] ON [DeliveryStateRateOverrides] ([UpdatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730074753_AddDeliveryStateRateOverrides'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260730074753_AddDeliveryStateRateOverrides', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730081647_AddManualShippingWorkflow'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [ActualCourierCost] decimal(18,2) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730081647_AddManualShippingWorkflow'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [CourierProvider] nvarchar(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730081647_AddManualShippingWorkflow'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [CourierService] nvarchar(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730081647_AddManualShippingWorkflow'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [ReadyToShipAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730081647_AddManualShippingWorkflow'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [ShippingNotes] nvarchar(1000) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730081647_AddManualShippingWorkflow'
)
BEGIN
    CREATE INDEX [IX_TagOrders_ReadyToShipAt] ON [TagOrders] ([ReadyToShipAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730081647_AddManualShippingWorkflow'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260730081647_AddManualShippingWorkflow', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730131244_AddShippingFulfilmentSettings'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [CourierProviderCode] nvarchar(32) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730131244_AddShippingFulfilmentSettings'
)
BEGIN
    CREATE TABLE [ShippingCourierProviders] (
        [Id] uniqueidentifier NOT NULL,
        [Code] nvarchar(32) NOT NULL,
        [DisplayName] nvarchar(120) NOT NULL,
        [IsActive] bit NOT NULL,
        [IsDefault] bit NOT NULL,
        [TrackingUrlTemplate] nvarchar(500) NULL,
        [DisplayOrder] int NOT NULL,
        [InternalNotes] nvarchar(1000) NULL,
        [UpdatedByAdminUserId] uniqueidentifier NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_ShippingCourierProviders] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_ShippingCourierProviders_AdminUsers_UpdatedByAdminUserId] FOREIGN KEY ([UpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730131244_AddShippingFulfilmentSettings'
)
BEGIN
    CREATE TABLE [ShippingFulfilmentSettings] (
        [Id] uniqueidentifier NOT NULL,
        [SenderName] nvarchar(160) NOT NULL,
        [CompanyName] nvarchar(160) NULL,
        [SenderPhone] nvarchar(32) NOT NULL,
        [SenderEmail] nvarchar(254) NULL,
        [AddressLine1] nvarchar(240) NOT NULL,
        [AddressLine2] nvarchar(240) NULL,
        [City] nvarchar(120) NOT NULL,
        [Postcode] nvarchar(5) NOT NULL,
        [StateCode] nvarchar(8) NOT NULL,
        [Country] nvarchar(80) NOT NULL,
        [DefaultParcelWeightKg] decimal(8,3) NOT NULL,
        [DefaultParcelLengthCm] decimal(8,2) NOT NULL,
        [DefaultParcelWidthCm] decimal(8,2) NOT NULL,
        [DefaultParcelHeightCm] decimal(8,2) NOT NULL,
        [CustomerTrackingLinksEnabled] bit NOT NULL,
        [UpdatedByAdminUserId] uniqueidentifier NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_ShippingFulfilmentSettings] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_ShippingFulfilmentSettings_AdminUsers_UpdatedByAdminUserId] FOREIGN KEY ([UpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730131244_AddShippingFulfilmentSettings'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'Code', N'CreatedAt', N'DisplayName', N'DisplayOrder', N'InternalNotes', N'IsActive', N'IsDefault', N'TrackingUrlTemplate', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[ShippingCourierProviders]'))
        SET IDENTITY_INSERT [ShippingCourierProviders] ON;
    EXEC(N'INSERT INTO [ShippingCourierProviders] ([Id], [Code], [CreatedAt], [DisplayName], [DisplayOrder], [InternalNotes], [IsActive], [IsDefault], [TrackingUrlTemplate], [UpdatedAt], [UpdatedByAdminUserId])
    VALUES (''03a56970-0592-4c83-b0bd-6453c6833703'', N''DHL_ECOMMERCE'', ''2026-01-01T00:00:00.0000000+00:00'', N''DHL eCommerce'', 30, NULL, CAST(1 AS bit), CAST(0 AS bit), NULL, ''2026-01-01T00:00:00.0000000+00:00'', NULL),
    (''0ac926be-7d6d-403f-9716-e4498354347a'', N''POSLAJU'', ''2026-01-01T00:00:00.0000000+00:00'', N''Pos Laju'', 20, NULL, CAST(1 AS bit), CAST(0 AS bit), NULL, ''2026-01-01T00:00:00.0000000+00:00'', NULL),
    (''28d1e1a3-0ca5-48d0-b624-757961e936d1'', N''NINJA_VAN'', ''2026-01-01T00:00:00.0000000+00:00'', N''Ninja Van'', 40, NULL, CAST(1 AS bit), CAST(0 AS bit), NULL, ''2026-01-01T00:00:00.0000000+00:00'', NULL),
    (''dcd3c11a-ddb7-4c50-bf21-0f4d0e3297d1'', N''JNT'', ''2026-01-01T00:00:00.0000000+00:00'', N''J&T Express'', 10, NULL, CAST(1 AS bit), CAST(1 AS bit), NULL, ''2026-01-01T00:00:00.0000000+00:00'', NULL)');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'Code', N'CreatedAt', N'DisplayName', N'DisplayOrder', N'InternalNotes', N'IsActive', N'IsDefault', N'TrackingUrlTemplate', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[ShippingCourierProviders]'))
        SET IDENTITY_INSERT [ShippingCourierProviders] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730131244_AddShippingFulfilmentSettings'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'AddressLine1', N'AddressLine2', N'City', N'CompanyName', N'Country', N'CreatedAt', N'CustomerTrackingLinksEnabled', N'DefaultParcelHeightCm', N'DefaultParcelLengthCm', N'DefaultParcelWeightKg', N'DefaultParcelWidthCm', N'Postcode', N'SenderEmail', N'SenderName', N'SenderPhone', N'StateCode', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[ShippingFulfilmentSettings]'))
        SET IDENTITY_INSERT [ShippingFulfilmentSettings] ON;
    EXEC(N'INSERT INTO [ShippingFulfilmentSettings] ([Id], [AddressLine1], [AddressLine2], [City], [CompanyName], [Country], [CreatedAt], [CustomerTrackingLinksEnabled], [DefaultParcelHeightCm], [DefaultParcelLengthCm], [DefaultParcelWeightKg], [DefaultParcelWidthCm], [Postcode], [SenderEmail], [SenderName], [SenderPhone], [StateCode], [UpdatedAt], [UpdatedByAdminUserId])
    VALUES (''8b2a37be-928c-4f10-96a0-3c169ef00379'', N'''', NULL, N'''', NULL, N''Malaysia'', ''2026-01-01T00:00:00.0000000+00:00'', CAST(0 AS bit), 3.0, 18.0, 0.5, 12.0, N'''', NULL, N'''', N'''', N'''', ''2026-01-01T00:00:00.0000000+00:00'', NULL)');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'AddressLine1', N'AddressLine2', N'City', N'CompanyName', N'Country', N'CreatedAt', N'CustomerTrackingLinksEnabled', N'DefaultParcelHeightCm', N'DefaultParcelLengthCm', N'DefaultParcelWeightKg', N'DefaultParcelWidthCm', N'Postcode', N'SenderEmail', N'SenderName', N'SenderPhone', N'StateCode', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[ShippingFulfilmentSettings]'))
        SET IDENTITY_INSERT [ShippingFulfilmentSettings] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730131244_AddShippingFulfilmentSettings'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ShippingCourierProviders_Code] ON [ShippingCourierProviders] ([Code]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730131244_AddShippingFulfilmentSettings'
)
BEGIN
    CREATE INDEX [IX_ShippingCourierProviders_IsActive_DisplayOrder_DisplayName] ON [ShippingCourierProviders] ([IsActive], [DisplayOrder], [DisplayName]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730131244_AddShippingFulfilmentSettings'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_ShippingCourierProviders_IsDefault] ON [ShippingCourierProviders] ([IsDefault]) WHERE [IsDefault] = 1');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730131244_AddShippingFulfilmentSettings'
)
BEGIN
    CREATE INDEX [IX_ShippingCourierProviders_UpdatedByAdminUserId] ON [ShippingCourierProviders] ([UpdatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730131244_AddShippingFulfilmentSettings'
)
BEGIN
    CREATE INDEX [IX_ShippingFulfilmentSettings_UpdatedByAdminUserId] ON [ShippingFulfilmentSettings] ([UpdatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730131244_AddShippingFulfilmentSettings'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260730131244_AddShippingFulfilmentSettings', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730164730_AddOwnerMarketingEmailPreference'
)
BEGIN
    ALTER TABLE [OwnerProfiles] ADD [MarketingEmailOptIn] bit NOT NULL DEFAULT CAST(0 AS bit);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730164730_AddOwnerMarketingEmailPreference'
)
BEGIN
    ALTER TABLE [OwnerProfiles] ADD [MarketingEmailPreferenceUpdatedAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260730164730_AddOwnerMarketingEmailPreference'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260730164730_AddOwnerMarketingEmailPreference', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260731173221_AddPaymentProofSubmittedAmount'
)
BEGIN
    ALTER TABLE [PaymentProofs] ADD [SubmittedAmount] decimal(18,2) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260731173221_AddPaymentProofSubmittedAmount'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260731173221_AddPaymentProofSubmittedAmount', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803035111_AddMultiItemTagOrders'
)
BEGIN
    ALTER TABLE [TagOrderItems] ADD [PetId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803035111_AddMultiItemTagOrders'
)
BEGIN
    ALTER TABLE [TagOrderItems] ADD [PetNameSnapshot] nvarchar(160) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803035111_AddMultiItemTagOrders'
)
BEGIN
    ALTER TABLE [TagOrderItems] ADD [UnitWeightGramsSnapshot] decimal(10,2) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803035111_AddMultiItemTagOrders'
)
BEGIN
    ALTER TABLE [SmartTags] ADD [OrderItemId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803035111_AddMultiItemTagOrders'
)
BEGIN
    UPDATE item
    SET item.PetId = orders.PetId,
        item.PetNameSnapshot = pets.Name,
        item.UnitWeightGramsSnapshot = variants.WeightGrams
    FROM TagOrderItems AS item
    INNER JOIN TagOrders AS orders ON orders.Id = item.OrderId
    INNER JOIN Pets AS pets ON pets.Id = orders.PetId
    LEFT JOIN TagProductVariants AS variants ON variants.Id = item.ProductVariantId
    WHERE item.PetId IS NULL;

    UPDATE tags
    SET tags.OrderItemId = matched.Id
    FROM SmartTags AS tags
    CROSS APPLY
    (
        SELECT TOP (1) item.Id
        FROM TagOrderItems AS item
        WHERE item.OrderId = tags.OrderId
        ORDER BY item.CreatedAt, item.Id
    ) AS matched
    WHERE tags.OrderId IS NOT NULL
      AND tags.OrderItemId IS NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803035111_AddMultiItemTagOrders'
)
BEGIN
    CREATE INDEX [IX_TagOrderItems_PetId] ON [TagOrderItems] ([PetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803035111_AddMultiItemTagOrders'
)
BEGIN
    CREATE INDEX [IX_SmartTags_OrderItemId] ON [SmartTags] ([OrderItemId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803035111_AddMultiItemTagOrders'
)
BEGIN
    ALTER TABLE [SmartTags] ADD CONSTRAINT [FK_SmartTags_TagOrderItems_OrderItemId] FOREIGN KEY ([OrderItemId]) REFERENCES [TagOrderItems] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803035111_AddMultiItemTagOrders'
)
BEGIN
    ALTER TABLE [TagOrderItems] ADD CONSTRAINT [FK_TagOrderItems_Pets_PetId] FOREIGN KEY ([PetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803035111_AddMultiItemTagOrders'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260803035111_AddMultiItemTagOrders', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [PaymentReservationExpiredAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [PaymentReservationExpiresAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    CREATE TABLE [OrderCheckoutSettings] (
        [Id] uniqueidentifier NOT NULL,
        [PaymentReservationMinutes] int NOT NULL,
        [UpdatedByAdminUserId] uniqueidentifier NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_OrderCheckoutSettings] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_OrderCheckoutSettings_AdminUsers_UpdatedByAdminUserId] FOREIGN KEY ([UpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CreatedAt', N'PaymentReservationMinutes', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[OrderCheckoutSettings]'))
        SET IDENTITY_INSERT [OrderCheckoutSettings] ON;
    EXEC(N'INSERT INTO [OrderCheckoutSettings] ([Id], [CreatedAt], [PaymentReservationMinutes], [UpdatedAt], [UpdatedByAdminUserId])
    VALUES (''4a2f6d18-9c31-4b7e-8f52-6d0a1b3c5e70'', ''2026-01-01T00:00:00.0000000+00:00'', 120, ''2026-01-01T00:00:00.0000000+00:00'', NULL)');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CreatedAt', N'PaymentReservationMinutes', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[OrderCheckoutSettings]'))
        SET IDENTITY_INSERT [OrderCheckoutSettings] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    CREATE INDEX [IX_OrderCheckoutSettings_UpdatedByAdminUserId] ON [OrderCheckoutSettings] ([UpdatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    EXEC(N'CREATE INDEX [IX_TagOrders_Status_PaymentReservationExpiresAt] ON [TagOrders] ([Status], [PaymentReservationExpiresAt]) WHERE [PaymentReservationExpiresAt] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    UPDATE orders
    SET orders.PaymentReservationExpiresAt = DATEADD(
        minute,
        (SELECT TOP (1) settings.PaymentReservationMinutes
         FROM OrderCheckoutSettings AS settings),
        SYSDATETIMEOFFSET())
    FROM TagOrders AS orders
    WHERE orders.Status = 'PendingPayment'
      AND orders.CancelledAt IS NULL
      AND orders.PaymentConfirmedAt IS NULL
      AND orders.PaymentReservationExpiresAt IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM PaymentProofs AS proofs
          WHERE proofs.OrderId = orders.Id
            AND proofs.Status IN ('PendingReview', 'Approved')
      );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260803082129_AddPaymentReservationExpiry', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE TABLE [DocumentNumberCounters] (
        [CounterKey] nvarchar(64) NOT NULL,
        [NextValue] bigint NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_DocumentNumberCounters] PRIMARY KEY ([CounterKey])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE TABLE [Salespersons] (
        [Id] uniqueidentifier NOT NULL,
        [SalespersonCode] nvarchar(32) NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [Email] nvarchar(254) NULL,
        [Phone] nvarchar(32) NULL,
        [DefaultCommissionPercentage] decimal(5,2) NOT NULL,
        [InternalNotes] nvarchar(2000) NULL,
        [IsActive] bit NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_Salespersons] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE TABLE [Merchants] (
        [Id] uniqueidentifier NOT NULL,
        [MerchantCode] nvarchar(32) NOT NULL,
        [LegalBusinessName] nvarchar(200) NOT NULL,
        [TradingName] nvarchar(200) NULL,
        [BusinessRegistrationNumber] nvarchar(64) NULL,
        [NormalizedBusinessRegistrationNumber] nvarchar(64) NULL,
        [TaxIdentificationNumber] nvarchar(64) NULL,
        [SstRegistrationNumber] nvarchar(64) NULL,
        [ContactPerson] nvarchar(160) NOT NULL,
        [ContactEmail] nvarchar(254) NOT NULL,
        [ContactPhone] nvarchar(32) NOT NULL,
        [BillingAddressLine1] nvarchar(240) NOT NULL,
        [BillingAddressLine2] nvarchar(240) NULL,
        [BillingPostcode] nvarchar(16) NOT NULL,
        [BillingCity] nvarchar(120) NOT NULL,
        [BillingState] nvarchar(120) NOT NULL,
        [BillingCountry] nvarchar(80) NOT NULL,
        [DeliveryAddressSameAsBilling] bit NOT NULL,
        [DeliveryAddressLine1] nvarchar(240) NOT NULL,
        [DeliveryAddressLine2] nvarchar(240) NULL,
        [DeliveryPostcode] nvarchar(16) NOT NULL,
        [DeliveryCity] nvarchar(120) NOT NULL,
        [DeliveryState] nvarchar(120) NOT NULL,
        [DeliveryCountry] nvarchar(80) NOT NULL,
        [AssignedSalespersonId] uniqueidentifier NULL,
        [PaymentTerm] nvarchar(32) NOT NULL,
        [InternalNotes] nvarchar(2000) NULL,
        [IsActive] bit NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_Merchants] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Merchants_Salespersons_AssignedSalespersonId] FOREIGN KEY ([AssignedSalespersonId]) REFERENCES [Salespersons] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE TABLE [MerchantOrderItems] (
        [Id] uniqueidentifier NOT NULL,
        [MerchantOrderId] uniqueidentifier NOT NULL,
        [ProductId] uniqueidentifier NOT NULL,
        [ProductVariantId] uniqueidentifier NOT NULL,
        [ProductNameSnapshot] nvarchar(200) NOT NULL,
        [SkuCodeSnapshot] nvarchar(64) NOT NULL,
        [OptionNameSnapshot] nvarchar(120) NOT NULL,
        [SupportsQrSnapshot] bit NOT NULL,
        [SupportsNfcSnapshot] bit NOT NULL,
        [UnitWeightGramsSnapshot] decimal(10,2) NULL,
        [Quantity] int NOT NULL,
        [WholesaleUnitPrice] decimal(18,2) NOT NULL,
        [LineDiscount] decimal(18,2) NOT NULL,
        [LineSubtotal] decimal(18,2) NOT NULL,
        [SortOrder] int NOT NULL,
        CONSTRAINT [PK_MerchantOrderItems] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE TABLE [MerchantOrders] (
        [Id] uniqueidentifier NOT NULL,
        [MerchantOrderNumber] nvarchar(48) NOT NULL,
        [SourceQuotationId] uniqueidentifier NULL,
        [MerchantId] uniqueidentifier NOT NULL,
        [MerchantCodeSnapshot] nvarchar(32) NOT NULL,
        [MerchantLegalNameSnapshot] nvarchar(200) NOT NULL,
        [MerchantTradingNameSnapshot] nvarchar(200) NULL,
        [MerchantRegistrationNumberSnapshot] nvarchar(64) NULL,
        [MerchantTaxIdentificationNumberSnapshot] nvarchar(64) NULL,
        [MerchantSstRegistrationNumberSnapshot] nvarchar(64) NULL,
        [ContactPersonSnapshot] nvarchar(160) NOT NULL,
        [ContactEmailSnapshot] nvarchar(254) NOT NULL,
        [ContactPhoneSnapshot] nvarchar(32) NOT NULL,
        [BillingAddressLine1Snapshot] nvarchar(240) NOT NULL,
        [BillingAddressLine2Snapshot] nvarchar(240) NULL,
        [BillingPostcodeSnapshot] nvarchar(16) NOT NULL,
        [BillingCitySnapshot] nvarchar(120) NOT NULL,
        [BillingStateSnapshot] nvarchar(120) NOT NULL,
        [BillingCountrySnapshot] nvarchar(80) NOT NULL,
        [DeliveryAddressLine1Snapshot] nvarchar(240) NOT NULL,
        [DeliveryAddressLine2Snapshot] nvarchar(240) NULL,
        [DeliveryPostcodeSnapshot] nvarchar(16) NOT NULL,
        [DeliveryCitySnapshot] nvarchar(120) NOT NULL,
        [DeliveryStateSnapshot] nvarchar(120) NOT NULL,
        [DeliveryCountrySnapshot] nvarchar(80) NOT NULL,
        [SalespersonId] uniqueidentifier NULL,
        [SalespersonCodeSnapshot] nvarchar(32) NULL,
        [SalespersonNameSnapshot] nvarchar(160) NULL,
        [SalespersonCommissionPercentageSnapshot] decimal(5,2) NULL,
        [PaymentTermSnapshot] nvarchar(32) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [MerchandiseSubtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [DeliveryFee] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [PaymentStatus] nvarchar(32) NOT NULL,
        [FulfilmentStatus] nvarchar(32) NOT NULL,
        [InternalNotes] nvarchar(2000) NULL,
        [PaymentConfirmedAt] datetimeoffset NULL,
        [CancelledAt] datetimeoffset NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_MerchantOrders] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MerchantOrders_Merchants_MerchantId] FOREIGN KEY ([MerchantId]) REFERENCES [Merchants] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantOrders_Salespersons_SalespersonId] FOREIGN KEY ([SalespersonId]) REFERENCES [Salespersons] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE TABLE [MerchantQuotations] (
        [Id] uniqueidentifier NOT NULL,
        [QuotationNumber] nvarchar(48) NOT NULL,
        [MerchantId] uniqueidentifier NOT NULL,
        [MerchantCodeSnapshot] nvarchar(32) NOT NULL,
        [MerchantLegalNameSnapshot] nvarchar(200) NOT NULL,
        [MerchantTradingNameSnapshot] nvarchar(200) NULL,
        [MerchantRegistrationNumberSnapshot] nvarchar(64) NULL,
        [MerchantTaxIdentificationNumberSnapshot] nvarchar(64) NULL,
        [MerchantSstRegistrationNumberSnapshot] nvarchar(64) NULL,
        [ContactPersonSnapshot] nvarchar(160) NOT NULL,
        [ContactEmailSnapshot] nvarchar(254) NOT NULL,
        [ContactPhoneSnapshot] nvarchar(32) NOT NULL,
        [BillingAddressLine1Snapshot] nvarchar(240) NOT NULL,
        [BillingAddressLine2Snapshot] nvarchar(240) NULL,
        [BillingPostcodeSnapshot] nvarchar(16) NOT NULL,
        [BillingCitySnapshot] nvarchar(120) NOT NULL,
        [BillingStateSnapshot] nvarchar(120) NOT NULL,
        [BillingCountrySnapshot] nvarchar(80) NOT NULL,
        [DeliveryAddressLine1Snapshot] nvarchar(240) NOT NULL,
        [DeliveryAddressLine2Snapshot] nvarchar(240) NULL,
        [DeliveryPostcodeSnapshot] nvarchar(16) NOT NULL,
        [DeliveryCitySnapshot] nvarchar(120) NOT NULL,
        [DeliveryStateSnapshot] nvarchar(120) NOT NULL,
        [DeliveryCountrySnapshot] nvarchar(80) NOT NULL,
        [SalespersonId] uniqueidentifier NULL,
        [SalespersonCodeSnapshot] nvarchar(32) NULL,
        [SalespersonNameSnapshot] nvarchar(160) NULL,
        [SalespersonCommissionPercentageSnapshot] decimal(5,2) NULL,
        [QuotationDate] datetimeoffset NOT NULL,
        [ValidUntil] datetimeoffset NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [PaymentTermSnapshot] nvarchar(32) NOT NULL,
        [MerchandiseSubtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [DeliveryFee] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [CustomerNotes] nvarchar(2000) NULL,
        [InternalNotes] nvarchar(2000) NULL,
        [Status] nvarchar(32) NOT NULL,
        [ConvertedMerchantOrderId] uniqueidentifier NULL,
        [SentAt] datetimeoffset NULL,
        [AcceptedAt] datetimeoffset NULL,
        [RejectedAt] datetimeoffset NULL,
        [ExpiredAt] datetimeoffset NULL,
        [ConvertedAt] datetimeoffset NULL,
        [CancelledAt] datetimeoffset NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_MerchantQuotations] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MerchantQuotations_MerchantOrders_ConvertedMerchantOrderId] FOREIGN KEY ([ConvertedMerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantQuotations_Merchants_MerchantId] FOREIGN KEY ([MerchantId]) REFERENCES [Merchants] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantQuotations_Salespersons_SalespersonId] FOREIGN KEY ([SalespersonId]) REFERENCES [Salespersons] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE TABLE [MerchantQuotationItems] (
        [Id] uniqueidentifier NOT NULL,
        [QuotationId] uniqueidentifier NOT NULL,
        [ProductId] uniqueidentifier NOT NULL,
        [ProductVariantId] uniqueidentifier NOT NULL,
        [ProductNameSnapshot] nvarchar(200) NOT NULL,
        [SkuCodeSnapshot] nvarchar(64) NOT NULL,
        [OptionNameSnapshot] nvarchar(120) NOT NULL,
        [SupportsQrSnapshot] bit NOT NULL,
        [SupportsNfcSnapshot] bit NOT NULL,
        [UnitWeightGramsSnapshot] decimal(10,2) NULL,
        [Quantity] int NOT NULL,
        [WholesaleUnitPrice] decimal(18,2) NOT NULL,
        [LineDiscount] decimal(18,2) NOT NULL,
        [LineSubtotal] decimal(18,2) NOT NULL,
        [SortOrder] int NOT NULL,
        CONSTRAINT [PK_MerchantQuotationItems] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MerchantQuotationItems_MerchantQuotations_QuotationId] FOREIGN KEY ([QuotationId]) REFERENCES [MerchantQuotations] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantOrderItems_MerchantOrderId] ON [MerchantOrderItems] ([MerchantOrderId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantOrders_MerchantId] ON [MerchantOrders] ([MerchantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MerchantOrders_MerchantOrderNumber] ON [MerchantOrders] ([MerchantOrderNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantOrders_PaymentStatus_CreatedAt] ON [MerchantOrders] ([PaymentStatus], [CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantOrders_SalespersonId] ON [MerchantOrders] ([SalespersonId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_MerchantOrders_SourceQuotationId] ON [MerchantOrders] ([SourceQuotationId]) WHERE [SourceQuotationId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantQuotationItems_QuotationId] ON [MerchantQuotationItems] ([QuotationId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantQuotations_ConvertedMerchantOrderId] ON [MerchantQuotations] ([ConvertedMerchantOrderId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantQuotations_MerchantId] ON [MerchantQuotations] ([MerchantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MerchantQuotations_QuotationNumber] ON [MerchantQuotations] ([QuotationNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantQuotations_SalespersonId] ON [MerchantQuotations] ([SalespersonId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantQuotations_Status_QuotationDate] ON [MerchantQuotations] ([Status], [QuotationDate]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_Merchants_AssignedSalespersonId] ON [Merchants] ([AssignedSalespersonId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_Merchants_IsActive] ON [Merchants] ([IsActive]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Merchants_MerchantCode] ON [Merchants] ([MerchantCode]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_Merchants_NormalizedBusinessRegistrationNumber] ON [Merchants] ([NormalizedBusinessRegistrationNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_Salespersons_IsActive] ON [Salespersons] ([IsActive]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Salespersons_SalespersonCode] ON [Salespersons] ([SalespersonCode]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    ALTER TABLE [MerchantOrderItems] ADD CONSTRAINT [FK_MerchantOrderItems_MerchantOrders_MerchantOrderId] FOREIGN KEY ([MerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE CASCADE;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD CONSTRAINT [FK_MerchantOrders_MerchantQuotations_SourceQuotationId] FOREIGN KEY ([SourceQuotationId]) REFERENCES [MerchantQuotations] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260805010234_AddMerchantSalesDomain', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805043627_AddBusinessIdentitySettings'
)
BEGIN
    CREATE TABLE [BusinessIdentitySettings] (
        [Id] uniqueidentifier NOT NULL,
        [BrandName] nvarchar(120) NOT NULL,
        [LegalBusinessName] nvarchar(200) NOT NULL,
        [BusinessRegistrationNumber] nvarchar(64) NOT NULL,
        [TaxIdentificationNumber] nvarchar(64) NULL,
        [SstRegistrationNumber] nvarchar(64) NULL,
        [RegisteredAddressLine1] nvarchar(240) NOT NULL,
        [RegisteredAddressLine2] nvarchar(240) NULL,
        [RegisteredPostcode] nvarchar(16) NOT NULL,
        [RegisteredCity] nvarchar(120) NOT NULL,
        [RegisteredState] nvarchar(120) NOT NULL,
        [RegisteredCountry] nvarchar(80) NOT NULL,
        [SupportEmail] nvarchar(254) NOT NULL,
        [BusinessPhone] nvarchar(32) NULL,
        [BusinessWebsite] nvarchar(200) NULL,
        [PaymentInstructions] nvarchar(2000) NULL,
        [BankAccountName] nvarchar(200) NULL,
        [BankName] nvarchar(120) NULL,
        [BankAccountNumber] nvarchar(64) NULL,
        [DuitNowDisplayName] nvarchar(120) NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        [UpdatedByAdminUserId] uniqueidentifier NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_BusinessIdentitySettings] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_BusinessIdentitySettings_AdminUsers_UpdatedByAdminUserId] FOREIGN KEY ([UpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805043627_AddBusinessIdentitySettings'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'BankAccountName', N'BankAccountNumber', N'BankName', N'BrandName', N'BusinessPhone', N'BusinessRegistrationNumber', N'BusinessWebsite', N'DuitNowDisplayName', N'LegalBusinessName', N'PaymentInstructions', N'RegisteredAddressLine1', N'RegisteredAddressLine2', N'RegisteredCity', N'RegisteredCountry', N'RegisteredPostcode', N'RegisteredState', N'SstRegistrationNumber', N'SupportEmail', N'TaxIdentificationNumber', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[BusinessIdentitySettings]'))
        SET IDENTITY_INSERT [BusinessIdentitySettings] ON;
    EXEC(N'INSERT INTO [BusinessIdentitySettings] ([Id], [BankAccountName], [BankAccountNumber], [BankName], [BrandName], [BusinessPhone], [BusinessRegistrationNumber], [BusinessWebsite], [DuitNowDisplayName], [LegalBusinessName], [PaymentInstructions], [RegisteredAddressLine1], [RegisteredAddressLine2], [RegisteredCity], [RegisteredCountry], [RegisteredPostcode], [RegisteredState], [SstRegistrationNumber], [SupportEmail], [TaxIdentificationNumber], [UpdatedAt], [UpdatedByAdminUserId])
    VALUES (''7c1f9b52-4d63-4a18-9e37-2b8c05f1d6a4'', NULL, NULL, NULL, N''MyPetLink'', NULL, N''202603141718 (AS0515813-P)'', N''mypetlink.com.my'', NULL, N''GBB Software Solutions'', NULL, N'''', NULL, N'''', N''Malaysia'', N'''', N'''', NULL, N''support@mypetlink.com.my'', NULL, ''2026-01-01T00:00:00.0000000+00:00'', NULL)');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'BankAccountName', N'BankAccountNumber', N'BankName', N'BrandName', N'BusinessPhone', N'BusinessRegistrationNumber', N'BusinessWebsite', N'DuitNowDisplayName', N'LegalBusinessName', N'PaymentInstructions', N'RegisteredAddressLine1', N'RegisteredAddressLine2', N'RegisteredCity', N'RegisteredCountry', N'RegisteredPostcode', N'RegisteredState', N'SstRegistrationNumber', N'SupportEmail', N'TaxIdentificationNumber', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[BusinessIdentitySettings]'))
        SET IDENTITY_INSERT [BusinessIdentitySettings] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805043627_AddBusinessIdentitySettings'
)
BEGIN
    CREATE INDEX [IX_BusinessIdentitySettings_UpdatedByAdminUserId] ON [BusinessIdentitySettings] ([UpdatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805043627_AddBusinessIdentitySettings'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260805043627_AddBusinessIdentitySettings', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE TABLE [MerchantInvoices] (
        [Id] uniqueidentifier NOT NULL,
        [InvoiceNumber] nvarchar(48) NOT NULL,
        [MerchantOrderId] uniqueidentifier NOT NULL,
        [MerchantId] uniqueidentifier NOT NULL,
        [Seller_BrandName] nvarchar(120) NOT NULL,
        [Seller_LegalBusinessName] nvarchar(200) NOT NULL,
        [Seller_BusinessRegistrationNumber] nvarchar(64) NOT NULL,
        [Seller_TaxIdentificationNumber] nvarchar(64) NULL,
        [Seller_SstRegistrationNumber] nvarchar(64) NULL,
        [Seller_AddressLine1] nvarchar(240) NOT NULL,
        [Seller_AddressLine2] nvarchar(240) NULL,
        [Seller_Postcode] nvarchar(16) NOT NULL,
        [Seller_City] nvarchar(120) NOT NULL,
        [Seller_State] nvarchar(120) NOT NULL,
        [Seller_Country] nvarchar(80) NOT NULL,
        [Seller_SupportEmail] nvarchar(254) NOT NULL,
        [Seller_BusinessPhone] nvarchar(32) NULL,
        [Seller_BusinessWebsite] nvarchar(200) NULL,
        [Seller_PaymentInstructions] nvarchar(2000) NULL,
        [Seller_BankAccountName] nvarchar(200) NULL,
        [Seller_BankName] nvarchar(120) NULL,
        [Seller_BankAccountNumber] nvarchar(64) NULL,
        [Seller_DuitNowDisplayName] nvarchar(120) NULL,
        [MerchantCodeSnapshot] nvarchar(32) NOT NULL,
        [MerchantLegalNameSnapshot] nvarchar(200) NOT NULL,
        [MerchantTradingNameSnapshot] nvarchar(200) NULL,
        [MerchantRegistrationNumberSnapshot] nvarchar(64) NULL,
        [MerchantTaxIdentificationNumberSnapshot] nvarchar(64) NULL,
        [MerchantSstRegistrationNumberSnapshot] nvarchar(64) NULL,
        [ContactPersonSnapshot] nvarchar(160) NOT NULL,
        [ContactEmailSnapshot] nvarchar(254) NOT NULL,
        [ContactPhoneSnapshot] nvarchar(32) NOT NULL,
        [BillingAddressLine1Snapshot] nvarchar(240) NOT NULL,
        [BillingAddressLine2Snapshot] nvarchar(240) NULL,
        [BillingPostcodeSnapshot] nvarchar(16) NOT NULL,
        [BillingCitySnapshot] nvarchar(120) NOT NULL,
        [BillingStateSnapshot] nvarchar(120) NOT NULL,
        [BillingCountrySnapshot] nvarchar(80) NOT NULL,
        [MerchantOrderNumberSnapshot] nvarchar(48) NOT NULL,
        [SourceQuotationNumberSnapshot] nvarchar(48) NULL,
        [InvoiceDate] datetimeoffset NOT NULL,
        [DueDate] datetimeoffset NOT NULL,
        [PaymentTermSnapshot] nvarchar(32) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [MerchandiseSubtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [DeliveryFee] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [IssuedAt] datetimeoffset NULL,
        [PaidAt] datetimeoffset NULL,
        [CancelledAt] datetimeoffset NULL,
        [InternalNotes] nvarchar(2000) NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_MerchantInvoices] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MerchantInvoices_MerchantOrders_MerchantOrderId] FOREIGN KEY ([MerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantInvoices_Merchants_MerchantId] FOREIGN KEY ([MerchantId]) REFERENCES [Merchants] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE TABLE [MerchantInvoiceItems] (
        [Id] uniqueidentifier NOT NULL,
        [MerchantInvoiceId] uniqueidentifier NOT NULL,
        [ProductId] uniqueidentifier NOT NULL,
        [ProductVariantId] uniqueidentifier NOT NULL,
        [ProductNameSnapshot] nvarchar(200) NOT NULL,
        [SkuCodeSnapshot] nvarchar(64) NOT NULL,
        [OptionNameSnapshot] nvarchar(120) NOT NULL,
        [SupportsQrSnapshot] bit NOT NULL,
        [SupportsNfcSnapshot] bit NOT NULL,
        [Quantity] int NOT NULL,
        [WholesaleUnitPrice] decimal(18,2) NOT NULL,
        [LineDiscount] decimal(18,2) NOT NULL,
        [LineSubtotal] decimal(18,2) NOT NULL,
        [SortOrder] int NOT NULL,
        CONSTRAINT [PK_MerchantInvoiceItems] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MerchantInvoiceItems_MerchantInvoices_MerchantInvoiceId] FOREIGN KEY ([MerchantInvoiceId]) REFERENCES [MerchantInvoices] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE TABLE [MerchantPayments] (
        [Id] uniqueidentifier NOT NULL,
        [MerchantInvoiceId] uniqueidentifier NOT NULL,
        [MerchantOrderId] uniqueidentifier NOT NULL,
        [PaymentDate] datetimeoffset NOT NULL,
        [AmountReceived] decimal(18,2) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [Method] nvarchar(32) NOT NULL,
        [TransactionReference] nvarchar(120) NULL,
        [InternalNote] nvarchar(2000) NULL,
        [PaymentProofMediaFileId] uniqueidentifier NULL,
        [RecordedByAdminUserId] uniqueidentifier NULL,
        [RecordedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_MerchantPayments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MerchantPayments_AdminUsers_RecordedByAdminUserId] FOREIGN KEY ([RecordedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantPayments_MediaFiles_PaymentProofMediaFileId] FOREIGN KEY ([PaymentProofMediaFileId]) REFERENCES [MediaFiles] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantPayments_MerchantInvoices_MerchantInvoiceId] FOREIGN KEY ([MerchantInvoiceId]) REFERENCES [MerchantInvoices] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantPayments_MerchantOrders_MerchantOrderId] FOREIGN KEY ([MerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE TABLE [MerchantReceipts] (
        [Id] uniqueidentifier NOT NULL,
        [ReceiptNumber] nvarchar(48) NOT NULL,
        [MerchantInvoiceId] uniqueidentifier NOT NULL,
        [MerchantPaymentId] uniqueidentifier NOT NULL,
        [MerchantOrderId] uniqueidentifier NOT NULL,
        [MerchantId] uniqueidentifier NOT NULL,
        [Seller_BrandName] nvarchar(120) NOT NULL,
        [Seller_LegalBusinessName] nvarchar(200) NOT NULL,
        [Seller_BusinessRegistrationNumber] nvarchar(64) NOT NULL,
        [Seller_TaxIdentificationNumber] nvarchar(64) NULL,
        [Seller_SstRegistrationNumber] nvarchar(64) NULL,
        [Seller_AddressLine1] nvarchar(240) NOT NULL,
        [Seller_AddressLine2] nvarchar(240) NULL,
        [Seller_Postcode] nvarchar(16) NOT NULL,
        [Seller_City] nvarchar(120) NOT NULL,
        [Seller_State] nvarchar(120) NOT NULL,
        [Seller_Country] nvarchar(80) NOT NULL,
        [Seller_SupportEmail] nvarchar(254) NOT NULL,
        [Seller_BusinessPhone] nvarchar(32) NULL,
        [Seller_BusinessWebsite] nvarchar(200) NULL,
        [Seller_PaymentInstructions] nvarchar(2000) NULL,
        [Seller_BankAccountName] nvarchar(200) NULL,
        [Seller_BankName] nvarchar(120) NULL,
        [Seller_BankAccountNumber] nvarchar(64) NULL,
        [Seller_DuitNowDisplayName] nvarchar(120) NULL,
        [MerchantLegalNameSnapshot] nvarchar(200) NOT NULL,
        [MerchantTradingNameSnapshot] nvarchar(200) NULL,
        [MerchantRegistrationNumberSnapshot] nvarchar(64) NULL,
        [MerchantTaxIdentificationNumberSnapshot] nvarchar(64) NULL,
        [ContactPersonSnapshot] nvarchar(160) NOT NULL,
        [ContactEmailSnapshot] nvarchar(254) NOT NULL,
        [BillingAddressLine1Snapshot] nvarchar(240) NOT NULL,
        [BillingAddressLine2Snapshot] nvarchar(240) NULL,
        [BillingPostcodeSnapshot] nvarchar(16) NOT NULL,
        [BillingCitySnapshot] nvarchar(120) NOT NULL,
        [BillingStateSnapshot] nvarchar(120) NOT NULL,
        [BillingCountrySnapshot] nvarchar(80) NOT NULL,
        [InvoiceNumberSnapshot] nvarchar(48) NOT NULL,
        [MerchantOrderNumberSnapshot] nvarchar(48) NOT NULL,
        [PaymentDate] datetimeoffset NOT NULL,
        [PaymentMethod] nvarchar(32) NOT NULL,
        [TransactionReference] nvarchar(120) NULL,
        [Currency] nvarchar(3) NOT NULL,
        [MerchandiseSubtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [DeliveryFee] decimal(18,2) NOT NULL,
        [AmountPaid] decimal(18,2) NOT NULL,
        [IssuedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_MerchantReceipts] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MerchantReceipts_MerchantInvoices_MerchantInvoiceId] FOREIGN KEY ([MerchantInvoiceId]) REFERENCES [MerchantInvoices] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantReceipts_MerchantOrders_MerchantOrderId] FOREIGN KEY ([MerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantReceipts_MerchantPayments_MerchantPaymentId] FOREIGN KEY ([MerchantPaymentId]) REFERENCES [MerchantPayments] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantReceipts_Merchants_MerchantId] FOREIGN KEY ([MerchantId]) REFERENCES [Merchants] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE TABLE [SalesCommissions] (
        [Id] uniqueidentifier NOT NULL,
        [MerchantOrderId] uniqueidentifier NOT NULL,
        [MerchantPaymentId] uniqueidentifier NOT NULL,
        [SalespersonId] uniqueidentifier NOT NULL,
        [SalespersonCodeSnapshot] nvarchar(32) NOT NULL,
        [SalespersonNameSnapshot] nvarchar(160) NOT NULL,
        [CommissionPercentageSnapshot] decimal(5,2) NOT NULL,
        [CommissionBaseAmount] decimal(18,2) NOT NULL,
        [CommissionAmount] decimal(18,2) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [CalculatedAt] datetimeoffset NOT NULL,
        [PaidAt] datetimeoffset NULL,
        [ReversedAt] datetimeoffset NULL,
        [InternalNote] nvarchar(2000) NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesCommissions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_SalesCommissions_MerchantOrders_MerchantOrderId] FOREIGN KEY ([MerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesCommissions_MerchantPayments_MerchantPaymentId] FOREIGN KEY ([MerchantPaymentId]) REFERENCES [MerchantPayments] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesCommissions_Salespersons_SalespersonId] FOREIGN KEY ([SalespersonId]) REFERENCES [Salespersons] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE TABLE [MerchantReceiptItems] (
        [Id] uniqueidentifier NOT NULL,
        [MerchantReceiptId] uniqueidentifier NOT NULL,
        [ProductNameSnapshot] nvarchar(200) NOT NULL,
        [SkuCodeSnapshot] nvarchar(64) NOT NULL,
        [OptionNameSnapshot] nvarchar(120) NOT NULL,
        [Quantity] int NOT NULL,
        [WholesaleUnitPrice] decimal(18,2) NOT NULL,
        [LineDiscount] decimal(18,2) NOT NULL,
        [LineSubtotal] decimal(18,2) NOT NULL,
        [SortOrder] int NOT NULL,
        CONSTRAINT [PK_MerchantReceiptItems] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MerchantReceiptItems_MerchantReceipts_MerchantReceiptId] FOREIGN KEY ([MerchantReceiptId]) REFERENCES [MerchantReceipts] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantInvoiceItems_MerchantInvoiceId] ON [MerchantInvoiceItems] ([MerchantInvoiceId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MerchantInvoices_InvoiceNumber] ON [MerchantInvoices] ([InvoiceNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantInvoices_MerchantId] ON [MerchantInvoices] ([MerchantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_MerchantInvoices_MerchantOrderId] ON [MerchantInvoices] ([MerchantOrderId]) WHERE [Status] <> ''Cancelled''');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantInvoices_Status_InvoiceDate] ON [MerchantInvoices] ([Status], [InvoiceDate]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MerchantPayments_MerchantInvoiceId] ON [MerchantPayments] ([MerchantInvoiceId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantPayments_MerchantOrderId] ON [MerchantPayments] ([MerchantOrderId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantPayments_PaymentProofMediaFileId] ON [MerchantPayments] ([PaymentProofMediaFileId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantPayments_RecordedByAdminUserId] ON [MerchantPayments] ([RecordedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantReceiptItems_MerchantReceiptId] ON [MerchantReceiptItems] ([MerchantReceiptId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantReceipts_MerchantId] ON [MerchantReceipts] ([MerchantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MerchantReceipts_MerchantInvoiceId] ON [MerchantReceipts] ([MerchantInvoiceId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantReceipts_MerchantOrderId] ON [MerchantReceipts] ([MerchantOrderId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MerchantReceipts_MerchantPaymentId] ON [MerchantReceipts] ([MerchantPaymentId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MerchantReceipts_ReceiptNumber] ON [MerchantReceipts] ([ReceiptNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE INDEX [IX_SalesCommissions_MerchantOrderId] ON [SalesCommissions] ([MerchantOrderId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesCommissions_MerchantPaymentId] ON [SalesCommissions] ([MerchantPaymentId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    CREATE INDEX [IX_SalesCommissions_SalespersonId_Status] ON [SalesCommissions] ([SalespersonId], [Status]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805062232_AddMerchantBillingDomain'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260805062232_AddMerchantBillingDomain', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [EmailOutbox] DROP CONSTRAINT [CK_EmailOutbox_RelatedEntity];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_AddressLine1] nvarchar(240) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_AddressLine2] nvarchar(240) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_BankAccountName] nvarchar(200) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_BankAccountNumber] nvarchar(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_BankName] nvarchar(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_BrandName] nvarchar(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_BusinessPhone] nvarchar(32) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_BusinessRegistrationNumber] nvarchar(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_BusinessWebsite] nvarchar(200) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_City] nvarchar(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_Country] nvarchar(80) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_DuitNowDisplayName] nvarchar(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_LegalBusinessName] nvarchar(200) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_PaymentInstructions] nvarchar(2000) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_Postcode] nvarchar(16) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_SstRegistrationNumber] nvarchar(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_State] nvarchar(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_SupportEmail] nvarchar(254) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [MerchantQuotations] ADD [Seller_TaxIdentificationNumber] nvarchar(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [EmailOutbox] ADD [RelatedMerchantInvoiceId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [EmailOutbox] ADD [RelatedMerchantQuotationId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_EmailOutbox_RelatedMerchantInvoiceId_MessageType] ON [EmailOutbox] ([RelatedMerchantInvoiceId], [MessageType]) WHERE [RelatedMerchantInvoiceId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_EmailOutbox_RelatedMerchantQuotationId_MessageType] ON [EmailOutbox] ([RelatedMerchantQuotationId], [MessageType]) WHERE [RelatedMerchantQuotationId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    EXEC(N'ALTER TABLE [EmailOutbox] ADD CONSTRAINT [CK_EmailOutbox_RelatedEntity] CHECK ((CASE WHEN [RelatedOrderId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedUserId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantQuotationId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantInvoiceId] IS NULL THEN 0 ELSE 1 END) = 1)');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [EmailOutbox] ADD CONSTRAINT [FK_EmailOutbox_MerchantInvoices_RelatedMerchantInvoiceId] FOREIGN KEY ([RelatedMerchantInvoiceId]) REFERENCES [MerchantInvoices] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    ALTER TABLE [EmailOutbox] ADD CONSTRAINT [FK_EmailOutbox_MerchantQuotations_RelatedMerchantQuotationId] FOREIGN KEY ([RelatedMerchantQuotationId]) REFERENCES [MerchantQuotations] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805092912_AddMerchantDocumentsAndEmails'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260805092912_AddMerchantDocumentsAndEmails', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD [CourierProvider] nvarchar(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD [CourierProviderCode] nvarchar(32) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD [CourierService] nvarchar(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD [DeliveredAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD [FulfilmentUpdatedByAdminUserId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD [InternalCourierCost] decimal(18,2) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD [InternalShippingNotes] nvarchar(2000) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD [PreparingAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD [ReadyToShipAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD [ShippedAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD [TrackingNumber] nvarchar(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD [TrackingUrlSnapshot] nvarchar(500) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    CREATE TABLE [MerchantDeliveryOrders] (
        [Id] uniqueidentifier NOT NULL,
        [DeliveryOrderNumber] nvarchar(48) NOT NULL,
        [MerchantOrderId] uniqueidentifier NOT NULL,
        [MerchantOrderNumberSnapshot] nvarchar(48) NOT NULL,
        [MerchantId] uniqueidentifier NOT NULL,
        [MerchantCodeSnapshot] nvarchar(32) NOT NULL,
        [MerchantLegalNameSnapshot] nvarchar(200) NOT NULL,
        [MerchantTradingNameSnapshot] nvarchar(200) NULL,
        [ContactPersonSnapshot] nvarchar(160) NOT NULL,
        [ContactEmailSnapshot] nvarchar(254) NOT NULL,
        [ContactPhoneSnapshot] nvarchar(32) NOT NULL,
        [DeliveryAddressLine1Snapshot] nvarchar(240) NOT NULL,
        [DeliveryAddressLine2Snapshot] nvarchar(240) NULL,
        [DeliveryPostcodeSnapshot] nvarchar(16) NOT NULL,
        [DeliveryCitySnapshot] nvarchar(120) NOT NULL,
        [DeliveryStateSnapshot] nvarchar(120) NOT NULL,
        [DeliveryCountrySnapshot] nvarchar(80) NOT NULL,
        [CourierProviderSnapshot] nvarchar(120) NULL,
        [CourierServiceSnapshot] nvarchar(120) NULL,
        [TrackingNumberSnapshot] nvarchar(64) NULL,
        [IssuedAt] datetimeoffset NOT NULL,
        [IssuedByAdminUserId] uniqueidentifier NOT NULL,
        [CancelledAt] datetimeoffset NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_MerchantDeliveryOrders] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MerchantDeliveryOrders_AdminUsers_IssuedByAdminUserId] FOREIGN KEY ([IssuedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantDeliveryOrders_MerchantOrders_MerchantOrderId] FOREIGN KEY ([MerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    CREATE TABLE [MerchantOrderAllocatedTags] (
        [Id] uniqueidentifier NOT NULL,
        [MerchantOrderId] uniqueidentifier NOT NULL,
        [MerchantOrderItemId] uniqueidentifier NOT NULL,
        [MerchantId] uniqueidentifier NOT NULL,
        [SmartTagId] uniqueidentifier NOT NULL,
        [TagCodeSnapshot] nvarchar(64) NOT NULL,
        [ProductVariantId] uniqueidentifier NOT NULL,
        [BatchId] uniqueidentifier NULL,
        [BatchNoSnapshot] nvarchar(64) NULL,
        [Status] nvarchar(32) NOT NULL,
        [AllocatedAt] datetimeoffset NOT NULL,
        [AllocatedByAdminUserId] uniqueidentifier NOT NULL,
        [WasAutomatic] bit NOT NULL,
        [SentToMerchantAt] datetimeoffset NULL,
        [ReleasedAt] datetimeoffset NULL,
        [ReleasedReason] nvarchar(500) NULL,
        [ReleasedByAdminUserId] uniqueidentifier NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_MerchantOrderAllocatedTags] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MerchantOrderAllocatedTags_AdminUsers_AllocatedByAdminUserId] FOREIGN KEY ([AllocatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantOrderAllocatedTags_AdminUsers_ReleasedByAdminUserId] FOREIGN KEY ([ReleasedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantOrderAllocatedTags_MerchantOrderItems_MerchantOrderItemId] FOREIGN KEY ([MerchantOrderItemId]) REFERENCES [MerchantOrderItems] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantOrderAllocatedTags_MerchantOrders_MerchantOrderId] FOREIGN KEY ([MerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_MerchantOrderAllocatedTags_Merchants_MerchantId] FOREIGN KEY ([MerchantId]) REFERENCES [Merchants] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantOrderAllocatedTags_SmartTagBatches_BatchId] FOREIGN KEY ([BatchId]) REFERENCES [SmartTagBatches] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantOrderAllocatedTags_SmartTags_SmartTagId] FOREIGN KEY ([SmartTagId]) REFERENCES [SmartTags] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    CREATE TABLE [MerchantDeliveryOrderItems] (
        [Id] uniqueidentifier NOT NULL,
        [MerchantDeliveryOrderId] uniqueidentifier NOT NULL,
        [MerchantOrderItemId] uniqueidentifier NOT NULL,
        [ProductNameSnapshot] nvarchar(200) NOT NULL,
        [SkuCodeSnapshot] nvarchar(64) NOT NULL,
        [OptionNameSnapshot] nvarchar(120) NOT NULL,
        [SupportsQrSnapshot] bit NOT NULL,
        [SupportsNfcSnapshot] bit NOT NULL,
        [OrderedQuantity] int NOT NULL,
        [AllocatedQuantity] int NOT NULL,
        [BatchSummarySnapshot] nvarchar(1000) NOT NULL,
        [SortOrder] int NOT NULL,
        CONSTRAINT [PK_MerchantDeliveryOrderItems] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MerchantDeliveryOrderItems_MerchantDeliveryOrders_MerchantDeliveryOrderId] FOREIGN KEY ([MerchantDeliveryOrderId]) REFERENCES [MerchantDeliveryOrders] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    CREATE INDEX [IX_MerchantOrders_FulfilmentStatus_CreatedAt] ON [MerchantOrders] ([FulfilmentStatus], [CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    CREATE INDEX [IX_MerchantOrders_FulfilmentUpdatedByAdminUserId] ON [MerchantOrders] ([FulfilmentUpdatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    CREATE INDEX [IX_MerchantDeliveryOrderItems_MerchantDeliveryOrderId] ON [MerchantDeliveryOrderItems] ([MerchantDeliveryOrderId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MerchantDeliveryOrders_DeliveryOrderNumber] ON [MerchantDeliveryOrders] ([DeliveryOrderNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    CREATE INDEX [IX_MerchantDeliveryOrders_IssuedByAdminUserId] ON [MerchantDeliveryOrders] ([IssuedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_MerchantDeliveryOrders_MerchantOrderId_Active] ON [MerchantDeliveryOrders] ([MerchantOrderId]) WHERE [CancelledAt] IS NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    CREATE INDEX [IX_MerchantOrderAllocatedTags_AllocatedByAdminUserId] ON [MerchantOrderAllocatedTags] ([AllocatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    CREATE INDEX [IX_MerchantOrderAllocatedTags_BatchId] ON [MerchantOrderAllocatedTags] ([BatchId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    CREATE INDEX [IX_MerchantOrderAllocatedTags_MerchantId] ON [MerchantOrderAllocatedTags] ([MerchantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    CREATE INDEX [IX_MerchantOrderAllocatedTags_MerchantOrderId_ReleasedAt] ON [MerchantOrderAllocatedTags] ([MerchantOrderId], [ReleasedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    CREATE INDEX [IX_MerchantOrderAllocatedTags_MerchantOrderItemId_ReleasedAt] ON [MerchantOrderAllocatedTags] ([MerchantOrderItemId], [ReleasedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    CREATE INDEX [IX_MerchantOrderAllocatedTags_ReleasedByAdminUserId] ON [MerchantOrderAllocatedTags] ([ReleasedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_MerchantOrderAllocatedTags_SmartTagId_Active] ON [MerchantOrderAllocatedTags] ([SmartTagId]) WHERE [ReleasedAt] IS NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD CONSTRAINT [FK_MerchantOrders_AdminUsers_FulfilmentUpdatedByAdminUserId] FOREIGN KEY ([FulfilmentUpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260806023332_AddMerchantInventoryAllocation'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260806023332_AddMerchantInventoryAllocation', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_AddressLine1] nvarchar(240) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_AddressLine2] nvarchar(240) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_BankAccountName] nvarchar(200) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_BankAccountNumber] nvarchar(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_BankName] nvarchar(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_BrandName] nvarchar(120) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_BusinessPhone] nvarchar(32) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_BusinessRegistrationNumber] nvarchar(64) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_BusinessWebsite] nvarchar(200) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_City] nvarchar(120) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_Country] nvarchar(80) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_DuitNowDisplayName] nvarchar(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_LegalBusinessName] nvarchar(200) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_PaymentInstructions] nvarchar(2000) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_Postcode] nvarchar(16) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_SstRegistrationNumber] nvarchar(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_State] nvarchar(120) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_SupportEmail] nvarchar(254) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    ALTER TABLE [MerchantDeliveryOrders] ADD [Seller_TaxIdentificationNumber] nvarchar(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260809141450_AddMerchantDeliveryOrderSellerSnapshot', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810015044_AddEmailOutboxMerchantDeliveryOrder'
)
BEGIN
    ALTER TABLE [EmailOutbox] DROP CONSTRAINT [CK_EmailOutbox_RelatedEntity];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810015044_AddEmailOutboxMerchantDeliveryOrder'
)
BEGIN
    ALTER TABLE [EmailOutbox] ADD [RelatedMerchantDeliveryOrderId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810015044_AddEmailOutboxMerchantDeliveryOrder'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_EmailOutbox_RelatedMerchantDeliveryOrderId_MessageType] ON [EmailOutbox] ([RelatedMerchantDeliveryOrderId], [MessageType]) WHERE [RelatedMerchantDeliveryOrderId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810015044_AddEmailOutboxMerchantDeliveryOrder'
)
BEGIN
    EXEC(N'ALTER TABLE [EmailOutbox] ADD CONSTRAINT [CK_EmailOutbox_RelatedEntity] CHECK ((CASE WHEN [RelatedOrderId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedUserId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantQuotationId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantInvoiceId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantDeliveryOrderId] IS NULL THEN 0 ELSE 1 END) = 1)');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810015044_AddEmailOutboxMerchantDeliveryOrder'
)
BEGIN
    ALTER TABLE [EmailOutbox] ADD CONSTRAINT [FK_EmailOutbox_MerchantDeliveryOrders_RelatedMerchantDeliveryOrderId] FOREIGN KEY ([RelatedMerchantDeliveryOrderId]) REFERENCES [MerchantDeliveryOrders] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810015044_AddEmailOutboxMerchantDeliveryOrder'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260810015044_AddEmailOutboxMerchantDeliveryOrder', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810180418_AddFeaturedSamplePet'
)
BEGIN
    ALTER TABLE [Pets] ADD [IsSampleEligible] bit NOT NULL DEFAULT CAST(0 AS bit);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810180418_AddFeaturedSamplePet'
)
BEGIN
    ALTER TABLE [Pets] ADD [RowVersion] rowversion NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810180418_AddFeaturedSamplePet'
)
BEGIN
    ALTER TABLE [Pets] ADD [SampleEligibilityUpdatedAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810180418_AddFeaturedSamplePet'
)
BEGIN
    ALTER TABLE [Pets] ADD [SampleEligibilityUpdatedByAdminUserId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810180418_AddFeaturedSamplePet'
)
BEGIN
    CREATE TABLE [PublicSiteSettings] (
        [Id] uniqueidentifier NOT NULL,
        [FeaturedSamplePetId] uniqueidentifier NULL,
        [UpdatedByAdminUserId] uniqueidentifier NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PublicSiteSettings] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_PublicSiteSettings_AdminUsers_UpdatedByAdminUserId] FOREIGN KEY ([UpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PublicSiteSettings_Pets_FeaturedSamplePetId] FOREIGN KEY ([FeaturedSamplePetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810180418_AddFeaturedSamplePet'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CreatedAt', N'FeaturedSamplePetId', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[PublicSiteSettings]'))
        SET IDENTITY_INSERT [PublicSiteSettings] ON;
    EXEC(N'INSERT INTO [PublicSiteSettings] ([Id], [CreatedAt], [FeaturedSamplePetId], [UpdatedAt], [UpdatedByAdminUserId])
    VALUES (''e7b2fc49-e065-4c4a-ae65-d2678a2fa7c4'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, ''2026-01-01T00:00:00.0000000+00:00'', NULL)');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CreatedAt', N'FeaturedSamplePetId', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[PublicSiteSettings]'))
        SET IDENTITY_INSERT [PublicSiteSettings] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810180418_AddFeaturedSamplePet'
)
BEGIN
    CREATE INDEX [IX_Pets_IsSampleEligible] ON [Pets] ([IsSampleEligible]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810180418_AddFeaturedSamplePet'
)
BEGIN
    CREATE INDEX [IX_Pets_SampleEligibilityUpdatedByAdminUserId] ON [Pets] ([SampleEligibilityUpdatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810180418_AddFeaturedSamplePet'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_PublicSiteSettings_FeaturedSamplePetId] ON [PublicSiteSettings] ([FeaturedSamplePetId]) WHERE [FeaturedSamplePetId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810180418_AddFeaturedSamplePet'
)
BEGIN
    CREATE INDEX [IX_PublicSiteSettings_UpdatedByAdminUserId] ON [PublicSiteSettings] ([UpdatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810180418_AddFeaturedSamplePet'
)
BEGIN
    ALTER TABLE [Pets] ADD CONSTRAINT [FK_Pets_AdminUsers_SampleEligibilityUpdatedByAdminUserId] FOREIGN KEY ([SampleEligibilityUpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260810180418_AddFeaturedSamplePet'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260810180418_AddFeaturedSamplePet', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260821092133_NormalizeMomentVisibilitySemantics'
)
BEGIN
    UPDATE [PetMemories]
    SET [Visibility] = N'Private'
    WHERE [Visibility] = N'FamilyOnly';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260821092133_NormalizeMomentVisibilitySemantics'
)
BEGIN
    UPDATE [PetMemories]
    SET [ShowOnPublicProfile] = CASE
        WHEN [Visibility] = N'Public' THEN CAST(1 AS bit)
        ELSE CAST(0 AS bit)
    END
    WHERE [ShowOnPublicProfile] <> CASE
        WHEN [Visibility] = N'Public' THEN CAST(1 AS bit)
        ELSE CAST(0 AS bit)
    END;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260821092133_NormalizeMomentVisibilitySemantics'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260821092133_NormalizeMomentVisibilitySemantics', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260822005625_NormalizeCareVisibilitySemantics'
)
BEGIN
    UPDATE [CareRecords]
    SET [PublicVisibility] = N'PublicBadgeOnly'
    WHERE [PublicVisibility] = N'PublicDetails';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260822005625_NormalizeCareVisibilitySemantics'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260822005625_NormalizeCareVisibilitySemantics', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260827053323_AddCareIdentityAndFulfillment'
)
BEGIN
    ALTER TABLE [CareRecords] ADD [CareName] nvarchar(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260827053323_AddCareIdentityAndFulfillment'
)
BEGIN
    ALTER TABLE [CareRecords] ADD [FulfillsCareRecordId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260827053323_AddCareIdentityAndFulfillment'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_CareRecords_FulfillsCareRecordId] ON [CareRecords] ([FulfillsCareRecordId]) WHERE [FulfillsCareRecordId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260827053323_AddCareIdentityAndFulfillment'
)
BEGIN
    ALTER TABLE [CareRecords] ADD CONSTRAINT [FK_CareRecords_CareRecords_FulfillsCareRecordId] FOREIGN KEY ([FulfillsCareRecordId]) REFERENCES [CareRecords] ([Id]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260827053323_AddCareIdentityAndFulfillment'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260827053323_AddCareIdentityAndFulfillment', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260903091226_AddPaymentProofNotifications'
)
BEGIN
    ALTER TABLE [EmailOutbox] DROP CONSTRAINT [CK_EmailOutbox_RelatedEntity];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260903091226_AddPaymentProofNotifications'
)
BEGIN
    ALTER TABLE [EmailOutbox] ADD [RelatedPaymentProofId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260903091226_AddPaymentProofNotifications'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_EmailOutbox_RelatedPaymentProofId_MessageType] ON [EmailOutbox] ([RelatedPaymentProofId], [MessageType]) WHERE [RelatedPaymentProofId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260903091226_AddPaymentProofNotifications'
)
BEGIN
    EXEC(N'ALTER TABLE [EmailOutbox] ADD CONSTRAINT [CK_EmailOutbox_RelatedEntity] CHECK ((CASE WHEN [RelatedOrderId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedUserId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedPaymentProofId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantQuotationId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantInvoiceId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantDeliveryOrderId] IS NULL THEN 0 ELSE 1 END) = 1)');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260903091226_AddPaymentProofNotifications'
)
BEGIN
    ALTER TABLE [EmailOutbox] ADD CONSTRAINT [FK_EmailOutbox_PaymentProofs_RelatedPaymentProofId] FOREIGN KEY ([RelatedPaymentProofId]) REFERENCES [PaymentProofs] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260903091226_AddPaymentProofNotifications'
)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM [EmailTemplateSettings] WHERE [MessageType] = N'PaymentConfirmed')
        INSERT INTO [EmailTemplateSettings] ([Id], [MessageType], [IsEnabled], [EnabledFromUtc], [UpdatedByAdminUserId], [CreatedAt], [UpdatedAt])
        VALUES ('531d900b-8b64-4a07-8c2d-a289c05812e1', N'PaymentConfirmed', 0, NULL, NULL, '2026-09-03T00:00:00.0000000+00:00', '2026-09-03T00:00:00.0000000+00:00');

    IF NOT EXISTS (SELECT 1 FROM [EmailTemplateSettings] WHERE [MessageType] = N'OrderShipped')
        INSERT INTO [EmailTemplateSettings] ([Id], [MessageType], [IsEnabled], [EnabledFromUtc], [UpdatedByAdminUserId], [CreatedAt], [UpdatedAt])
        VALUES ('d8411e2a-6cf3-4705-96d7-97ecbe9e5792', N'OrderShipped', 0, NULL, NULL, '2026-09-03T00:00:00.0000000+00:00', '2026-09-03T00:00:00.0000000+00:00');

    IF NOT EXISTS (SELECT 1 FROM [EmailTemplateSettings] WHERE [MessageType] = N'AdminPaymentProofSubmitted')
        INSERT INTO [EmailTemplateSettings] ([Id], [MessageType], [IsEnabled], [EnabledFromUtc], [UpdatedByAdminUserId], [CreatedAt], [UpdatedAt])
        VALUES ('75357899-aac6-4d9f-8f2f-8e20812c9677', N'AdminPaymentProofSubmitted', 0, NULL, NULL, '2026-09-03T00:00:00.0000000+00:00', '2026-09-03T00:00:00.0000000+00:00');

    IF NOT EXISTS (SELECT 1 FROM [EmailTemplateSettings] WHERE [MessageType] = N'PaymentProofRejected')
        INSERT INTO [EmailTemplateSettings] ([Id], [MessageType], [IsEnabled], [EnabledFromUtc], [UpdatedByAdminUserId], [CreatedAt], [UpdatedAt])
        VALUES ('8b1117d0-caea-4105-917f-744a926d9255', N'PaymentProofRejected', 0, NULL, NULL, '2026-09-03T00:00:00.0000000+00:00', '2026-09-03T00:00:00.0000000+00:00');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260903091226_AddPaymentProofNotifications'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260903091226_AddPaymentProofNotifications', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    ALTER TABLE [TagOrderItems] ADD [CostBasis] nvarchar(32) NOT NULL DEFAULT N'Unavailable';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    ALTER TABLE [TagOrderItems] ADD [CostOfGoodsSnapshot] decimal(18,6) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    ALTER TABLE [TagOrderItems] ADD [CostSnapshotAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    ALTER TABLE [SmartTags] ADD [InventoryReceiptId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    ALTER TABLE [MerchantOrderItems] ADD [CostBasis] nvarchar(32) NOT NULL DEFAULT N'Unavailable';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    ALTER TABLE [MerchantOrderItems] ADD [CostOfGoodsSnapshot] decimal(18,6) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    ALTER TABLE [MerchantOrderItems] ADD [CostSnapshotAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    ALTER TABLE [MerchantOrderAllocatedTags] ADD [CostBasis] nvarchar(32) NOT NULL DEFAULT N'Unavailable';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    ALTER TABLE [MerchantOrderAllocatedTags] ADD [CostSnapshotAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    ALTER TABLE [MerchantOrderAllocatedTags] ADD [InventoryReceiptIdSnapshot] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    ALTER TABLE [MerchantOrderAllocatedTags] ADD [InventoryReceiptNumberSnapshot] nvarchar(80) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    ALTER TABLE [MerchantOrderAllocatedTags] ADD [UnitLandedCostMyrSnapshot] decimal(18,6) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    CREATE TABLE [InventoryReceipts] (
        [Id] uniqueidentifier NOT NULL,
        [ReceiptNumber] nvarchar(80) NOT NULL,
        [TagProductVariantId] uniqueidentifier NOT NULL,
        [SmartTagBatchId] uniqueidentifier NULL,
        [QuantityReceived] int NOT NULL,
        [ReceivedAt] datetimeoffset NOT NULL,
        [SupplierName] nvarchar(200) NULL,
        [SupplierReference] nvarchar(120) NULL,
        [Notes] nvarchar(2000) NULL,
        [PurchaseCurrency] nvarchar(3) NOT NULL,
        [ExchangeRateToMyr] decimal(18,6) NOT NULL,
        [CostMode] nvarchar(24) NOT NULL,
        [GoodsCost] decimal(18,2) NOT NULL,
        [FreightCost] decimal(18,2) NOT NULL,
        [CustomsTaxCost] decimal(18,2) NOT NULL,
        [OtherLandedCost] decimal(18,2) NOT NULL,
        [TotalLandedCostMyr] decimal(18,2) NOT NULL,
        [UnitLandedCostMyr] decimal(18,6) NOT NULL,
        [CreatedByAdminUserId] uniqueidentifier NOT NULL,
        [CorrectsReceiptId] uniqueidentifier NULL,
        [CorrectionReason] nvarchar(1000) NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_InventoryReceipts] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_InventoryReceipts_Costs] CHECK ([GoodsCost] >= 0 AND [FreightCost] >= 0 AND [CustomsTaxCost] >= 0 AND [OtherLandedCost] >= 0 AND [TotalLandedCostMyr] > 0 AND [UnitLandedCostMyr] > 0),
        CONSTRAINT [CK_InventoryReceipts_ExchangeRate] CHECK ([ExchangeRateToMyr] > 0),
        CONSTRAINT [CK_InventoryReceipts_QuantityReceived] CHECK ([QuantityReceived] > 0),
        CONSTRAINT [FK_InventoryReceipts_AdminUsers_CreatedByAdminUserId] FOREIGN KEY ([CreatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryReceipts_InventoryReceipts_CorrectsReceiptId] FOREIGN KEY ([CorrectsReceiptId]) REFERENCES [InventoryReceipts] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryReceipts_SmartTagBatches_SmartTagBatchId] FOREIGN KEY ([SmartTagBatchId]) REFERENCES [SmartTagBatches] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryReceipts_TagProductVariants_TagProductVariantId] FOREIGN KEY ([TagProductVariantId]) REFERENCES [TagProductVariants] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    CREATE TABLE [TagOrderItemCostAllocations] (
        [Id] uniqueidentifier NOT NULL,
        [TagOrderItemId] uniqueidentifier NOT NULL,
        [SmartTagId] uniqueidentifier NOT NULL,
        [InventoryReceiptId] uniqueidentifier NULL,
        [TagCodeSnapshot] nvarchar(32) NOT NULL,
        [InventoryReceiptNumberSnapshot] nvarchar(80) NULL,
        [UnitLandedCostMyrSnapshot] decimal(18,6) NULL,
        [CostBasis] nvarchar(32) NOT NULL DEFAULT N'Unavailable',
        [CostSnapshotAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TagOrderItemCostAllocations] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_TagOrderItemCostAllocations_InventoryReceipts_InventoryReceiptId] FOREIGN KEY ([InventoryReceiptId]) REFERENCES [InventoryReceipts] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TagOrderItemCostAllocations_SmartTags_SmartTagId] FOREIGN KEY ([SmartTagId]) REFERENCES [SmartTags] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TagOrderItemCostAllocations_TagOrderItems_TagOrderItemId] FOREIGN KEY ([TagOrderItemId]) REFERENCES [TagOrderItems] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    CREATE INDEX [IX_SmartTags_InventoryReceiptId] ON [SmartTags] ([InventoryReceiptId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    CREATE INDEX [IX_InventoryReceipts_CorrectsReceiptId] ON [InventoryReceipts] ([CorrectsReceiptId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    CREATE INDEX [IX_InventoryReceipts_CreatedByAdminUserId] ON [InventoryReceipts] ([CreatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    CREATE UNIQUE INDEX [IX_InventoryReceipts_ReceiptNumber] ON [InventoryReceipts] ([ReceiptNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    CREATE INDEX [IX_InventoryReceipts_SmartTagBatchId] ON [InventoryReceipts] ([SmartTagBatchId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    CREATE INDEX [IX_InventoryReceipts_TagProductVariantId_ReceivedAt] ON [InventoryReceipts] ([TagProductVariantId], [ReceivedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    CREATE INDEX [IX_TagOrderItemCostAllocations_InventoryReceiptId] ON [TagOrderItemCostAllocations] ([InventoryReceiptId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TagOrderItemCostAllocations_SmartTagId] ON [TagOrderItemCostAllocations] ([SmartTagId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    CREATE INDEX [IX_TagOrderItemCostAllocations_TagOrderItemId] ON [TagOrderItemCostAllocations] ([TagOrderItemId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    ALTER TABLE [SmartTags] ADD CONSTRAINT [FK_SmartTags_InventoryReceipts_InventoryReceiptId] FOREIGN KEY ([InventoryReceiptId]) REFERENCES [InventoryReceipts] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260907070426_AddInventoryReceiptsAndProfitabilitySnapshots', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907082441_AddInventoryReceiptSupersession'
)
BEGIN
    DROP INDEX [IX_InventoryReceipts_CorrectsReceiptId] ON [InventoryReceipts];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907082441_AddInventoryReceiptSupersession'
)
BEGIN
    ALTER TABLE [InventoryReceipts] ADD [SupersededAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907082441_AddInventoryReceiptSupersession'
)
BEGIN
    ALTER TABLE [InventoryReceipts] ADD [SupersededByReceiptId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907082441_AddInventoryReceiptSupersession'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_InventoryReceipts_CorrectsReceiptId] ON [InventoryReceipts] ([CorrectsReceiptId]) WHERE [CorrectsReceiptId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907082441_AddInventoryReceiptSupersession'
)
BEGIN
    CREATE INDEX [IX_InventoryReceipts_SupersededAt_TagProductVariantId] ON [InventoryReceipts] ([SupersededAt], [TagProductVariantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907082441_AddInventoryReceiptSupersession'
)
BEGIN
    CREATE INDEX [IX_InventoryReceipts_SupersededByReceiptId] ON [InventoryReceipts] ([SupersededByReceiptId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907082441_AddInventoryReceiptSupersession'
)
BEGIN
    ALTER TABLE [InventoryReceipts] ADD CONSTRAINT [FK_InventoryReceipts_InventoryReceipts_SupersededByReceiptId] FOREIGN KEY ([SupersededByReceiptId]) REFERENCES [InventoryReceipts] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907082441_AddInventoryReceiptSupersession'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260907082441_AddInventoryReceiptSupersession', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907085637_HardenMerchantCommissionCorrectness'
)
BEGIN
    IF EXISTS (
        SELECT 1
        FROM [SalesCommissions]
        WHERE [Status] <> N'Reversed'
        GROUP BY [MerchantOrderId]
        HAVING COUNT_BIG(*) > 1
    )
    BEGIN
        THROW 51020, 'Duplicate non-reversed commissions exist for a merchant order. Run the commission diagnostic and resolve the financial history before applying this migration.', 1;
    END;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907085637_HardenMerchantCommissionCorrectness'
)
BEGIN
    DROP INDEX [IX_SalesCommissions_MerchantOrderId] ON [SalesCommissions];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907085637_HardenMerchantCommissionCorrectness'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD [PaidByAdminUserId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907085637_HardenMerchantCommissionCorrectness'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD [ReversalReason] nvarchar(1000) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907085637_HardenMerchantCommissionCorrectness'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD [ReversedByAdminUserId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907085637_HardenMerchantCommissionCorrectness'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_SalesCommissions_MerchantOrderId] ON [SalesCommissions] ([MerchantOrderId]) WHERE [Status] <> ''Reversed''');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907085637_HardenMerchantCommissionCorrectness'
)
BEGIN
    CREATE INDEX [IX_SalesCommissions_PaidByAdminUserId] ON [SalesCommissions] ([PaidByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907085637_HardenMerchantCommissionCorrectness'
)
BEGIN
    CREATE INDEX [IX_SalesCommissions_ReversedByAdminUserId] ON [SalesCommissions] ([ReversedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907085637_HardenMerchantCommissionCorrectness'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD CONSTRAINT [FK_SalesCommissions_AdminUsers_PaidByAdminUserId] FOREIGN KEY ([PaidByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907085637_HardenMerchantCommissionCorrectness'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD CONSTRAINT [FK_SalesCommissions_AdminUsers_ReversedByAdminUserId] FOREIGN KEY ([ReversedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907085637_HardenMerchantCommissionCorrectness'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260907085637_HardenMerchantCommissionCorrectness', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [AttributedAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [AttributionSource] nvarchar(32) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [SalespersonCodeSnapshot] nvarchar(32) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [SalespersonId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [SalespersonNameSnapshot] nvarchar(160) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    ALTER TABLE [Salespersons] ADD [ReferralCode] nvarchar(24) COLLATE Latin1_General_100_CI_AS NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    CREATE TABLE [OwnerReferralAttributions] (
        [Id] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [SalespersonId] uniqueidentifier NOT NULL,
        [ReferralCodeSnapshot] nvarchar(24) NOT NULL,
        [SalespersonCodeSnapshot] nvarchar(32) NOT NULL,
        [SalespersonNameSnapshot] nvarchar(160) NOT NULL,
        [AttributionSource] nvarchar(32) NOT NULL,
        [CapturedAt] datetimeoffset NOT NULL,
        [AttributedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_OwnerReferralAttributions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_OwnerReferralAttributions_Salespersons_SalespersonId] FOREIGN KEY ([SalespersonId]) REFERENCES [Salespersons] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_OwnerReferralAttributions_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    CREATE INDEX [IX_TagOrders_SalespersonId] ON [TagOrders] ([SalespersonId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_Salespersons_ReferralCode] ON [Salespersons] ([ReferralCode]) WHERE [ReferralCode] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    EXEC(N'ALTER TABLE [Salespersons] ADD CONSTRAINT [CK_Salespersons_ReferralCode] CHECK ([ReferralCode] IS NULL OR ([ReferralCode] NOT IN (''ADMIN'',''API'',''LOGIN'',''WWW'',''AUTH'') AND [ReferralCode] NOT LIKE ''%[^A-Z0-9]%'' AND LEN([ReferralCode]) BETWEEN 3 AND 24))');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    CREATE INDEX [IX_OwnerReferralAttributions_AttributedAt] ON [OwnerReferralAttributions] ([AttributedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    CREATE INDEX [IX_OwnerReferralAttributions_SalespersonId] ON [OwnerReferralAttributions] ([SalespersonId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    CREATE UNIQUE INDEX [IX_OwnerReferralAttributions_UserId] ON [OwnerReferralAttributions] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    ALTER TABLE [TagOrders] ADD CONSTRAINT [FK_TagOrders_Salespersons_SalespersonId] FOREIGN KEY ([SalespersonId]) REFERENCES [Salespersons] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260907150516_AddOwnerReferralAttribution'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260907150516_AddOwnerReferralAttribution', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    IF EXISTS (
        SELECT 1
        FROM [SalesCommissions]
        WHERE [Status] <> N'Reversed'
        GROUP BY [MerchantOrderId]
        HAVING COUNT_BIG(*) > 1
    )
    BEGIN
        THROW 51030, 'Duplicate non-reversed merchant commissions exist. Run diagnose-phase3b-sales-commissions.sql and resolve the financial history before applying this migration.', 1;
    END;

    IF EXISTS (
        SELECT 1
        FROM [SalesCommissions]
        GROUP BY [MerchantPaymentId]
        HAVING COUNT_BIG(*) > 1
    )
    BEGIN
        THROW 51031, 'Duplicate merchant-payment commission history exists. Run diagnose-phase3b-sales-commissions.sql before applying this migration.', 1;
    END;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    DROP INDEX [IX_SalesCommissions_MerchantOrderId] ON [SalesCommissions];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    DROP INDEX [IX_SalesCommissions_MerchantPaymentId] ON [SalesCommissions];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    ALTER TABLE [Salespersons] ADD [UserId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    DECLARE @var3 sysname;
    SELECT @var3 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[SalesCommissions]') AND [c].[name] = N'MerchantPaymentId');
    IF @var3 IS NOT NULL EXEC(N'ALTER TABLE [SalesCommissions] DROP CONSTRAINT [' + @var3 + '];');
    ALTER TABLE [SalesCommissions] ALTER COLUMN [MerchantPaymentId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    DECLARE @var4 sysname;
    SELECT @var4 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[SalesCommissions]') AND [c].[name] = N'MerchantOrderId');
    IF @var4 IS NOT NULL EXEC(N'ALTER TABLE [SalesCommissions] DROP CONSTRAINT [' + @var4 + '];');
    ALTER TABLE [SalesCommissions] ALTER COLUMN [MerchantOrderId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    DECLARE @var5 sysname;
    SELECT @var5 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[SalesCommissions]') AND [c].[name] = N'CommissionPercentageSnapshot');
    IF @var5 IS NOT NULL EXEC(N'ALTER TABLE [SalesCommissions] DROP CONSTRAINT [' + @var5 + '];');
    ALTER TABLE [SalesCommissions] ALTER COLUMN [CommissionPercentageSnapshot] decimal(5,2) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD [CommissionFixedAmountSnapshot] decimal(18,2) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD [CommissionRuleEffectiveFromSnapshot] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD [CommissionRuleId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD [CommissionType] nvarchar(48) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD [SourceType] nvarchar(32) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD [TagOrderId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    UPDATE [SalesCommissions]
    SET [SourceType] = N'MerchantOrder',
        [CommissionType] = N'MerchantOrderPercentage';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    DECLARE @var6 sysname;
    SELECT @var6 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[SalesCommissions]') AND [c].[name] = N'CommissionType');
    IF @var6 IS NOT NULL EXEC(N'ALTER TABLE [SalesCommissions] DROP CONSTRAINT [' + @var6 + '];');
    ALTER TABLE [SalesCommissions] ALTER COLUMN [CommissionType] nvarchar(48) NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    DECLARE @var7 sysname;
    SELECT @var7 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[SalesCommissions]') AND [c].[name] = N'SourceType');
    IF @var7 IS NOT NULL EXEC(N'ALTER TABLE [SalesCommissions] DROP CONSTRAINT [' + @var7 + '];');
    ALTER TABLE [SalesCommissions] ALTER COLUMN [SourceType] nvarchar(32) NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    CREATE TABLE [CommissionRules] (
        [Id] uniqueidentifier NOT NULL,
        [CommissionType] nvarchar(48) NOT NULL,
        [SalespersonId] uniqueidentifier NULL,
        [Percentage] decimal(5,2) NULL,
        [FixedAmount] decimal(18,2) NULL,
        [MinQuantity] int NULL,
        [MaxQuantity] int NULL,
        [EligibilityMonths] int NULL,
        [Currency] nvarchar(3) NOT NULL,
        [EffectiveFrom] datetimeoffset NOT NULL,
        [EffectiveTo] datetimeoffset NULL,
        [IsActive] bit NOT NULL,
        [Notes] nvarchar(2000) NULL,
        [UpdatedByAdminUserId] uniqueidentifier NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_CommissionRules] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_CommissionRules_EffectiveRange] CHECK ([EffectiveTo] IS NULL OR [EffectiveTo] > [EffectiveFrom]),
        CONSTRAINT [CK_CommissionRules_QuantityRange] CHECK (([MinQuantity] IS NULL OR [MinQuantity] > 0) AND ([MaxQuantity] IS NULL OR [MaxQuantity] > 0) AND ([MinQuantity] IS NULL OR [MaxQuantity] IS NULL OR [MinQuantity] <= [MaxQuantity])),
        CONSTRAINT [CK_CommissionRules_ValueShape] CHECK (([Percentage] IS NOT NULL AND [FixedAmount] IS NULL AND [Percentage] BETWEEN 0 AND 100) OR ([Percentage] IS NULL AND [FixedAmount] IS NOT NULL AND [FixedAmount] >= 0)),
        CONSTRAINT [FK_CommissionRules_AdminUsers_UpdatedByAdminUserId] FOREIGN KEY ([UpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CommissionRules_Salespersons_SalespersonId] FOREIGN KEY ([SalespersonId]) REFERENCES [Salespersons] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CommissionType', N'CreatedAt', N'Currency', N'EffectiveFrom', N'EffectiveTo', N'EligibilityMonths', N'FixedAmount', N'IsActive', N'MaxQuantity', N'MinQuantity', N'Notes', N'Percentage', N'SalespersonId', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[CommissionRules]'))
        SET IDENTITY_INSERT [CommissionRules] ON;
    EXEC(N'INSERT INTO [CommissionRules] ([Id], [CommissionType], [CreatedAt], [Currency], [EffectiveFrom], [EffectiveTo], [EligibilityMonths], [FixedAmount], [IsActive], [MaxQuantity], [MinQuantity], [Notes], [Percentage], [SalespersonId], [UpdatedAt], [UpdatedByAdminUserId])
    VALUES (''a971d6d5-86a8-4f85-a5e4-9cb85a1f3b01'', N''DirectRetailPercentage'', ''2026-01-01T00:00:00.0000000+00:00'', N''MYR'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, NULL, NULL, CAST(1 AS bit), NULL, NULL, N''Default direct retail commission'', 15.0, NULL, ''2026-01-01T00:00:00.0000000+00:00'', NULL)');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CommissionType', N'CreatedAt', N'Currency', N'EffectiveFrom', N'EffectiveTo', N'EligibilityMonths', N'FixedAmount', N'IsActive', N'MaxQuantity', N'MinQuantity', N'Notes', N'Percentage', N'SalespersonId', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[CommissionRules]'))
        SET IDENTITY_INSERT [CommissionRules] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_Salespersons_UserId] ON [Salespersons] ([UserId]) WHERE [UserId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    CREATE INDEX [IX_SalesCommissions_CommissionRuleId] ON [SalesCommissions] ([CommissionRuleId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_SalesCommissions_MerchantOrderId_CommissionType] ON [SalesCommissions] ([MerchantOrderId], [CommissionType]) WHERE [MerchantOrderId] IS NOT NULL AND [Status] <> ''Reversed''');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_SalesCommissions_MerchantPaymentId_CommissionType] ON [SalesCommissions] ([MerchantPaymentId], [CommissionType]) WHERE [MerchantPaymentId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_SalesCommissions_TagOrderId_CommissionType] ON [SalesCommissions] ([TagOrderId], [CommissionType]) WHERE [TagOrderId] IS NOT NULL AND [Status] <> ''Reversed''');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    EXEC(N'ALTER TABLE [SalesCommissions] ADD CONSTRAINT [CK_SalesCommissions_SourceCommissionType] CHECK (([CommissionType] = ''MerchantOrderPercentage'' AND [SourceType] = ''MerchantOrder'') OR ([CommissionType] = ''DirectRetailPercentage'' AND [SourceType] = ''TagOrder'') OR [CommissionType] IN (''ResellerAcquisitionBonus'',''ResellerRepeatPercentage''))');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    EXEC(N'ALTER TABLE [SalesCommissions] ADD CONSTRAINT [CK_SalesCommissions_SourceShape] CHECK (([SourceType] = ''MerchantOrder'' AND [MerchantOrderId] IS NOT NULL AND [MerchantPaymentId] IS NOT NULL AND [TagOrderId] IS NULL) OR ([SourceType] = ''TagOrder'' AND [TagOrderId] IS NOT NULL AND [MerchantOrderId] IS NULL AND [MerchantPaymentId] IS NULL))');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    EXEC(N'ALTER TABLE [SalesCommissions] ADD CONSTRAINT [CK_SalesCommissions_ValueShape] CHECK (([CommissionPercentageSnapshot] IS NOT NULL AND [CommissionFixedAmountSnapshot] IS NULL) OR ([CommissionPercentageSnapshot] IS NULL AND [CommissionFixedAmountSnapshot] IS NOT NULL))');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    CREATE INDEX [IX_CommissionRules_CommissionType_IsActive_EffectiveFrom] ON [CommissionRules] ([CommissionType], [IsActive], [EffectiveFrom]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CommissionRules_CommissionType_SalespersonId_EffectiveFrom] ON [CommissionRules] ([CommissionType], [SalespersonId], [EffectiveFrom]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    CREATE INDEX [IX_CommissionRules_SalespersonId] ON [CommissionRules] ([SalespersonId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    CREATE INDEX [IX_CommissionRules_UpdatedByAdminUserId] ON [CommissionRules] ([UpdatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD CONSTRAINT [FK_SalesCommissions_CommissionRules_CommissionRuleId] FOREIGN KEY ([CommissionRuleId]) REFERENCES [CommissionRules] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD CONSTRAINT [FK_SalesCommissions_TagOrders_TagOrderId] FOREIGN KEY ([TagOrderId]) REFERENCES [TagOrders] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    ALTER TABLE [Salespersons] ADD CONSTRAINT [FK_Salespersons_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908001234_GeneralizeSalesCommissionAndDirectRetail'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260908001234_GeneralizeSalesCommissionAndDirectRetail', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    IF EXISTS (
        SELECT 1
        FROM [SalesCommissions]
        WHERE [CommissionType] IN ('ResellerAcquisitionBonus', 'ResellerRepeatPercentage'))
        THROW 51040, 'Phase 3C cannot continue: reseller commission history already exists. Run the Phase 3C diagnostic and review it manually.', 1;

    IF EXISTS (
        SELECT 1
        FROM [CommissionRules]
        WHERE [CommissionType] <> 'DirectRetailPercentage')
        THROW 51041, 'Phase 3C cannot continue: non-Phase-3B commission rules already exist. Run the Phase 3C diagnostic and reconcile them manually.', 1;

    IF EXISTS (
        SELECT 1
        FROM [SalesCommissions] commission
        LEFT JOIN [MerchantOrders] merchantOrder ON merchantOrder.[Id] = commission.[MerchantOrderId]
        LEFT JOIN [MerchantPayments] payment ON payment.[Id] = commission.[MerchantPaymentId]
        WHERE commission.[SourceType] = 'MerchantOrder'
          AND (merchantOrder.[Id] IS NULL
               OR payment.[Id] IS NULL
               OR payment.[MerchantOrderId] <> commission.[MerchantOrderId]))
        THROW 51042, 'Phase 3C cannot continue: a merchant commission cannot be linked safely to its merchant.', 1;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [SalesCommissions] DROP CONSTRAINT [CK_SalesCommissions_SourceCommissionType];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [SalesCommissions] DROP CONSTRAINT [CK_SalesCommissions_SourceShape];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    DROP INDEX [IX_CommissionRules_CommissionType_SalespersonId_EffectiveFrom] ON [CommissionRules];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD [MerchantId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD [AcquiredBySalespersonCodeSnapshot] nvarchar(32) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD [AcquiredBySalespersonId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD [AcquiredBySalespersonNameSnapshot] nvarchar(160) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD [AcquisitionAttributedAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD [CommissionPlan] nvarchar(32) NOT NULL DEFAULT N'LegacyPercentage';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD [FirstQualifyingMerchantOrderId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD [FirstQualifyingPaidOrderAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD [RepeatCommissionEligibilityMonthsSnapshot] int NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD [RepeatCommissionEligibleUntil] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD [RepeatCommissionPercentageSnapshot] decimal(5,2) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD [RepeatCommissionRuleEffectiveFromSnapshot] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD [RepeatCommissionRuleIdSnapshot] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    UPDATE commission
    SET commission.[MerchantId] = merchantOrder.[MerchantId]
    FROM [SalesCommissions] commission
    INNER JOIN [MerchantOrders] merchantOrder
        ON merchantOrder.[Id] = commission.[MerchantOrderId]
    WHERE commission.[SourceType] = 'MerchantOrder';

    IF EXISTS (
        SELECT 1 FROM [SalesCommissions]
        WHERE [SourceType] = 'MerchantOrder' AND [MerchantId] IS NULL)
        THROW 51043, 'Phase 3C cannot continue: not every merchant commission was backfilled with a merchant.', 1;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CommissionType', N'CreatedAt', N'Currency', N'EffectiveFrom', N'EffectiveTo', N'EligibilityMonths', N'FixedAmount', N'IsActive', N'MaxQuantity', N'MinQuantity', N'Notes', N'Percentage', N'SalespersonId', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[CommissionRules]'))
        SET IDENTITY_INSERT [CommissionRules] ON;
    EXEC(N'INSERT INTO [CommissionRules] ([Id], [CommissionType], [CreatedAt], [Currency], [EffectiveFrom], [EffectiveTo], [EligibilityMonths], [FixedAmount], [IsActive], [MaxQuantity], [MinQuantity], [Notes], [Percentage], [SalespersonId], [UpdatedAt], [UpdatedByAdminUserId])
    VALUES (''a971d6d5-86a8-4f85-a5e4-9cb85a1f3b11'', N''ResellerAcquisitionBonus'', ''2026-01-01T00:00:00.0000000+00:00'', N''MYR'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, NULL, 50.0, CAST(1 AS bit), 19, 10, N''Default reseller acquisition tier: 10–19 units'', NULL, NULL, ''2026-01-01T00:00:00.0000000+00:00'', NULL),
    (''a971d6d5-86a8-4f85-a5e4-9cb85a1f3b12'', N''ResellerAcquisitionBonus'', ''2026-01-01T00:00:00.0000000+00:00'', N''MYR'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, NULL, 80.0, CAST(1 AS bit), 49, 20, N''Default reseller acquisition tier: 20–49 units'', NULL, NULL, ''2026-01-01T00:00:00.0000000+00:00'', NULL),
    (''a971d6d5-86a8-4f85-a5e4-9cb85a1f3b13'', N''ResellerAcquisitionBonus'', ''2026-01-01T00:00:00.0000000+00:00'', N''MYR'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, NULL, 150.0, CAST(1 AS bit), 99, 50, N''Default reseller acquisition tier: 50–99 units'', NULL, NULL, ''2026-01-01T00:00:00.0000000+00:00'', NULL),
    (''a971d6d5-86a8-4f85-a5e4-9cb85a1f3b14'', N''ResellerAcquisitionBonus'', ''2026-01-01T00:00:00.0000000+00:00'', N''MYR'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, NULL, 250.0, CAST(1 AS bit), NULL, 100, N''Default reseller acquisition tier: 100+ units'', NULL, NULL, ''2026-01-01T00:00:00.0000000+00:00'', NULL),
    (''a971d6d5-86a8-4f85-a5e4-9cb85a1f3b20'', N''ResellerRepeatPercentage'', ''2026-01-01T00:00:00.0000000+00:00'', N''MYR'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, 3, NULL, CAST(1 AS bit), NULL, NULL, N''Default reseller repeat commission'', 3.0, NULL, ''2026-01-01T00:00:00.0000000+00:00'', NULL)');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CommissionType', N'CreatedAt', N'Currency', N'EffectiveFrom', N'EffectiveTo', N'EligibilityMonths', N'FixedAmount', N'IsActive', N'MaxQuantity', N'MinQuantity', N'Notes', N'Percentage', N'SalespersonId', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[CommissionRules]'))
        SET IDENTITY_INSERT [CommissionRules] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_SalesCommissions_MerchantId_CommissionType] ON [SalesCommissions] ([MerchantId], [CommissionType]) WHERE [MerchantId] IS NOT NULL AND [CommissionType] = ''ResellerAcquisitionBonus''');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    EXEC(N'ALTER TABLE [SalesCommissions] ADD CONSTRAINT [CK_SalesCommissions_SourceCommissionType] CHECK (([CommissionType] = ''MerchantOrderPercentage'' AND [SourceType] = ''MerchantOrder'') OR ([CommissionType] = ''DirectRetailPercentage'' AND [SourceType] = ''TagOrder'') OR ([CommissionType] IN (''ResellerAcquisitionBonus'',''ResellerRepeatPercentage'') AND [SourceType] = ''MerchantOrder''))');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    EXEC(N'ALTER TABLE [SalesCommissions] ADD CONSTRAINT [CK_SalesCommissions_SourceShape] CHECK (([SourceType] = ''MerchantOrder'' AND [MerchantId] IS NOT NULL AND [MerchantOrderId] IS NOT NULL AND [MerchantPaymentId] IS NOT NULL AND [TagOrderId] IS NULL) OR ([SourceType] = ''TagOrder'' AND [MerchantId] IS NULL AND [TagOrderId] IS NOT NULL AND [MerchantOrderId] IS NULL AND [MerchantPaymentId] IS NULL))');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    CREATE INDEX [IX_Merchants_AcquiredBySalespersonId] ON [Merchants] ([AcquiredBySalespersonId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_Merchants_FirstQualifyingMerchantOrderId] ON [Merchants] ([FirstQualifyingMerchantOrderId]) WHERE [FirstQualifyingMerchantOrderId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    CREATE INDEX [IX_Merchants_RepeatCommissionRuleIdSnapshot] ON [Merchants] ([RepeatCommissionRuleIdSnapshot]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    EXEC(N'ALTER TABLE [Merchants] ADD CONSTRAINT [CK_Merchants_AcquisitionActivationShape] CHECK (([FirstQualifyingMerchantOrderId] IS NULL AND [FirstQualifyingPaidOrderAt] IS NULL AND [RepeatCommissionPercentageSnapshot] IS NULL AND [RepeatCommissionEligibilityMonthsSnapshot] IS NULL AND [RepeatCommissionEligibleUntil] IS NULL AND [RepeatCommissionRuleIdSnapshot] IS NULL AND [RepeatCommissionRuleEffectiveFromSnapshot] IS NULL AND [AcquiredBySalespersonCodeSnapshot] IS NULL AND [AcquiredBySalespersonNameSnapshot] IS NULL) OR ([FirstQualifyingMerchantOrderId] IS NOT NULL AND [FirstQualifyingPaidOrderAt] IS NOT NULL AND [AcquiredBySalespersonId] IS NOT NULL AND [RepeatCommissionPercentageSnapshot] IS NOT NULL AND [RepeatCommissionEligibilityMonthsSnapshot] > 0 AND [RepeatCommissionEligibleUntil] > [FirstQualifyingPaidOrderAt] AND [RepeatCommissionRuleIdSnapshot] IS NOT NULL AND [RepeatCommissionRuleEffectiveFromSnapshot] IS NOT NULL AND [AcquiredBySalespersonCodeSnapshot] IS NOT NULL AND [AcquiredBySalespersonNameSnapshot] IS NOT NULL))');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    EXEC(N'ALTER TABLE [Merchants] ADD CONSTRAINT [CK_Merchants_AcquisitionAttribution] CHECK (([AcquiredBySalespersonId] IS NULL AND [AcquisitionAttributedAt] IS NULL) OR ([AcquiredBySalespersonId] IS NOT NULL AND [AcquisitionAttributedAt] IS NOT NULL))');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    EXEC(N'ALTER TABLE [Merchants] ADD CONSTRAINT [CK_Merchants_CommissionPlanShape] CHECK (([CommissionPlan] = ''LegacyPercentage'' AND [AcquiredBySalespersonId] IS NULL AND [FirstQualifyingMerchantOrderId] IS NULL) OR ([CommissionPlan] = ''AcquisitionAndRepeat''))');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CommissionRules_CommissionType_SalespersonId_EffectiveFrom_MinQuantity] ON [CommissionRules] ([CommissionType], [SalespersonId], [EffectiveFrom], [MinQuantity]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    EXEC(N'ALTER TABLE [CommissionRules] ADD CONSTRAINT [CK_CommissionRules_CommissionTypeShape] CHECK (([CommissionType] = ''DirectRetailPercentage'' AND [Percentage] IS NOT NULL AND [FixedAmount] IS NULL AND [EligibilityMonths] IS NULL) OR ([CommissionType] = ''ResellerAcquisitionBonus'' AND [Percentage] IS NULL AND [FixedAmount] IS NOT NULL AND [MinQuantity] IS NOT NULL AND [EligibilityMonths] IS NULL) OR ([CommissionType] = ''ResellerRepeatPercentage'' AND [Percentage] IS NOT NULL AND [FixedAmount] IS NULL AND [MinQuantity] IS NULL AND [MaxQuantity] IS NULL AND [EligibilityMonths] > 0))');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD CONSTRAINT [FK_Merchants_CommissionRules_RepeatCommissionRuleIdSnapshot] FOREIGN KEY ([RepeatCommissionRuleIdSnapshot]) REFERENCES [CommissionRules] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD CONSTRAINT [FK_Merchants_MerchantOrders_FirstQualifyingMerchantOrderId] FOREIGN KEY ([FirstQualifyingMerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [Merchants] ADD CONSTRAINT [FK_Merchants_Salespersons_AcquiredBySalespersonId] FOREIGN KEY ([AcquiredBySalespersonId]) REFERENCES [Salespersons] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    ALTER TABLE [SalesCommissions] ADD CONSTRAINT [FK_SalesCommissions_Merchants_MerchantId] FOREIGN KEY ([MerchantId]) REFERENCES [Merchants] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908060518_AddResellerAcquisitionAndRepeatCommission'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260908060518_AddResellerAcquisitionAndRepeatCommission', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908152551_AddSalesReportingIndexes'
)
BEGIN
    EXEC(N'CREATE INDEX [IX_TagOrders_SalespersonId_PaymentConfirmedAt] ON [TagOrders] ([SalespersonId], [PaymentConfirmedAt]) WHERE [SalespersonId] IS NOT NULL AND [PaymentConfirmedAt] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908152551_AddSalesReportingIndexes'
)
BEGIN
    EXEC(N'CREATE INDEX [IX_SalesCommissions_PaidAt] ON [SalesCommissions] ([PaidAt]) WHERE [PaidAt] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908152551_AddSalesReportingIndexes'
)
BEGIN
    EXEC(N'CREATE INDEX [IX_SalesCommissions_ReversedAt] ON [SalesCommissions] ([ReversedAt]) WHERE [ReversedAt] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908152551_AddSalesReportingIndexes'
)
BEGIN
    CREATE INDEX [IX_SalesCommissions_SalespersonId_CalculatedAt] ON [SalesCommissions] ([SalespersonId], [CalculatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908152551_AddSalesReportingIndexes'
)
BEGIN
    CREATE INDEX [IX_Merchants_AcquiredBySalespersonId_RepeatCommissionEligibleUntil] ON [Merchants] ([AcquiredBySalespersonId], [RepeatCommissionEligibleUntil]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908152551_AddSalesReportingIndexes'
)
BEGIN
    CREATE INDEX [IX_MerchantPayments_PaymentDate_MerchantOrderId] ON [MerchantPayments] ([PaymentDate], [MerchantOrderId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260908152551_AddSalesReportingIndexes'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260908152551_AddSalesReportingIndexes', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909013700_AddCommissionPayoutBatches'
)
BEGIN
    CREATE TABLE [CommissionPayouts] (
        [Id] uniqueidentifier NOT NULL,
        [PayoutNumber] nvarchar(40) NOT NULL,
        [SalespersonId] uniqueidentifier NOT NULL,
        [SalespersonCodeSnapshot] nvarchar(32) NOT NULL,
        [SalespersonNameSnapshot] nvarchar(160) NOT NULL,
        [Seller_BrandName] nvarchar(120) NOT NULL,
        [Seller_LegalBusinessName] nvarchar(200) NOT NULL,
        [Seller_BusinessRegistrationNumber] nvarchar(64) NOT NULL,
        [Seller_TaxIdentificationNumber] nvarchar(64) NULL,
        [Seller_SstRegistrationNumber] nvarchar(64) NULL,
        [Seller_AddressLine1] nvarchar(240) NOT NULL,
        [Seller_AddressLine2] nvarchar(240) NULL,
        [Seller_Postcode] nvarchar(16) NOT NULL,
        [Seller_City] nvarchar(120) NOT NULL,
        [Seller_State] nvarchar(120) NOT NULL,
        [Seller_Country] nvarchar(80) NOT NULL,
        [Seller_SupportEmail] nvarchar(254) NOT NULL,
        [Seller_BusinessPhone] nvarchar(32) NULL,
        [Seller_BusinessWebsite] nvarchar(200) NULL,
        [Seller_PaymentInstructions] nvarchar(2000) NULL,
        [Seller_BankAccountName] nvarchar(200) NULL,
        [Seller_BankName] nvarchar(120) NULL,
        [Seller_BankAccountNumber] nvarchar(64) NULL,
        [Seller_DuitNowDisplayName] nvarchar(120) NULL,
        [PeriodFrom] datetimeoffset NOT NULL,
        [PeriodToExclusive] datetimeoffset NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [PreparedAmount] decimal(18,2) NOT NULL,
        [Status] nvarchar(16) NOT NULL,
        [PreparedAt] datetimeoffset NOT NULL,
        [PreparedByAdminUserId] uniqueidentifier NOT NULL,
        [PaidAt] datetimeoffset NULL,
        [PaidByAdminUserId] uniqueidentifier NULL,
        [PaymentMethod] nvarchar(32) NULL,
        [PaymentReference] nvarchar(200) NULL,
        [Notes] nvarchar(2000) NULL,
        [CancelledAt] datetimeoffset NULL,
        [CancelledByAdminUserId] uniqueidentifier NULL,
        [CancellationReason] nvarchar(1000) NULL,
        [IdempotencyKey] nvarchar(80) NOT NULL,
        [RequestFingerprint] nvarchar(128) NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_CommissionPayouts] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_CommissionPayouts_Amount] CHECK ([PreparedAmount] >= 0),
        CONSTRAINT [CK_CommissionPayouts_Currency] CHECK ([Currency] = 'MYR'),
        CONSTRAINT [CK_CommissionPayouts_Period] CHECK ([PeriodToExclusive] > [PeriodFrom]),
        CONSTRAINT [CK_CommissionPayouts_StatusShape] CHECK (([Status] = 'Prepared' AND [PaidAt] IS NULL AND [PaidByAdminUserId] IS NULL AND [PaymentMethod] IS NULL AND [PaymentReference] IS NULL AND [CancelledAt] IS NULL AND [CancelledByAdminUserId] IS NULL AND [CancellationReason] IS NULL) OR ([Status] = 'Paid' AND [PaidAt] IS NOT NULL AND [PaidByAdminUserId] IS NOT NULL AND [PaymentMethod] IN ('BankTransfer','DuitNow','Cheque','Cash','Other') AND [PaymentReference] IS NOT NULL AND [CancelledAt] IS NULL AND [CancelledByAdminUserId] IS NULL AND [CancellationReason] IS NULL) OR ([Status] = 'Cancelled' AND [PaidAt] IS NULL AND [PaidByAdminUserId] IS NULL AND [PaymentMethod] IS NULL AND [PaymentReference] IS NULL AND [CancelledAt] IS NOT NULL AND [CancelledByAdminUserId] IS NOT NULL AND [CancellationReason] IS NOT NULL)),
        CONSTRAINT [FK_CommissionPayouts_AdminUsers_CancelledByAdminUserId] FOREIGN KEY ([CancelledByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CommissionPayouts_AdminUsers_PaidByAdminUserId] FOREIGN KEY ([PaidByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CommissionPayouts_AdminUsers_PreparedByAdminUserId] FOREIGN KEY ([PreparedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CommissionPayouts_Salespersons_SalespersonId] FOREIGN KEY ([SalespersonId]) REFERENCES [Salespersons] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909013700_AddCommissionPayoutBatches'
)
BEGIN
    CREATE TABLE [CommissionPayoutItems] (
        [Id] uniqueidentifier NOT NULL,
        [CommissionPayoutId] uniqueidentifier NOT NULL,
        [SalesCommissionId] uniqueidentifier NOT NULL,
        [SourceTypeSnapshot] nvarchar(32) NOT NULL,
        [CommissionTypeSnapshot] nvarchar(48) NOT NULL,
        [MerchantOrderIdSnapshot] uniqueidentifier NULL,
        [TagOrderIdSnapshot] uniqueidentifier NULL,
        [SourceOrderNumberSnapshot] nvarchar(64) NOT NULL,
        [CommissionBaseAmountSnapshot] decimal(18,2) NOT NULL,
        [CommissionAmountSnapshot] decimal(18,2) NOT NULL,
        [CommissionPercentageSnapshot] decimal(5,2) NULL,
        [CommissionFixedAmountSnapshot] decimal(18,2) NULL,
        [CurrencySnapshot] nvarchar(3) NOT NULL,
        [CalculatedAtSnapshot] datetimeoffset NOT NULL,
        [ReleasedAt] datetimeoffset NULL,
        [ReleasedByAdminUserId] uniqueidentifier NULL,
        [ReleaseReason] nvarchar(1000) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_CommissionPayoutItems] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_CommissionPayoutItems_Amounts] CHECK ([CommissionBaseAmountSnapshot] >= 0 AND [CommissionAmountSnapshot] >= 0),
        CONSTRAINT [CK_CommissionPayoutItems_Currency] CHECK ([CurrencySnapshot] = 'MYR'),
        CONSTRAINT [CK_CommissionPayoutItems_ReleaseShape] CHECK (([ReleasedAt] IS NULL AND [ReleasedByAdminUserId] IS NULL AND [ReleaseReason] IS NULL) OR ([ReleasedAt] IS NOT NULL AND [ReleasedByAdminUserId] IS NOT NULL AND [ReleaseReason] IS NOT NULL)),
        CONSTRAINT [CK_CommissionPayoutItems_SourceCommissionType] CHECK (([CommissionTypeSnapshot] = 'MerchantOrderPercentage' AND [SourceTypeSnapshot] = 'MerchantOrder') OR ([CommissionTypeSnapshot] = 'DirectRetailPercentage' AND [SourceTypeSnapshot] = 'TagOrder') OR ([CommissionTypeSnapshot] IN ('ResellerAcquisitionBonus','ResellerRepeatPercentage') AND [SourceTypeSnapshot] = 'MerchantOrder')),
        CONSTRAINT [CK_CommissionPayoutItems_SourceShape] CHECK (([SourceTypeSnapshot] = 'MerchantOrder' AND [MerchantOrderIdSnapshot] IS NOT NULL AND [TagOrderIdSnapshot] IS NULL) OR ([SourceTypeSnapshot] = 'TagOrder' AND [TagOrderIdSnapshot] IS NOT NULL AND [MerchantOrderIdSnapshot] IS NULL)),
        CONSTRAINT [CK_CommissionPayoutItems_ValueShape] CHECK (([CommissionPercentageSnapshot] BETWEEN 0 AND 100 AND [CommissionFixedAmountSnapshot] IS NULL) OR ([CommissionPercentageSnapshot] IS NULL AND [CommissionFixedAmountSnapshot] >= 0)),
        CONSTRAINT [FK_CommissionPayoutItems_AdminUsers_ReleasedByAdminUserId] FOREIGN KEY ([ReleasedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CommissionPayoutItems_CommissionPayouts_CommissionPayoutId] FOREIGN KEY ([CommissionPayoutId]) REFERENCES [CommissionPayouts] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CommissionPayoutItems_SalesCommissions_SalesCommissionId] FOREIGN KEY ([SalesCommissionId]) REFERENCES [SalesCommissions] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909013700_AddCommissionPayoutBatches'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CommissionPayoutItems_CommissionPayoutId_SalesCommissionId] ON [CommissionPayoutItems] ([CommissionPayoutId], [SalesCommissionId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909013700_AddCommissionPayoutBatches'
)
BEGIN
    CREATE INDEX [IX_CommissionPayoutItems_ReleasedByAdminUserId] ON [CommissionPayoutItems] ([ReleasedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909013700_AddCommissionPayoutBatches'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_CommissionPayoutItems_SalesCommissionId] ON [CommissionPayoutItems] ([SalesCommissionId]) WHERE [ReleasedAt] IS NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909013700_AddCommissionPayoutBatches'
)
BEGIN
    CREATE INDEX [IX_CommissionPayouts_CancelledByAdminUserId] ON [CommissionPayouts] ([CancelledByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909013700_AddCommissionPayoutBatches'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CommissionPayouts_IdempotencyKey] ON [CommissionPayouts] ([IdempotencyKey]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909013700_AddCommissionPayoutBatches'
)
BEGIN
    CREATE INDEX [IX_CommissionPayouts_PaidByAdminUserId] ON [CommissionPayouts] ([PaidByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909013700_AddCommissionPayoutBatches'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CommissionPayouts_PayoutNumber] ON [CommissionPayouts] ([PayoutNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909013700_AddCommissionPayoutBatches'
)
BEGIN
    CREATE INDEX [IX_CommissionPayouts_PeriodFrom_PeriodToExclusive] ON [CommissionPayouts] ([PeriodFrom], [PeriodToExclusive]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909013700_AddCommissionPayoutBatches'
)
BEGIN
    CREATE INDEX [IX_CommissionPayouts_PreparedByAdminUserId] ON [CommissionPayouts] ([PreparedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909013700_AddCommissionPayoutBatches'
)
BEGIN
    CREATE INDEX [IX_CommissionPayouts_SalespersonId_Status_PreparedAt] ON [CommissionPayouts] ([SalespersonId], [Status], [PreparedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909013700_AddCommissionPayoutBatches'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260909013700_AddCommissionPayoutBatches', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909162926_NarrowPetBreedLength'
)
BEGIN

    IF EXISTS (SELECT 1 FROM [Pets] WHERE LEN([Breed]) > 160)
    BEGIN
        THROW 51070, 'Pet breeds longer than 160 characters exist. Shorten them through an audited correction before narrowing the column.', 1;
    END;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909162926_NarrowPetBreedLength'
)
BEGIN
    DECLARE @var8 sysname;
    SELECT @var8 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[Pets]') AND [c].[name] = N'Breed');
    IF @var8 IS NOT NULL EXEC(N'ALTER TABLE [Pets] DROP CONSTRAINT [' + @var8 + '];');
    ALTER TABLE [Pets] ALTER COLUMN [Breed] nvarchar(160) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260909162926_NarrowPetBreedLength'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260909162926_NarrowPetBreedLength', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260911010449_AddSmartTagAssignmentVersion'
)
BEGIN
    ALTER TABLE [SmartTags] ADD [AssignmentVersion] int NOT NULL DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260911010449_AddSmartTagAssignmentVersion'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260911010449_AddSmartTagAssignmentVersion', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    ALTER TABLE [AdminUsers] ADD [DisabledByAdminUserId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    ALTER TABLE [AdminUsers] ADD [RowVersion] rowversion NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    CREATE TABLE [AdminRoles] (
        [Id] uniqueidentifier NOT NULL,
        [Code] nvarchar(64) NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [Description] nvarchar(600) NOT NULL,
        [IsSystemRole] bit NOT NULL,
        [GrantsAllCapabilities] bit NOT NULL,
        [SortOrder] int NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_AdminRoles] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    CREATE TABLE [AdminRoleCapabilities] (
        [Id] uniqueidentifier NOT NULL,
        [AdminRoleId] uniqueidentifier NOT NULL,
        [Capability] nvarchar(96) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_AdminRoleCapabilities] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AdminRoleCapabilities_AdminRoles_AdminRoleId] FOREIGN KEY ([AdminRoleId]) REFERENCES [AdminRoles] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    CREATE TABLE [AdminUserRoles] (
        [Id] uniqueidentifier NOT NULL,
        [AdminUserId] uniqueidentifier NOT NULL,
        [AdminRoleId] uniqueidentifier NOT NULL,
        [AssignedAt] datetimeoffset NOT NULL,
        [AssignedByAdminUserId] uniqueidentifier NULL,
        CONSTRAINT [PK_AdminUserRoles] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AdminUserRoles_AdminRoles_AdminRoleId] FOREIGN KEY ([AdminRoleId]) REFERENCES [AdminRoles] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_AdminUserRoles_AdminUsers_AdminUserId] FOREIGN KEY ([AdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_AdminUserRoles_AdminUsers_AssignedByAdminUserId] FOREIGN KEY ([AssignedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    CREATE INDEX [IX_AdminUsers_DisabledByAdminUserId] ON [AdminUsers] ([DisabledByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    CREATE UNIQUE INDEX [IX_AdminRoleCapabilities_AdminRoleId_Capability] ON [AdminRoleCapabilities] ([AdminRoleId], [Capability]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    CREATE INDEX [IX_AdminRoleCapabilities_Capability] ON [AdminRoleCapabilities] ([Capability]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    CREATE UNIQUE INDEX [IX_AdminRoles_Code] ON [AdminRoles] ([Code]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    CREATE INDEX [IX_AdminRoles_SortOrder] ON [AdminRoles] ([SortOrder]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    CREATE INDEX [IX_AdminUserRoles_AdminRoleId] ON [AdminUserRoles] ([AdminRoleId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    CREATE UNIQUE INDEX [IX_AdminUserRoles_AdminUserId_AdminRoleId] ON [AdminUserRoles] ([AdminUserId], [AdminRoleId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    CREATE INDEX [IX_AdminUserRoles_AssignedByAdminUserId] ON [AdminUserRoles] ([AssignedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    ALTER TABLE [AdminUsers] ADD CONSTRAINT [FK_AdminUsers_AdminUsers_DisabledByAdminUserId] FOREIGN KEY ([DisabledByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN

    IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'super-admin')
        INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
        VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d01', N'super-admin', N'Super Admin', N'Complete access to everything, including who else can use the Admin Portal. Only a Super Admin can grant or remove Super Admin access.', 1, 1, 10, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'administrator')
        INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
        VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'administrator', N'Administrator', N'Day-to-day running of the business across every operational area, plus commission accounting and payout preparation. Cannot release payouts, reverse commission, change commission rules, or change who has Admin Portal access.', 1, 0, 20, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'operations')
        INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
        VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'operations', N'Operations', N'Orders, shipping, inventory, Smart Tags, customer support information and business configuration, with visibility of sales performance. No commission accounting, payouts or access management.', 1, 0, 30, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'owner-support')
        INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
        VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'owner-support', N'Owner Support', N'Customer-facing operational work across orders, Smart Tags, owners and pets. No sales, commission, payout or access management.', 1, 0, 40, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'sales')
        INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
        VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'sales', N'Sales', N'Resellers, salespeople, referral credit, quotations and merchant orders, with visibility of commission earned. No stock creation, no payment approval, no payouts.', 1, 0, 50, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'marketing')
        INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
        VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'marketing', N'Marketing', N'Promotions, the sample pet experience, and campaign and referral reporting. No payment proofs, payouts, stock costs or access management.', 1, 0, 60, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'finance')
        INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
        VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'finance', N'Finance', N'Payment approval, invoices and receipts, commission accounting, payouts and financial reporting. No stock creation, Smart Tag operations or access management.', 1, 0, 70, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'support')
        INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
        VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'support', N'Support', N'Helping owners with their pets, Smart Tags and orders. No financial approval, no stock creation, no customer data downloads and no access management.', 1, 0, 80, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'auditor')
        INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
        VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'auditor', N'Read Only / Auditor', N'Can open every module and read what is there, including the activity history, but cannot change, approve or download anything.', 1, 0, 90, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());



    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'admin.users.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('97549ab8-911c-8e1a-5a65-703dd7c17fd7', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'admin.users.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'admin.roles.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('ef970da1-abb2-a211-4699-87dcd700906a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'admin.roles.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'audit_log.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('ae673b8b-0c06-6cab-80e0-4f41fcbdca38', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'audit_log.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'orders.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('cb04fcb5-7322-4ade-c6eb-a5b4a11041f1', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'orders.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'orders.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('83c57b92-a73c-870f-39ea-bcc2275cf410', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'orders.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'orders.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('778207e1-1be8-108f-8d5b-48a8c2f30433', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'orders.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'orders.shipping.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('c2ca8e52-4967-a9f4-c0da-e24308a3265c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'orders.shipping.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'orders.tags.assign')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('eddc0d70-bca8-8288-2315-5fd4d4826829', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'orders.tags.assign', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'payment_proofs.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('e42ca727-0208-8146-bac9-896f11d9baac', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'payment_proofs.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'payment_proofs.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('9f4529e3-9cb3-1cae-6e16-b1a0c53f3a8f', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'payment_proofs.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'payment_proofs.review')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('759c62fb-40a7-5a01-128b-950b2e13dd8d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'payment_proofs.review', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'inventory.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('44865fe0-08be-932f-2970-019f9791bd67', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'inventory.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'inventory.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('28f04898-65d7-7e39-a037-0afe07d64f95', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'inventory.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'inventory.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('e3c4d7a8-0777-624c-e082-151d435156ff', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'inventory.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'inventory.generate')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('60d2bfe0-3e95-3495-ec62-65d4ca3075a9', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'inventory.generate', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'inventory.receipts.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('76ad1c9d-d782-554b-e837-688ee171953d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'inventory.receipts.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'inventory.costs.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('dc61d91b-09c9-15f2-9614-f1242acdfa82', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'inventory.costs.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'smart_tags.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('8e536b76-ec39-a754-c55f-25a24513d60b', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'smart_tags.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'smart_tags.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('ab8276c2-8489-42d8-c057-1b0c00ade849', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'smart_tags.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'smart_tags.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('569a2602-6a15-9746-98f9-fe85938ecb05', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'smart_tags.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'smart_tags.assign')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('d522d3b6-a1b5-f42b-f325-fdc0ed07fe43', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'smart_tags.assign', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'smart_tags.transfer')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('25a54be5-fa85-59d8-7533-1947345bce14', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'smart_tags.transfer', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'catalog.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('fd4ca2d1-a0f4-5f8c-f5fd-cc8465f3e0af', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'catalog.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'catalog.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('1c56b178-ec7a-c420-4074-81aa36cf13e0', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'catalog.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'owners.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('614ffe3a-bda8-45ca-28c3-6dc497b55b6a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'owners.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'owners.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('89cb23f2-5468-fcd9-0539-bdfc35b287a4', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'owners.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'owners.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('42debc09-6590-64fb-3875-0d2ffcea0bf3', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'owners.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'pets.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('c616b59a-cd3d-0712-2faa-0e8ea8b68049', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'pets.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'pets.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('f2b0947b-ba9d-f397-b50c-355efcd69140', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'pets.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'pets.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('d239f8f2-948b-86ae-bb63-dc370eea40e4', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'pets.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'sales.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('a9223453-40dd-34a9-82a0-00a2680dd385', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'sales.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'sales.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('379d2283-a44d-b70d-721d-c8aedcc30cd2', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'sales.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'merchant_orders.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('0ec5ec94-373e-444b-734f-ac8f3b2f0832', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'merchant_orders.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'merchant_orders.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7f83fd5f-c1da-8fe0-9b35-65ab46b04333', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'merchant_orders.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'merchant_orders.fulfil')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7768e62f-79b0-bdd4-1039-701f1e93385b', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'merchant_orders.fulfil', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'merchant_documents.send')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('5b10e07a-b6cf-a8bf-15b2-12678f1240ee', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'merchant_documents.send', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'merchant_invoices.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('25c5d099-f880-c543-4d58-8c47ee86016e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'merchant_invoices.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'merchant_invoices.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('4789b0f7-909e-bdc7-8075-83a5b858f835', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'merchant_invoices.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'merchant_invoices.record_payment')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('bd88a79c-0c6e-f128-afb0-4cb0633ea442', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'merchant_invoices.record_payment', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'sales_commissions.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('765d2359-5779-fa22-3896-2a37fd03d6d7', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'sales_commissions.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'payouts.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('d08dbe58-dc47-31b6-a7af-fc919b8f242f', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'payouts.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'payouts.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('41fbc6c8-bb1e-af5d-02f2-dd172c1a8650', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'payouts.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'marketing.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('ba4d8fd6-bf6f-e0b1-c03b-602d9f0e263e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'marketing.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'marketing.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('8e8ba510-b7ea-3245-d27d-44ea655bbe14', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'marketing.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'plans.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('84e7b4f1-00e8-3a2d-44a9-c4efbd83ecf7', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'plans.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'settings.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('5247ef90-07aa-1127-a9e8-6e34e00c407c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'settings.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'settings.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('dcfdeac6-8a67-5ead-6f96-3ff71a848b9a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'settings.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'email_templates.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('37f4821e-f78a-ff94-f1c2-b41d181efe3f', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'email_templates.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'email_templates.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('00d93162-6e15-f9de-cacc-e78ff34dfee5', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'email_templates.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'sample_experience.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7b5cdc66-196f-fd2d-879e-a890a88ee744', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'sample_experience.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'sample_experience.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('62ec3dce-6465-adca-bf8a-d7cd074bbb7f', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'sample_experience.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'operational_status.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('5d0c0b2e-f2b4-f710-eb87-290498bcbc30', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'operational_status.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'admin.users.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('70ee55db-36be-d762-ca41-ac3f2ff350bf', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'admin.users.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'admin.roles.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('6dfb8ce9-ddc9-a123-7b3b-c0c23875509e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'admin.roles.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'audit_log.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('730c66b6-7bac-0ad9-44e1-4d0ed3a2cce8', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'audit_log.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'orders.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('9101f3de-3e12-4b41-97e8-08829e2d3425', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'orders.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'orders.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('01e6f65c-1f30-aec3-858e-73305a4ee954', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'orders.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'orders.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('bff91a29-37c4-75a0-8736-5baad505b564', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'orders.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'orders.shipping.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('98d78432-3956-b951-ca8d-9a0f0e2fbcec', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'orders.shipping.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'orders.tags.assign')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('235b4618-6fa0-78f8-78a8-ebfb21817250', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'orders.tags.assign', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'payment_proofs.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('14c8643e-d142-ae6f-b700-2a46f76488e3', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'payment_proofs.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'payment_proofs.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('d18396fc-0167-d977-7a8d-e71af791b2bf', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'payment_proofs.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'payment_proofs.review')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('30f69a7c-4972-695a-d4fe-af307a3a4e89', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'payment_proofs.review', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'inventory.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('4221fe3d-8ae7-27e4-23ce-f9b63f18bb3d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'inventory.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'inventory.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7f48fdc8-5940-f278-3f7a-dd26463e6b71', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'inventory.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'inventory.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('581230f8-9204-c719-e3f3-e319a012c9f1', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'inventory.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'inventory.generate')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('4fc89c54-80c6-2ed0-8e6c-c97d2b070607', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'inventory.generate', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'inventory.receipts.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('798f72da-caba-225e-ddc0-b2899c377afa', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'inventory.receipts.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'inventory.costs.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('c27eb3fc-d02b-3b3e-3bdd-f165ff7fa685', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'inventory.costs.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'smart_tags.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('c89d147f-5c77-4a6c-3cf8-f1f85b03298a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'smart_tags.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'smart_tags.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('db888d35-c938-7035-33f0-176150dfd4af', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'smart_tags.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'smart_tags.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('03918593-e15d-5c3a-9038-70d420ba8c28', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'smart_tags.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'smart_tags.assign')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('600331b5-81e4-683d-55f0-9f7d1f6c622b', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'smart_tags.assign', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'smart_tags.transfer')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('f6ec4934-1a27-c760-3460-c885caa7de03', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'smart_tags.transfer', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'catalog.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('1609dbae-bf40-9d7d-8135-4a711c596224', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'catalog.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'catalog.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('21e6d739-c65c-9f0d-f463-f9736e75e013', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'catalog.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'owners.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('21030b60-75a0-7ebe-6155-f9f602290156', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'owners.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'owners.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('5db0e6fd-bdb5-ad3c-21b1-c925208684ca', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'owners.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'owners.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('e711a961-f074-eb93-94ab-6c94c7bde732', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'owners.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'pets.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('325d00f9-78d6-7950-7934-bd09e277f71c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'pets.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'pets.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('9e0140b2-ed14-0e79-c779-077417ad7220', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'pets.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'pets.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7af9f400-7c31-5671-9105-c71c1458d2f1', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'pets.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'sales.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('fd180002-90df-d015-4abb-1e0e33d6166d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'sales.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'merchant_orders.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('cf5c75e8-4310-68b3-35f6-54644236d290', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'merchant_orders.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'merchant_orders.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('73b2cf31-df2e-6628-aec6-d7ebb02ef044', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'merchant_orders.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'merchant_orders.fulfil')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('d4efb5ac-c1e9-107b-bdd1-b1127485e151', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'merchant_orders.fulfil', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'merchant_documents.send')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('f82b3495-28b7-cc95-7ade-1216c264837d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'merchant_documents.send', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'merchant_invoices.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('d7bff39b-dc83-c85d-dd87-613e5e4131df', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'merchant_invoices.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'merchant_invoices.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('a0f00f83-032c-a6bd-f894-8db3f70e2e60', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'merchant_invoices.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'marketing.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('1cec2982-24f1-4230-5a71-1fdf033bda99', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'marketing.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'marketing.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('0da986a0-d827-d7c6-510f-407359878884', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'marketing.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'plans.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('1fbf200d-9441-4e94-533f-edfd137eb97b', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'plans.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'settings.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('14d185e4-4297-8c9b-e04b-863330bd6d5d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'settings.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'settings.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('39310b50-0cba-d341-a024-29183b28caf0', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'settings.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'email_templates.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('f0919e4d-2eda-e326-5741-c845e2ef4e8a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'email_templates.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'email_templates.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('1ae7eb46-a9bb-ea9e-0522-7892a76ebc3a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'email_templates.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'sample_experience.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('701d5a57-6bae-d3eb-f210-509a4ae9d715', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'sample_experience.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'sample_experience.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('b866c255-035e-785c-2c51-af10d8b01d20', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'sample_experience.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'operational_status.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('d3782e37-0ad3-4823-f9ac-a715a0a02480', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'operational_status.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'admin.users.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7a3dc534-8bbf-fcfc-b039-907f02159a09', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'admin.users.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'admin.roles.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('5ac4e5c1-2784-dfe9-8e70-8529b0411317', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'admin.roles.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'audit_log.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('3aa02edb-557b-bb87-8050-b2fc81941d79', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'audit_log.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'orders.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('be1a787c-d7f4-8fc5-7758-5ffe66845889', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'orders.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'orders.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('86d61a43-d6a7-9361-ee85-5334f6ea4449', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'orders.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'orders.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('8970ed95-ba50-24f7-756c-57f2a83f95cc', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'orders.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'orders.shipping.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('17603598-94be-c0b8-3e96-e3118f51cbc7', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'orders.shipping.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'orders.tags.assign')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('75f496cd-4b54-5aa4-2d99-c893b7e5d89d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'orders.tags.assign', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'payment_proofs.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('d8f59d8e-cf37-bbf9-2203-b34acbbbf91b', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'payment_proofs.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'payment_proofs.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7e8fd76c-845e-128e-72cb-e591d22f286e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'payment_proofs.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'payment_proofs.review')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('9b711d66-778b-b502-b1dc-c0c5debf0ef6', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'payment_proofs.review', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'inventory.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('f85b4188-4389-2d5c-49d0-c5df95bfaca1', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'inventory.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'inventory.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('abced24a-c26f-4b09-bd4d-ee58133cc8a9', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'inventory.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'inventory.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('d4a1ce42-30b2-a1ce-0fe6-e510eec5df88', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'inventory.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'inventory.generate')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('ef764750-3750-ba24-ccc7-4e7701a1ea81', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'inventory.generate', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'inventory.receipts.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('709c77af-0469-18d2-f9ea-81c7e0c02404', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'inventory.receipts.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'inventory.costs.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('5960c9b5-b631-bd56-fe92-169f8d2c3343', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'inventory.costs.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'smart_tags.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('bd786928-1474-f824-bef4-818ef1cc0c76', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'smart_tags.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'smart_tags.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('04007f6c-98ea-4096-02b5-9182827debdc', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'smart_tags.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'smart_tags.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('eebda78d-0bf5-5ddb-a010-7691836677dd', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'smart_tags.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'smart_tags.assign')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7742fd62-4f31-391b-4a80-e1e94cad3030', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'smart_tags.assign', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'smart_tags.transfer')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('69e8cebc-ccaf-6bb1-3091-6f22cd7d83f7', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'smart_tags.transfer', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'catalog.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('4a47bb50-ece7-ebf0-11f9-f1ebe0238bff', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'catalog.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'catalog.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('803e5c40-3a64-b38d-8297-d6e2b8043180', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'catalog.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'owners.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('20451e9d-3838-55d9-dc16-3ef6910656c0', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'owners.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'owners.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('ba2788da-3bed-da5b-b3b8-3cbba9ad8b76', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'owners.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'owners.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('e94c7f03-fdfd-e47a-3ea8-ef14e8a3ecd5', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'owners.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'pets.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('512cd76d-a30e-9074-8691-8dc1da2ec052', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'pets.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'pets.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('67eb5a04-8826-cc19-6a81-5f411226c028', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'pets.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'pets.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('b7870002-8c3b-f3d4-d3f3-478e48642325', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'pets.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'merchant_orders.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('541f8fc0-c4f2-8c7a-73b6-35173b2fa2da', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'merchant_orders.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'merchant_orders.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('6f181ab5-e4e5-6aa5-dcee-359db4fd6c81', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'merchant_orders.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'merchant_orders.fulfil')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('ef1cf1fb-f3f4-c8b4-975c-e594485b6f7d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'merchant_orders.fulfil', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'merchant_documents.send')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('025d6c9c-555b-d27e-0cc3-3a06e8393750', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'merchant_documents.send', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'merchant_invoices.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('78f9383b-250d-81bf-1558-dc8611d9e52e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'merchant_invoices.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'merchant_invoices.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('f853e68e-a198-4d0e-7462-8d155f0c958e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'merchant_invoices.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'marketing.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('1b9f2c9a-beca-5b1a-abbe-1366944477cf', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'marketing.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'marketing.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('37236806-a1c6-373c-1cd4-f475c03f3254', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'marketing.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'plans.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('ff1a68c1-f451-318c-4259-76111ada6e4c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'plans.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'settings.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('71447110-9947-16d0-ec19-dccf7d14e2ea', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'settings.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'settings.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7d798fae-5f91-afa0-4ca7-0a61fe2ffc59', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'settings.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'email_templates.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('66373682-4536-8cd2-a4ac-3cbf1e2b7795', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'email_templates.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'email_templates.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('59729b88-434d-d30b-897a-cc16331a3c44', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'email_templates.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'sample_experience.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('538021ed-7bee-cda8-778c-1e7faca07862', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'sample_experience.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'sample_experience.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('c4435ed7-8129-cc78-b245-a1f08f83414c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'sample_experience.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'operational_status.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7283b0d0-ce30-3998-060d-b5233b55b522', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'operational_status.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'orders.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('68f403c9-7852-e27b-21c7-52c08b0dc93b', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'orders.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'catalog.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('f56ba33b-3c93-0265-571e-e74ca03aaf08', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'catalog.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'owners.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('f6b11200-47f1-e23e-8567-2424961188eb', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'owners.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'sales.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('53a3fcc5-f2d2-7d68-42c6-265a4d06762c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'sales.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'sales.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('a40c7334-4fdb-2cb4-ca6b-dd04e822a514', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'sales.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'merchant_orders.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('e8199546-8f86-07ca-3920-e7512e2e92eb', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'merchant_orders.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'merchant_orders.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('9d30952c-e323-85f7-c559-31c44caf226a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'merchant_orders.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'merchant_documents.send')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('632128aa-5ff5-c118-a8bc-11a01194facf', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'merchant_documents.send', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'merchant_invoices.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('f4c355a5-d292-bc0e-7265-f5fa20290c49', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'merchant_invoices.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'sales_commissions.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('ac091adc-d497-d62e-09df-50dee0bf66a7', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'sales_commissions.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'plans.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('3b5fd63f-ccb6-0c46-89c6-789f25249500', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'plans.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND Capability = N'catalog.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('ec406f8b-b6eb-2fa8-ce7b-c0f9f0e493ed', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'catalog.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND Capability = N'sales.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7b73dbaf-eaf0-2ea7-007b-322079cb2360', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'sales.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND Capability = N'marketing.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('be2cf51b-fa88-bbc8-b11f-16da7ceeeee2', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'marketing.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND Capability = N'marketing.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('a1a80aea-b6c0-89bb-0b7d-b34f06bfbed3', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'marketing.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND Capability = N'plans.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('6f206a44-a8df-1e3b-dff2-8783bbfc12fa', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'plans.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND Capability = N'sample_experience.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('66c88b74-bd08-108b-5e44-9b9c4dbb9086', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'sample_experience.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND Capability = N'sample_experience.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('f2a82974-7ec6-5200-9388-ac9a3575267a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'sample_experience.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'audit_log.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('a954be86-f8cd-2188-7faa-520c8fdff5d3', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'audit_log.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'orders.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('2aafa96f-f2c4-6e98-cb72-3129dd4887d4', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'orders.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'orders.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('65f6325a-868e-2826-f584-6df02bc457c8', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'orders.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'payment_proofs.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('4ac83038-d3ae-2f39-f20e-135383b2745e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'payment_proofs.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'payment_proofs.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('a8f2d956-0d05-65ad-2341-84943920e6c5', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'payment_proofs.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'payment_proofs.review')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('8ad05257-695e-8159-c3a1-f0eab83a3872', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'payment_proofs.review', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'inventory.costs.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('6dd360cc-9fbf-7c40-2f14-016e17ef380d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'inventory.costs.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'catalog.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('2c342780-caa3-1c68-0e2a-b9837997f96d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'catalog.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'sales.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('3f48d11c-235e-53ec-391d-d9e857de0199', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'sales.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'merchant_orders.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7d9168b9-bed5-177a-d6a1-7fcfc5c00e97', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'merchant_orders.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'merchant_documents.send')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('4b85a0cc-dc20-57cb-d3fd-dcf49104940d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'merchant_documents.send', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'merchant_invoices.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('86617d5a-eb94-a6cd-f9be-1db7f63e100e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'merchant_invoices.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'merchant_invoices.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('79c50ba0-2156-513b-2db0-f2bb11a768f0', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'merchant_invoices.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'merchant_invoices.record_payment')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('84c89695-0017-af2b-e096-c67e807846ab', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'merchant_invoices.record_payment', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'sales_commissions.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('8ceb81a4-1698-f6ec-6bed-1d8565f81741', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'sales_commissions.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'sales_commissions.reverse')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('28864159-d7a0-f7bc-80cc-71f0e427d7ff', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'sales_commissions.reverse', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'sales_commissions.rules.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('d89192fb-cc99-fa51-35e2-5a92cff5bfc1', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'sales_commissions.rules.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'payouts.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('b535331b-ff1b-9c49-4d80-31a6bca1a130', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'payouts.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'payouts.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('12ee6285-b40a-c6da-27de-1548f2e52c59', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'payouts.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'payouts.settle')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('62cce0f6-214a-107f-de3c-a2e84e287687', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'payouts.settle', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'plans.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('b72a8b79-1237-6d68-2f5a-9fd31047ef99', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'plans.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'orders.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('e1df9f74-b78c-4d6b-7b20-be20fd83d5b6', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'orders.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'payment_proofs.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('730b0818-7b0c-4ec1-42e3-a6be27f7b2ab', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'payment_proofs.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'smart_tags.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('26de3449-9e67-8285-7f1b-a1c08a140592', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'smart_tags.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'smart_tags.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('d93e4085-16e0-cb8f-38f0-94b3155f2899', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'smart_tags.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'smart_tags.assign')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('b5a97469-15e7-6fd0-4726-c7a5e4503a5a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'smart_tags.assign', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'catalog.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('fe5da8d9-511a-05f9-2522-a33fbb67bcc6', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'catalog.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'owners.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('0098bd87-54c0-8435-5bb6-715c237e4409', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'owners.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'owners.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('9fd53350-ef5c-02b2-d098-c8943aca721e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'owners.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'pets.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('087142c6-254e-575a-3bd4-2ce55c00c177', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'pets.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'pets.manage')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7d6395d4-865f-b37a-3457-1ddbeeda7a34', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'pets.manage', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'plans.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('2041fa5a-0443-78a9-c833-78c2a0a1fa78', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'plans.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'admin.users.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('f4e23a87-4df3-2ce1-f059-37c945f97a10', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'admin.users.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'admin.roles.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('b5ce351b-9b43-f954-d8a7-db6037f1537c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'admin.roles.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'audit_log.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('1f49f70b-b729-5b93-5dad-26f4f263fbed', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'audit_log.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'orders.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('860671b1-68e6-5a22-a8b8-34cc57000f8f', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'orders.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'payment_proofs.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('30ecae6f-29b3-bab7-104c-ba6436392609', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'payment_proofs.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'inventory.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7fb114ea-2386-21ca-aedb-fb35905e600e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'inventory.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'inventory.costs.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('05ca9ed7-de50-4e18-0b4d-6309cf21b2ed', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'inventory.costs.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'smart_tags.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('7595942e-56da-741b-dbdc-b99a90c60961', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'smart_tags.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'catalog.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('13818fc5-92be-6a14-0e14-6f2e0e961488', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'catalog.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'owners.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('2cb26963-13d4-8a53-37bc-d94c3c2a5037', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'owners.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'pets.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('cc9adf18-f137-2f01-627d-e3da43c56b06', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'pets.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'sales.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('0e700e23-5661-7442-91f1-487f448d3249', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'sales.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'merchant_orders.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('771d83e7-2566-918b-ee97-9a6e89623aff', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'merchant_orders.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'merchant_invoices.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('c1db8ae3-598d-f41b-a90d-54d2ab391ac7', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'merchant_invoices.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'sales_commissions.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('3c4d3842-b4dd-a246-0ca2-9c34dc4f6720', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'sales_commissions.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'payouts.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('51adde93-ad7a-68be-dbf8-318efb5a5e7c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'payouts.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'marketing.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('a4c3d2d8-407f-bfdd-f7d0-3a5730896f9a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'marketing.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'plans.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('8b555700-e564-87c9-a9f3-7ce188ebf5a6', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'plans.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'settings.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('4293d7ef-c1bc-af98-bfcf-9e3929e3b726', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'settings.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'email_templates.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('5789e86e-50ce-b498-736d-87ff8c24adc9', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'email_templates.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'sample_experience.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('784f833c-e9e0-eaeb-950f-ae92cf2f3f79', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'sample_experience.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'operational_status.view')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('b2625547-819e-4de9-8992-919e614651a5', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'operational_status.view', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'sales_commissions.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('645219df-448c-4103-8800-1e50d3c13bf2', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'sales_commissions.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'sales_commissions.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('40114451-6cdc-457e-959a-537f61daa29e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'sales_commissions.export', SYSDATETIMEOFFSET());

    IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'sales_commissions.export')
        INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
        VALUES ('b34cd402-bcef-4b32-8e3b-8d81d0961d6c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'sales_commissions.export', SYSDATETIMEOFFSET());



    -- Move every existing administrator onto the built-in role that matches the
    -- single role they already held. Only administrators with no role at all are
    -- touched, so re-running never overwrites a deliberate assignment.
    INSERT INTO AdminUserRoles (Id, AdminUserId, AdminRoleId, AssignedAt, AssignedByAdminUserId)
    SELECT NEWID(), a.Id, r.Id, SYSDATETIMEOFFSET(), NULL
    FROM AdminUsers a
    INNER JOIN AdminRoles r ON r.Code = CASE a.Role
        WHEN 'SuperAdmin' THEN 'super-admin'
        WHEN 'Admin' THEN 'administrator'
        WHEN 'Operations' THEN 'operations'
        ELSE 'owner-support'
    END
    WHERE NOT EXISTS (SELECT 1 FROM AdminUserRoles x WHERE x.AdminUserId = a.Id);

END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914061355_AddAdminAccessManagement'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260914061355_AddAdminAccessManagement', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914132244_CorrectBuiltInRoleCapabilityDefaults'
)
BEGIN
    DELETE FROM [AdminRoleCapabilities]
    WHERE [Id] = '7b73dbaf-eaf0-2ea7-007b-322079cb2360'
      AND [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06'
      AND [Capability] = N'sales.view';

    DELETE FROM [AdminRoleCapabilities]
    WHERE [Id] = '28864159-d7a0-f7bc-80cc-71f0e427d7ff'
      AND [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07'
      AND [Capability] = N'sales_commissions.reverse';

    DELETE FROM [AdminRoleCapabilities]
    WHERE [Id] = 'd89192fb-cc99-fa51-35e2-5a92cff5bfc1'
      AND [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07'
      AND [Capability] = N'sales_commissions.rules.manage';

    DELETE FROM [AdminRoleCapabilities]
    WHERE [Id] = '62cce0f6-214a-107f-de3c-a2e84e287687'
      AND [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07'
      AND [Capability] = N'payouts.settle';

    UPDATE [AdminRoles]
    SET [Description] = N'Promotions, product and plan visibility, and the sample pet experience. No broad sales data, payment proofs, payouts, stock costs or access management.',
        [UpdatedAt] = SYSDATETIMEOFFSET()
    WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06'
      AND [Code] = N'marketing';

    UPDATE [AdminRoles]
    SET [Description] = N'Payment approval, invoices and receipts, commission accounting, payout preparation and financial reporting. No payout settlement, commission reversal or rule changes.',
        [UpdatedAt] = SYSDATETIMEOFFSET()
    WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07'
      AND [Code] = N'finance';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914132244_CorrectBuiltInRoleCapabilityDefaults'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260914132244_CorrectBuiltInRoleCapabilityDefaults', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    EXEC sp_rename N'[PlanLimits].[MaxMemoriesPerPet]', N'MaxPrivateMemoriesPerPet', N'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    ALTER TABLE [MediaFiles] ADD [DerivativeStatus] nvarchar(32) NOT NULL DEFAULT N'NotApplicable';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    CREATE TABLE [OwnerHandleHistories] (
        [Id] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [Handle] nvarchar(30) NOT NULL,
        [NormalizedHandle] nvarchar(30) NOT NULL,
        [ChangedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_OwnerHandleHistories] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_OwnerHandleHistories_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    CREATE TABLE [OwnerHandleReservations] (
        [Id] uniqueidentifier NOT NULL,
        [NormalizedHandle] nvarchar(30) NOT NULL,
        [Reason] nvarchar(32) NOT NULL,
        [HeldUntil] datetimeoffset NULL,
        [PreviousUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_OwnerHandleReservations] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_OwnerHandleReservations_Users_PreviousUserId] FOREIGN KEY ([PreviousUserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    CREATE TABLE [OwnerSocialProfiles] (
        [Id] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [Handle] nvarchar(30) NULL,
        [NormalizedHandle] nvarchar(30) NULL,
        [DisplayName] nvarchar(60) NULL,
        [NormalizedDisplayName] nvarchar(60) NULL,
        [Bio] nvarchar(300) NULL,
        [AvatarMediaFileId] uniqueidentifier NULL,
        [GeneralArea] nvarchar(80) NULL,
        [IsSocialEnabled] bit NOT NULL DEFAULT CAST(0 AS bit),
        [IsDiscoverable] bit NOT NULL DEFAULT CAST(0 AS bit),
        [AllowFollowers] bit NOT NULL DEFAULT CAST(1 AS bit),
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_OwnerSocialProfiles] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_OwnerSocialProfiles_MediaFiles_AvatarMediaFileId] FOREIGN KEY ([AvatarMediaFileId]) REFERENCES [MediaFiles] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_OwnerSocialProfiles_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CreatedAt', N'HeldUntil', N'NormalizedHandle', N'PreviousUserId', N'Reason', N'UpdatedAt') AND [object_id] = OBJECT_ID(N'[OwnerHandleReservations]'))
        SET IDENTITY_INSERT [OwnerHandleReservations] ON;
    EXEC(N'INSERT INTO [OwnerHandleReservations] ([Id], [CreatedAt], [HeldUntil], [NormalizedHandle], [PreviousUserId], [Reason], [UpdatedAt])
    VALUES (''0271589d-5338-00a4-39e8-061ee3358513'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''mod'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''0512c195-6fea-07ea-4277-c0a1fe0002c3'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''lostpet'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''09b8c4f4-f6be-da69-dc7b-f1ee55fcf88f'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''activate'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''0e5e6a7e-82b2-a4e9-8746-b3d91b4260d8'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''terms'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''109f5c4b-346e-747c-c431-a69ecb511772'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''sitemap'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''10b995ec-e8a9-da7e-2b2c-3dd02270f9fb'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''sales'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''10cb1ee8-a12b-437d-2d8d-95d8cf154433'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''assets'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''1726a5ea-4133-fb82-a758-739a99799f26'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''well-known'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''209daa4e-5476-53ca-cd74-41ac43fe2dba'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''payments'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''2295da6e-5182-c511-c499-d51329b4ed48'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''customercare'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''238fdbf5-6cbd-9a8e-aee5-22bede225714'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''records'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''23c14044-0d9b-ca5d-8919-9d771ef2d5ff'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''pet'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''284cd0f3-fe6d-0d6d-9fbd-5e23f3fb3a9a'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''how-it-works'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''2c6f5ca4-e167-0b7c-c3a8-39d3abd149a6'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''pets'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''2e808712-a647-2d47-d88b-88bb53907037'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''pricing'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''30bcdc25-1c2d-66ed-2ccf-b37172438b90'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''no-reply'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''326e34ff-140a-20cc-fc96-a6f96ac931b1'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''help'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''34b304a1-dea5-2f81-72e3-9c833f80c9b6'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''safety'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''34ccac4b-435b-f04e-3732-02259dc3ee51'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''orders'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''36242f60-af9e-6f56-ec7d-30ff91adfa7d'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''postmaster'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''3a2b1d90-3e11-9051-d026-72f4c7741b7b'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''linko'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''41d1e309-6019-0485-1ce4-53035a6d1f00'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''pet-profile'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''489a2f3e-37db-48d5-0a12-f86cf4faf252'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''administrator'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''48d7cbfb-defd-1758-2afb-47067e1d9b3f'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''js'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''4fe52dbe-160f-654c-017a-3289afa049bb'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''noreply'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''50311f6d-e447-a604-ac00-9d7463406212'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''privacy'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''503faeb3-1b07-f197-ae00-6930700fb5e2'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''root'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''5132407d-b24f-2f10-dca4-855f3452d2fb'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''static'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''519f1400-ee83-d2d6-bad4-9378c39b2591'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''smarttag'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''545cb3ad-3a1b-7bd3-fb79-afd29fa856a7'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''admin'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''58ca49ec-94ae-9c51-d133-2e90b77691ec'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''support'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''58de5bd4-2c5f-6660-8ed7-8cd3e1b46f5c'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''finance'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''641b6b2d-4856-889a-caff-ac2b1f5e3aa5'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''logout'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''69338807-e51b-b86c-2985-131208ddc29e'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''mypetlinksupport'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''6a00f6e3-cba5-a9d7-5a91-5dd277ad7002'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''p'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''6cd6999a-b3fc-d6c7-f6e7-9df4c60e8372'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''q'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''7580fb1c-e3ea-c9cb-5a72-3a200ba46637'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''team'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''7a405efb-a121-0847-3202-c9215a8c81e3'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''login'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''7b01b92b-8606-6079-def6-c9942c1b76c2'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''security'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''7e349a4c-33e7-2b34-45f2-267c1e58c162'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''moments'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''814bbd17-61a9-ee50-fe78-864a61e110e1'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''lost-pet'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''81be9a12-d469-7369-3367-1574cd9fc2ac'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''n'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00'');
    INSERT INTO [OwnerHandleReservations] ([Id], [CreatedAt], [HeldUntil], [NormalizedHandle], [PreviousUserId], [Reason], [UpdatedAt])
    VALUES (''86b9a96d-c959-eb5c-046f-baee3a244792'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''auth'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''93be8719-1902-ba1d-81b6-aec2f157d71f'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''images'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''979aff23-c835-e788-894e-b1accc077d34'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''helpdesk'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''9cd694e3-9165-fca4-72f2-ca22045e5cb3'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''order'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''9d06752d-ca9a-3599-425c-6cec347aca35'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''u'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''9e2ea183-66b9-dd66-b10f-472f55471ef9'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''tags'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''a29ae0da-cb3a-0d6b-d577-c5c558ce4fae'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''where-to-buy'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''ac6cc967-9887-ac14-7726-2c1e3b555df9'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''img'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''add271f3-7d10-33c0-fe8d-cd60074c7556'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''mypetlinkofficial'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''af6c1e55-4312-b5c6-b43d-1bfe8447da25'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''sample'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''b16d45f8-a67d-a46d-98ff-300b6ea4658d'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''info'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''b258e716-975a-e86e-6b25-285c2395b218'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''moderator'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''b42d4c29-eb66-658f-99eb-8ce3ca66791f'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''favicon'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''b4e5c218-3834-c8f2-0d98-d5f660a553d4'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''my-pet-link'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''b519de8e-76d7-2e59-37bd-1581813d3145'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''webmaster'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''b873b8d2-720e-fdaa-6e8a-25575dfdd78c'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''mypetlinkhelp'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''b913682c-6fa4-11a3-6a22-14be78ba4af0'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''register'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''bfbaff0e-5316-e937-8803-7e81bfacbd44'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''media'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''c1de1034-b882-54a9-bc7c-3bce07fe77ad'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''fonts'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''c350890a-a3ff-0007-7fd1-4d664e56d61a'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''robots'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''c6a4ca80-272d-3489-cb98-149a53bd0b01'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''mypetlink'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''d1e8ad92-a5f6-ee53-ae50-467a66da7174'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''staff'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''d2e2adaa-07ef-1018-ceca-d42858ac768e'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''dashboard'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''d3671d27-0ec3-8b4e-b8fc-0d0b40b9917b'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''payment'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''d64f5ced-4c90-31e4-37a9-4384dd3b5a7b'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''smart-tag'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''d72016ff-d1e6-31c5-a552-44d14246c23d'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''settings'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''e0c5b4c3-e599-b0c6-653c-9faf15c3334a'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''mypetlink_official'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''e1df28ce-b835-e42f-fe11-870bc90419b8'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''billing'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''e4318ad6-a6e5-cd7e-3789-5f64dfa3436f'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''customer_care'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''e63d838d-da6a-ef83-a044-f1c318b4b344'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''public'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''e7b3ae89-e3a0-c311-c9d5-f9e17fc2c4e4'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''official'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''eb76721f-1100-3ac3-e4e6-f510d111c476'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''smart-pet-tags'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''ed77c313-c32a-4f5b-7857-82984aae99d6'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''contact'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''f1de7946-b851-68ad-9104-a6203c5528e9'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''t'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''f63c84d7-8945-fbea-57f1-6814ab6ec679'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''css'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''fa33fe08-d7e3-43ec-6bfb-92522dd06a50'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''api'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''fc3ea36b-8433-bc73-7220-868f16d21c2f'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''system'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00''),
    (''fc589361-a595-c5ef-28ab-71ca5cce6a63'', ''2026-01-01T00:00:00.0000000+00:00'', NULL, N''signup'', NULL, N''System'', ''2026-01-01T00:00:00.0000000+00:00'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CreatedAt', N'HeldUntil', N'NormalizedHandle', N'PreviousUserId', N'Reason', N'UpdatedAt') AND [object_id] = OBJECT_ID(N'[OwnerHandleReservations]'))
        SET IDENTITY_INSERT [OwnerHandleReservations] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    CREATE INDEX [IX_OwnerHandleHistories_NormalizedHandle] ON [OwnerHandleHistories] ([NormalizedHandle]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    CREATE INDEX [IX_OwnerHandleHistories_UserId_ChangedAt] ON [OwnerHandleHistories] ([UserId], [ChangedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    EXEC(N'CREATE INDEX [IX_OwnerHandleReservations_HeldUntil] ON [OwnerHandleReservations] ([HeldUntil]) WHERE [HeldUntil] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    CREATE UNIQUE INDEX [IX_OwnerHandleReservations_NormalizedHandle] ON [OwnerHandleReservations] ([NormalizedHandle]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    CREATE INDEX [IX_OwnerHandleReservations_PreviousUserId] ON [OwnerHandleReservations] ([PreviousUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    CREATE INDEX [IX_OwnerSocialProfiles_AvatarMediaFileId] ON [OwnerSocialProfiles] ([AvatarMediaFileId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    CREATE INDEX [IX_OwnerSocialProfiles_IsSocialEnabled_IsDiscoverable_UpdatedAt] ON [OwnerSocialProfiles] ([IsSocialEnabled], [IsDiscoverable], [UpdatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    CREATE INDEX [IX_OwnerSocialProfiles_NormalizedDisplayName] ON [OwnerSocialProfiles] ([NormalizedDisplayName]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_OwnerSocialProfiles_NormalizedHandle] ON [OwnerSocialProfiles] ([NormalizedHandle]) WHERE [NormalizedHandle] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    CREATE UNIQUE INDEX [IX_OwnerSocialProfiles_UserId] ON [OwnerSocialProfiles] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN

                    INSERT INTO [OwnerSocialProfiles]
                        ([Id], [UserId], [Handle], [NormalizedHandle], [DisplayName],
                         [NormalizedDisplayName], [Bio], [AvatarMediaFileId], [GeneralArea],
                         [IsSocialEnabled], [IsDiscoverable], [AllowFollowers],
                         [CreatedAt], [UpdatedAt])
                    SELECT
                        NEWID(), u.[Id], NULL, NULL, NULL,
                        NULL, NULL, NULL, NULL,
                        0, 0, 1,
                        SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
                    FROM [Users] AS u
                    WHERE u.[DeletedAt] IS NULL
                      AND NOT EXISTS (
                          SELECT 1 FROM [OwnerSocialProfiles] AS p WHERE p.[UserId] = u.[Id]);
                
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055149_AddOwnerSocialIdentity'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260915055149_AddOwnerSocialIdentity', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    CREATE TABLE [OwnerBlocks] (
        [Id] uniqueidentifier NOT NULL,
        [BlockerUserId] uniqueidentifier NOT NULL,
        [BlockedUserId] uniqueidentifier NOT NULL,
        [Reason] nvarchar(280) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_OwnerBlocks] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_OwnerBlocks_NoSelfBlock] CHECK ([BlockerUserId] <> [BlockedUserId]),
        CONSTRAINT [FK_OwnerBlocks_Users_BlockedUserId] FOREIGN KEY ([BlockedUserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_OwnerBlocks_Users_BlockerUserId] FOREIGN KEY ([BlockerUserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    CREATE TABLE [OwnerFollows] (
        [Id] uniqueidentifier NOT NULL,
        [FollowerUserId] uniqueidentifier NOT NULL,
        [FollowedUserId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_OwnerFollows] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_OwnerFollows_NoSelfFollow] CHECK ([FollowerUserId] <> [FollowedUserId]),
        CONSTRAINT [FK_OwnerFollows_Users_FollowedUserId] FOREIGN KEY ([FollowedUserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_OwnerFollows_Users_FollowerUserId] FOREIGN KEY ([FollowerUserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    CREATE TABLE [OwnerNotifications] (
        [Id] uniqueidentifier NOT NULL,
        [RecipientUserId] uniqueidentifier NOT NULL,
        [ActorUserId] uniqueidentifier NULL,
        [SubjectPetId] uniqueidentifier NULL,
        [MomentId] uniqueidentifier NULL,
        [Type] nvarchar(48) NOT NULL,
        [ReadAt] datetimeoffset NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_OwnerNotifications] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_OwnerNotifications_PetMemories_MomentId] FOREIGN KEY ([MomentId]) REFERENCES [PetMemories] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_OwnerNotifications_Pets_SubjectPetId] FOREIGN KEY ([SubjectPetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_OwnerNotifications_Users_ActorUserId] FOREIGN KEY ([ActorUserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_OwnerNotifications_Users_RecipientUserId] FOREIGN KEY ([RecipientUserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    CREATE INDEX [IX_OwnerBlocks_BlockedUserId] ON [OwnerBlocks] ([BlockedUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    CREATE UNIQUE INDEX [IX_OwnerBlocks_BlockerUserId_BlockedUserId] ON [OwnerBlocks] ([BlockerUserId], [BlockedUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    CREATE INDEX [IX_OwnerFollows_FollowedUserId_CreatedAt] ON [OwnerFollows] ([FollowedUserId], [CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    CREATE INDEX [IX_OwnerFollows_FollowerUserId_CreatedAt] ON [OwnerFollows] ([FollowerUserId], [CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    CREATE UNIQUE INDEX [IX_OwnerFollows_FollowerUserId_FollowedUserId] ON [OwnerFollows] ([FollowerUserId], [FollowedUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    CREATE INDEX [IX_OwnerNotifications_ActorUserId] ON [OwnerNotifications] ([ActorUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    CREATE INDEX [IX_OwnerNotifications_MomentId] ON [OwnerNotifications] ([MomentId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    CREATE INDEX [IX_OwnerNotifications_RecipientUserId_CreatedAt] ON [OwnerNotifications] ([RecipientUserId], [CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    EXEC(N'CREATE INDEX [IX_OwnerNotifications_RecipientUserId_ReadAt] ON [OwnerNotifications] ([RecipientUserId], [ReadAt]) WHERE [ReadAt] IS NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    CREATE INDEX [IX_OwnerNotifications_RecipientUserId_Type_ActorUserId_MomentId] ON [OwnerNotifications] ([RecipientUserId], [Type], [ActorUserId], [MomentId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    CREATE INDEX [IX_OwnerNotifications_SubjectPetId] ON [OwnerNotifications] ([SubjectPetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055222_AddSocialGraph'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260915055222_AddSocialGraph', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    ALTER TABLE [PetMemories] ADD [AuthorUserId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN

                    UPDATE m
                    SET m.[AuthorUserId] = p.[OwnerUserId]
                    FROM [PetMemories] AS m
                    INNER JOIN [Pets] AS p ON p.[Id] = m.[PetId]
                    WHERE m.[AuthorUserId] IS NULL;
                
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    ALTER TABLE [PetMemories] ALTER COLUMN [AuthorUserId] uniqueidentifier NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    ALTER TABLE [PetMemories] ADD [PublishedAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN

                    UPDATE [PetMemories]
                    SET [PublishedAt] = [CreatedAt]
                    WHERE [Visibility] = 'Public' AND [PublishedAt] IS NULL;
                
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    CREATE TABLE [MomentLikes] (
        [Id] uniqueidentifier NOT NULL,
        [MomentId] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_MomentLikes] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MomentLikes_PetMemories_MomentId] FOREIGN KEY ([MomentId]) REFERENCES [PetMemories] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MomentLikes_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    CREATE TABLE [MomentPets] (
        [Id] uniqueidentifier NOT NULL,
        [MomentId] uniqueidentifier NOT NULL,
        [PetId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_MomentPets] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MomentPets_PetMemories_MomentId] FOREIGN KEY ([MomentId]) REFERENCES [PetMemories] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_MomentPets_Pets_PetId] FOREIGN KEY ([PetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    CREATE TABLE [PetSocialProfiles] (
        [Id] uniqueidentifier NOT NULL,
        [PetId] uniqueidentifier NOT NULL,
        [IsSocialEnabled] bit NOT NULL DEFAULT CAST(0 AS bit),
        [IsDiscoverable] bit NOT NULL DEFAULT CAST(0 AS bit),
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PetSocialProfiles] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_PetSocialProfiles_Pets_PetId] FOREIGN KEY ([PetId]) REFERENCES [Pets] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    CREATE INDEX [IX_PetMemories_AuthorUserId_PublishedAt] ON [PetMemories] ([AuthorUserId], [PublishedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MomentLikes_MomentId_UserId] ON [MomentLikes] ([MomentId], [UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    CREATE INDEX [IX_MomentLikes_UserId_CreatedAt] ON [MomentLikes] ([UserId], [CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MomentPets_MomentId_PetId] ON [MomentPets] ([MomentId], [PetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    CREATE INDEX [IX_MomentPets_PetId_MomentId] ON [MomentPets] ([PetId], [MomentId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    CREATE INDEX [IX_PetSocialProfiles_IsSocialEnabled_IsDiscoverable_UpdatedAt] ON [PetSocialProfiles] ([IsSocialEnabled], [IsDiscoverable], [UpdatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PetSocialProfiles_PetId] ON [PetSocialProfiles] ([PetId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN

                    INSERT INTO [MomentPets] ([Id], [MomentId], [PetId], [CreatedAt])
                    SELECT NEWID(), m.[Id], m.[PetId], m.[CreatedAt]
                    FROM [PetMemories] AS m
                    WHERE NOT EXISTS (
                        SELECT 1 FROM [MomentPets] AS mp WHERE mp.[MomentId] = m.[Id]);
                
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN

                    INSERT INTO [PetSocialProfiles]
                        ([Id], [PetId], [IsSocialEnabled], [IsDiscoverable],
                         [CreatedAt], [UpdatedAt])
                    SELECT NEWID(), p.[Id], 0, 0, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
                    FROM [Pets] AS p
                    WHERE p.[DeletedAt] IS NULL
                      AND NOT EXISTS (
                          SELECT 1 FROM [PetSocialProfiles] AS s WHERE s.[PetId] = p.[Id]);
                
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    ALTER TABLE [PetMemories] ADD CONSTRAINT [FK_PetMemories_Users_AuthorUserId] FOREIGN KEY ([AuthorUserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915055237_AddMomentSocialContent'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260915055237_AddMomentSocialContent', N'8.0.26');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915093918_AddPetNameSearchIndex'
)
BEGIN
    CREATE INDEX [IX_Pets_Name] ON [Pets] ([Name]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260915093918_AddPetNameSearchIndex'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260915093918_AddPetNameSearchIndex', N'8.0.26');
END;
GO

COMMIT;
GO

