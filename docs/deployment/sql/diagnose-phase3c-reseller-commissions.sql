-- MyPetLink Phase 3C reseller commission pre-deployment diagnostic (read only)
-- ---------------------------------------------------------------------------
-- Run before AddResellerAcquisitionAndRepeatCommission. Every result set must
-- be empty unless its heading says informational. This script never inserts,
-- updates, reverses or deletes rows.

SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

IF OBJECT_ID(N'dbo.Merchants', N'U') IS NULL
   OR OBJECT_ID(N'dbo.MerchantOrders', N'U') IS NULL
   OR OBJECT_ID(N'dbo.SalesCommissions', N'U') IS NULL
   OR OBJECT_ID(N'dbo.CommissionRules', N'U') IS NULL
BEGIN
    THROW 51044, 'The merchant commission tables are not present in this database.', 1;
END;

-- Result set 1: merchant commission rows that cannot be backfilled with the
-- merchant belonging to their immutable source order/payment.
SELECT
    commission.Id AS SalesCommissionId,
    commission.CommissionType,
    commission.MerchantOrderId,
    commission.MerchantPaymentId,
    merchantOrder.MerchantId AS OrderMerchantId,
    payment.MerchantOrderId AS PaymentOrderId,
    commission.Status,
    commission.CommissionAmount
FROM dbo.SalesCommissions AS commission
LEFT JOIN dbo.MerchantOrders AS merchantOrder
    ON merchantOrder.Id = commission.MerchantOrderId
LEFT JOIN dbo.MerchantPayments AS payment
    ON payment.Id = commission.MerchantPaymentId
WHERE commission.SourceType = N'MerchantOrder'
  AND (merchantOrder.Id IS NULL
       OR payment.Id IS NULL
       OR payment.MerchantOrderId <> commission.MerchantOrderId);

-- Result set 2: inconsistent legacy commission history. Reversed history is
-- retained, but an order may have only one currently effective legacy row.
SELECT
    commission.MerchantOrderId,
    merchantOrder.MerchantOrderNumber,
    COUNT_BIG(*) AS EffectiveLegacyCommissionCount,
    SUM(commission.CommissionAmount) AS EffectiveCommissionAmount
FROM dbo.SalesCommissions AS commission
LEFT JOIN dbo.MerchantOrders AS merchantOrder
    ON merchantOrder.Id = commission.MerchantOrderId
WHERE commission.CommissionType = N'MerchantOrderPercentage'
  AND commission.Status <> N'Reversed'
GROUP BY commission.MerchantOrderId, merchantOrder.MerchantOrderNumber
HAVING COUNT_BIG(*) > 1;

-- Result set 3: reseller financial rows or rules written while the Phase 3B
-- values were reserved but intentionally non-operational. The migration fails
-- closed instead of inventing a merchant plan or activation relationship.
SELECT N'Commission' AS ConflictKind, commission.Id, commission.CommissionType,
       commission.MerchantOrderId, commission.Status, commission.CalculatedAt
FROM dbo.SalesCommissions AS commission
WHERE commission.CommissionType IN (N'ResellerAcquisitionBonus', N'ResellerRepeatPercentage')
UNION ALL
SELECT N'Rule', commissionRule.Id, commissionRule.CommissionType, NULL, NULL,
       commissionRule.EffectiveFrom
FROM dbo.CommissionRules AS commissionRule
WHERE commissionRule.CommissionType <> N'DirectRetailPercentage';

-- Result set 4: duplicate acquisition bonuses by merchant, deriving merchant
-- identity from the source order so this also works before Phase 3C.
SELECT merchantOrder.MerchantId, COUNT_BIG(*) AS AcquisitionBonusCount
FROM dbo.SalesCommissions AS commission
INNER JOIN dbo.MerchantOrders AS merchantOrder
    ON merchantOrder.Id = commission.MerchantOrderId
WHERE commission.CommissionType = N'ResellerAcquisitionBonus'
GROUP BY merchantOrder.MerchantId
HAVING COUNT_BIG(*) > 1;

-- Result set 5: duplicate effective repeat commissions for one order.
SELECT commission.MerchantOrderId, COUNT_BIG(*) AS EffectiveRepeatCommissionCount
FROM dbo.SalesCommissions AS commission
WHERE commission.CommissionType = N'ResellerRepeatPercentage'
  AND commission.Status <> N'Reversed'
GROUP BY commission.MerchantOrderId
HAVING COUNT_BIG(*) > 1;

-- Result sets 6-10 apply after Phase 3C has been staged. They validate the
-- persisted relationship without requiring this pre-deployment script to
-- reference columns that do not yet exist.
IF COL_LENGTH(N'dbo.Merchants', N'CommissionPlan') IS NOT NULL
BEGIN
    EXEC sp_executesql N'
        -- Activation timestamp without an acquisition salesperson.
        SELECT Id, MerchantCode, CommissionPlan, FirstQualifyingPaidOrderAt,
               AcquiredBySalespersonId
        FROM dbo.Merchants
        WHERE FirstQualifyingPaidOrderAt IS NOT NULL
          AND AcquiredBySalespersonId IS NULL;

        -- Activation order that belongs to another merchant or is missing.
        SELECT merchant.Id, merchant.MerchantCode,
               merchant.FirstQualifyingMerchantOrderId,
               merchantOrder.MerchantId AS ActivationOrderMerchantId
        FROM dbo.Merchants AS merchant
        LEFT JOIN dbo.MerchantOrders AS merchantOrder
          ON merchantOrder.Id = merchant.FirstQualifyingMerchantOrderId
        WHERE merchant.FirstQualifyingMerchantOrderId IS NOT NULL
          AND (merchantOrder.Id IS NULL OR merchantOrder.MerchantId <> merchant.Id);

        -- Invalid half-open repeat window.
        SELECT Id, MerchantCode, FirstQualifyingPaidOrderAt,
               RepeatCommissionEligibleUntil
        FROM dbo.Merchants
        WHERE FirstQualifyingPaidOrderAt IS NOT NULL
          AND (RepeatCommissionEligibleUntil IS NULL
               OR RepeatCommissionEligibleUntil <= FirstQualifyingPaidOrderAt);

        -- Legacy rows must remain free of acquisition state.
        SELECT Id, MerchantCode, CommissionPlan, AcquiredBySalespersonId,
               FirstQualifyingMerchantOrderId
        FROM dbo.Merchants
        WHERE CommissionPlan = N''LegacyPercentage''
          AND (AcquiredBySalespersonId IS NOT NULL
               OR FirstQualifyingMerchantOrderId IS NOT NULL);

        -- Merchant identity stored on a commission must match its source order.
        SELECT commission.Id, commission.MerchantId,
               merchantOrder.MerchantId AS OrderMerchantId,
               commission.CommissionType
        FROM dbo.SalesCommissions AS commission
        INNER JOIN dbo.MerchantOrders AS merchantOrder
          ON merchantOrder.Id = commission.MerchantOrderId
        WHERE commission.SourceType = N''MerchantOrder''
          AND commission.MerchantId <> merchantOrder.MerchantId;';
END;
