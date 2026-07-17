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
