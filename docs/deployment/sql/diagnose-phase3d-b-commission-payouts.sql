-- MyPetLink Phase 3D-B commission payout deployment diagnostic
-- ------------------------------------------------------------
-- READ ONLY. Run after applying the additive payout-table migration and
-- before enabling payout endpoints. Empty anomaly result sets are expected;
-- result set 1 must contain at least one active SuperAdmin. This script never
-- inserts, updates, reverses, releases or deletes data.

SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

IF OBJECT_ID(N'dbo.AdminUsers', N'U') IS NULL
   OR OBJECT_ID(N'dbo.SalesCommissions', N'U') IS NULL
   OR OBJECT_ID(N'dbo.CommissionPayouts', N'U') IS NULL
   OR OBJECT_ID(N'dbo.CommissionPayoutItems', N'U') IS NULL
BEGIN
    THROW 51061, 'The Phase 3D-B commission payout tables are not all present.', 1;
END;

-- Result set 1 (deployment blocker): at least one active SuperAdmin whose
-- underlying account is active must exist before payout finalisation ships.
SELECT adminUser.Id AS AdminUserId, adminUser.UserId, users.Email, users.DisplayName
FROM dbo.AdminUsers AS adminUser
INNER JOIN dbo.Users AS users ON users.Id = adminUser.UserId
WHERE adminUser.Role = N'SuperAdmin'
  AND adminUser.IsActive = 1
  AND adminUser.DisabledAt IS NULL
  AND users.Status = N'Active'
  AND users.DeletedAt IS NULL;

-- Result set 2: legacy commission state/timestamp anomalies that make payout
-- eligibility or recovery history ambiguous.
SELECT Id, Status, CalculatedAt, PaidAt, PaidByAdminUserId, ReversedAt,
       ReversedByAdminUserId, ReversalReason
FROM dbo.SalesCommissions
WHERE CalculatedAt IS NULL
   OR (Status = N'Payable' AND (PaidAt IS NOT NULL OR ReversedAt IS NOT NULL))
   OR (Status = N'Paid' AND (PaidAt IS NULL OR PaidByAdminUserId IS NULL))
   OR (Status = N'Reversed' AND (ReversedAt IS NULL
                                OR ReversedByAdminUserId IS NULL
                                OR NULLIF(LTRIM(RTRIM(ReversalReason)), N'') IS NULL));

-- Result set 3: unsupported currencies. Phase 3D-B intentionally fails closed
-- to MYR and does not aggregate currencies.
SELECT Currency, COUNT_BIG(*) AS Rows, SUM(CommissionAmount) AS Amount
FROM dbo.SalesCommissions
GROUP BY Currency
HAVING Currency <> N'MYR'
UNION ALL
SELECT Currency, COUNT_BIG(*), SUM(PreparedAmount)
FROM dbo.CommissionPayouts
GROUP BY Currency
HAVING Currency <> N'MYR'
UNION ALL
SELECT CurrencySnapshot, COUNT_BIG(*), SUM(CommissionAmountSnapshot)
FROM dbo.CommissionPayoutItems
GROUP BY CurrencySnapshot
HAVING CurrencySnapshot <> N'MYR';

-- Result set 4: a commission claimed by more than one unreleased item. The
-- filtered unique index should make this empty even under contention.
SELECT SalesCommissionId, COUNT_BIG(*) AS ActiveClaims
FROM dbo.CommissionPayoutItems
WHERE ReleasedAt IS NULL
GROUP BY SalesCommissionId
HAVING COUNT_BIG(*) > 1;

-- Result set 5: header total differs from its full immutable child snapshot,
-- or a live Prepared/Paid header differs from its active child snapshot.
-- Cancelled items remain part of the full prepared historical total.
SELECT N'AllItems' AS Comparison, payout.Id, payout.PayoutNumber, payout.Status, payout.PreparedAmount,
       COUNT_BIG(item.Id) AS ItemCount,
       COALESCE(SUM(item.CommissionAmountSnapshot), 0) AS ItemTotal
