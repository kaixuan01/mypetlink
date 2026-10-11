-- MyPetLink Smart Tag stock purpose, script 1 of 4: PREVIEW
-- ---------------------------------------------------------
-- READ ONLY. Writes nothing (table variables only), takes no application
-- locks, and runs before or after the AddSmartTagStockPurpose migration.
-- Safe against Production from SSMS / Azure Data Studio / Azure portal Query
-- editor. Run with sqlcmd -I, or any client with QUOTED_IDENTIFIER ON.
--
-- What it shows:
--   1. Readiness: migration, configured batches and test codes.
--   2. The three confirmed commercial batches: identity, SKU, quantity, QA,
--      lifecycle, assignment and current stock purpose.
--   3. Units inside those batches that are NOT clean shelf stock (assigned,
--      allocated, owned, archived...), listed one by one.
--   4. Older units sharing the three SKUs but outside the confirmed batches:
--      the testing-sample candidates, with everything needed to verify them.
--   5. Every other unit, summarised: it stays Unclassified (never sellable).
--   6. EXACTLY which rows script 02 would change with this configuration, and
--      any conflict that would make script 02 stop.
--   7. Expected stock per SKU after classification (sellable needs Sale AND
--      QA Passed AND on the shelf, minus open reservations).
--
-- Keep @SaleBatches and @TestTags identical to scripts 02 and 03.
-- See docs/operations/smart-tag-stock-purpose-separation.md.

SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCK_TIMEOUT 5000;
SET DEADLOCK_PRIORITY LOW;

IF COL_LENGTH(N'dbo.SmartTags', N'QaStatus') IS NULL
BEGIN
    SELECT N'Physical QA schema is not present (AddSmartTagPhysicalQa not applied). Apply it before classifying stock.' AS PreviewStatus;
    RETURN;
END;

-- Confirmed commercial batches: the 900-tag shipment. Exact batch numbers.
DECLARE @SaleBatches TABLE (
    BatchNo nvarchar(80) NOT NULL PRIMARY KEY,
    Sku nvarchar(80) NOT NULL,
    ExpectedQuantity int NOT NULL);
INSERT INTO @SaleBatches (BatchNo, Sku, ExpectedQuantity) VALUES
    (N'MPL-BAT-260911002807-9263', N'MYBOSS-LW-QR-NFC', 300),
    (N'MPL-BAT-260911002857-1515', N'PAWSOME-LW-QR-NFC', 300),
    (N'MPL-BAT-260911002959-6486', N'PAWSOME-SD-QR-NFC', 300);

-- Verified testing samples, by exact tag code and expected SKU. Leave EMPTY
-- until every code has been confirmed from result set 4 (batch, history and
-- purpose). Never derive this list from the SKU alone.
DECLARE @TestTags TABLE (
    TagCode nvarchar(32) NOT NULL PRIMARY KEY,
    Sku nvarchar(80) NOT NULL);
-- INSERT INTO @TestTags (TagCode, Sku) VALUES
--     (N'MPL-XXXX-XXXX', N'MYBOSS-LW-QR-NFC'),
--     (N'MPL-YYYY-YYYY', N'MYBOSS-LW-QR-NFC'),
--     (N'MPL-ZZZZ-ZZZZ', N'PAWSOME-LW-QR-NFC'),
--     (N'MPL-WWWW-WWWW', N'PAWSOME-LW-QR-NFC');

DECLARE @HasColumn bit = CASE WHEN COL_LENGTH(N'dbo.SmartTags', N'StockPurpose') IS NULL THEN 0 ELSE 1 END;
DECLARE @Purpose TABLE (TagId uniqueidentifier NOT NULL PRIMARY KEY, StockPurpose nvarchar(32) NOT NULL);
IF @HasColumn = 1
    INSERT INTO @Purpose (TagId, StockPurpose)
    EXEC sys.sp_executesql N'SELECT Id, StockPurpose FROM dbo.SmartTags WHERE DeletedAt IS NULL;';

