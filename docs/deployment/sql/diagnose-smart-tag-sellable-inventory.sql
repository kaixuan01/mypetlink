-- MyPetLink Smart Tag sellable-inventory diagnostic
-- -------------------------------------------------
-- READ ONLY. Writes nothing and takes no application locks. Safe to run against
-- Production from SSMS / Azure Data Studio / Azure portal Query editor.
--
-- It reproduces, in SQL, exactly the predicates the API uses:
--   * released          = PhysicalQaReleaseRules.Released
--                         (QaStatus IS NULL OR QaStatus = 'Passed')
--   * on the shelf      = TagOrderInventoryAvailabilityService "unclaimed"
--                         (Unclaimed, not archived/deleted, Generated/Printed,
--                          no owner/pet/order/order item, no live merchant
--                          allocation)
--   * outstanding retail reservations
--                       = non-cancelled order item quantity minus tags
--                         assigned to that item in Pending/Preparing/Delivered/
--                         Active (not archived/deleted)
--   * sellable today    = MAX(0, released on the shelf - outstanding)
--                         -> what the public catalogue reports as inStock (> 0)
--   * sellable if only QA-Passed counted
--                       = MAX(0, Passed on the shelf - outstanding)
--                         -> what a strict "Passed only" policy would allow
--   * sellable after the inventory-safety remediation
--                       = MAX(0, Passed on the shelf - reservations held by
--                         orders that have NOT shipped yet)
--                         -> exactly what the catalogue offers once the
--                            remediation API is deployed (Passed-only stock,
--                            and shipped/delivered orders no longer reserve)
--
-- See docs/operations/smart-tag-sellable-inventory-audit.md.

SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
-- Production safety: never wait more than 5 seconds for a row lock held by a
-- live checkout, and if SQL Server ever has to choose, this script is the one
-- that yields. A timeout aborts the script with error 1222; just re-run it.
SET LOCK_TIMEOUT 5000;
SET DEADLOCK_PRIORITY LOW;

IF COL_LENGTH(N'dbo.SmartTags', N'QaStatus') IS NULL
BEGIN
    SELECT N'Physical QA schema is not present (AddSmartTagPhysicalQa not applied); every tag behaves as pre-QA stock.'
        AS DiagnosticStatus;
    RETURN;
END;

