BEGIN TRANSACTION;
GO

ALTER TABLE [TagScans] ADD [Source] nvarchar(16) NOT NULL DEFAULT N'Legacy';
GO

CREATE INDEX [IX_TagScans_SmartTagId_Source_ScanTime] ON [TagScans] ([SmartTagId], [Source], [ScanTime]);
GO

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20260723064015_AddTagScanSource', N'8.0.26');
GO

COMMIT;
GO

