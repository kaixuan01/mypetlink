using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class OrderCheckoutSettingsServiceTests
{
    private static readonly Guid AdminUserId = Guid.Parse("51000000-0000-0000-0000-000000000001");
    private static readonly Guid OwnerUserId = Guid.Parse("51000000-0000-0000-0000-000000000002");
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-08-03T12:00:00Z");

    [Fact]
    public async Task Get_ReturnsTypedBusinessRangeAndSafeWorkerStatus()
    {
        await using var harness = await Harness.CreateAsync();

        var response = await harness.Service.GetAsync();

        Assert.Equal(120, response.PaymentReservationMinutes);
        Assert.Equal(30, response.MinPaymentReservationMinutes);
        Assert.Equal(72 * 60, response.MaxPaymentReservationMinutes);
        Assert.True(response.ExpiryWorker.Enabled);
        Assert.Equal(45, response.ExpiryWorker.PollIntervalSeconds);
        Assert.Equal(17, response.ExpiryWorker.BatchSize);
        Assert.DoesNotContain("Connection", response.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(30)]
    [InlineData(4320)]
    public async Task Update_AcceptsInclusiveValidationBoundaries(int minutes)
    {
        await using var harness = await Harness.CreateAsync();

        var updated = await harness.Service.UpdateAsync(
            AdminUserId,
            new UpdateOrderCheckoutSettingsRequest(minutes, Convert.ToBase64String([1, 2, 3])));

        Assert.Equal(minutes, updated.PaymentReservationMinutes);
        Assert.Equal("Admin", updated.UpdatedBy);
        Assert.Single(await harness.Db.AuditLogs
            .Where(item => item.Action == "order-checkout-settings.update")
            .ToListAsync());
    }

    [Theory]
    [InlineData(29)]
    [InlineData(4321)]
    public async Task Update_RejectsValuesOutsideTheApprovedRange(int minutes)
    {
        await using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Service.UpdateAsync(
            AdminUserId,
            new UpdateOrderCheckoutSettingsRequest(minutes, Convert.ToBase64String([1, 2, 3]))));

        Assert.Equal("validation_failed", error.Code);
        Assert.Contains("paymentReservationMinutes", error.Details!.Keys);
    }

    [Fact]
    public async Task Update_RequiresRowVersion()
    {
        await using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Service.UpdateAsync(
            AdminUserId,
            new UpdateOrderCheckoutSettingsRequest(180, null)));

        Assert.Equal("validation_failed", error.Code);
        Assert.Contains("rowVersion", error.Details!.Keys);
    }

    [Fact]
    public async Task Update_RequiresAnActiveAdmin()
    {
        await using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Service.UpdateAsync(
            OwnerUserId,
            new UpdateOrderCheckoutSettingsRequest(180, Convert.ToBase64String([1, 2, 3]))));

        Assert.Equal(StatusCodes.Status403Forbidden, error.StatusCode);
    }

    [Fact]
    public async Task EditingTheSetting_DoesNotMoveAnExistingOrderDeadline()
    {
        await using var harness = await Harness.CreateAsync();
        var deadline = Now.AddMinutes(120);
        harness.Db.TagOrders.Add(new TagOrder
        {
            OrderNumber = "MPL-ORD-SNAPSHOT",
            OwnerUserId = OwnerUserId,
            PetId = Guid.NewGuid(),
            Status = OrderStatus.PendingPayment,
            PaymentStatus = PaymentStatus.Pending,
            PaymentReservationExpiresAt = deadline,
            RecipientName = "Owner",
            DeliveryPhoneE164 = "+60123456789",
            AddressLine1 = "1 Jalan Pet",
            Postcode = "50000",
            City = "Kuala Lumpur",
            State = "Kuala Lumpur",
        });
        await harness.Db.SaveChangesAsync();

        await harness.Service.UpdateAsync(
            AdminUserId,
            new UpdateOrderCheckoutSettingsRequest(30, Convert.ToBase64String([1, 2, 3])));

        Assert.Equal(deadline, (await harness.Db.TagOrders.SingleAsync()).PaymentReservationExpiresAt);
    }

    private sealed class Harness : IAsyncDisposable
    {
        private Harness(MyPetLinkDbContext db, OrderCheckoutSettingsService service)
        {
            Db = db;
            Service = service;
        }

        public MyPetLinkDbContext Db { get; }
        public OrderCheckoutSettingsService Service { get; }

        public static async Task<Harness> CreateAsync()
        {
            var db = new MyPetLinkDbContext(
                new DbContextOptionsBuilder<MyPetLinkDbContext>()
                    .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options,
                new FixedTimeProvider(Now));
            var admin = new User
            {
                Id = AdminUserId,
                Email = "admin@example.test",
                NormalizedEmail = "ADMIN@EXAMPLE.TEST",
                DisplayName = "Admin",
                Status = UserStatus.Active,
                AdminUser = new AdminUser
                {
                    UserId = AdminUserId,
                    Role = AdminRole.Admin,
                    IsActive = true,
                },
            };
            db.Users.AddRange(admin, new User
            {
                Id = OwnerUserId,
                Email = "owner@example.test",
                NormalizedEmail = "OWNER@EXAMPLE.TEST",
                DisplayName = "Owner",
                Status = UserStatus.Active,
            });
            db.OrderCheckoutSettings.Add(new OrderCheckoutSetting
            {
                Id = OrderCheckoutSettingsService.SettingsId,
                PaymentReservationMinutes = 120,
                RowVersion = [1, 2, 3],
                CreatedAt = Now,
                UpdatedAt = Now,
            });
            await db.SaveChangesAsync();
            var audit = new AuditLogService(db, new HttpContextAccessor());
            return new Harness(
                db,
                new OrderCheckoutSettingsService(
                    db,
                    audit,
                    new FixedTimeProvider(Now),
                    Options.Create(new OrderReservationOptions
                    {
                        ExpiryEnabled = true,
                        PollIntervalSeconds = 45,
                        BatchSize = 17,
                    })));
        }

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
}
