BEGIN TRANSACTION;
GO

ALTER TABLE [MerchantOrders] ADD [CourierProvider] nvarchar(120) NULL;
GO

ALTER TABLE [MerchantOrders] ADD [CourierProviderCode] nvarchar(32) NULL;
GO

ALTER TABLE [MerchantOrders] ADD [CourierService] nvarchar(120) NULL;
GO

ALTER TABLE [MerchantOrders] ADD [DeliveredAt] datetimeoffset NULL;
GO

ALTER TABLE [MerchantOrders] ADD [FulfilmentUpdatedByAdminUserId] uniqueidentifier NULL;
GO

ALTER TABLE [MerchantOrders] ADD [InternalCourierCost] decimal(18,2) NULL;
GO

ALTER TABLE [MerchantOrders] ADD [InternalShippingNotes] nvarchar(2000) NULL;
GO

ALTER TABLE [MerchantOrders] ADD [PreparingAt] datetimeoffset NULL;
GO

ALTER TABLE [MerchantOrders] ADD [ReadyToShipAt] datetimeoffset NULL;
GO

ALTER TABLE [MerchantOrders] ADD [ShippedAt] datetimeoffset NULL;
GO

ALTER TABLE [MerchantOrders] ADD [TrackingNumber] nvarchar(64) NULL;
GO

ALTER TABLE [MerchantOrders] ADD [TrackingUrlSnapshot] nvarchar(500) NULL;
GO

CREATE TABLE [MerchantDeliveryOrders] (
    [Id] uniqueidentifier NOT NULL,
    [DeliveryOrderNumber] nvarchar(48) NOT NULL,
    [MerchantOrderId] uniqueidentifier NOT NULL,
    [MerchantOrderNumberSnapshot] nvarchar(48) NOT NULL,
    [MerchantId] uniqueidentifier NOT NULL,
    [MerchantCodeSnapshot] nvarchar(32) NOT NULL,
    [MerchantLegalNameSnapshot] nvarchar(200) NOT NULL,
    [MerchantTradingNameSnapshot] nvarchar(200) NULL,
    [ContactPersonSnapshot] nvarchar(160) NOT NULL,
    [ContactEmailSnapshot] nvarchar(254) NOT NULL,
    [ContactPhoneSnapshot] nvarchar(32) NOT NULL,
    [DeliveryAddressLine1Snapshot] nvarchar(240) NOT NULL,
    [DeliveryAddressLine2Snapshot] nvarchar(240) NULL,
    [DeliveryPostcodeSnapshot] nvarchar(16) NOT NULL,
    [DeliveryCitySnapshot] nvarchar(120) NOT NULL,
    [DeliveryStateSnapshot] nvarchar(120) NOT NULL,
    [DeliveryCountrySnapshot] nvarchar(80) NOT NULL,
    [CourierProviderSnapshot] nvarchar(120) NULL,
    [CourierServiceSnapshot] nvarchar(120) NULL,
    [TrackingNumberSnapshot] nvarchar(64) NULL,
    [IssuedAt] datetimeoffset NOT NULL,
    [IssuedByAdminUserId] uniqueidentifier NOT NULL,
    [CancelledAt] datetimeoffset NULL,
    [RowVersion] rowversion NOT NULL,
    CONSTRAINT [PK_MerchantDeliveryOrders] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_MerchantDeliveryOrders_AdminUsers_IssuedByAdminUserId] FOREIGN KEY ([IssuedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_MerchantDeliveryOrders_MerchantOrders_MerchantOrderId] FOREIGN KEY ([MerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE NO ACTION
);
GO

CREATE TABLE [MerchantOrderAllocatedTags] (
    [Id] uniqueidentifier NOT NULL,
    [MerchantOrderId] uniqueidentifier NOT NULL,
    [MerchantOrderItemId] uniqueidentifier NOT NULL,
    [MerchantId] uniqueidentifier NOT NULL,
    [SmartTagId] uniqueidentifier NOT NULL,
    [TagCodeSnapshot] nvarchar(64) NOT NULL,
    [ProductVariantId] uniqueidentifier NOT NULL,
    [BatchId] uniqueidentifier NULL,
    [BatchNoSnapshot] nvarchar(64) NULL,
    [Status] nvarchar(32) NOT NULL,
    [AllocatedAt] datetimeoffset NOT NULL,
    [AllocatedByAdminUserId] uniqueidentifier NOT NULL,
    [WasAutomatic] bit NOT NULL,
    [SentToMerchantAt] datetimeoffset NULL,
    [ReleasedAt] datetimeoffset NULL,
    [ReleasedReason] nvarchar(500) NULL,
    [ReleasedByAdminUserId] uniqueidentifier NULL,
    [RowVersion] rowversion NOT NULL,
    CONSTRAINT [PK_MerchantOrderAllocatedTags] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_MerchantOrderAllocatedTags_AdminUsers_AllocatedByAdminUserId] FOREIGN KEY ([AllocatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_MerchantOrderAllocatedTags_AdminUsers_ReleasedByAdminUserId] FOREIGN KEY ([ReleasedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_MerchantOrderAllocatedTags_MerchantOrderItems_MerchantOrderItemId] FOREIGN KEY ([MerchantOrderItemId]) REFERENCES [MerchantOrderItems] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_MerchantOrderAllocatedTags_MerchantOrders_MerchantOrderId] FOREIGN KEY ([MerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_MerchantOrderAllocatedTags_Merchants_MerchantId] FOREIGN KEY ([MerchantId]) REFERENCES [Merchants] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_MerchantOrderAllocatedTags_SmartTagBatches_BatchId] FOREIGN KEY ([BatchId]) REFERENCES [SmartTagBatches] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_MerchantOrderAllocatedTags_SmartTags_SmartTagId] FOREIGN KEY ([SmartTagId]) REFERENCES [SmartTags] ([Id]) ON DELETE NO ACTION
);
GO

CREATE TABLE [MerchantDeliveryOrderItems] (
    [Id] uniqueidentifier NOT NULL,
    [MerchantDeliveryOrderId] uniqueidentifier NOT NULL,
    [MerchantOrderItemId] uniqueidentifier NOT NULL,
    [ProductNameSnapshot] nvarchar(200) NOT NULL,
    [SkuCodeSnapshot] nvarchar(64) NOT NULL,
    [OptionNameSnapshot] nvarchar(120) NOT NULL,
    [SupportsQrSnapshot] bit NOT NULL,
    [SupportsNfcSnapshot] bit NOT NULL,
    [OrderedQuantity] int NOT NULL,
    [AllocatedQuantity] int NOT NULL,
    [BatchSummarySnapshot] nvarchar(1000) NOT NULL,
    [SortOrder] int NOT NULL,
    CONSTRAINT [PK_MerchantDeliveryOrderItems] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_MerchantDeliveryOrderItems_MerchantDeliveryOrders_MerchantDeliveryOrderId] FOREIGN KEY ([MerchantDeliveryOrderId]) REFERENCES [MerchantDeliveryOrders] ([Id]) ON DELETE CASCADE
);
GO

