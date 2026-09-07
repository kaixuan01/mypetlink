using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class OwnerReferralAttributionServiceTests
{
    [Fact]
    public async Task AdminCorrectionIsAuditedAndDoesNotRewriteExistingOrders()
    {
        await using var harness = await Harness.CreateAsync();
        var token = Convert.ToBase64String(harness.Attribution.RowVersion);

        var result = await harness.Service.CorrectAsync(
            Guid.NewGuid(), harness.User.Id,
            new CorrectOwnerReferralAttributionRequest(harness.Second.Id, token), default);

        Assert.Equal(harness.Second.Id, result.SalespersonId);
        Assert.Equal(ReferralAttributionSource.ManualAdmin, result.AttributionSource);
        Assert.Equal(harness.First.Id, harness.Order.SalespersonId);
        Assert.Equal("First Seller", harness.Order.SalespersonNameSnapshot);
        var audit = await harness.Db.AuditLogs.SingleAsync(
            item => item.Action == "owner-referral-attribution.correct");
        Assert.Contains(harness.First.Id.ToString(), audit.OldValue);
        Assert.Contains(harness.Second.Id.ToString(), audit.NewValue);
    }

    [Fact]
    public async Task AdminCannotCorrectToInactiveSalesperson()
    {
        await using var harness = await Harness.CreateAsync();
        harness.Second.IsActive = false;
        await harness.Db.SaveChangesAsync();
        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Service.CorrectAsync(
            null, harness.User.Id,
            new CorrectOwnerReferralAttributionRequest(
                harness.Second.Id, Convert.ToBase64String(harness.Attribution.RowVersion)), default));
        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task AdminCorrectionRejectsAStaleRowVersion()
    {
        await using var harness = await Harness.CreateAsync();
        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Service.CorrectAsync(
            null, harness.User.Id,
            new CorrectOwnerReferralAttributionRequest(
                harness.Second.Id, Convert.ToBase64String([9, 9, 9, 9])), default));
        Assert.Equal("concurrency_conflict", error.Code);
        Assert.Equal(harness.First.Id, harness.Attribution.SalespersonId);
    }

    private sealed class Harness : IAsyncDisposable
    {
        private Harness(MyPetLinkDbContext db, OwnerReferralAttributionService service,
            User user, Salesperson first, Salesperson second,
            OwnerReferralAttribution attribution, TagOrder order)
        {
            Db = db; Service = service; User = user; First = first; Second = second;
            Attribution = attribution; Order = order;
        }
        public MyPetLinkDbContext Db { get; }
        public OwnerReferralAttributionService Service { get; }
        public User User { get; }
        public Salesperson First { get; }
        public Salesperson Second { get; }
        public OwnerReferralAttribution Attribution { get; }
        public TagOrder Order { get; }

        public static async Task<Harness> CreateAsync()
        {
            var db = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options);
            var user = new User { Email = "owner@example.com", NormalizedEmail = "OWNER@EXAMPLE.COM", DisplayName = "Owner" };
            var pet = new Pet { OwnerUser = user, Name = "Milo", Slug = "milo-r1", Species = "Dog" };
            var first = new Salesperson { SalespersonCode = "MPL-SP-4001", ReferralCode = "FIRST", Name = "First Seller", IsActive = true };
            var second = new Salesperson { SalespersonCode = "MPL-SP-4002", ReferralCode = "SECOND", Name = "Second Seller", IsActive = true };
            var attribution = new OwnerReferralAttribution
            {
                User = user, Salesperson = first, ReferralCodeSnapshot = "FIRST",
                SalespersonCodeSnapshot = first.SalespersonCode, SalespersonNameSnapshot = first.Name,
                AttributionSource = ReferralAttributionSource.ReferralLink,
                CapturedAt = DateTimeOffset.UtcNow.AddDays(-1), AttributedAt = DateTimeOffset.UtcNow.AddDays(-1),
                RowVersion = [1]
            };
            var order = new TagOrder
            {
                OrderNumber = "MPL-ORD-REF-1", OwnerUser = user, Pet = pet,
                Salesperson = first, SalespersonCodeSnapshot = first.SalespersonCode,
                SalespersonNameSnapshot = first.Name, AttributionSource = ReferralAttributionSource.ReferralLink,
                AttributedAt = attribution.AttributedAt, RecipientName = "Owner",
                DeliveryPhoneE164 = "+60111111111", AddressLine1 = "1 Test",
                Postcode = "50000", City = "Kuala Lumpur", State = "Kuala Lumpur"
            };
            db.AddRange(user, pet, first, second, attribution, order);
            await db.SaveChangesAsync();
            var audit = new AuditLogService(db, new HttpContextAccessor());
            return new Harness(db, new OwnerReferralAttributionService(db, audit, TimeProvider.System),
                user, first, second, attribution, order);
        }

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
}