-- One row per live (not deleted) tag, with every fact the result sets need.
DECLARE @Tags TABLE (
    TagId uniqueidentifier NOT NULL PRIMARY KEY,
    TagCode nvarchar(32) NOT NULL,
    ProductVariantId uniqueidentifier NULL,
    Sku nvarchar(80) NULL,
    BatchId uniqueidentifier NULL,
    BatchNo nvarchar(80) NULL,
    BatchGeneratedAt datetimeoffset NULL,
    BatchVariantSku nvarchar(80) NULL,
    InventoryReceiptNumber nvarchar(100) NULL,
    CreatedAt datetimeoffset NOT NULL,
    Status nvarchar(32) NOT NULL,
    FulfilmentStatus nvarchar(32) NOT NULL,
    QaStatus nvarchar(32) NULL,
    QaShipmentReference nvarchar(100) NULL,
    HasOwner bit NOT NULL,
    HasPet bit NOT NULL,
    OrderNumber nvarchar(80) NULL,
    OrderStatus nvarchar(32) NULL,
    MerchantAllocationLive bit NOT NULL,
    MerchantShipped bit NOT NULL,
    IsArchived bit NOT NULL,
    OnShelf bit NOT NULL,
    ActivatedAt datetimeoffset NULL,
    LastScannedAt datetimeoffset NULL,
    ScanCount int NOT NULL,
    OwnerActivationAudits int NOT NULL,
    CurrentPurpose nvarchar(32) NOT NULL,
    InSaleBatch bit NOT NULL,
    ExpectedSaleSku nvarchar(80) NULL,
    ListedAsTest bit NOT NULL,
    ListedTestSku nvarchar(80) NULL);

INSERT INTO @Tags
SELECT
    t.Id, t.TagCode, t.ProductVariantId, v.Sku,
    t.BatchId, b.BatchNo, b.GeneratedAt, bv.Sku,
    r.ReceiptNumber,
    t.CreatedAt, t.Status, t.FulfilmentStatus, t.QaStatus, t.QaShipmentReference,
    CASE WHEN t.OwnerUserId IS NULL THEN 0 ELSE 1 END,
    CASE WHEN t.PetId IS NULL THEN 0 ELSE 1 END,
    o.OrderNumber, o.Status,
    CASE WHEN EXISTS (SELECT 1 FROM dbo.MerchantOrderAllocatedTags a
                      WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL) THEN 1 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM dbo.MerchantOrderAllocatedTags a
                      WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL AND a.SentToMerchantAt IS NOT NULL) THEN 1 ELSE 0 END,
    CASE WHEN t.ArchivedAt IS NULL AND t.Status <> N'Archived' THEN 0 ELSE 1 END,
    -- SellableInventoryRules.OnShelf, exactly.
    CASE WHEN t.Status = N'Unclaimed'
              AND t.ArchivedAt IS NULL
              AND t.FulfilmentStatus IN (N'Generated', N'Printed')
              AND t.OwnerUserId IS NULL AND t.PetId IS NULL
              AND t.OrderId IS NULL AND t.OrderItemId IS NULL
              AND NOT EXISTS (SELECT 1 FROM dbo.MerchantOrderAllocatedTags a
                              WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL)
         THEN 1 ELSE 0 END,
    t.ActivatedAt, t.LastScannedAt,
    (SELECT COUNT(*) FROM dbo.TagScans s WHERE s.SmartTagId = t.Id),
    (SELECT COUNT(*) FROM dbo.AuditLogs l
     WHERE l.Entity = N'SmartTag' AND l.EntityId = t.Id
       AND l.Action IN (N'tag.activate-retail', N'tag.activate-assigned')),
    COALESCE(p.StockPurpose, N'(column not added yet)'),
    CASE WHEN sb.BatchNo IS NULL THEN 0 ELSE 1 END, sb.Sku,
    CASE WHEN tt.TagCode IS NULL THEN 0 ELSE 1 END, tt.Sku
FROM dbo.SmartTags t
LEFT JOIN dbo.TagProductVariants v ON v.Id = t.ProductVariantId
LEFT JOIN dbo.SmartTagBatches b ON b.Id = t.BatchId
LEFT JOIN dbo.TagProductVariants bv ON bv.Id = b.ProductVariantId
LEFT JOIN dbo.InventoryReceipts r ON r.Id = t.InventoryReceiptId
LEFT JOIN dbo.TagOrders o ON o.Id = t.OrderId
LEFT JOIN @Purpose p ON p.TagId = t.Id
LEFT JOIN @SaleBatches sb ON sb.BatchNo = b.BatchNo
LEFT JOIN @TestTags tt ON tt.TagCode = t.TagCode
WHERE t.DeletedAt IS NULL;