-- 1. Per SKU: registration, QA state, shelf state, reservations, sellability.
WITH TagState AS (
    SELECT
        t.Id,
        t.ProductVariantId,
        t.QaStatus,
        t.Status,
        CASE WHEN t.QaStatus IS NULL OR t.QaStatus = N'Passed' THEN 1 ELSE 0 END AS Released,
        CASE WHEN EXISTS (
                SELECT 1 FROM dbo.MerchantOrderAllocatedTags a
                WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL)
             THEN 1 ELSE 0 END AS MerchantAllocated,
        CASE WHEN t.Status = N'Unclaimed'
                  AND t.ArchivedAt IS NULL
                  AND t.FulfilmentStatus IN (N'Generated', N'Printed')
                  AND t.OwnerUserId IS NULL AND t.PetId IS NULL
                  AND t.OrderId IS NULL AND t.OrderItemId IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM dbo.MerchantOrderAllocatedTags a
                      WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL)
             THEN 1 ELSE 0 END AS OnShelf
    FROM dbo.SmartTags t
    WHERE t.DeletedAt IS NULL
),
Outstanding AS (
    SELECT
        i.ProductVariantId,
        SUM(CASE WHEN i.Quantity - x.Assigned > 0 THEN i.Quantity - x.Assigned ELSE 0 END) AS OutstandingUnits,
        COUNT(DISTINCT CASE WHEN i.Quantity - x.Assigned > 0 THEN o.Id END) AS OrdersHoldingStock
    FROM dbo.TagOrderItems i
    JOIN dbo.TagOrders o ON o.Id = i.OrderId
    CROSS APPLY (
        SELECT COUNT(*) AS Assigned
        FROM dbo.SmartTags s
        WHERE s.OrderItemId = i.Id
          AND s.ArchivedAt IS NULL AND s.DeletedAt IS NULL
          AND s.Status IN (N'Pending', N'Preparing', N'Delivered', N'Active')
    ) x
    WHERE o.Status <> N'Cancelled' AND i.ProductVariantId IS NOT NULL
    GROUP BY i.ProductVariantId
),
-- The remediated reservation rule: only orders that have not shipped hold stock.
OutstandingBeforeShipping AS (
    SELECT
        i.ProductVariantId,
        SUM(CASE WHEN i.Quantity - x.Assigned > 0 THEN i.Quantity - x.Assigned ELSE 0 END) AS OutstandingUnits
    FROM dbo.TagOrderItems i
    JOIN dbo.TagOrders o ON o.Id = i.OrderId
    CROSS APPLY (
        SELECT COUNT(*) AS Assigned
        FROM dbo.SmartTags s
        WHERE s.OrderItemId = i.Id
          AND s.ArchivedAt IS NULL AND s.DeletedAt IS NULL
          AND s.Status IN (N'Pending', N'Preparing', N'Delivered', N'Active')
    ) x
    WHERE o.Status IN (N'PendingPayment', N'PaymentProofSubmitted', N'PaymentConfirmed', N'PreparingTag', N'ReadyToShip')
      AND i.ProductVariantId IS NOT NULL
    GROUP BY i.ProductVariantId
),
PerSku AS (
    SELECT
        v.Id AS VariantId,
        p.Name AS Product,
        v.Sku,
        v.DisplayName AS Variant,
        CASE WHEN p.IsPublished = 1 AND p.IsArchived = 0 AND v.ArchivedAt IS NULL
                  AND v.IsActive = 1 AND v.IsPurchasable = 1
                  AND v.SupportsQr = 1 AND v.SupportsNfc = 1
             THEN 1 ELSE 0 END AS OfferedPublicly,
        COUNT(ts.Id) AS Registered,
        SUM(CASE WHEN ts.QaStatus IS NULL THEN 1 ELSE 0 END) AS QaNotEnrolled,
        SUM(CASE WHEN ts.QaStatus = N'Pending' THEN 1 ELSE 0 END) AS QaPending,
        SUM(CASE WHEN ts.QaStatus = N'Passed' THEN 1 ELSE 0 END) AS QaPassed,
        SUM(CASE WHEN ts.QaStatus = N'Failed' THEN 1 ELSE 0 END) AS QaFailed,
        SUM(CASE WHEN ts.QaStatus = N'NeedsReview' THEN 1 ELSE 0 END) AS QaNeedsReview,
        SUM(ts.Released) AS ReleasedByRule,
        SUM(ts.OnShelf) AS OnShelf,
        SUM(CASE WHEN ts.OnShelf = 1 AND ts.QaStatus IS NULL THEN 1 ELSE 0 END) AS OnShelfNotEnrolled,
        SUM(CASE WHEN ts.OnShelf = 1 AND ts.QaStatus = N'Passed' THEN 1 ELSE 0 END) AS OnShelfPassed,
        SUM(CASE WHEN ts.OnShelf = 1 AND ts.Released = 0 THEN 1 ELSE 0 END) AS OnShelfHeldByQa,
        SUM(CASE WHEN ts.Status IN (N'Pending', N'Preparing', N'Delivered', N'Active') THEN 1 ELSE 0 END) AS AssignedOrActive,
        SUM(ts.MerchantAllocated) AS MerchantAllocated,
        SUM(CASE WHEN ts.Status IN (N'Lost', N'Disabled', N'Replaced', N'Archived') THEN 1 ELSE 0 END) AS LostDisabledReplacedArchived
    FROM dbo.TagProductVariants v
    JOIN dbo.TagProducts p ON p.Id = v.TagProductId
    LEFT JOIN TagState ts ON ts.ProductVariantId = v.Id
    GROUP BY p.Name, v.Sku, v.DisplayName, p.IsPublished, p.IsArchived, v.ArchivedAt,
             v.IsActive, v.IsPurchasable, v.SupportsQr, v.SupportsNfc, v.Id
),
WithReservations AS (
    SELECT * FROM PerSku
)
SELECT
    w.Product, w.Sku, w.Variant, w.OfferedPublicly,
    w.Registered, w.QaNotEnrolled, w.QaPending, w.QaPassed, w.QaFailed, w.QaNeedsReview,
    w.ReleasedByRule, w.OnShelf, w.OnShelfNotEnrolled, w.OnShelfPassed, w.OnShelfHeldByQa,
    w.AssignedOrActive, w.MerchantAllocated, w.LostDisabledReplacedArchived,
    ISNULL(o.OutstandingUnits, 0) AS OutstandingRetailReservations,
    ISNULL(o.OrdersHoldingStock, 0) AS OrdersHoldingStock,
    CASE WHEN w.OnShelfPassed + w.OnShelfNotEnrolled - ISNULL(o.OutstandingUnits, 0) > 0
         THEN w.OnShelfPassed + w.OnShelfNotEnrolled - ISNULL(o.OutstandingUnits, 0) ELSE 0 END
        AS SellableToday,
    CASE WHEN w.OnShelfPassed - ISNULL(o.OutstandingUnits, 0) > 0
         THEN w.OnShelfPassed - ISNULL(o.OutstandingUnits, 0) ELSE 0 END
        AS SellableIfOnlyPassedCounted,
    ISNULL(o.OutstandingUnits, 0) - ISNULL(ob.OutstandingUnits, 0) AS PhantomReservations,
    CASE WHEN w.OnShelfPassed - ISNULL(ob.OutstandingUnits, 0) > 0
         THEN w.OnShelfPassed - ISNULL(ob.OutstandingUnits, 0) ELSE 0 END
        AS SellableAfterRemediation
