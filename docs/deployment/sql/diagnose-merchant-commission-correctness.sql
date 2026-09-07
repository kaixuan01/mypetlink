-- MyPetLink merchant commission pre-deployment diagnostic (read only)
-- -------------------------------------------------------------------
-- Run this before HardenMerchantCommissionCorrectness. It reports every
-- merchant order that has more than one financially effective commission and
-- then shows the underlying invoice/payment rows for review.
--
-- This script does not insert, update or delete anything. A duplicate must be
-- investigated and resolved through an approved, audited financial correction;
-- do not choose a row automatically based only on timestamps.

SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

IF OBJECT_ID(N'dbo.SalesCommissions', N'U') IS NULL
BEGIN
    THROW 51021, 'dbo.SalesCommissions does not exist in the current database.', 1;
END;

-- Result set 1: affected orders and aggregate exposure.
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
GROUP BY
    commission.MerchantOrderId,
    merchantOrder.MerchantOrderNumber
HAVING COUNT_BIG(*) > 1
ORDER BY merchantOrder.MerchantOrderNumber;

-- Result set 2: full commission and source-document detail for those orders.
WITH DuplicateOrders AS
(
    SELECT MerchantOrderId
    FROM dbo.SalesCommissions
    WHERE Status <> N'Reversed'
    GROUP BY MerchantOrderId
    HAVING COUNT_BIG(*) > 1
)
SELECT
    merchantOrder.MerchantOrderNumber,
    merchantOrder.PaymentStatus AS MerchantOrderPaymentStatus,
    commission.Id AS SalesCommissionId,
    commission.Status AS CommissionStatus,
    commission.SalespersonId,
    commission.SalespersonCodeSnapshot,
    commission.SalespersonNameSnapshot,
    commission.CommissionPercentageSnapshot,
    commission.CommissionBaseAmount,
    commission.CommissionAmount,
    commission.Currency,
    commission.CalculatedAt,
    commission.PaidAt,
    commission.ReversedAt,
    payment.Id AS MerchantPaymentId,
    payment.PaymentDate,
    payment.AmountReceived,
    invoice.Id AS MerchantInvoiceId,
    invoice.InvoiceNumber,
    invoice.Status AS MerchantInvoiceStatus,
    invoice.IssuedAt,
    invoice.PaidAt AS InvoicePaidAt,
    invoice.CancelledAt AS InvoiceCancelledAt
FROM DuplicateOrders AS duplicate
INNER JOIN dbo.MerchantOrders AS merchantOrder
    ON merchantOrder.Id = duplicate.MerchantOrderId
INNER JOIN dbo.SalesCommissions AS commission
    ON commission.MerchantOrderId = duplicate.MerchantOrderId
INNER JOIN dbo.MerchantPayments AS payment
    ON payment.Id = commission.MerchantPaymentId
INNER JOIN dbo.MerchantInvoices AS invoice
    ON invoice.Id = payment.MerchantInvoiceId
ORDER BY
    merchantOrder.MerchantOrderNumber,
    commission.CalculatedAt,
    commission.Id;
