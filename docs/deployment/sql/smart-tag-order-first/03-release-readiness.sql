-- MyPetLink Smart Tag order first: RELEASE READINESS (Production baseline)
-- ------------------------------------------------------------------------
-- READ ONLY. Writes nothing (table variables only) and takes no application
-- locks. Run against Production before publishing the order-first API, and
-- again right after. Ends with an error if any check FAILs, so it cannot be
-- mistaken for a pass.
--
-- Result sets:
--   1. Checks (PASS / FAIL / INFO):
--        * schema: the stock purpose migration is the latest applied and no
--          migration unknown to this release is present;
--        * the confirmed baseline: 900 commercial (Sale) tags, all received,
--          QA Passed / Pending exactly as expected;
--        * the four older samples are still Unclassified;
--        * nothing that is not Sale would be orderable;
--        * no double commitment: no tag on two orders, no tag on an order and a
--          live merchant allocation, no order line holding more tags than it
--          ordered, no duplicate checkout (idempotency key) among open orders.
--   2. Orderable stock per commercial SKU after the release (the API rule),
--      next to what is orderable today (Passed only).
--   3. Every open order line that reduces availability, one by one.
--
-- The expected numbers below are the confirmed Production baseline. Change
-- them only if the baseline itself changes.

SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCK_TIMEOUT 5000;
SET DEADLOCK_PRIORITY LOW;

DECLARE @ExpectedSale int = 900;
DECLARE @ExpectedPassed int = 3;
DECLARE @ExpectedPending int = 897;
DECLARE @LatestMigration nvarchar(150) = N'20261011034923_AddSmartTagStockPurpose';

DECLARE @SaleBatches TABLE (BatchNo nvarchar(80) NOT NULL PRIMARY KEY, Sku nvarchar(80) NOT NULL, ExpectedQuantity int NOT NULL);
INSERT INTO @SaleBatches (BatchNo, Sku, ExpectedQuantity) VALUES
    (N'MPL-BAT-260911002807-9263', N'MYBOSS-LW-QR-NFC', 300),
    (N'MPL-BAT-260911002857-1515', N'PAWSOME-LW-QR-NFC', 300),
    (N'MPL-BAT-260911002959-6486', N'PAWSOME-SD-QR-NFC', 300);

DECLARE @SampleBatches TABLE (BatchNo nvarchar(80) NOT NULL PRIMARY KEY, ExpectedTags int NOT NULL);
INSERT INTO @SampleBatches (BatchNo, ExpectedTags) VALUES
    (N'BATCH-202607-9013', 2),
    (N'BATCH-202607-8221', 2);

DECLARE @Checks TABLE (Seq int IDENTITY(1, 1) PRIMARY KEY, CheckName nvarchar(200) NOT NULL,
    Result nvarchar(8) NOT NULL, Detail nvarchar(1000) NULL);

IF COL_LENGTH(N'dbo.SmartTags', N'StockPurpose') IS NULL
BEGIN
    SELECT N'StockPurpose column missing: the AddSmartTagStockPurpose migration is not applied.' AS ReadinessStatus;
    THROW 52190, N'Not ready: the stock purpose migration is not applied.', 1;
END;

-- One row per live tag. The purpose is read dynamically so the script
-- compiles everywhere.
DECLARE @Tags TABLE (
    TagId uniqueidentifier NOT NULL PRIMARY KEY,
    TagCode nvarchar(32) NOT NULL,
    ProductVariantId uniqueidentifier NULL,
    BatchNo nvarchar(80) NULL,
    QaStatus nvarchar(32) NULL,
    StockPurpose nvarchar(32) NOT NULL,
    Received bit NOT NULL,
    OnShelf bit NOT NULL,
    OrderId uniqueidentifier NULL,
    OrderItemId uniqueidentifier NULL,
    LiveAllocation bit NOT NULL);
