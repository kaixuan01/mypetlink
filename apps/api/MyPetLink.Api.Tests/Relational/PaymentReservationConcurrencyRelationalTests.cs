using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using Xunit.Abstractions;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Live SQL Server proof of the five reservation races. These tests use
/// separate DbContexts/connections so sp_getapplock, rowversion and transaction
/// behavior are exercised by SQL Server rather than simulated in memory.
/// </summary>
public sealed class PaymentReservationConcurrencyRelationalTests
{
    private readonly ITestOutputHelper _output;

    public PaymentReservationConcurrencyRelationalTests(ITestOutputHelper output)
    {
        _output = output;
    }

    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-08-03T12:00:00Z");
    private static readonly Guid OwnerA = Guid.Parse("62000000-0000-0000-0000-000000000001");
    private static readonly Guid OwnerB = Guid.Parse("62000000-0000-0000-0000-000000000002");
    private static readonly Guid PetA = Guid.Parse("62000000-0000-0000-0000-000000000011");
    private static readonly Guid PetB = Guid.Parse("62000000-0000-0000-0000-000000000012");
    private static readonly Guid AdminId = Guid.Parse("62000000-0000-0000-0000-000000000003");

    [RelationalFact]
    public async Task RaceA_ExpiryVersusProofSubmission_HasOneWinnerAndNoPartialState()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var seeded = await SeedAsync(scope, withProof: false, deadline: Now);

        await using var expiryDb = scope.NewContext();
        await using var proofDb = scope.NewContext();
        var expiry = ExpiryService(expiryDb, Now);
        // The request reached the application one second before the deadline,
        // while the worker's due scan is already running at the deadline.
        var proof = OrderService(proofDb, Now.AddSeconds(-1));

        var outcomes = await Task.WhenAll(
            Capture(() => expiry.ExpireDueOrdersAsync(25)),
            Capture(() => proof.SubmitPaymentProofAsync(
                OwnerA,
                seeded.OrderNumber,
                new UploadPaymentProofRequest(
                    null, "receipt.png", "QR Payment", "RACE-A", null, 39.90m))));

        await using var verify = scope.NewContext();
        var order = await verify.TagOrders.SingleAsync(item => item.Id == seeded.OrderId);
        var expiryAudits = await verify.AuditLogs.CountAsync(item =>
            item.Action == PaymentReservationExpiryService.AuditAction);
        var proofs = await verify.PaymentProofs.CountAsync(item => item.OrderId == seeded.OrderId);
        var validProofWinner = order.Status == OrderStatus.PaymentProofSubmitted
            && order.PaymentStatus == PaymentStatus.ProofSubmitted
            && proofs == 1
            && expiryAudits == 0;
        var validExpiryWinner = order.Status == OrderStatus.Cancelled
            && order.PaymentReservationExpiredAt != null
            && proofs == 0
            && expiryAudits == 1;

        _output.WriteLine(
            $"Race A: status={order.Status}; payment={order.PaymentStatus}; proofs={proofs}; "
            + $"expiryAudits={expiryAudits}; outcomes={Describe(outcomes)}");

