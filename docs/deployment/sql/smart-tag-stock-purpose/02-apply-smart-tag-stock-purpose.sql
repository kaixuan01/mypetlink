-- MyPetLink Smart Tag stock purpose, script 2 of 4: APPLY
-- -------------------------------------------------------
-- Classifies the confirmed commercial batches as Sale and, only when listed,
-- verified testing samples as Test. DRY RUN BY DEFAULT: with @Commit = 0 the
-- whole run happens inside a transaction that is rolled back, so you see
-- exactly what would change and nothing does.
--
-- Requires the AddSmartTagStockPurpose migration. Without it this script stops
-- at compile time ("Invalid column name 'StockPurpose'") and changes nothing.
-- Run with sqlcmd -I, or any client with QUOTED_IDENTIFIER ON.
--
-- Guarantees:
--   * Identity by exact batch number (commercial) and exact tag code (testing),
--     never by SKU alone. Every batch's SKU, quantity and membership is checked.
--   * Only the StockPurpose column changes. QA status, tag codes, QR/NFC data,
--     lifecycle, fulfilment, ownership, pets, orders, allocations, payments,
--     prices and UpdatedAt are snapshotted and proven unchanged before commit.
--   * Only Unclassified rows are written; rows already at the target are
--     counted as already applied, so re-running is safe (idempotent). A row
--     holding the OTHER purpose stops the script: it is never flipped silently.
--   * Every changed tag gets an AuditLogs row carrying this run's RunId, which
--     script 04 uses to roll back exactly this run.
--   * The per-SKU inventory locks the API uses are held for the whole write,
--     so no checkout or QA decision interleaves with it.
--   * Any unexpected count throws, and XACT_ABORT rolls everything back.
--
-- Keep @SaleBatches and @TestTags identical to scripts 01 and 03.
-- See docs/operations/smart-tag-stock-purpose-separation.md.

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCK_TIMEOUT 10000;
SET DEADLOCK_PRIORITY LOW;

-- 0 = dry run (rolled back). 1 = commit. Commit only after a reviewed dry run.
DECLARE @Commit bit = 0;

DECLARE @SaleBatches TABLE (
    BatchNo nvarchar(80) NOT NULL PRIMARY KEY,
    Sku nvarchar(80) NOT NULL,
    ExpectedQuantity int NOT NULL);
INSERT INTO @SaleBatches (BatchNo, Sku, ExpectedQuantity) VALUES
    (N'MPL-BAT-260911002807-9263', N'MYBOSS-LW-QR-NFC', 300),
    (N'MPL-BAT-260911002857-1515', N'PAWSOME-LW-QR-NFC', 300),
    (N'MPL-BAT-260911002959-6486', N'PAWSOME-SD-QR-NFC', 300);

-- Verified testing samples only: exact tag code and expected SKU, confirmed
-- from script 01 result set 4. Leave empty to classify only commercial stock.
DECLARE @TestTags TABLE (
    TagCode nvarchar(32) NOT NULL PRIMARY KEY,
    Sku nvarchar(80) NOT NULL);
-- INSERT INTO @TestTags (TagCode, Sku) VALUES
--     (N'MPL-XXXX-XXXX', N'MYBOSS-LW-QR-NFC'),
--     (N'MPL-YYYY-YYYY', N'MYBOSS-LW-QR-NFC'),
--     (N'MPL-ZZZZ-ZZZZ', N'PAWSOME-LW-QR-NFC'),
--     (N'MPL-WWWW-WWWW', N'PAWSOME-LW-QR-NFC');

-- Must equal the number of codes listed above: a second, independent count.
DECLARE @ExpectedTestCount int = 0;

DECLARE @RunId uniqueidentifier = NEWID();
DECLARE @RunIdText nvarchar(36) = LOWER(CONVERT(nvarchar(36), @RunId));
DECLARE @Now datetimeoffset = SYSDATETIMEOFFSET();
DECLARE @Source nvarchar(80) = N'02-apply-smart-tag-stock-purpose.sql';
DECLARE @Message nvarchar(2048);
DECLARE @Rows int;
DECLARE @LockResult int;
DECLARE @Resource nvarchar(255);

