BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    DROP INDEX [IX_EmailOutbox_RelatedOrderId_MessageType] ON [EmailOutbox];
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    ALTER TABLE [ExternalLogins] ADD [EmailVerifiedAt] datetimeoffset NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    DECLARE @var0 sysname;
    SELECT @var0 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[EmailOutbox]') AND [c].[name] = N'RelatedOrderId');
    IF @var0 IS NOT NULL EXEC(N'ALTER TABLE [EmailOutbox] DROP CONSTRAINT [' + @var0 + '];');
    ALTER TABLE [EmailOutbox] ALTER COLUMN [RelatedOrderId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    ALTER TABLE [EmailOutbox] ADD [RelatedUserId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_EmailOutbox_RelatedOrderId_MessageType] ON [EmailOutbox] ([RelatedOrderId], [MessageType]) WHERE [RelatedOrderId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_EmailOutbox_RelatedUserId_MessageType] ON [EmailOutbox] ([RelatedUserId], [MessageType]) WHERE [RelatedUserId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    EXEC(N'ALTER TABLE [EmailOutbox] ADD CONSTRAINT [CK_EmailOutbox_RelatedEntity] CHECK (([RelatedOrderId] IS NOT NULL AND [RelatedUserId] IS NULL) OR ([RelatedOrderId] IS NULL AND [RelatedUserId] IS NOT NULL))');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    ALTER TABLE [EmailOutbox] ADD CONSTRAINT [FK_EmailOutbox_Users_RelatedUserId] FOREIGN KEY ([RelatedUserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260726183156_AddOwnerWelcomeEmail'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260726183156_AddOwnerWelcomeEmail', N'8.0.26');
END;
GO

COMMIT;
GO