INSERT INTO @Tags
EXEC sys.sp_executesql N'
SELECT
    t.Id, t.TagCode, t.ProductVariantId, b.BatchNo, t.QaStatus, t.StockPurpose,
    CASE WHEN t.InventoryReceiptId IS NULL THEN 0 ELSE 1 END,
    -- SellableInventoryRules.OnShelf, exactly.
    CASE WHEN t.Status = N''Unclaimed''
              AND t.ArchivedAt IS NULL
              AND t.FulfilmentStatus IN (N''Generated'', N''Printed'')
              AND t.OwnerUserId IS NULL AND t.PetId IS NULL
              AND t.OrderId IS NULL AND t.OrderItemId IS NULL
              AND NOT EXISTS (SELECT 1 FROM dbo.MerchantOrderAllocatedTags a
                              WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL)
         THEN 1 ELSE 0 END,
    t.OrderId, t.OrderItemId,
    CASE WHEN EXISTS (SELECT 1 FROM dbo.MerchantOrderAllocatedTags a
                      WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL) THEN 1 ELSE 0 END
FROM dbo.SmartTags t
LEFT JOIN dbo.SmartTagBatches b ON b.Id = t.BatchId
WHERE t.DeletedAt IS NULL;';

DECLARE @Count int;
DECLARE @Detail nvarchar(1000);

-- M1. Schema: the stock purpose migration is the newest applied migration.
IF OBJECT_ID(N'dbo.__EFMigrationsHistory', N'U') IS NULL
    INSERT INTO @Checks VALUES (N'Latest applied migration is the stock purpose migration', N'FAIL', N'No migration history table');
ELSE
BEGIN
    SET @Detail = (SELECT TOP 1 MigrationId FROM dbo.__EFMigrationsHistory ORDER BY MigrationId DESC);
    INSERT INTO @Checks VALUES (N'Latest applied migration is the stock purpose migration',
        CASE WHEN @Detail = @LatestMigration THEN N'PASS' ELSE N'FAIL' END, @Detail);
    SET @Count = (SELECT COUNT(*) FROM dbo.__EFMigrationsHistory WHERE MigrationId > @LatestMigration);
    INSERT INTO @Checks VALUES (N'No migration newer than this release',
        CASE WHEN @Count = 0 THEN N'PASS' ELSE N'FAIL' END, CONCAT(@Count, N' newer'));
END;

-- B1-B4. The confirmed commercial baseline.
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE StockPurpose = N'Sale');
INSERT INTO @Checks VALUES (N'Commercial (Sale) tags', CASE WHEN @Count = @ExpectedSale THEN N'PASS' ELSE N'FAIL' END,
    CONCAT(@Count, N' (expected ', @ExpectedSale, N')'));
SET @Count = (SELECT COUNT(*) FROM @Tags x JOIN @SaleBatches sb ON sb.BatchNo = x.BatchNo WHERE x.StockPurpose = N'Sale');
INSERT INTO @Checks VALUES (N'Commercial tags inside the three confirmed batches', CASE WHEN @Count = @ExpectedSale THEN N'PASS' ELSE N'FAIL' END,
    CONCAT(@Count, N' of ', @ExpectedSale));
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE StockPurpose = N'Sale' AND Received = 1);
INSERT INTO @Checks VALUES (N'Commercial tags linked to a stock receipt', CASE WHEN @Count = @ExpectedSale THEN N'PASS' ELSE N'FAIL' END,
    CONCAT(@Count, N' of ', @ExpectedSale));
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE StockPurpose = N'Sale' AND QaStatus = N'Passed');
INSERT INTO @Checks VALUES (N'Commercial tags QA Passed', CASE WHEN @Count = @ExpectedPassed THEN N'PASS' ELSE N'FAIL' END,
    CONCAT(@Count, N' (expected ', @ExpectedPassed, N')'));
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE StockPurpose = N'Sale' AND QaStatus = N'Pending');
INSERT INTO @Checks VALUES (N'Commercial tags QA Pending', CASE WHEN @Count = @ExpectedPending THEN N'PASS' ELSE N'FAIL' END,
    CONCAT(@Count, N' (expected ', @ExpectedPending, N')'));
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE StockPurpose = N'Sale' AND (QaStatus IS NULL OR QaStatus IN (N'Failed', N'NeedsReview')));
INSERT INTO @Checks VALUES (N'Commercial tags not enrolled, Failed or Needs Review', N'INFO',
    CONCAT(@Count, N' (never orderable)'));

