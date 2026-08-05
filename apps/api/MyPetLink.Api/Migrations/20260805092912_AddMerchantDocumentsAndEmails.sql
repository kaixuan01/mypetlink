BEGIN TRANSACTION;
GO

ALTER TABLE [EmailOutbox] DROP CONSTRAINT [CK_EmailOutbox_RelatedEntity];
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_AddressLine1] nvarchar(240) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_AddressLine2] nvarchar(240) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_BankAccountName] nvarchar(200) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_BankAccountNumber] nvarchar(64) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_BankName] nvarchar(120) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_BrandName] nvarchar(120) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_BusinessPhone] nvarchar(32) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_BusinessRegistrationNumber] nvarchar(64) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_BusinessWebsite] nvarchar(200) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_City] nvarchar(120) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_Country] nvarchar(80) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_DuitNowDisplayName] nvarchar(120) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_LegalBusinessName] nvarchar(200) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_PaymentInstructions] nvarchar(2000) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_Postcode] nvarchar(16) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_SstRegistrationNumber] nvarchar(64) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_State] nvarchar(120) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_SupportEmail] nvarchar(254) NULL;
GO

ALTER TABLE [MerchantQuotations] ADD [Seller_TaxIdentificationNumber] nvarchar(64) NULL;
GO

ALTER TABLE [EmailOutbox] ADD [RelatedMerchantInvoiceId] uniqueidentifier NULL;
GO

ALTER TABLE [EmailOutbox] ADD [RelatedMerchantQuotationId] uniqueidentifier NULL;
GO

SET QUOTED_IDENTIFIER ON;
GO

EXEC(N'CREATE UNIQUE INDEX [IX_EmailOutbox_RelatedMerchantInvoiceId_MessageType] ON [EmailOutbox] ([RelatedMerchantInvoiceId], [MessageType]) WHERE [RelatedMerchantInvoiceId] IS NOT NULL');
GO

SET QUOTED_IDENTIFIER ON;
GO

EXEC(N'CREATE UNIQUE INDEX [IX_EmailOutbox_RelatedMerchantQuotationId_MessageType] ON [EmailOutbox] ([RelatedMerchantQuotationId], [MessageType]) WHERE [RelatedMerchantQuotationId] IS NOT NULL');
GO

ALTER TABLE [EmailOutbox] ADD CONSTRAINT [CK_EmailOutbox_RelatedEntity] CHECK ((CASE WHEN [RelatedOrderId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedUserId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantQuotationId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantInvoiceId] IS NULL THEN 0 ELSE 1 END) = 1);
GO

ALTER TABLE [EmailOutbox] ADD CONSTRAINT [FK_EmailOutbox_MerchantInvoices_RelatedMerchantInvoiceId] FOREIGN KEY ([RelatedMerchantInvoiceId]) REFERENCES [MerchantInvoices] ([Id]) ON DELETE NO ACTION;
GO

ALTER TABLE [EmailOutbox] ADD CONSTRAINT [FK_EmailOutbox_MerchantQuotations_RelatedMerchantQuotationId] FOREIGN KEY ([RelatedMerchantQuotationId]) REFERENCES [MerchantQuotations] ([Id]) ON DELETE NO ACTION;
GO

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20260805092912_AddMerchantDocumentsAndEmails', N'8.0.26');
GO

COMMIT;
GO

