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
    UPDATE Pets
    SET FavoriteFoodsJson = N'["' + STRING_ESCAPE(LTRIM(RTRIM(FavoriteFood)), 'json') + N'"]'
    WHERE FavoriteFood IS NOT NULL AND LTRIM(RTRIM(FavoriteFood)) <> N'';
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260714045218_FavoriteFoodsAndToysAsLists'
)
BEGIN
    UPDATE Pets
    SET FavoriteToysJson = N'["' + STRING_ESCAPE(LTRIM(RTRIM(FavoriteToy)), 'json') + N'"]'
    WHERE FavoriteToy IS NOT NULL AND LTRIM(RTRIM(FavoriteToy)) <> N'';
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
