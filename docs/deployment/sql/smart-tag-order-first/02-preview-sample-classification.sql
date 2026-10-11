-- MyPetLink Smart Tag order first: PREVIEW TESTING-SAMPLE CLASSIFICATION
-- ----------------------------------------------------------------------
-- READ ONLY. Writes nothing (table variables only) and takes no application
-- locks. It proposes; it never classifies.
--
-- The four older manufacturer samples are still Unclassified. They are
-- identified here by their exact batches, never by SKU and never because a
-- stock receipt points at them. For each tag it shows identity, lifecycle,
-- ownership, orders, merchant allocation, scans and physical QA, and proposes
-- Test only when nothing open depends on the tag.
--
-- Stock receipts are shown with their accounting meaning (quantity, cost and
-- which tags they own) and are NEVER changed: classifying a tag Test changes
-- only SmartTags.StockPurpose. A receipt that also owns commercial tags must
-- not be edited at all; a receipt that owns only samples records what the
-- samples cost and stays as it is.
--
-- Applying the proposal needs separate approval. It is done with
-- docs/deployment/sql/smart-tag-stock-purpose/02-apply-smart-tag-stock-purpose.sql,
-- listing the exact codes from result set 4 in its @TestTags, preview first
-- (@Commit = 0), then commit. That script is idempotent: the 900 commercial
-- units are already Sale and are left unchanged.
--
-- Classifying an Unclassified sample as Test changes no stock count: neither
-- purpose is ever orderable or fulfillable.

SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCK_TIMEOUT 5000;
SET DEADLOCK_PRIORITY LOW;

IF COL_LENGTH(N'dbo.SmartTags', N'StockPurpose') IS NULL
BEGIN
    SELECT N'StockPurpose column missing: the AddSmartTagStockPurpose migration is not applied.' AS PreviewStatus;
    RETURN;
END;

-- The sample batches, by exact batch number, with the number of tags each
-- is known to hold. The two dynamic queries below repeat these batch numbers
-- (they compile even where the stock purpose column is missing): keep all
-- three lists identical.
DECLARE @SampleBatches TABLE (
    BatchNo nvarchar(80) NOT NULL PRIMARY KEY,
    ExpectedTags int NOT NULL);
INSERT INTO @SampleBatches (BatchNo, ExpectedTags) VALUES
    (N'BATCH-202607-9013', 2),
    (N'BATCH-202607-8221', 2);

DECLARE @Samples TABLE (
    TagId uniqueidentifier NOT NULL PRIMARY KEY,
    TagCode nvarchar(32) NOT NULL,
    Sku nvarchar(80) NULL,
    BatchNo nvarchar(80) NOT NULL,
    StockPurpose nvarchar(32) NOT NULL,
    QaStatus nvarchar(32) NULL,
    Status nvarchar(32) NOT NULL,
    FulfilmentStatus nvarchar(32) NOT NULL,
    HasOwner bit NOT NULL,
    HasPet bit NOT NULL,
    OrderNumber nvarchar(80) NULL,
    OrderStatus nvarchar(32) NULL,
    MerchantAllocationLive bit NOT NULL,
    MerchantShipped bit NOT NULL,
    ActivatedAt datetimeoffset NULL,
    ScanCount int NOT NULL,
    InventoryReceiptId uniqueidentifier NULL,
    ReceiptNumber nvarchar(100) NULL,
    CreatedAt datetimeoffset NOT NULL);
INSERT INTO @Samples
EXEC sys.sp_executesql N'
SELECT
    t.Id, t.TagCode, v.Sku, b.BatchNo, t.StockPurpose, t.QaStatus, t.Status, t.FulfilmentStatus,
    CASE WHEN t.OwnerUserId IS NULL THEN 0 ELSE 1 END,
    CASE WHEN t.PetId IS NULL THEN 0 ELSE 1 END,
    o.OrderNumber, o.Status,
    CASE WHEN EXISTS (SELECT 1 FROM dbo.MerchantOrderAllocatedTags a
                      WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL) THEN 1 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM dbo.MerchantOrderAllocatedTags a
                      WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL AND a.SentToMerchantAt IS NOT NULL) THEN 1 ELSE 0 END,
    t.ActivatedAt,
    (SELECT COUNT(*) FROM dbo.TagScans s WHERE s.SmartTagId = t.Id),
    t.InventoryReceiptId, r.ReceiptNumber, t.CreatedAt
FROM dbo.SmartTags t
JOIN dbo.SmartTagBatches b ON b.Id = t.BatchId
LEFT JOIN dbo.TagProductVariants v ON v.Id = t.ProductVariantId
LEFT JOIN dbo.InventoryReceipts r ON r.Id = t.InventoryReceiptId
LEFT JOIN dbo.TagOrders o ON o.Id = t.OrderId
WHERE t.DeletedAt IS NULL
  AND b.BatchNo IN (N''BATCH-202607-9013'', N''BATCH-202607-8221'');';

-- Keep the dynamic filter above identical to @SampleBatches.
DELETE s FROM @Samples s WHERE NOT EXISTS (SELECT 1 FROM @SampleBatches sb WHERE sb.BatchNo = s.BatchNo);

-- Every live tag owned by a receipt that also owns a sample, with its purpose.
DECLARE @ReceiptTags TABLE (
    TagId uniqueidentifier NOT NULL PRIMARY KEY,
    InventoryReceiptId uniqueidentifier NOT NULL,
    StockPurpose nvarchar(32) NOT NULL);
