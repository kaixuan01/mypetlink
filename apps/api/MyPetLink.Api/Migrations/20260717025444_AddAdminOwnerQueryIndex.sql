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
