using Microsoft.AspNetCore.Http;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Builds a paid merchant order with real inventory behind it, so the
/// allocation tests exercise the same rows and constraints production does.
/// Every id is fixed, so a failure names the same record every run.
/// </summary>
internal sealed class FixedClock(DateTimeOffset now) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => now;
}

internal static class MerchantFulfilmentFixture
{
    public static readonly DateTimeOffset Now =
        new(2026, 8, 6, 2, 0, 0, TimeSpan.Zero);

    public static readonly Guid AdminAccountId = Guid.Parse("f1000000-0000-0000-0000-000000000001");
    public static readonly Guid AdminRecordId = Guid.Parse("f1000000-0000-0000-0000-000000000002");
    public static readonly Guid OwnerAccountId = Guid.Parse("f1000000-0000-0000-0000-000000000003");
    public static readonly Guid MerchantId = Guid.Parse("f2000000-0000-0000-0000-000000000001");
    public static readonly Guid OtherMerchantId = Guid.Parse("f2000000-0000-0000-0000-000000000002");
    public static readonly Guid ProductId = Guid.Parse("f3000000-0000-0000-0000-000000000001");
    public static readonly Guid QrVariantId = Guid.Parse("f3000000-0000-0000-0000-000000000002");
    public static readonly Guid NfcVariantId = Guid.Parse("f3000000-0000-0000-0000-000000000003");
    public static readonly Guid BatchOneId = Guid.Parse("f4000000-0000-0000-0000-000000000001");
    public static readonly Guid BatchTwoId = Guid.Parse("f4000000-0000-0000-0000-000000000002");
    public static readonly Guid OrderId = Guid.Parse("f5000000-0000-0000-0000-000000000001");
    public static readonly Guid QrItemId = Guid.Parse("f5000000-0000-0000-0000-000000000002");
    public static readonly Guid NfcItemId = Guid.Parse("f5000000-0000-0000-0000-000000000003");
    public static readonly Guid SecondOrderId = Guid.Parse("f5000000-0000-0000-0000-000000000004");
    public static readonly Guid SecondOrderItemId = Guid.Parse("f5000000-0000-0000-0000-000000000005");

    public static MerchantFulfilmentService Service(
        MyPetLinkDbContext db, TimeProvider? clock = null) =>
        new(
            db,
            new AuditLogService(db, new HttpContextAccessor()),
            new DocumentNumberService(db),
            clock ?? new FixedClock(Now));

