using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using Xunit;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Behaviour of the unpaid-reservation expiry policy: which orders the sweep
/// may claim, that a claim happens at most once, and that inventory is released
/// exactly once while history is preserved.
/// </summary>
public class PaymentReservationExpiryTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 3, 12, 0, 0, TimeSpan.Zero);
    private static readonly Guid OwnerId = Guid.Parse("0a000000-0000-0000-0000-0000000000aa");
    private static readonly Guid PetId = Guid.Parse("0d000000-0000-0000-0000-0000000000dd");
    private static readonly Guid VariantId = Guid.Parse("0b000000-0000-0000-0000-0000000000bb");

    [Fact]
    public async Task ExpiresAnUnpaidOrderPastItsDeadlineAndReleasesTheTag()
    {
        await using var db = NewContext();
        var order = await SeedOrderAsync(db, expiresAt: Now.AddMinutes(-1), withAssignedTag: true);

        var expired = await NewService(db).ExpireDueOrdersAsync(25);

        Assert.Equal(1, expired);
        var reloaded = await db.TagOrders.Include(item => item.AssignedTags)
            .SingleAsync(item => item.Id == order.Id);
        Assert.Equal(OrderStatus.Cancelled, reloaded.Status);
        Assert.Equal(Now, reloaded.PaymentReservationExpiredAt);
        Assert.NotNull(reloaded.CancelledAt);

        // The physical tag must return to sellable stock, never be archived.
        var tag = await db.SmartTags.SingleAsync();
        Assert.Equal(SmartTagStatus.Unclaimed, tag.Status);
        Assert.Null(tag.OrderId);
        Assert.Null(tag.OrderItemId);
        Assert.Null(tag.ArchivedAt);
    }

    [Fact]
    public async Task KeepsTheOrderInHistoryRatherThanDeletingIt()
    {
        await using var db = NewContext();
        var order = await SeedOrderAsync(db, expiresAt: Now.AddMinutes(-1));

        await NewService(db).ExpireDueOrdersAsync(25);

        Assert.True(await db.TagOrders.AnyAsync(item => item.Id == order.Id));
        Assert.True(await db.TagOrderItems.AnyAsync(item => item.OrderId == order.Id));
    }

    [Fact]
    public async Task WritesAnAuditEntryForTheAutomaticExpiry()
    {
        await using var db = NewContext();
        var order = await SeedOrderAsync(db, expiresAt: Now.AddMinutes(-1));

        await NewService(db).ExpireDueOrdersAsync(25);

        var audit = await db.AuditLogs.SingleAsync(entry =>
            entry.Action == PaymentReservationExpiryService.AuditAction);
        Assert.Equal("TagOrder", audit.Entity);
        Assert.Equal(order.Id, audit.EntityId);
        Assert.Equal(ActorType.System, audit.ActorType);
    }

    [Fact]
    public async Task DoesNotExpireAnOrderBeforeItsDeadline()
    {
        await using var db = NewContext();
        await SeedOrderAsync(db, expiresAt: Now.AddMinutes(1));

        Assert.Equal(0, await NewService(db).ExpireDueOrdersAsync(25));
        Assert.Equal(OrderStatus.PendingPayment, (await db.TagOrders.SingleAsync()).Status);
    }

    [Fact]
    public async Task DoesNotExpireAnOrderWithAProofAwaitingReview()
    {
        await using var db = NewContext();
        var order = await SeedOrderAsync(db, expiresAt: Now.AddMinutes(-30));
        await AddProofAsync(db, order, PaymentProofStatus.PendingReview);

        Assert.Equal(0, await NewService(db).ExpireDueOrdersAsync(25));
        Assert.Equal(OrderStatus.PendingPayment, (await db.TagOrders.SingleAsync()).Status);
    }

    [Fact]
    public async Task NeverExpiresAnApprovedOrder()
    {
        await using var db = NewContext();
        var order = await SeedOrderAsync(db, expiresAt: Now.AddMinutes(-120));
        order.Status = OrderStatus.PaymentConfirmed;
        order.PaymentStatus = PaymentStatus.Confirmed;
        order.PaymentConfirmedAt = Now.AddMinutes(-60);
        await db.SaveChangesAsync();

        Assert.Equal(0, await NewService(db).ExpireDueOrdersAsync(25));
        Assert.Equal(OrderStatus.PaymentConfirmed, (await db.TagOrders.SingleAsync()).Status);
    }

    [Fact]
    public async Task DoesNotExpireAnOrderWithoutADeadline()
    {
        await using var db = NewContext();
        await SeedOrderAsync(db, expiresAt: null);

        Assert.Equal(0, await NewService(db).ExpireDueOrdersAsync(25));
    }

    [Fact]
    public async Task RepeatedSweepsExpireTheOrderOnlyOnce()
    {
        await using var db = NewContext();
        await SeedOrderAsync(db, expiresAt: Now.AddMinutes(-1), withAssignedTag: true);
        var service = NewService(db);

        Assert.Equal(1, await service.ExpireDueOrdersAsync(25));
        // A second worker instance, or the next poll, must find nothing to do.
        Assert.Equal(0, await service.ExpireDueOrdersAsync(25));

        Assert.Single(await db.AuditLogs
            .Where(entry => entry.Action == PaymentReservationExpiryService.AuditAction)
            .ToListAsync());
        Assert.Single(await db.SmartTags.Where(tag => tag.Status == SmartTagStatus.Unclaimed).ToListAsync());
    }

    [Fact]
    public async Task ExpiryReturnsTheReservedUnitsToAvailability()
    {
        await using var db = NewContext();
        await SeedOrderAsync(db, expiresAt: Now.AddMinutes(-1), quantity: 2, spareTags: 2);
        var availability = new TagOrderInventoryAvailabilityService(db);

        // Two spare tags are fully reserved by the unpaid order.
        Assert.Equal(0, await availability.GetAvailableUnitsAsync(VariantId));

        await NewService(db).ExpireDueOrdersAsync(25);

        Assert.Equal(2, await availability.GetAvailableUnitsAsync(VariantId));
    }

    [Fact]
    public async Task BatchSizeLimitsHowManyOrdersOneCycleClaims()
    {
        await using var db = NewContext();
        await SeedOrderAsync(db, expiresAt: Now.AddMinutes(-3), orderNumber: "MPL-ORD-1");
        await SeedOrderAsync(db, expiresAt: Now.AddMinutes(-2), orderNumber: "MPL-ORD-2");
        await SeedOrderAsync(db, expiresAt: Now.AddMinutes(-1), orderNumber: "MPL-ORD-3");

        Assert.Equal(2, await NewService(db).ExpireDueOrdersAsync(2));
        Assert.Equal(1, await db.TagOrders.CountAsync(o => o.Status == OrderStatus.PendingPayment));
    }

    // --- helpers -------------------------------------------------------------

    private static MyPetLinkDbContext NewContext() => new(
        new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options,
        new FixedTimeProvider(Now));

    private static PaymentReservationExpiryService NewService(MyPetLinkDbContext db) => new(
        db,
        new AuditLogService(db, new HttpContextAccessor()),
        new FixedTimeProvider(Now),
        NullLogger<PaymentReservationExpiryService>.Instance);

    private static async Task<TagOrder> SeedOrderAsync(
        MyPetLinkDbContext db,
        DateTimeOffset? expiresAt,
        bool withAssignedTag = false,
        int quantity = 1,
        int spareTags = 0,
        string orderNumber = "MPL-ORD-TEST-0001")
    {
        if (!await db.Users.AnyAsync())
        {
            db.Users.Add(new User
            {
                Id = OwnerId,
                Email = "owner@example.test",
                NormalizedEmail = "OWNER@EXAMPLE.TEST",
                DisplayName = "Owner",
                Status = UserStatus.Active,
            });
            db.Pets.Add(new Pet
            {
                Id = PetId,
                OwnerUserId = OwnerId,
                Slug = "topu-1",
                Name = "Topu",
                Species = "Dog",
                LifecycleStatus = PetLifecycleStatus.Active,
            });
            for (var index = 0; index < spareTags; index++)
            {
                db.SmartTags.Add(new SmartTag
                {
                    Id = Guid.NewGuid(),
                    TagCode = $"MPL-SPARE-{index}",
                    ProductVariantId = VariantId,
                    Status = SmartTagStatus.Unclaimed,
                    FulfilmentStatus = TagFulfilmentStatus.Generated,
                });
            }
        }

        var orderId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var order = new TagOrder
        {
            Id = orderId,
            OrderNumber = orderNumber,
            OwnerUserId = OwnerId,
            PetId = PetId,
            Status = OrderStatus.PendingPayment,
            PaymentStatus = PaymentStatus.Pending,
            Amount = 39m,
            DeliveryFee = 8m,
            TotalAmount = 47m,
            PaymentReservationExpiresAt = expiresAt,
            CreatedAt = Now.AddHours(-3),
            UpdatedAt = Now.AddHours(-3),
        };
        order.Items.Add(new TagOrderItem
        {
            Id = itemId,
            OrderId = orderId,
            ProductVariantId = VariantId,
            SkuSnapshot = "SKU-1",
            ProductNameSnapshot = "Tag",
            VariantNameSnapshot = "Standard",
            PetId = PetId,
            PetNameSnapshot = "Topu",
            UnitBasePrice = 39m,
            Quantity = quantity,
            Subtotal = 39m * quantity,
            FinalUnitPrice = 39m,
            FinalAmount = 39m * quantity,
        });

        if (withAssignedTag)
        {
            order.AssignedTags.Add(new SmartTag
            {
                Id = Guid.NewGuid(),
                TagCode = "MPL-ASSIGNED-1",
                ProductVariantId = VariantId,
                OwnerUserId = OwnerId,
                PetId = PetId,
                OrderId = orderId,
                OrderItemId = itemId,
                Status = SmartTagStatus.Preparing,
                FulfilmentStatus = TagFulfilmentStatus.Generated,
            });
        }

        db.TagOrders.Add(order);
        await db.SaveChangesAsync();
        return order;
    }

    private static async Task AddProofAsync(
        MyPetLinkDbContext db,
        TagOrder order,
        PaymentProofStatus status)
    {
        var mediaId = Guid.NewGuid();
        db.MediaFiles.Add(new MediaFile
        {
            Id = mediaId,
            OwnerUserId = OwnerId,
            OriginalFileName = "r.png",
            StorageFileName = "r.png",
            ContentType = "image/png",
            FileSize = 10,
            StorageProvider = "MetadataOnly",
            StoragePath = "",
            Sha256 = "",
        });
        db.PaymentProofs.Add(new PaymentProof
        {
            Id = Guid.NewGuid(),
            OrderId = order.Id,
            MediaFileId = mediaId,
            OriginalFileName = "r.png",
            StorageFileName = "r.png",
            ContentType = "image/png",
            FileSize = 10,
            Status = status,
        });
        await db.SaveChangesAsync();
    }
}
