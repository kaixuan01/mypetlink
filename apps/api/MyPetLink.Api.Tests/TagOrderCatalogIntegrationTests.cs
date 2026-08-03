using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class TagOrderCatalogIntegrationTests
{
    private static readonly Guid OwnerId = Guid.Parse("92222222-2222-2222-2222-222222222222");
    private static readonly Guid OtherOwnerId = Guid.Parse("93333333-3333-3333-3333-333333333333");
    private static readonly Guid AdminId = Guid.Parse("94444444-4444-4444-4444-444444444444");

    [Fact]
    public async Task Create_AssignsMalaysiaTimestampedOrderNumberFromCreatedAt()
    {
        var now = DateTimeOffset.Parse("2026-07-27T16:05:06Z");
        var references = new BusinessReferenceGenerator(
            new SequenceBusinessReferenceSuffixSource(1234));
        await using var harness = await Harness.CreateAsync(
            businessReferences: references,
            timeProvider: new FixedTimeProvider(now));

        var created = await harness.Service.CreateAsync(
            OwnerId,
            Request(harness.Pet.Id, harness.Variant.PublicKey));

        Assert.Equal("MPL-ORD-260728000506-1234", created.Order.OrderNumber);
        Assert.Equal(now, created.Order.CreatedAt);
        Assert.Null(created.Order.ReceiptNumber);
    }

    [Fact]
    public async Task Create_RetriesAnExistingOrderNumberWithAnotherSuffix()
    {
        var now = DateTimeOffset.Parse("2026-07-27T07:08:09Z");
        var references = new BusinessReferenceGenerator(
            new SequenceBusinessReferenceSuffixSource(1111, 2222));
        await using var harness = await Harness.CreateAsync(
            businessReferences: references,
            timeProvider: new FixedTimeProvider(now));
        harness.Db.TagOrders.Add(new TagOrder
        {
            OrderNumber = "MPL-ORD-260727150809-1111",
            OwnerUserId = OtherOwnerId,
            PetId = harness.Pet.Id,
            RecipientName = "Existing",
            DeliveryPhoneE164 = "+60111111111",
            AddressLine1 = "1 Existing",
            Postcode = "50000",
            City = "Kuala Lumpur",
            State = "Kuala Lumpur"
        });
        await harness.Db.SaveChangesAsync();

        var created = await harness.Service.CreateAsync(
            OwnerId,
            Request(harness.Pet.Id, harness.Variant.PublicKey));

        Assert.Equal("MPL-ORD-260727150809-2222", created.Order.OrderNumber);
    }

    [Fact]
    public async Task Create_FailsSafelyWhenOrderReferenceRetriesAreExhausted()
    {
        var now = DateTimeOffset.Parse("2026-07-27T07:08:09Z");
        var references = new BusinessReferenceGenerator(
            new SequenceBusinessReferenceSuffixSource(1111));
        await using var harness = await Harness.CreateAsync(
            businessReferences: references,
            timeProvider: new FixedTimeProvider(now));
        harness.Db.TagOrders.Add(new TagOrder
        {
            OrderNumber = "MPL-ORD-260727150809-1111",
            OwnerUserId = OtherOwnerId,
            PetId = harness.Pet.Id,
            RecipientName = "Existing",
            DeliveryPhoneE164 = "+60111111111",
            AddressLine1 = "1 Existing",
            Postcode = "50000",
            City = "Kuala Lumpur",
            State = "Kuala Lumpur"
        });
        await harness.Db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateAsync(
                OwnerId,
                Request(harness.Pet.Id, harness.Variant.PublicKey)));

        Assert.Equal("order_number_generation_failed", error.Code);
        Assert.Equal(
            0,
            await harness.Db.TagOrders.CountAsync(order => order.OwnerUserId == OwnerId));
    }

    [Fact]
    public async Task Create_UsesServerPriceAndPersistsImmutableCommercialSnapshot()
    {
        await using var harness = await Harness.CreateAsync();

        var created = await harness.Service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey));
        var item = Assert.IsType<TagOrderItemResponse>(created.Order.Item);

        Assert.Equal(49.90m, item.UnitBasePrice);
        Assert.Equal(10m, item.DiscountAmount);
        Assert.Equal(39.90m, item.FinalAmount);
        Assert.Equal("Launch offer", item.PromotionName);
        Assert.Equal(39.90m, created.Order.Amount);
        Assert.Equal(TagType.QrNfcSmartTag, created.Order.TagType);
        // Capabilities are captured from the exact SKU that was sold.
        Assert.True(item.SupportsQr);
        Assert.True(item.SupportsNfc);

        harness.Variant.BasePrice = 79.90m;
        harness.Variant.DisplayName = "Renamed current option";
        harness.Variant.ArchivedAt = DateTimeOffset.UtcNow;
        harness.Product.Name = "Renamed current product";
        // Reconfiguring the SKU's capabilities must not rewrite order history.
        harness.Variant.SupportsNfc = false;
        await harness.Db.SaveChangesAsync();

        var historical = await harness.Service.GetAsync(OwnerId, created.Order.Id.ToString());
        Assert.Equal("MPL-NFC-STANDARD-V1", historical.Item!.Sku);
        Assert.Equal("MyPetLink Smart Tag", historical.Item.ProductName);
        Assert.Equal("Standard NFC", historical.Item.VariantName);
        Assert.Equal(39.90m, historical.Item.FinalAmount);
        Assert.True(historical.Item.SupportsQr);
        Assert.True(historical.Item.SupportsNfc);
    }

    [Fact]
    public async Task Create_SnapshotsQrOnlyCapabilities_WithoutInferringNfc()
    {
        await using var harness = await Harness.CreateAsync();
        harness.Variant.SupportsNfc = false;
        await harness.Db.SaveChangesAsync();

        var created = await harness.Service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey));
        var item = Assert.IsType<TagOrderItemResponse>(created.Order.Item);

        Assert.True(item.SupportsQr);
        Assert.False(item.SupportsNfc);
        Assert.Equal(TagType.QrPetTag, created.Order.TagType);
    }

    [Fact]
    public async Task Create_RejectsUnavailableSkuOutOfStockAndAnotherOwnersPet()
    {
        await using var harness = await Harness.CreateAsync();

        var missing = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateAsync(OwnerId, Request(harness.Pet.Id, "MISSING-PUBLIC-KEY")));
        Assert.Equal(StatusCodes.Status404NotFound, missing.StatusCode);

        harness.Stock.OrderId = Guid.NewGuid();
        await harness.Db.SaveChangesAsync();
        var unavailableStock = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey)));
        Assert.Equal("out_of_stock", unavailableStock.Code);

        harness.Stock.OrderId = null;
        await harness.Db.SaveChangesAsync();
        var wrongOwner = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateAsync(OtherOwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey)));
        Assert.Equal(StatusCodes.Status404NotFound, wrongOwner.StatusCode);
    }

    [Fact]
    public async Task Create_RemainsDisabledWhenOrderingFeatureIsOff()
    {
        await using var harness = await Harness.CreateAsync(orderingEnabled: false);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey)));

        Assert.Equal("feature_disabled", error.Code);
    }

    [Fact]
    public async Task SubmitPaymentProof_RequiresAndSnapshotsCustomerSubmittedAmount()
    {
        await using var harness = await Harness.CreateAsync();
        var created = await harness.Service.CreateAsync(
            OwnerId,
            Request(harness.Pet.Id, harness.Variant.PublicKey));

        var missing = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.SubmitPaymentProofAsync(
                OwnerId,
                created.Order.Id.ToString(),
                new UploadPaymentProofRequest(null, "receipt.jpg", "QR Payment", null, null)));
        Assert.Contains("submittedAmount", missing.Details!.Keys);

        var overPrecision = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.SubmitPaymentProofAsync(
                OwnerId,
                created.Order.Id.ToString(),
                new UploadPaymentProofRequest(null, "receipt.jpg", "QR Payment", null, null, 39.901m)));
        Assert.Contains("submittedAmount", overPrecision.Details!.Keys);

        var submitted = await harness.Service.SubmitPaymentProofAsync(
            OwnerId,
            created.Order.Id.ToString(),
            new UploadPaymentProofRequest(null, "receipt.jpg", "QR Payment", "BANK-123", null, 39.90m));

        var proof = Assert.Single(submitted.PaymentProofs);
        Assert.Equal(39.90m, proof.SubmittedAmount);
        Assert.Equal(39.90m, (await harness.Db.PaymentProofs.AsNoTracking().SingleAsync()).SubmittedAmount);
        Assert.Equal(39.90m, submitted.Amount);
    }

    [Fact]
    public async Task SubmitPaymentProof_LegacyMetadataSanitizesDisplayNameAndInfersContentType()
    {
        await using var harness = await Harness.CreateAsync();
        var created = await harness.Service.CreateAsync(
            OwnerId,
            Request(harness.Pet.Id, harness.Variant.PublicKey));

        var submitted = await harness.Service.SubmitPaymentProofAsync(
            OwnerId,
            created.Order.Id.ToString(),
            new UploadPaymentProofRequest(
                null,
                "../../../etc/passwd.PNG",
                "QR Payment",
                null,
                null,
                39.90m));

        var proof = Assert.Single(submitted.PaymentProofs);
        Assert.Equal("passwd.PNG", proof.OriginalFileName);
        Assert.Equal("image/png", proof.ContentType);

        var stored = await harness.Db.PaymentProofs
            .Include(item => item.MediaFile)
            .AsNoTracking()
            .SingleAsync();
        Assert.Equal("passwd.PNG", stored.OriginalFileName);
        Assert.Equal("passwd.PNG", stored.MediaFile.OriginalFileName);
        Assert.StartsWith("metadata-only-", stored.StorageFileName, StringComparison.Ordinal);
        Assert.Empty(stored.StoragePath);
    }

    [Fact]
    public async Task OwnerShipmentDetails_AreHiddenUntilShippedAndRemainVisibleWhenDelivered()
    {
        await using var harness = await Harness.CreateAsync();
        var created = await harness.Service.CreateAsync(
            OwnerId,
            Request(harness.Pet.Id, harness.Variant.PublicKey));
        var order = await harness.Db.TagOrders.SingleAsync(item => item.Id == created.Order.Id);
        order.CourierProvider = "Pos Laju";
        order.CourierService = "Express";
        order.TrackingNumber = "TRACK-123";
        order.ShippedAt = DateTimeOffset.Parse("2026-07-31T02:00:00Z");

        order.Status = OrderStatus.ReadyToShip;
        await harness.Db.SaveChangesAsync();
        var ready = await harness.Service.GetAsync(OwnerId, order.Id.ToString());
        Assert.Null(ready.CourierProvider);
        Assert.Null(ready.CourierService);
        Assert.Null(ready.TrackingNumber);
        Assert.Null(ready.ShippedAt);
        Assert.Null(ready.TrackingUrl);

        order.Status = OrderStatus.Shipped;
        await harness.Db.SaveChangesAsync();
        var shipped = await harness.Service.GetAsync(OwnerId, order.Id.ToString());
        Assert.Equal("Pos Laju", shipped.CourierProvider);
        Assert.Equal("Express", shipped.CourierService);
        Assert.Equal("TRACK-123", shipped.TrackingNumber);
        Assert.Equal(order.ShippedAt, shipped.ShippedAt);

        order.Status = OrderStatus.Delivered;
        await harness.Db.SaveChangesAsync();
        var delivered = await harness.Service.GetAsync(OwnerId, order.Id.ToString());
        Assert.Equal("TRACK-123", delivered.TrackingNumber);
        Assert.Equal(order.ShippedAt, delivered.ShippedAt);

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.GetAsync(OtherOwnerId, order.Id.ToString()));
        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.GetAsync(null, order.Id.ToString()));
    }

    [Fact]
    public async Task AdminAllocation_RequiresExactSkuEligibleStock_AndCannotAllocateOneTagTwice()
    {
        await using var harness = await Harness.CreateAsync();
        var first = await harness.Service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey));
        var second = await harness.Service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey));
        var orders = await harness.Db.TagOrders.Where(item => item.Id == first.Order.Id || item.Id == second.Order.Id).ToListAsync();
        foreach (var order in orders)
        {
            order.Status = OrderStatus.PaymentConfirmed;
            order.PaymentStatus = PaymentStatus.Confirmed;
        }

        var otherVariant = new TagProductVariant
        {
            TagProduct = harness.Product,
            PublicKey = "QRLIGHTWEIGHT001",
            Sku = "MPL-QR-LIGHTWEIGHT-V1",
            DisplayName = "Lightweight QR",
            SupportsQr = true,
            SupportsNfc = false,
            TagVariant = "Lightweight",
            BasePrice = 29.90m,
            Currency = "MYR",
            IsActive = true,
            IsPurchasable = true
        };
        var wrongStock = new SmartTag
        {
            TagCode = "MPL-WRNG-0001",
            ProductVariant = otherVariant,
            HasNfc = false,
            Variant = "Lightweight",
            Status = SmartTagStatus.Unclaimed,
            FulfilmentStatus = TagFulfilmentStatus.Generated
        };
        harness.Db.AddRange(otherVariant, wrongStock);
        await harness.Db.SaveChangesAsync();

        var admin = new AdminService(
            harness.Db,
            new AuditLogService(harness.Db, new HttpContextAccessor()),
            Options.Create(new FeatureOptions()));

        var mismatch = await Assert.ThrowsAsync<ApiException>(() =>
            admin.AssignInventoryTagAsync(AdminId, first.Order.Id, wrongStock.Id));
        Assert.Contains("same SKU", mismatch.Details!["tagId"].Single());

        var assigned = await admin.AssignInventoryTagAsync(AdminId, first.Order.Id, harness.Stock.Id);
        Assert.Equal(harness.Stock.Id, assigned.Order.SmartTagId);

        var duplicate = await Assert.ThrowsAsync<ApiException>(() =>
            admin.AssignInventoryTagAsync(AdminId, second.Order.Id, harness.Stock.Id));
        Assert.Equal("invalid_state", duplicate.Code);
    }

    [Fact]
    public async Task Create_MultiplePetsAndSkus_CreatesOneOrderWithAuthoritativeTotals()
    {
        await using var harness = await Harness.CreateAsync();
        var secondPet = new Pet
        {
            OwnerUserId = OwnerId,
            Slug = "luna-p124",
            Name = "Luna",
            Species = "Cat",
            LifecycleStatus = PetLifecycleStatus.Active
        };
        var qrVariant = new TagProductVariant
        {
            TagProduct = harness.Product,
            PublicKey = "QRLIGHTWEIGHT002",
            Sku = "MPL-QR-LIGHTWEIGHT-V2",
            DisplayName = "Lightweight QR",
            SupportsQr = true,
            SupportsNfc = false,
            TagVariant = "Lightweight",
            BasePrice = 29.90m,
            Currency = "MYR",
            IsActive = true,
            IsPurchasable = true,
            WeightGrams = 5m
        };
        var qrStock = new SmartTag
        {
            TagCode = "MPL-STCK-0002",
            ProductVariant = qrVariant,
            HasNfc = false,
            Variant = "Lightweight",
            Status = SmartTagStatus.Unclaimed,
            FulfilmentStatus = TagFulfilmentStatus.Generated
        };
        harness.Db.AddRange(secondPet, qrVariant, qrStock);
        await harness.Db.SaveChangesAsync();

        var request = new CreateTagOrderRequest(
            [
                new CreateTagOrderItemRequest(harness.Pet.Id, harness.Variant.PublicKey, 1),
                new CreateTagOrderItemRequest(secondPet.Id, qrVariant.PublicKey, 1)
            ],
            new DeliveryDetailsRequest("Aina", "+60123456789", "1 Jalan Pet", null, "50000", "Kuala Lumpur", "KUL", null),
            null,
            "multi-attempt-1");

        var created = await harness.Service.CreateAsync(OwnerId, request);

        Assert.Equal(2, created.Order.Items.Count);
        Assert.Equal(79.80m, created.Order.MerchandiseSubtotal);
        Assert.Equal(10m, created.Order.DiscountTotal);
        Assert.Equal(69.80m, created.Order.Amount);
        Assert.Equal(69.80m, created.Order.TotalAmount);
        Assert.Equal(2, await harness.Db.TagOrderItems.CountAsync(item => item.OrderId == created.Order.Id));
        Assert.All(created.Order.Items, item => Assert.Empty(item.AssignedTags));
        Assert.Contains(created.Order.Items, item => item.PetId == secondPet.Id && item.PetName == "Luna" && item.Sku == qrVariant.Sku);
    }

    [Fact]
    public async Task Create_MultiItemWithAnotherOwnersPet_RejectsAtomically()
    {
        await using var harness = await Harness.CreateAsync();
        var otherPet = new Pet
        {
            OwnerUserId = OtherOwnerId,
            Slug = "private-pet-p999",
            Name = "Private",
            Species = "Dog",
            LifecycleStatus = PetLifecycleStatus.Active
        };
        harness.Db.Add(otherPet);
        await harness.Db.SaveChangesAsync();

        var request = new CreateTagOrderRequest(
            [
                new CreateTagOrderItemRequest(harness.Pet.Id, harness.Variant.PublicKey, 1),
                new CreateTagOrderItemRequest(otherPet.Id, harness.Variant.PublicKey, 1)
            ],
            new DeliveryDetailsRequest("Aina", "+60123456789", "1 Jalan Pet", null, "50000", "Kuala Lumpur", "KUL", null),
            null,
            "multi-private");

        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Service.CreateAsync(OwnerId, request));
        Assert.Equal(StatusCodes.Status404NotFound, error.StatusCode);
        Assert.Empty(harness.Db.TagOrders);
    }

    [Fact]
    public async Task Create_ReservesOutstandingSkuUnits_AndPreventsOverselling()
    {
        await using var harness = await Harness.CreateAsync();
        var availability = new TagOrderInventoryAvailabilityService(harness.Db);
        var pricing = new TagPricingService(harness.Db);
        var service = new OrderService(
            harness.Db,
            Options.Create(new FeatureOptions { SmartTagOrderingEnabled = true }),
            pricing,
            new DeliveryService(harness.Db, pricing, new AuditLogService(harness.Db, new HttpContextAccessor())),
            new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()),
            TimeProvider.System,
            inventoryAvailability: availability);

        await service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey, "reserved-first"));
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey, "reserved-second")));

        Assert.Equal("out_of_stock", error.Code);
        Assert.Single(harness.Db.TagOrders);
    }

    private static CreateTagOrderRequest Request(Guid petId, string publicKey, string? idempotencyKey = null) => new(
        petId,
        publicKey,
        1,
        new DeliveryDetailsRequest("Aina", "+60123456789", "1 Jalan Pet", null, "50000", "Kuala Lumpur", "KUL", null),
        null,
        idempotencyKey);

    [Fact]
    public async Task Create_WithIdempotencyKey_SamePayload_ReturnsTheSameOrderOnce()
    {
        await using var harness = await Harness.CreateAsync();
        var request = Request(harness.Pet.Id, harness.Variant.PublicKey, "attempt-1");

        var first = await harness.Service.CreateAsync(OwnerId, request);
        var replay = await harness.Service.CreateAsync(OwnerId, request);

        Assert.Equal(first.Order.Id, replay.Order.Id);
        Assert.Equal(first.Order.OrderNumber, replay.Order.OrderNumber);
        Assert.Equal(1, await harness.Db.TagOrders.CountAsync(order => order.OwnerUserId == OwnerId));
    }

    [Fact]
    public async Task Create_SameKeyDifferentPayload_ReturnsConflict()
    {
        await using var harness = await Harness.CreateAsync();
        await harness.Service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey, "attempt-1"));

        var different = new CreateTagOrderRequest(
            harness.Pet.Id, harness.Variant.PublicKey, 1,
            new DeliveryDetailsRequest("Someone Else", "+60129999999", "9 Other Road", null, "40000", "Shah Alam", "Selangor", null),
            null, "attempt-1");

        var conflict = await Assert.ThrowsAsync<ApiException>(() => harness.Service.CreateAsync(OwnerId, different));
        Assert.Equal("idempotency_key_conflict", conflict.Code);
        Assert.Equal(StatusCodes.Status409Conflict, conflict.StatusCode);
        Assert.Equal(1, await harness.Db.TagOrders.CountAsync(order => order.OwnerUserId == OwnerId));
    }

    [Fact]
    public async Task Create_DifferentKeys_CreateSeparateOrders()
    {
        await using var harness = await Harness.CreateAsync();

        var first = await harness.Service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey, "attempt-1"));
        var second = await harness.Service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey, "attempt-2"));

        Assert.NotEqual(first.Order.Id, second.Order.Id);
        Assert.Equal(2, await harness.Db.TagOrders.CountAsync(order => order.OwnerUserId == OwnerId));
    }

    [Fact]
    public async Task Create_OmittedKey_KeepsLegacyNonIdempotentBehaviour()
    {
        await using var harness = await Harness.CreateAsync();

        await harness.Service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey));
        await harness.Service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey));

        Assert.Equal(2, await harness.Db.TagOrders.CountAsync(order => order.OwnerUserId == OwnerId));
    }

    [Fact]
    public async Task Create_FailedAttemptBeforeCommit_DoesNotPoisonTheKey()
    {
        await using var harness = await Harness.CreateAsync();
        // First attempt fails validation (archived pet) before any order row is
        // written, so the key is never persisted.
        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == harness.Pet.Id);
        pet.LifecycleStatus = PetLifecycleStatus.Archived;
        await harness.Db.SaveChangesAsync();

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey, "attempt-1")));

        pet.LifecycleStatus = PetLifecycleStatus.Active;
        await harness.Db.SaveChangesAsync();

        // Retrying the same key now succeeds — the earlier failure did not lock it.
        var retry = await harness.Service.CreateAsync(OwnerId, Request(harness.Pet.Id, harness.Variant.PublicKey, "attempt-1"));
        Assert.NotEqual(Guid.Empty, retry.Order.Id);
        Assert.Equal(1, await harness.Db.TagOrders.CountAsync(order => order.OwnerUserId == OwnerId));
    }


    // --- Order snapshots ----------------------------------------------------

    [Fact]
    public async Task Order_SnapshotsTheEffectiveOverrideFeeAndSource()
    {
        await using var harness = await Harness.CreateAsync();
        await SeedZoneAsync(harness.Db, "PEN", 8m);
        await SeedOverrideAsync(harness.Db, "KUL", 10m);

        var created = await harness.Service.CreateAsync(
            OwnerId,
            Request(harness.Pet.Id, harness.Variant.PublicKey));

        var order = await harness.Db.TagOrders.SingleAsync(item => item.Id == created.Order.Id);
        Assert.Equal(10m, order.DeliveryFee);
        Assert.Equal("StateOverride", order.DeliveryRateSource);
        Assert.Equal("KUL", order.StateCode);
        Assert.Equal("Peninsular", order.DeliveryZoneName);
    }

    [Fact]
    public async Task Order_SnapshotsTheZoneDefaultWhenNoOverrideApplies()
    {
        await using var harness = await Harness.CreateAsync();
        await SeedZoneAsync(harness.Db, "PEN", 8m);

        var created = await harness.Service.CreateAsync(
            OwnerId,
            Request(harness.Pet.Id, harness.Variant.PublicKey));

        var order = await harness.Db.TagOrders.SingleAsync(item => item.Id == created.Order.Id);
        Assert.Equal(8m, order.DeliveryFee);
        Assert.Equal("ZoneDefault", order.DeliveryRateSource);
    }

    [Fact]
    public async Task HistoricalOrder_DoesNotRecalculateWhenAnOverrideChangesLater()
    {
        await using var harness = await Harness.CreateAsync();
        await SeedZoneAsync(harness.Db, "PEN", 8m);
        await SeedOverrideAsync(harness.Db, "KUL", 10m);

        var created = await harness.Service.CreateAsync(
            OwnerId,
            Request(harness.Pet.Id, harness.Variant.PublicKey));
        var chargedFee = created.Order.DeliveryFee;
        var chargedTotal = created.Order.TotalAmount;

        // An administrator later raises the override, then removes it entirely.
        var stored = await harness.Db.DeliveryStateRateOverrides.SingleAsync();
        stored.Fee = 25m;
        await harness.Db.SaveChangesAsync();
        harness.Db.DeliveryStateRateOverrides.Remove(stored);
        await harness.Db.SaveChangesAsync();

        var order = await harness.Db.TagOrders.SingleAsync(item => item.Id == created.Order.Id);
        Assert.Equal(10m, chargedFee);
        Assert.Equal(chargedFee, order.DeliveryFee);
        Assert.Equal(chargedTotal, order.TotalAmount);
        Assert.Equal("StateOverride", order.DeliveryRateSource);
    }

    [Fact]
    public async Task Create_IgnoresAnyClientSuppliedDeliveryPricing()
    {
        // The request contract carries only the address; there is no field a
        // caller could use to influence the fee. This pins that contract.
        await using var harness = await Harness.CreateAsync();
        await SeedZoneAsync(harness.Db, "PEN", 8m);
        await SeedOverrideAsync(harness.Db, "KUL", 10m);

        var created = await harness.Service.CreateAsync(
            OwnerId,
            Request(harness.Pet.Id, harness.Variant.PublicKey));

        var deliveryProperties = typeof(DeliveryDetailsRequest)
            .GetProperties()
            .Select(property => property.Name)
            .ToArray();
        Assert.DoesNotContain("Fee", deliveryProperties);
        Assert.DoesNotContain("DeliveryFee", deliveryProperties);
        Assert.DoesNotContain("Total", deliveryProperties);
        Assert.DoesNotContain("FreeShippingThreshold", deliveryProperties);
        Assert.DoesNotContain("OverrideId", deliveryProperties);
        Assert.Equal(10m, created.Order.DeliveryFee);
    }

    private static async Task SeedZoneAsync(
        MyPetLinkDbContext db,
        string zone,
        decimal fee,
        decimal? threshold = null,
        bool active = true)
    {
        var existing = await db.DeliveryRates
            .SingleOrDefaultAsync(rate => rate.ZoneCode == zone);
        if (existing is null)
        {
            db.DeliveryRates.Add(new DeliveryRate
            {
                Name = $"{MalaysiaDelivery.Zones[zone]} Standard Delivery",
                ZoneCode = zone,
                ApplicableStateCodesJson = "[]",
                Fee = fee,
                Currency = "MYR",
                FreeShippingThreshold = threshold,
                IsActive = active
            });
        }
        else
        {
            existing.Fee = fee;
            existing.FreeShippingThreshold = threshold;
            existing.IsActive = active;
        }

        await db.SaveChangesAsync();
    }

    private static async Task SeedOverrideAsync(
        MyPetLinkDbContext db,
        string stateCode,
        decimal fee,
        decimal? threshold = null,
        bool enabled = true)
    {
        db.DeliveryStateRateOverrides.Add(new DeliveryStateRateOverride
        {
            StateCode = stateCode,
            Fee = fee,
            Currency = "MYR",
            FreeShippingThreshold = threshold,
            IsEnabled = enabled
        });
        await db.SaveChangesAsync();
    }

    private sealed class Harness : IAsyncDisposable
    {
        private Harness(
            MyPetLinkDbContext db,
            TagProduct product,
            TagProductVariant variant,
            Pet pet,
            SmartTag stock,
            bool orderingEnabled,
            IBusinessReferenceGenerator? businessReferences,
            TimeProvider? timeProvider)
        {
            Db = db;
            Product = product;
            Variant = variant;
            Pet = pet;
            Stock = stock;
            Service = new OrderService(
                db,
                Options.Create(new FeatureOptions { SmartTagOrderingEnabled = orderingEnabled }),
                new TagPricingService(db),
                new DeliveryService(db, new TagPricingService(db), new AuditLogService(db, new HttpContextAccessor())),
                businessReferences ?? new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()),
                timeProvider ?? TimeProvider.System);
        }

        public MyPetLinkDbContext Db { get; }
        public TagProduct Product { get; }
        public TagProductVariant Variant { get; }
        public Pet Pet { get; }
        public SmartTag Stock { get; }
        public OrderService Service { get; }

        public static async Task<Harness> CreateAsync(
            bool orderingEnabled = true,
            IBusinessReferenceGenerator? businessReferences = null,
            TimeProvider? timeProvider = null)
        {
            var db = new MyPetLinkDbContext(
                new DbContextOptionsBuilder<MyPetLinkDbContext>()
                    .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options,
                timeProvider ?? TimeProvider.System);
            var owner = User(OwnerId, "owner@example.com");
            var otherOwner = User(OtherOwnerId, "other@example.com");
            var admin = User(AdminId, "admin@example.com");
            admin.AdminUser = new AdminUser { UserId = AdminId, Role = AdminRole.Admin, IsActive = true };
            var pet = new Pet
            {
                OwnerUserId = owner.Id,
                OwnerUser = owner,
                Slug = "milo-p123",
                Name = "Milo",
                Species = "Dog",
                LifecycleStatus = PetLifecycleStatus.Active
            };
            var product = new TagProduct
            {
                Name = "MyPetLink Smart Tag",
                Slug = "mypetlink-smart-tag",
                ShortDescription = "A safer way home.",
                IsPublished = true
            };
            var variant = new TagProductVariant
            {
                TagProduct = product,
                PublicKey = "NFCSTANDARD00001",
                Sku = "MPL-NFC-STANDARD-V1",
                DisplayName = "Standard NFC",
                SupportsQr = true,
                SupportsNfc = true,
                TagVariant = "Standard",
                BasePrice = 49.90m,
                Currency = "MYR",
                IsActive = true,
                IsPurchasable = true
            };
            var promotion = new Promotion
            {
                Name = "Launch offer",
                DisplayLabel = "Save MYR 10",
                IsActive = true,
                IsAutomatic = true,
                DiscountType = PromotionDiscountType.FixedAmount,
                DiscountValue = 10m,
                StartsAt = DateTimeOffset.UtcNow.AddDays(-1),
                EndsAt = DateTimeOffset.UtcNow.AddDays(1),
                Priority = 1
            };
            variant.PromotionVariants.Add(new PromotionVariant { Promotion = promotion, TagProductVariant = variant });
            var stock = new SmartTag
            {
                TagCode = "MPL-STCK-0001",
                ProductVariant = variant,
                HasNfc = true,
                Variant = "Standard",
                Status = SmartTagStatus.Unclaimed,
                FulfilmentStatus = TagFulfilmentStatus.Generated
            };
            var deliveryRate = new DeliveryRate
            {
                Name = "Peninsular Standard Delivery",
                ZoneCode = "PEN",
                ApplicableStateCodesJson = "[\"KUL\"]",
                Fee = 0m,
                Currency = "MYR",
                IsActive = true
            };
            db.AddRange(owner, otherOwner, admin, pet, product, variant, promotion, stock, deliveryRate);
            await db.SaveChangesAsync();
            return new Harness(
                db,
                product,
                variant,
                pet,
                stock,
                orderingEnabled,
                businessReferences,
                timeProvider);
        }

        private static User User(Guid id, string email) => new()
        {
            Id = id,
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = email.Split('@')[0],
            Status = UserStatus.Active
        };

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
}
