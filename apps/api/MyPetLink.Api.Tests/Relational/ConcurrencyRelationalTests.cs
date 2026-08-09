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

    /// <summary>
    /// Two administrators racing for the same physical tag. Which typed refusal
    /// the loser receives depends on where its read falls relative to the
    /// winner's commit, and the database gives no ordering guarantee:
    ///
    ///   * reads before the winner commits → the tag still looks unclaimed, so
    ///     the loser proceeds to save and the rowversion token rejects it:
    ///     409 inventory_allocation_conflict.
    ///   * reads after the winner commits → the tag is already linked to an
    ///     order, so the eligibility precondition refuses it up front:
    ///     422 invalid_state.
    ///
    /// Both are deliberate, typed, admin-readable refusals, so the test asserts
    /// the invariant that actually matters — one winner, one live allocation,
    /// no raw database exception — rather than one arbitrary interleaving.
    /// </summary>
    [RelationalFact]
    public async Task InventoryAllocation_FromTwoContexts_AllocatesOnce_AndSecondIsRefusedTyped()
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

        var diagnostics = string.Join(" | ", results.Select(result =>
            result.Error is null
                ? "success"
                : $"{result.Error.GetType().Name}({(result.Error as ApiException)?.Code}): {result.Error.Message}"));

        var successes = results.Count(result => result.Error is null);
        Assert.True(successes == 1, $"Expected exactly one successful assignment. {diagnostics}");

        // The loser must be refused by name, not by whatever the database threw.
        var refusals = results.Where(result => result.Error is not null).ToArray();
        Assert.True(refusals.Length == 1, $"Expected exactly one refusal. {diagnostics}");

        var refusal = Assert.IsType<ApiException>(refusals[0].Error);
        Assert.True(
            AllowedAllocationRaceRefusals.Contains((refusal.StatusCode, refusal.Code)),
            $"The loser must receive an approved typed refusal. {diagnostics}");
        Assert.False(string.IsNullOrWhiteSpace(refusal.Message));

        // A raw persistence failure reaching the caller would be a real defect.
        Assert.DoesNotContain("DbUpdate", refusal.Message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("SqlException", refusal.Message, StringComparison.OrdinalIgnoreCase);

        await using var verify = scope.NewContext();
        var allocatedTag = await verify.SmartTags.SingleAsync(item => item.Id == tagId);
        Assert.NotNull(allocatedTag.OrderId);

        // Exactly one order holds the tag, and nothing partial was left behind.
        var ordersWithTag = await verify.TagOrders.CountAsync(order => order.SmartTagId == tagId);
        Assert.Equal(1, ordersWithTag);

        var loserOrderId = allocatedTag.OrderId == firstOrderId ? secondOrderId : firstOrderId;
        var loserOrder = await verify.TagOrders
            .Include(order => order.AssignedTags)
            .SingleAsync(order => order.Id == loserOrderId);
        Assert.Null(loserOrder.SmartTagId);
        Assert.Empty(loserOrder.AssignedTags);
    }

    /// <summary>
    /// The refusals an administrator may legitimately see when another
    /// administrator takes the same tag first. Anything outside this set is a
    /// defect, not a race.
    /// </summary>
    private static readonly (int Status, string Code)[] AllowedAllocationRaceRefusals =
    [
        (StatusCodes.Status409Conflict, "inventory_allocation_conflict"),
        (StatusCodes.Status422UnprocessableEntity, "invalid_state"),
    ];

    /// <summary>
    /// The serialized half of the race, pinned deterministically: the second
    /// administrator reads only after the first has committed, so the tag is
    /// visibly taken and the eligibility check refuses it before any write.
    /// </summary>
    [RelationalFact]
    public async Task InventoryAllocation_AfterAnotherAdminCommitted_IsRefusedAsIneligible()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var (firstOrderId, secondOrderId, tagId) = await SeedTwoOrdersCompetingForOneTagAsync(scope);

        await using (var contextA = scope.NewContext())
        {
            await AdminService(contextA).AssignInventoryTagAsync(AdminId, firstOrderId, tagId);
        }

        await using var contextB = scope.NewContext();
        var refusal = await Assert.ThrowsAsync<ApiException>(() =>
            AdminService(contextB).AssignInventoryTagAsync(AdminId, secondOrderId, tagId));

        Assert.Equal(StatusCodes.Status422UnprocessableEntity, refusal.StatusCode);
        Assert.Equal("invalid_state", refusal.Code);
        Assert.Equal(
            "Only unclaimed, available production inventory can be assigned to an order.",
            refusal.Message);

        await using var verify = scope.NewContext();
        Assert.Equal(1, await verify.TagOrders.CountAsync(order => order.SmartTagId == tagId));
    }

    /// <summary>
    /// The interleaved half of the race, pinned deterministically: the second
    /// administrator has already read the tag as unclaimed, so the eligibility
    /// check passes and only the rowversion token can stop the write.
    /// </summary>
    [RelationalFact]
    public async Task InventoryAllocation_WithATagReadBeforeTheWinnerCommitted_Returns409()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var (firstOrderId, secondOrderId, tagId) = await SeedTwoOrdersCompetingForOneTagAsync(scope);

        await using var contextB = scope.NewContext();
        // B reads the tag while it is genuinely still free. This tracked copy —
        // rowversion and all — is what B will later try to save.
        var seenAsFree = await contextB.SmartTags.SingleAsync(tag => tag.Id == tagId);
        Assert.Null(seenAsFree.OrderId);

        await using (var contextA = scope.NewContext())
        {
            await AdminService(contextA).AssignInventoryTagAsync(AdminId, firstOrderId, tagId);
        }

        var refusal = await Assert.ThrowsAsync<ApiException>(() =>
            AdminService(contextB).AssignInventoryTagAsync(AdminId, secondOrderId, tagId));

        Assert.Equal(StatusCodes.Status409Conflict, refusal.StatusCode);
        Assert.Equal("inventory_allocation_conflict", refusal.Code);
        Assert.DoesNotContain("DbUpdate", refusal.Message, StringComparison.OrdinalIgnoreCase);

        await using var verify = scope.NewContext();
        Assert.Equal(1, await verify.TagOrders.CountAsync(order => order.SmartTagId == tagId));
        var loser = await verify.TagOrders.SingleAsync(order => order.Id == secondOrderId);
        Assert.Null(loser.SmartTagId);
    }

    private static async Task<(Guid FirstOrderId, Guid SecondOrderId, Guid TagId)>
        SeedTwoOrdersCompetingForOneTagAsync(RelationalScope scope)
    {
        await using var seed = scope.NewContext();
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
        var first = ConfirmedOrder(variant, "ORD-REL-A");
        var second = ConfirmedOrder(variant, "ORD-REL-B");
        seed.AddRange(product, variant, tag, first, second);
        await seed.SaveChangesAsync();
        return (first.Id, second.Id, tag.Id);
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
            seed.DeliveryRates.Add(new DeliveryRate
            {
                Name = "Peninsular Standard Delivery",
                ZoneCode = "PEN",
                ApplicableStateCodesJson = "[\"KUL\"]",
                Fee = 0m,
                Currency = "MYR",
                IsActive = true
            });
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
            seed.DeliveryRates.Add(new DeliveryRate
            {
                Name = "Peninsular Standard Delivery",
                ZoneCode = "PEN",
                ApplicableStateCodesJson = "[\"KUL\"]",
                Fee = 0m,
                Currency = "MYR",
                IsActive = true
            });
            await seed.SaveChangesAsync();
            variantKey = variant.PublicKey;
        }

        CreateTagOrderRequest Request() => new(
            PetId, variantKey, 1,
            new DeliveryDetailsRequest("Aina", "+60123456789", "1 Jalan Pet", null, "50000", "Kuala Lumpur", "KUL", null),
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
        db, Options.Create(new FeatureOptions { SmartTagOrderingEnabled = true }), new TagPricingService(db),
        new DeliveryService(db, new TagPricingService(db), new AuditLogService(db, new HttpContextAccessor())));

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
            Capture(() => serviceA.ResolveAsync("MPL-REL-SCAN", TagScanSource.Qr, context)),
            Capture(() => serviceB.ResolveAsync("MPL-REL-SCAN", TagScanSource.Nfc, context)));

        // The regression: the losing scan used to surface a
        // DbUpdateConcurrencyException as a 500 on the finder-facing page.
        Assert.All(results, result => Assert.Null(result.Error));
        Assert.All(results, result => Assert.Equal("MPL-REL-SCAN", result.Value!.TagCode));

        await using var verify = scope.NewContext();
        // Both scans are audited even though only one won the stamp race.
        Assert.Equal(2, await verify.TagScans.CountAsync(item => item.TagCode == "MPL-REL-SCAN"));
        var sources = await verify.TagScans
            .Where(item => item.TagCode == "MPL-REL-SCAN")
            .Select(item => item.Source)
            .ToListAsync();
        Assert.Contains(TagScanSource.Qr, sources);
        Assert.Contains(TagScanSource.Nfc, sources);
    }

    [RelationalFact]
    public async Task OverlongScanCode_StillReturnsNotFound_InsteadOfFailingThePage()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var options = Options.Create(new MyPetLink.Api.Storage.CloudflareR2Options());
        var context = new TagScanContext("127.0.0.1", null, "relational-test");
        // /q serves both pet Safety Profiles and printed tag QRs, so any
        // mistyped or crawled value reaches tag resolution. The audit column
        // only holds 32 characters; a longer value used to abort the insert
        // and show finders an outage message instead of "not found".
        var overlong = new string('Z', 200);

        await using var scanContext = scope.NewContext();
        var service = new TagScanService(scanContext, options);
        var result = await service.ResolveAsync(overlong, TagScanSource.Qr, context);

        Assert.Equal("notFound", result.State);

        await using var verify = scope.NewContext();
        var recorded = await verify.TagScans.SingleAsync();
        Assert.Equal(new string('Z', 32), recorded.TagCode);
        Assert.Equal(TagScanSource.Qr, recorded.Source);
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
