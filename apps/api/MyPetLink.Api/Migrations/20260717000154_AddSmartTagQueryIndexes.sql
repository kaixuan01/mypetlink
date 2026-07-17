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
