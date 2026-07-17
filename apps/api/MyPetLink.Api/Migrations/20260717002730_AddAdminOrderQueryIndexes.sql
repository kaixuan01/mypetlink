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