FROM WithReservations w
LEFT JOIN Outstanding o ON o.ProductVariantId = w.VariantId
LEFT JOIN OutstandingBeforeShipping ob ON ob.ProductVariantId = w.VariantId
ORDER BY w.OfferedPublicly DESC, w.Product, w.Sku;

-- 2. Per production batch / shipment reference: is the shipment enrolled?
--    A batch whose tags are all QaNotEnrolled was generated before physical QA
--    existed and has never been enrolled: every one of them counts as stock.
SELECT
    b.BatchNo,
    v.Sku,
    b.GeneratedAt,
    b.Quantity AS BatchQuantity,
    COUNT(t.Id) AS TagsPresent,
    SUM(CASE WHEN t.QaStatus IS NULL THEN 1 ELSE 0 END) AS QaNotEnrolled,
    SUM(CASE WHEN t.QaStatus = N'Pending' THEN 1 ELSE 0 END) AS QaPending,
    SUM(CASE WHEN t.QaStatus = N'Passed' THEN 1 ELSE 0 END) AS QaPassed,
    SUM(CASE WHEN t.QaStatus IN (N'Failed', N'NeedsReview') THEN 1 ELSE 0 END) AS QaHeldFailedOrReview,
    MAX(t.QaShipmentReference) AS ShipmentReference,
    MAX(CASE WHEN s.Id IS NOT NULL THEN s.EnrolledAt END) AS ShipmentEnrolledAt
FROM dbo.SmartTagBatches b
LEFT JOIN dbo.TagProductVariants v ON v.Id = b.ProductVariantId
LEFT JOIN dbo.SmartTags t ON t.BatchId = b.Id AND t.DeletedAt IS NULL
LEFT JOIN dbo.PhysicalQaShipments s ON s.ShipmentReference = t.QaShipmentReference
GROUP BY b.BatchNo, v.Sku, b.GeneratedAt, b.Quantity
ORDER BY b.GeneratedAt DESC;

-- 3. Enrolled shipments (one row per manifest).
SELECT ShipmentReference, ExpectedCount, EnrolledAt
FROM dbo.PhysicalQaShipments
ORDER BY EnrolledAt DESC;

-- 4. Commitments already made with tags that have NOT passed physical QA:
--    retail orders and merchant allocations holding a NULL / Pending / Failed /
--    Needs Review tag. Today NULL rows can still ship. After the remediation
--    every row here is ON FULFILMENT HOLD (ready to ship / shipped refuse it)
--    until the tag is inspected (enroll, then pass) or the assigned tag is
--    changed to a Passed one. Nothing is cancelled or released automatically.
SELECT
    N'Retail order' AS CommitmentKind,
    o.OrderNumber AS Reference,
    o.Status AS CommitmentStatus,
    t.TagCode,
    ISNULL(t.QaStatus, N'(not enrolled)') AS QaStatus,
    t.Status AS TagStatus
FROM dbo.SmartTags t
JOIN dbo.TagOrders o ON o.Id = t.OrderId
WHERE t.DeletedAt IS NULL
  AND (t.QaStatus IS NULL OR t.QaStatus <> N'Passed')
  AND o.Status NOT IN (N'Shipped', N'Delivered', N'Cancelled')
UNION ALL
SELECT
    N'Merchant allocation',
    CONVERT(nvarchar(64), a.MerchantOrderId),
    a.Status,
    t.TagCode,
    ISNULL(t.QaStatus, N'(not enrolled)'),
    t.Status
