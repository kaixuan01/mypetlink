using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class DeliveryServiceTests
{
    [Fact]
    public void States_AreCanonicalCompleteAndNonOverlapping()
    {
        using var harness = Harness.Create();
        var states = harness.Service.ListStates();

        Assert.Equal(16, states.Count);
        Assert.Equal(16, states.Select(state => state.Code).Distinct().Count());
        Assert.Equal(["LBN", "PEN", "SBH", "SWK"], states.Select(state => state.ZoneCode).Distinct().Order().ToArray());
        Assert.Contains(states.Single(state => state.Code == "KUL").Aliases, alias => alias == "KL");
        Assert.Equal("PNG", MalaysiaDelivery.ResolveState("Penang")?.Code);
        Assert.Equal("MLK", MalaysiaDelivery.ResolveState("Malacca")?.Code);
        Assert.Null(MalaysiaDelivery.ResolveState("WP"));
    }

    [Fact]
    public async Task Quote_AcceptsEveryCanonicalMalaysiaState()
    {
        await using var harness = Harness.Create();
        foreach (var zone in MalaysiaDelivery.Zones.Keys)
            await harness.SeedRateAsync(zone, zone == "PEN" ? 8m : 15m);

        foreach (var state in MalaysiaDelivery.States)
        {
            var quote = await harness.Service.QuoteAsync(
                new DeliveryQuoteRequest(state.Code, harness.VariantKey, 1));
            Assert.Equal(state.Code, quote.StateCode);
            Assert.Equal(state.ZoneCode, quote.ZoneCode);
        }
    }

    [Theory]
    [InlineData("JHR", "PEN")]
    [InlineData("SBH", "SBH")]
    [InlineData("SWK", "SWK")]
    [InlineData("LBN", "LBN")]
    public async Task Quote_ResolvesEveryZoneDeterministically(string stateCode, string expectedZone)
    {
        await using var harness = Harness.Create();
        await harness.SeedRateAsync(expectedZone, 12.50m);

        var quote = await harness.Service.QuoteAsync(new DeliveryQuoteRequest(stateCode, harness.VariantKey, 1));

        Assert.Equal(expectedZone, quote.ZoneCode);
        Assert.Equal(12.50m, quote.DeliveryFee);
        Assert.Equal(52.40m, quote.Total);
        Assert.EndsWith("Standard Delivery", quote.DeliveryMethod);
    }

    [Fact]
    public async Task Quote_UsesDiscountedItemTotalForFreeThreshold()
    {
        await using var harness = Harness.Create();
        await harness.SeedRateAsync("PEN", 8m, threshold: 39.90m);

        var quote = await harness.Service.QuoteAsync(new DeliveryQuoteRequest("KUL", harness.VariantKey, 1));

        Assert.Equal(49.90m, quote.ItemSubtotal);
        Assert.Equal(10m, quote.DiscountAmount);
        Assert.Equal(0m, quote.DeliveryFee);
        Assert.Equal(39.90m, quote.Total);
        Assert.True(quote.IsFreeDelivery);
        Assert.NotNull(quote.FreeDeliveryReason);
    }

    [Fact]
    public async Task Quote_MultipleLines_AggregatesQuantityDiscountAndOneDeliveryFee()
    {
        await using var harness = Harness.Create();
        await harness.SeedRateAsync("PEN", 8m);
        var product = await harness.Db.TagProducts.SingleAsync();
        var second = new TagProductVariant
        {
            TagProduct = product,
            PublicKey = "DELIVERYQUOTE002",
            Sku = "DELIVERY-2",
            DisplayName = "Lightweight",
            SupportsQr = true,
            TagVariant = "Lightweight",
            BasePrice = 20m,
            Currency = "MYR",
            IsActive = true,
            IsPurchasable = true
        };
        harness.Db.Add(second);
        await harness.Db.SaveChangesAsync();

        var quote = await harness.Service.QuoteAsync(new DeliveryQuoteRequest(
            "KUL",
            [
                new DeliveryQuoteItemRequest(harness.VariantKey, 2),
                new DeliveryQuoteItemRequest(second.PublicKey, 2)
            ]));

        Assert.Equal(139.80m, quote.ItemSubtotal);
        Assert.Equal(20m, quote.DiscountAmount);
        Assert.Equal(8m, quote.DeliveryFee);
        Assert.Equal(127.80m, quote.Total);
    }

    [Fact]
    public async Task Quote_ZeroFeeIsFreeOnlyWhenRateIsExplicitlyActive()
    {
        await using var harness = Harness.Create();
        await harness.SeedRateAsync("PEN", 0m);

        var quote = await harness.Service.QuoteAsync(new DeliveryQuoteRequest("SGR", harness.VariantKey, 1));

        Assert.True(quote.IsFreeDelivery);
        Assert.Equal("Free delivery for this zone.", quote.FreeDeliveryReason);
    }

    [Fact]
    public async Task Quote_InactiveOrMissingRateBlocksCheckout()
    {
        await using var harness = Harness.Create();
        await harness.SeedRateAsync("PEN", 0m, active: false);

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.QuoteAsync(new DeliveryQuoteRequest("KUL", harness.VariantKey, 1)));

        Assert.Equal("delivery_unavailable", exception.Code);
        Assert.Equal("Delivery is not currently available for this address. Please contact MyPetLink support.", exception.Message);
    }

    [Theory]
    [InlineData("")]
    [InlineData("XYZ")]
    [InlineData("WP")]
    public async Task Quote_RejectsMissingOrUnsupportedStates(string stateCode)
    {
        await using var harness = Harness.Create();
        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.QuoteAsync(new DeliveryQuoteRequest(stateCode, harness.VariantKey, 1)));
        Assert.Equal("validation_failed", exception.Code);
    }

    [Fact]
    public async Task AdminRate_RejectsDuplicateZoneAndNonMyrCurrency()
    {
        await using var harness = Harness.Create();
        await harness.SeedRateAsync("PEN", 8m);
        var duplicate = new UpsertDeliveryRateRequest("Other", "PEN", 9m, "MYR", null, true, 1, null);
        var currency = new UpsertDeliveryRateRequest("Sabah", "SBH", 9m, "USD", null, true, 1, null);

        Assert.Equal("duplicate_value", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateRateAsync(Guid.NewGuid(), duplicate))).Code);
        Assert.Equal("validation_failed", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateRateAsync(Guid.NewGuid(), currency))).Code);
    }

    [Fact]
    public async Task AdminRate_RejectsNegativeFeeAndThreshold()
    {
        await using var harness = Harness.Create();
        var negativeFee = new UpsertDeliveryRateRequest("Peninsular", "PEN", -0.01m, "MYR", null, true, 1, null);
        var negativeThreshold = new UpsertDeliveryRateRequest("Peninsular", "PEN", 8m, "MYR", -1m, true, 1, null);

        Assert.Equal("validation_failed", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateRateAsync(Guid.NewGuid(), negativeFee))).Code);
        Assert.Equal("validation_failed", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreateRateAsync(Guid.NewGuid(), negativeThreshold))).Code);
    }

    private sealed class Harness : IAsyncDisposable, IDisposable
    {
        private Harness(MyPetLinkDbContext db, DeliveryService service, string variantKey)
        {
            Db = db; Service = service; VariantKey = variantKey;
        }
        public MyPetLinkDbContext Db { get; }
        public DeliveryService Service { get; }
        public string VariantKey { get; }

        public static Harness Create()
        {
            var db = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options);
            var product = new TagProduct { Name = "Tag", Slug = "tag", IsPublished = true };
            var variant = new TagProductVariant
            {
                TagProduct = product, PublicKey = "DELIVERYQUOTE001", Sku = "DELIVERY-1",
                DisplayName = "Tag", SupportsQr = true, TagVariant = "Standard",
                BasePrice = 49.90m, Currency = "MYR", IsActive = true, IsPurchasable = true
            };
            var promotion = new Promotion
            {
                Name = "Save 10", IsActive = true, IsAutomatic = true,
                DiscountType = PromotionDiscountType.FixedAmount, DiscountValue = 10m,
                StartsAt = DateTimeOffset.UtcNow.AddDays(-1), EndsAt = DateTimeOffset.UtcNow.AddDays(1)
            };
            variant.PromotionVariants.Add(new PromotionVariant { TagProductVariant = variant, Promotion = promotion });
            db.AddRange(product, variant, promotion);
            db.SaveChanges();
            var audit = new AuditLogService(db, new HttpContextAccessor());
            return new Harness(db, new DeliveryService(db, new TagPricingService(db), audit), variant.PublicKey);
        }

        public async Task SeedRateAsync(string zone, decimal fee, decimal? threshold = null, bool active = true)
        {
            Db.DeliveryRates.Add(new DeliveryRate
            {
                Name = $"{MalaysiaDelivery.Zones[zone]} Standard Delivery",
                ZoneCode = zone,
                ApplicableStateCodesJson = "[]",
                Fee = fee,
                Currency = "MYR",
                FreeShippingThreshold = threshold,
                IsActive = active
            });
            await Db.SaveChangesAsync();
        }

        public void Dispose() => Db.Dispose();
        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
}