FROM dbo.CommissionPayouts AS payout
LEFT JOIN dbo.CommissionPayoutItems AS item ON item.CommissionPayoutId = payout.Id
GROUP BY payout.Id, payout.PayoutNumber, payout.Status, payout.PreparedAmount
HAVING COUNT_BIG(item.Id) = 0
    OR payout.PreparedAmount <> COALESCE(SUM(item.CommissionAmountSnapshot), 0)
UNION ALL
SELECT N'ActiveItems', payout.Id, payout.PayoutNumber, payout.Status, payout.PreparedAmount,
       COUNT_BIG(item.Id), COALESCE(SUM(item.CommissionAmountSnapshot), 0)
FROM dbo.CommissionPayouts AS payout
LEFT JOIN dbo.CommissionPayoutItems AS item
  ON item.CommissionPayoutId = payout.Id AND item.ReleasedAt IS NULL
WHERE payout.Status IN (N'Prepared', N'Paid')
GROUP BY payout.Id, payout.PayoutNumber, payout.Status, payout.PreparedAmount
HAVING COUNT_BIG(item.Id) = 0
    OR payout.PreparedAmount <> COALESCE(SUM(item.CommissionAmountSnapshot), 0);

-- Result set 6: paid payout missing mandatory finalisation evidence.
SELECT Id, PayoutNumber, Status, PaidAt, PaidByAdminUserId, PaymentMethod,
       PaymentReference
FROM dbo.CommissionPayouts
WHERE Status = N'Paid'
  AND (PaidAt IS NULL OR PaidByAdminUserId IS NULL OR PaymentMethod IS NULL
       OR NULLIF(LTRIM(RTRIM(PaymentReference)), N'') IS NULL);

-- Result set 7: cancelled payout missing cancellation evidence, or retaining
-- an active item that was not released.
SELECT DISTINCT payout.Id, payout.PayoutNumber, payout.CancelledAt,
       payout.CancelledByAdminUserId, payout.CancellationReason
FROM dbo.CommissionPayouts AS payout
LEFT JOIN dbo.CommissionPayoutItems AS item ON item.CommissionPayoutId = payout.Id
WHERE payout.Status = N'Cancelled'
  AND (payout.CancelledAt IS NULL OR payout.CancelledByAdminUserId IS NULL
       OR NULLIF(LTRIM(RTRIM(payout.CancellationReason)), N'') IS NULL
       OR item.ReleasedAt IS NULL OR item.ReleasedByAdminUserId IS NULL
       OR NULLIF(LTRIM(RTRIM(item.ReleaseReason)), N'') IS NULL);

-- Result set 8: payout seller differs from the selected commission seller.
SELECT payout.Id AS PayoutId, payout.PayoutNumber, payout.SalespersonId AS PayoutSalespersonId,
       item.SalesCommissionId, commission.SalespersonId AS CommissionSalespersonId
FROM dbo.CommissionPayouts AS payout
INNER JOIN dbo.CommissionPayoutItems AS item ON item.CommissionPayoutId = payout.Id
INNER JOIN dbo.SalesCommissions AS commission ON commission.Id = item.SalesCommissionId
WHERE payout.SalespersonId <> commission.SalespersonId;

-- Result set 9: a commission marked paid while still attached to a Prepared
-- payout. Batch finalisation must update the header and all rows atomically.
SELECT payout.Id AS PayoutId, payout.PayoutNumber, item.SalesCommissionId,
       commission.Status, commission.PaidAt
FROM dbo.CommissionPayouts AS payout
INNER JOIN dbo.CommissionPayoutItems AS item ON item.CommissionPayoutId = payout.Id
INNER JOIN dbo.SalesCommissions AS commission ON commission.Id = item.SalesCommissionId
WHERE payout.Status = N'Prepared'
  AND item.ReleasedAt IS NULL
  AND commission.Status = N'Paid';
