BEGIN TRANSACTION;
GO

ALTER TABLE [PaymentProofs] ADD [SubmittedAmount] decimal(18,2) NULL;
GO

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20260731173221_AddPaymentProofSubmittedAmount', N'8.0.26');
GO

COMMIT;
GO
