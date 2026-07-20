using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class TagCatalogServiceTests
{
    private static readonly Guid AdminId = Guid.Parse("91111111-1111-1111-1111-111111111111");

    [Fact]
    public void Pricing_SelectsHighestPriorityThenGreatestDiscount_WithoutChangingBasePrice()
    {
        var now = DateTimeOffset.Parse("2026-07-20T08:00:00Z");
        var variant = Variant(100m);
        AddPromotion(variant, "Ten percent", PromotionDiscountType.Percentage, 10m, 5, now);
        AddPromotion(variant, "Fifteen fixed", PromotionDiscountType.FixedAmount, 15m, 5, now);
        AddPromotion(variant, "Lower priority", PromotionDiscountType.FixedAmount, 80m, 4, now);

        using var db = Db();
        var quote = new TagPricingService(db).Evaluate(variant, now);

        Assert.Equal("Fifteen fixed", quote.PromotionName);
        Assert.Equal(15m, quote.DiscountAmount);
        Assert.Equal(85m, quote.FinalPrice);
        Assert.Equal(100m, variant.BasePrice);
    }

    [Fact]
    public void Pricing_IgnoresInactiveExpiredAndFuturePromotions_AndNeverGoesNegative()
    {
        var now = DateTimeOffset.Parse("2026-07-20T08:00:00Z");
        var variant = Variant(20m);
        AddPromotion(variant, "Inactive", PromotionDiscountType.FixedAmount, 10m, 9, now, active: false);
        AddPromotion(variant, "Expired", PromotionDiscountType.FixedAmount, 10m, 8, now.AddDays(-2), endsAt: now.AddDays(-1));
        AddPromotion(variant, "Future", PromotionDiscountType.FixedAmount, 10m, 7, now.AddDays(1), endsAt: now.AddDays(2));
        AddPromotion(variant, "Current", PromotionDiscountType.Percentage, 100m, 1, now);

        using var db = Db();
        var quote = new TagPricingService(db).Evaluate(variant, now);

        Assert.Equal("Current", quote.PromotionName);
        Assert.Equal(20m, quote.DiscountAmount);
        Assert.Equal(0m, quote.FinalPrice);
    }

    [Fact]
    public async Task Catalog_RequiresAdmin_NormalizesSku_AndRejectsDuplicates()
    {
        await using var harness = await Harness.CreateAsync();
        var request = harness.ValidVariant("mpl-qr-standard-v1");

        var unauthorized = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateVariantAsync(null, harness.Product.Id, request));
        Assert.Equal(StatusCodes.Status401Unauthorized, unauthorized.StatusCode);

        var created = await harness.Service.CreateVariantAsync(AdminId, harness.Product.Id, request);
        Assert.Equal("MPL-QR-STANDARD-V1", created.Sku);

        var duplicate = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateVariantAsync(AdminId, harness.Product.Id, harness.ValidVariant("MPL-QR-STANDARD-V1")));
        Assert.Contains("already in use", duplicate.Details!["sku"].Single());
    }

    [Fact]
    public async Task Product_CreateAcceptsDraft_ButRejectsPublishingWithoutEligibleVariant()
    {
        await using var harness = await Harness.CreateAsync();
        var draftRequest = new UpsertTagProductRequest(
            "Lightweight QR Tag",
            "lightweight-qr-tag",
            null,
            null,
            false,
            0,
            [],
            null);

        var draft = await harness.Service.CreateProductAsync(AdminId, draftRequest);

        Assert.False(draft.IsPublished);
        Assert.Empty(draft.Variants);

        var publicationError = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateProductAsync(AdminId, draftRequest with
            {
                Slug = "published-without-sku",
                ShortDescription = "Ready for customers.",
                IsPublished = true
            }));

        Assert.Equal(StatusCodes.Status400BadRequest, publicationError.StatusCode);
        Assert.Contains("active purchasable SKU", publicationError.Details!["isPublished"].Single());
    }

    [Fact]
    public async Task Product_DraftCanReceivePurchasableVariant_ThenBePublished()
    {
        await using var harness = await Harness.CreateAsync();
        var draft = new TagProduct
        {
            Name = "Draft Tag",
            Slug = "draft-tag",
            ShortDescription = "Ready after its SKU is configured.",
            IsPublished = false,
            RowVersion = [7]
        };
        harness.Db.TagProducts.Add(draft);
        await harness.Db.SaveChangesAsync();

        await harness.Service.CreateVariantAsync(AdminId, draft.Id, harness.ValidVariant("MPL-DRAFT-V1"));
        var published = await harness.Service.UpdateProductAsync(
            AdminId,
            draft.Id,
            new UpsertTagProductRequest(
                draft.Name,
                draft.Slug,
                draft.ShortDescription,
                null,
                true,
                0,
                [],
                Convert.ToBase64String(draft.RowVersion)));

        Assert.True(published.IsPublished);
        Assert.Single(published.Variants);
        Assert.True(published.Variants.Single().IsPurchasable);
    }

    [Fact]
    public async Task Product_DuplicateSlugReturnsConflictWithFieldDetail()
    {
        await using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateProductAsync(
                AdminId,
                new UpsertTagProductRequest(
                    "Duplicate",
                    harness.Product.Slug,
                    null,
                    null,
                    false,
                    0,
                    [],
                    null)));

        Assert.Equal(StatusCodes.Status409Conflict, error.StatusCode);
        Assert.Equal("duplicate_value", error.Code);
        Assert.Contains("already in use", error.Details!["slug"].Single());
    }

    [Theory]
    [InlineData(false, 29.90, 32, 32, 8)]
    [InlineData(true, -1, 32, 32, 8)]
    [InlineData(true, 29.90, -1, 32, 8)]
    public async Task Catalog_RejectsMissingQrInvalidPriceOrInvalidDimensions(
        bool supportsQr, decimal price, decimal width, decimal height, decimal weight)
    {
        await using var harness = await Harness.CreateAsync();
        var request = harness.ValidVariant("MPL-VALIDATION-V1") with
        {
            SupportsQr = supportsQr,
            BasePrice = price,
            WidthMm = width,
            HeightMm = height,
            WeightGrams = weight
        };

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateVariantAsync(AdminId, harness.Product.Id, request));
        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task Catalog_PreventsPurchasableVariantWithIncompleteProductionData()
    {
        await using var harness = await Harness.CreateAsync();
        var request = harness.ValidVariant("MPL-INCOMPLETE-V1") with { Material = null };

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateVariantAsync(AdminId, harness.Product.Id, request));

        Assert.Contains("Complete size", error.Details!["physicalSpecifications"].Single());
    }

    [Fact]
    public async Task Catalog_LocksProductionFieldsAfterInventory_ButAllowsPriceChangesAndNewSkuVersions()
    {
        await using var harness = await Harness.CreateAsync();
        var created = await harness.Service.CreateVariantAsync(AdminId, harness.Product.Id, harness.ValidVariant("MPL-LOCKED-V1"));
        var storedVariant = await harness.Db.TagProductVariants.SingleAsync(item => item.Id == created.Id);
        storedVariant.RowVersion = [2];
        harness.Db.SmartTags.Add(new SmartTag
        {
            TagCode = "MPL-LOCK-0001",
            ProductVariantId = created.Id,
            HasNfc = false,
            Variant = "Standard",
            Status = SmartTagStatus.Unclaimed,
            FulfilmentStatus = TagFulfilmentStatus.Generated
        });
        await harness.Db.SaveChangesAsync();
        var concurrencyToken = Convert.ToBase64String(storedVariant.RowVersion);

        var changedSize = harness.ValidVariant(created.Sku) with
        {
            WidthMm = 40m,
            BasePrice = created.BasePrice,
            ConcurrencyToken = concurrencyToken
        };
        var locked = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateVariantAsync(AdminId, created.Id, changedSize));
        Assert.Equal(StatusCodes.Status409Conflict, locked.StatusCode);
        Assert.Contains("versioned SKU", locked.Message);

        var priceOnly = harness.ValidVariant(created.Sku) with
        {
            BasePrice = 39.90m,
            ConcurrencyToken = concurrencyToken
        };
        var repriced = await harness.Service.UpdateVariantAsync(AdminId, created.Id, priceOnly);
        Assert.Equal(39.90m, repriced.BasePrice);

        var versionTwo = await harness.Service.CreateVariantAsync(AdminId, harness.Product.Id, harness.ValidVariant("MPL-LOCKED-V2") with { WidthMm = 40m });
        Assert.Equal("MPL-LOCKED-V2", versionTwo.Sku);
    }

    [Fact]
    public async Task Catalog_FiltersDraftAndArchivedProducts_AndPublicProjectionExcludesUnavailableVariants()
    {
        await using var harness = await Harness.CreateAsync();
        await harness.Service.CreateVariantAsync(AdminId, harness.Product.Id, harness.ValidVariant("MPL-PUBLIC-V1"));
        await harness.Service.CreateVariantAsync(AdminId, harness.Product.Id, harness.ValidVariant("MPL-INACTIVE-V1") with { IsActive = false, IsPurchasable = false });
        var draft = new TagProduct { Name = "Draft", Slug = "draft", ShortDescription = "Not public", IsPublished = false };
        harness.Db.TagProducts.Add(draft);
        await harness.Db.SaveChangesAsync();

        var (published, _) = await harness.Service.ListAdminAsync(new AdminTagProductQuery { Published = true });
        var publicProducts = await harness.Service.ListPublicAsync();

        Assert.Single(published);
        var publicProduct = Assert.Single(publicProducts);
        Assert.Equal("mypetlink-tag", publicProduct.Slug);
        Assert.Single(publicProduct.Variants);
        Assert.Equal("MPL-PUBLIC-V1", publicProduct.Variants.Single().Sku);
    }

    [Fact]
    public async Task PromotionValidation_RejectsBadDatesExcessPercentageAndDiscountBelowZero()
    {
        await using var harness = await Harness.CreateAsync();
        var variant = await harness.Service.CreateVariantAsync(AdminId, harness.Product.Id, harness.ValidVariant("MPL-PROMO-V1"));
        var start = DateTimeOffset.UtcNow.AddHours(-1);

        foreach (var request in new[]
        {
            PromotionRequest(variant.Id, start, start, PromotionDiscountType.Percentage, 10m),
            PromotionRequest(variant.Id, start, start.AddDays(1), PromotionDiscountType.Percentage, 101m),
            PromotionRequest(variant.Id, start, start.AddDays(1), PromotionDiscountType.FixedAmount, 500m)
        })
        {
            var error = await Assert.ThrowsAsync<ApiException>(() => harness.Service.CreatePromotionAsync(AdminId, request));
            Assert.Equal("validation_failed", error.Code);
        }
    }

    [Fact]
    public async Task PromotionListing_SucceedsWhenNoPromotionsOrEligibleProductsExist()
    {
        await using var harness = await Harness.CreateAsync();
        harness.Db.TagProducts.Remove(harness.Product);
        await harness.Db.SaveChangesAsync();

        var (items, total) = await harness.Service.ListPromotionsAsync(new AdminPromotionQuery());

        Assert.Empty(items);
        Assert.Equal(0, total);
    }

    // --- Variant presets (Catalog Settings) --------------------------------------------

    [Fact]
    public async Task VariantPresets_CreateNormalizesCode_AndRejectsCaseInsensitiveDuplicates()
    {
        await using var harness = await Harness.CreateAsync();

        var created = await harness.Service.SaveVariantPresetAsync(
            AdminId, null, new UpsertTagVariantPresetRequest("collar-slide", "Collar Slide", "Slides onto a flat collar.", true, 5, null));

        Assert.Equal("COLLAR-SLIDE", created.Code);
        Assert.True(created.IsActive);
        Assert.Equal(0, created.SkuCount);

        var duplicateCode = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.SaveVariantPresetAsync(
                AdminId, null, new UpsertTagVariantPresetRequest("COLLAR-SLIDE", "Another Name", null, true, 6, null)));
        Assert.Contains("already exists", duplicateCode.Details!["code"].Single());

        var duplicateName = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.SaveVariantPresetAsync(
                AdminId, null, new UpsertTagVariantPresetRequest("OTHER-CODE", "collar slide", null, true, 7, null)));
        Assert.Contains("already exists", duplicateName.Details!["code"].Single());

        var unauthorized = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.SaveVariantPresetAsync(
                null, null, new UpsertTagVariantPresetRequest("SILICONE", "Silicone", null, true, 8, null)));
        Assert.Equal(StatusCodes.Status401Unauthorized, unauthorized.StatusCode);
    }

    [Fact]
    public async Task VariantPresets_InactivePresetBlocksNewSkus_ButExistingSkuKeepsWorking()
    {
        await using var harness = await Harness.CreateAsync();
        var created = await harness.Service.CreateVariantAsync(AdminId, harness.Product.Id, harness.ValidVariant("MPL-PRESET-V1"));
        Assert.Equal(harness.StandardPreset.Id, created.TagVariantPresetId);
        Assert.Equal("Standard", created.TagVariant);

        harness.StandardPreset.IsActive = false;
        await harness.Db.SaveChangesAsync();

        // A new SKU may not use the retired preset...
        var blocked = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateVariantAsync(AdminId, harness.Product.Id, harness.ValidVariant("MPL-PRESET-V2")));
        Assert.Contains("inactive", blocked.Details!["tagVariantPresetId"].Single());

        // ...but the existing SKU can still be edited while keeping it.
        var variantRow = await harness.Db.TagProductVariants.SingleAsync(item => item.Id == created.Id);
        variantRow.RowVersion = [3];
        await harness.Db.SaveChangesAsync();
        var updated = await harness.Service.UpdateVariantAsync(
            AdminId, created.Id,
            harness.ValidVariant(created.Sku) with { BasePrice = 34.90m, ConcurrencyToken = Convert.ToBase64String(variantRow.RowVersion) });
        Assert.Equal(harness.StandardPreset.Id, updated.TagVariantPresetId);
        Assert.Equal(34.90m, updated.BasePrice);
    }

    [Fact]
    public async Task VariantPresets_RenamingPresetDoesNotRewriteSkuSnapshotOrHistoricalOrders()
    {
        await using var harness = await Harness.CreateAsync();
        var created = await harness.Service.CreateVariantAsync(AdminId, harness.Product.Id, harness.ValidVariant("MPL-SNAP-V1"));
        var order = new TagOrder
        {
            OrderNumber = "ORD-9001",
            OwnerUserId = AdminId,
            PetId = Guid.NewGuid(),
            TagType = TagType.QrPetTag,
            Variant = created.TagVariant,
            Amount = 29.90m,
            Currency = "MYR",
            RecipientName = "A",
            DeliveryPhoneE164 = "+60123456789",
            AddressLine1 = "1 Jalan Test",
            Postcode = "50000",
            City = "KL",
            State = "WP"
        };
        harness.Db.TagOrders.Add(order);
        harness.Db.TagOrderItems.Add(new TagOrderItem
        {
            Order = order,
            ProductVariantId = created.Id,
            SkuSnapshot = created.Sku,
            ProductNameSnapshot = "MyPetLink Tag",
            VariantNameSnapshot = created.TagVariant,
            UnitBasePrice = 29.90m,
            Quantity = 1,
            Subtotal = 29.90m,
            FinalUnitPrice = 29.90m,
            FinalAmount = 29.90m,
            Currency = "MYR"
        });
        await harness.Db.SaveChangesAsync();

        harness.StandardPreset.RowVersion = [9];
        await harness.Db.SaveChangesAsync();
        await harness.Service.SaveVariantPresetAsync(
            AdminId, harness.StandardPreset.Id,
            new UpsertTagVariantPresetRequest("STANDARD", "Standard Metal", null, true, 0, Convert.ToBase64String([9])));

        // SKU snapshot and order snapshot keep the original label.
        var skuRow = await harness.Db.TagProductVariants.AsNoTracking().SingleAsync(item => item.Id == created.Id);
        Assert.Equal("Standard", skuRow.TagVariant);
        var orderItem = await harness.Db.TagOrderItems.AsNoTracking().SingleAsync();
        Assert.Equal("Standard", orderItem.VariantNameSnapshot);

        // Saving the SKU with the unchanged preset also keeps the snapshot: a
        // rename never silently reclassifies an existing SKU.
        var variantRow = await harness.Db.TagProductVariants.SingleAsync(item => item.Id == created.Id);
        variantRow.RowVersion = [4];
        await harness.Db.SaveChangesAsync();
        var resaved = await harness.Service.UpdateVariantAsync(
            AdminId, created.Id,
            harness.ValidVariant(created.Sku) with { ConcurrencyToken = Convert.ToBase64String([4]) });
        Assert.Equal("Standard", resaved.TagVariant);
    }

    private static UpsertPromotionRequest PromotionRequest(Guid variantId, DateTimeOffset startsAt, DateTimeOffset endsAt, PromotionDiscountType type, decimal value) =>
        new("Sale", null, "Sale", true, true, type, value, startsAt, endsAt, 1, [variantId], null);

    private static TagProductVariant Variant(decimal price) => new()
    {
        Id = Guid.NewGuid(),
        BasePrice = price,
        Currency = "MYR",
        PromotionVariants = new List<PromotionVariant>()
    };

    private static void AddPromotion(
        TagProductVariant variant,
        string name,
        PromotionDiscountType type,
        decimal value,
        int priority,
        DateTimeOffset startsAt,
        bool active = true,
        DateTimeOffset? endsAt = null)
    {
        var promotion = new Promotion
        {
            Id = Guid.NewGuid(),
            Name = name,
            IsActive = active,
            IsAutomatic = true,
            DiscountType = type,
            DiscountValue = value,
            Priority = priority,
            StartsAt = startsAt,
            EndsAt = endsAt ?? startsAt.AddDays(1)
        };
        variant.PromotionVariants.Add(new PromotionVariant { Promotion = promotion, TagProductVariant = variant });
    }

    private static MyPetLinkDbContext Db() => new(new DbContextOptionsBuilder<MyPetLinkDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options);

    private sealed class Harness : IAsyncDisposable
    {
        private Harness(MyPetLinkDbContext db, TagProduct product, TagVariantPreset standardPreset)
        {
            Db = db;
            Product = product;
            StandardPreset = standardPreset;
            Service = new TagCatalogService(
                db,
                new AuditLogService(db, new HttpContextAccessor()),
                new TagPricingService(db),
                Options.Create(new CloudflareR2Options()));
        }

        public MyPetLinkDbContext Db { get; }
        public TagProduct Product { get; }
        public TagVariantPreset StandardPreset { get; }
        public TagCatalogService Service { get; }

        public UpsertTagProductVariantRequest ValidVariant(string sku) => new(
            sku, "Standard tag", true, false, StandardPreset.Id, 32m, 32m, 2m, 8m,
            "Stainless steel", "Round", "Silver", "Retail sleeve", 29.90m, "MYR", null,
            "TPL-QR-STANDARD", "Print both sides", true, true, 0, null);

        public static async Task<Harness> CreateAsync()
        {
            var db = Db();
            var admin = new User
            {
                Id = AdminId,
                Email = "catalog-admin@example.com",
                NormalizedEmail = "CATALOG-ADMIN@EXAMPLE.COM",
                DisplayName = "Catalog Admin",
                Status = UserStatus.Active,
                AdminUser = new AdminUser { UserId = AdminId, Role = AdminRole.Admin, IsActive = true }
            };
            var product = new TagProduct
            {
                Name = "MyPetLink Tag",
                Slug = "mypetlink-tag",
                ShortDescription = "A safer way home.",
                IsPublished = true,
                RowVersion = [1]
            };
            var standardPreset = new TagVariantPreset
            {
                Code = "STANDARD",
                DisplayName = "Standard",
                IsActive = true,
                RowVersion = [1]
            };
            db.AddRange(admin, product, standardPreset);
            await db.SaveChangesAsync();
            return new Harness(db, product, standardPreset);
        }

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
}
