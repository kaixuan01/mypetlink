using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers.Admin;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class ShippingFulfilmentSettingsTests
{
    [Fact]
    public void AdminController_RequiresAdminAuthorization()
    {
        var attribute = Assert.Single(
            typeof(AdminShippingFulfilmentController)
                .GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true)
                .Cast<AuthorizeAttribute>());
        Assert.Equal(AuthorizationPolicies.Admin, attribute.Policy);
    }

    [Fact]
    public async Task AuthorizedAdmin_CanReadAndUpdateSenderAndParcelSettings()
    {
        await using var harness = Harness.Create();

        var current = await harness.Service.GetAdminAsync();
        var saved = await harness.Service.UpdateSettingsAsync(
            harness.User.Id,
            new UpdateShippingSettingsRequest(
                "MyPetLink Fulfilment",
                "GBB Software Solutions",
                "+60123456789",
                "shipping@mypetlink.com.my",
                "18 Jalan Linko",
                null,
                "Kuala Lumpur",
                "50000",
                "KUL",
                "Malaysia",
                0.75m,
                20m,
                14m,
                4m,
                true,
                current.Settings.RowVersion));

        Assert.True(saved.SenderConfigured);
        Assert.Equal(0.75m, saved.DefaultParcelWeightKg);
        Assert.True(saved.CustomerTrackingLinksEnabled);
        Assert.Contains(harness.Db.AuditLogs, item => item.Action == "shipping.sender.update");
        Assert.Contains(harness.Db.AuditLogs, item => item.Action == "shipping.parcel-defaults.update");
        Assert.Contains(harness.Db.AuditLogs, item => item.Action == "shipping.customer-tracking.update");
    }

    [Fact]
    public async Task NonAdmin_CannotModifySettings()
    {
        await using var harness = Harness.Create();
        var current = await harness.Service.GetAdminAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateSettingsAsync(
                Guid.NewGuid(),
                ValidSettings(current.Settings.RowVersion)));

        Assert.Equal(403, error.StatusCode);
    }

    [Theory]
    [InlineData(0, 18, 12, 3)]
    [InlineData(0.5, 0, 12, 3)]
    [InlineData(0.5, 18, -1, 3)]
    public async Task ParcelValidation_RejectsNonPositiveValues(
        double weight,
        double length,
        double width,
        double height)
    {
        var request = ValidSettings("AA==") with
        {
            DefaultParcelWeightKg = (decimal)weight,
            DefaultParcelLengthCm = (decimal)length,
            DefaultParcelWidthCm = (decimal)width,
            DefaultParcelHeightCm = (decimal)height
        };
        await using var harness = Harness.Create();
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateSettingsAsync(harness.User.Id, request));

        Assert.Equal(400, error.StatusCode);
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("http://example.test/{trackingNumber}")]
    [InlineData("https://example.test/track")]
    [InlineData("https://example.test/{trackingNumber}/{trackingNumber}")]
    [InlineData("data:text/plain,{trackingNumber}")]
    public void UnsafeOrMalformedTrackingTemplates_AreRejected(string template)
    {
        Assert.False(ShippingTrackingLinks.IsValidTemplate(template));
        Assert.Null(ShippingTrackingLinks.Build(template, "MY 123/45"));
    }

    [Fact]
    public void TrackingNumber_IsUrlEncoded()
    {
        var url = ShippingTrackingLinks.Build(
            "https://example.test/track?number={trackingNumber}",
            "MY 123/45?");

        Assert.Equal(
            "https://example.test/track?number=MY%20123%2F45%3F",
            url);
    }

    [Fact]
    public async Task OnlyOneActiveCourierCanBeDefault_AndDeactivationClearsDefault()
    {
        await using var harness = Harness.Create();
        var other = harness.AddCourier("POSLAJU", "Pos Laju", isDefault: false);
        await harness.Db.SaveChangesAsync();

        var madeDefault = await harness.Service.SetDefaultCourierAsync(
            harness.User.Id,
            other.Id,
            new SetDefaultShippingCourierRequest(Convert.ToBase64String(other.RowVersion)));
        Assert.True(madeDefault.IsDefault);
        Assert.False((await harness.Db.ShippingCourierProviders.SingleAsync(item => item.Code == "JNT")).IsDefault);

        var deactivated = await harness.Service.SetCourierActiveAsync(
            harness.User.Id,
            other.Id,
            new SetShippingCourierActiveRequest(false, madeDefault.RowVersion));
        Assert.False(deactivated.IsActive);
        Assert.False(deactivated.IsDefault);
    }

    [Fact]
    public async Task InactiveHistoricalCourier_RemainsResolvableButNotOfferedForNewShipments()
    {
        await using var harness = Harness.Create();
        var courier = await harness.Db.ShippingCourierProviders.SingleAsync(item => item.Code == "JNT");
        courier.IsActive = false;
        courier.IsDefault = false;
        await harness.Db.SaveChangesAsync();
        var historical = new TagOrder
        {
            CourierProviderCode = "JNT",
            CourierProvider = "J&T Express (saved name)"
        };

        var resolved = await harness.Service.ResolveCourierForShipmentAsync(
            historical,
            "JNT",
            "ignored");
        var options = await harness.Service.ListActiveCourierOptionsAsync();

        Assert.Equal("J&T Express (saved name)", resolved.DisplayName);
        Assert.DoesNotContain(options, item => item.Code == "JNT");
    }

    [Fact]
    public async Task CustomerTrackingSettingAndShipmentState_ControlGeneratedLink()
    {
        await using var harness = Harness.Create();
        var courier = await harness.Db.ShippingCourierProviders.SingleAsync(item => item.Code == "JNT");
        courier.TrackingUrlTemplate = "https://example.test/track?number={trackingNumber}";
        var settings = await harness.Db.ShippingFulfilmentSettings.SingleAsync();
        settings.CustomerTrackingLinksEnabled = true;
        await harness.Db.SaveChangesAsync();
        var order = new TagOrder
        {
            Id = Guid.NewGuid(),
            Status = OrderStatus.ReadyToShip,
            CourierProviderCode = "JNT",
            CourierProvider = "J&T Express",
            TrackingNumber = "MY 123/45"
        };

        Assert.Null(await harness.Service.GetCustomerTrackingUrlAsync(order));
        order.Status = OrderStatus.Shipped;
        Assert.Equal(
            "https://example.test/track?number=MY%20123%2F45",
            await harness.Service.GetCustomerTrackingUrlAsync(order));

        settings.CustomerTrackingLinksEnabled = false;
        await harness.Db.SaveChangesAsync();
        Assert.Null(await harness.Service.GetCustomerTrackingUrlAsync(order));
        Assert.Equal("MY 123/45", order.TrackingNumber);
    }

    [Fact]
    public void OwnerProjection_ContainsGeneratedUrlButNoInternalShippingConfiguration()
    {
        var properties = typeof(TagOrderResponse)
            .GetProperties()
            .Select(property => property.Name)
            .ToArray();

        Assert.Contains("TrackingUrl", properties);
        Assert.DoesNotContain("ActualCourierCost", properties);
        Assert.DoesNotContain("ShippingNotes", properties);
        Assert.DoesNotContain("TrackingUrlTemplate", properties);
        Assert.DoesNotContain("CourierProviderCode", properties);
    }

    private static UpdateShippingSettingsRequest ValidSettings(string rowVersion) =>
        new(
            "MyPetLink",
            null,
            "+60123456789",
            null,
            "18 Jalan Linko",
            null,
            "Kuala Lumpur",
            "50000",
            "KUL",
            "Malaysia",
            0.5m,
            18m,
            12m,
            3m,
            false,
            rowVersion);

    private sealed class Harness : IAsyncDisposable
    {
        private Harness(
            MyPetLinkDbContext db,
            ShippingFulfilmentService service,
            User user)
        {
            Db = db;
            Service = service;
            User = user;
        }

        public MyPetLinkDbContext Db { get; }
        public ShippingFulfilmentService Service { get; }
        public User User { get; }

        public static Harness Create()
        {
            var db = new MyPetLinkDbContext(
                new DbContextOptionsBuilder<MyPetLinkDbContext>()
                    .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                    .Options);
            var user = new User
            {
                Id = Guid.NewGuid(),
                Email = "shipping-admin@example.test",
                NormalizedEmail = "SHIPPING-ADMIN@EXAMPLE.TEST",
                DisplayName = "Shipping Admin",
                Status = UserStatus.Active
            };
            var admin = new AdminUser
            {
                Id = Guid.NewGuid(),
                User = user,
                UserId = user.Id,
                IsActive = true
            };
            var settings = new ShippingFulfilmentSetting
            {
                Id = ShippingFulfilmentService.SettingsId,
                Country = "Malaysia",
                DefaultParcelWeightKg = 0.5m,
                DefaultParcelLengthCm = 18m,
                DefaultParcelWidthCm = 12m,
                DefaultParcelHeightCm = 3m,
                RowVersion = [1]
            };
            var courier = new ShippingCourierProvider
            {
                Id = ShippingFulfilmentService.JntCourierId,
                Code = "JNT",
                DisplayName = "J&T Express",
                IsActive = true,
                IsDefault = true,
                DisplayOrder = 10,
                RowVersion = [2]
            };
            db.AddRange(user, admin, settings, courier);
            db.SaveChanges();
            var audit = new AuditLogService(db, new HttpContextAccessor());
            return new Harness(
                db,
                new ShippingFulfilmentService(db, audit, TimeProvider.System),
                user);
        }

        public ShippingCourierProvider AddCourier(
            string code,
            string displayName,
            bool isDefault)
        {
            var courier = new ShippingCourierProvider
            {
                Id = Guid.NewGuid(),
                Code = code,
                DisplayName = displayName,
                IsActive = true,
                IsDefault = isDefault,
                DisplayOrder = 20,
                RowVersion = [3]
            };
            Db.ShippingCourierProviders.Add(courier);
            return courier;
        }

        public async ValueTask DisposeAsync() => await Db.DisposeAsync();
    }
}