-- S1. The four older samples are still Unclassified.
INSERT INTO @Checks
SELECT CONCAT(N'Sample batch ', sb.BatchNo),
       CASE WHEN COUNT(x.TagId) = sb.ExpectedTags
                 AND SUM(CASE WHEN x.StockPurpose = N'Unclassified' THEN 1 ELSE 0 END) = sb.ExpectedTags
            THEN N'PASS' ELSE N'FAIL' END,
       CONCAT(COUNT(x.TagId), N' tags, ', SUM(CASE WHEN x.StockPurpose = N'Unclassified' THEN 1 ELSE 0 END), N' Unclassified, ',
              SUM(CASE WHEN x.Received = 1 THEN 1 ELSE 0 END), N' receipt-linked')
FROM @SampleBatches sb LEFT JOIN @Tags x ON x.BatchNo = sb.BatchNo
GROUP BY sb.BatchNo, sb.ExpectedTags;

-- O1. Nothing that is not commercial stock would be orderable. (The rule
--     excludes it; this shows how much the rule is keeping out.)
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE StockPurpose <> N'Sale' AND Received = 1
    AND QaStatus IN (N'Pending', N'Passed') AND OnShelf = 1);
INSERT INTO @Checks VALUES (N'Test / Unclassified tags that look orderable apart from their purpose', N'INFO',
    CONCAT(@Count, N' (excluded by the stock purpose rule)'));
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE StockPurpose NOT IN (N'Sale', N'Test', N'Unclassified'));
INSERT INTO @Checks VALUES (N'Unknown stock purpose values', CASE WHEN @Count = 0 THEN N'PASS' ELSE N'FAIL' END, CONCAT(@Count, N' found'));

-- D1-D4. No double commitment.
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE (OrderId IS NOT NULL OR OrderItemId IS NOT NULL) AND LiveAllocation = 1);
INSERT INTO @Checks VALUES (N'Tags on a customer order and a live merchant allocation', CASE WHEN @Count = 0 THEN N'PASS' ELSE N'FAIL' END, CONCAT(@Count, N' found'));
SET @Count = (SELECT COUNT(*) FROM (SELECT SmartTagId FROM dbo.MerchantOrderAllocatedTags WHERE ReleasedAt IS NULL GROUP BY SmartTagId HAVING COUNT(*) > 1) d);
INSERT INTO @Checks VALUES (N'Tags with more than one live merchant allocation', CASE WHEN @Count = 0 THEN N'PASS' ELSE N'FAIL' END, CONCAT(@Count, N' found'));
SET @Count = (SELECT COUNT(*) FROM @Tags x JOIN dbo.TagOrderItems i ON i.Id = x.OrderItemId WHERE x.OrderId IS NULL OR x.OrderId <> i.OrderId);
INSERT INTO @Checks VALUES (N'Tags whose order line belongs to a different order', CASE WHEN @Count = 0 THEN N'PASS' ELSE N'FAIL' END, CONCAT(@Count, N' found'));
SET @Count = (
    SELECT COUNT(*) FROM dbo.TagOrderItems i
    CROSS APPLY (SELECT COUNT(*) AS Assigned FROM dbo.SmartTags s
                 WHERE s.OrderItemId = i.Id AND s.ArchivedAt IS NULL AND s.DeletedAt IS NULL
                   AND s.Status IN (N'Pending', N'Preparing', N'Delivered', N'Active')) a
    WHERE a.Assigned > i.Quantity);
INSERT INTO @Checks VALUES (N'Order lines holding more tags than ordered', CASE WHEN @Count = 0 THEN N'PASS' ELSE N'FAIL' END, CONCAT(@Count, N' found'));
SET @Count = (
    SELECT COUNT(*) FROM (
        SELECT OwnerUserId, IdempotencyKey FROM dbo.TagOrders
        WHERE IdempotencyKey IS NOT NULL
          AND Status IN (N'PendingPayment', N'PaymentProofSubmitted', N'PaymentConfirmed', N'PreparingTag', N'ReadyToShip')
        GROUP BY OwnerUserId, IdempotencyKey HAVING COUNT(*) > 1) d);
INSERT INTO @Checks VALUES (N'Duplicate checkouts among open orders (same idempotency key)', CASE WHEN @Count = 0 THEN N'PASS' ELSE N'FAIL' END, CONCAT(@Count, N' found'));

SELECT CheckName, Result, Detail FROM @Checks ORDER BY Seq;

