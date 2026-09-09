-- MyPetLink Phase 3D-A financial authorization pre-deployment diagnostic
-- ---------------------------------------------------------------------
-- READ ONLY. Review every result set before deployment. Empty anomaly
-- result sets are expected; the active-SuperAdmin result must contain at
-- least one row. This script never inserts, updates, reverses or deletes data.

SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

IF OBJECT_ID(N'dbo.AdminUsers', N'U') IS NULL
   OR OBJECT_ID(N'dbo.SalesCommissions', N'U') IS NULL
BEGIN
    THROW 51051, 'The AdminUsers or SalesCommissions table is not present.', 1;
END;

-- Result set 1 (deployment blocker): at least one active SuperAdmin whose
-- underlying user is active must be returned before the stricter policies ship.
SELECT adminUser.Id AS AdminUserId, adminUser.UserId, users.Email, users.DisplayName
FROM dbo.AdminUsers AS adminUser
INNER JOIN dbo.Users AS users ON users.Id = adminUser.UserId
WHERE adminUser.Role = N'SuperAdmin'
  AND adminUser.IsActive = 1
  AND adminUser.DisabledAt IS NULL
  AND users.Status = N'Active'
  AND users.DeletedAt IS NULL;

-- Result set 2: status/timestamp shapes that would make accounting-event
-- reporting ambiguous or permit a payout state without its audit timestamp.
SELECT Id, Status, CalculatedAt, PaidAt, PaidByAdminUserId, ReversedAt,
       ReversedByAdminUserId, ReversalReason
FROM dbo.SalesCommissions
WHERE CalculatedAt IS NULL
   OR (Status = N'Payable' AND (PaidAt IS NOT NULL OR ReversedAt IS NOT NULL))
   OR (Status = N'Paid' AND PaidAt IS NULL)
   OR (Status = N'Reversed' AND (ReversedAt IS NULL
                                OR ReversedByAdminUserId IS NULL
                                OR NULLIF(LTRIM(RTRIM(ReversalReason)), N'') IS NULL))
   OR (Status <> N'Reversed' AND (ReversedAt IS NOT NULL
                                 OR ReversedByAdminUserId IS NOT NULL
                                 OR ReversalReason IS NOT NULL));

-- Result set 3: reversal completeness. PaidAt is intentionally preserved for
-- a paid-then-reversed row, but its original payout actor must remain present.
SELECT Id, Status, PaidAt, PaidByAdminUserId, ReversedAt,
       ReversedByAdminUserId, ReversalReason
FROM dbo.SalesCommissions
WHERE Status = N'Reversed'
  AND ((PaidAt IS NULL AND PaidByAdminUserId IS NOT NULL)
       OR (PaidAt IS NOT NULL AND PaidByAdminUserId IS NULL));

-- Result set 4: reporting currently supports the authoritative MYR ledger only.
SELECT N'Commission ledger' AS SourceKind, Currency, COUNT_BIG(*) AS Rows,
       SUM(CommissionAmount) AS Amount
FROM dbo.SalesCommissions
GROUP BY Currency
HAVING Currency <> N'MYR'
UNION ALL
SELECT N'Retail order', Currency, COUNT_BIG(*), SUM(TotalAmount)
FROM dbo.TagOrders
WHERE Currency <> N'MYR'
GROUP BY Currency
UNION ALL
SELECT N'Merchant payment', Currency, COUNT_BIG(*), SUM(AmountReceived)
FROM dbo.MerchantPayments
WHERE Currency <> N'MYR'
GROUP BY Currency;

-- Result set 5: impossible or unsupported financial values and source links.
SELECT Id, SourceType, CommissionType, MerchantOrderId, MerchantPaymentId,
       TagOrderId, MerchantId, CommissionBaseAmount, CommissionAmount, Currency
FROM dbo.SalesCommissions
WHERE CommissionBaseAmount < 0
   OR CommissionAmount < 0
   OR LEN(Currency) <> 3
   OR (CommissionPercentageSnapshot IS NULL AND CommissionFixedAmountSnapshot IS NULL)
   OR (CommissionPercentageSnapshot IS NOT NULL AND CommissionFixedAmountSnapshot IS NOT NULL)
   OR (SourceType = N'MerchantOrder' AND (MerchantOrderId IS NULL OR MerchantPaymentId IS NULL OR MerchantId IS NULL OR TagOrderId IS NOT NULL))
   OR (SourceType = N'TagOrder' AND (TagOrderId IS NULL OR MerchantOrderId IS NOT NULL OR MerchantPaymentId IS NOT NULL OR MerchantId IS NOT NULL));

-- Result set 6: activated reseller relationships with an incomplete immutable
-- activation snapshot or repeat window.
SELECT Id, MerchantCode, CommissionPlan, AcquiredBySalespersonId,
       FirstQualifyingPaidOrderAt, FirstQualifyingMerchantOrderId,
       RepeatCommissionPercentageSnapshot, RepeatCommissionEligibleUntil
FROM dbo.Merchants
WHERE FirstQualifyingPaidOrderAt IS NOT NULL
  AND (AcquiredBySalespersonId IS NULL
       OR FirstQualifyingMerchantOrderId IS NULL
       OR RepeatCommissionPercentageSnapshot IS NULL
       OR RepeatCommissionEligibleUntil IS NULL);

-- Result set 7: payout/reversal actors that no longer resolve. Historical
-- disabled admins are valid and remain visible; missing rows are not.
SELECT commission.Id, commission.Status, commission.PaidByAdminUserId,
       commission.ReversedByAdminUserId
FROM dbo.SalesCommissions AS commission
LEFT JOIN dbo.AdminUsers AS paidBy ON paidBy.Id = commission.PaidByAdminUserId
LEFT JOIN dbo.AdminUsers AS reversedBy ON reversedBy.Id = commission.ReversedByAdminUserId
WHERE (commission.PaidByAdminUserId IS NOT NULL AND paidBy.Id IS NULL)
   OR (commission.ReversedByAdminUserId IS NOT NULL AND reversedBy.Id IS NULL);
