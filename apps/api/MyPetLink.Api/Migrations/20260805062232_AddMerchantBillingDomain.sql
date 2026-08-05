BEGIN TRANSACTION;
GO

CREATE TABLE [MerchantInvoices] (
    [Id] uniqueidentifier NOT NULL,
    [InvoiceNumber] nvarchar(48) NOT NULL,
    [MerchantOrderId] uniqueidentifier NOT NULL,
    [MerchantId] uniqueidentifier NOT NULL,
    [Seller_BrandName] nvarchar(120) NOT NULL,
    [Seller_LegalBusinessName] nvarchar(200) NOT NULL,
    [Seller_BusinessRegistrationNumber] nvarchar(64) NOT NULL,
    [Seller_TaxIdentificationNumber] nvarchar(64) NULL,
    [Seller_SstRegistrationNumber] nvarchar(64) NULL,
    [Seller_AddressLine1] nvarchar(240) NOT NULL,
    [Seller_AddressLine2] nvarchar(240) NULL,
    [Seller_Postcode] nvarchar(16) NOT NULL,
    [Seller_City] nvarchar(120) NOT NULL,
    [Seller_State] nvarchar(120) NOT NULL,
    [Seller_Country] nvarchar(80) NOT NULL,
    [Seller_SupportEmail] nvarchar(254) NOT NULL,
    [Seller_BusinessPhone] nvarchar(32) NULL,
    [Seller_BusinessWebsite] nvarchar(200) NULL,
    [Seller_PaymentInstructions] nvarchar(2000) NULL,
    [Seller_BankAccountName] nvarchar(200) NULL,
    [Seller_BankName] nvarchar(120) NULL,
    [Seller_BankAccountNumber] nvarchar(64) NULL,
    [Seller_DuitNowDisplayName] nvarchar(120) NULL,
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
    [MerchantOrderNumberSnapshot] nvarchar(48) NOT NULL,
    [SourceQuotationNumberSnapshot] nvarchar(48) NULL,
    [InvoiceDate] datetimeoffset NOT NULL,
    [DueDate] datetimeoffset NOT NULL,
    [PaymentTermSnapshot] nvarchar(32) NOT NULL,
    [Currency] nvarchar(3) NOT NULL,
    [MerchandiseSubtotal] decimal(18,2) NOT NULL,
    [DiscountTotal] decimal(18,2) NOT NULL,
    [DeliveryFee] decimal(18,2) NOT NULL,
    [GrandTotal] decimal(18,2) NOT NULL,
    [Status] nvarchar(32) NOT NULL,
    [IssuedAt] datetimeoffset NULL,
    [PaidAt] datetimeoffset NULL,
    [CancelledAt] datetimeoffset NULL,
    [InternalNotes] nvarchar(2000) NULL,
    [RowVersion] rowversion NOT NULL,
    [CreatedAt] datetimeoffset NOT NULL,
    [UpdatedAt] datetimeoffset NOT NULL,
    CONSTRAINT [PK_MerchantInvoices] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_MerchantInvoices_MerchantOrders_MerchantOrderId] FOREIGN KEY ([MerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_MerchantInvoices_Merchants_MerchantId] FOREIGN KEY ([MerchantId]) REFERENCES [Merchants] ([Id]) ON DELETE NO ACTION
);
GO

CREATE TABLE [MerchantInvoiceItems] (
    [Id] uniqueidentifier NOT NULL,
    [MerchantInvoiceId] uniqueidentifier NOT NULL,
    [ProductId] uniqueidentifier NOT NULL,
    [ProductVariantId] uniqueidentifier NOT NULL,
    [ProductNameSnapshot] nvarchar(200) NOT NULL,
    [SkuCodeSnapshot] nvarchar(64) NOT NULL,
    [OptionNameSnapshot] nvarchar(120) NOT NULL,
    [SupportsQrSnapshot] bit NOT NULL,
    [SupportsNfcSnapshot] bit NOT NULL,
    [Quantity] int NOT NULL,
    [WholesaleUnitPrice] decimal(18,2) NOT NULL,
    [LineDiscount] decimal(18,2) NOT NULL,
    [LineSubtotal] decimal(18,2) NOT NULL,
    [SortOrder] int NOT NULL,
    CONSTRAINT [PK_MerchantInvoiceItems] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_MerchantInvoiceItems_MerchantInvoices_MerchantInvoiceId] FOREIGN KEY ([MerchantInvoiceId]) REFERENCES [MerchantInvoices] ([Id]) ON DELETE CASCADE
);
GO

