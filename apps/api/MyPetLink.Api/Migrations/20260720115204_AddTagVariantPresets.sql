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

