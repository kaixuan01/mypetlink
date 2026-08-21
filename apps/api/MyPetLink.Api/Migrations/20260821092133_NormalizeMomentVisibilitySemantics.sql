BEGIN TRANSACTION;
GO

UPDATE [PetMemories]
SET [Visibility] = N'Private'
WHERE [Visibility] = N'FamilyOnly';
GO

UPDATE [PetMemories]
SET [ShowOnPublicProfile] = CASE
    WHEN [Visibility] = N'Public' THEN CAST(1 AS bit)
    ELSE CAST(0 AS bit)
END
WHERE [ShowOnPublicProfile] <> CASE
    WHEN [Visibility] = N'Public' THEN CAST(1 AS bit)
    ELSE CAST(0 AS bit)
END;
GO

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20260821092133_NormalizeMomentVisibilitySemantics', N'8.0.26');
GO

COMMIT;
GO