CREATE INDEX [IX_MerchantOrders_FulfilmentStatus_CreatedAt] ON [MerchantOrders] ([FulfilmentStatus], [CreatedAt]);
GO

CREATE INDEX [IX_MerchantOrders_FulfilmentUpdatedByAdminUserId] ON [MerchantOrders] ([FulfilmentUpdatedByAdminUserId]);
GO

CREATE INDEX [IX_MerchantDeliveryOrderItems_MerchantDeliveryOrderId] ON [MerchantDeliveryOrderItems] ([MerchantDeliveryOrderId]);
GO

CREATE UNIQUE INDEX [IX_MerchantDeliveryOrders_DeliveryOrderNumber] ON [MerchantDeliveryOrders] ([DeliveryOrderNumber]);
GO

CREATE INDEX [IX_MerchantDeliveryOrders_IssuedByAdminUserId] ON [MerchantDeliveryOrders] ([IssuedByAdminUserId]);
GO

SET QUOTED_IDENTIFIER ON;
GO

CREATE UNIQUE INDEX [IX_MerchantDeliveryOrders_MerchantOrderId_Active] ON [MerchantDeliveryOrders] ([MerchantOrderId]) WHERE [CancelledAt] IS NULL;
GO

CREATE INDEX [IX_MerchantOrderAllocatedTags_AllocatedByAdminUserId] ON [MerchantOrderAllocatedTags] ([AllocatedByAdminUserId]);
GO

CREATE INDEX [IX_MerchantOrderAllocatedTags_BatchId] ON [MerchantOrderAllocatedTags] ([BatchId]);
GO

CREATE INDEX [IX_MerchantOrderAllocatedTags_MerchantId] ON [MerchantOrderAllocatedTags] ([MerchantId]);
GO

CREATE INDEX [IX_MerchantOrderAllocatedTags_MerchantOrderId_ReleasedAt] ON [MerchantOrderAllocatedTags] ([MerchantOrderId], [ReleasedAt]);
GO

CREATE INDEX [IX_MerchantOrderAllocatedTags_MerchantOrderItemId_ReleasedAt] ON [MerchantOrderAllocatedTags] ([MerchantOrderItemId], [ReleasedAt]);
GO

CREATE INDEX [IX_MerchantOrderAllocatedTags_ReleasedByAdminUserId] ON [MerchantOrderAllocatedTags] ([ReleasedByAdminUserId]);
GO

SET QUOTED_IDENTIFIER ON;
GO

CREATE UNIQUE INDEX [IX_MerchantOrderAllocatedTags_SmartTagId_Active] ON [MerchantOrderAllocatedTags] ([SmartTagId]) WHERE [ReleasedAt] IS NULL;
GO

ALTER TABLE [MerchantOrders] ADD CONSTRAINT [FK_MerchantOrders_AdminUsers_FulfilmentUpdatedByAdminUserId] FOREIGN KEY ([FulfilmentUpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION;
GO

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20260806023332_AddMerchantInventoryAllocation', N'8.0.26');
GO

COMMIT;
GO

