-- MyPetLink legacy QR-only SKU sales correction
-- ------------------------------------------------------------
-- Purpose:
--   Report every legacy TagProductVariants row without NFC support, then make
--   those rows non-purchasable. This preserves the SKU and every related tag,
--   order, invoice, receipt, promotion, media, and inventory record.
--
-- Safety:
--   * Review the first result set before approving the transaction.
--   * Do not run this script against production without the normal operational
--     change review, backup, and rollback preparation.
--   * The script intentionally does not change IsActive or ArchivedAt. Legacy
--     variants must remain visible to admin, inventory, and historical reads.
--   * Idempotent: subsequent runs report the same legacy rows but update zero
--     rows because IsPurchasable is already 0.
-- ------------------------------------------------------------

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.TagProductVariants', N'U') IS NULL
    BEGIN
        THROW 50001, 'dbo.TagProductVariants does not exist in the current database.', 1;
    END;

    -- Result set 1: report all matching legacy rows before any data changes.
    SELECT
        variant.Id,
        variant.TagProductId,
        product.Name AS ProductName,
        variant.Sku,
        variant.DisplayName,
        variant.SupportsQr,
        variant.SupportsNfc,
        variant.IsActive,
        variant.IsPurchasable,
        variant.ArchivedAt,
        variant.CreatedAt,
        variant.UpdatedAt,
        CAST(CASE WHEN variant.IsPurchasable = 1 THEN 1 ELSE 0 END AS bit) AS RequiresCorrection
    FROM dbo.TagProductVariants AS variant WITH (UPDLOCK, HOLDLOCK)
    INNER JOIN dbo.TagProducts AS product ON product.Id = variant.TagProductId
    WHERE variant.SupportsNfc = 0
    ORDER BY product.Name, variant.SortOrder, variant.Sku;

    UPDATE dbo.TagProductVariants
    SET
        IsPurchasable = 0,
        UpdatedAt = SYSDATETIMEOFFSET()
    WHERE SupportsNfc = 0
      AND IsPurchasable = 1;

    DECLARE @CorrectedRows int = @@ROWCOUNT;

    IF EXISTS (
        SELECT 1
        FROM dbo.TagProductVariants
        WHERE SupportsNfc = 0
          AND IsPurchasable = 1
    )
    BEGIN
        THROW 50002, 'Legacy QR-only variants remain purchasable; the transaction was not committed.', 1;
    END;

    -- Result set 2: correction summary and postcondition.
    SELECT
        @CorrectedRows AS CorrectedRows,
        COUNT_BIG(*) AS LegacyQrOnlyVariantRows,
        SUM(CASE WHEN IsPurchasable = 1 THEN CONVERT(bigint, 1) ELSE CONVERT(bigint, 0) END) AS RemainingPurchasableRows
    FROM dbo.TagProductVariants
    WHERE SupportsNfc = 0;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
    BEGIN
        ROLLBACK TRANSACTION;
    END;

    THROW;
END CATCH;
