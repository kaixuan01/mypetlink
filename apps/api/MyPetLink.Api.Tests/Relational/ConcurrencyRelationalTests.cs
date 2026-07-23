using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

// Concurrency guards that only a real relational database can prove: SQL Server
// rowversion tokens (catalog edits, inventory allocation), the ExecuteUpdate
// affected-row/timestamp guard (Smart Tag assignment), and the idempotency
// unique constraint (order creation). These run on SQL Server LocalDB and skip
// when none is available — see RelationalDatabaseFixture for how to run them.
public sealed class ConcurrencyRelationalTests
{
    private static readonly Guid AdminId = Guid.Parse("a1111111-1111-1111-1111-111111111111");
    private static readonly Guid OwnerId = Guid.Parse("a2222222-2222-2222-2222-222222222222");
    private static readonly Guid PetId = Guid.Parse("a3333333-3333-3333-3333-333333333333");

    [RelationalFact]
    public async Task CatalogEdit_WithStaleConcurrencyToken_Returns409_AndKeepsNewerData()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid productId;
        string staleToken;

        await using (var seed = scope.NewContext())
        {
            SeedAdmin(seed);
            var product = new TagProduct { Name = "Original", Slug = "original", SortOrder = 0 };
            seed.TagProducts.Add(product);
            await seed.SaveChangesAsync();
            productId = product.Id;
            staleToken = Convert.ToBase64String(product.RowVersion);
        }

        // Context A saves first with the current token (bumps the rowversion).
        await using (var contextA = scope.NewContext())
        {
            var serviceA = CatalogService(contextA);
            var currentToken = (await serviceA.GetAdminAsync(productId)).ConcurrencyToken;
            await serviceA.UpdateProductAsync(AdminId, productId,
                new UpsertTagProductRequest("Updated by A", "original", null, null, false, 1, [], currentToken));
        }

        // Context B saves with the now-stale token → 409, and A's data survives.
        await using (var contextB = scope.NewContext())
        {
            var serviceB = CatalogService(contextB);
            var conflict = await Assert.ThrowsAsync<ApiException>(() =>
                serviceB.UpdateProductAsync(AdminId, productId,
                    new UpsertTagProductRequest("Updated by B", "original", null, null, false, 2, [], staleToken)));
            Assert.Equal(StatusCodes.Status409Conflict, conflict.StatusCode);
            Assert.Equal("concurrency_conflict", conflict.Code);
        }

