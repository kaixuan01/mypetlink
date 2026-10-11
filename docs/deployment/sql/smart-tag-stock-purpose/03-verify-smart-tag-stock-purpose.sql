-- MyPetLink Smart Tag stock purpose, script 3 of 4: VERIFY
-- --------------------------------------------------------
-- READ ONLY. Writes nothing (table variables only) and takes no application
-- locks. Run after script 02 commits, again after the API is deployed, and at
-- any time later. Ends with an error if any check FAILs, so it cannot be
-- mistaken for a pass.
--
-- Checks:
--   * exactly 900 commercial (Sale) units: 300 in each confirmed batch, with
--     the confirmed SKU;
--   * no testing sample inside a commercial batch, and every listed testing
--     sample is Test;
--   * testing samples and unclassified stock are never counted as sellable,
--     even when they passed QA;
--   * commercial stock still needs QA Passed: Sale units by QA status;
--   * per QR + NFC SKU, the stock the public catalogue should report, using
--     the API's rule (on the shelf AND QA Passed AND Sale, minus open
--     reservations) - compare it with GET /api/v1/tag-products after deploy;
--   * anything unexpected: Sale outside the confirmed batches, unclassified
--     units on the shelf, classification without an audit record.
--
-- Keep @SaleBatches and @TestTags identical to scripts 01 and 02.

SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCK_TIMEOUT 5000;
SET DEADLOCK_PRIORITY LOW;

DECLARE @SaleBatches TABLE (
    BatchNo nvarchar(80) NOT NULL PRIMARY KEY,
    Sku nvarchar(80) NOT NULL,
    ExpectedQuantity int NOT NULL);
INSERT INTO @SaleBatches (BatchNo, Sku, ExpectedQuantity) VALUES
    (N'MPL-BAT-260911002807-9263', N'MYBOSS-LW-QR-NFC', 300),
    (N'MPL-BAT-260911002857-1515', N'PAWSOME-LW-QR-NFC', 300),
    (N'MPL-BAT-260911002959-6486', N'PAWSOME-SD-QR-NFC', 300);

DECLARE @TestTags TABLE (
    TagCode nvarchar(32) NOT NULL PRIMARY KEY,
    Sku nvarchar(80) NOT NULL);
-- INSERT INTO @TestTags (TagCode, Sku) VALUES
--     (N'MPL-XXXX-XXXX', N'MYBOSS-LW-QR-NFC');

-- 1 for the first verification after script 02: any Sale unit outside the
-- confirmed batches is then unexpected. Set 0 once new commercial batches are
-- generated through the Admin Portal (they are Sale by the operator's choice).
DECLARE @InitialClassification bit = 1;

DECLARE @Checks TABLE (Seq int IDENTITY(1, 1) PRIMARY KEY, CheckName nvarchar(200) NOT NULL,
    Result nvarchar(8) NOT NULL, Detail nvarchar(1000) NULL);

IF COL_LENGTH(N'dbo.SmartTags', N'StockPurpose') IS NULL
BEGIN
    SELECT N'StockPurpose column missing: the AddSmartTagStockPurpose migration is not applied.' AS VerifyStatus;
    THROW 52090, N'Verification failed: the stock purpose migration is not applied.', 1;
END;

-- One row per live tag with the facts the checks need. The StockPurpose read
-- is dynamic so this script compiles on a database without the column.
DECLARE @Tags TABLE (
    TagId uniqueidentifier NOT NULL PRIMARY KEY,
    TagCode nvarchar(32) NOT NULL,
    ProductVariantId uniqueidentifier NULL,
    Sku nvarchar(80) NULL,
    BatchNo nvarchar(80) NULL,
    QaStatus nvarchar(32) NULL,
    Status nvarchar(32) NOT NULL,
    StockPurpose nvarchar(32) NOT NULL,
    OnShelf bit NOT NULL,
    InSaleBatch bit NOT NULL,
    ExpectedSaleSku nvarchar(80) NULL,
    ListedAsTest bit NOT NULL,
    ClassificationAudits int NOT NULL);
INSERT INTO @Tags
EXEC sys.sp_executesql N'
SELECT
    t.Id, t.TagCode, t.ProductVariantId, v.Sku, b.BatchNo, t.QaStatus, t.Status, t.StockPurpose,
    CASE WHEN t.Status = N''Unclaimed''
              AND t.ArchivedAt IS NULL
              AND t.FulfilmentStatus IN (N''Generated'', N''Printed'')
              AND t.OwnerUserId IS NULL AND t.PetId IS NULL
              AND t.OrderId IS NULL AND t.OrderItemId IS NULL
              AND NOT EXISTS (SELECT 1 FROM dbo.MerchantOrderAllocatedTags a
                              WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL)
         THEN 1 ELSE 0 END,
    0, NULL, 0,
    (SELECT COUNT(*) FROM dbo.AuditLogs l
     WHERE l.Entity = N''SmartTag'' AND l.EntityId = t.Id AND l.Action = N''tag-inventory.stock-purpose.classify'')
FROM dbo.SmartTags t
LEFT JOIN dbo.TagProductVariants v ON v.Id = t.ProductVariantId
LEFT JOIN dbo.SmartTagBatches b ON b.Id = t.BatchId
WHERE t.DeletedAt IS NULL;';

UPDATE x SET x.InSaleBatch = 1, x.ExpectedSaleSku = sb.Sku
FROM @Tags x JOIN @SaleBatches sb ON sb.BatchNo = x.BatchNo;
UPDATE x SET x.ListedAsTest = 1
FROM @Tags x JOIN @TestTags tt ON tt.TagCode = x.TagCode;

DECLARE @ExpectedSale int = (SELECT SUM(ExpectedQuantity) FROM @SaleBatches);
DECLARE @Count int;

-- C1. Exactly the confirmed number of commercial units, all Sale.
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE InSaleBatch = 1 AND StockPurpose = N'Sale');
INSERT INTO @Checks (CheckName, Result, Detail)
VALUES (N'Commercial units classified Sale', CASE WHEN @Count = @ExpectedSale THEN N'PASS' ELSE N'FAIL' END,
        CONCAT(@Count, N' of ', @ExpectedSale));

