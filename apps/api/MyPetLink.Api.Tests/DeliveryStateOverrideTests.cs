using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// State overrides are an exception to a live zone's price. The precedence is
/// always: active state override -> active zone default -> delivery
/// unavailable. The zone remains the master availability control.
/// </summary>
public sealed class DeliveryStateOverrideTests
{
    private static readonly Guid AdminId = Guid.Parse("e1111111-1111-1111-1111-111111111111");

    // --- Pricing precedence -------------------------------------------------

    [Fact]
    public async Task StateWithoutOverride_UsesZoneDefault()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);
        await harness.SeedOverrideAsync("KTN", 10m);

        var johor = await harness.QuoteAsync("JHR");

        Assert.Equal(8m, johor.DeliveryFee);
        Assert.False(johor.StateOverrideApplied);
        Assert.Equal(DeliveryRateSources.ZoneDefaultLabel, johor.RateSource);
    }

    [Fact]
    public async Task EnabledOverride_ReplacesTheZoneFee()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);
        await harness.SeedOverrideAsync("KTN", 10m);

        var kelantan = await harness.QuoteAsync("KTN");

        Assert.Equal(10m, kelantan.DeliveryFee);
        Assert.True(kelantan.StateOverrideApplied);
        Assert.Equal(DeliveryRateSources.StateOverrideLabel, kelantan.RateSource);
        // The zone still identifies the delivery method and zone name.
        Assert.Equal("PEN", kelantan.ZoneCode);
        // A quote is customer-facing, so it carries the customer wording.
        Assert.Equal("West Malaysia", kelantan.ZoneName);
    }

    [Fact]
    public async Task DisabledOverride_FallsBackToZoneDefault()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);
        await harness.SeedOverrideAsync("KTN", 10m, enabled: false);

        var kelantan = await harness.QuoteAsync("KTN");

        Assert.Equal(8m, kelantan.DeliveryFee);
        Assert.False(kelantan.StateOverrideApplied);
    }

    [Fact]
    public async Task InactiveZone_BlocksCheckoutEvenWithAnEnabledOverride()
    {
        // An override must never make delivery available in a switched-off zone.
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m, active: false);
        await harness.SeedOverrideAsync("KTN", 10m);

        var error = await Assert.ThrowsAsync<ApiException>(() => harness.QuoteAsync("KTN"));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("delivery_unavailable", error.Code);
    }

    [Fact]
    public async Task MissingZoneRate_BlocksCheckoutEvenWithAnEnabledOverride()
    {
        await using var harness = Harness.Create();
        await harness.SeedOverrideAsync("KTN", 10m);

        var error = await Assert.ThrowsAsync<ApiException>(() => harness.QuoteAsync("KTN"));

        Assert.Equal("delivery_unavailable", error.Code);
    }

    [Fact]
    public async Task ZeroFeeOverride_IsTreatedAndExplainedAsFreeDelivery()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);
        await harness.SeedOverrideAsync("KUL", 0m);

        var quote = await harness.QuoteAsync("KUL");

        Assert.Equal(0m, quote.DeliveryFee);
        Assert.True(quote.IsFreeDelivery);
        Assert.Equal("Free delivery for Kuala Lumpur.", quote.FreeDeliveryReason);
    }

    [Fact]
    public async Task OverrideThreshold_ReplacesTheZoneThreshold()
    {
        await using var harness = Harness.Create();
        // Zone would not qualify at this order value; the override threshold does.
        await harness.SeedZoneAsync("PEN", 8m, threshold: 500m);
        await harness.SeedOverrideAsync("KTN", 10m, threshold: 30m);

        var kelantan = await harness.QuoteAsync("KTN");

        Assert.Equal(0m, kelantan.DeliveryFee);
        Assert.Equal(30m, kelantan.FreeDeliveryThreshold);
        Assert.Contains("RM 30.00", kelantan.FreeDeliveryReason!);
    }

    [Fact]
    public async Task OverrideWithoutThreshold_DoesNotInheritTheZoneThreshold()
    {
        // The override replaces both values, so a null override threshold means
        // this state has no free-delivery threshold at all.
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m, threshold: 10m);
        await harness.SeedOverrideAsync("KTN", 12m);

        var kelantan = await harness.QuoteAsync("KTN");
        var johor = await harness.QuoteAsync("JHR");

        Assert.Equal(12m, kelantan.DeliveryFee);
        Assert.Null(kelantan.FreeDeliveryThreshold);
        // The zone threshold still applies everywhere else.
        Assert.Equal(0m, johor.DeliveryFee);
        Assert.Equal(10m, johor.FreeDeliveryThreshold);
    }

    [Fact]
    public async Task ZoneOnlyConfiguration_RemainsBackwardCompatible()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("SBH", 15m);

        var quote = await harness.QuoteAsync("SBH");

        Assert.Equal(15m, quote.DeliveryFee);
        Assert.False(quote.StateOverrideApplied);
        Assert.Equal(DeliveryRateSources.ZoneDefaultLabel, quote.RateSource);
    }

    // --- Validation ---------------------------------------------------------

    [Fact]
    public async Task UnknownState_IsRejected()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.SaveStateOverrideAsync(
                AdminId, "PEN", new UpsertDeliveryStateOverrideRequest("ZZZ", 10m, null, true, null)));

        Assert.Equal(400, error.StatusCode);
    }

    [Fact]
    public async Task StateFromAnotherZone_IsRejectedWithAFriendlyMessage()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.SaveStateOverrideAsync(
                AdminId, "PEN", new UpsertDeliveryStateOverrideRequest("SBH", 10m, null, true, null)));

        Assert.Equal(400, error.StatusCode);
        Assert.Contains(
            "Sabah delivery zone",
            string.Join(" ", error.Details!.Values.SelectMany(messages => messages)));
    }

    [Fact]
    public async Task NegativeFee_IsRejected()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.SaveStateOverrideAsync(
                AdminId, "PEN", new UpsertDeliveryStateOverrideRequest("KTN", -1m, null, true, null)));

        Assert.Contains("fee", error.Details!.Keys);
    }

    [Fact]
    public async Task NegativeThreshold_IsRejected()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.SaveStateOverrideAsync(
                AdminId, "PEN", new UpsertDeliveryStateOverrideRequest("KTN", 10m, -5m, true, null)));

        Assert.Contains("freeShippingThreshold", error.Details!.Keys);
    }

    [Fact]
    public async Task UnknownZone_IsRejected()
    {
        await using var harness = Harness.Create();

        await Assert.ThrowsAsync<ApiException>(() => harness.Service.ListStateRatesAsync("XXX"));
    }

    [Fact]
    public async Task EditingWithoutAConcurrencyToken_IsRejected()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);
        await harness.Service.SaveStateOverrideAsync(
            AdminId, "PEN", new UpsertDeliveryStateOverrideRequest("KTN", 10m, null, true, null));

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.SaveStateOverrideAsync(
                AdminId, "PEN", new UpsertDeliveryStateOverrideRequest("KTN", 11m, null, true, null)));

        Assert.Contains("concurrencyToken", error.Details!.Keys);
    }

    // --- Admin behaviour ----------------------------------------------------

    [Fact]
    public async Task EffectiveRates_AreReportedPerStateForTheZone()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);
        await harness.SeedOverrideAsync("KTN", 10m);
        await harness.SeedOverrideAsync("TRG", 10m, enabled: false);

        var view = await harness.Service.ListStateRatesAsync("PEN");

        Assert.Equal(13, view.States.Count);
        Assert.Equal(1, view.EnabledOverrideCount);
        Assert.Equal(2, view.StoredOverrideCount);

        var kelantan = view.States.Single(state => state.StateCode == "KTN");
        Assert.Equal(10m, kelantan.EffectiveFee);
        Assert.Equal(8m, kelantan.ZoneDefaultFee);
        Assert.Equal(DeliveryRateSources.StateOverrideLabel, kelantan.Source);

        // Stored but disabled: the zone default is what customers get.
        var terengganu = view.States.Single(state => state.StateCode == "TRG");
        Assert.Equal(8m, terengganu.EffectiveFee);
        Assert.True(terengganu.HasOverride);
        Assert.False(terengganu.OverrideEnabled);
        Assert.Equal(DeliveryRateSources.ZoneDefaultLabel, terengganu.Source);

        var johor = view.States.Single(state => state.StateCode == "JHR");
        Assert.False(johor.HasOverride);
        Assert.Equal(8m, johor.EffectiveFee);
    }

    [Fact]
    public async Task RemovingAnOverride_ReturnsTheStateToTheZoneDefault()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);
        await harness.SeedOverrideAsync("KTN", 10m);
        Assert.Equal(10m, (await harness.QuoteAsync("KTN")).DeliveryFee);

        await harness.Service.RemoveStateOverrideAsync(AdminId, "PEN", "KTN");

        var kelantan = await harness.QuoteAsync("KTN");
        Assert.Equal(8m, kelantan.DeliveryFee);
        Assert.False(kelantan.StateOverrideApplied);
        Assert.Empty(await harness.Db.DeliveryStateRateOverrides.ToListAsync());
    }

    [Fact]
    public async Task RemovingAMissingOverride_ReportsNotFound()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.RemoveStateOverrideAsync(AdminId, "PEN", "KTN"));

        Assert.Equal(404, error.StatusCode);
    }

    [Fact]
    public async Task OverrideChanges_AreAudited()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);

        await harness.Service.SaveStateOverrideAsync(
            AdminId, "PEN", new UpsertDeliveryStateOverrideRequest("KTN", 10m, null, true, null));
        var token = await harness.StampRowVersionAsync("KTN");
        await harness.Service.SaveStateOverrideAsync(
            AdminId, "PEN", new UpsertDeliveryStateOverrideRequest("KTN", 12m, null, true, token));
        await harness.Service.RemoveStateOverrideAsync(AdminId, "PEN", "KTN");

        var actions = await harness.Db.AuditLogs.Select(log => log.Action).ToListAsync();
        Assert.Contains("delivery-state-override.create", actions);
        Assert.Contains("delivery-state-override.update", actions);
        Assert.Contains("delivery-state-override.remove", actions);
        Assert.All(
            await harness.Db.AuditLogs.ToListAsync(),
            log =>
            {
                Assert.Equal(AdminId, log.ActorId);
                Assert.Equal("DeliveryStateRateOverride", log.Entity);
            });
    }

    [Fact]
    public async Task DisablingAnOverride_IsAuditedAndKeepsTheStoredRow()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);
        await harness.Service.SaveStateOverrideAsync(
            AdminId, "PEN", new UpsertDeliveryStateOverrideRequest("KTN", 10m, null, true, null));
        var token = await harness.StampRowVersionAsync("KTN");

        await harness.Service.SaveStateOverrideAsync(
            AdminId, "PEN", new UpsertDeliveryStateOverrideRequest("KTN", 10m, null, false, token));

        Assert.Single(await harness.Db.DeliveryStateRateOverrides.ToListAsync());
        Assert.Contains(
            "delivery-state-override.disable",
            await harness.Db.AuditLogs.Select(log => log.Action).ToListAsync());
        Assert.Equal(8m, (await harness.QuoteAsync("KTN")).DeliveryFee);
    }

    [Fact]
    public async Task AliasStateCode_ResolvesToTheCanonicalState()
    {
        await using var harness = Harness.Create();
        await harness.SeedZoneAsync("PEN", 8m);

        await harness.Service.SaveStateOverrideAsync(
            AdminId, "PEN", new UpsertDeliveryStateOverrideRequest("Penang", 9m, null, true, null));

        var stored = Assert.Single(await harness.Db.DeliveryStateRateOverrides.ToListAsync());
        Assert.Equal("PNG", stored.StateCode);
        Assert.Equal(9m, (await harness.QuoteAsync("PNG")).DeliveryFee);
    }

    private sealed class Harness : IAsyncDisposable, IDisposable
    {
        private Harness(MyPetLinkDbContext db, DeliveryService service, string variantKey)
        {
            Db = db;
            Service = service;
            VariantKey = variantKey;
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
                TagProduct = product,
                PublicKey = "OVERRIDEQUOTE001",
                Sku = "OVERRIDE-1",
                DisplayName = "Tag",
                SupportsQr = true,
                TagVariant = "Standard",
                BasePrice = 40m,
                Currency = "MYR",
                IsActive = true,
                IsPurchasable = true
            };
            db.AddRange(product, variant);
            db.SaveChanges();
            var audit = new AuditLogService(db, new HttpContextAccessor());
            return new Harness(
                db,
                new DeliveryService(db, new TagPricingService(db), audit),
                variant.PublicKey);
        }

        public async Task SeedZoneAsync(
            string zone,
            decimal fee,
            decimal? threshold = null,
            bool active = true)
        {
            Db.DeliveryRates.Add(new DeliveryRate
            {
                Name = DeliveryLabels.CustomerMethodFor(zone),
                ZoneCode = zone,
                ApplicableStateCodesJson = "[]",
                Fee = fee,
                Currency = "MYR",
                FreeShippingThreshold = threshold,
                IsActive = active
            });
            await Db.SaveChangesAsync();
        }

        public async Task SeedOverrideAsync(
            string stateCode,
            decimal fee,
            decimal? threshold = null,
            bool enabled = true)
        {
            Db.DeliveryStateRateOverrides.Add(new DeliveryStateRateOverride
            {
                StateCode = stateCode,
                Fee = fee,
                Currency = "MYR",
                FreeShippingThreshold = threshold,
                IsEnabled = enabled
            });
            await Db.SaveChangesAsync();
        }

        /// <summary>
        /// The in-memory provider never populates a rowversion, so tests that
        /// exercise the concurrency-guarded edit path stamp one first. SQL
        /// Server does this automatically.
        /// </summary>
        public async Task<string> StampRowVersionAsync(string stateCode)
        {
            var stored = await Db.DeliveryStateRateOverrides
                .SingleAsync(item => item.StateCode == stateCode);
            stored.RowVersion = [1, 2, 3, 4];
            await Db.SaveChangesAsync();
            return Convert.ToBase64String(stored.RowVersion);
        }

        public Task<DeliveryQuoteResponse> QuoteAsync(string stateCode) =>
            Service.QuoteAsync(new DeliveryQuoteRequest(stateCode, VariantKey, 1));

        public void Dispose() => Db.Dispose();

        public async ValueTask DisposeAsync() => await Db.DisposeAsync();
    }
}
