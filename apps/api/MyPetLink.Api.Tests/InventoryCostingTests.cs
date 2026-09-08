using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class InventoryCostingTests
{
    private static readonly Guid AdminUserId = Guid.Parse("891edeb1-4939-4d21-a8d1-196d5da13e21");
    private static readonly Guid AdminId = Guid.Parse("1c2bca92-4471-4d08-9a43-c8c9d7d142d4");
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-07T04:00:00Z");

    [Fact]
    public async Task Receipt_PartialBatch_AssociatesOnlyRequestedSerializedTags()
    {
        await using var db = NewDb();
        var seeded = await SeedInventoryAsync(db, 3);
        var service = ReceiptService(db);

        var result = await service.CreateAsync(AdminUserId, new CreateInventoryReceiptRequest(
            seeded.Variant.Id, seeded.Batch.Id, 2, Now, "Tag Maker", "SUP-10", null,
            "MYR", 1m, InventoryReceiptCostMode.Simple, 3.04m,
            null, null, null, null, null, null));

        Assert.Equal(2, result.QuantityReceived);
        Assert.Equal(6.08m, result.TotalLandedCostMyr);
        Assert.Equal(3.04m, result.UnitLandedCostMyr);
        Assert.Equal(2, await db.SmartTags.CountAsync(tag => tag.InventoryReceiptId == result.Id));
        Assert.Equal(1, await db.SmartTags.CountAsync(tag => tag.InventoryReceiptId == null));
    }

    [Fact]
    public async Task Receipt_DetailedCost_PreservesHighPrecisionDerivedUnitCost()
    {
        await using var db = NewDb();
        var seeded = await SeedInventoryAsync(db, 1000);

        var result = await ReceiptService(db).CreateAsync(AdminUserId,
            new CreateInventoryReceiptRequest(
                seeded.Variant.Id, seeded.Batch.Id, 1000, Now, null, null, null,
                "MYR", 1m, InventoryReceiptCostMode.Detailed, null,
                2500m, 100m, 80m, 38m, null, null));

        Assert.Equal(2718m, result.TotalLandedCostMyr);
        Assert.Equal(2.718m, result.UnitLandedCostMyr);
    }

    [Fact]
    public async Task RetailSnapshot_UsesExactPerTagReceipts_AndNeverReprices()
    {
        await using var db = NewDb();
        var product = Product();
        var variant = Variant(product);
        var receiptA = Receipt(variant, "STK-A", 3.04m);
        var receiptB = Receipt(variant, "STK-B", 2.72m);
        var order = RetailOrder(3, variant);
        var tags = new[]
        {
            RetailTag("MPL-COST-0001", order, order.Items.Single(), variant, receiptA),
            RetailTag("MPL-COST-0002", order, order.Items.Single(), variant, receiptA),
            RetailTag("MPL-COST-0003", order, order.Items.Single(), variant, receiptB),
        };
        db.AddRange(product, receiptA, receiptB, order);
        db.SmartTags.AddRange(tags);
        await db.SaveChangesAsync();

        var costing = new InventoryCostingService(db);
        await costing.SnapshotRetailShipmentAsync(order, tags, Now);
        await db.SaveChangesAsync();

        var item = order.Items.Single();
        Assert.Equal(8.80m, item.CostOfGoodsSnapshot);
        Assert.Equal(InventoryCostBasis.SpecificIdentification, item.CostBasis);
        Assert.Equal(new[] { 2.72m, 3.04m, 3.04m },
            await db.TagOrderItemCostAllocations
                .OrderBy(row => row.UnitLandedCostMyrSnapshot)
                .Select(row => row.UnitLandedCostMyrSnapshot!.Value).ToArrayAsync());

        var laterCheaperReceipt = Receipt(variant, "STK-C", 1m);
        var replacement = RetailTag(
            "MPL-COST-0004", order, item, variant, laterCheaperReceipt);
        db.AddRange(laterCheaperReceipt, replacement);
        await db.SaveChangesAsync();
        await costing.SnapshotRetailShipmentAsync(order, [replacement], Now.AddDays(10));
        await db.SaveChangesAsync();

        Assert.Equal(8.80m, item.CostOfGoodsSnapshot);
        Assert.Equal(3, await db.TagOrderItemCostAllocations.CountAsync());
    }

    [Fact]
    public async Task RetailSnapshot_LegacyUncostedTag_IsUnavailableNotZero()
    {
        await using var db = NewDb();
        var product = Product();
        var variant = Variant(product);
        var order = RetailOrder(1, variant);
        var tag = RetailTag("MPL-LEGACY-01", order, order.Items.Single(), variant, null);
        db.AddRange(product, order, tag);
        await db.SaveChangesAsync();

        await new InventoryCostingService(db).SnapshotRetailShipmentAsync(order, [tag], Now);
        await db.SaveChangesAsync();

        Assert.Null(order.Items.Single().CostOfGoodsSnapshot);
        Assert.Equal(InventoryCostBasis.Unavailable, order.Items.Single().CostBasis);
        var allocation = Assert.Single(await db.TagOrderItemCostAllocations.ToListAsync());
        Assert.Null(allocation.UnitLandedCostMyrSnapshot);
    }

    [Fact]
    public async Task AssignmentChangeBeforeShipment_AndReplacementAfterShipment_PreserveCorrectCogsTiming()
    {
        await using var db = NewDb();
        var adminUser = new User
        {
            Id = AdminUserId, Email = "admin@example.com", NormalizedEmail = "ADMIN@EXAMPLE.COM",
            DisplayName = "Admin", AdminUser = new AdminUser { Id = AdminId, UserId = AdminUserId },
        };
        var owner = new User
        {
            Email = "owner@example.com", NormalizedEmail = "OWNER@EXAMPLE.COM", DisplayName = "Owner",
        };
        var pet = new Pet
        {
            OwnerUser = owner, Name = "Milo", Slug = "milo-cost", Species = "Dog",
            LifecycleStatus = PetLifecycleStatus.Active,
        };
        var product = Product();
        var variant = Variant(product);
        var originalReceipt = Receipt(variant, "STK-OLD", 4m);
        var assignedReceipt = Receipt(variant, "STK-ASSIGNED", 3m);
        var replacementReceipt = Receipt(variant, "STK-REPLACEMENT", 2m);
        var order = RetailOrder(1, variant, "ORD-TIMING", 10m);
        order.OwnerUser = owner;
        order.Pet = pet;
        order.OwnerUserId = owner.Id;
        order.PetId = pet.Id;
        order.PaymentStatus = PaymentStatus.Confirmed;
        order.Status = OrderStatus.PreparingTag;
        order.Items.Single().Pet = pet;
        order.Items.Single().PetId = pet.Id;
        var original = RetailTag("MPL-TIMING-OLD", order, order.Items.Single(), variant, originalReceipt);
        var reassigned = new SmartTag
        {
            TagCode = "MPL-TIMING-NEW", ProductVariant = variant,
            InventoryReceipt = assignedReceipt, HasNfc = true, Variant = "Standard",
        };
        var replacement = new SmartTag
        {
            TagCode = "MPL-TIMING-REP", ProductVariant = variant,
            InventoryReceipt = replacementReceipt, HasNfc = true, Variant = "Standard",
        };
        order.SmartTag = original;
        order.AssignedTags.Add(original);
        order.Items.Single().AssignedTags.Add(original);
        db.AddRange(adminUser, owner, pet, product, originalReceipt, assignedReceipt,
            replacementReceipt, order, original, reassigned, replacement);
        await db.SaveChangesAsync();

        var audit = new AuditLogService(db, new HttpContextAccessor());
        var admin = new AdminService(
            db, audit, Options.Create(new FeatureOptions()),
            new EmailOutboxService(
                db, audit, new FixedTimeProvider(Now),
                new EmailTemplateGate(db, Options.Create(new EmailOptions()))),
            new BusinessReferenceGenerator(new SequenceBusinessReferenceSuffixSource(1234)),
            new FixedTimeProvider(Now));
        await admin.ChangeAssignedTagAsync(
            AdminUserId, order.Id, reassigned.Id, "Use the received unit", original.Id);

        Assert.Null(order.Items.Single().CostSnapshotAt);
        Assert.Empty(await db.TagOrderItemCostAllocations.ToListAsync());

        await new InventoryCostingService(db).SnapshotRetailShipmentAsync(order, [reassigned], Now);
        order.Status = OrderStatus.Shipped;
        order.ShippedAt = Now;
        reassigned.Status = SmartTagStatus.Delivered;
        await db.SaveChangesAsync();
        Assert.Equal(3m, order.Items.Single().CostOfGoodsSnapshot);

        await admin.ReplaceTagAsync(
            AdminUserId, order.Id, replacement.Id, "Damaged", null, reassigned.Id);

        Assert.Equal(3m, order.Items.Single().CostOfGoodsSnapshot);
        Assert.Equal(Now, order.Items.Single().CostSnapshotAt);
        Assert.Single(await db.TagOrderItemCostAllocations.ToListAsync());
    }

    [Fact]
    public async Task MerchantSnapshot_StoresPerAllocationReceiptProvenance()
    {
        await using var db = NewDb();
        var product = Product();
        var variant = Variant(product);
        var receiptA = Receipt(variant, "STK-MERCHANT-A", 3.04m);
        var receiptB = Receipt(variant, "STK-MERCHANT-B", 2.72m);
        var order = new MerchantOrder
        {
            MerchantOrderNumber = "MO-COST", Currency = "MYR",
            FulfilmentStatus = MerchantOrderFulfilmentStatus.ReadyToShip,
        };
        var item = new MerchantOrderItem
        {
            MerchantOrder = order, ProductId = product.Id, ProductVariantId = variant.Id,
            ProductNameSnapshot = product.Name, SkuCodeSnapshot = variant.Sku,
            OptionNameSnapshot = variant.DisplayName, Quantity = 3,
            WholesaleUnitPrice = 10m, LineSubtotal = 30m,
        };
        order.Items.Add(item);
        var tags = new[]
        {
            new SmartTag { TagCode = "MPL-MERCHANT-1", ProductVariant = variant, InventoryReceipt = receiptA },
            new SmartTag { TagCode = "MPL-MERCHANT-2", ProductVariant = variant, InventoryReceipt = receiptA },
            new SmartTag { TagCode = "MPL-MERCHANT-3", ProductVariant = variant, InventoryReceipt = receiptB },
        };
        var allocations = tags.Select(tag => new MerchantOrderAllocatedTag
        {
            MerchantOrder = order, MerchantOrderItem = item, SmartTag = tag,
            TagCodeSnapshot = tag.TagCode, ProductVariantId = variant.Id, AllocatedAt = Now,
        }).ToArray();
        db.AddRange(product, receiptA, receiptB, order);
        db.SmartTags.AddRange(tags);
        db.MerchantOrderAllocatedTags.AddRange(allocations);
        await db.SaveChangesAsync();

        await new InventoryCostingService(db).SnapshotMerchantShipmentAsync(
            order, allocations, Now);
        await db.SaveChangesAsync();

        Assert.Equal(8.80m, item.CostOfGoodsSnapshot);
        Assert.All(allocations, allocation =>
            Assert.Equal(InventoryCostBasis.SpecificIdentification, allocation.CostBasis));
        Assert.Equal(new[] { "STK-MERCHANT-A", "STK-MERCHANT-A", "STK-MERCHANT-B" },
            allocations.Select(allocation => allocation.InventoryReceiptNumberSnapshot).ToArray());
    }

    // The costed portion must still produce a real, reconciling figure even
    // though an uncosted order shares the same period.
    [Fact]
    public async Task Profitability_ReconcilesStoredCogs_AndWithholdsIncompleteProfit()
    {
        await using var db = NewDb();
        var product = Product();
        var variant = Variant(product);
        var costed = RetailOrder(2, variant, "ORD-COSTED", 20m, 2m);
        var uncosted = RetailOrder(1, variant, "ORD-UNCOSTED", 10m, 0m);
        costed.ActualCourierCost = 4m;
        uncosted.ActualCourierCost = 2m;
        var receipt = Receipt(variant, "STK-REPORT", 3m);
        var costedTags = new[]
        {
            RetailTag("MPL-REPORT-1", costed, costed.Items.Single(), variant, receipt),
            RetailTag("MPL-REPORT-2", costed, costed.Items.Single(), variant, receipt),
        };
        var uncostedTag = RetailTag("MPL-REPORT-3", uncosted, uncosted.Items.Single(), variant, null);
        db.AddRange(product, receipt, costed, uncosted);
        db.SmartTags.AddRange(costedTags);
        db.SmartTags.Add(uncostedTag);
        await db.SaveChangesAsync();
        var costing = new InventoryCostingService(db);
        await costing.SnapshotRetailShipmentAsync(costed, costedTags, Now);
        await costing.SnapshotRetailShipmentAsync(uncosted, [uncostedTag], Now.AddHours(1));
        await db.SaveChangesAsync();

        var report = await ReceiptService(db).GetProfitabilityAsync(
            new ProfitabilityReportQuery(Now.AddDays(-1), Now.AddDays(1)));

        Assert.Equal(30m, report.ProductRevenue);
        Assert.Equal(2m, report.Discounts);
        Assert.Equal(28m, report.NetProductRevenue);
        Assert.Equal(1, report.UncostedUnits);
        Assert.False(report.IsCostOfGoodsComplete);

        // The costed order still reports a complete, usable result.
        Assert.Equal(18m, report.CostedNetRevenue);
        Assert.Equal(2, report.CostedUnits);
        Assert.Equal(6m, report.CostedCostOfGoods);
        Assert.Equal(12m, report.CostedGrossProfit);
        Assert.Equal(66.67m, report.CostedGrossMarginPercentage);
        // Contribution covers the costed order only: 12 - 4 courier - 0 commission.
        Assert.Equal(8m, report.ContributionProfit);
        Assert.Equal(4m, report.CostedCourierCost);

        // The uncosted order contributes revenue and nothing else. No estimate.
        Assert.Equal(10m, report.UncostedNetRevenue);
        Assert.Equal(28m, report.CostedNetRevenue + report.UncostedNetRevenue);

        Assert.Contains(report.Orders, row =>
            row.OrderNumber == "ORD-COSTED" && row.GrossProfit == 12m && row.IsFullyCosted);
        Assert.Contains(report.Orders, row =>
            row.OrderNumber == "ORD-UNCOSTED" && row.GrossProfit is null && !row.IsFullyCosted);
        Assert.Contains(report.ExcludedCosts, note => note.Contains("no recorded stock cost"));
    }

    [Fact]
    public async Task Profitability_SubtractsOnlyNonReversedCommissionForEachRetailOrder()
    {
        await using var db = NewDb();
        var product = Product();
        var variant = Variant(product);
        var order = RetailOrder(2, variant, "ORD-RETAIL-COMMISSION", 20m, 2m);
        order.ActualCourierCost = 4m;
        var receipt = Receipt(variant, "STK-COMMISSION", 3m);
        var tags = new[]
        {
            RetailTag("MPL-COMMISSION-1", order, order.Items.Single(), variant, receipt),
            RetailTag("MPL-COMMISSION-2", order, order.Items.Single(), variant, receipt),
        };
        var salesperson = new Salesperson
        {
            SalespersonCode = "SP-PROFIT",
            Name = "Profit Seller"
        };
        db.AddRange(product, receipt, order, salesperson);
        db.SmartTags.AddRange(tags);
        await db.SaveChangesAsync();
        await new InventoryCostingService(db).SnapshotRetailShipmentAsync(order, tags, Now);
        db.SalesCommissions.AddRange(
            new SalesCommission
            {
                SourceType = SalesCommissionSourceType.TagOrder,
                CommissionType = SalesCommissionType.DirectRetailPercentage,
                TagOrderId = order.Id,
                SalespersonId = salesperson.Id,
                SalespersonCodeSnapshot = salesperson.SalespersonCode,
                SalespersonNameSnapshot = salesperson.Name,
                CommissionPercentageSnapshot = 15m,
                CommissionBaseAmount = 18m,
                CommissionAmount = 2.70m,
                Status = SalesCommissionStatus.Payable,
                CalculatedAt = Now
            },
            new SalesCommission
            {
                SourceType = SalesCommissionSourceType.TagOrder,
                CommissionType = SalesCommissionType.ResellerRepeatPercentage,
                TagOrderId = order.Id,
                SalespersonId = salesperson.Id,
                SalespersonCodeSnapshot = salesperson.SalespersonCode,
                SalespersonNameSnapshot = salesperson.Name,
                CommissionPercentageSnapshot = 3m,
                CommissionBaseAmount = 18m,
                CommissionAmount = 0.54m,
                Status = SalesCommissionStatus.Reversed,
                CalculatedAt = Now,
                ReversedAt = Now,
                ReversalReason = "Not eligible"
            });
        await db.SaveChangesAsync();

        var report = await ReceiptService(db).GetProfitabilityAsync(
            new ProfitabilityReportQuery(Now.AddDays(-1), Now.AddDays(1)));

        Assert.Equal(2.70m, report.RecordedSalesCommission);
        Assert.Equal(2.70m, report.CostedSalesCommission);
        Assert.Equal(5.30m, report.ContributionProfit); // 18 - 6 COGS - 4 courier - 2.70.
    }

    [Theory]
    [InlineData(SalesCommissionType.MerchantOrderPercentage)]
    [InlineData(SalesCommissionType.ResellerAcquisitionBonus)]
    [InlineData(SalesCommissionType.ResellerRepeatPercentage)]
    public async Task Profitability_UsesEveryActualMerchantCommissionLedgerType(
        SalesCommissionType commissionType)
    {
        await using var db = NewDb();
        var harness = SeedMerchantOrder(db, [3m, 3m]);
        harness.Order.InternalCourierCost = 2m;
        var salesperson = new Salesperson
        {
            SalespersonCode = $"SP-PROFIT-{(int)commissionType}",
            Name = "Merchant Profit Seller",
        };
        db.Salespersons.Add(salesperson);
        await db.SaveChangesAsync();
        await new InventoryCostingService(db).SnapshotMerchantShipmentAsync(
            harness.Order, harness.Allocations, Now);
        db.SalesCommissions.AddRange(
            new SalesCommission
            {
                SourceType = SalesCommissionSourceType.MerchantOrder,
                CommissionType = commissionType,
                MerchantId = harness.Order.MerchantId,
                MerchantOrderId = harness.Order.Id,
                SalespersonId = salesperson.Id,
                SalespersonCodeSnapshot = salesperson.SalespersonCode,
                SalespersonNameSnapshot = salesperson.Name,
                CommissionPercentageSnapshot = commissionType ==
                    SalesCommissionType.ResellerAcquisitionBonus ? null : 25m,
                CommissionFixedAmountSnapshot = commissionType ==
                    SalesCommissionType.ResellerAcquisitionBonus ? 5m : null,
                CommissionBaseAmount = 20m,
                CommissionAmount = 5m,
                Status = SalesCommissionStatus.Payable,
                CalculatedAt = Now,
            },
            new SalesCommission
            {
                SourceType = SalesCommissionSourceType.MerchantOrder,
                CommissionType = commissionType == SalesCommissionType.ResellerRepeatPercentage
                    ? SalesCommissionType.ResellerAcquisitionBonus
                    : SalesCommissionType.ResellerRepeatPercentage,
                MerchantId = harness.Order.MerchantId,
                MerchantOrderId = harness.Order.Id,
                SalespersonId = salesperson.Id,
                SalespersonCodeSnapshot = salesperson.SalespersonCode,
                SalespersonNameSnapshot = salesperson.Name,
                CommissionPercentageSnapshot = 99m,
                CommissionBaseAmount = 20m,
                CommissionAmount = 19.80m,
                Status = SalesCommissionStatus.Reversed,
                CalculatedAt = Now,
                ReversedAt = Now,
                ReversalReason = "Invalid payment",
            });
        await db.SaveChangesAsync();

        var report = await ReceiptService(db).GetProfitabilityAsync(
            new ProfitabilityReportQuery(Now.AddDays(-1), Now.AddDays(1)));

        Assert.Equal(5m, report.RecordedSalesCommission);
        Assert.Equal(5m, report.CostedSalesCommission);
        Assert.Equal(7m, report.ContributionProfit); // 20 - 6 COGS - 2 courier - 5 commission.
    }

    [Fact]
    public async Task Profitability_IncludesLegacyShippedOrderAsUncosted()
    {
        await using var db = NewDb();
        db.TagOrders.Add(new TagOrder
        {
            OrderNumber = "ORD-LEGACY", Amount = 19.90m, TotalAmount = 24.90m,
            DeliveryFee = 5m, Currency = "MYR", Status = OrderStatus.Shipped,
            ShippedAt = Now, ActualCourierCost = 4m,
        });
        await db.SaveChangesAsync();

        var report = await ReceiptService(db).GetProfitabilityAsync(
            new ProfitabilityReportQuery(Now.AddHours(-1), Now.AddHours(1)));

        Assert.Equal(19.90m, report.NetProductRevenue);
        Assert.Equal(1, report.UnitsSold);
        Assert.Equal(1, report.UncostedUnits);
        Assert.Equal(19.90m, report.UncostedNetRevenue);
        // Legacy stock is uncosted, never RM0: no cost and no margin is claimed.
        Assert.Equal(0m, report.CostedNetRevenue);
        Assert.Equal(0m, report.CostedCostOfGoods);
        Assert.Null(report.CostedGrossMarginPercentage);
        Assert.Equal("ORD-LEGACY", Assert.Single(report.Orders).OrderNumber);
    }

    // --- Correction guards -------------------------------------------------
    // A correction hands its units to the replacement receipt. Correcting the
    // same receipt a second time would leave a receipt claiming stock it does
    // not own, so the original is stamped superseded and refuses further edits.
    [Fact]
    public async Task Correction_SupersedesTheOriginal_AndMovesEveryUnitToTheReplacement()
    {
        await using var db = NewDb();
        var seeded = await SeedInventoryAsync(db, 2);

        var original = await ReceiptServiceAt(db, Now).CreateAsync(
            AdminUserId, ReceiptRequest(seeded, 2, 3.04m));
        var token = await StampRowVersionAsync(db, original.Id);
        var correction = await ReceiptServiceAt(db, Now.AddMinutes(1)).CreateAsync(
            AdminUserId,
            ReceiptRequest(seeded, 2, 2.72m) with
            {
                CorrectsReceiptId = original.Id,
                CorrectionReason = "Freight invoice restated",
                CorrectsReceiptRowVersion = token,
            });

        Assert.Equal(2, await db.SmartTags.CountAsync(tag => tag.InventoryReceiptId == correction.Id));
        Assert.Equal(0, await db.SmartTags.CountAsync(tag => tag.InventoryReceiptId == original.Id));

        var stored = await db.InventoryReceipts.SingleAsync(row => row.Id == original.Id);
        Assert.NotNull(stored.SupersededAt);
        Assert.Equal(correction.Id, stored.SupersededByReceiptId);
        // The original keeps its own figures for audit; it is not rewritten.
        Assert.Equal(3.04m, stored.UnitLandedCostMyr);
        Assert.Contains(
            await db.AuditLogs.ToListAsync(),
            row => row.Action == "inventory-receipt.superseded" && row.EntityId == original.Id);
    }

    [Fact]
    public async Task Correction_OfAnAlreadyCorrectedReceipt_IsRejected_AndLeavesQuantitiesIntact()
    {
        await using var db = NewDb();
        var seeded = await SeedInventoryAsync(db, 2);

        var original = await ReceiptServiceAt(db, Now).CreateAsync(
            AdminUserId, ReceiptRequest(seeded, 2, 3.04m));
        var token = await StampRowVersionAsync(db, original.Id);
        await ReceiptServiceAt(db, Now.AddMinutes(1)).CreateAsync(
            AdminUserId,
            ReceiptRequest(seeded, 2, 2.72m) with
            {
                CorrectsReceiptId = original.Id,
                CorrectionReason = "Freight invoice restated",
                CorrectsReceiptRowVersion = token,
            });

        var refused = await Assert.ThrowsAsync<ApiException>(() =>
            ReceiptServiceAt(db, Now.AddMinutes(2)).CreateAsync(
                AdminUserId,
                ReceiptRequest(seeded, 2, 9.99m) with
                {
                    CorrectsReceiptId = original.Id,
                    CorrectionReason = "Again",
                    CorrectsReceiptRowVersion = token,
                }));

        Assert.Equal("receipt_already_superseded", refused.Code);
        // Two receipts for two physical tags. Recorded quantity never inflates.
        Assert.Equal(2, await db.InventoryReceipts.CountAsync());
        Assert.Equal(2, await db.SmartTags.CountAsync());
        Assert.Equal(
            await db.SmartTags.CountAsync(),
            await db.InventoryReceipts.Where(row => row.SupersededAt == null)
                .SumAsync(row => row.QuantityReceived));
    }

    [Fact]
    public async Task Correction_WithoutAConcurrencyToken_IsRejected()
    {
        await using var db = NewDb();
        var seeded = await SeedInventoryAsync(db, 1);
        var original = await ReceiptServiceAt(db, Now).CreateAsync(
            AdminUserId, ReceiptRequest(seeded, 1, 3.04m));

        var refused = await Assert.ThrowsAsync<ApiException>(() =>
            ReceiptServiceAt(db, Now.AddMinutes(1)).CreateAsync(
                AdminUserId,
                ReceiptRequest(seeded, 1, 2.72m) with
                {
                    CorrectsReceiptId = original.Id,
                    CorrectionReason = "No token supplied",
                }));

        Assert.Equal("validation_failed", refused.Code);
        Assert.True(refused.Details!.ContainsKey("correctsReceiptRowVersion"));
        Assert.Null((await db.InventoryReceipts.SingleAsync(row => row.Id == original.Id)).SupersededAt);
    }

    [Fact]
    public async Task SupersededReceipts_AreHiddenFromListings_ButStayQueryableForAudit()
    {
        await using var db = NewDb();
        var seeded = await SeedInventoryAsync(db, 1);
        var original = await ReceiptServiceAt(db, Now).CreateAsync(
            AdminUserId, ReceiptRequest(seeded, 1, 3.04m));
        await ReceiptServiceAt(db, Now.AddMinutes(1)).CreateAsync(
            AdminUserId,
            ReceiptRequest(seeded, 1, 2.72m) with
            {
                CorrectsReceiptId = original.Id,
                CorrectionReason = "Restated",
                CorrectsReceiptRowVersion = await StampRowVersionAsync(db, original.Id),
            });

        var service = ReceiptService(db);
        var active = await service.ListAsync(new InventoryReceiptQuery());
        Assert.Equal(1, active.Total);
        Assert.DoesNotContain(active.Items, row => row.Id == original.Id);

        var withHistory = await service.ListAsync(new InventoryReceiptQuery { IncludeSuperseded = true });
        Assert.Equal(2, withHistory.Total);
        var historical = Assert.Single(withHistory.Items, row => row.Id == original.Id);
        Assert.NotNull(historical.SupersededAt);
        Assert.Equal(3.04m, historical.UnitLandedCostMyr);
    }

    [Fact]
    public async Task Receipt_WithFewerEligibleTagsThanClaimed_IsRejected()
    {
        await using var db = NewDb();
        var seeded = await SeedInventoryAsync(db, 2);

        var refused = await Assert.ThrowsAsync<ApiException>(() =>
            ReceiptService(db).CreateAsync(AdminUserId, ReceiptRequest(seeded, 5, 3.04m)));

        Assert.Equal("receipt_inventory_shortfall", refused.Code);
        Assert.Equal(0, await db.InventoryReceipts.CountAsync());
        Assert.Equal(0, await db.SmartTags.CountAsync(tag => tag.InventoryReceiptId != null));
    }

    // --- Merchant COGS -----------------------------------------------------
    [Fact]
    public async Task MerchantSnapshot_MixedReceiptCosts_SumExactlyAcrossAMultiUnitLine()
    {
        await using var db = NewDb();
        var harness = SeedMerchantOrder(db, [3.04m, 2.72m, 3.04m]);
        await db.SaveChangesAsync();

        await new InventoryCostingService(db).SnapshotMerchantShipmentAsync(
            harness.Order, harness.Allocations, Now);
        await db.SaveChangesAsync();

        Assert.Equal(8.80m, harness.Item.CostOfGoodsSnapshot);
        Assert.Equal(InventoryCostBasis.SpecificIdentification, harness.Item.CostBasis);
    }

    // Releasing an allocation after dispatch is an auditable correction. The
    // COGS frozen at dispatch is history and must survive it, and the report
    // must keep treating those units as costed.
    [Fact]
    public async Task MerchantAllocation_ReleasedAfterDispatch_KeepsFrozenCogsAndStaysCosted()
    {
        await using var db = NewDb();
        var harness = SeedMerchantOrder(db, [3.04m, 2.72m, 3.04m]);
        await db.SaveChangesAsync();
        await new InventoryCostingService(db).SnapshotMerchantShipmentAsync(
            harness.Order, harness.Allocations, Now);
        await db.SaveChangesAsync();

        harness.Allocations[0].ReleasedAt = Now.AddHours(1);
        harness.Allocations[0].ReleasedReason = "Damaged in transit";
        await db.SaveChangesAsync();

        Assert.Equal(8.80m, harness.Item.CostOfGoodsSnapshot);
        var report = await ReceiptService(db).GetProfitabilityAsync(
            new ProfitabilityReportQuery(Now.AddDays(-1), Now.AddDays(1)));
        Assert.Equal(0, report.UncostedUnits);
        Assert.True(report.IsCostOfGoodsComplete);
        Assert.Equal(8.80m, report.CostedCostOfGoods);
    }

    // A line dispatched with fewer costed units than it sold stays uncosted:
    // the missing cost is reported, never estimated.
    [Fact]
    public async Task MerchantLine_WithAPartiallyCostedAllocation_ReportsUncostedAndWithholdsItsCost()
    {
        await using var db = NewDb();
        var harness = SeedMerchantOrder(db, [3.04m, null]);
        await db.SaveChangesAsync();

        await new InventoryCostingService(db).SnapshotMerchantShipmentAsync(
            harness.Order, harness.Allocations, Now);
        await db.SaveChangesAsync();

        Assert.Null(harness.Item.CostOfGoodsSnapshot);
        Assert.Equal(InventoryCostBasis.Unavailable, harness.Item.CostBasis);
        // The uncosted allocation still records that we looked and found none.
        Assert.Equal(
            InventoryCostBasis.Unavailable,
            harness.Allocations[1].CostBasis);
        Assert.NotNull(harness.Allocations[1].CostSnapshotAt);

        var report = await ReceiptService(db).GetProfitabilityAsync(
            new ProfitabilityReportQuery(Now.AddDays(-1), Now.AddDays(1)));
        Assert.Equal(1, report.UncostedUnits);
        Assert.Equal(0m, report.CostedCostOfGoods);
        Assert.Equal(0m, report.CostedNetRevenue);
    }

    // --- Report honesty ----------------------------------------------------
    [Fact]
    public async Task Profitability_ExcludesRefundedOrdersFromRevenue_AndListsThemInstead()
    {
        await using var db = NewDb();
        var product = Product();
        var variant = Variant(product);
        var receipt = Receipt(variant, "STK-REFUND", 3m);
        var refunded = RetailOrder(1, variant, "ORD-REFUNDED", 29.90m);
        refunded.Status = OrderStatus.Shipped;
        refunded.ShippedAt = Now;
        refunded.PaymentStatus = PaymentStatus.Refunded;
        var tag = RetailTag("MPL-REFUND-1", refunded, refunded.Items.Single(), variant, receipt);
        db.AddRange(product, receipt, refunded);
        db.SmartTags.Add(tag);
        await db.SaveChangesAsync();
        await new InventoryCostingService(db).SnapshotRetailShipmentAsync(refunded, [tag], Now);
        await db.SaveChangesAsync();

        var report = await ReceiptService(db).GetProfitabilityAsync(
            new ProfitabilityReportQuery(Now.AddDays(-1), Now.AddDays(1)));

        Assert.Equal(0m, report.NetProductRevenue);
        Assert.Equal(0m, report.CostedNetRevenue);
        Assert.Empty(report.Orders);
        var excluded = Assert.Single(report.ExcludedOrders);
        Assert.Equal("ORD-REFUNDED", excluded.OrderNumber);
        Assert.Equal("Refunded", excluded.Reason);
        Assert.Equal(29.90m, excluded.OriginalSellingAmount);
        Assert.Contains(report.ExcludedCosts, note => note.Contains("refunded or cancelled"));
    }

    // Six-decimal costing is kept in the stored snapshot, but every figure the
    // report presents as money is rounded, so no 2000.000001 can reach a page.
    [Fact]
    public async Task Profitability_KeepsSixDecimalCostInternally_ButRoundsReportedMoney()
    {
        await using var db = NewDb();
        var product = Product();
        var variant = Variant(product);
        var receipt = new InventoryReceipt
        {
            ReceiptNumber = "STK-THIRDS", TagProductVariant = variant, QuantityReceived = 3,
            ReceivedAt = Now, PurchaseCurrency = "MYR", ExchangeRateToMyr = 1m,
            CostMode = InventoryReceiptCostMode.Detailed, TotalLandedCostMyr = 1000m,
            UnitLandedCostMyr = decimal.Round(1000m / 3m, 6, MidpointRounding.AwayFromZero),
            CreatedByAdminUserId = AdminId,
        };
        var order = RetailOrder(3, variant, "ORD-THIRDS", 3000m);
        order.Status = OrderStatus.Shipped;
        order.ShippedAt = Now;
        order.ActualCourierCost = 0m;
        var tags = Enumerable.Range(0, 3)
            .Select(index => RetailTag($"MPL-THIRD-{index}", order, order.Items.Single(), variant, receipt))
            .ToArray();
        db.AddRange(product, receipt, order);
        db.SmartTags.AddRange(tags);
        await db.SaveChangesAsync();
        await new InventoryCostingService(db).SnapshotRetailShipmentAsync(order, tags, Now);
        await db.SaveChangesAsync();

        // Stored provenance keeps the full precision it was costed at.
        Assert.Equal(999.999999m, order.Items.Single().CostOfGoodsSnapshot);

        var report = await ReceiptService(db).GetProfitabilityAsync(
            new ProfitabilityReportQuery(Now.AddDays(-1), Now.AddDays(1)));

        Assert.Equal(1000m, report.CostedCostOfGoods);
        Assert.Equal(2000m, report.CostedGrossProfit);
        Assert.Equal(2000m, Assert.Single(report.Orders).GrossProfit);
        Assert.Equal(2000m, report.ContributionProfit);
    }

    // The InMemory provider does not maintain rowversion values, so tests give
    // the row a token the way the repo's other concurrency tests do. Real
    // token mismatch is proven against SQL Server in the relational suite.
    private static async Task<string> StampRowVersionAsync(MyPetLinkDbContext db, Guid receiptId)
    {
        var receipt = await db.InventoryReceipts.SingleAsync(row => row.Id == receiptId);
        receipt.RowVersion = [7];
        await db.SaveChangesAsync();
        return Convert.ToBase64String(receipt.RowVersion);
    }

    private static CreateInventoryReceiptRequest ReceiptRequest(
        (TagProductVariant Variant, SmartTagBatch Batch) seeded, int quantity, decimal unitCost) =>
        new(seeded.Variant.Id, seeded.Batch.Id, quantity, Now, null, null, null, "MYR", 1m,
            InventoryReceiptCostMode.Simple, unitCost, null, null, null, null, null, null);

    private sealed record MerchantHarness(
        MerchantOrder Order, MerchantOrderItem Item, MerchantOrderAllocatedTag[] Allocations);

    // A merchant order whose units come from the given receipt costs. A null
    // cost seeds an uncosted (legacy) tag.
    private static MerchantHarness SeedMerchantOrder(MyPetLinkDbContext db, decimal?[] unitCosts)
    {
        var product = Product();
        var variant = Variant(product);
        db.TagProducts.Add(product);
        var receipts = unitCosts
            .Select((cost, index) => cost is null
                ? null
                : Receipt(variant, $"STK-M{index}", cost.Value))
            .ToArray();
        db.InventoryReceipts.AddRange(receipts.Where(row => row is not null)!);

        var order = new MerchantOrder
        {
            MerchantOrderNumber = "MO-COST", MerchantId = Guid.NewGuid(),
            ShippedAt = Now, Currency = "MYR",
        };
        var item = new MerchantOrderItem
        {
            MerchantOrder = order, ProductId = product.Id, ProductVariantId = variant.Id,
            Quantity = unitCosts.Length, WholesaleUnitPrice = 10m,
            LineSubtotal = 10m * unitCosts.Length,
        };
        order.Items.Add(item);

        var allocations = receipts.Select((receipt, index) =>
        {
            var tag = new SmartTag
            {
                TagCode = $"MPL-MERCH-{index}", ProductVariant = variant,
                InventoryReceipt = receipt, HasNfc = true, Variant = "Standard",
            };
            db.SmartTags.Add(tag);
            return new MerchantOrderAllocatedTag
            {
                MerchantOrder = order, MerchantOrderItem = item, MerchantId = order.MerchantId,
                SmartTag = tag, TagCodeSnapshot = tag.TagCode, ProductVariantId = variant.Id,
                AllocatedAt = Now, AllocatedByAdminUserId = AdminId,
            };
        }).ToArray();

        db.MerchantOrders.Add(order);
        db.MerchantOrderAllocatedTags.AddRange(allocations);
        return new MerchantHarness(order, item, allocations);
    }

    private static InventoryReceiptService ReceiptServiceAt(
        MyPetLinkDbContext db, DateTimeOffset at) => new(
        db,
        new AuditLogService(db, new HttpContextAccessor()),
        new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()),
        new FixedTimeProvider(at));

    private static MyPetLinkDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options;
        return new MyPetLinkDbContext(options, new FixedTimeProvider(Now));
    }

    private static InventoryReceiptService ReceiptService(MyPetLinkDbContext db) => new(
        db,
        new AuditLogService(db, new HttpContextAccessor()),
        new BusinessReferenceGenerator(new SequenceBusinessReferenceSuffixSource(1234)),
        new FixedTimeProvider(Now));

    private static async Task<(TagProductVariant Variant, SmartTagBatch Batch)> SeedInventoryAsync(
        MyPetLinkDbContext db, int quantity)
    {
        var admin = new User
        {
            Id = AdminUserId, Email = "admin@example.com", NormalizedEmail = "ADMIN@EXAMPLE.COM",
            DisplayName = "Admin", AdminUser = new AdminUser { Id = AdminId, UserId = AdminUserId },
        };
        var product = Product();
        var variant = Variant(product);
        var batch = new SmartTagBatch
        {
            BatchNo = "BAT-COST", Quantity = quantity, HasNfc = true, Variant = "Standard",
            ProductVariantId = variant.Id, ProductVariant = variant, GeneratedAt = Now.AddDays(-2),
        };
        db.Users.Add(admin);
        db.TagProducts.Add(product);
        db.SmartTagBatches.Add(batch);
        for (var index = 0; index < quantity; index++)
            db.SmartTags.Add(new SmartTag
            {
                TagCode = $"MPL-{index:00000000}", ProductVariantId = variant.Id,
                ProductVariant = variant, Batch = batch, HasNfc = true, Variant = "Standard",
            });
        await db.SaveChangesAsync();
        return (variant, batch);
    }

    private static TagProduct Product() => new()
    {
        Name = "QR + NFC Smart Tag", Slug = $"tag-{Guid.NewGuid():N}", IsPublished = true,
    };

    private static TagProductVariant Variant(TagProduct product) => new()
    {
        TagProduct = product, Sku = $"SKU-{Guid.NewGuid():N}", PublicKey = Guid.NewGuid().ToString("N"),
        DisplayName = "Standard", SupportsQr = true, SupportsNfc = true,
        TagVariant = "Standard", BasePrice = 10m, Currency = "MYR", IsActive = true,
    };

    private static InventoryReceipt Receipt(TagProductVariant variant, string number, decimal unitCost) => new()
    {
        ReceiptNumber = number, TagProductVariant = variant, QuantityReceived = 100,
        ReceivedAt = Now, PurchaseCurrency = "MYR", ExchangeRateToMyr = 1m,
        CostMode = InventoryReceiptCostMode.Simple, TotalLandedCostMyr = unitCost * 100,
        UnitLandedCostMyr = unitCost, CreatedByAdminUserId = AdminId,
    };

    private static TagOrder RetailOrder(
        int quantity, TagProductVariant variant, string number = "ORD-COST", decimal gross = 30m,
        decimal discount = 0m)
    {
        var order = new TagOrder
        {
            OrderNumber = number, Amount = gross - discount, TotalAmount = gross - discount,
            Currency = "MYR", Status = OrderStatus.ReadyToShip,
        };
        order.Items.Add(new TagOrderItem
        {
            Order = order, ProductVariant = variant, SkuSnapshot = variant.Sku,
            ProductNameSnapshot = "QR + NFC Smart Tag", VariantNameSnapshot = "Standard",
            Quantity = quantity, UnitBasePrice = gross / quantity, Subtotal = gross,
            DiscountAmount = discount, FinalAmount = gross - discount,
            FinalUnitPrice = (gross - discount) / quantity, Currency = "MYR",
        });
        return order;
    }

    private static SmartTag RetailTag(
        string code, TagOrder order, TagOrderItem item, TagProductVariant variant,
        InventoryReceipt? receipt) => new()
    {
        TagCode = code, Order = order, OrderItem = item, ProductVariant = variant,
        InventoryReceipt = receipt, HasNfc = true, Variant = "Standard",
        Status = SmartTagStatus.Preparing,
    };
}