CREATE TABLE [MerchantPayments] (
    [Id] uniqueidentifier NOT NULL,
    [MerchantInvoiceId] uniqueidentifier NOT NULL,
    [MerchantOrderId] uniqueidentifier NOT NULL,
    [PaymentDate] datetimeoffset NOT NULL,
    [AmountReceived] decimal(18,2) NOT NULL,
    [Currency] nvarchar(3) NOT NULL,
    [Method] nvarchar(32) NOT NULL,
    [TransactionReference] nvarchar(120) NULL,
    [InternalNote] nvarchar(2000) NULL,
    [PaymentProofMediaFileId] uniqueidentifier NULL,
    [RecordedByAdminUserId] uniqueidentifier NULL,
    [RecordedAt] datetimeoffset NOT NULL,
    [RowVersion] rowversion NOT NULL,
    [CreatedAt] datetimeoffset NOT NULL,
    [UpdatedAt] datetimeoffset NOT NULL,
    CONSTRAINT [PK_MerchantPayments] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_MerchantPayments_AdminUsers_RecordedByAdminUserId] FOREIGN KEY ([RecordedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_MerchantPayments_MediaFiles_PaymentProofMediaFileId] FOREIGN KEY ([PaymentProofMediaFileId]) REFERENCES [MediaFiles] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_MerchantPayments_MerchantInvoices_MerchantInvoiceId] FOREIGN KEY ([MerchantInvoiceId]) REFERENCES [MerchantInvoices] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_MerchantPayments_MerchantOrders_MerchantOrderId] FOREIGN KEY ([MerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE NO ACTION
);
GO

CREATE TABLE [MerchantReceipts] (
    [Id] uniqueidentifier NOT NULL,
    [ReceiptNumber] nvarchar(48) NOT NULL,
    [MerchantInvoiceId] uniqueidentifier NOT NULL,
    [MerchantPaymentId] uniqueidentifier NOT NULL,
    [MerchantOrderId] uniqueidentifier NOT NULL,
    [MerchantId] uniqueidentifier NOT NULL,
    [Seller_BrandName] nvarchar(120) NOT NULL,
    [Seller_LegalBusinessName] nvarchar(200) NOT NULL,
    [Seller_BusinessRegistrationNumber] nvarchar(64) NOT NULL,
    [Seller_TaxIdentificationNumber] nvarchar(64) NULL,
    [Seller_SstRegistrationNumber] nvarchar(64) NULL,
    [Seller_AddressLine1] nvarchar(240) NOT NULL,
    [Seller_AddressLine2] nvarchar(240) NULL,
    [Seller_Postcode] nvarchar(16) NOT NULL,
    [Seller_City] nvarchar(120) NOT NULL,
    [Seller_State] nvarchar(120) NOT NULL,
    [Seller_Country] nvarchar(80) NOT NULL,
    [Seller_SupportEmail] nvarchar(254) NOT NULL,
    [Seller_BusinessPhone] nvarchar(32) NULL,
    [Seller_BusinessWebsite] nvarchar(200) NULL,
    [Seller_PaymentInstructions] nvarchar(2000) NULL,
    [Seller_BankAccountName] nvarchar(200) NULL,
    [Seller_BankName] nvarchar(120) NULL,
    [Seller_BankAccountNumber] nvarchar(64) NULL,
    [Seller_DuitNowDisplayName] nvarchar(120) NULL,
    [MerchantLegalNameSnapshot] nvarchar(200) NOT NULL,
    [MerchantTradingNameSnapshot] nvarchar(200) NULL,
    [MerchantRegistrationNumberSnapshot] nvarchar(64) NULL,
    [MerchantTaxIdentificationNumberSnapshot] nvarchar(64) NULL,
    [ContactPersonSnapshot] nvarchar(160) NOT NULL,
    [ContactEmailSnapshot] nvarchar(254) NOT NULL,
    [BillingAddressLine1Snapshot] nvarchar(240) NOT NULL,
    [BillingAddressLine2Snapshot] nvarchar(240) NULL,
    [BillingPostcodeSnapshot] nvarchar(16) NOT NULL,
    [BillingCitySnapshot] nvarchar(120) NOT NULL,
    [BillingStateSnapshot] nvarchar(120) NOT NULL,
    [BillingCountrySnapshot] nvarchar(80) NOT NULL,
    [InvoiceNumberSnapshot] nvarchar(48) NOT NULL,
    [MerchantOrderNumberSnapshot] nvarchar(48) NOT NULL,
    [PaymentDate] datetimeoffset NOT NULL,
    [PaymentMethod] nvarchar(32) NOT NULL,
    [TransactionReference] nvarchar(120) NULL,
    [Currency] nvarchar(3) NOT NULL,
    [MerchandiseSubtotal] decimal(18,2) NOT NULL,
    [DiscountTotal] decimal(18,2) NOT NULL,
    [DeliveryFee] decimal(18,2) NOT NULL,
    [AmountPaid] decimal(18,2) NOT NULL,
    [IssuedAt] datetimeoffset NOT NULL,
    [RowVersion] rowversion NOT NULL,
    [CreatedAt] datetimeoffset NOT NULL,
    [UpdatedAt] datetimeoffset NOT NULL,
    CONSTRAINT [PK_MerchantReceipts] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_MerchantReceipts_MerchantInvoices_MerchantInvoiceId] FOREIGN KEY ([MerchantInvoiceId]) REFERENCES [MerchantInvoices] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_MerchantReceipts_MerchantOrders_MerchantOrderId] FOREIGN KEY ([MerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_MerchantReceipts_MerchantPayments_MerchantPaymentId] FOREIGN KEY ([MerchantPaymentId]) REFERENCES [MerchantPayments] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_MerchantReceipts_Merchants_MerchantId] FOREIGN KEY ([MerchantId]) REFERENCES [Merchants] ([Id]) ON DELETE NO ACTION
);
GO

