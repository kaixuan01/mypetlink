BEGIN TRANSACTION;
GO

ALTER TABLE [Pets] ADD [IsSampleEligible] bit NOT NULL DEFAULT CAST(0 AS bit);
GO

ALTER TABLE [Pets] ADD [RowVersion] rowversion NOT NULL;
GO

ALTER TABLE [Pets] ADD [SampleEligibilityUpdatedAt] datetimeoffset NULL;
GO

ALTER TABLE [Pets] ADD [SampleEligibilityUpdatedByAdminUserId] uniqueidentifier NULL;
GO

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
GO

IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CreatedAt', N'FeaturedSamplePetId', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[PublicSiteSettings]'))
    SET IDENTITY_INSERT [PublicSiteSettings] ON;
INSERT INTO [PublicSiteSettings] ([Id], [CreatedAt], [FeaturedSamplePetId], [UpdatedAt], [UpdatedByAdminUserId])
VALUES ('e7b2fc49-e065-4c4a-ae65-d2678a2fa7c4', '2026-01-01T00:00:00.0000000+00:00', NULL, '2026-01-01T00:00:00.0000000+00:00', NULL);
IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CreatedAt', N'FeaturedSamplePetId', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[PublicSiteSettings]'))
    SET IDENTITY_INSERT [PublicSiteSettings] OFF;
GO

CREATE INDEX [IX_Pets_IsSampleEligible] ON [Pets] ([IsSampleEligible]);
GO

CREATE INDEX [IX_Pets_SampleEligibilityUpdatedByAdminUserId] ON [Pets] ([SampleEligibilityUpdatedByAdminUserId]);
GO

CREATE UNIQUE INDEX [IX_PublicSiteSettings_FeaturedSamplePetId] ON [PublicSiteSettings] ([FeaturedSamplePetId]) WHERE [FeaturedSamplePetId] IS NOT NULL;
GO

CREATE INDEX [IX_PublicSiteSettings_UpdatedByAdminUserId] ON [PublicSiteSettings] ([UpdatedByAdminUserId]);
GO

ALTER TABLE [Pets] ADD CONSTRAINT [FK_Pets_AdminUsers_SampleEligibilityUpdatedByAdminUserId] FOREIGN KEY ([SampleEligibilityUpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION;
GO

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20260810180418_AddFeaturedSamplePet', N'8.0.26');
GO

COMMIT;
GO
