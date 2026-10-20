BEGIN TRANSACTION;
GO

IF EXISTS(SELECT 1 FROM ConsignmentStockLedgerEntries WITH(TABLOCKX,HOLDLOCK))
  OR EXISTS(SELECT 1 FROM ConsignmentSalesReports WITH(TABLOCKX,HOLDLOCK))
  OR EXISTS(SELECT 1 FROM ConsignmentPriceTerms WITH(TABLOCKX,HOLDLOCK))
  OR EXISTS(SELECT 1 FROM ConsignmentReviewEvents WITH(TABLOCKX,HOLDLOCK) WHERE SubjectType IS NOT NULL)
  OR EXISTS(SELECT 1 FROM ConsignmentHandoverRecords WITH(TABLOCKX,HOLDLOCK) WHERE Attribution IS NOT NULL)
    THROW 51044, 'Consignment rollback blocked: retain sales reports, selling prices and stock ledger history.', 1;
GO

DROP TABLE [ConsignmentSalesReportLines];
GO

DROP TABLE [ConsignmentStockLedgerEntries];
GO

DROP TABLE [ConsignmentPriceTerms];
GO

DROP TABLE [ConsignmentSalesReports];
GO

DROP INDEX [IX_ConsignmentReviewEvents_DispatchId_Action] ON [ConsignmentReviewEvents];
GO

DROP INDEX [IX_ConsignmentReviewEvents_SubjectType_SubjectId] ON [ConsignmentReviewEvents];
GO

DECLARE @var0 sysname;
SELECT @var0 = [d].[name]
FROM [sys].[default_constraints] [d]
INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
WHERE ([d].[parent_object_id] = OBJECT_ID(N'[ConsignmentReviewEvents]') AND [c].[name] = N'SubjectId');
IF @var0 IS NOT NULL EXEC(N'ALTER TABLE [ConsignmentReviewEvents] DROP CONSTRAINT [' + @var0 + '];');
ALTER TABLE [ConsignmentReviewEvents] DROP COLUMN [SubjectId];
GO

DECLARE @var1 sysname;
SELECT @var1 = [d].[name]
FROM [sys].[default_constraints] [d]
INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
WHERE ([d].[parent_object_id] = OBJECT_ID(N'[ConsignmentReviewEvents]') AND [c].[name] = N'SubjectType');
IF @var1 IS NOT NULL EXEC(N'ALTER TABLE [ConsignmentReviewEvents] DROP CONSTRAINT [' + @var1 + '];');
ALTER TABLE [ConsignmentReviewEvents] DROP COLUMN [SubjectType];
GO

DECLARE @var2 sysname;
SELECT @var2 = [d].[name]
FROM [sys].[default_constraints] [d]
INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
WHERE ([d].[parent_object_id] = OBJECT_ID(N'[ConsignmentHandoverRecords]') AND [c].[name] = N'Attribution');
IF @var2 IS NOT NULL EXEC(N'ALTER TABLE [ConsignmentHandoverRecords] DROP CONSTRAINT [' + @var2 + '];');
ALTER TABLE [ConsignmentHandoverRecords] DROP COLUMN [Attribution];
GO

CREATE INDEX [IX_ConsignmentReviewEvents_DispatchId_Action_RequestReference] ON [ConsignmentReviewEvents] ([DispatchId], [Action], [RequestReference]);
GO

DELETE FROM [__EFMigrationsHistory]
WHERE [MigrationId] = N'20261018125029_AddConsignmentSalesReportingLedger';
GO

COMMIT;
GO

