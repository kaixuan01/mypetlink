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