INSERT INTO @ReceiptTags
EXEC sys.sp_executesql N'
SELECT t.Id, t.InventoryReceiptId, t.StockPurpose
FROM dbo.SmartTags t
WHERE t.DeletedAt IS NULL
  AND t.InventoryReceiptId IN (
      SELECT s.InventoryReceiptId FROM dbo.SmartTags s
      JOIN dbo.SmartTagBatches b ON b.Id = s.BatchId
      WHERE s.DeletedAt IS NULL AND s.InventoryReceiptId IS NOT NULL
        AND b.BatchNo IN (N''BATCH-202607-9013'', N''BATCH-202607-8221''));';

-- 1. Readiness: every configured batch holds exactly the expected tags.
SELECT sb.BatchNo, sb.ExpectedTags, COUNT(s.TagId) AS TagsFound,
       SUM(CASE WHEN s.InventoryReceiptId IS NULL THEN 0 ELSE 1 END) AS ReceiptLinked,
       CASE WHEN COUNT(s.TagId) = sb.ExpectedTags THEN N'OK' ELSE N'CHECK: tag count differs; do not classify' END AS Readiness
FROM @SampleBatches sb LEFT JOIN @Samples s ON s.BatchNo = sb.BatchNo
GROUP BY sb.BatchNo, sb.ExpectedTags
ORDER BY sb.BatchNo;

-- 2. The sample tags, one by one, with the proposed classification.
SELECT
    s.BatchNo, s.TagCode, s.Sku, s.StockPurpose AS CurrentPurpose,
    CASE
        WHEN s.StockPurpose = N'Test' THEN N'Test (already)'
        WHEN s.StockPurpose = N'Sale' THEN N'Review: classified Sale; confirm before changing'
        WHEN s.OrderNumber IS NOT NULL AND s.OrderStatus IN (N'PendingPayment', N'PaymentProofSubmitted', N'PaymentConfirmed', N'PreparingTag', N'ReadyToShip')
            THEN N'Resolve first: on an open customer order'
        WHEN s.MerchantAllocationLive = 1 AND s.MerchantShipped = 0
            THEN N'Resolve first: allocated to an unshipped merchant order'
        ELSE N'Test'
    END AS ProposedPurpose,
    s.QaStatus, s.Status, s.FulfilmentStatus, s.HasOwner, s.HasPet, s.ActivatedAt, s.ScanCount,
    s.OrderNumber, s.OrderStatus, s.MerchantAllocationLive, s.MerchantShipped,
    s.ReceiptNumber, s.CreatedAt,
    CASE WHEN s.HasOwner = 1 OR s.ActivatedAt IS NOT NULL
         THEN N'Owner keeps scanning, activation and transfer; purpose affects stock only'
         ELSE N'' END AS OwnerNote
FROM @Samples s
ORDER BY s.BatchNo, s.TagCode;

-- 3. Stock receipts linked to any sample, with their accounting meaning.
--    Read only: no receipt is edited, corrected or deleted by classification.
SELECT
    r.ReceiptNumber, rv.Sku AS ReceiptSku, r.ReceivedAt, r.QuantityReceived,
    r.CostMode, r.PurchaseCurrency, r.TotalLandedCostMyr, r.UnitLandedCostMyr,
    r.SupplierName, r.SupplierReference, r.Notes,
    rb.BatchNo AS ReceiptBatch,
    (SELECT COUNT(*) FROM @ReceiptTags t WHERE t.InventoryReceiptId = r.Id) AS TagsOwned,
    (SELECT COUNT(*) FROM @Samples s WHERE s.InventoryReceiptId = r.Id) AS SampleTagsOwned,
    (SELECT COUNT(*) FROM @ReceiptTags t WHERE t.InventoryReceiptId = r.Id AND t.StockPurpose = N'Sale') AS CommercialTagsOwned,
    r.SupersededAt, r.CorrectsReceiptId,
    CASE
        WHEN (SELECT COUNT(*) FROM @ReceiptTags t WHERE t.InventoryReceiptId = r.Id AND t.StockPurpose = N'Sale') > 0
            THEN N'Also owns commercial stock: leave unchanged'
        WHEN (SELECT COUNT(*) FROM @ReceiptTags t WHERE t.InventoryReceiptId = r.Id)
             = (SELECT COUNT(*) FROM @Samples s WHERE s.InventoryReceiptId = r.Id)
            THEN N'Owns only samples: records what the samples cost; leave unchanged'
        ELSE N'Owns other non-commercial tags: review before any accounting change'
    END AS AccountingMeaning
FROM dbo.InventoryReceipts r
JOIN dbo.TagProductVariants rv ON rv.Id = r.TagProductVariantId
LEFT JOIN dbo.SmartTagBatches rb ON rb.Id = r.SmartTagBatchId
WHERE r.Id IN (SELECT s.InventoryReceiptId FROM @Samples s WHERE s.InventoryReceiptId IS NOT NULL)
ORDER BY r.ReceiptNumber;

-- 4. The exact lines for @TestTags in the stock-purpose apply script, for the
--    tags proposed as Test. Copy them only after the approval to classify.
SELECT CONCAT(N'    (N''', s.TagCode, N''', N''', s.Sku, N'''),') AS TestTagsLine,
       s.BatchNo, s.TagCode
FROM @Samples s
WHERE s.StockPurpose = N'Unclassified'
  AND s.Sku IS NOT NULL
  AND NOT (s.OrderNumber IS NOT NULL AND s.OrderStatus IN (N'PendingPayment', N'PaymentProofSubmitted', N'PaymentConfirmed', N'PreparingTag', N'ReadyToShip'))
  AND NOT (s.MerchantAllocationLive = 1 AND s.MerchantShipped = 0)
ORDER BY s.BatchNo, s.TagCode;