-- 1. Readiness.
DECLARE @MigrationApplied bit = 0;
IF OBJECT_ID(N'dbo.__EFMigrationsHistory', N'U') IS NOT NULL
    EXEC sys.sp_executesql
        N'SELECT @applied = CASE WHEN EXISTS (SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId LIKE N''%[_]AddSmartTagStockPurpose'') THEN 1 ELSE 0 END;',
        N'@applied bit OUTPUT', @applied = @MigrationApplied OUTPUT;

SELECT
    @HasColumn AS StockPurposeColumnPresent,
    @MigrationApplied AS MigrationApplied,
    (SELECT COUNT(*) FROM @SaleBatches) AS ConfirmedSaleBatches,
    (SELECT SUM(ExpectedQuantity) FROM @SaleBatches) AS ExpectedSaleUnits,
    (SELECT COUNT(*) FROM @TestTags) AS TestCodesListed,
    CASE WHEN (SELECT COUNT(*) FROM @TestTags) = 0
         THEN N'No testing samples listed yet: script 02 will classify only the commercial batches.'
         ELSE N'Testing samples listed: check result set 6.' END AS TestSampleNote;

-- 2. The confirmed commercial batches.
SELECT
    sb.BatchNo,
    sb.Sku AS ExpectedSku,
    sb.ExpectedQuantity,
    b.Id AS BatchId,
    CASE WHEN b.Id IS NULL THEN N'MISSING' ELSE N'found' END AS BatchFound,
    bv.Sku AS BatchSku,
    b.Quantity AS BatchQuantity,
    b.GeneratedAt AS BatchGeneratedAt,
    b.ArchivedAt AS BatchArchivedAt,
    (SELECT COUNT(*) FROM dbo.SmartTags t WHERE t.BatchId = b.Id AND t.DeletedAt IS NULL) AS LiveTags,
    (SELECT COUNT(*) FROM dbo.SmartTags t WHERE t.BatchId = b.Id AND t.DeletedAt IS NOT NULL) AS DeletedTags,
    (SELECT COUNT(*) FROM dbo.SmartTags t WHERE t.BatchId = b.Id AND t.DeletedAt IS NULL
        AND (t.ProductVariantId IS NULL OR t.ProductVariantId <> b.ProductVariantId)) AS TagsWithAnotherSku,
    (SELECT COUNT(*) FROM @Tags x WHERE x.BatchId = b.Id AND x.QaStatus IS NULL) AS QaNotEnrolled,
    (SELECT COUNT(*) FROM @Tags x WHERE x.BatchId = b.Id AND x.QaStatus = N'Pending') AS QaPending,
    (SELECT COUNT(*) FROM @Tags x WHERE x.BatchId = b.Id AND x.QaStatus = N'Passed') AS QaPassed,
    (SELECT COUNT(*) FROM @Tags x WHERE x.BatchId = b.Id AND x.QaStatus = N'Failed') AS QaFailed,
    (SELECT COUNT(*) FROM @Tags x WHERE x.BatchId = b.Id AND x.QaStatus = N'NeedsReview') AS QaNeedsReview,
    (SELECT COUNT(*) FROM @Tags x WHERE x.BatchId = b.Id AND x.OnShelf = 1) AS OnShelf,
    (SELECT COUNT(*) FROM @Tags x WHERE x.BatchId = b.Id AND x.OnShelf = 0) AS NotOnShelf,
    (SELECT COUNT(*) FROM @Tags x WHERE x.BatchId = b.Id AND x.OrderNumber IS NOT NULL) AS LinkedToRetailOrder,
    (SELECT COUNT(*) FROM @Tags x WHERE x.BatchId = b.Id AND x.MerchantAllocationLive = 1) AS MerchantAllocated,
    (SELECT COUNT(*) FROM @Tags x WHERE x.BatchId = b.Id AND x.HasOwner = 1) AS Owned,
    (SELECT COUNT(*) FROM @Tags x WHERE x.BatchId = b.Id AND x.CurrentPurpose = N'Unclassified') AS PurposeUnclassified,
    (SELECT COUNT(*) FROM @Tags x WHERE x.BatchId = b.Id AND x.CurrentPurpose = N'Sale') AS PurposeSale,
    (SELECT COUNT(*) FROM @Tags x WHERE x.BatchId = b.Id AND x.CurrentPurpose = N'Test') AS PurposeTest,
    CASE
        WHEN b.Id IS NULL THEN N'STOP: batch not found'
        WHEN bv.Sku IS NULL OR bv.Sku <> sb.Sku THEN N'STOP: batch SKU differs'
        WHEN b.Quantity <> sb.ExpectedQuantity THEN N'STOP: batch quantity differs'
        WHEN (SELECT COUNT(*) FROM dbo.SmartTags t WHERE t.BatchId = b.Id AND t.DeletedAt IS NULL) <> sb.ExpectedQuantity
            THEN N'STOP: live tag count differs'
        WHEN EXISTS (SELECT 1 FROM dbo.SmartTags t WHERE t.BatchId = b.Id AND t.DeletedAt IS NOT NULL)
            THEN N'STOP: batch has deleted tags'
        WHEN EXISTS (SELECT 1 FROM dbo.SmartTags t WHERE t.BatchId = b.Id AND t.DeletedAt IS NULL
                     AND (t.ProductVariantId IS NULL OR t.ProductVariantId <> b.ProductVariantId))
            THEN N'STOP: a tag has another SKU'
        WHEN EXISTS (SELECT 1 FROM @Tags x WHERE x.BatchId = b.Id AND x.CurrentPurpose = N'Test')
            THEN N'STOP: batch already holds testing samples'
        ELSE N'OK'
    END AS Verdict
