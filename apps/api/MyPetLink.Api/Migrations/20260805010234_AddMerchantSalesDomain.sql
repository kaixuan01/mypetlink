BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE TABLE [DocumentNumberCounters] (
        [CounterKey] nvarchar(64) NOT NULL,
        [NextValue] bigint NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_DocumentNumberCounters] PRIMARY KEY ([CounterKey])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE TABLE [Salespersons] (
        [Id] uniqueidentifier NOT NULL,
        [SalespersonCode] nvarchar(32) NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [Email] nvarchar(254) NULL,
        [Phone] nvarchar(32) NULL,
        [DefaultCommissionPercentage] decimal(5,2) NOT NULL,
        [InternalNotes] nvarchar(2000) NULL,
        [IsActive] bit NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_Salespersons] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE TABLE [Merchants] (
        [Id] uniqueidentifier NOT NULL,
        [MerchantCode] nvarchar(32) NOT NULL,
        [LegalBusinessName] nvarchar(200) NOT NULL,
        [TradingName] nvarchar(200) NULL,
        [BusinessRegistrationNumber] nvarchar(64) NULL,
        [NormalizedBusinessRegistrationNumber] nvarchar(64) NULL,
        [TaxIdentificationNumber] nvarchar(64) NULL,
        [SstRegistrationNumber] nvarchar(64) NULL,
        [ContactPerson] nvarchar(160) NOT NULL,
        [ContactEmail] nvarchar(254) NOT NULL,
        [ContactPhone] nvarchar(32) NOT NULL,
        [BillingAddressLine1] nvarchar(240) NOT NULL,
        [BillingAddressLine2] nvarchar(240) NULL,
        [BillingPostcode] nvarchar(16) NOT NULL,
        [BillingCity] nvarchar(120) NOT NULL,
        [BillingState] nvarchar(120) NOT NULL,
        [BillingCountry] nvarchar(80) NOT NULL,
        [DeliveryAddressSameAsBilling] bit NOT NULL,
        [DeliveryAddressLine1] nvarchar(240) NOT NULL,
        [DeliveryAddressLine2] nvarchar(240) NULL,
        [DeliveryPostcode] nvarchar(16) NOT NULL,
        [DeliveryCity] nvarchar(120) NOT NULL,
        [DeliveryState] nvarchar(120) NOT NULL,
        [DeliveryCountry] nvarchar(80) NOT NULL,
        [AssignedSalespersonId] uniqueidentifier NULL,
        [PaymentTerm] nvarchar(32) NOT NULL,
        [InternalNotes] nvarchar(2000) NULL,
        [IsActive] bit NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_Merchants] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Merchants_Salespersons_AssignedSalespersonId] FOREIGN KEY ([AssignedSalespersonId]) REFERENCES [Salespersons] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE TABLE [MerchantOrderItems] (
        [Id] uniqueidentifier NOT NULL,
        [MerchantOrderId] uniqueidentifier NOT NULL,
        [ProductId] uniqueidentifier NOT NULL,
        [ProductVariantId] uniqueidentifier NOT NULL,
        [ProductNameSnapshot] nvarchar(200) NOT NULL,
        [SkuCodeSnapshot] nvarchar(64) NOT NULL,
        [OptionNameSnapshot] nvarchar(120) NOT NULL,
        [SupportsQrSnapshot] bit NOT NULL,
        [SupportsNfcSnapshot] bit NOT NULL,
        [UnitWeightGramsSnapshot] decimal(10,2) NULL,
        [Quantity] int NOT NULL,
        [WholesaleUnitPrice] decimal(18,2) NOT NULL,
        [LineDiscount] decimal(18,2) NOT NULL,
        [LineSubtotal] decimal(18,2) NOT NULL,
        [SortOrder] int NOT NULL,
        CONSTRAINT [PK_MerchantOrderItems] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE TABLE [MerchantOrders] (
        [Id] uniqueidentifier NOT NULL,
        [MerchantOrderNumber] nvarchar(48) NOT NULL,
        [SourceQuotationId] uniqueidentifier NULL,
        [MerchantId] uniqueidentifier NOT NULL,
        [MerchantCodeSnapshot] nvarchar(32) NOT NULL,
        [MerchantLegalNameSnapshot] nvarchar(200) NOT NULL,
        [MerchantTradingNameSnapshot] nvarchar(200) NULL,
        [MerchantRegistrationNumberSnapshot] nvarchar(64) NULL,
        [MerchantTaxIdentificationNumberSnapshot] nvarchar(64) NULL,
        [MerchantSstRegistrationNumberSnapshot] nvarchar(64) NULL,
        [ContactPersonSnapshot] nvarchar(160) NOT NULL,
        [ContactEmailSnapshot] nvarchar(254) NOT NULL,
        [ContactPhoneSnapshot] nvarchar(32) NOT NULL,
        [BillingAddressLine1Snapshot] nvarchar(240) NOT NULL,
        [BillingAddressLine2Snapshot] nvarchar(240) NULL,
        [BillingPostcodeSnapshot] nvarchar(16) NOT NULL,
        [BillingCitySnapshot] nvarchar(120) NOT NULL,
        [BillingStateSnapshot] nvarchar(120) NOT NULL,
        [BillingCountrySnapshot] nvarchar(80) NOT NULL,
        [DeliveryAddressLine1Snapshot] nvarchar(240) NOT NULL,
        [DeliveryAddressLine2Snapshot] nvarchar(240) NULL,
        [DeliveryPostcodeSnapshot] nvarchar(16) NOT NULL,
        [DeliveryCitySnapshot] nvarchar(120) NOT NULL,
        [DeliveryStateSnapshot] nvarchar(120) NOT NULL,
        [DeliveryCountrySnapshot] nvarchar(80) NOT NULL,
        [SalespersonId] uniqueidentifier NULL,
        [SalespersonCodeSnapshot] nvarchar(32) NULL,
        [SalespersonNameSnapshot] nvarchar(160) NULL,
        [SalespersonCommissionPercentageSnapshot] decimal(5,2) NULL,
        [PaymentTermSnapshot] nvarchar(32) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [MerchandiseSubtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [DeliveryFee] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [PaymentStatus] nvarchar(32) NOT NULL,
        [FulfilmentStatus] nvarchar(32) NOT NULL,
        [InternalNotes] nvarchar(2000) NULL,
        [PaymentConfirmedAt] datetimeoffset NULL,
        [CancelledAt] datetimeoffset NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_MerchantOrders] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MerchantOrders_Merchants_MerchantId] FOREIGN KEY ([MerchantId]) REFERENCES [Merchants] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantOrders_Salespersons_SalespersonId] FOREIGN KEY ([SalespersonId]) REFERENCES [Salespersons] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE TABLE [MerchantQuotations] (
        [Id] uniqueidentifier NOT NULL,
        [QuotationNumber] nvarchar(48) NOT NULL,
        [MerchantId] uniqueidentifier NOT NULL,
        [MerchantCodeSnapshot] nvarchar(32) NOT NULL,
        [MerchantLegalNameSnapshot] nvarchar(200) NOT NULL,
        [MerchantTradingNameSnapshot] nvarchar(200) NULL,
        [MerchantRegistrationNumberSnapshot] nvarchar(64) NULL,
        [MerchantTaxIdentificationNumberSnapshot] nvarchar(64) NULL,
        [MerchantSstRegistrationNumberSnapshot] nvarchar(64) NULL,
        [ContactPersonSnapshot] nvarchar(160) NOT NULL,
        [ContactEmailSnapshot] nvarchar(254) NOT NULL,
        [ContactPhoneSnapshot] nvarchar(32) NOT NULL,
        [BillingAddressLine1Snapshot] nvarchar(240) NOT NULL,
        [BillingAddressLine2Snapshot] nvarchar(240) NULL,
        [BillingPostcodeSnapshot] nvarchar(16) NOT NULL,
        [BillingCitySnapshot] nvarchar(120) NOT NULL,
        [BillingStateSnapshot] nvarchar(120) NOT NULL,
        [BillingCountrySnapshot] nvarchar(80) NOT NULL,
        [DeliveryAddressLine1Snapshot] nvarchar(240) NOT NULL,
        [DeliveryAddressLine2Snapshot] nvarchar(240) NULL,
        [DeliveryPostcodeSnapshot] nvarchar(16) NOT NULL,
        [DeliveryCitySnapshot] nvarchar(120) NOT NULL,
        [DeliveryStateSnapshot] nvarchar(120) NOT NULL,
        [DeliveryCountrySnapshot] nvarchar(80) NOT NULL,
        [SalespersonId] uniqueidentifier NULL,
        [SalespersonCodeSnapshot] nvarchar(32) NULL,
        [SalespersonNameSnapshot] nvarchar(160) NULL,
        [SalespersonCommissionPercentageSnapshot] decimal(5,2) NULL,
        [QuotationDate] datetimeoffset NOT NULL,
        [ValidUntil] datetimeoffset NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [PaymentTermSnapshot] nvarchar(32) NOT NULL,
        [MerchandiseSubtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [DeliveryFee] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [CustomerNotes] nvarchar(2000) NULL,
        [InternalNotes] nvarchar(2000) NULL,
        [Status] nvarchar(32) NOT NULL,
        [ConvertedMerchantOrderId] uniqueidentifier NULL,
        [SentAt] datetimeoffset NULL,
        [AcceptedAt] datetimeoffset NULL,
        [RejectedAt] datetimeoffset NULL,
        [ExpiredAt] datetimeoffset NULL,
        [ConvertedAt] datetimeoffset NULL,
        [CancelledAt] datetimeoffset NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_MerchantQuotations] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MerchantQuotations_MerchantOrders_ConvertedMerchantOrderId] FOREIGN KEY ([ConvertedMerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantQuotations_Merchants_MerchantId] FOREIGN KEY ([MerchantId]) REFERENCES [Merchants] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MerchantQuotations_Salespersons_SalespersonId] FOREIGN KEY ([SalespersonId]) REFERENCES [Salespersons] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE TABLE [MerchantQuotationItems] (
        [Id] uniqueidentifier NOT NULL,
        [QuotationId] uniqueidentifier NOT NULL,
        [ProductId] uniqueidentifier NOT NULL,
        [ProductVariantId] uniqueidentifier NOT NULL,
        [ProductNameSnapshot] nvarchar(200) NOT NULL,
        [SkuCodeSnapshot] nvarchar(64) NOT NULL,
        [OptionNameSnapshot] nvarchar(120) NOT NULL,
        [SupportsQrSnapshot] bit NOT NULL,
        [SupportsNfcSnapshot] bit NOT NULL,
        [UnitWeightGramsSnapshot] decimal(10,2) NULL,
        [Quantity] int NOT NULL,
        [WholesaleUnitPrice] decimal(18,2) NOT NULL,
        [LineDiscount] decimal(18,2) NOT NULL,
        [LineSubtotal] decimal(18,2) NOT NULL,
        [SortOrder] int NOT NULL,
        CONSTRAINT [PK_MerchantQuotationItems] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MerchantQuotationItems_MerchantQuotations_QuotationId] FOREIGN KEY ([QuotationId]) REFERENCES [MerchantQuotations] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantOrderItems_MerchantOrderId] ON [MerchantOrderItems] ([MerchantOrderId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantOrders_MerchantId] ON [MerchantOrders] ([MerchantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MerchantOrders_MerchantOrderNumber] ON [MerchantOrders] ([MerchantOrderNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantOrders_PaymentStatus_CreatedAt] ON [MerchantOrders] ([PaymentStatus], [CreatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantOrders_SalespersonId] ON [MerchantOrders] ([SalespersonId]);
END;
GO

SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_MerchantOrders_SourceQuotationId] ON [MerchantOrders] ([SourceQuotationId]) WHERE [SourceQuotationId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantQuotationItems_QuotationId] ON [MerchantQuotationItems] ([QuotationId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantQuotations_ConvertedMerchantOrderId] ON [MerchantQuotations] ([ConvertedMerchantOrderId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantQuotations_MerchantId] ON [MerchantQuotations] ([MerchantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MerchantQuotations_QuotationNumber] ON [MerchantQuotations] ([QuotationNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantQuotations_SalespersonId] ON [MerchantQuotations] ([SalespersonId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_MerchantQuotations_Status_QuotationDate] ON [MerchantQuotations] ([Status], [QuotationDate]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_Merchants_AssignedSalespersonId] ON [Merchants] ([AssignedSalespersonId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_Merchants_IsActive] ON [Merchants] ([IsActive]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Merchants_MerchantCode] ON [Merchants] ([MerchantCode]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_Merchants_NormalizedBusinessRegistrationNumber] ON [Merchants] ([NormalizedBusinessRegistrationNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE INDEX [IX_Salespersons_IsActive] ON [Salespersons] ([IsActive]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Salespersons_SalespersonCode] ON [Salespersons] ([SalespersonCode]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    ALTER TABLE [MerchantOrderItems] ADD CONSTRAINT [FK_MerchantOrderItems_MerchantOrders_MerchantOrderId] FOREIGN KEY ([MerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE CASCADE;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    ALTER TABLE [MerchantOrders] ADD CONSTRAINT [FK_MerchantOrders_MerchantQuotations_SourceQuotationId] FOREIGN KEY ([SourceQuotationId]) REFERENCES [MerchantQuotations] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260805010234_AddMerchantSalesDomain'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260805010234_AddMerchantSalesDomain', N'8.0.26');
END;
GO

COMMIT;
GO