        await using (var verify = scope.NewContext())
        {
            var product = await verify.TagProducts.SingleAsync(item => item.Id == productId);
            Assert.Equal("Updated by A", product.Name);
            Assert.Equal(1, product.SortOrder);
        }
    }

    [RelationalFact]
    public async Task InventoryAllocation_FromTwoContexts_AllocatesOnce_AndSecondGets409()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid firstOrderId;
        Guid secondOrderId;
        Guid tagId;

        await using (var seed = scope.NewContext())
        {
            SeedAdmin(seed);
            SeedOwnerAndPet(seed);
            var (product, variant) = SeedProductWithVariant(seed);
            var tag = new SmartTag
            {
                TagCode = "MPL-REL-0001",
                ProductVariant = variant,
                HasNfc = variant.SupportsNfc,
                Variant = variant.TagVariant,
                Status = SmartTagStatus.Unclaimed,
                FulfilmentStatus = TagFulfilmentStatus.Generated,
            };
            var first = ConfirmedOrder(variant, "ORD-REL-1");
            var second = ConfirmedOrder(variant, "ORD-REL-2");
            seed.AddRange(product, variant, tag, first, second);
            await seed.SaveChangesAsync();
            tagId = tag.Id;
            firstOrderId = first.Id;
            secondOrderId = second.Id;
        }

        await using var contextA = scope.NewContext();
        await using var contextB = scope.NewContext();
        var adminA = AdminService(contextA);
        var adminB = AdminService(contextB);

        // Both admins target the same tag against different orders; only one wins.
        var results = await Task.WhenAll(
            Capture(() => adminA.AssignInventoryTagAsync(AdminId, firstOrderId, tagId)),
            Capture(() => adminB.AssignInventoryTagAsync(AdminId, secondOrderId, tagId)));

        var successes = results.Count(result => result.Error is null);
        var conflicts = results.Count(result => result.Error is ApiException api && api.StatusCode == StatusCodes.Status409Conflict);
        Assert.Equal(1, successes);
        Assert.Equal(1, conflicts);

        await using var verify = scope.NewContext();
        var allocatedTag = await verify.SmartTags.SingleAsync(item => item.Id == tagId);
        Assert.NotNull(allocatedTag.OrderId);
        var ordersWithTag = await verify.TagOrders.CountAsync(order => order.SmartTagId == tagId);
        Assert.Equal(1, ordersWithTag);
    }

    [RelationalFact]
    public async Task SmartTagAssignment_WithStaleTimestamp_HitsTheAffectedRowGuard()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid tagId;
        DateTimeOffset staleTimestamp;

        await using (var seed = scope.NewContext())
        {
            SeedAdmin(seed);
            SeedOwnerAndPet(seed);
            var (product, variant) = SeedProductWithVariant(seed);
            var tag = new SmartTag
            {
                TagCode = "MPL-REL-0002",
                ProductVariant = variant,
                HasNfc = variant.SupportsNfc,
                Variant = variant.TagVariant,
                Status = SmartTagStatus.Unclaimed,
                FulfilmentStatus = TagFulfilmentStatus.Generated,
            };
            seed.AddRange(product, variant, tag);
            await seed.SaveChangesAsync();
            tagId = tag.Id;
            staleTimestamp = tag.UpdatedAt;
        }

        // A first claim advances UpdatedAt, invalidating the captured timestamp.
        await using (var first = scope.NewContext())
        {
            await SmartTagService(first).ClaimAsync(AdminId, tagId, new AdminSmartTagClaimRequest
            {
                OwnerUserId = OwnerId,
                PetId = PetId,
                ExpectedUpdatedAt = staleTimestamp,
            });
        }

        // A second op using the stale timestamp matches zero rows → conflict.
        await using (var second = scope.NewContext())
        {
            var conflict = await Assert.ThrowsAsync<ApiException>(() =>
                SmartTagService(second).AssignPetAsync(AdminId, tagId, new AdminSmartTagAssignPetRequest
                {
                    PetId = PetId,
                    ExpectedUpdatedAt = staleTimestamp,
                }));
            Assert.Equal(StatusCodes.Status409Conflict, conflict.StatusCode);
        }
    }

    [RelationalFact]
    public async Task OrderCreation_ConcurrentDuplicateKey_CreatesExactlyOneOrder()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        string variantKey;

        await using (var seed = scope.NewContext())
        {
            SeedOwnerAndPet(seed);
            var (product, variant) = SeedProductWithVariant(seed);
            var tag = new SmartTag
            {
                TagCode = "MPL-REL-0003",
                ProductVariant = variant,
                HasNfc = variant.SupportsNfc,
                Variant = variant.TagVariant,
                Status = SmartTagStatus.Unclaimed,
                FulfilmentStatus = TagFulfilmentStatus.Generated,
            };
            seed.AddRange(product, variant, tag);
            await seed.SaveChangesAsync();
            variantKey = variant.PublicKey;
        }

        CreateTagOrderRequest Request() => new(
            PetId, variantKey, 1,
            new DeliveryDetailsRequest("Aina", "+60123456789", "1 Jalan Pet", null, "50000", "Kuala Lumpur", "WP", null),
            null, "concurrent-attempt");

        await using var contextA = scope.NewContext();
        await using var contextB = scope.NewContext();

        var results = await Task.WhenAll(
            Capture(() => OrderService(contextA).CreateAsync(OwnerId, Request())),
            Capture(() => OrderService(contextB).CreateAsync(OwnerId, Request())));

        // Both requests succeed (the loser replays the winner's order), and only
        // one order row exists.
        Assert.All(results, result => Assert.Null(result.Error));
        await using var verify = scope.NewContext();
        Assert.Equal(1, await verify.TagOrders.CountAsync(order => order.OwnerUserId == OwnerId));
    }

    // --- Seed + service helpers -------------------------------------------------------

    private static TagCatalogService CatalogService(MyPetLinkDbContext db) => new(
        db, new AuditLogService(db, new HttpContextAccessor()), new TagPricingService(db),
        Options.Create(new Storage.CloudflareR2Options()));

    private static AdminService AdminService(MyPetLinkDbContext db) => new(
        db, new AuditLogService(db, new HttpContextAccessor()), Options.Create(new FeatureOptions()));

    private static AdminSmartTagService SmartTagService(MyPetLinkDbContext db) => new(
        db, new AuditLogService(db, new HttpContextAccessor()));

    private static OrderService OrderService(MyPetLinkDbContext db) => new(
        db, Options.Create(new FeatureOptions { SmartTagOrderingEnabled = true }), new TagPricingService(db));

    private static void SeedAdmin(MyPetLinkDbContext db)
    {
        db.Users.Add(new User
        {
            Id = AdminId,
            Email = "admin@example.com",
            NormalizedEmail = "ADMIN@EXAMPLE.COM",
            DisplayName = "Admin",
            Status = UserStatus.Active,
            AdminUser = new AdminUser { UserId = AdminId, Role = AdminRole.Admin, IsActive = true },
        });
    }

    private static void SeedOwnerAndPet(MyPetLinkDbContext db)
    {
        var owner = new User
        {
            Id = OwnerId,
            Email = "owner@example.com",
            NormalizedEmail = "OWNER@EXAMPLE.COM",
            DisplayName = "Owner",
            Status = UserStatus.Active,
        };
        db.Users.Add(owner);
        db.Pets.Add(new Pet
        {
            Id = PetId,
            OwnerUserId = OwnerId,
            Slug = "milo-p123",
            Name = "Milo",
            Species = "Dog",
            LifecycleStatus = PetLifecycleStatus.Active,
        });
    }

    private static (TagProduct Product, TagProductVariant Variant) SeedProductWithVariant(MyPetLinkDbContext db)
    {
        var product = new TagProduct
        {
            Name = "MyPetLink Smart Tag",
            Slug = "mypetlink-smart-tag",
            ShortDescription = "A safer way home.",
            IsPublished = true,
        };
        var variant = new TagProductVariant
        {
            TagProduct = product,
            PublicKey = "RELVARIANT000001",
            Sku = "MPL-REL-V1",
            DisplayName = "Standard",
            SupportsQr = true,
            SupportsNfc = false,
            TagVariant = "Standard",
            BasePrice = 29.90m,
            Currency = "MYR",
            IsActive = true,
            IsPurchasable = true,
        };
        return (product, variant);
    }

    private static TagOrder ConfirmedOrder(TagProductVariant variant, string orderNumber) => new()
    {
        OrderNumber = orderNumber,
        OwnerUserId = OwnerId,
        PetId = PetId,
        TagType = TagType.QrPetTag,
        Variant = variant.TagVariant,
        Amount = 29.90m,
        Currency = "MYR",
        Status = OrderStatus.PaymentConfirmed,
        PaymentStatus = PaymentStatus.Confirmed,
        RecipientName = "Aina",
        DeliveryPhoneE164 = "+60123456789",
        AddressLine1 = "1 Jalan Pet",
        Postcode = "50000",
        City = "Kuala Lumpur",
        State = "WP",
        Items =
        {
            new TagOrderItem
            {
                ProductVariant = variant,
                SkuSnapshot = variant.Sku,
                ProductNameSnapshot = "MyPetLink Smart Tag",
                VariantNameSnapshot = variant.DisplayName,
                UnitBasePrice = 29.90m,
                Quantity = 1,
                Subtotal = 29.90m,
                FinalUnitPrice = 29.90m,
                FinalAmount = 29.90m,
                Currency = "MYR",
            },
        },
    };

    [RelationalFact]
    public async Task ConcurrentTagScans_DoNotFailTheFinderPage_AndRecordEveryScan()
    {
        await using var scope = await RelationalDatabase.CreateAsync();

        await using (var seed = scope.NewContext())
        {
            SeedOwnerAndPet(seed);
            var (product, variant) = SeedProductWithVariant(seed);
            seed.AddRange(product, variant, new SmartTag
            {
                TagCode = "MPL-REL-SCAN",
                ProductVariant = variant,
                HasNfc = variant.SupportsNfc,
                Variant = variant.TagVariant,
                Status = SmartTagStatus.Active,
                FulfilmentStatus = TagFulfilmentStatus.Generated,
                OwnerUserId = OwnerId,
                PetId = PetId,
                ActivatedAt = DateTimeOffset.UtcNow,
            });
            await seed.SaveChangesAsync();
        }

        // Two finders scanning at the same moment both touch the tag's
        // last-scanned stamp, which is guarded by a rowversion. The loser of
        // that race must still get the safety profile — never a 500.
        var options = Options.Create(new MyPetLink.Api.Storage.CloudflareR2Options());
        var context = new TagScanContext("127.0.0.1", null, "relational-test");

        await using var contextA = scope.NewContext();
        await using var contextB = scope.NewContext();
        var serviceA = new TagScanService(contextA, options);
        var serviceB = new TagScanService(contextB, options);

        var results = await Task.WhenAll(
            Capture(() => serviceA.ResolveAsync("MPL-REL-SCAN", context)),
            Capture(() => serviceB.ResolveAsync("MPL-REL-SCAN", context)));

        // The regression: the losing scan used to surface a
        // DbUpdateConcurrencyException as a 500 on the finder-facing page.
        Assert.All(results, result => Assert.Null(result.Error));
        Assert.All(results, result => Assert.Equal("MPL-REL-SCAN", result.Value!.TagCode));

        await using var verify = scope.NewContext();
        // Both scans are audited even though only one won the stamp race.
        Assert.Equal(2, await verify.TagScans.CountAsync(item => item.TagCode == "MPL-REL-SCAN"));
    }

    private static async Task<(TResult? Value, Exception? Error)> Capture<TResult>(Func<Task<TResult>> action)
    {
        try
        {
            return (await action(), null);
        }
        catch (Exception exception)
        {
            return (default, exception);
        }
    }
}