FROM @SaleBatches sb
LEFT JOIN dbo.SmartTagBatches b ON b.BatchNo = sb.BatchNo
LEFT JOIN dbo.TagProductVariants bv ON bv.Id = b.ProductVariantId
ORDER BY sb.BatchNo;

-- 3. Units in the commercial batches that are not plain shelf stock. They are
--    still classified as Sale (they are commercial units); listed so nobody is
--    surprised. Classification never changes their QA, lifecycle or links.
SELECT x.BatchNo, x.TagCode, x.Sku, x.Status, x.FulfilmentStatus, x.QaStatus,
       x.HasOwner, x.HasPet, x.OrderNumber, x.OrderStatus, x.MerchantAllocationLive, x.IsArchived, x.CurrentPurpose
FROM @Tags x
WHERE x.InSaleBatch = 1 AND x.OnShelf = 0
ORDER BY x.BatchNo, x.TagCode;

-- 4. Testing-sample candidates: units of the three SKUs outside the confirmed
--    batches. Each must be confirmed individually (batch, history, purpose)
--    before its code is listed in @TestTags. Nothing here is classified
--    automatically.
SELECT
    x.Sku, x.TagCode, x.TagId, x.BatchNo, x.BatchGeneratedAt, x.InventoryReceiptNumber, x.CreatedAt,
    x.Status, x.FulfilmentStatus, x.QaStatus, x.QaShipmentReference,
    x.HasOwner, x.HasPet, x.OrderNumber, x.OrderStatus, x.MerchantAllocationLive, x.MerchantShipped,
    x.IsArchived, x.OnShelf, x.ActivatedAt, x.LastScannedAt, x.ScanCount, x.OwnerActivationAudits,
    x.CurrentPurpose, x.ListedAsTest,
    CASE
        WHEN x.ListedAsTest = 1 THEN N'Listed as testing sample'
        WHEN x.OrderNumber IS NOT NULL AND x.OrderStatus IN (N'PendingPayment', N'PaymentProofSubmitted', N'PaymentConfirmed', N'PreparingTag', N'ReadyToShip')
            THEN N'On an open customer order: resolve before classifying'
        WHEN x.MerchantAllocationLive = 1 AND x.MerchantShipped = 0
            THEN N'Allocated to an unshipped merchant order: resolve before classifying'
        ELSE N'Candidate: confirm, then list in @TestTags'
    END AS Review
FROM @Tags x
WHERE x.InSaleBatch = 0
  AND x.Sku IN (SELECT Sku FROM @SaleBatches)
ORDER BY x.Sku, x.CreatedAt, x.TagCode;

-- 5. Everything else: stays Unclassified and is never sold. Historical tags
--    already with owners keep activation, scanning and transfer.
SELECT
    COALESCE(x.Sku, N'(no SKU)') AS Sku,
    x.Status, x.FulfilmentStatus, COALESCE(x.QaStatus, N'(not enrolled)') AS QaStatus,
    x.CurrentPurpose, COUNT(*) AS Tags, SUM(CAST(x.OnShelf AS int)) AS OnShelf
FROM @Tags x
WHERE x.InSaleBatch = 0 AND x.ListedAsTest = 0
  AND (x.Sku IS NULL OR x.Sku NOT IN (SELECT Sku FROM @SaleBatches))