-- --- Configuration checks (no data read yet) ---------------------------------

IF (SELECT COUNT(*) FROM @TestTags) <> @ExpectedTestCount
BEGIN
    SET @Message = CONCAT(N'@TestTags lists ', (SELECT COUNT(*) FROM @TestTags), N' codes but @ExpectedTestCount is ', @ExpectedTestCount, N'. Nothing was changed.');
    THROW 52001, @Message, 1;
END;

IF OBJECT_ID(N'dbo.CK_SmartTags_StockPurpose', N'C') IS NULL
    THROW 52002, N'The StockPurpose check constraint is missing: apply the AddSmartTagStockPurpose migration first. Nothing was changed.', 1;

BEGIN TRANSACTION;

-- --- Lock every SKU involved, in the API's lock order --------------------------
-- Same resource names as SqlServerInventoryReservationLock.InventoryResources
-- ("MyPetLink:TagOrderInventory:" + variant id, 32 lowercase hex digits), taken
-- in ordinal order, owned by this transaction.

DECLARE @Locks TABLE (Resource nvarchar(255) COLLATE Latin1_General_BIN2 NOT NULL PRIMARY KEY);
INSERT INTO @Locks (Resource)
SELECT DISTINCT CONCAT(N'MyPetLink:TagOrderInventory:', LOWER(REPLACE(CONVERT(nvarchar(36), v.Id), N'-', N'')))
FROM dbo.TagProductVariants v
WHERE v.Sku IN (SELECT Sku FROM @SaleBatches UNION SELECT Sku FROM @TestTags)
   OR v.Id IN (SELECT b.ProductVariantId FROM dbo.SmartTagBatches b JOIN @SaleBatches sb ON sb.BatchNo = b.BatchNo)
   OR v.Id IN (SELECT t.ProductVariantId FROM dbo.SmartTags t JOIN @TestTags tt ON tt.TagCode = t.TagCode);

SET @Resource = (SELECT MIN(Resource) FROM @Locks);
WHILE @Resource IS NOT NULL
BEGIN
    EXEC @LockResult = sys.sp_getapplock @Resource = @Resource, @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 10000;
    IF @LockResult < 0
    BEGIN
        SET @Message = CONCAT(N'Inventory for ', @Resource, N' is busy (', @LockResult, N'). Nothing was changed; run again in a moment.');
        THROW 52003, @Message, 1;
    END;
    SET @Resource = (SELECT MIN(Resource) FROM @Locks WHERE Resource > @Resource);
END;

-- --- Commercial batches: identity, SKU, quantity, membership --------------------

DECLARE @Batches TABLE (
    BatchNo nvarchar(80) NOT NULL PRIMARY KEY,
    BatchId uniqueidentifier NULL,
    ProductVariantId uniqueidentifier NULL,
    Sku nvarchar(80) NULL,
    ExpectedSku nvarchar(80) NOT NULL,
    BatchQuantity int NULL,
    ExpectedQuantity int NOT NULL,
    LiveTags int NOT NULL);
INSERT INTO @Batches
SELECT sb.BatchNo, b.Id, b.ProductVariantId, v.Sku, sb.Sku, b.Quantity, sb.ExpectedQuantity,
       (SELECT COUNT(*) FROM dbo.SmartTags t WHERE b.Id IS NOT NULL AND t.BatchId = b.Id AND t.DeletedAt IS NULL)
FROM @SaleBatches sb
LEFT JOIN dbo.SmartTagBatches b ON b.BatchNo = sb.BatchNo
LEFT JOIN dbo.TagProductVariants v ON v.Id = b.ProductVariantId;

IF EXISTS (SELECT 1 FROM @Batches WHERE BatchId IS NULL)
BEGIN
    SET @Message = CONCAT(N'Commercial batch not found: ', (SELECT STRING_AGG(BatchNo, N', ') FROM @Batches WHERE BatchId IS NULL), N'. Nothing was changed.');
    THROW 52010, @Message, 1;
END;