    /// <summary>
    /// A paid two-line order: 10 QR units and 4 QR+NFC units, with more stock
    /// on hand than the order needs so partial allocation has somewhere to go.
    /// </summary>
    public static async Task SeedAsync(
        MyPetLinkDbContext db,
        int qrStock = 14,
        int nfcStock = 6,
        MerchantOrderPaymentStatus paymentStatus = MerchantOrderPaymentStatus.PaymentConfirmed)
    {
        db.Users.Add(new User
        {
            Id = AdminAccountId,
            Email = "fulfilment.admin@mypetlink.local",
            NormalizedEmail = "FULFILMENT.ADMIN@MYPETLINK.LOCAL",
            DisplayName = "Fulfilment Admin",
            Status = UserStatus.Active,
            CreatedAt = Now,
            UpdatedAt = Now,
        });
        db.Users.Add(new User
        {
            Id = OwnerAccountId,
            Email = "final.owner@example.com",
            NormalizedEmail = "FINAL.OWNER@EXAMPLE.COM",
            DisplayName = "Final Owner",
            Status = UserStatus.Active,
            CreatedAt = Now,
            UpdatedAt = Now,
        });
        db.AdminUsers.Add(new AdminUser
        {
            Id = AdminRecordId,
            UserId = AdminAccountId,
            Role = AdminRole.Admin,
            IsActive = true,
            CreatedAt = Now,
            UpdatedAt = Now,
        });

        foreach (var (id, name) in new[]
        {
            (MerchantId, "Happy Paws Veterinary Group Sdn Bhd"),
            (OtherMerchantId, "Second Merchant Sdn Bhd"),
        })
        {
            db.Merchants.Add(new Merchant
            {
                Id = id,
                MerchantCode = id == MerchantId ? "MPL-MER-00001" : "MPL-MER-00002",
                LegalBusinessName = name,
                ContactPerson = "Aina Rahman",
                ContactEmail = "orders@happypaws.example",
                ContactPhone = "+60123456789",
                BillingAddressLine1 = "88 Jalan Perdana",
                BillingPostcode = "68000",
                BillingCity = "Ampang",
                BillingState = "Selangor",
                BillingCountry = "Malaysia",
                DeliveryAddressSameAsBilling = true,
                DeliveryAddressLine1 = "88 Jalan Perdana",
                DeliveryPostcode = "68000",
                DeliveryCity = "Ampang",
                DeliveryState = "Selangor",
                DeliveryCountry = "Malaysia",
                IsActive = true,
                CreatedAt = Now,
                UpdatedAt = Now,
            });
        }

        db.TagProducts.Add(new TagProduct
        {
            Id = ProductId,
            Name = "Wholesale Smart Tag",
            Slug = "wholesale-smart-tag",
            IsPublished = true,
            CreatedAt = Now,
            UpdatedAt = Now,
        });
        db.TagProductVariants.Add(NewVariant(QrVariantId, "WS-QR-0001", supportsNfc: false));
        db.TagProductVariants.Add(NewVariant(NfcVariantId, "WS-NFC-0001", supportsNfc: true));

        db.SmartTagBatches.Add(NewBatch(BatchOneId, "B-2601", Now.AddDays(-30)));
        db.SmartTagBatches.Add(NewBatch(BatchTwoId, "B-2602", Now.AddDays(-10)));

        // The older batch holds most of the QR stock, so automatic allocation
        // has an unambiguous first choice to prove its ordering.
        for (var index = 0; index < qrStock; index += 1)
        {
            db.SmartTags.Add(NewTag(
                $"TAGQ{index:0000}",
                QrVariantId,
                index < qrStock - 4 ? BatchOneId : BatchTwoId,
                Now.AddDays(-30).AddMinutes(index)));
        }

        for (var index = 0; index < nfcStock; index += 1)
        {
            db.SmartTags.Add(NewTag(
                $"TAGN{index:0000}",
                NfcVariantId,
                index < nfcStock / 2 ? BatchOneId : BatchTwoId,
                Now.AddDays(-30).AddMinutes(index),
                hasNfc: true));
        }

        db.MerchantOrders.Add(NewOrder(OrderId, "MPL-B2B-ORD-260806-0001", MerchantId, paymentStatus));
        db.MerchantOrderItems.Add(NewItem(QrItemId, OrderId, QrVariantId, "WS-QR-0001", 10, 0));
        db.MerchantOrderItems.Add(NewItem(NfcItemId, OrderId, NfcVariantId, "WS-NFC-0001", 4, 1));

        // A competing order for the same SKU, used by the contention tests.
        db.MerchantOrders.Add(NewOrder(
            SecondOrderId, "MPL-B2B-ORD-260806-0002", OtherMerchantId, paymentStatus));
        db.MerchantOrderItems.Add(
            NewItem(SecondOrderItemId, SecondOrderId, QrVariantId, "WS-QR-0001", 10, 0));

        await db.SaveChangesAsync();
    }

    /// <summary>
    /// A real retail order and line, so a "reserved by retail" test exercises
    /// genuine foreign keys rather than an invented id the database rejects.
    /// </summary>
    public static async Task<(Guid OrderId, Guid OrderItemId)> SeedRetailOrderAsync(
        MyPetLinkDbContext db)
    {
        var petId = Guid.NewGuid();
        var retailOrderId = Guid.NewGuid();
        var retailItemId = Guid.NewGuid();

        db.Pets.Add(new Pet
        {
            Id = petId,
            OwnerUserId = OwnerAccountId,
            Slug = "buddy-abc123",
            Name = "Buddy",
            Species = "Dog",
            LifecycleStatus = PetLifecycleStatus.Active,
            CreatedAt = Now,
            UpdatedAt = Now,
        });
        db.TagOrders.Add(new TagOrder
        {
            Id = retailOrderId,
            OrderNumber = "MPL-ORD-260806-9001",
            OwnerUserId = OwnerAccountId,
            PetId = petId,
            TagType = TagType.QrPetTag,
            Variant = "Lightweight",
            Amount = 39.9m,
            Currency = "MYR",
            Status = OrderStatus.PaymentConfirmed,
            PaymentStatus = PaymentStatus.Confirmed,
            PaymentConfirmedAt = Now,
            RecipientName = "Final Owner",
            DeliveryPhoneE164 = "+60123456700",
            AddressLine1 = "1 Jalan Retail",
            Postcode = "50000",
            City = "Kuala Lumpur",
            CreatedAt = Now,
            UpdatedAt = Now,
        });
        db.TagOrderItems.Add(new TagOrderItem
        {
            Id = retailItemId,
            OrderId = retailOrderId,
            PetId = petId,
            ProductVariantId = QrVariantId,
            SkuSnapshot = "WS-QR-0001",
            ProductNameSnapshot = "Wholesale Smart Tag",
            VariantNameSnapshot = "Lightweight",
            SupportsQrSnapshot = true,
            UnitBasePrice = 39.9m,
            Quantity = 1,
            Subtotal = 39.9m,
            FinalUnitPrice = 39.9m,
            FinalAmount = 39.9m,
            Currency = "MYR",
            CreatedAt = Now,
            UpdatedAt = Now,
        });

        await db.SaveChangesAsync();
        return (retailOrderId, retailItemId);
    }