GROUP BY x.Sku, x.Status, x.FulfilmentStatus, x.QaStatus, x.CurrentPurpose
ORDER BY Sku, x.Status, x.FulfilmentStatus;

-- 6. Exactly what script 02 would change, and every conflict that would stop it.
SELECT Change, TagCode, Sku, BatchNo, FromPurpose, ToPurpose, QaStatus, Status, Note
FROM (
    SELECT N'classify Sale' AS Change, x.TagCode, x.Sku, x.BatchNo, x.CurrentPurpose AS FromPurpose,
           N'Sale' AS ToPurpose, x.QaStatus, x.Status, N'' AS Note, 1 AS SortKey
    FROM @Tags x
    WHERE x.InSaleBatch = 1 AND x.CurrentPurpose IN (N'Unclassified', N'(column not added yet)')
    UNION ALL
    SELECT N'classify Test', x.TagCode, x.Sku, x.BatchNo, x.CurrentPurpose, N'Test', x.QaStatus, x.Status,
           CASE WHEN x.HasOwner = 1 THEN N'already with an internal owner: keeps working' ELSE N'' END, 2
    FROM @Tags x
    WHERE x.ListedAsTest = 1 AND x.CurrentPurpose IN (N'Unclassified', N'(column not added yet)')
    UNION ALL
    SELECT N'STOP: listed code not found', tt.TagCode, tt.Sku, NULL, NULL, NULL, NULL, NULL, N'not in inventory', 0
    FROM @TestTags tt
    WHERE NOT EXISTS (SELECT 1 FROM @Tags x WHERE x.TagCode = tt.TagCode)
    UNION ALL
    SELECT N'STOP: listed code is in a commercial batch', x.TagCode, x.Sku, x.BatchNo, x.CurrentPurpose, NULL, x.QaStatus, x.Status, N'', 0
    FROM @Tags x WHERE x.ListedAsTest = 1 AND x.InSaleBatch = 1
    UNION ALL
    SELECT N'STOP: listed code has another SKU', x.TagCode, x.Sku, x.BatchNo, x.CurrentPurpose, NULL, x.QaStatus, x.Status,
           CONCAT(N'listed as ', x.ListedTestSku), 0
    FROM @Tags x WHERE x.ListedAsTest = 1 AND (x.Sku IS NULL OR x.Sku <> x.ListedTestSku)
    UNION ALL
    SELECT N'STOP: listed code is already Sale', x.TagCode, x.Sku, x.BatchNo, x.CurrentPurpose, NULL, x.QaStatus, x.Status, N'', 0
    FROM @Tags x WHERE x.ListedAsTest = 1 AND x.CurrentPurpose = N'Sale'
    UNION ALL
    SELECT N'STOP: listed code is committed to a customer', x.TagCode, x.Sku, x.BatchNo, x.CurrentPurpose, NULL, x.QaStatus, x.Status,
           COALESCE(x.OrderNumber, N'merchant allocation'), 0
    FROM @Tags x
    WHERE x.ListedAsTest = 1
      AND ((x.OrderNumber IS NOT NULL AND x.OrderStatus IN (N'PendingPayment', N'PaymentProofSubmitted', N'PaymentConfirmed', N'PreparingTag', N'ReadyToShip'))
           OR (x.MerchantAllocationLive = 1 AND x.MerchantShipped = 0))
    UNION ALL
    SELECT N'STOP: commercial batch unit is already Test', x.TagCode, x.Sku, x.BatchNo, x.CurrentPurpose, NULL, x.QaStatus, x.Status, N'', 0
    FROM @Tags x WHERE x.InSaleBatch = 1 AND x.CurrentPurpose = N'Test'
) changes
ORDER BY SortKey, Sku, TagCode;

SELECT
    (SELECT COUNT(*) FROM @Tags x WHERE x.InSaleBatch = 1 AND x.CurrentPurpose IN (N'Unclassified', N'(column not added yet)')) AS SaleChanges,
    (SELECT COUNT(*) FROM @Tags x WHERE x.InSaleBatch = 1 AND x.CurrentPurpose = N'Sale') AS SaleAlreadyApplied,
    (SELECT COUNT(*) FROM @Tags x WHERE x.ListedAsTest = 1 AND x.CurrentPurpose IN (N'Unclassified', N'(column not added yet)')) AS TestChanges,
    (SELECT COUNT(*) FROM @Tags x WHERE x.ListedAsTest = 1 AND x.CurrentPurpose = N'Test') AS TestAlreadyApplied;