IF EXISTS (SELECT 1 FROM @Batches WHERE Sku IS NULL OR Sku <> ExpectedSku)
BEGIN
    SET @Message = CONCAT(N'Commercial batch SKU differs from the confirmed mapping: ',
        (SELECT STRING_AGG(CONCAT(BatchNo, N' is ', COALESCE(Sku, N'(no SKU)'), N' not ', ExpectedSku), N'; ') FROM @Batches WHERE Sku IS NULL OR Sku <> ExpectedSku),
        N'. Nothing was changed.');
    THROW 52011, @Message, 1;
END;

IF EXISTS (SELECT 1 FROM @Batches WHERE BatchQuantity <> ExpectedQuantity)
BEGIN
    SET @Message = CONCAT(N'Commercial batch quantity differs: ',
        (SELECT STRING_AGG(CONCAT(BatchNo, N' = ', BatchQuantity), N'; ') FROM @Batches WHERE BatchQuantity <> ExpectedQuantity),
        N'. Nothing was changed.');
    THROW 52012, @Message, 1;
END;

IF EXISTS (SELECT 1 FROM @Batches WHERE LiveTags <> ExpectedQuantity)
BEGIN
    SET @Message = CONCAT(N'Commercial batch tag count differs: ',
        (SELECT STRING_AGG(CONCAT(BatchNo, N' has ', LiveTags), N'; ') FROM @Batches WHERE LiveTags <> ExpectedQuantity),
        N'. Nothing was changed.');
    THROW 52013, @Message, 1;
END;

IF EXISTS (SELECT 1 FROM dbo.SmartTags t JOIN @Batches bt ON bt.BatchId = t.BatchId WHERE t.DeletedAt IS NOT NULL)
    THROW 52014, N'A commercial batch contains deleted tags. Review it before classifying. Nothing was changed.', 1;

IF EXISTS (
    SELECT 1 FROM dbo.SmartTags t JOIN @Batches bt ON bt.BatchId = t.BatchId
    WHERE t.ProductVariantId IS NULL OR t.ProductVariantId <> bt.ProductVariantId)
    THROW 52015, N'A tag in a commercial batch has a different SKU from its batch. Nothing was changed.', 1;

IF EXISTS (SELECT 1 FROM dbo.SmartTags t JOIN @Batches bt ON bt.BatchId = t.BatchId WHERE t.StockPurpose = N'Test')
    THROW 52016, N'A tag in a commercial batch is already classified as a testing sample. Resolve it by hand. Nothing was changed.', 1;

-- --- Testing samples: exact codes, outside the commercial batches ---------------

IF EXISTS (SELECT 1 FROM @TestTags tt WHERE NOT EXISTS (
    SELECT 1 FROM dbo.SmartTags t WHERE t.TagCode = tt.TagCode AND t.DeletedAt IS NULL))
BEGIN
    SET @Message = CONCAT(N'Testing sample code not found: ',
        (SELECT STRING_AGG(tt.TagCode, N', ') FROM @TestTags tt WHERE NOT EXISTS (
            SELECT 1 FROM dbo.SmartTags t WHERE t.TagCode = tt.TagCode AND t.DeletedAt IS NULL)),
        N'. Nothing was changed.');
    THROW 52020, @Message, 1;
END;

IF EXISTS (SELECT 1 FROM dbo.SmartTags t JOIN @TestTags tt ON tt.TagCode = t.TagCode JOIN @Batches bt ON bt.BatchId = t.BatchId)
    THROW 52021, N'A listed testing sample belongs to a confirmed commercial batch. Nothing was changed.', 1;

IF EXISTS (
    SELECT 1 FROM dbo.SmartTags t
    JOIN @TestTags tt ON tt.TagCode = t.TagCode
    LEFT JOIN dbo.TagProductVariants v ON v.Id = t.ProductVariantId
    WHERE v.Sku IS NULL OR v.Sku <> tt.Sku)
    THROW 52022, N'A listed testing sample has a different SKU from the one listed. Nothing was changed.', 1;

IF EXISTS (SELECT 1 FROM dbo.SmartTags t JOIN @TestTags tt ON tt.TagCode = t.TagCode WHERE t.StockPurpose = N'Sale')
    THROW 52023, N'A listed testing sample is already classified as commercial stock. Resolve it by hand. Nothing was changed.', 1;

