-- MyPetLink Smart Tag stock purpose, script 4 of 4: ROLLBACK ONE CLASSIFICATION RUN
-- --------------------------------------------------------------------------------
-- Reverses exactly the tags one run of script 02 changed, back to the value
-- each held before (recorded in that run's AuditLogs rows). DRY RUN BY
-- DEFAULT: with @Commit = 0 everything is rolled back after the report.
--
-- It never overwrites a later, legitimate change: a tag whose StockPurpose no
-- longer equals what the run set is skipped and listed. Nothing but
-- StockPurpose changes, and that is proven before commit, exactly as in
-- script 02. Every reverted tag gets its own audit row.
--
-- Rolling back Sale makes those units unsellable again (Unclassified). Orders
-- and allocations already made keep their existing flows; nothing is
-- cancelled, released or reassigned.
--
-- This reverses DATA only. To remove the column itself, first redeploy the
-- previous API, then run the migration's Down step (see the separation report).
-- Run with sqlcmd -I, or any client with QUOTED_IDENTIFIER ON.

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCK_TIMEOUT 10000;
SET DEADLOCK_PRIORITY LOW;

-- 0 = dry run (rolled back). 1 = commit.
DECLARE @Commit bit = 0;
-- The RunId script 02 printed (also in its AuditLogs rows). Required.
DECLARE @RunId uniqueidentifier = NULL;

DECLARE @RunIdText nvarchar(36) = LOWER(CONVERT(nvarchar(36), @RunId));
DECLARE @RollbackId uniqueidentifier = NEWID();
DECLARE @Now datetimeoffset = SYSDATETIMEOFFSET();
DECLARE @Source nvarchar(80) = N'04-rollback-smart-tag-stock-purpose.sql';
DECLARE @Message nvarchar(2048);
DECLARE @Rows int;
DECLARE @LockResult int;
DECLARE @Resource nvarchar(255);

IF @RunId IS NULL
    THROW 52101, N'Set @RunId to the run to roll back (printed by script 02). Nothing was changed.', 1;

-- The run's changes, from its own audit rows.
DECLARE @Run TABLE (TagId uniqueidentifier NOT NULL PRIMARY KEY, FromPurpose nvarchar(32) NOT NULL, ToPurpose nvarchar(32) NOT NULL);
INSERT INTO @Run (TagId, FromPurpose, ToPurpose)
SELECT l.EntityId, JSON_VALUE(l.OldValue, N'$.stockPurpose'), JSON_VALUE(l.NewValue, N'$.stockPurpose')
FROM dbo.AuditLogs l
WHERE l.Action = N'tag-inventory.stock-purpose.classify'
  AND l.Entity = N'SmartTag'
  AND ISJSON(l.NewValue) = 1 AND ISJSON(l.OldValue) = 1
  AND JSON_VALUE(l.NewValue, N'$.runId') = @RunIdText;

IF NOT EXISTS (SELECT 1 FROM @Run)
BEGIN
    SET @Message = CONCAT(N'No classification run ', @RunIdText, N' was found. Nothing was changed.');
    THROW 52102, @Message, 1;
END;

IF EXISTS (SELECT 1 FROM @Run WHERE FromPurpose NOT IN (N'Unclassified', N'Sale', N'Test') OR ToPurpose NOT IN (N'Unclassified', N'Sale', N'Test'))
    THROW 52103, N'The run''s audit rows hold an unexpected stock purpose. Nothing was changed.', 1;

IF EXISTS (SELECT 1 FROM dbo.AuditLogs l
           WHERE l.Action = N'tag-inventory.stock-purpose.rollback' AND ISJSON(l.NewValue) = 1
             AND JSON_VALUE(l.NewValue, N'$.rolledBackRunId') = @RunIdText)
BEGIN
    SET @Message = CONCAT(N'Run ', @RunIdText, N' was already rolled back. Nothing was changed.');
    THROW 52104, @Message, 1;
END;

BEGIN TRANSACTION;

DECLARE @Locks TABLE (Resource nvarchar(255) COLLATE Latin1_General_BIN2 NOT NULL PRIMARY KEY);
INSERT INTO @Locks (Resource)
SELECT DISTINCT CONCAT(N'MyPetLink:TagOrderInventory:', LOWER(REPLACE(CONVERT(nvarchar(36), t.ProductVariantId), N'-', N'')))
FROM dbo.SmartTags t JOIN @Run r ON r.TagId = t.Id
WHERE t.ProductVariantId IS NOT NULL;

SET @Resource = (SELECT MIN(Resource) FROM @Locks);
WHILE @Resource IS NOT NULL
BEGIN
    EXEC @LockResult = sys.sp_getapplock @Resource = @Resource, @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 10000;
    IF @LockResult < 0
    BEGIN
        SET @Message = CONCAT(N'Inventory for ', @Resource, N' is busy (', @LockResult, N'). Nothing was changed; run again in a moment.');
        THROW 52105, @Message, 1;
    END;
    SET @Resource = (SELECT MIN(Resource) FROM @Locks WHERE Resource > @Resource);
END;

DECLARE @Before TABLE (
    Id uniqueidentifier NOT NULL PRIMARY KEY, TagCode nvarchar(32) NOT NULL, Status nvarchar(32) NOT NULL,
    FulfilmentStatus nvarchar(32) NOT NULL, QaStatus nvarchar(32) NULL, QaVersion int NOT NULL,
    QaShipmentReference nvarchar(100) NULL, QaNfcSerialNumber nvarchar(100) NULL, QaQrUrl nvarchar(600) NULL,
    QaNfcUrl nvarchar(600) NULL, OwnerUserId uniqueidentifier NULL, PetId uniqueidentifier NULL,
    OrderId uniqueidentifier NULL, OrderItemId uniqueidentifier NULL, BatchId uniqueidentifier NULL,
    ProductVariantId uniqueidentifier NULL, HasNfc bit NOT NULL, Variant nvarchar(80) NOT NULL,
    ArchivedAt datetimeoffset NULL, DeletedAt datetimeoffset NULL, ActivatedAt datetimeoffset NULL,
    AssignmentVersion int NOT NULL, UpdatedAt datetimeoffset NOT NULL);
INSERT INTO @Before
SELECT t.Id, t.TagCode, t.Status, t.FulfilmentStatus, t.QaStatus, t.QaVersion, t.QaShipmentReference, t.QaNfcSerialNumber,
       t.QaQrUrl, t.QaNfcUrl, t.OwnerUserId, t.PetId, t.OrderId, t.OrderItemId, t.BatchId, t.ProductVariantId, t.HasNfc,
       t.Variant, t.ArchivedAt, t.DeletedAt, t.ActivatedAt, t.AssignmentVersion, t.UpdatedAt
FROM dbo.SmartTags t WITH (UPDLOCK, HOLDLOCK)
WHERE t.Id IN (SELECT TagId FROM @Run);

-- Only tags still holding exactly what the run set.
DECLARE @Expected int = (SELECT COUNT(*) FROM dbo.SmartTags t JOIN @Run r ON r.TagId = t.Id WHERE t.StockPurpose = r.ToPurpose);

DECLARE @Reverted TABLE (TagId uniqueidentifier NOT NULL PRIMARY KEY, TagCode nvarchar(32) NOT NULL,
    FromPurpose nvarchar(32) NOT NULL, ToPurpose nvarchar(32) NOT NULL);
UPDATE t SET t.StockPurpose = r.FromPurpose
OUTPUT inserted.Id, inserted.TagCode, deleted.StockPurpose, inserted.StockPurpose INTO @Reverted
FROM dbo.SmartTags t JOIN @Run r ON r.TagId = t.Id
WHERE t.StockPurpose = r.ToPurpose;
SET @Rows = @@ROWCOUNT;
IF @Rows <> @Expected
BEGIN
    SET @Message = CONCAT(N'Expected to revert ', @Expected, N' tags but ', @Rows, N' changed. Rolled back.');
    THROW 52110, @Message, 1;
END;

INSERT INTO dbo.AuditLogs (Id, ActorId, ActorType, Action, Entity, EntityId, OldValue, NewValue, IpAddress, UserAgent, CreatedAt)
SELECT NEWID(), NULL, N'System', N'tag-inventory.stock-purpose.rollback', N'SmartTag', v.TagId,
       CONCAT(N'{"stockPurpose":"', v.FromPurpose, N'"}'),
       CONCAT(N'{"stockPurpose":"', v.ToPurpose, N'","tagCode":"', v.TagCode, N'","rolledBackRunId":"', @RunIdText,
              N'","runId":"', LOWER(CONVERT(nvarchar(36), @RollbackId)), N'","source":"', @Source, N'"}'),
       NULL, NULL, @Now
FROM @Reverted v;

IF EXISTS (
    SELECT t.Id, t.TagCode, t.Status, t.FulfilmentStatus, t.QaStatus, t.QaVersion, t.QaShipmentReference, t.QaNfcSerialNumber,
           t.QaQrUrl, t.QaNfcUrl, t.OwnerUserId, t.PetId, t.OrderId, t.OrderItemId, t.BatchId, t.ProductVariantId, t.HasNfc,
           t.Variant, t.ArchivedAt, t.DeletedAt, t.ActivatedAt, t.AssignmentVersion, t.UpdatedAt
    FROM dbo.SmartTags t WHERE t.Id IN (SELECT TagId FROM @Run)
    EXCEPT
    SELECT * FROM @Before)
    THROW 52111, N'A column other than StockPurpose changed. Rolled back.', 1;

SELECT
    @RunId AS RolledBackRunId,
    CASE WHEN @Commit = 1 THEN N'COMMITTED' ELSE N'DRY RUN (rolled back)' END AS Mode,
    (SELECT COUNT(*) FROM @Run) AS TagsInRun,
    (SELECT COUNT(*) FROM @Reverted) AS Reverted,
    (SELECT COUNT(*) FROM @Run) - (SELECT COUNT(*) FROM @Reverted) AS SkippedBecauseChangedSince;

-- Skipped: their stock purpose changed after the run; left exactly as they are.
SELECT t.TagCode, r.ToPurpose AS SetByRun, t.StockPurpose AS CurrentPurpose
FROM dbo.SmartTags t JOIN @Run r ON r.TagId = t.Id
WHERE NOT EXISTS (SELECT 1 FROM @Reverted v WHERE v.TagId = t.Id)
ORDER BY t.TagCode;

-- Reverted units already committed to a customer since the run: they keep
-- their order or allocation; only future sales are affected.
SELECT t.TagCode, t.Status, t.QaStatus, o.OrderNumber, o.Status AS OrderStatus,
       CASE WHEN EXISTS (SELECT 1 FROM dbo.MerchantOrderAllocatedTags a WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL)
            THEN 1 ELSE 0 END AS MerchantAllocated
FROM dbo.SmartTags t
JOIN @Reverted v ON v.TagId = t.Id
LEFT JOIN dbo.TagOrders o ON o.Id = t.OrderId
WHERE t.OrderId IS NOT NULL OR t.OwnerUserId IS NOT NULL
   OR EXISTS (SELECT 1 FROM dbo.MerchantOrderAllocatedTags a WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL)
ORDER BY t.TagCode;

IF @Commit = 1
BEGIN
    COMMIT TRANSACTION;
    PRINT CONCAT(N'Committed rollback of run ', @RunIdText, N'. Run script 03 to see the resulting state.');
END
ELSE
BEGIN
    ROLLBACK TRANSACTION;
    PRINT N'Dry run only: everything above was rolled back. Set @Commit = 1 to apply.';
END;