-- 7. Expected stock per QR + NFC SKU after classification. Sellable needs Sale
--    AND QA Passed AND on the shelf; open (unshipped) orders reserve first.
--    AvailableAfterClassification > 0 is what the public catalogue will report
--    as in stock once the stock-purpose API is deployed.
WITH Outstanding AS (
    SELECT i.ProductVariantId,
           SUM(CASE WHEN i.Quantity - x.Assigned > 0 THEN i.Quantity - x.Assigned ELSE 0 END) AS Units
    FROM dbo.TagOrderItems i
    JOIN dbo.TagOrders o ON o.Id = i.OrderId
    CROSS APPLY (
        SELECT COUNT(*) AS Assigned FROM dbo.SmartTags s
        WHERE s.OrderItemId = i.Id AND s.ArchivedAt IS NULL AND s.DeletedAt IS NULL
          AND s.Status IN (N'Pending', N'Preparing', N'Delivered', N'Active')) x
    WHERE o.Status IN (N'PendingPayment', N'PaymentProofSubmitted', N'PaymentConfirmed', N'PreparingTag', N'ReadyToShip')
      AND i.ProductVariantId IS NOT NULL
    GROUP BY i.ProductVariantId
),
Classified AS (
    SELECT x.ProductVariantId,
           CASE WHEN x.InSaleBatch = 1 THEN N'Sale'
                WHEN x.ListedAsTest = 1 THEN N'Test'
                WHEN x.CurrentPurpose = N'(column not added yet)' THEN N'Unclassified'
                ELSE x.CurrentPurpose END AS PurposeAfter,
           x.QaStatus, x.OnShelf
    FROM @Tags x
)
SELECT
    v.Sku,
    SUM(CASE WHEN a.PurposeAfter = N'Sale' THEN 1 ELSE 0 END) AS SaleUnits,
    SUM(CASE WHEN a.PurposeAfter = N'Sale' AND a.QaStatus IS NULL THEN 1 ELSE 0 END) AS SaleNotEnrolled,
    SUM(CASE WHEN a.PurposeAfter = N'Sale' AND a.QaStatus = N'Pending' THEN 1 ELSE 0 END) AS SalePending,
    SUM(CASE WHEN a.PurposeAfter = N'Sale' AND a.QaStatus = N'Passed' THEN 1 ELSE 0 END) AS SalePassed,
    SUM(CASE WHEN a.PurposeAfter = N'Sale' AND a.QaStatus IN (N'Failed', N'NeedsReview') THEN 1 ELSE 0 END) AS SaleFailedOrReview,
    SUM(CASE WHEN a.PurposeAfter = N'Test' THEN 1 ELSE 0 END) AS TestUnits,
    SUM(CASE WHEN a.PurposeAfter = N'Unclassified' THEN 1 ELSE 0 END) AS UnclassifiedUnits,
    SUM(CASE WHEN a.PurposeAfter = N'Sale' AND a.QaStatus = N'Passed' AND a.OnShelf = 1 THEN 1 ELSE 0 END) AS SellableUnits,
    COALESCE(MAX(o.Units), 0) AS OpenReservations,
    CASE WHEN SUM(CASE WHEN a.PurposeAfter = N'Sale' AND a.QaStatus = N'Passed' AND a.OnShelf = 1 THEN 1 ELSE 0 END) - COALESCE(MAX(o.Units), 0) > 0
         THEN SUM(CASE WHEN a.PurposeAfter = N'Sale' AND a.QaStatus = N'Passed' AND a.OnShelf = 1 THEN 1 ELSE 0 END) - COALESCE(MAX(o.Units), 0)
         ELSE 0 END AS AvailableAfterClassification,
    SUM(CASE WHEN a.PurposeAfter <> N'Sale' AND a.QaStatus = N'Passed' AND a.OnShelf = 1 THEN 1 ELSE 0 END) AS PassedButNotForSale
FROM dbo.TagProductVariants v
JOIN dbo.TagProducts p ON p.Id = v.TagProductId
LEFT JOIN Classified a ON a.ProductVariantId = v.Id
LEFT JOIN Outstanding o ON o.ProductVariantId = v.Id
WHERE v.SupportsQr = 1 AND v.SupportsNfc = 1
GROUP BY v.Sku
ORDER BY v.Sku;
