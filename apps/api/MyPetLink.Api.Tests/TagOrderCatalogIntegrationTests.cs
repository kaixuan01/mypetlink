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

    private static CreateTagOrderRequest Request(Guid petId, string publicKey, string? idempotencyKey = null) => new(
        petId,
        publicKey,
        1,
        new DeliveryDetailsRequest("Aina", "+60123456789", "1 Jalan Pet", null, "50000", "Kuala Lumpur", "WP Kuala Lumpur", null),
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

    private sealed class Harness : IAsyncDisposable
    {
        private Harness(MyPetLinkDbContext db, TagProduct product, TagProductVariant variant, Pet pet, SmartTag stock, bool orderingEnabled)
        {
            Db = db;
            Product = product;
            Variant = variant;
            Pet = pet;
            Stock = stock;
            Service = new OrderService(
                db,
                Options.Create(new FeatureOptions { SmartTagOrderingEnabled = orderingEnabled }),
                new TagPricingService(db));
        }

        public MyPetLinkDbContext Db { get; }
        public TagProduct Product { get; }
        public TagProductVariant Variant { get; }
        public Pet Pet { get; }
        public SmartTag Stock { get; }
        public OrderService Service { get; }

        public static async Task<Harness> CreateAsync(bool orderingEnabled = true)
        {
            var db = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options);
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
            db.AddRange(owner, otherOwner, admin, pet, product, variant, promotion, stock);
            await db.SaveChangesAsync();
            return new Harness(db, product, variant, pet, stock, orderingEnabled);
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
