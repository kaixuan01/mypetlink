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

// Ownership transfer end to end: what the transfer writes, who can act on the
// tag afterwards, what a finder sees in between, and what must stay untouched.
//
// The core transfer assertions live in AdminSmartTagServiceTests. This file
// covers the parts a transfer is easy to get quietly wrong: activation rights
// moving with the tag, the finder-facing page staying closed until the NEW
// owner activates, and commerce state not moving at all.
public sealed class AdminSmartTagOwnershipTests
{
    [Fact]
    public async Task Transfer_RequiresAReason_AndRejectsTheCurrentOwnerAsTheTarget()
    {
        using var harness = await OwnershipHarness.CreateAsync();
        var tag = harness.Tag;

        // The Admin dialog marks this reason mandatory; the backend is the
        // authority for that and must agree.
        var noReason = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Admin.TransferOwnershipAsync(OwnershipHarness.AdminId, tag.Id, new AdminSmartTagTransferRequest
            {
                NewOwnerUserId = OwnershipHarness.OwnerBId,
                NewPetId = OwnershipHarness.PetBId,
                ExpectedUpdatedAt = tag.UpdatedAt,
            }));
        Assert.Equal(StatusCodes.Status400BadRequest, noReason.StatusCode);

        var sameOwner = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Admin.TransferOwnershipAsync(OwnershipHarness.AdminId, tag.Id, new AdminSmartTagTransferRequest
            {
                NewOwnerUserId = OwnershipHarness.OwnerAId,
                NewPetId = OwnershipHarness.PetA2Id,
                ExpectedUpdatedAt = tag.UpdatedAt,
                Reason = "Wrong action",
            }));
        Assert.Equal(StatusCodes.Status400BadRequest, sameOwner.StatusCode);

        var untouched = await harness.Db.SmartTags.AsNoTracking().SingleAsync(item => item.Id == tag.Id);
        Assert.Equal(OwnershipHarness.OwnerAId, untouched.OwnerUserId);
        Assert.Equal(OwnershipHarness.PetAId, untouched.PetId);
    }

    [Fact]
    public async Task Transfer_RejectsAPetThatBelongsToSomeoneOtherThanTheNewOwner()
    {
        using var harness = await OwnershipHarness.CreateAsync();
        var tag = harness.Tag;

        // Dropdown filtering is not security: the pet is checked against the
        // target owner on the server.
        var failure = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Admin.TransferOwnershipAsync(OwnershipHarness.AdminId, tag.Id, new AdminSmartTagTransferRequest
            {
                NewOwnerUserId = OwnershipHarness.OwnerBId,
                NewPetId = OwnershipHarness.PetAId,
                ExpectedUpdatedAt = tag.UpdatedAt,
                Reason = "Cross-owner attempt",
            }));
        Assert.Equal(StatusCodes.Status400BadRequest, failure.StatusCode);

        var untouched = await harness.Db.SmartTags.AsNoTracking().SingleAsync(item => item.Id == tag.Id);
        Assert.Equal(OwnershipHarness.OwnerAId, untouched.OwnerUserId);
        Assert.Equal(OwnershipHarness.PetAId, untouched.PetId);
        Assert.DoesNotContain(await harness.Db.AuditLogs.ToListAsync(), log => log.EntityId == tag.Id);
    }

    [Fact]
    public async Task Transfer_RequiresAnAdmin()
    {
        using var harness = await OwnershipHarness.CreateAsync();
        AdminSmartTagTransferRequest Request() => new()
        {
            NewOwnerUserId = OwnershipHarness.OwnerBId,
            NewPetId = OwnershipHarness.PetBId,
            ExpectedUpdatedAt = harness.Tag.UpdatedAt,
            Reason = "Verified request",
        };

        var anonymous = await Assert.ThrowsAsync<ApiException>(
            () => harness.Admin.TransferOwnershipAsync(null, harness.Tag.Id, Request()));
        Assert.Equal(StatusCodes.Status401Unauthorized, anonymous.StatusCode);

        // The current owner of the tag is still not an admin.
        var nonAdmin = await Assert.ThrowsAsync<ApiException>(
            () => harness.Admin.TransferOwnershipAsync(OwnershipHarness.OwnerAId, harness.Tag.Id, Request()));
        Assert.Equal(StatusCodes.Status403Forbidden, nonAdmin.StatusCode);
    }

    [Fact]
    public async Task Transfer_MovesActivationRightsToTheNewOwner()
    {
        using var harness = await OwnershipHarness.CreateAsync();
        await harness.ActivateAsOwnerAAsync();

        await harness.TransferToOwnerBAsync();

        // Owner A held an activated tag a moment ago and must lose every route
        // back to it, including re-activation.
        var oldOwner = await Assert.ThrowsAsync<ApiException>(
            () => harness.Owner.ActivateAsync(OwnershipHarness.OwnerAId, OwnershipHarness.TagCode, new ActivateTagRequest(null)));
        Assert.Equal(StatusCodes.Status404NotFound, oldOwner.StatusCode);

        var activated = await harness.Owner.ActivateAsync(
            OwnershipHarness.OwnerBId, OwnershipHarness.TagCode, new ActivateTagRequest(null));
        Assert.Equal(SmartTagStatus.Active, activated.Status);

        var stored = await harness.Db.SmartTags.AsNoTracking().SingleAsync(item => item.Id == harness.Tag.Id);
        Assert.Equal(OwnershipHarness.OwnerBId, stored.OwnerUserId);
        Assert.Equal(OwnershipHarness.PetBId, stored.PetId);
        Assert.Equal(SmartTagStatus.Active, stored.Status);
        Assert.NotNull(stored.ActivatedAt);
    }

    [Fact]
    public async Task Transfer_KeepsTheFinderPageClosedUntilTheNewOwnerActivates()
    {
        using var harness = await OwnershipHarness.CreateAsync();
        await harness.ActivateAsOwnerAAsync();

        var beforeTransfer = await harness.Scan.ResolveAsync(
            OwnershipHarness.TagCode, TagScanSource.Qr, ScanContext());
        Assert.Equal("active", beforeTransfer.State);
        Assert.NotNull(beforeTransfer.Profile);

        await harness.TransferToOwnerBAsync();

        // The window that matters: transferred, not yet activated. Neither the
        // previous owner's contact nor the new owner's may be reachable.
        var afterTransfer = await harness.Scan.ResolveAsync(
            OwnershipHarness.TagCode, TagScanSource.Qr, ScanContext());
        Assert.Equal("pending", afterTransfer.State);
        Assert.Null(afterTransfer.Profile);

        var afterNfc = await harness.Scan.ResolveAsync(
            OwnershipHarness.TagCode, TagScanSource.Nfc, ScanContext());
        Assert.Equal("nfcActivationRequired", afterNfc.State);
        Assert.Null(afterNfc.Profile);

        await harness.Owner.ActivateAsync(
            OwnershipHarness.OwnerBId, OwnershipHarness.TagCode, new ActivateTagRequest(null));

        var afterActivation = await harness.Scan.ResolveAsync(
            OwnershipHarness.TagCode, TagScanSource.Qr, ScanContext());
        Assert.Equal("active", afterActivation.State);
        Assert.NotNull(afterActivation.Profile);
        Assert.Equal("Pepper", afterActivation.Profile!.Name);
        Assert.Equal("safe-pepper", afterActivation.Profile.SafetyCode);
    }

    [Fact]
    public async Task OwnershipOperations_DoNotTouchOrdersInventoryOrCommissions()
    {
        using var harness = await OwnershipHarness.CreateAsync();

        await harness.TransferToOwnerBAsync();

        Assert.Empty(await harness.Db.TagOrders.ToListAsync());
        Assert.Empty(await harness.Db.TagOrderItems.ToListAsync());
        Assert.Empty(await harness.Db.PaymentProofs.ToListAsync());
        Assert.Empty(await harness.Db.SalesCommissions.ToListAsync());
        Assert.Empty(await harness.Db.InventoryReceipts.ToListAsync());
        Assert.Empty(await harness.Db.EmailOutbox.ToListAsync());

        // The only rows an ownership change writes are the tag and its audit.
        var audits = await harness.Db.AuditLogs.ToListAsync();
        Assert.All(audits, entry => Assert.Equal("SmartTag", entry.Entity));
    }

    private static TagScanContext ScanContext() => new(null, null, null);

    private sealed class OwnershipHarness : IDisposable
    {
        public const string TagCode = "MPL-OWN-0001";
        public static readonly Guid AdminId = Guid.Parse("c1111111-1111-1111-1111-111111111111");
        public static readonly Guid OwnerAId = Guid.Parse("c2222222-2222-2222-2222-222222222222");
        public static readonly Guid PetAId = Guid.Parse("c3333333-3333-3333-3333-333333333333");
        public static readonly Guid PetA2Id = Guid.Parse("c4444444-4444-4444-4444-444444444444");
        public static readonly Guid OwnerBId = Guid.Parse("c5555555-5555-5555-5555-555555555555");
        public static readonly Guid PetBId = Guid.Parse("c6666666-6666-6666-6666-666666666666");

        public MyPetLinkDbContext Db { get; }
        public AdminSmartTagService Admin { get; }
        public SmartTagService Owner { get; }
        public TagScanService Scan { get; }
        public SmartTag Tag { get; private set; } = null!;

        private OwnershipHarness(MyPetLinkDbContext db)
        {
            Db = db;
            var audit = new AuditLogService(db, new HttpContextAccessor());
            Admin = new AdminSmartTagService(db, audit);
            Owner = new SmartTagService(db, audit);
            Scan = new TagScanService(db, Options.Create(new CloudflareR2Options()));
        }

        public static async Task<OwnershipHarness> CreateAsync()
        {
            var db = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options);

            db.Users.Add(new User
            {
                Id = AdminId, Email = "admin@example.com", NormalizedEmail = "ADMIN@EXAMPLE.COM",
                DisplayName = "Admin", Status = UserStatus.Active,
                AdminUser = new AdminUser { UserId = AdminId, Role = AdminRole.Admin, IsActive = true },
            });
            var ownerA = new User
            {
                Id = OwnerAId, Email = "a@example.com", NormalizedEmail = "A@EXAMPLE.COM",
                DisplayName = "MyPetLink", Status = UserStatus.Active,
            };
            var ownerB = new User
            {
                Id = OwnerBId, Email = "b@example.com", NormalizedEmail = "B@EXAMPLE.COM",
                DisplayName = "GBB Software Solutions", Status = UserStatus.Active,
            };
            db.Users.AddRange(ownerA, ownerB);

            var petA = SafetyPet(PetAId, ownerA, "linko-c1", "Linko", "safe-linko");
            var petA2 = SafetyPet(PetA2Id, ownerA, "milo-c2", "Milo", "safe-milo");
            var petB = SafetyPet(PetBId, ownerB, "pepper-c3", "Pepper", "safe-pepper");
            db.Pets.AddRange(petA, petA2, petB);

            var tag = new SmartTag
            {
                TagCode = TagCode,
                Status = SmartTagStatus.Pending,
                HasNfc = true,
                Variant = "Standard",
                OwnerUser = ownerA,
                OwnerUserId = OwnerAId,
                Pet = petA,
                PetId = PetAId,
            };
            db.SmartTags.Add(tag);
            await db.SaveChangesAsync();

            var harness = new OwnershipHarness(db) { Tag = tag };
            return harness;
        }

        private static Pet SafetyPet(Guid id, User owner, string slug, string name, string safetyCode) => new()
        {
            Id = id,
            OwnerUserId = owner.Id,
            OwnerUser = owner,
            Slug = slug,
            Name = name,
            Species = "Dog",
            LifecycleStatus = PetLifecycleStatus.Active,
            SafetySetting = new PetSafetySetting { SafetyCode = safetyCode, QrSafetyEnabled = true },
        };

        public async Task ActivateAsOwnerAAsync()
        {
            await Owner.ActivateAsync(OwnerAId, TagCode, new ActivateTagRequest(null));
            await ReloadTagAsync();
        }

        public async Task TransferToOwnerBAsync()
        {
            // Re-read first: any write to the tag stamps UpdatedAt, and that is
            // the token the assignment guard compares against.
            await ReloadTagAsync();
            await Admin.TransferOwnershipAsync(AdminId, Tag.Id, new AdminSmartTagTransferRequest
            {
                NewOwnerUserId = OwnerBId,
                NewPetId = PetBId,
                ExpectedUpdatedAt = Tag.UpdatedAt,
                Reason = "Verified ownership transfer",
            });
            await ReloadTagAsync();
        }

        private async Task ReloadTagAsync()
        {
            Tag = await Db.SmartTags.AsNoTracking().SingleAsync(item => item.TagCode == TagCode);
        }

        public void Dispose() => Db.Dispose();
    }
}
