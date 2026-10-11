-- MyPetLink Smart Tag order first, QA before shipping: PREVIEW STOCK
-- -----------------------------------------------------------------
-- READ ONLY. Writes nothing (table variables only) and takes no application
-- locks. Safe against Production from SSMS / Azure Data Studio / the Azure
-- portal Query editor, before and after the API release.
--
-- What it shows, per QR + NFC SKU:
--   1. Orderable stock under the order-first rule: Sale AND received (stock
--      receipt) AND physical QA Pending or Passed AND on the shelf, minus open
--      reservations. This is what the catalogue, checkout and the delivery
--      quote will use after the release.
--   2. Fulfillable stock: Sale AND QA Passed AND on the shelf. Only these tags
--      can be assigned, allocated or shipped, before and after the release.
--   3. The previous rule's availability (fulfillable minus reservations), so
--      the change in what customers can order is visible before deploying.
--   4. Paid orders still waiting for an inspected tag, with the number of
--      units each still needs.
--
-- Rules mirrored from SellableInventoryRules and
-- TagOrderInventoryAvailabilityService. Testing samples (Test), unclassified
-- stock, never-received stock, and QA NULL / Failed / NeedsReview units are
-- never orderable.

SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCK_TIMEOUT 5000;
SET DEADLOCK_PRIORITY LOW;

IF COL_LENGTH(N'dbo.SmartTags', N'StockPurpose') IS NULL
BEGIN
    SELECT N'StockPurpose column missing: the AddSmartTagStockPurpose migration is not applied.' AS PreviewStatus;
    RETURN;
END;

DECLARE @Tags TABLE (
    TagId uniqueidentifier NOT NULL PRIMARY KEY,
    ProductVariantId uniqueidentifier NULL,
    QaStatus nvarchar(32) NULL,
    StockPurpose nvarchar(32) NOT NULL,
    Received bit NOT NULL,
    OnShelf bit NOT NULL);
INSERT INTO @Tags
EXEC sys.sp_executesql N'
SELECT
    t.Id, t.ProductVariantId, t.QaStatus, t.StockPurpose,
    CASE WHEN t.InventoryReceiptId IS NULL THEN 0 ELSE 1 END,
    -- SellableInventoryRules.OnShelf, exactly.
    CASE WHEN t.Status = N''Unclaimed''
              AND t.ArchivedAt IS NULL
              AND t.FulfilmentStatus IN (N''Generated'', N''Printed'')
              AND t.OwnerUserId IS NULL AND t.PetId IS NULL
              AND t.OrderId IS NULL AND t.OrderItemId IS NULL
              AND NOT EXISTS (SELECT 1 FROM dbo.MerchantOrderAllocatedTags a
                              WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL)
         THEN 1 ELSE 0 END
FROM dbo.SmartTags t
WHERE t.DeletedAt IS NULL;';

-- Units still owed per order line: ordered quantity minus currently assigned tags.
DECLARE @Owed TABLE (
    OrderItemId uniqueidentifier NOT NULL PRIMARY KEY,
    OrderId uniqueidentifier NOT NULL,
    ProductVariantId uniqueidentifier NOT NULL,
    OrderStatus nvarchar(32) NOT NULL,
    Quantity int NOT NULL,
    Assigned int NOT NULL);
INSERT INTO @Owed
SELECT i.Id, i.OrderId, i.ProductVariantId, o.Status, i.Quantity, x.Assigned
FROM dbo.TagOrderItems i
JOIN dbo.TagOrders o ON o.Id = i.OrderId
CROSS APPLY (
    SELECT COUNT(*) AS Assigned FROM dbo.SmartTags s
    WHERE s.OrderItemId = i.Id AND s.ArchivedAt IS NULL AND s.DeletedAt IS NULL
      AND s.Status IN (N'Pending', N'Preparing', N'Delivered', N'Active')) x
WHERE o.Status IN (N'PendingPayment', N'PaymentProofSubmitted', N'PaymentConfirmed', N'PreparingTag', N'ReadyToShip')
  AND i.ProductVariantId IS NOT NULL;

