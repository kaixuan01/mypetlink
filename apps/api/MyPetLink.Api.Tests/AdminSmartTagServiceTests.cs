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

    [Fact]
    public async Task Claim_AssignsOwnerAndPetWithoutActivatingOrChangingTagCode()
    {
        using var harness = await Harness.CreateAsync();
        var tag = await harness.Db.SmartTags.SingleAsync(item => item.Status == SmartTagStatus.Unclaimed);
        var pet = await harness.Db.Pets.SingleAsync(item => item.Name == "Topu");
        var code = tag.TagCode;

        var updated = await harness.Service.ClaimAsync(Harness.AdminId, tag.Id, new AdminSmartTagClaimRequest
        {
            OwnerUserId = pet.OwnerUserId, PetId = pet.Id, ExpectedUpdatedAt = tag.UpdatedAt, Reason = "Support claim"
        });

        Assert.Equal(code, updated.TagCode);
        Assert.Equal(SmartTagStatus.Pending, updated.Status);
        Assert.Equal(pet.OwnerUserId, updated.OwnerUserId);
        Assert.Equal(pet.Id, updated.PetId);
        Assert.Null(updated.ActivatedAt);
        Assert.Contains(await harness.Db.AuditLogs.ToListAsync(), log => log.Action == "smart-tags.owner-and-pet-assigned");
    }

    [Fact]
    public async Task SameOwnerPetReassignment_PreservesActiveLifecycleAndActivation()
    {
        using var harness = await Harness.CreateAsync();
        var tag = await harness.Db.SmartTags.SingleAsync(item => item.Status == SmartTagStatus.Active);
        var pet = await harness.Db.Pets.SingleAsync(item => item.Name == "Luna");
        var activatedAt = tag.ActivatedAt;

        var updated = await harness.Service.AssignPetAsync(Harness.AdminId, tag.Id, new AdminSmartTagAssignPetRequest
        {
            PetId = pet.Id, ExpectedUpdatedAt = tag.UpdatedAt, Reason = "Correct pet"
        });

        Assert.Equal(pet.Id, updated.PetId);
        Assert.Equal(SmartTagStatus.Active, updated.Status);
        Assert.Equal(activatedAt, updated.ActivatedAt);
        Assert.Contains(await harness.Db.AuditLogs.ToListAsync(), log => log.Action == "smart-tags.pet-reassigned");
    }

    [Fact]
    public async Task AssignPet_RejectsPetFromAnotherOwnerAndArchivedPet()
    {
        using var harness = await Harness.CreateAsync();
        var tag = await harness.Db.SmartTags.SingleAsync(item => item.Status == SmartTagStatus.Active);
        var otherOwnerPet = await harness.Db.Pets.SingleAsync(item => item.Name == "Pepper");
        var archivedPet = await harness.Db.Pets.SingleAsync(item => item.Name == "Archived pet");

        var wrongOwner = await Assert.ThrowsAsync<ApiException>(() => harness.Service.AssignPetAsync(Harness.AdminId, tag.Id,
            new AdminSmartTagAssignPetRequest { PetId = otherOwnerPet.Id, ExpectedUpdatedAt = tag.UpdatedAt }));
        Assert.Equal(StatusCodes.Status400BadRequest, wrongOwner.StatusCode);

        var archived = await Assert.ThrowsAsync<ApiException>(() => harness.Service.AssignPetAsync(Harness.AdminId, tag.Id,
            new AdminSmartTagAssignPetRequest { PetId = archivedPet.Id, ExpectedUpdatedAt = tag.UpdatedAt }));
        Assert.Equal(StatusCodes.Status400BadRequest, archived.StatusCode);
    }

    [Fact]
    public async Task UnassignPet_PreservesOwnerLifecycleAndPhysicalIdentity()
    {
        using var harness = await Harness.CreateAsync();
        var tag = await harness.Db.SmartTags.SingleAsync(item => item.Status == SmartTagStatus.Active);
        var ownerId = tag.OwnerUserId;
        var code = tag.TagCode;

        var updated = await harness.Service.UnassignPetAsync(Harness.AdminId, tag.Id, new AdminSmartTagUnassignPetRequest
        {
            ExpectedUpdatedAt = tag.UpdatedAt, Reason = "Owner is choosing a new pet"
        });

        Assert.Equal(ownerId, updated.OwnerUserId);
        Assert.Null(updated.PetId);
        Assert.Equal(SmartTagStatus.Active, updated.Status);
        Assert.Equal(code, updated.TagCode);
        Assert.Contains(await harness.Db.AuditLogs.ToListAsync(), log => log.Action == "smart-tags.pet-unassigned");
    }

    [Fact]
    public async Task ClaimedOwnerOnlyTag_CanReceiveAnotherPetWithoutChangingLifecycle()
    {
        using var harness = await Harness.CreateAsync();
        var tag = await harness.Db.SmartTags.SingleAsync(item => item.Status == SmartTagStatus.Pending);
        var luna = await harness.Db.Pets.SingleAsync(item => item.Name == "Luna");
        var ownerId = tag.OwnerUserId;
        var unassigned = await harness.Service.UnassignPetAsync(Harness.AdminId, tag.Id,
            new AdminSmartTagUnassignPetRequest { ExpectedUpdatedAt = tag.UpdatedAt });

        var reassigned = await harness.Service.AssignPetAsync(Harness.AdminId, tag.Id,
            new AdminSmartTagAssignPetRequest { PetId = luna.Id, ExpectedUpdatedAt = unassigned.UpdatedAt });

        Assert.Equal(ownerId, reassigned.OwnerUserId);
        Assert.Equal(luna.Id, reassigned.PetId);
        Assert.Equal(SmartTagStatus.Pending, reassigned.Status);
    }

    [Fact]
    public async Task TransferOwnership_IsSeparateAuditedOperationAndRequiresNewOwnerActivation()
    {
        using var harness = await Harness.CreateAsync();
        var tag = await harness.Db.SmartTags.SingleAsync(item => item.Status == SmartTagStatus.Active);
        var pet = await harness.Db.Pets.SingleAsync(item => item.Name == "Pepper");
        var oldOwner = tag.OwnerUserId;

        var updated = await harness.Service.TransferOwnershipAsync(Harness.AdminId, tag.Id, new AdminSmartTagTransferRequest
        {
            NewOwnerUserId = pet.OwnerUserId, NewPetId = pet.Id,
            ExpectedUpdatedAt = tag.UpdatedAt, Reason = "Verified ownership transfer"
        });

        Assert.NotEqual(oldOwner, updated.OwnerUserId);
        Assert.Equal(pet.OwnerUserId, updated.OwnerUserId);
        Assert.Equal(pet.Id, updated.PetId);
        Assert.Equal(SmartTagStatus.Pending, updated.Status);
        Assert.Null(updated.ActivatedAt);
        Assert.Contains(await harness.Db.AuditLogs.ToListAsync(), log => log.Action == "smart-tags.ownership-transferred");

        var ownerService = new SmartTagService(harness.Db, new AuditLogService(harness.Db, new HttpContextAccessor()));
        await Assert.ThrowsAsync<ApiException>(() => ownerService.GetAsync(oldOwner, tag.Id));
        Assert.Equal(tag.Id, (await ownerService.GetAsync(pet.OwnerUserId, tag.Id)).Id);
    }

    [Fact]
    public async Task Assignment_RejectsReadOnlyLifecycleAndStaleVersion()
    {
        using var harness = await Harness.CreateAsync();
        var pet = await harness.Db.Pets.SingleAsync(item => item.Name == "Luna");
        var replaced = await harness.Db.SmartTags.SingleAsync(item => item.Status == SmartTagStatus.Replaced);
        var active = await harness.Db.SmartTags.SingleAsync(item => item.Status == SmartTagStatus.Active);
        var lost = await harness.Db.SmartTags.SingleAsync(item => item.Status == SmartTagStatus.Lost);

        var readOnly = await Assert.ThrowsAsync<ApiException>(() => harness.Service.AssignPetAsync(Harness.AdminId, replaced.Id,
            new AdminSmartTagAssignPetRequest { PetId = pet.Id, ExpectedUpdatedAt = replaced.UpdatedAt }));
        Assert.Equal(StatusCodes.Status422UnprocessableEntity, readOnly.StatusCode);

        var unresolved = await Assert.ThrowsAsync<ApiException>(() => harness.Service.AssignPetAsync(Harness.AdminId, lost.Id,
            new AdminSmartTagAssignPetRequest { PetId = pet.Id, ExpectedUpdatedAt = lost.UpdatedAt }));
        Assert.Equal(StatusCodes.Status422UnprocessableEntity, unresolved.StatusCode);

        var conflict = await Assert.ThrowsAsync<ApiException>(() => harness.Service.AssignPetAsync(Harness.AdminId, active.Id,
            new AdminSmartTagAssignPetRequest { PetId = pet.Id, ExpectedUpdatedAt = active.UpdatedAt.AddSeconds(-1) }));
        Assert.Equal(StatusCodes.Status409Conflict, conflict.StatusCode);
        Assert.Equal("tag_changed", conflict.Code);
    }

    [Fact]
    public async Task Reactivate_RequiresBindingAndRestoresResolvedTagState()
    {
        using var harness = await Harness.CreateAsync();
        var lost = await harness.Db.SmartTags.SingleAsync(item => item.Status == SmartTagStatus.Lost);
        var updated = await harness.Service.UpdateStatusAsync(Harness.AdminId, lost.Id, "reactivate", "Tag recovered");
        Assert.Equal(SmartTagStatus.Delivered, updated.Status);
        Assert.Contains(await harness.Db.AuditLogs.ToListAsync(), log => log.Action == "smart-tags.reactivate");
    }

    [Fact]
    public async Task ScanHistory_IsAdminOnlyOrderedAndDoesNotExposeNetworkIdentifiers()
    {
        using var harness = await Harness.CreateAsync();
        var tag = await harness.Db.SmartTags.SingleAsync(item => item.Status == SmartTagStatus.Active);
        var scans = await harness.Service.ListScansAsync(Harness.AdminId, tag.Id);
        Assert.Equal(2, scans.Count);
        Assert.True(scans.First().ScannedAt >= scans.Last().ScannedAt);

        var forbidden = await Assert.ThrowsAsync<ApiException>(() => harness.Service.ListScansAsync(Guid.NewGuid(), tag.Id));
        Assert.Equal(StatusCodes.Status403Forbidden, forbidden.StatusCode);
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
            var secondPet = new Pet { OwnerUserId = OwnerId, OwnerUser = owner, Slug = "luna-code", Name = "Luna", Species = "Dog" };
            var archivedPet = new Pet { OwnerUserId = OwnerId, OwnerUser = owner, Slug = "archived-code", Name = "Archived pet", Species = "Cat", LifecycleStatus = PetLifecycleStatus.Archived };
            var secondOwner = new User { Email = "second@example.com", NormalizedEmail = "SECOND@EXAMPLE.COM", DisplayName = "Second Owner", Status = UserStatus.Active };
            var otherOwnerPet = new Pet { OwnerUserId = secondOwner.Id, OwnerUser = secondOwner, Slug = "pepper-code", Name = "Pepper", Species = "Dog" };
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
            db.Users.AddRange(admin, owner, secondOwner);
            db.Pets.AddRange(pet, secondPet, archivedPet, otherOwnerPet);
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