    public static Guid[] TagIds(MyPetLinkDbContext db, Guid variantId, int take) =>
        db.SmartTags
            .Where(tag => tag.ProductVariantId == variantId)
            .OrderBy(tag => tag.TagCode)
            .Select(tag => tag.Id)
            .Take(take)
            .ToArray();

    private static TagProductVariant NewVariant(Guid id, string sku, bool supportsNfc) => new()
    {
        Id = id,
        TagProductId = ProductId,
        PublicKey = sku.ToLowerInvariant(),
        Sku = sku,
        DisplayName = supportsNfc ? "Standard" : "Lightweight",
        TagVariant = supportsNfc ? "Standard" : "Lightweight",
        SupportsQr = true,
        SupportsNfc = supportsNfc,
        BasePrice = 39.9m,
        Currency = "MYR",
        IsActive = true,
        IsPurchasable = true,
        CreatedAt = Now,
        UpdatedAt = Now,
    };

    private static SmartTagBatch NewBatch(Guid id, string batchNo, DateTimeOffset createdAt) => new()
    {
        Id = id,
        BatchNo = batchNo,
        Quantity = 100,
        HasNfc = false,
        Variant = "Standard",
        PrintedAt = createdAt.AddDays(1),
        CreatedAt = createdAt,
        UpdatedAt = createdAt,
    };

    private static SmartTag NewTag(
        string code, Guid variantId, Guid batchId, DateTimeOffset createdAt, bool hasNfc = false) =>
        new()
        {
            Id = Guid.NewGuid(),
            TagCode = code,
            ProductVariantId = variantId,
            BatchId = batchId,
            HasNfc = hasNfc,
            Variant = hasNfc ? "Standard" : "Lightweight",
            Status = SmartTagStatus.Unclaimed,
            FulfilmentStatus = TagFulfilmentStatus.Printed,
            PrintedAt = createdAt,
            CreatedAt = createdAt,
            UpdatedAt = createdAt,
        };

    private static MerchantOrder NewOrder(
        Guid id, string number, Guid merchantId, MerchantOrderPaymentStatus paymentStatus) => new()
        {
            Id = id,
            MerchantOrderNumber = number,
            MerchantId = merchantId,
            MerchantCodeSnapshot = "MPL-MER-00001",
            MerchantLegalNameSnapshot = "Happy Paws Veterinary Group Sdn Bhd",
            ContactPersonSnapshot = "Aina Rahman",
            ContactEmailSnapshot = "orders@happypaws.example",
            ContactPhoneSnapshot = "+60123456789",
            BillingAddressLine1Snapshot = "88 Jalan Perdana",
            BillingPostcodeSnapshot = "68000",
            BillingCitySnapshot = "Ampang",
            BillingStateSnapshot = "Selangor",
            BillingCountrySnapshot = "Malaysia",
            DeliveryAddressLine1Snapshot = "88 Jalan Perdana",
            DeliveryPostcodeSnapshot = "68000",
            DeliveryCitySnapshot = "Ampang",
            DeliveryStateSnapshot = "Selangor",
            DeliveryCountrySnapshot = "Malaysia",
            Currency = "MYR",
            MerchandiseSubtotal = 1000m,
            GrandTotal = 1000m,
            PaymentStatus = paymentStatus,
            PaymentConfirmedAt =
                paymentStatus == MerchantOrderPaymentStatus.PaymentConfirmed ? Now : null,
            CancelledAt = paymentStatus == MerchantOrderPaymentStatus.Cancelled ? Now : null,
            FulfilmentStatus = MerchantOrderFulfilmentStatus.NotStarted,
            CreatedAt = Now,
            UpdatedAt = Now,
        };

    private static MerchantOrderItem NewItem(
        Guid id, Guid orderId, Guid variantId, string sku, int quantity, int sortOrder) => new()
        {
            Id = id,
            MerchantOrderId = orderId,
            ProductId = ProductId,
            ProductVariantId = variantId,
            ProductNameSnapshot = "Wholesale Smart Tag",
            SkuCodeSnapshot = sku,
            OptionNameSnapshot = sku.Contains("NFC") ? "Standard" : "Lightweight",
            SupportsQrSnapshot = true,
            SupportsNfcSnapshot = sku.Contains("NFC"),
            Quantity = quantity,
            WholesaleUnitPrice = 25m,
            LineSubtotal = 25m * quantity,
            SortOrder = sortOrder,
        };
}