-- Open order lines: what each still reserves (TagOrderInventoryAvailabilityService).
DECLARE @Open TABLE (
    OrderItemId uniqueidentifier NOT NULL PRIMARY KEY, OrderId uniqueidentifier NOT NULL,
    ProductVariantId uniqueidentifier NOT NULL, Quantity int NOT NULL, Assigned int NOT NULL);
INSERT INTO @Open
SELECT i.Id, i.OrderId, i.ProductVariantId, i.Quantity, a.Assigned
FROM dbo.TagOrderItems i
JOIN dbo.TagOrders o ON o.Id = i.OrderId
CROSS APPLY (SELECT COUNT(*) AS Assigned FROM dbo.SmartTags s
             WHERE s.OrderItemId = i.Id AND s.ArchivedAt IS NULL AND s.DeletedAt IS NULL
               AND s.Status IN (N'Pending', N'Preparing', N'Delivered', N'Active')) a
WHERE o.Status IN (N'PendingPayment', N'PaymentProofSubmitted', N'PaymentConfirmed', N'PreparingTag', N'ReadyToShip')
  AND i.ProductVariantId IS NOT NULL;

-- 2. Orderable stock per commercial SKU.
WITH Reserved AS (
    SELECT ProductVariantId, SUM(CASE WHEN Quantity > Assigned THEN Quantity - Assigned ELSE 0 END) AS Units
    FROM @Open GROUP BY ProductVariantId
),
PerSku AS (
    SELECT v.Id, v.Sku,
           CASE WHEN p.IsPublished = 1 AND p.IsArchived = 0 AND v.ArchivedAt IS NULL
                     AND v.IsActive = 1 AND v.IsPurchasable = 1 THEN 1 ELSE 0 END AS OfferedPublicly,
           SUM(CASE WHEN x.StockPurpose = N'Sale' AND x.Received = 1 AND x.QaStatus IN (N'Pending', N'Passed') AND x.OnShelf = 1
                    THEN 1 ELSE 0 END) AS OrderableUnits,
           SUM(CASE WHEN x.StockPurpose = N'Sale' AND x.QaStatus = N'Passed' AND x.OnShelf = 1 THEN 1 ELSE 0 END) AS FulfillableUnits
    FROM dbo.TagProductVariants v
    JOIN dbo.TagProducts p ON p.Id = v.TagProductId
    LEFT JOIN @Tags x ON x.ProductVariantId = v.Id
    WHERE v.Sku IN (SELECT Sku FROM @SaleBatches)
    GROUP BY v.Id, v.Sku, p.IsPublished, p.IsArchived, v.ArchivedAt, v.IsActive, v.IsPurchasable
)
SELECT s.Sku, s.OfferedPublicly, s.OrderableUnits, s.FulfillableUnits,
       COALESCE(r.Units, 0) AS OpenReservations,
       CASE WHEN s.OrderableUnits > COALESCE(r.Units, 0) THEN s.OrderableUnits - COALESCE(r.Units, 0) ELSE 0 END AS AvailableToOrderAfterRelease,
       CASE WHEN s.FulfillableUnits > COALESCE(r.Units, 0) THEN s.FulfillableUnits - COALESCE(r.Units, 0) ELSE 0 END AS AvailableToOrderToday,
       CASE WHEN COALESCE(r.Units, 0) > s.OrderableUnits THEN N'Reservations exceed orderable stock' ELSE N'' END AS Note
FROM PerSku s LEFT JOIN Reserved r ON r.ProductVariantId = s.Id
ORDER BY s.Sku;

-- 3. Open order lines that reduce availability.
SELECT o.OrderNumber, o.Status, v.Sku, w.Quantity, w.Assigned,
       CASE WHEN w.Quantity > w.Assigned THEN w.Quantity - w.Assigned ELSE 0 END AS UnitsReserved,
       o.CreatedAt, o.PaymentConfirmedAt, o.PaymentReservationExpiresAt
FROM @Open w
JOIN dbo.TagOrders o ON o.Id = w.OrderId
JOIN dbo.TagProductVariants v ON v.Id = w.ProductVariantId
ORDER BY v.Sku, o.CreatedAt;

IF EXISTS (SELECT 1 FROM @Checks WHERE Result = N'FAIL')
    THROW 52190, N'Not ready: see the FAIL rows above.', 1;

PRINT N'Release readiness checks passed.';