        Assert.True(validProofWinner || validExpiryWinner,
            $"status={order.Status}, payment={order.PaymentStatus}, proofs={proofs}, expiryAudits={expiryAudits}, outcomes={Describe(outcomes)}");
        Assert.False(order.PaymentStatus == PaymentStatus.ProofSubmitted && order.PaymentReservationExpiredAt != null);
    }

    [RelationalFact]
    public async Task RaceB_ExpiryVersusAdminApproval_ApprovedOrderNeverExpires()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var seeded = await SeedAsync(scope, withProof: true, deadline: Now.AddMinutes(-1));

        await using var expiryDb = scope.NewContext();
        await using var adminDb = scope.NewContext();
        var expiry = ExpiryService(expiryDb, Now);
        var admin = AdminService(adminDb, Now);

        var outcomes = await Task.WhenAll(
            Capture(() => expiry.ExpireDueOrdersAsync(25)),
            Capture(() => admin.ApprovePaymentProofAsync(
                AdminId, seeded.ProofId!.Value, default)));

        await using var verify = scope.NewContext();
        var order = await verify.TagOrders.SingleAsync(item => item.Id == seeded.OrderId);
        Assert.Equal(OrderStatus.PaymentConfirmed, order.Status);
        Assert.Equal(PaymentStatus.Confirmed, order.PaymentStatus);
        Assert.NotNull(order.PaymentConfirmedAt);
        Assert.Null(order.PaymentReservationExpiredAt);
        Assert.Equal(0, await verify.AuditLogs.CountAsync(item =>
            item.Action == PaymentReservationExpiryService.AuditAction));
        _output.WriteLine(
            $"Race B: status={order.Status}; payment={order.PaymentStatus}; "
            + $"expiredAt={order.PaymentReservationExpiredAt?.ToString("O") ?? "null"}; outcomes={Describe(outcomes)}");
        Assert.All(outcomes, outcome => Assert.Null(outcome.Error));
    }

    [RelationalFact]
    public async Task RaceC_ExpiryVersusOwnerCancellation_ReleasesOnceAndAuditsOneTransition()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var seeded = await SeedAsync(scope, withProof: false, deadline: Now.AddMinutes(-1));

        await using var expiryDb = scope.NewContext();
        await using var cancelDb = scope.NewContext();
        var outcomes = await Task.WhenAll(
            Capture(() => ExpiryService(expiryDb, Now).ExpireDueOrdersAsync(25)),
            Capture(() => OrderService(cancelDb, Now).CancelAsync(OwnerA, seeded.OrderNumber)));

        await using var verify = scope.NewContext();
        var order = await verify.TagOrders.SingleAsync(item => item.Id == seeded.OrderId);
        Assert.Equal(OrderStatus.Cancelled, order.Status);
        var transitions = await verify.AuditLogs.CountAsync(item =>
            item.EntityId == seeded.OrderId
            && (item.Action == PaymentReservationExpiryService.AuditAction
                || item.Action == "order.cancel-by-owner"));
        Assert.Equal(1, transitions);
        Assert.Equal(1, await new TagOrderInventoryAvailabilityService(verify)
            .GetAvailableUnitsAsync(seeded.VariantId));
        _output.WriteLine(
            $"Race C: status={order.Status}; transitionAudits={transitions}; availability=1; "
            + $"outcomes={Describe(outcomes)}");
        Assert.All(outcomes, outcome => Assert.Null(outcome.Error));
    }

    [RelationalFact]
    public async Task RaceD_TwoWorkerInstances_ExpireOnceAuditOnceReleaseOnce()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var seeded = await SeedAsync(scope, withProof: false, deadline: Now.AddMinutes(-1));
        await using var firstDb = scope.NewContext();
        await using var secondDb = scope.NewContext();

        var results = await Task.WhenAll(
            ExpiryService(firstDb, Now).ExpireDueOrdersAsync(25),
            ExpiryService(secondDb, Now).ExpireDueOrdersAsync(25));

        await using var verify = scope.NewContext();
        Assert.Equal(1, results.Sum());
        Assert.Equal(1, await verify.AuditLogs.CountAsync(item =>
            item.Action == PaymentReservationExpiryService.AuditAction));
        Assert.Equal(1, await new TagOrderInventoryAvailabilityService(verify)
            .GetAvailableUnitsAsync(seeded.VariantId));
        _output.WriteLine($"Race D: workerResults={string.Join(",", results)}; expiryAudits=1; availability=1");
    }

    [RelationalFact]
    public async Task RaceE_TwoOwnersCompetingForReleasedUnit_CannotOversell()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var seeded = await SeedAsync(scope, withProof: false, deadline: Now.AddMinutes(-1));
        await using (var expireDb = scope.NewContext())
        {
            Assert.Equal(1, await ExpiryService(expireDb, Now).ExpireDueOrdersAsync(25));
        }

        await using var ownerADb = scope.NewContext();
        await using var ownerBDb = scope.NewContext();
        var serviceA = OrderService(ownerADb, Now.AddMinutes(1));
        var serviceB = OrderService(ownerBDb, Now.AddMinutes(1));
        var outcomes = await Task.WhenAll(
            Capture(() => serviceA.CreateAsync(OwnerA, Request(PetA, seeded.VariantKey, "race-e-a"))),
            Capture(() => serviceB.CreateAsync(OwnerB, Request(PetB, seeded.VariantKey, "race-e-b"))));

        Assert.Equal(1, outcomes.Count(item => item.Error is null));
        Assert.Equal(1, outcomes.Count(item =>
            item.Error is ApiException api && api.Code == "out_of_stock"));
        await using var verify = scope.NewContext();
        Assert.Equal(1, await verify.TagOrders.CountAsync(item =>
            item.Status == OrderStatus.PendingPayment));
        Assert.Equal(0, await new TagOrderInventoryAvailabilityService(verify)
            .GetAvailableUnitsAsync(seeded.VariantId));
        _output.WriteLine(
            $"Race E: successes={outcomes.Count(item => item.Error is null)}; "
            + $"outOfStock={outcomes.Count(item => item.Error is ApiException api && api.Code == "out_of_stock")}; "
            + $"pendingReservations=1; availability=0; outcomes={Describe(outcomes)}");
    }

    [RelationalFact]
    public async Task CheckoutSettings_StaleRowVersionReturnsFriendlyConflict()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using (var seedDb = scope.NewContext())
        {
            seedDb.Users.Add(new User
            {
                Id = AdminId,
                Email = "settings-admin@example.test",
                NormalizedEmail = "SETTINGS-ADMIN@EXAMPLE.TEST",
                DisplayName = "Settings Admin",
                Status = UserStatus.Active,
                AdminUser = new AdminUser
                {
                    UserId = AdminId,
                    Role = AdminRole.Admin,
                    IsActive = true,
                },
            });
            await seedDb.SaveChangesAsync();
        }

        await using var firstDb = scope.NewContext();
        await using var staleDb = scope.NewContext();
        var first = SettingsService(firstDb);
        var stale = SettingsService(staleDb);
        var firstRead = await first.GetAsync();
        var staleRead = await stale.GetAsync();

        var saved = await first.UpdateAsync(
            AdminId, new UpdateOrderCheckoutSettingsRequest(180, firstRead.RowVersion));
        var conflict = await Assert.ThrowsAsync<ApiException>(() => stale.UpdateAsync(
            AdminId, new UpdateOrderCheckoutSettingsRequest(240, staleRead.RowVersion)));

        Assert.Equal(StatusCodes.Status409Conflict, conflict.StatusCode);
        Assert.Equal("concurrency_conflict", conflict.Code);
        Assert.Contains("another administrator", conflict.Message, StringComparison.OrdinalIgnoreCase);
        Assert.NotEqual(firstRead.RowVersion, saved.RowVersion);
        await using var verify = scope.NewContext();
        Assert.Equal(180, (await verify.OrderCheckoutSettings.SingleAsync()).PaymentReservationMinutes);
        Assert.Single(await verify.AuditLogs.Where(item =>
            item.Action == "order-checkout-settings.update").ToListAsync());
        _output.WriteLine("Settings concurrency: first save=180; stale save=409 concurrency_conflict; persisted=180; audits=1");
    }

    private static async Task<SeedResult> SeedAsync(
        RelationalScope scope,
        bool withProof,
        DateTimeOffset deadline)
    {
        await using var db = scope.NewContext();
        var admin = new User
        {
            Id = AdminId,
            Email = "admin@example.test",
            NormalizedEmail = "ADMIN@EXAMPLE.TEST",
            DisplayName = "Race Admin",
            Status = UserStatus.Active,
            AdminUser = new AdminUser { UserId = AdminId, Role = AdminRole.Admin, IsActive = true },
        };
        var ownerA = User(OwnerA, "owner-a@example.test", "Owner A");
        var ownerB = User(OwnerB, "owner-b@example.test", "Owner B");
        var petA = Pet(PetA, OwnerA, "Topu");
        var petB = Pet(PetB, OwnerB, "Milo");
        var product = new TagProduct
        {
            Name = "Race Tag",
            Slug = $"race-tag-{Guid.NewGuid():N}",
            ShortDescription = "SQL race stock",
            IsPublished = true,
        };
        var variant = new TagProductVariant
        {
            TagProduct = product,
            PublicKey = $"RACE{Guid.NewGuid():N}"[..16].ToUpperInvariant(),
            Sku = $"RACE-{Guid.NewGuid():N}"[..20].ToUpperInvariant(),
            DisplayName = "Standard QR",
            SupportsQr = true,
            SupportsNfc = false,
            TagVariant = "Standard",
            BasePrice = 39.90m,
            Currency = "MYR",
            IsActive = true,
            IsPurchasable = true,
        };
        var stock = new SmartTag
        {
            TagCode = $"MPL-{Guid.NewGuid():N}"[..13].ToUpperInvariant(),
            ProductVariant = variant,
            HasNfc = false,
            Variant = "Standard",
            Status = SmartTagStatus.Unclaimed,
            FulfilmentStatus = TagFulfilmentStatus.Generated,
        };
        var order = new TagOrder
        {
            OrderNumber = $"MPL-ORD-RACE-{Guid.NewGuid():N}"[..30].ToUpperInvariant(),
            OwnerUser = ownerA,
            OwnerUserId = OwnerA,
            Pet = petA,
            PetId = PetA,
            TagType = TagType.QrPetTag,
            Variant = "Standard",
            Amount = 39.90m,
            Currency = "MYR",
            DeliveryFee = 8m,
            TotalAmount = 47.90m,
            Status = withProof ? OrderStatus.PaymentProofSubmitted : OrderStatus.PendingPayment,
            PaymentStatus = withProof ? PaymentStatus.ProofSubmitted : PaymentStatus.Pending,
            PaymentReservationExpiresAt = deadline,
            RecipientName = "Owner A",
            DeliveryPhoneE164 = "+60123456789",
            AddressLine1 = "1 Jalan Pet",
            Postcode = "50000",
            City = "Kuala Lumpur",
            State = "Kuala Lumpur",
            StateCode = "KUL",
            Country = "Malaysia",
            Items =
            {
                new TagOrderItem
                {
                    ProductVariant = variant,
                    Pet = petA,
                    PetId = PetA,
                    PetNameSnapshot = "Topu",
                    SkuSnapshot = variant.Sku,
                    ProductNameSnapshot = product.Name,
                    VariantNameSnapshot = variant.DisplayName,
                    UnitBasePrice = 39.90m,
                    Quantity = 1,
                    Subtotal = 39.90m,
                    FinalUnitPrice = 39.90m,
                    FinalAmount = 39.90m,
                    Currency = "MYR",
                },
            },
        };
        PaymentProof? proof = null;
        if (withProof)
        {
            var media = new MediaFile
            {
                OwnerUserId = OwnerA,
                OriginalFileName = "receipt.png",
                StorageFileName = "receipt.png",
                ContentType = "image/png",
                FileSize = 100,
                StorageProvider = "MetadataOnly",
                StoragePath = "",
                Sha256 = "",
            };
            proof = new PaymentProof
            {
                Order = order,
                MediaFile = media,
                OriginalFileName = "receipt.png",
                StorageFileName = "receipt.png",
                ContentType = "image/png",
                FileSize = 100,
                StorageProvider = "MetadataOnly",
                StoragePath = "",
                Sha256 = "",
                SubmittedAmount = 47.90m,
                Status = PaymentProofStatus.PendingReview,
                UploadedAt = Now.AddMinutes(-1),
            };
            db.AddRange(media, proof);
        }

        var pen = await db.DeliveryRates.SingleOrDefaultAsync(rate => rate.ZoneCode == "PEN")
            ?? new DeliveryRate
            {
                Name = "Peninsular Standard Delivery",
                ZoneCode = "PEN",
                ApplicableStateCodesJson = "[]",
                Currency = "MYR",
            };
        pen.IsActive = true;
        pen.Fee = 8m;
        db.AddRange(admin, ownerA, ownerB, petA, petB, product, variant, stock, order, pen);
        await db.SaveChangesAsync();
        return new SeedResult(order.Id, order.OrderNumber, variant.Id, variant.PublicKey, proof?.Id);
    }

    private static PaymentReservationExpiryService ExpiryService(
        MyPetLinkDbContext db,
        DateTimeOffset now) => new(
            db,
            new AuditLogService(db, new HttpContextAccessor()),
            new FixedTimeProvider(now),
            NullLogger<PaymentReservationExpiryService>.Instance);

    private static OrderService OrderService(MyPetLinkDbContext db, DateTimeOffset now)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor());
        var clock = new FixedTimeProvider(now);
        return new OrderService(
            db,
            Options.Create(new FeatureOptions { SmartTagOrderingEnabled = true }),
            new TagPricingService(db),
            new DeliveryService(db, new TagPricingService(db), audit),
            new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()),
            clock,
            inventoryAvailability: new TagOrderInventoryAvailabilityService(db),
            checkoutSettings: new OrderCheckoutSettingsService(db, audit, clock),
            auditLogService: audit);
    }

    private static AdminService AdminService(MyPetLinkDbContext db, DateTimeOffset now)
    {
        var clock = new FixedTimeProvider(now);
        var audit = new AuditLogService(db, new HttpContextAccessor());
        var gate = new EmailTemplateGate(db, Options.Create(new EmailOptions()));
        return new AdminService(
            db,
            audit,
            Options.Create(new FeatureOptions()),
            new EmailOutboxService(db, audit, clock, gate),
            new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()),
            clock,
            checkoutSettings: new OrderCheckoutSettingsService(db, audit, clock));
    }

    private static OrderCheckoutSettingsService SettingsService(MyPetLinkDbContext db)
    {
        var clock = new FixedTimeProvider(Now);
        return new OrderCheckoutSettingsService(
            db,
            new AuditLogService(db, new HttpContextAccessor()),
            clock,
            Options.Create(new OrderReservationOptions()));
    }

    private static CreateTagOrderRequest Request(Guid petId, string variantKey, string key) => new(
        petId,
        variantKey,
        1,
        new DeliveryDetailsRequest(
            "Owner", "+60123456789", "1 Jalan Pet", null,
            "50000", "Kuala Lumpur", "KUL", null),
        null,
        key);

    private static User User(Guid id, string email, string name) => new()
    {
        Id = id,
        Email = email,
        NormalizedEmail = email.ToUpperInvariant(),
        DisplayName = name,
        Status = UserStatus.Active,
    };

    private static Pet Pet(Guid id, Guid ownerId, string name) => new()
    {
        Id = id,
        OwnerUserId = ownerId,
        Slug = $"{name.ToLowerInvariant()}-{id:N}",
        Name = name,
        Species = "Dog",
        LifecycleStatus = PetLifecycleStatus.Active,
    };

    private static async Task<(object? Value, Exception? Error)> Capture<T>(Func<Task<T>> action)
    {
        try { return (await action(), null); }
        catch (Exception exception) { return (null, exception); }
    }

    private static string Describe(IEnumerable<(object? Value, Exception? Error)> outcomes) =>
        string.Join(" | ", outcomes.Select(item => item.Error?.GetType().Name ?? item.Value?.ToString() ?? "null"));

    private sealed record SeedResult(
        Guid OrderId,
        string OrderNumber,
        Guid VariantId,
        string VariantKey,
        Guid? ProofId);
}
