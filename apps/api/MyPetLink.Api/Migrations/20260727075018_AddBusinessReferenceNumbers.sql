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

SET QUOTED_IDENTIFIER ON;
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
