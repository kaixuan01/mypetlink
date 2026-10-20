-- Independent QA synthetic seed. Disposable database MyPetLinkQA_Final_E2E only.
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() <> N'MyPetLinkQA_Final_E2E' THROW 50000, 'Wrong database', 1;
BEGIN TRAN;
DECLARE @now datetimeoffset = SYSDATETIMEOFFSET();
DECLARE @admin uniqueidentifier = (SELECT TOP 1 a.Id FROM AdminUsers a JOIN Users u ON u.Id = a.UserId WHERE u.Email = N'qa.op-a@mypetlink.local');
IF @admin IS NULL THROW 50001, 'Dev admin missing - log in once first', 1;

-- QA roles (custom, non-system)
DECLARE @viewer uniqueidentifier = 'A0A0A0A0-0000-4000-8000-0000000000A1';
DECLARE @full uniqueidentifier = 'A0A0A0A0-0000-4000-8000-0000000000A2';
INSERT AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt) VALUES
 (@viewer, N'qa-consignment-viewer', N'QA consignment viewer', N'Synthetic QA role', 0, 0, 900, @now, @now),
 (@full, N'qa-consignment-full', N'QA consignment full', N'Synthetic QA role', 0, 0, 901, @now, @now);
INSERT AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt) VALUES (NEWID(), @viewer, N'consignment.view', @now);
INSERT AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
SELECT NEWID(), @full, v.c, @now FROM (VALUES (N'consignment.view'),(N'consignment.agreements.manage'),(N'consignment.allocate'),
 (N'consignment.dispatch'),(N'consignment.reconcile'),(N'consignment.return'),(N'consignment.release'),(N'consignment.manifest.export'),
 (N'sales.view'),(N'catalog.view'),(N'inventory.qa.manage'),(N'inventory.view'),(N'consignment.agreements.approve'),(N'consignment.write_off')) v(c);

-- Synthetic catalogue item (QR + NFC, Standard)
DECLARE @product uniqueidentifier = 'B0B0B0B0-0000-4000-8000-0000000000B1';
DECLARE @variant uniqueidentifier = 'B0B0B0B0-0000-4000-8000-0000000000B2';
INSERT TagProducts (Id, Name, Slug, IsPublished, IsArchived, SortOrder, CreatedAt, UpdatedAt)
 VALUES (@product, N'QA Synthetic Smart Tag', N'qa-synthetic-smart-tag', 1, 0, 99, @now, @now);
INSERT TagProductVariants (Id, TagProductId, PublicKey, Sku, DisplayName, SupportsQr, SupportsNfc, TagVariant, BasePrice, Currency, IsActive, IsPurchasable, SortOrder, CreatedAt, UpdatedAt)
 VALUES (@variant, @product, N'qa-syn-std', N'QA-SYN-STD', N'Standard', 1, 1, N'Standard', 39.90, N'MYR', 1, 1, 1, @now, @now);

DECLARE @receipt uniqueidentifier = NEWID();
INSERT InventoryReceipts (Id, ReceiptNumber, TagProductVariantId, QuantityReceived, ReceivedAt, PurchaseCurrency, ExchangeRateToMyr, CostMode,
 GoodsCost, FreightCost, CustomsTaxCost, OtherLandedCost, TotalLandedCostMyr, UnitLandedCostMyr, CreatedByAdminUserId, CreatedAt, UpdatedAt)
 VALUES (@receipt, N'QA-SYN-RCPT-0001', @variant, 106, @now, N'MYR', 1, N'Simple', 318, 0, 0, 0, 318, 3, @admin, @now, @now);

-- 104 Passed + 2 Pending synthetic tags (codes are synthetic, not production stock)
;WITH n AS (SELECT TOP 106 ROW_NUMBER() OVER (ORDER BY (SELECT 1)) i FROM sys.all_objects)
INSERT SmartTags (Id, TagCode, HasNfc, Variant, Status, CreatedAt, UpdatedAt, FulfilmentStatus, ProductVariantId, InventoryReceiptId,
 QaStatus, QaVersion, StockPurpose, QaInspectedAt, QaPhysicalCondition)
SELECT NEWID(), CONCAT(N'QASYN', RIGHT(CONCAT('0000', i), 4)), 1, N'Standard', N'Unclaimed', @now, @now, N'Printed', @variant, @receipt,
 CASE WHEN i <= 104 THEN N'Passed' ELSE N'Pending' END, 1, N'Sale', CASE WHEN i <= 104 THEN @now END,
 CASE WHEN i <= 104 THEN N'Good' ELSE N'Unchecked' END
FROM n;

-- Synthetic merchant
INSERT Merchants (Id, MerchantCode, LegalBusinessName, TradingName, ContactPerson, ContactEmail, ContactPhone, BillingAddressLine1, BillingPostcode, BillingCity,
 BillingState, BillingCountry, DeliveryAddressSameAsBilling, DeliveryAddressLine1, DeliveryPostcode, DeliveryCity, DeliveryState, DeliveryCountry,
 PaymentTerm, IsActive, CreatedAt, UpdatedAt)
VALUES ('C0C0C0C0-0000-4000-8000-0000000000C1', N'QA-SYN-SHOP', N'QA Synthetic Pet Shop Sdn Bhd (TEST)', N'QA Synthetic Pet Shop', N'QA Contact', N'qa.shop@example.invalid',
 N'+60100000000', N'1 Synthetic Street', N'50000', N'Kuala Lumpur', N'Kuala Lumpur', N'Malaysia', 1, N'1 Synthetic Street', N'50000', N'Kuala Lumpur',
 N'Kuala Lumpur', N'Malaysia', N'Prepaid', 1, @now, @now);

UPDATE BusinessIdentitySettings SET LegalBusinessName = N'QA Synthetic Seller (TEST)', BrandName = N'MyPetLink', BusinessRegistrationNumber = N'TEST-REG-0000',
 RegisteredAddressLine1 = N'1 Test Road', RegisteredPostcode = N'50000', RegisteredCity = N'Kuala Lumpur', RegisteredState = N'Kuala Lumpur',
 RegisteredCountry = N'Malaysia', SupportEmail = N'qa.seller@example.invalid', UpdatedAt = @now;
COMMIT;
SELECT (SELECT COUNT(*) FROM SmartTags) AS Tags, (SELECT COUNT(*) FROM Merchants) AS Merchants;
INSERT MerchantBranches (Id, MerchantId, Name, AddressLine1, City, State, Postcode, Country, IsActive, ShowOnWebsite, DisplayOrder, CreatedAt, UpdatedAt)
VALUES ('D0D0D0D0-0000-4000-8000-0000000000D1','C0C0C0C0-0000-4000-8000-0000000000C1',N'QA Synthetic Main Branch',N'1 Synthetic Street',N'Kuala Lumpur',N'Kuala Lumpur',N'50000',N'Malaysia',1,0,1,SYSDATETIMEOFFSET(),SYSDATETIMEOFFSET());
SELECT COUNT(*) AS Branches FROM MerchantBranches;