IF EXISTS (
    SELECT 1 FROM dbo.SmartTags t
    JOIN @TestTags tt ON tt.TagCode = t.TagCode
    LEFT JOIN dbo.TagOrders o ON o.Id = t.OrderId
    WHERE o.Status IN (N'PendingPayment', N'PaymentProofSubmitted', N'PaymentConfirmed', N'PreparingTag', N'ReadyToShip')
       OR EXISTS (SELECT 1 FROM dbo.MerchantOrderAllocatedTags a
                  WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL AND a.SentToMerchantAt IS NULL))
    THROW 52024, N'A listed testing sample is committed to an open customer or merchant order. Resolve that order first. Nothing was changed.', 1;

-- --- Snapshot every row this run may touch, and hold it -------------------------

DECLARE @Targets TABLE (TagId uniqueidentifier NOT NULL PRIMARY KEY, ToPurpose nvarchar(32) NOT NULL, BatchNo nvarchar(80) NULL);
INSERT INTO @Targets (TagId, ToPurpose, BatchNo)
SELECT t.Id, N'Sale', bt.BatchNo FROM dbo.SmartTags t JOIN @Batches bt ON bt.BatchId = t.BatchId
UNION ALL
SELECT t.Id, N'Test', NULL FROM dbo.SmartTags t JOIN @TestTags tt ON tt.TagCode = t.TagCode WHERE t.DeletedAt IS NULL;

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
WHERE t.Id IN (SELECT TagId FROM @Targets);

DECLARE @ExpectedSaleChanges int = (
    SELECT COUNT(*) FROM dbo.SmartTags t JOIN @Targets g ON g.TagId = t.Id
    WHERE g.ToPurpose = N'Sale' AND t.StockPurpose = N'Unclassified');
DECLARE @ExpectedTestChanges int = (
    SELECT COUNT(*) FROM dbo.SmartTags t JOIN @Targets g ON g.TagId = t.Id
    WHERE g.ToPurpose = N'Test' AND t.StockPurpose = N'Unclassified');

-- --- The only writes ------------------------------------------------------------

DECLARE @Changes TABLE (TagId uniqueidentifier NOT NULL PRIMARY KEY, TagCode nvarchar(32) NOT NULL,
    FromPurpose nvarchar(32) NOT NULL, ToPurpose nvarchar(32) NOT NULL, BatchNo nvarchar(80) NULL);

UPDATE t SET t.StockPurpose = N'Sale'
OUTPUT inserted.Id, inserted.TagCode, deleted.StockPurpose, inserted.StockPurpose, g.BatchNo INTO @Changes
FROM dbo.SmartTags t JOIN @Targets g ON g.TagId = t.Id
WHERE g.ToPurpose = N'Sale' AND t.StockPurpose = N'Unclassified';
SET @Rows = @@ROWCOUNT;
IF @Rows <> @ExpectedSaleChanges
BEGIN
    SET @Message = CONCAT(N'Expected to classify ', @ExpectedSaleChanges, N' commercial units but ', @Rows, N' changed. Rolled back.');
    THROW 52030, @Message, 1;
END;

UPDATE t SET t.StockPurpose = N'Test'
OUTPUT inserted.Id, inserted.TagCode, deleted.StockPurpose, inserted.StockPurpose, NULL INTO @Changes
FROM dbo.SmartTags t JOIN @Targets g ON g.TagId = t.Id
WHERE g.ToPurpose = N'Test' AND t.StockPurpose = N'Unclassified';
SET @Rows = @@ROWCOUNT;
IF @Rows <> @ExpectedTestChanges
BEGIN
    SET @Message = CONCAT(N'Expected to classify ', @ExpectedTestChanges, N' testing samples but ', @Rows, N' changed. Rolled back.');
    THROW 52031, @Message, 1;
END;

INSERT INTO dbo.AuditLogs (Id, ActorId, ActorType, Action, Entity, EntityId, OldValue, NewValue, IpAddress, UserAgent, CreatedAt)
SELECT NEWID(), NULL, N'System', N'tag-inventory.stock-purpose.classify', N'SmartTag', c.TagId,
       CONCAT(N'{"stockPurpose":"', c.FromPurpose, N'"}'),
       CONCAT(N'{"stockPurpose":"', c.ToPurpose, N'","tagCode":"', c.TagCode, N'","batchNo":',
              CASE WHEN c.BatchNo IS NULL THEN N'null' ELSE CONCAT(N'"', c.BatchNo, N'"') END,
              N',"runId":"', @RunIdText, N'","source":"', @Source, N'"}'),
       NULL, NULL, @Now
