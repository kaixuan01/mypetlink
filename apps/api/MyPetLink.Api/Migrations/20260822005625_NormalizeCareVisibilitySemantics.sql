BEGIN TRANSACTION;
GO

UPDATE [CareRecords]
SET [PublicVisibility] = N'PublicBadgeOnly'
WHERE [PublicVisibility] = N'PublicDetails';
GO

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20260822005625_NormalizeCareVisibilitySemantics', N'8.0.26');
GO

COMMIT;
GO