CREATE TABLE [SalesCommissions] (
    [Id] uniqueidentifier NOT NULL,
    [MerchantOrderId] uniqueidentifier NOT NULL,
    [MerchantPaymentId] uniqueidentifier NOT NULL,
    [SalespersonId] uniqueidentifier NOT NULL,
    [SalespersonCodeSnapshot] nvarchar(32) NOT NULL,
    [SalespersonNameSnapshot] nvarchar(160) NOT NULL,
    [CommissionPercentageSnapshot] decimal(5,2) NOT NULL,
    [CommissionBaseAmount] decimal(18,2) NOT NULL,
    [CommissionAmount] decimal(18,2) NOT NULL,
    [Currency] nvarchar(3) NOT NULL,
    [Status] nvarchar(32) NOT NULL,
    [CalculatedAt] datetimeoffset NOT NULL,
    [PaidAt] datetimeoffset NULL,
    [ReversedAt] datetimeoffset NULL,
    [InternalNote] nvarchar(2000) NULL,
    [RowVersion] rowversion NOT NULL,
    [CreatedAt] datetimeoffset NOT NULL,
    [UpdatedAt] datetimeoffset NOT NULL,
    CONSTRAINT [PK_SalesCommissions] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_SalesCommissions_MerchantOrders_MerchantOrderId] FOREIGN KEY ([MerchantOrderId]) REFERENCES [MerchantOrders] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_SalesCommissions_MerchantPayments_MerchantPaymentId] FOREIGN KEY ([MerchantPaymentId]) REFERENCES [MerchantPayments] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_SalesCommissions_Salespersons_SalespersonId] FOREIGN KEY ([SalespersonId]) REFERENCES [Salespersons] ([Id]) ON DELETE NO ACTION
);
GO