-- 1-3. Stock per QR + NFC SKU.
WITH Reserved AS (
    SELECT ProductVariantId,
           SUM(CASE WHEN Quantity - Assigned > 0 THEN Quantity - Assigned ELSE 0 END) AS Units
    FROM @Owed GROUP BY ProductVariantId
),
PerSku AS (
    SELECT v.Id, v.Sku,
           CASE WHEN p.IsPublished = 1 AND p.IsArchived = 0 AND v.ArchivedAt IS NULL
                     AND v.IsActive = 1 AND v.IsPurchasable = 1 THEN 1 ELSE 0 END AS OfferedPublicly,
           SUM(CASE WHEN x.StockPurpose = N'Sale' THEN 1 ELSE 0 END) AS SaleUnits,
           SUM(CASE WHEN x.StockPurpose = N'Sale' AND x.Received = 1 THEN 1 ELSE 0 END) AS SaleReceived,
           SUM(CASE WHEN x.StockPurpose = N'Sale' AND x.QaStatus = N'Passed' THEN 1 ELSE 0 END) AS SalePassed,
           SUM(CASE WHEN x.StockPurpose = N'Sale' AND x.QaStatus = N'Pending' THEN 1 ELSE 0 END) AS SalePending,
           SUM(CASE WHEN x.StockPurpose = N'Sale' AND x.QaStatus IN (N'Failed', N'NeedsReview') THEN 1 ELSE 0 END) AS SaleFailedOrReview,
           SUM(CASE WHEN x.StockPurpose = N'Sale' AND x.QaStatus IS NULL THEN 1 ELSE 0 END) AS SaleNotEnrolled,
           SUM(CASE WHEN x.StockPurpose = N'Sale' AND x.Received = 1 AND x.QaStatus IN (N'Pending', N'Passed') AND x.OnShelf = 1
                    THEN 1 ELSE 0 END) AS OrderableUnits,
           SUM(CASE WHEN x.StockPurpose = N'Sale' AND x.QaStatus = N'Passed' AND x.OnShelf = 1 THEN 1 ELSE 0 END) AS FulfillableUnits,
           SUM(CASE WHEN x.StockPurpose <> N'Sale' AND x.Received = 1 AND x.QaStatus IN (N'Pending', N'Passed') AND x.OnShelf = 1
                    THEN 1 ELSE 0 END) AS ReceivedButNotForSale
    FROM dbo.TagProductVariants v
    JOIN dbo.TagProducts p ON p.Id = v.TagProductId
    LEFT JOIN @Tags x ON x.ProductVariantId = v.Id
    WHERE v.SupportsQr = 1 AND v.SupportsNfc = 1
    GROUP BY v.Id, v.Sku, p.IsPublished, p.IsArchived, v.ArchivedAt, v.IsActive, v.IsPurchasable
)
SELECT s.Sku, s.OfferedPublicly,
       s.SaleUnits, s.SaleReceived, s.SalePassed, s.SalePending, s.SaleFailedOrReview, s.SaleNotEnrolled,
       s.OrderableUnits, s.FulfillableUnits,
       COALESCE(r.Units, 0) AS OpenReservations,
       CASE WHEN s.OrderableUnits - COALESCE(r.Units, 0) > 0 THEN s.OrderableUnits - COALESCE(r.Units, 0) ELSE 0 END AS AvailableToOrder,
       CASE WHEN s.FulfillableUnits - COALESCE(r.Units, 0) > 0 THEN s.FulfillableUnits - COALESCE(r.Units, 0) ELSE 0 END AS AvailableUnderPreviousRule,
       CASE WHEN s.OfferedPublicly = 1 AND s.OrderableUnits - COALESCE(r.Units, 0) > 0 THEN 1 ELSE 0 END AS ExpectedCatalogueInStock,
       s.ReceivedButNotForSale
FROM PerSku s LEFT JOIN Reserved r ON r.ProductVariantId = s.Id
ORDER BY s.Sku;

-- 4. Paid orders still waiting for inspected tags (no automatic action is
--    ever taken on these: inspect a tag, then assign it).
SELECT o.OrderNumber, v.Sku, w.Quantity, w.Assigned, w.Quantity - w.Assigned AS UnitsAwaitingInspectedTag,
       o.PaymentConfirmedAt, o.CreatedAt
FROM @Owed w
JOIN dbo.TagOrders o ON o.Id = w.OrderId
JOIN dbo.TagProductVariants v ON v.Id = w.ProductVariantId
WHERE w.OrderStatus = N'PaymentConfirmed' AND w.Assigned < w.Quantity
ORDER BY o.PaymentConfirmedAt, o.OrderNumber;
