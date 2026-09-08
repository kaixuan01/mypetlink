-- MyPetLink Phase 3B commission pre-deployment diagnostic (read only)
-- ------------------------------------------------------------------
-- Run before GeneralizeSalesCommissionAndDirectRetail. Every result set must
-- be reviewed; this script never inserts, updates, reverses or deletes rows.

SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

IF OBJECT_ID(N'dbo.SalesCommissions', N'U') IS NULL
BEGIN
    THROW 51032, 'dbo.SalesCommissions does not exist in the current database.', 1;
END;

-- Result set 1: legacy merchant orders that would violate the new
-- (MerchantOrderId, CommissionType) non-reversed unique index.
SELECT
    commission.MerchantOrderId,
    merchantOrder.MerchantOrderNumber,
    COUNT_BIG(*) AS NonReversedCommissionCount,
    SUM(commission.CommissionAmount) AS RecordedCommissionAmount,
    MIN(commission.CalculatedAt) AS FirstCalculatedAt,
    MAX(commission.CalculatedAt) AS LastCalculatedAt
FROM dbo.SalesCommissions AS commission
INNER JOIN dbo.MerchantOrders AS merchantOrder
    ON merchantOrder.Id = commission.MerchantOrderId
WHERE commission.Status <> N'Reversed'
GROUP BY commission.MerchantOrderId, merchantOrder.MerchantOrderNumber
HAVING COUNT_BIG(*) > 1
ORDER BY merchantOrder.MerchantOrderNumber;

-- Result set 2: any payment with more than one historical commission. The new
-- uniqueness is type-aware, but every pre-3B row has the same merchant type.
SELECT
    commission.MerchantPaymentId,
    payment.MerchantInvoiceId,
    payment.MerchantOrderId,
    COUNT_BIG(*) AS CommissionCount,
    SUM(commission.CommissionAmount) AS RecordedCommissionAmount
FROM dbo.SalesCommissions AS commission
INNER JOIN dbo.MerchantPayments AS payment
    ON payment.Id = commission.MerchantPaymentId
GROUP BY
    commission.MerchantPaymentId,
    payment.MerchantInvoiceId,
    payment.MerchantOrderId
HAVING COUNT_BIG(*) > 1
ORDER BY payment.MerchantOrderId;

-- Result set 3: full rows for every conflict reported above. Historical
-- amounts and statuses must be resolved through an approved audited action.
WITH ConflictingOrders AS
(
    SELECT MerchantOrderId
    FROM dbo.SalesCommissions
    WHERE Status <> N'Reversed'
    GROUP BY MerchantOrderId
    HAVING COUNT_BIG(*) > 1
),
ConflictingPayments AS
(
    SELECT MerchantPaymentId
    FROM dbo.SalesCommissions
    GROUP BY MerchantPaymentId
    HAVING COUNT_BIG(*) > 1
)
SELECT
    commission.Id AS SalesCommissionId,
    commission.MerchantOrderId,
    merchantOrder.MerchantOrderNumber,
    commission.MerchantPaymentId,
    invoice.InvoiceNumber,
    commission.SalespersonId,
    commission.SalespersonCodeSnapshot,
    commission.SalespersonNameSnapshot,
    commission.CommissionPercentageSnapshot,
    commission.CommissionBaseAmount,
    commission.CommissionAmount,
    commission.Currency,
    commission.Status,
    commission.CalculatedAt,
    commission.PaidAt,
    commission.ReversedAt,
    commission.ReversalReason
FROM dbo.SalesCommissions AS commission
INNER JOIN dbo.MerchantOrders AS merchantOrder
    ON merchantOrder.Id = commission.MerchantOrderId
INNER JOIN dbo.MerchantPayments AS payment
    ON payment.Id = commission.MerchantPaymentId
INNER JOIN dbo.MerchantInvoices AS invoice
    ON invoice.Id = payment.MerchantInvoiceId
WHERE commission.MerchantOrderId IN (SELECT MerchantOrderId FROM ConflictingOrders)
   OR commission.MerchantPaymentId IN (SELECT MerchantPaymentId FROM ConflictingPayments)
ORDER BY merchantOrder.MerchantOrderNumber, commission.CalculatedAt, commission.Id;

-- Result set 4: attributed retail payments confirmed before Phase 3B. The
-- release does not create commission retroactively because eligibility must be
-- evaluated at the authoritative payment trigger. Review these separately if
-- the business wants an explicit post-release adjustment workflow.
SELECT
    tagOrder.Id AS TagOrderId,
    tagOrder.OrderNumber,
    tagOrder.SalespersonId,
    tagOrder.SalespersonCodeSnapshot,
    tagOrder.SalespersonNameSnapshot,
    tagOrder.PaymentStatus,
    tagOrder.PaymentConfirmedAt,
    tagOrder.Amount AS RecordedProductAmount,
    tagOrder.DeliveryFee,
    tagOrder.TotalAmount
FROM dbo.TagOrders AS tagOrder
WHERE tagOrder.SalespersonId IS NOT NULL
  AND tagOrder.PaymentStatus = N'Confirmed'
ORDER BY tagOrder.PaymentConfirmedAt, tagOrder.OrderNumber;

-- TagOrderId does not exist on SalesCommissions before this migration, so no
-- legacy row can conflict with the new TagOrder/type filtered unique index.
-- The migration creates the nullable column and the empty protected key in one
-- operation; it never infers or backfills direct-retail commission.

-- If the migration has already been staged in a non-production environment,
-- report linked-account self-referrals for explicit Admin review. They are not
-- rewritten automatically, and payment-time eligibility still excludes them.
IF COL_LENGTH(N'dbo.Salespersons', N'UserId') IS NOT NULL
BEGIN
    EXEC sp_executesql N'
        SELECT
            salesperson.Id AS SalespersonId,
            salesperson.SalespersonCode,
            salesperson.UserId,
            attribution.Id AS OwnerReferralAttributionId,
            attribution.AttributedAt,
            tagOrder.Id AS TagOrderId,
            tagOrder.OrderNumber,
            tagOrder.PaymentStatus,
            tagOrder.Status,
            commission.Id AS SalesCommissionId,
            commission.Status AS CommissionStatus,
            commission.CommissionAmount
        FROM dbo.Salespersons AS salesperson
        LEFT JOIN dbo.OwnerReferralAttributions AS attribution
            ON attribution.SalespersonId = salesperson.Id
           AND attribution.UserId = salesperson.UserId
        LEFT JOIN dbo.TagOrders AS tagOrder
            ON tagOrder.SalespersonId = salesperson.Id
           AND tagOrder.OwnerUserId = salesperson.UserId
        LEFT JOIN dbo.SalesCommissions AS commission
            ON commission.TagOrderId = tagOrder.Id
           AND commission.CommissionType = N''DirectRetailPercentage''
        WHERE salesperson.UserId IS NOT NULL
          AND (attribution.Id IS NOT NULL OR tagOrder.Id IS NOT NULL)
        ORDER BY salesperson.SalespersonCode, tagOrder.OrderNumber;';
END;
