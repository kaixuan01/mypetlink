BEGIN TRANSACTION;
GO

ALTER TABLE [TagOrderItems] ADD [SupportsNfcSnapshot] bit NOT NULL DEFAULT CAST(0 AS bit);
GO

ALTER TABLE [TagOrderItems] ADD [SupportsQrSnapshot] bit NOT NULL DEFAULT CAST(0 AS bit);
GO


                UPDATE item
                SET item.SupportsQrSnapshot = 1,
                    item.SupportsNfcSnapshot = CASE WHEN o.TagType = 'QrNfcSmartTag' THEN 1 ELSE 0 END
                FROM TagOrderItems AS item
                INNER JOIN TagOrders AS o ON o.Id = item.OrderId;
GO

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20260721095353_AddOrderItemCapabilitySnapshots', N'8.0.26');
GO

COMMIT;
GO