FROM @Changes c;

-- --- Prove the result before it can commit --------------------------------------

DECLARE @SaleTotal int = (SELECT COUNT(*) FROM dbo.SmartTags t JOIN @Batches bt ON bt.BatchId = t.BatchId WHERE t.StockPurpose = N'Sale');
IF @SaleTotal <> (SELECT SUM(ExpectedQuantity) FROM @SaleBatches)
BEGIN
    SET @Message = CONCAT(N'After classification ', @SaleTotal, N' commercial units are Sale, not ', (SELECT SUM(ExpectedQuantity) FROM @SaleBatches), N'. Rolled back.');
    THROW 52040, @Message, 1;
END;

IF EXISTS (SELECT 1 FROM dbo.SmartTags t JOIN @TestTags tt ON tt.TagCode = t.TagCode WHERE t.DeletedAt IS NULL AND t.StockPurpose <> N'Test')
    THROW 52041, N'A listed testing sample is not Test after classification. Rolled back.', 1;

IF EXISTS (
    SELECT t.Id, t.TagCode, t.Status, t.FulfilmentStatus, t.QaStatus, t.QaVersion, t.QaShipmentReference, t.QaNfcSerialNumber,
           t.QaQrUrl, t.QaNfcUrl, t.OwnerUserId, t.PetId, t.OrderId, t.OrderItemId, t.BatchId, t.ProductVariantId, t.HasNfc,
           t.Variant, t.ArchivedAt, t.DeletedAt, t.ActivatedAt, t.AssignmentVersion, t.UpdatedAt
    FROM dbo.SmartTags t WHERE t.Id IN (SELECT TagId FROM @Targets)
    EXCEPT
    SELECT * FROM @Before)
   OR (SELECT COUNT(*) FROM dbo.SmartTags t WHERE t.Id IN (SELECT TagId FROM @Targets)) <> (SELECT COUNT(*) FROM @Before)
    THROW 52042, N'A column other than StockPurpose changed. Rolled back.', 1;

-- --- Report ---------------------------------------------------------------------

SELECT
    @RunId AS RunId,
    CASE WHEN @Commit = 1 THEN N'COMMITTED' ELSE N'DRY RUN (rolled back)' END AS Mode,
    (SELECT COUNT(*) FROM @Changes WHERE ToPurpose = N'Sale') AS SaleClassified,
    (SELECT COUNT(*) FROM @Targets WHERE ToPurpose = N'Sale') - (SELECT COUNT(*) FROM @Changes WHERE ToPurpose = N'Sale') AS SaleAlreadyApplied,
    (SELECT COUNT(*) FROM @Changes WHERE ToPurpose = N'Test') AS TestClassified,
    (SELECT COUNT(*) FROM @Targets WHERE ToPurpose = N'Test') - (SELECT COUNT(*) FROM @Changes WHERE ToPurpose = N'Test') AS TestAlreadyApplied,
    @SaleTotal AS CommercialUnitsNowSale;

SELECT bt.BatchNo, bt.Sku, COUNT(c.TagId) AS ClassifiedNow
FROM @Batches bt LEFT JOIN @Changes c ON c.BatchNo = bt.BatchNo
GROUP BY bt.BatchNo, bt.Sku ORDER BY bt.BatchNo;

SELECT c.TagCode, c.FromPurpose, c.ToPurpose FROM @Changes c WHERE c.ToPurpose = N'Test' ORDER BY c.TagCode;

IF @Commit = 1
BEGIN
    COMMIT TRANSACTION;
    PRINT CONCAT(N'Committed. Keep RunId ', @RunIdText, N' for script 04 (rollback). Now run script 03.');
END
ELSE
BEGIN
    ROLLBACK TRANSACTION;
    PRINT N'Dry run only: everything above was rolled back. Set @Commit = 1 to apply.';
END;