FROM dbo.MerchantOrderAllocatedTags a
JOIN dbo.SmartTags t ON t.Id = a.SmartTagId
WHERE a.ReleasedAt IS NULL
  AND a.SentToMerchantAt IS NULL
  AND (t.QaStatus IS NULL OR t.QaStatus <> N'Passed')
ORDER BY CommitmentKind, Reference;

-- 5. Retail orders whose quantity is not covered by assigned tags. Today every
--    one of them reserves stock; after the remediation only orders that have
--    not shipped do (ReservesAfterRemediation = 1). Rows with 0 there are the
--    phantom reservations the remediation releases.
SELECT
    o.OrderNumber, o.Status, o.PaymentStatus, o.PaymentReservationExpiresAt,
    i.SkuSnapshot, i.Quantity,
    x.Assigned,
    i.Quantity - x.Assigned AS UnitsStillReserved,
    CASE WHEN o.Status IN (N'PendingPayment', N'PaymentProofSubmitted', N'PaymentConfirmed', N'PreparingTag', N'ReadyToShip')
         THEN 1 ELSE 0 END AS ReservesAfterRemediation
FROM dbo.TagOrderItems i
JOIN dbo.TagOrders o ON o.Id = i.OrderId
CROSS APPLY (
    SELECT COUNT(*) AS Assigned
    FROM dbo.SmartTags s
    WHERE s.OrderItemId = i.Id
      AND s.ArchivedAt IS NULL AND s.DeletedAt IS NULL
      AND s.Status IN (N'Pending', N'Preparing', N'Delivered', N'Active')
) x
WHERE o.Status <> N'Cancelled'
  AND i.Quantity - x.Assigned > 0
ORDER BY o.CreatedAt;

-- 6. Legacy (QA NULL) unclaimed tags: may one be handed to an owner (public
--    retail activation or Admin claim) after the remediation? Only with
--    trustworthy issuance history recorded on the tag itself -- a fulfilment
--    step that sent it out, a delivery, its own merchant shipment, or a recorded
--    owner activation. Order-level links, scan history and a bare Admin claim do
--    not count. On-shelf rows without history stay unsellable and unactivatable
--    until they are enrolled and pass inspection.
WITH LegacyUnclaimed AS (
    SELECT
        t.Id, t.TagCode, t.ProductVariantId, t.FulfilmentStatus,
        CASE WHEN t.FulfilmentStatus IN (N'SentToReseller', N'Received', N'SentToOwner') THEN 1 ELSE 0 END AS FulfilmentIssued,
        CASE WHEN t.DeliveredAt IS NOT NULL THEN 1 ELSE 0 END AS Delivered,
        CASE WHEN EXISTS (SELECT 1 FROM dbo.MerchantOrderAllocatedTags a
                          WHERE a.SmartTagId = t.Id AND a.ReleasedAt IS NULL AND a.SentToMerchantAt IS NOT NULL)
             THEN 1 ELSE 0 END AS ShippedToMerchant,
        CASE WHEN EXISTS (SELECT 1 FROM dbo.AuditLogs l
                          WHERE l.Entity = N'SmartTag' AND l.EntityId = t.Id
                            AND l.Action IN (N'tag.activate-retail', N'tag.activate-assigned'))
             THEN 1 ELSE 0 END AS OwnerActivatedBefore
    FROM dbo.SmartTags t
    WHERE t.DeletedAt IS NULL AND t.ArchivedAt IS NULL
      AND t.QaStatus IS NULL
      AND t.Status = N'Unclaimed'
      AND t.OwnerUserId IS NULL AND t.PetId IS NULL
)
SELECT
    v.Sku,
    COUNT(*) AS LegacyUnclaimedTags,
    SUM(CASE WHEN FulfilmentIssued + Delivered + ShippedToMerchant + OwnerActivatedBefore > 0 THEN 1 ELSE 0 END)
        AS HandOverAllowedAfterRemediation,
    SUM(CASE WHEN FulfilmentIssued + Delivered + ShippedToMerchant + OwnerActivatedBefore = 0 THEN 1 ELSE 0 END)
        AS HeldUntilInspected,
    SUM(OwnerActivatedBefore) AS AllowedByOwnerActivationHistory
FROM LegacyUnclaimed lu
LEFT JOIN dbo.TagProductVariants v ON v.Id = lu.ProductVariantId
GROUP BY v.Sku
ORDER BY v.Sku;
