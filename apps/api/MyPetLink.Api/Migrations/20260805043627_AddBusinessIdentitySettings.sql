BEGIN TRANSACTION;
GO

CREATE TABLE [BusinessIdentitySettings] (
    [Id] uniqueidentifier NOT NULL,
    [BrandName] nvarchar(120) NOT NULL,
    [LegalBusinessName] nvarchar(200) NOT NULL,
    [BusinessRegistrationNumber] nvarchar(64) NOT NULL,
    [TaxIdentificationNumber] nvarchar(64) NULL,
    [SstRegistrationNumber] nvarchar(64) NULL,
    [RegisteredAddressLine1] nvarchar(240) NOT NULL,
    [RegisteredAddressLine2] nvarchar(240) NULL,
    [RegisteredPostcode] nvarchar(16) NOT NULL,
    [RegisteredCity] nvarchar(120) NOT NULL,
    [RegisteredState] nvarchar(120) NOT NULL,
    [RegisteredCountry] nvarchar(80) NOT NULL,
    [SupportEmail] nvarchar(254) NOT NULL,
    [BusinessPhone] nvarchar(32) NULL,
    [BusinessWebsite] nvarchar(200) NULL,
    [PaymentInstructions] nvarchar(2000) NULL,
    [BankAccountName] nvarchar(200) NULL,
    [BankName] nvarchar(120) NULL,
    [BankAccountNumber] nvarchar(64) NULL,
    [DuitNowDisplayName] nvarchar(120) NULL,
    [UpdatedAt] datetimeoffset NOT NULL,
    [UpdatedByAdminUserId] uniqueidentifier NULL,
    [RowVersion] rowversion NOT NULL,
    CONSTRAINT [PK_BusinessIdentitySettings] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_BusinessIdentitySettings_AdminUsers_UpdatedByAdminUserId] FOREIGN KEY ([UpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION
);
GO

IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'BankAccountName', N'BankAccountNumber', N'BankName', N'BrandName', N'BusinessPhone', N'BusinessRegistrationNumber', N'BusinessWebsite', N'DuitNowDisplayName', N'LegalBusinessName', N'PaymentInstructions', N'RegisteredAddressLine1', N'RegisteredAddressLine2', N'RegisteredCity', N'RegisteredCountry', N'RegisteredPostcode', N'RegisteredState', N'SstRegistrationNumber', N'SupportEmail', N'TaxIdentificationNumber', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[BusinessIdentitySettings]'))
    SET IDENTITY_INSERT [BusinessIdentitySettings] ON;
INSERT INTO [BusinessIdentitySettings] ([Id], [BankAccountName], [BankAccountNumber], [BankName], [BrandName], [BusinessPhone], [BusinessRegistrationNumber], [BusinessWebsite], [DuitNowDisplayName], [LegalBusinessName], [PaymentInstructions], [RegisteredAddressLine1], [RegisteredAddressLine2], [RegisteredCity], [RegisteredCountry], [RegisteredPostcode], [RegisteredState], [SstRegistrationNumber], [SupportEmail], [TaxIdentificationNumber], [UpdatedAt], [UpdatedByAdminUserId])
VALUES ('7c1f9b52-4d63-4a18-9e37-2b8c05f1d6a4', NULL, NULL, NULL, N'MyPetLink', NULL, N'202603141718 (AS0515813-P)', N'mypetlink.com.my', NULL, N'GBB Software Solutions', NULL, N'', NULL, N'', N'Malaysia', N'', N'', NULL, N'support@mypetlink.com.my', NULL, '2026-01-01T00:00:00.0000000+00:00', NULL);
IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'BankAccountName', N'BankAccountNumber', N'BankName', N'BrandName', N'BusinessPhone', N'BusinessRegistrationNumber', N'BusinessWebsite', N'DuitNowDisplayName', N'LegalBusinessName', N'PaymentInstructions', N'RegisteredAddressLine1', N'RegisteredAddressLine2', N'RegisteredCity', N'RegisteredCountry', N'RegisteredPostcode', N'RegisteredState', N'SstRegistrationNumber', N'SupportEmail', N'TaxIdentificationNumber', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[BusinessIdentitySettings]'))
    SET IDENTITY_INSERT [BusinessIdentitySettings] OFF;
GO

CREATE INDEX [IX_BusinessIdentitySettings_UpdatedByAdminUserId] ON [BusinessIdentitySettings] ([UpdatedByAdminUserId]);
GO

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20260805043627_AddBusinessIdentitySettings', N'8.0.26');
GO

COMMIT;
GO

