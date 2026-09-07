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
        Assert.Equal(6m, report.KnownCostOfGoods);
        Assert.Equal(1, report.UncostedUnits);
        Assert.False(report.IsCostOfGoodsComplete);
        Assert.Null(report.GrossProfit);
        Assert.Null(report.ContributionProfit);
        Assert.Contains(report.Orders, row => row.OrderNumber == "ORD-COSTED" && row.GrossProfit == 12m);
        Assert.Contains(report.Orders, row => row.OrderNumber == "ORD-UNCOSTED" && row.GrossProfit is null);
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
        Assert.Null(report.GrossProfit);
        Assert.Equal("ORD-LEGACY", Assert.Single(report.Orders).OrderNumber);
    }

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
