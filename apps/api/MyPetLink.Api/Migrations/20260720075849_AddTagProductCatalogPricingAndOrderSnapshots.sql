BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [RowVersion] rowversion NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    ALTER TABLE [SmartTags] ADD [ProductVariantId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    ALTER TABLE [SmartTags] ADD [RowVersion] rowversion NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    ALTER TABLE [SmartTagBatches] ADD [ProductVariantId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE TABLE [Promotions] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [InternalDescription] nvarchar(1000) NULL,
        [DisplayLabel] nvarchar(160) NULL,
        [IsActive] bit NOT NULL,
        [IsAutomatic] bit NOT NULL,
        [DiscountType] nvarchar(32) NOT NULL,
        [DiscountValue] decimal(18,2) NOT NULL,
        [StartsAt] datetimeoffset NOT NULL,
        [EndsAt] datetimeoffset NOT NULL,
        [Priority] int NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_Promotions] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE TABLE [TagProducts] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [Slug] nvarchar(120) NOT NULL,
        [ShortDescription] nvarchar(300) NULL,
        [Description] nvarchar(4000) NULL,
        [IsPublished] bit NOT NULL,
        [IsArchived] bit NOT NULL,
        [SortOrder] int NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TagProducts] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE TABLE [TagProductVariants] (
        [Id] uniqueidentifier NOT NULL,
        [TagProductId] uniqueidentifier NOT NULL,
        [PublicKey] nvarchar(32) NOT NULL,
        [Sku] nvarchar(80) NOT NULL,
        [DisplayName] nvarchar(160) NOT NULL,
        [SupportsQr] bit NOT NULL,
        [SupportsNfc] bit NOT NULL,
        [TagVariant] nvarchar(80) NOT NULL,
        [WidthMm] decimal(10,2) NULL,
        [HeightMm] decimal(10,2) NULL,
        [ThicknessMm] decimal(10,2) NULL,
        [WeightGrams] decimal(10,2) NULL,
        [Material] nvarchar(160) NULL,
        [Shape] nvarchar(120) NULL,
        [Colour] nvarchar(120) NULL,
        [PackagingType] nvarchar(200) NULL,
        [BasePrice] decimal(18,2) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [CompareAtPrice] decimal(18,2) NULL,
        [PrintTemplateCode] nvarchar(120) NULL,
        [ProductionNotes] nvarchar(1000) NULL,
        [IsActive] bit NOT NULL,
        [IsPurchasable] bit NOT NULL,
        [SortOrder] int NOT NULL,
        [ArchivedAt] datetimeoffset NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TagProductVariants] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_TagProductVariants_TagProducts_TagProductId] FOREIGN KEY ([TagProductId]) REFERENCES [TagProducts] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE TABLE [PromotionVariants] (
        [PromotionId] uniqueidentifier NOT NULL,
        [TagProductVariantId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PromotionVariants] PRIMARY KEY ([PromotionId], [TagProductVariantId]),
        CONSTRAINT [FK_PromotionVariants_Promotions_PromotionId] FOREIGN KEY ([PromotionId]) REFERENCES [Promotions] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PromotionVariants_TagProductVariants_TagProductVariantId] FOREIGN KEY ([TagProductVariantId]) REFERENCES [TagProductVariants] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE TABLE [TagOrderItems] (
        [Id] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [ProductVariantId] uniqueidentifier NULL,
        [SkuSnapshot] nvarchar(80) NOT NULL,
        [ProductNameSnapshot] nvarchar(160) NOT NULL,
        [VariantNameSnapshot] nvarchar(160) NOT NULL,
        [UnitBasePrice] decimal(18,2) NOT NULL,
        [Quantity] int NOT NULL,
        [Subtotal] decimal(18,2) NOT NULL,
        [PromotionId] uniqueidentifier NULL,
        [PromotionNameSnapshot] nvarchar(160) NULL,
        [DiscountAmount] decimal(18,2) NOT NULL,
        [FinalUnitPrice] decimal(18,2) NOT NULL,
        [FinalAmount] decimal(18,2) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TagOrderItems] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_TagOrderItems_Promotions_PromotionId] FOREIGN KEY ([PromotionId]) REFERENCES [Promotions] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TagOrderItems_TagOrders_OrderId] FOREIGN KEY ([OrderId]) REFERENCES [TagOrders] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TagOrderItems_TagProductVariants_ProductVariantId] FOREIGN KEY ([ProductVariantId]) REFERENCES [TagProductVariants] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE TABLE [TagProductMedia] (
        [Id] uniqueidentifier NOT NULL,
        [TagProductId] uniqueidentifier NOT NULL,
        [TagProductVariantId] uniqueidentifier NULL,
        [MediaFileId] uniqueidentifier NOT NULL,
        [SortOrder] int NOT NULL,
        [AltText] nvarchar(300) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [ArchivedAt] datetimeoffset NULL,
        CONSTRAINT [PK_TagProductMedia] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_TagProductMedia_MediaFiles_MediaFileId] FOREIGN KEY ([MediaFileId]) REFERENCES [MediaFiles] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TagProductMedia_TagProductVariants_TagProductVariantId] FOREIGN KEY ([TagProductVariantId]) REFERENCES [TagProductVariants] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TagProductMedia_TagProducts_TagProductId] FOREIGN KEY ([TagProductId]) REFERENCES [TagProducts] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_SmartTags_ProductVariantId] ON [SmartTags] ([ProductVariantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_SmartTagBatches_ProductVariantId] ON [SmartTagBatches] ([ProductVariantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_Promotions_IsActive_IsAutomatic_StartsAt_EndsAt] ON [Promotions] ([IsActive], [IsAutomatic], [StartsAt], [EndsAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_Promotions_Priority] ON [Promotions] ([Priority]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_Promotions_UpdatedAt] ON [Promotions] ([UpdatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_PromotionVariants_TagProductVariantId] ON [PromotionVariants] ([TagProductVariantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagOrderItems_OrderId] ON [TagOrderItems] ([OrderId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagOrderItems_ProductVariantId] ON [TagOrderItems] ([ProductVariantId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagOrderItems_PromotionId] ON [TagOrderItems] ([PromotionId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProductMedia_MediaFileId] ON [TagProductMedia] ([MediaFileId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProductMedia_TagProductId_SortOrder] ON [TagProductMedia] ([TagProductId], [SortOrder]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProductMedia_TagProductVariantId_SortOrder] ON [TagProductMedia] ([TagProductVariantId], [SortOrder]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProducts_IsPublished_IsArchived_SortOrder] ON [TagProducts] ([IsPublished], [IsArchived], [SortOrder]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TagProducts_Slug] ON [TagProducts] ([Slug]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProducts_UpdatedAt] ON [TagProducts] ([UpdatedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProductVariants_IsActive_IsPurchasable_ArchivedAt] ON [TagProductVariants] ([IsActive], [IsPurchasable], [ArchivedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TagProductVariants_PublicKey] ON [TagProductVariants] ([PublicKey]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TagProductVariants_Sku] ON [TagProductVariants] ([Sku]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProductVariants_SupportsQr_SupportsNfc] ON [TagProductVariants] ([SupportsQr], [SupportsNfc]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    CREATE INDEX [IX_TagProductVariants_TagProductId] ON [TagProductVariants] ([TagProductId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    ALTER TABLE [SmartTagBatches] ADD CONSTRAINT [FK_SmartTagBatches_TagProductVariants_ProductVariantId] FOREIGN KEY ([ProductVariantId]) REFERENCES [TagProductVariants] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    ALTER TABLE [SmartTags] ADD CONSTRAINT [FK_SmartTags_TagProductVariants_ProductVariantId] FOREIGN KEY ([ProductVariantId]) REFERENCES [TagProductVariants] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260720075849_AddTagProductCatalogPricingAndOrderSnapshots', N'8.0.26');
END;
GO

COMMIT;
GO
