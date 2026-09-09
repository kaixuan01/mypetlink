-- MyPetLink inventory receipt correctness diagnostic
-- --------------------------------------------------
-- READ ONLY. Run before the migration rollout. Result sets 1 and 2 must be
-- empty when the inventory receipt schema is already present. Result set 3 is
-- informational and records legacy/un-costed serialized inventory; those rows
-- are intentionally not treated as zero-cost inventory.

SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- A production database that predates the first inventory receipt migration
-- has nothing to diagnose yet. Keep this script safe for that exact rollout
-- starting point without directly compiling references to missing columns.
IF OBJECT_ID(N'dbo.InventoryReceipts', N'U') IS NULL
   OR OBJECT_ID(N'dbo.SmartTags', N'U') IS NULL
   OR COL_LENGTH(N'dbo.InventoryReceipts', N'CorrectsReceiptId') IS NULL
   OR COL_LENGTH(N'dbo.InventoryReceipts', N'QuantityReceived') IS NULL
   OR COL_LENGTH(N'dbo.SmartTags', N'InventoryReceiptId') IS NULL
BEGIN
    SELECT N'Inventory receipt schema is not present; there are no receipt correction rows to inspect before its migration.'
        AS DiagnosticStatus;
    RETURN;
END;

-- AddInventoryReceiptSupersession introduced SupersededAt. If it is not yet
-- present, every existing receipt is active. The predicate is assembled only
-- from trusted schema state and all optional-column SQL remains deferred.
DECLARE @activeReceiptPredicate nvarchar(100) =
    CASE
        WHEN COL_LENGTH(N'dbo.InventoryReceipts', N'SupersededAt') IS NOT NULL
            THEN N'receipt.SupersededAt IS NULL'
        ELSE N'1 = 1'
    END;

DECLARE @diagnosticSql nvarchar(max) = N'
-- Result set 1 (deployment blocker): one receipt was corrected more than once.
SELECT
    original.Id AS CorrectedReceiptId,
    original.ReceiptNumber AS CorrectedReceiptNumber,
    COUNT_BIG(correction.Id) AS CorrectionCount
FROM dbo.InventoryReceipts AS original
INNER JOIN dbo.InventoryReceipts AS correction
    ON correction.CorrectsReceiptId = original.Id
GROUP BY original.Id, original.ReceiptNumber
HAVING COUNT_BIG(correction.Id) > 1;

-- Result set 2 (deployment blocker): an active receipt quantity does not equal
-- the serialized Smart Tags currently linked to it. Superseded receipts are
-- excluded because a valid correction moves their tags to the replacement.
SELECT
    receipt.Id AS InventoryReceiptId,
    receipt.ReceiptNumber,
    receipt.QuantityReceived,
    COUNT_BIG(tag.Id) AS LinkedSmartTagCount
FROM dbo.InventoryReceipts AS receipt
LEFT JOIN dbo.SmartTags AS tag
    ON tag.InventoryReceiptId = receipt.Id
WHERE ' + @activeReceiptPredicate + N'
GROUP BY receipt.Id, receipt.ReceiptNumber, receipt.QuantityReceived
HAVING CONVERT(bigint, receipt.QuantityReceived) <> COUNT_BIG(tag.Id);

-- Result set 3 (informational): legacy or otherwise un-costed serialized tags.
-- This count is not a deployment blocker and must never be interpreted as RM0.
SELECT COUNT_BIG(*) AS LegacyOrUncostedSmartTagCount
FROM dbo.SmartTags
WHERE InventoryReceiptId IS NULL;';

EXEC sys.sp_executesql @diagnosticSql;