-- C2. Per batch: count and SKU.
INSERT INTO @Checks (CheckName, Result, Detail)
SELECT CONCAT(N'Batch ', sb.BatchNo, N' (', sb.Sku, N')'),
       CASE WHEN COUNT(x.TagId) = sb.ExpectedQuantity
                 AND SUM(CASE WHEN x.StockPurpose = N'Sale' THEN 1 ELSE 0 END) = sb.ExpectedQuantity
                 AND SUM(CASE WHEN x.Sku = sb.Sku THEN 1 ELSE 0 END) = sb.ExpectedQuantity
            THEN N'PASS' ELSE N'FAIL' END,
       CONCAT(COUNT(x.TagId), N' tags, ', SUM(CASE WHEN x.StockPurpose = N'Sale' THEN 1 ELSE 0 END), N' Sale, ',
              SUM(CASE WHEN x.Sku = sb.Sku THEN 1 ELSE 0 END), N' with the confirmed SKU')
FROM @SaleBatches sb LEFT JOIN @Tags x ON x.BatchNo = sb.BatchNo
GROUP BY sb.BatchNo, sb.Sku, sb.ExpectedQuantity;

-- C3. No testing sample in a commercial batch.
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE InSaleBatch = 1 AND StockPurpose = N'Test');
INSERT INTO @Checks VALUES (N'No testing sample inside a commercial batch', CASE WHEN @Count = 0 THEN N'PASS' ELSE N'FAIL' END, CONCAT(@Count, N' found'));

-- C4. Listed testing samples are Test.
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE ListedAsTest = 1 AND StockPurpose <> N'Test');
INSERT INTO @Checks VALUES (N'Listed testing samples are Test',
    CASE WHEN @Count = 0 AND (SELECT COUNT(*) FROM @Tags WHERE ListedAsTest = 1) = (SELECT COUNT(*) FROM @TestTags) THEN N'PASS' ELSE N'FAIL' END,
    CONCAT((SELECT COUNT(*) FROM @Tags WHERE ListedAsTest = 1 AND StockPurpose = N'Test'), N' of ', (SELECT COUNT(*) FROM @TestTags), N' listed'));

-- C5. Sale outside the confirmed batches.
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE InSaleBatch = 0 AND StockPurpose = N'Sale');
INSERT INTO @Checks VALUES (N'Sale units outside the confirmed batches',
    CASE WHEN @Count = 0 THEN N'PASS' WHEN @InitialClassification = 1 THEN N'FAIL' ELSE N'INFO' END, CONCAT(@Count, N' found'));

-- C6. Classified by script 02 with an audit record (confirmed batches and listed samples).
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE (InSaleBatch = 1 OR ListedAsTest = 1) AND StockPurpose <> N'Unclassified' AND ClassificationAudits = 0);
INSERT INTO @Checks VALUES (N'Every classified unit has an audit record', CASE WHEN @Count = 0 THEN N'PASS' ELSE N'FAIL' END, CONCAT(@Count, N' without one'));

-- C7. Nothing that is not Sale is ever counted as sellable (the API rule).
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE StockPurpose <> N'Sale' AND QaStatus = N'Passed' AND OnShelf = 1);
INSERT INTO @Checks VALUES (N'Passed shelf units excluded because they are not commercial stock', N'INFO',
    CONCAT(@Count, N' (testing samples or unclassified; never sold)'));

-- C8. Commercial stock still needs QA Passed.
INSERT INTO @Checks VALUES (N'Commercial units by physical QA', N'INFO', CONCAT(
    (SELECT COUNT(*) FROM @Tags WHERE StockPurpose = N'Sale' AND QaStatus = N'Passed'), N' Passed (sellable when on the shelf), ',
    (SELECT COUNT(*) FROM @Tags WHERE StockPurpose = N'Sale' AND QaStatus = N'Pending'), N' Pending, ',
    (SELECT COUNT(*) FROM @Tags WHERE StockPurpose = N'Sale' AND QaStatus IS NULL), N' not enrolled, ',
    (SELECT COUNT(*) FROM @Tags WHERE StockPurpose = N'Sale' AND QaStatus IN (N'Failed', N'NeedsReview')), N' Failed or Needs Review (none of these sell)'));

