BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [PaymentReservationExpiredAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    ALTER TABLE [TagOrders] ADD [PaymentReservationExpiresAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    CREATE TABLE [OrderCheckoutSettings] (
        [Id] uniqueidentifier NOT NULL,
        [PaymentReservationMinutes] int NOT NULL,
        [UpdatedByAdminUserId] uniqueidentifier NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_OrderCheckoutSettings] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_OrderCheckoutSettings_AdminUsers_UpdatedByAdminUserId] FOREIGN KEY ([UpdatedByAdminUserId]) REFERENCES [AdminUsers] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CreatedAt', N'PaymentReservationMinutes', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[OrderCheckoutSettings]'))
        SET IDENTITY_INSERT [OrderCheckoutSettings] ON;
    EXEC(N'INSERT INTO [OrderCheckoutSettings] ([Id], [CreatedAt], [PaymentReservationMinutes], [UpdatedAt], [UpdatedByAdminUserId])
    VALUES (''4a2f6d18-9c31-4b7e-8f52-6d0a1b3c5e70'', ''2026-01-01T00:00:00.0000000+00:00'', 120, ''2026-01-01T00:00:00.0000000+00:00'', NULL)');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CreatedAt', N'PaymentReservationMinutes', N'UpdatedAt', N'UpdatedByAdminUserId') AND [object_id] = OBJECT_ID(N'[OrderCheckoutSettings]'))
        SET IDENTITY_INSERT [OrderCheckoutSettings] OFF;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    CREATE INDEX [IX_OrderCheckoutSettings_UpdatedByAdminUserId] ON [OrderCheckoutSettings] ([UpdatedByAdminUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    CREATE INDEX [IX_TagOrders_Status_PaymentReservationExpiresAt]
        ON [TagOrders] ([Status], [PaymentReservationExpiresAt])
        WHERE [PaymentReservationExpiresAt] IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    UPDATE orders
    SET orders.PaymentReservationExpiresAt = DATEADD(
        minute,
        (SELECT TOP (1) settings.PaymentReservationMinutes
         FROM OrderCheckoutSettings AS settings),
        SYSDATETIMEOFFSET())
    FROM TagOrders AS orders
    WHERE orders.Status = 'PendingPayment'
      AND orders.CancelledAt IS NULL
      AND orders.PaymentConfirmedAt IS NULL
      AND orders.PaymentReservationExpiresAt IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM PaymentProofs AS proofs
          WHERE proofs.OrderId = orders.Id
            AND proofs.Status IN ('PendingReview', 'Approved')
      );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260803082129_AddPaymentReservationExpiry'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260803082129_AddPaymentReservationExpiry', N'8.0.26');
END;
GO

COMMIT;
GO
