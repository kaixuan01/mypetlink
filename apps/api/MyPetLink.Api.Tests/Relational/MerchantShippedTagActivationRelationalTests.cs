using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// A tag sold to a merchant still has to reach a pet owner. These tests prove
/// the merchant never becomes the owner, and that the ordinary scan-and-activate
/// journey works unchanged on stock that has passed through a merchant order.
/// </summary>
public sealed class MerchantShippedTagActivationRelationalTests
{
    private static readonly Guid FinalOwnerPetId =
        Guid.Parse("f6000000-0000-0000-0000-000000000001");

    private static async Task<(string QrCode, string NfcCode)> ShipToMerchantAsync(
        Data.MyPetLinkDbContext db)
    {
        await SeedAsync(db);
        var service = Service(db);
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        await service.MarkShippedAsync(
            AdminAccountId, OrderId,
            new MarkMerchantOrderShippedRequest(null, "Test Courier", null, "TRK-9001", null, null));

        db.Pets.Add(new Pet
        {
            Id = FinalOwnerPetId,
            OwnerUserId = OwnerAccountId,
            Slug = "buddy-final01",
            Name = "Buddy",
            Species = "Dog",
            LifecycleStatus = PetLifecycleStatus.Active,
            CreatedAt = Now,
            UpdatedAt = Now,
        });
        await db.SaveChangesAsync();

        var allocations = await db.MerchantOrderAllocatedTags
            .AsNoTracking()
            .Include(allocation => allocation.SmartTag)
            .ToListAsync();

        return (
            allocations.First(a => a.SmartTag!.HasNfc == false).TagCodeSnapshot,
            allocations.First(a => a.SmartTag!.HasNfc).TagCodeSnapshot);
    }

    [RelationalFact]
    public async Task AShippedMerchantTagCarriesNoOwnerAndNoPet()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await ShipToMerchantAsync(db);

        var shipped = await db.SmartTags
            .AsNoTracking()
            .Where(tag => db.MerchantOrderAllocatedTags.Any(a => a.SmartTagId == tag.Id))
            .ToListAsync();

        Assert.Equal(14, shipped.Count);
        Assert.All(shipped, tag =>
        {
            // The merchant is a reseller, never the pet owner.
            Assert.Null(tag.OwnerUserId);
            Assert.Null(tag.PetId);
            Assert.Null(tag.ActivatedAt);
            Assert.Equal(SmartTagStatus.Unclaimed, tag.Status);
            Assert.Equal(TagFulfilmentStatus.SentToReseller, tag.FulfilmentStatus);
        });
    }

    [RelationalFact]
    public async Task TheFinalOwnerCanStillActivateAMerchantShippedQrTag()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var (qrCode, _) = await ShipToMerchantAsync(db);
        var tags = new SmartTagService(db, new AuditLogService(db, new HttpContextAccessor()));

        var activated = await tags.ActivateAsync(
            OwnerAccountId, qrCode, new ActivateTagRequest(FinalOwnerPetId));

        Assert.Equal(SmartTagStatus.Active, activated.Status);

        var stored = await db.SmartTags.AsNoTracking().SingleAsync(tag => tag.TagCode == qrCode);
        Assert.Equal(OwnerAccountId, stored.OwnerUserId);
        Assert.Equal(FinalOwnerPetId, stored.PetId);
        Assert.NotNull(stored.ActivatedAt);
        // The merchant history survives activation.
        Assert.Equal(TagFulfilmentStatus.SentToReseller, stored.FulfilmentStatus);
        Assert.True(await db.MerchantOrderAllocatedTags.AnyAsync(a => a.SmartTagId == stored.Id));
    }

    [RelationalFact]
    public async Task TheFinalOwnerCanStillActivateAMerchantShippedNfcTag()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var (_, nfcCode) = await ShipToMerchantAsync(db);
        var tags = new SmartTagService(db, new AuditLogService(db, new HttpContextAccessor()));

        // A QR+NFC tag follows the same QR-first activation as any other.
        var activated = await tags.ActivateAsync(
            OwnerAccountId, nfcCode, new ActivateTagRequest(FinalOwnerPetId));

        Assert.Equal(SmartTagStatus.Active, activated.Status);
        var stored = await db.SmartTags.AsNoTracking().SingleAsync(tag => tag.TagCode == nfcCode);
        Assert.True(stored.HasNfc);
        Assert.Equal(OwnerAccountId, stored.OwnerUserId);
    }

    [RelationalFact]
    public async Task AnotherAccountCannotActivateOrReadAMerchantShippedTag()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var (qrCode, _) = await ShipToMerchantAsync(db);
        var tags = new SmartTagService(db, new AuditLogService(db, new HttpContextAccessor()));

        await tags.ActivateAsync(OwnerAccountId, qrCode, new ActivateTagRequest(FinalOwnerPetId));

        // A second account, with its own pet, must not be able to take it over.
        var intruderId = Guid.NewGuid();
        var intruderPetId = Guid.NewGuid();
        db.Users.Add(new User
        {
            Id = intruderId,
            Email = "intruder@example.com",
            NormalizedEmail = "INTRUDER@EXAMPLE.COM",
            DisplayName = "Intruder",
            Status = UserStatus.Active,
            CreatedAt = Now,
            UpdatedAt = Now,
        });
        db.Pets.Add(new Pet
        {
            Id = intruderPetId,
            OwnerUserId = intruderId,
            Slug = "rex-intru01",
            Name = "Rex",
            Species = "Dog",
            LifecycleStatus = PetLifecycleStatus.Active,
            CreatedAt = Now,
            UpdatedAt = Now,
        });
        await db.SaveChangesAsync();

        var failure = await Assert.ThrowsAsync<ApiException>(() => tags.ActivateAsync(
            intruderId, qrCode, new ActivateTagRequest(intruderPetId)));

        Assert.True(failure.StatusCode is 403 or 404 or 409, $"status was {failure.StatusCode}");

        var stored = await db.SmartTags.AsNoTracking().SingleAsync(tag => tag.TagCode == qrCode);
        Assert.Equal(OwnerAccountId, stored.OwnerUserId);
        Assert.Equal(FinalOwnerPetId, stored.PetId);
    }

    [RelationalFact]
    public async Task AnAllocatedButUnshippedTagIsStillActivatable()
    {
        // Allocation reserves stock; it does not disable the physical tag. If a
        // unit is scanned before shipment the owner journey must still work.
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await Service(db).AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 2));

        db.Pets.Add(new Pet
        {
            Id = FinalOwnerPetId,
            OwnerUserId = OwnerAccountId,
            Slug = "buddy-final02",
            Name = "Buddy",
            Species = "Dog",
            LifecycleStatus = PetLifecycleStatus.Active,
            CreatedAt = Now,
            UpdatedAt = Now,
        });
        await db.SaveChangesAsync();

        var code = await db.MerchantOrderAllocatedTags
            .Select(allocation => allocation.TagCodeSnapshot).FirstAsync();
        var tags = new SmartTagService(db, new AuditLogService(db, new HttpContextAccessor()));

        var activated = await tags.ActivateAsync(
            OwnerAccountId, code, new ActivateTagRequest(FinalOwnerPetId));

        Assert.Equal(SmartTagStatus.Active, activated.Status);
    }
}