-- C9. Unclassified stock on the shelf.
SET @Count = (SELECT COUNT(*) FROM @Tags WHERE StockPurpose = N'Unclassified' AND OnShelf = 1);
INSERT INTO @Checks VALUES (N'Unclassified units on the shelf', CASE WHEN @Count = 0 THEN N'PASS' ELSE N'INFO' END,
    CONCAT(@Count, N' (never sold; review and classify by exact identity if needed)'));

SELECT CheckName, Result, Detail FROM @Checks ORDER BY Seq;

-- Expected catalogue stock per QR + NFC SKU (TagOrderInventoryAvailabilityService).
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
PerSku AS (
    SELECT v.Id, v.Sku,
           CASE WHEN p.IsPublished = 1 AND p.IsArchived = 0 AND v.ArchivedAt IS NULL
                     AND v.IsActive = 1 AND v.IsPurchasable = 1 THEN 1 ELSE 0 END AS OfferedPublicly,
           SUM(CASE WHEN x.StockPurpose = N'Sale' THEN 1 ELSE 0 END) AS SaleUnits,
           SUM(CASE WHEN x.StockPurpose = N'Test' THEN 1 ELSE 0 END) AS TestUnits,
           SUM(CASE WHEN x.StockPurpose = N'Unclassified' THEN 1 ELSE 0 END) AS UnclassifiedUnits,
           SUM(CASE WHEN x.StockPurpose = N'Sale' AND x.QaStatus = N'Passed' AND x.OnShelf = 1 THEN 1 ELSE 0 END) AS SellableUnits,
           SUM(CASE WHEN x.StockPurpose <> N'Sale' AND x.QaStatus = N'Passed' AND x.OnShelf = 1 THEN 1 ELSE 0 END) AS PassedButNotForSale
    FROM dbo.TagProductVariants v
    JOIN dbo.TagProducts p ON p.Id = v.TagProductId
    LEFT JOIN @Tags x ON x.ProductVariantId = v.Id
    WHERE v.SupportsQr = 1 AND v.SupportsNfc = 1
    GROUP BY v.Id, v.Sku, p.IsPublished, p.IsArchived, v.ArchivedAt, v.IsActive, v.IsPurchasable
)
SELECT s.Sku, s.OfferedPublicly, s.SaleUnits, s.TestUnits, s.UnclassifiedUnits, s.SellableUnits,
       COALESCE(o.Units, 0) AS OpenReservations,
       CASE WHEN s.SellableUnits - COALESCE(o.Units, 0) > 0 THEN s.SellableUnits - COALESCE(o.Units, 0) ELSE 0 END AS AvailableUnits,
       CASE WHEN s.OfferedPublicly = 1 AND s.SellableUnits - COALESCE(o.Units, 0) > 0 THEN 1 ELSE 0 END AS ExpectedCatalogueInStock,
       s.PassedButNotForSale
FROM PerSku s LEFT JOIN Outstanding o ON o.ProductVariantId = s.Id
ORDER BY s.Sku;

-- Unexpected rows, one by one.
SELECT N'Sale outside confirmed batches' AS Finding, x.TagCode, x.Sku, x.BatchNo, x.StockPurpose, x.QaStatus, x.Status
FROM @Tags x WHERE x.InSaleBatch = 0 AND x.StockPurpose = N'Sale'
UNION ALL
SELECT N'Testing sample inside a commercial batch', x.TagCode, x.Sku, x.BatchNo, x.StockPurpose, x.QaStatus, x.Status
FROM @Tags x WHERE x.InSaleBatch = 1 AND x.StockPurpose = N'Test'
UNION ALL
SELECT N'Commercial batch unit not Sale', x.TagCode, x.Sku, x.BatchNo, x.StockPurpose, x.QaStatus, x.Status
FROM @Tags x WHERE x.InSaleBatch = 1 AND x.StockPurpose <> N'Sale'
UNION ALL
SELECT N'Listed testing sample not Test', x.TagCode, x.Sku, x.BatchNo, x.StockPurpose, x.QaStatus, x.Status
FROM @Tags x WHERE x.ListedAsTest = 1 AND x.StockPurpose <> N'Test'
UNION ALL
SELECT N'Unclassified on the shelf', x.TagCode, x.Sku, x.BatchNo, x.StockPurpose, x.QaStatus, x.Status
FROM @Tags x WHERE x.StockPurpose = N'Unclassified' AND x.OnShelf = 1
ORDER BY Finding, Sku, TagCode;

IF EXISTS (SELECT 1 FROM @Checks WHERE Result = N'FAIL')
    THROW 52090, N'Verification failed: see the FAIL rows above.', 1;

PRINT N'Verification passed.';