CREATE TABLE [MerchantReceiptItems] (
    [Id] uniqueidentifier NOT NULL,
    [MerchantReceiptId] uniqueidentifier NOT NULL,
    [ProductNameSnapshot] nvarchar(200) NOT NULL,
    [SkuCodeSnapshot] nvarchar(64) NOT NULL,
    [OptionNameSnapshot] nvarchar(120) NOT NULL,
    [Quantity] int NOT NULL,
    [WholesaleUnitPrice] decimal(18,2) NOT NULL,
    [LineDiscount] decimal(18,2) NOT NULL,
    [LineSubtotal] decimal(18,2) NOT NULL,
    [SortOrder] int NOT NULL,
    CONSTRAINT [PK_MerchantReceiptItems] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_MerchantReceiptItems_MerchantReceipts_MerchantReceiptId] FOREIGN KEY ([MerchantReceiptId]) REFERENCES [MerchantReceipts] ([Id]) ON DELETE CASCADE
);
GO

CREATE INDEX [IX_MerchantInvoiceItems_MerchantInvoiceId] ON [MerchantInvoiceItems] ([MerchantInvoiceId]);
GO

CREATE UNIQUE INDEX [IX_MerchantInvoices_InvoiceNumber] ON [MerchantInvoices] ([InvoiceNumber]);
GO

CREATE INDEX [IX_MerchantInvoices_MerchantId] ON [MerchantInvoices] ([MerchantId]);
GO

SET QUOTED_IDENTIFIER ON;
GO

EXEC(N'CREATE UNIQUE INDEX [IX_MerchantInvoices_MerchantOrderId] ON [MerchantInvoices] ([MerchantOrderId]) WHERE [Status] <> ''Cancelled''');
GO

CREATE INDEX [IX_MerchantInvoices_Status_InvoiceDate] ON [MerchantInvoices] ([Status], [InvoiceDate]);
GO

CREATE UNIQUE INDEX [IX_MerchantPayments_MerchantInvoiceId] ON [MerchantPayments] ([MerchantInvoiceId]);
GO

CREATE INDEX [IX_MerchantPayments_MerchantOrderId] ON [MerchantPayments] ([MerchantOrderId]);
GO

CREATE INDEX [IX_MerchantPayments_PaymentProofMediaFileId] ON [MerchantPayments] ([PaymentProofMediaFileId]);
GO

CREATE INDEX [IX_MerchantPayments_RecordedByAdminUserId] ON [MerchantPayments] ([RecordedByAdminUserId]);
GO

CREATE INDEX [IX_MerchantReceiptItems_MerchantReceiptId] ON [MerchantReceiptItems] ([MerchantReceiptId]);
GO

CREATE INDEX [IX_MerchantReceipts_MerchantId] ON [MerchantReceipts] ([MerchantId]);
GO

CREATE UNIQUE INDEX [IX_MerchantReceipts_MerchantInvoiceId] ON [MerchantReceipts] ([MerchantInvoiceId]);
GO

CREATE INDEX [IX_MerchantReceipts_MerchantOrderId] ON [MerchantReceipts] ([MerchantOrderId]);
GO

CREATE UNIQUE INDEX [IX_MerchantReceipts_MerchantPaymentId] ON [MerchantReceipts] ([MerchantPaymentId]);
GO

CREATE UNIQUE INDEX [IX_MerchantReceipts_ReceiptNumber] ON [MerchantReceipts] ([ReceiptNumber]);
GO

CREATE INDEX [IX_SalesCommissions_MerchantOrderId] ON [SalesCommissions] ([MerchantOrderId]);
GO

CREATE UNIQUE INDEX [IX_SalesCommissions_MerchantPaymentId] ON [SalesCommissions] ([MerchantPaymentId]);
GO

CREATE INDEX [IX_SalesCommissions_SalespersonId_Status] ON [SalesCommissions] ([SalespersonId], [Status]);
GO

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20260805062232_AddMerchantBillingDomain', N'8.0.26');
GO

COMMIT;
GO

