using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class SmartTagScanHistoryEntitlementTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-11T03:00:00Z");

    [Fact]
    public async Task FreeOwner_GetsBasicActivityButCannotRetrieveFullHistory()
    {
        await using var db = CreateDb();
        var owner = OwnerWithPlan("free-owner@example.com", "Free", 0);
        var tag = TagFor(owner, "MPL-FREE-ACTIVITY");
        tag.LastScannedAt = Now.AddHours(-1);
        db.AddRange(owner.OwnerProfile!.Plan, owner, tag);
        db.TagScans.AddRange(
            Scan(tag, TagScanSource.Qr, Now.AddDays(-2)),
            Scan(tag, TagScanSource.Nfc, Now.AddHours(-1)),
            Scan(tag, TagScanSource.Legacy, Now.AddDays(-40)));
        await db.SaveChangesAsync();
        var service = Service(db);

        var (tags, total) = await service.ListAsync(owner.Id, 1, 20, null, null, null);

        var activity = Assert.Single(tags);
        Assert.Equal(1, total);
        Assert.Equal(TagScanSource.Nfc, activity.LastScanSource);
        Assert.Equal(1, activity.QrScansLast30Days);
        Assert.Equal(1, activity.NfcTapsLast30Days);

        var forbidden = await Assert.ThrowsAsync<ApiException>(
            () => service.ListScansAsync(owner.Id, tag.Id, null));
        Assert.Equal(StatusCodes.Status403Forbidden, forbidden.StatusCode);
        Assert.Equal("premium_feature_required", forbidden.Code);
    }

    [Fact]
    public async Task AnotherOwner_CannotDiscoverOrRetrieveTagHistory()
    {
        await using var db = CreateDb();
        var owner = OwnerWithPlan("premium-owner@example.com", "Premium", 365);
        var otherOwner = OwnerWithPlan("other-owner@example.com", "PremiumOther", 365);
        var tag = TagFor(owner, "MPL-PRIVATE-HISTORY");
        db.AddRange(owner.OwnerProfile!.Plan, otherOwner.OwnerProfile!.Plan, owner, otherOwner, tag);
        db.TagScans.Add(Scan(tag, TagScanSource.Qr, Now));
        await db.SaveChangesAsync();
        var service = Service(db);

        var notFound = await Assert.ThrowsAsync<ApiException>(
            () => service.ListScansAsync(otherOwner.Id, tag.Id, null));

        Assert.Equal(StatusCodes.Status404NotFound, notFound.StatusCode);
    }

    [Fact]
    public async Task PremiumOwner_HistoryIsFilteredPaginatedAndLimitedToEntitlementWindow()
    {
        await using var db = CreateDb();
        var owner = OwnerWithPlan("premium-history@example.com", "Premium", 365);
        var tag = TagFor(owner, "MPL-PAGED-HISTORY");
        db.AddRange(owner.OwnerProfile!.Plan, owner, tag);

        for (var index = 0; index < 45; index += 1)
        {
            var scan = Scan(
                tag,
                index % 2 == 0 ? TagScanSource.Qr : TagScanSource.Nfc,
                Now.AddMinutes(-index));
            if (index == 0)
            {
                scan.City = "Kuala Lumpur";
                scan.Country = "Malaysia";
                scan.DeviceType = "Phone";
            }
            db.TagScans.Add(scan);
        }

        db.TagScans.AddRange(
            Scan(tag, TagScanSource.Legacy, Now.AddDays(-3)),
            Scan(tag, TagScanSource.Unknown, Now.AddDays(-4)),
            Scan(tag, TagScanSource.Qr, Now.AddDays(-366)));
        await db.SaveChangesAsync();
        var service = Service(db);

        var first = await service.ListScansAsync(owner.Id, tag.Id, null, 1, 20);
        var third = await service.ListScansAsync(owner.Id, tag.Id, null, 3, 20);
        var qr = await service.ListScansAsync(owner.Id, tag.Id, "qr", 1, 100);
        var beyondEnd = await service.ListScansAsync(owner.Id, tag.Id, null, int.MaxValue, 100);

        Assert.Equal(47, first.Total);
        Assert.Equal(20, first.Items.Count);
        Assert.True(first.HasMore);
        Assert.Equal(7, third.Items.Count);
        Assert.False(third.HasMore);
        Assert.Empty(beyondEnd.Items);
        Assert.False(beyondEnd.HasMore);
        Assert.Equal(23, qr.Total);
        Assert.All(qr.Items, item => Assert.Equal(TagScanSource.Qr, item.ScanSource));
        Assert.Equal(23, first.QrScans);
        Assert.Equal(22, first.NfcTaps);
        Assert.Equal(2, first.LegacyOrUnknown);
        Assert.All(first.Items, item =>
        {
            Assert.Null(item.City);
            Assert.Null(item.Country);
            Assert.Null(item.DeviceType);
        });
        Assert.Contains(first.Items.Concat(third.Items), item =>
            item.ScanSource is TagScanSource.Qr or TagScanSource.Nfc);

        var legacy = await service.ListScansAsync(owner.Id, tag.Id, "legacy", 1, 20);
        Assert.Single(legacy.Items);
        Assert.Equal(TagScanSource.Legacy, legacy.Items.Single().ScanSource);
    }

    private static MyPetLinkDbContext CreateDb() =>
        new(new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options);

    private static SmartTagService Service(MyPetLinkDbContext db) =>
        new(
            db,
            new AuditLogService(db, new HttpContextAccessor()),
            new FixedTimeProvider(Now));

    private static User OwnerWithPlan(string email, string planCode, int scanHistoryDays)
    {
        var owner = new User
        {
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = email.Split('@')[0],
            Status = UserStatus.Active
        };
        var plan = new Plan
        {
            Code = planCode,
            Name = $"{planCode} Plan",
            Limit = new PlanLimit { ScanHistoryDays = scanHistoryDays }
        };
        owner.OwnerProfile = new OwnerProfile
        {
            User = owner,
            UserId = owner.Id,
            Plan = plan,
            PlanId = plan.Id,
            OwnerDisplayName = owner.DisplayName
        };
        return owner;
    }

    private static SmartTag TagFor(User owner, string code) =>
        new()
        {
            TagCode = code,
            Status = SmartTagStatus.Active,
            HasNfc = true,
            Variant = "Standard",
            OwnerUser = owner,
            OwnerUserId = owner.Id,
            ActivatedAt = Now.AddMonths(-1)
        };

    private static TagScan Scan(SmartTag tag, TagScanSource source, DateTimeOffset at) =>
        new()
        {
            SmartTag = tag,
            SmartTagId = tag.Id,
            TagCode = tag.TagCode,
            Source = source,
            ResolvedState = TagScanResolvedState.Active,
            ScanTime = at
        };
}
