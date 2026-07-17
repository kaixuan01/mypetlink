using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class AdminSmartTagServiceTests
{
    [Fact]
    public async Task List_SearchFiltersSortsAndPagesOnServerQuery()
    {
        using var harness = await Harness.CreateAsync();
        var (items, total) = await harness.Service.ListAsync(new AdminSmartTagQuery
        {
            Search = "owner@example.com", TagType = "QR_NFC", Claimed = true,
            SortBy = "tagCode", SortDir = "asc", PageSize = 1
        });

        Assert.Equal(3, total);
        Assert.Single(items);
        Assert.True(items.Single().HasNfc);
        Assert.Equal("MPL-ACTIVE-01", items.Single().TagCode);
    }

    [Fact]
    public async Task List_AwaitingActivationUsesRealPendingFamilyStatuses()
    {
        using var harness = await Harness.CreateAsync();
        var (items, _) = await harness.Service.ListAsync(new AdminSmartTagQuery { Status = "awaiting-activation", PageSize = 20 });
        Assert.Equal(3, items.Count);
        Assert.All(items, item => Assert.Contains(item.Status, new[] { SmartTagStatus.Pending, SmartTagStatus.Preparing, SmartTagStatus.Delivered }));
    }

    [Fact]
    public async Task Counts_RespectNonStatusFiltersAndKeepLostDisabledSeparate()
    {
        using var harness = await Harness.CreateAsync();
        var counts = await harness.Service.CountByStatusAsync(new AdminSmartTagQuery { TagType = "QR" });
        Assert.Equal(1, counts.Lost);
        Assert.Equal(1, counts.Disabled);
        Assert.Equal(0, counts.Active);
    }

    [Fact]
    public async Task List_RejectsUnsafeSortAndInvertedDates()
    {
        using var harness = await Harness.CreateAsync();
        await Assert.ThrowsAsync<ApiException>(() => harness.Service.ListAsync(new AdminSmartTagQuery { SortBy = "TagCode; DROP TABLE" }));
        await Assert.ThrowsAsync<ApiException>(() => harness.Service.ListAsync(new AdminSmartTagQuery
        {
            CreatedFrom = Harness.Now, CreatedTo = Harness.Now.AddDays(-1)
        }));
    }

    [Fact]
    public async Task ScanFiltersAndProjectionUseRecordedScans()
    {
        using var harness = await Harness.CreateAsync();
        var (items, total) = await harness.Service.ListAsync(new AdminSmartTagQuery { HasScans = true });
        Assert.Equal(1, total);
        Assert.Equal(2, items.Single().ScanCount);
    }

    [Fact]
    public async Task DisableAndArchiveValidateTransitionsAndWriteAudit()
    {
        using var harness = await Harness.CreateAsync();
        var active = await harness.Db.SmartTags.SingleAsync(tag => tag.Status == SmartTagStatus.Active);
        var updated = await harness.Service.UpdateStatusAsync(Harness.AdminId, active.Id, "disable", "Owner requested", default);
        Assert.Equal(SmartTagStatus.Disabled, updated.Status);
        Assert.Contains(await harness.Db.AuditLogs.ToListAsync(), log => log.Action == "smart-tags.disable");
        await Assert.ThrowsAsync<ApiException>(() => harness.Service.UpdateStatusAsync(Harness.AdminId, active.Id, "disable", null, default));
    }

    [Fact]
    public async Task BulkActionReturnsMixedFailuresWithoutChangingInvalidRows()
    {
        using var harness = await Harness.CreateAsync();
        var active = await harness.Db.SmartTags.SingleAsync(tag => tag.Status == SmartTagStatus.Active);
        var replaced = await harness.Db.SmartTags.SingleAsync(tag => tag.Status == SmartTagStatus.Replaced);
        var result = await harness.Service.BulkUpdateAsync(Harness.AdminId,
            new AdminSmartTagBulkActionRequest("archive", [active.Id, replaced.Id], "Cleanup"));
        Assert.Equal(1, result.UpdatedCount);
        Assert.Single(result.Failures);
        Assert.Equal(SmartTagStatus.Replaced, (await harness.Db.SmartTags.FindAsync(replaced.Id))!.Status);
    }

    [Fact]
    public async Task FilteredAndSelectedExportsContainAllMatchingRowsButNoInternalIds()
    {
        using var harness = await Harness.CreateAsync();
        var active = await harness.Db.SmartTags.SingleAsync(tag => tag.Status == SmartTagStatus.Active);
        var export = await harness.Service.ExportAsync(Harness.AdminId,
            new AdminSmartTagQuery { Claimed = true }, "csv", [active.Id]);
        var text = System.Text.Encoding.UTF8.GetString(export.Content);
        Assert.Contains("MPL-ACTIVE-01", text);
        Assert.DoesNotContain(active.Id.ToString(), text);
        Assert.DoesNotContain("PetId", text);
    }

    [Fact]
    public async Task MutationsRequireActiveAdmin()
    {
        using var harness = await Harness.CreateAsync();
        var tag = await harness.Db.SmartTags.FirstAsync();
        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Service.UpdateStatusAsync(Guid.NewGuid(), tag.Id, "archive", null));
        Assert.Equal(StatusCodes.Status403Forbidden, error.StatusCode);
    }

    private sealed class Harness : IDisposable
    {
        public static readonly Guid AdminId = Guid.Parse("71111111-1111-1111-1111-111111111111");
        private static readonly Guid OwnerId = Guid.Parse("72222222-2222-2222-2222-222222222222");
        public static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-07-17T04:00:00Z");
        public MyPetLinkDbContext Db { get; }
        public AdminSmartTagService Service { get; }

        private Harness(MyPetLinkDbContext db)
        {
            Db = db;
            Service = new AdminSmartTagService(db, new AuditLogService(db, new HttpContextAccessor()));
        }

        public static async Task<Harness> CreateAsync()
        {
            var db = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options);
            var admin = new User { Id = AdminId, Email = "admin@example.com", NormalizedEmail = "ADMIN@EXAMPLE.COM", DisplayName = "Admin", Status = UserStatus.Active,
                AdminUser = new AdminUser { UserId = AdminId, Role = AdminRole.Admin, IsActive = true } };
            var owner = new User { Id = OwnerId, Email = "owner@example.com", NormalizedEmail = "OWNER@EXAMPLE.COM", DisplayName = "Aina Owner", Status = UserStatus.Active };
            var pet = new Pet { OwnerUserId = OwnerId, OwnerUser = owner, Slug = "topu-code", Name = "Topu", Species = "Cat",
                SafetySetting = new PetSafetySetting { SafetyCode = "safe-topu", QrSafetyEnabled = true } };
            var tags = new[]
            {
                Tag("MPL-ACTIVE-01", SmartTagStatus.Active, true, pet, owner, Now.AddDays(-8), Now.AddDays(-5)),
                Tag("MPL-PENDING-01", SmartTagStatus.Pending, true, pet, owner, Now.AddDays(-7)),
                Tag("MPL-PREPARE-01", SmartTagStatus.Preparing, true, null, null, Now.AddDays(-6)),
                Tag("MPL-DELIVER-01", SmartTagStatus.Delivered, true, pet, owner, Now.AddDays(-5)),
                Tag("MPL-LOST-01", SmartTagStatus.Lost, false, pet, owner, Now.AddDays(-4)),
                Tag("MPL-DISABLED-01", SmartTagStatus.Disabled, false, pet, owner, Now.AddDays(-3)),
                Tag("MPL-REPLACED-01", SmartTagStatus.Replaced, false, pet, owner, Now.AddDays(-2)),
                Tag("MPL-ARCHIVE-01", SmartTagStatus.Archived, false, pet, owner, Now.AddDays(-1), archived: true),
                Tag("MPL-UNCLAIMED-01", SmartTagStatus.Unclaimed, false, null, null, Now),
            };
            db.Users.AddRange(admin, owner);
            db.Pets.Add(pet);
            db.SmartTags.AddRange(tags);
            await db.SaveChangesAsync();
            var active = tags[0];
            db.TagScans.AddRange(
                new TagScan { SmartTagId = active.Id, TagCode = active.TagCode, ScanTime = Now.AddDays(-2) },
                new TagScan { SmartTagId = active.Id, TagCode = active.TagCode, ScanTime = Now.AddDays(-1) });
            await db.SaveChangesAsync();
            return new Harness(db);
        }

        private static SmartTag Tag(string code, SmartTagStatus status, bool nfc, Pet? pet, User? owner, DateTimeOffset created, DateTimeOffset? activated = null, bool archived = false)
            => new() { TagCode = code, Status = status, HasNfc = nfc, Variant = nfc ? "Lightweight" : "Standard",
                Pet = pet, PetId = pet?.Id, OwnerUser = owner, OwnerUserId = owner?.Id, CreatedAt = created, UpdatedAt = created,
                ActivatedAt = activated, LastScannedAt = code == "MPL-ACTIVE-01" ? Now.AddDays(-1) : null,
                ArchivedAt = archived ? Now : null };

        public void Dispose() => Db.Dispose();
    }
}
