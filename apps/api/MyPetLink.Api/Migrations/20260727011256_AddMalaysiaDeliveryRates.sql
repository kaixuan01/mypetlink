BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [Country] nvarchar(80) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [DeliveryMethodName] nvarchar(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [DeliveryZoneName] nvarchar(80) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [FreeShippingReason] nvarchar(240) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [StateCode] nvarchar(8) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [TotalAmount] decimal(18,2) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    CREATE TABLE [DeliveryRates] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [ZoneCode] nvarchar(16) NOT NULL,
        [ApplicableStateCodesJson] nvarchar(500) NOT NULL,
        [Fee] decimal(18,2) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [FreeShippingThreshold] decimal(18,2) NULL,
        [IsActive] bit NOT NULL,
        [DisplayOrder] int NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_DeliveryRates] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'Name', N'ZoneCode', N'ApplicableStateCodesJson', N'Fee', N'Currency', N'FreeShippingThreshold', N'IsActive', N'DisplayOrder', N'CreatedAt', N'UpdatedAt') AND [object_id] = OBJECT_ID(N'[DeliveryRates]'))
        SET IDENTITY_INSERT [DeliveryRates] ON;
    EXEC(N'INSERT INTO [DeliveryRates] ([Id], [Name], [ZoneCode], [ApplicableStateCodesJson], [Fee], [Currency], [FreeShippingThreshold], [IsActive], [DisplayOrder], [CreatedAt], [UpdatedAt])
    VALUES (''6c50d914-8550-41e8-a923-010cc3b8a101'', N''Peninsular Standard Delivery'', N''PEN'', N''["JHR","KDH","KTN","MLK","NSN","PHG","PRK","PLS","PNG","SGR","TRG","KUL","PJY"]'', 0.0, N''MYR'', NULL, CAST(0 AS bit), 10, ''2026-07-27T00:00:00.0000000+00:00'', ''2026-07-27T00:00:00.0000000+00:00''),
    (''6c50d914-8550-41e8-a923-010cc3b8a102'', N''Sabah Standard Delivery'', N''SBH'', N''["SBH"]'', 0.0, N''MYR'', NULL, CAST(0 AS bit), 20, ''2026-07-27T00:00:00.0000000+00:00'', ''2026-07-27T00:00:00.0000000+00:00''),
    (''6c50d914-8550-41e8-a923-010cc3b8a103'', N''Sarawak Standard Delivery'', N''SWK'', N''["SWK"]'', 0.0, N''MYR'', NULL, CAST(0 AS bit), 30, ''2026-07-27T00:00:00.0000000+00:00'', ''2026-07-27T00:00:00.0000000+00:00''),
    (''6c50d914-8550-41e8-a923-010cc3b8a104'', N''Labuan Standard Delivery'', N''LBN'', N''["LBN"]'', 0.0, N''MYR'', NULL, CAST(0 AS bit), 40, ''2026-07-27T00:00:00.0000000+00:00'', ''2026-07-27T00:00:00.0000000+00:00'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'Name', N'ZoneCode', N'ApplicableStateCodesJson', N'Fee', N'Currency', N'FreeShippingThreshold', N'IsActive', N'DisplayOrder', N'CreatedAt', N'UpdatedAt') AND [object_id] = OBJECT_ID(N'[DeliveryRates]'))
        SET IDENTITY_INSERT [DeliveryRates] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    CREATE INDEX [IX_DeliveryRates_IsActive_DisplayOrder] ON [DeliveryRates] ([IsActive], [DisplayOrder]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DeliveryRates_ZoneCode] ON [DeliveryRates] ([ZoneCode]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260727011256_AddMalaysiaDeliveryRates'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260727011256_AddMalaysiaDeliveryRates', N'8.0.26');
END;
GO

COMMIT;
GO
