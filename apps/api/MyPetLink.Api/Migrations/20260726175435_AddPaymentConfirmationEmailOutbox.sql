BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726175435_AddPaymentConfirmationEmailOutbox'
)
BEGIN
    CREATE TABLE [EmailOutbox] (
        [Id] uniqueidentifier NOT NULL,
        [MessageType] nvarchar(64) NOT NULL,
        [RecipientEmail] nvarchar(320) NOT NULL,
        [RecipientName] nvarchar(160) NOT NULL,
        [Subject] nvarchar(240) NOT NULL,
        [TemplateDataJson] nvarchar(max) NOT NULL,
        [RelatedOrderId] uniqueidentifier NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [AttemptCount] int NOT NULL,
        [MaxAttempts] int NOT NULL,
        [NextAttemptAt] datetimeoffset NOT NULL,
        [LastAttemptAt] datetimeoffset NULL,
        [SentAt] datetimeoffset NULL,
        [LastError] nvarchar(600) NULL,
        [LockToken] uniqueidentifier NULL,
        [LockedUntil] datetimeoffset NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_EmailOutbox] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_EmailOutbox_TagOrders_RelatedOrderId] FOREIGN KEY ([RelatedOrderId]) REFERENCES [TagOrders] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726175435_AddPaymentConfirmationEmailOutbox'
)
BEGIN
    CREATE INDEX [IX_EmailOutbox_LockedUntil] ON [EmailOutbox] ([LockedUntil]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726175435_AddPaymentConfirmationEmailOutbox'
)
BEGIN
    CREATE UNIQUE INDEX [IX_EmailOutbox_RelatedOrderId_MessageType] ON [EmailOutbox] ([RelatedOrderId], [MessageType]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726175435_AddPaymentConfirmationEmailOutbox'
)
BEGIN
    CREATE INDEX [IX_EmailOutbox_Status_NextAttemptAt] ON [EmailOutbox] ([Status], [NextAttemptAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726175435_AddPaymentConfirmationEmailOutbox'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260726175435_AddPaymentConfirmationEmailOutbox', N'8.0.26');
END;
GO

COMMIT;
GO
