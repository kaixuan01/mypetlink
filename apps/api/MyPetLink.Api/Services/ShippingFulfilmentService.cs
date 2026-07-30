using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IShippingFulfilmentService
{
    Task<AdminShippingFulfilmentResponse> GetAdminAsync(CancellationToken cancellationToken = default);
    Task<AdminShippingSettingsResponse> UpdateSettingsAsync(
        Guid? actorUserId,
        UpdateShippingSettingsRequest request,
        CancellationToken cancellationToken = default);
    Task<AdminShippingCourierResponse> CreateCourierAsync(
        Guid? actorUserId,
        CreateShippingCourierRequest request,
        CancellationToken cancellationToken = default);
    Task<AdminShippingCourierResponse> UpdateCourierAsync(
        Guid? actorUserId,
        Guid courierId,
        UpdateShippingCourierRequest request,
        CancellationToken cancellationToken = default);
    Task<AdminShippingCourierResponse> SetCourierActiveAsync(
        Guid? actorUserId,
        Guid courierId,
        SetShippingCourierActiveRequest request,
        CancellationToken cancellationToken = default);
    Task<AdminShippingCourierResponse> SetDefaultCourierAsync(
        Guid? actorUserId,
        Guid courierId,
        SetDefaultShippingCourierRequest request,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ShippingCourierOptionResponse>> ListActiveCourierOptionsAsync(
        CancellationToken cancellationToken = default);
    Task<(string? Code, string DisplayName)> ResolveCourierForShipmentAsync(
        TagOrder order,
        string? courierCode,
        string? customDisplayName,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyDictionary<Guid, string?>> GetCustomerTrackingUrlsAsync(
        IReadOnlyCollection<TagOrder> orders,
        CancellationToken cancellationToken = default);
    Task<string?> GetCustomerTrackingUrlAsync(
        TagOrder order,
        CancellationToken cancellationToken = default);
}

public sealed class ShippingFulfilmentService : IShippingFulfilmentService
{
    public static readonly Guid SettingsId = Guid.Parse("8b2a37be-928c-4f10-96a0-3c169ef00379");
    public static readonly Guid JntCourierId = Guid.Parse("dcd3c11a-ddb7-4c50-bf21-0f4d0e3297d1");
    public static readonly Guid PosLajuCourierId = Guid.Parse("0ac926be-7d6d-403f-9716-e4498354347a");
    public static readonly Guid DhlCourierId = Guid.Parse("03a56970-0592-4c83-b0bd-6453c6833703");
    public static readonly Guid NinjaVanCourierId = Guid.Parse("28d1e1a3-0ca5-48d0-b624-757961e936d1");

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;

    public ShippingFulfilmentService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider;
    }

    public async Task<AdminShippingFulfilmentResponse> GetAdminAsync(
        CancellationToken cancellationToken = default)
    {
        var setting = await SettingsQuery()
            .AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == SettingsId, cancellationToken)
            ?? throw SchemaNotReady();
        var couriers = await CouriersQuery()
            .AsNoTracking()
            .OrderBy(item => item.DisplayOrder)
            .ThenBy(item => item.DisplayName)
            .ToListAsync(cancellationToken);

        return new AdminShippingFulfilmentResponse(
            ToSettingsResponse(setting),
            couriers.Select(ToCourierResponse).ToArray(),
            MalaysiaDelivery.States
                .OrderBy(state => state.Name)
                .Select(state => new ShippingStateOptionResponse(state.Code, state.Name))
                .ToArray());
    }

    public async Task<AdminShippingSettingsResponse> UpdateSettingsAsync(
        Guid? actorUserId,
        UpdateShippingSettingsRequest request,
        CancellationToken cancellationToken = default)
    {
        var actor = await RequireAdminAsync(actorUserId, cancellationToken);
        ValidateSettings(request);
        var setting = await SettingsQuery()
            .SingleOrDefaultAsync(item => item.Id == SettingsId, cancellationToken)
            ?? throw SchemaNotReady();
        ApplyConcurrency(setting, request.RowVersion);

        var before = SafeSettingsSnapshot(setting);
        var senderChanged =
            !string.Equals(setting.SenderName, request.SenderName?.Trim(), StringComparison.Ordinal)
            || !string.Equals(setting.CompanyName ?? "", NormalizeOptional(request.CompanyName) ?? "", StringComparison.Ordinal)
            || !string.Equals(setting.SenderPhone, request.SenderPhone?.Trim(), StringComparison.Ordinal)
            || !string.Equals(setting.SenderEmail ?? "", NormalizeOptional(request.SenderEmail) ?? "", StringComparison.OrdinalIgnoreCase)
            || !string.Equals(setting.AddressLine1, request.AddressLine1?.Trim(), StringComparison.Ordinal)
            || !string.Equals(setting.AddressLine2 ?? "", NormalizeOptional(request.AddressLine2) ?? "", StringComparison.Ordinal)
            || !string.Equals(setting.City, request.City?.Trim(), StringComparison.Ordinal)
            || !string.Equals(setting.Postcode, request.Postcode?.Trim(), StringComparison.Ordinal)
            || !string.Equals(setting.StateCode, MalaysiaDelivery.ResolveState(request.StateCode!)!.Code, StringComparison.Ordinal);
        var parcelChanged =
            setting.DefaultParcelWeightKg != request.DefaultParcelWeightKg
            || setting.DefaultParcelLengthCm != request.DefaultParcelLengthCm
            || setting.DefaultParcelWidthCm != request.DefaultParcelWidthCm
            || setting.DefaultParcelHeightCm != request.DefaultParcelHeightCm;
        var trackingVisibilityChanged =
            setting.CustomerTrackingLinksEnabled != request.CustomerTrackingLinksEnabled;
        setting.SenderName = request.SenderName!.Trim();
        setting.CompanyName = NormalizeOptional(request.CompanyName);
        setting.SenderPhone = request.SenderPhone!.Trim();
        setting.SenderEmail = NormalizeOptional(request.SenderEmail);
        setting.AddressLine1 = request.AddressLine1!.Trim();
        setting.AddressLine2 = NormalizeOptional(request.AddressLine2);
        setting.City = request.City!.Trim();
        setting.Postcode = request.Postcode!.Trim();
        setting.StateCode = MalaysiaDelivery.ResolveState(request.StateCode!)!.Code;
        setting.Country = MalaysiaDelivery.CountryName;
        setting.DefaultParcelWeightKg = request.DefaultParcelWeightKg;
        setting.DefaultParcelLengthCm = request.DefaultParcelLengthCm;
        setting.DefaultParcelWidthCm = request.DefaultParcelWidthCm;
        setting.DefaultParcelHeightCm = request.DefaultParcelHeightCm;
        setting.CustomerTrackingLinksEnabled = request.CustomerTrackingLinksEnabled;
        setting.UpdatedByAdminUserId = actor.Id;
        setting.UpdatedByAdminUser = actor;
        setting.UpdatedAt = _timeProvider.GetUtcNow();

        if (senderChanged)
        {
            AppendSettingsAudit(actorUserId, "shipping.sender.update", setting, before);
        }
        if (parcelChanged)
        {
            AppendSettingsAudit(actorUserId, "shipping.parcel-defaults.update", setting, before);
        }
        if (trackingVisibilityChanged)
        {
            AppendSettingsAudit(actorUserId, "shipping.customer-tracking.update", setting, before);
        }
        await SaveAsync(cancellationToken);
        return ToSettingsResponse(setting);
    }

    public async Task<AdminShippingCourierResponse> CreateCourierAsync(
        Guid? actorUserId,
        CreateShippingCourierRequest request,
        CancellationToken cancellationToken = default)
    {
        var actor = await RequireAdminAsync(actorUserId, cancellationToken);
        ValidateCourier(request.Code, request.DisplayName, request.IsActive, request.IsDefault, request.TrackingUrlTemplate);
        var code = request.Code!.Trim().ToUpperInvariant();
        if (await _dbContext.ShippingCourierProviders.AnyAsync(
                item => item.Code == code,
                cancellationToken))
        {
            throw Validation("code", "A courier with this code already exists.");
        }

        var now = _timeProvider.GetUtcNow();
        var courier = new ShippingCourierProvider
        {
            Id = Guid.NewGuid(),
            Code = code,
            DisplayName = request.DisplayName!.Trim(),
            IsActive = request.IsActive,
            IsDefault = request.IsDefault,
            TrackingUrlTemplate = NormalizeOptional(request.TrackingUrlTemplate),
            DisplayOrder = request.DisplayOrder,
            InternalNotes = NormalizeOptional(request.InternalNotes),
            UpdatedByAdminUserId = actor.Id,
            UpdatedByAdminUser = actor,
            CreatedAt = now,
            UpdatedAt = now
        };
        if (courier.IsDefault)
        {
            await ClearOtherDefaultsAsync(courier.Id, cancellationToken);
        }

        _dbContext.ShippingCourierProviders.Add(courier);
        _auditLogService.Append(
            actorUserId,
            ActorType.Admin,
            "shipping.courier.add",
            "ShippingCourierProvider",
            courier.Id,
            null,
            CourierSnapshot(courier));
        await SaveAsync(cancellationToken);
        return ToCourierResponse(courier);
    }

    public async Task<AdminShippingCourierResponse> UpdateCourierAsync(
        Guid? actorUserId,
        Guid courierId,
        UpdateShippingCourierRequest request,
        CancellationToken cancellationToken = default)
    {
        var actor = await RequireAdminAsync(actorUserId, cancellationToken);
        ValidateCourier(null, request.DisplayName, request.IsActive, request.IsDefault, request.TrackingUrlTemplate);
        var courier = await LoadCourierAsync(courierId, cancellationToken);
        ApplyConcurrency(courier, request.RowVersion);
        var before = CourierSnapshot(courier);
        var wasDefault = courier.IsDefault;
        var trackingChanged = !string.Equals(
            courier.TrackingUrlTemplate ?? "",
            NormalizeOptional(request.TrackingUrlTemplate) ?? "",
            StringComparison.Ordinal);

        courier.DisplayName = request.DisplayName!.Trim();
        courier.IsActive = request.IsActive;
        courier.IsDefault = request.IsActive && request.IsDefault;
        courier.TrackingUrlTemplate = NormalizeOptional(request.TrackingUrlTemplate);
        courier.DisplayOrder = request.DisplayOrder;
        courier.InternalNotes = NormalizeOptional(request.InternalNotes);
        courier.UpdatedByAdminUserId = actor.Id;
        courier.UpdatedByAdminUser = actor;
        courier.UpdatedAt = _timeProvider.GetUtcNow();
        if (courier.IsDefault)
        {
            await ClearOtherDefaultsAsync(courier.Id, cancellationToken);
        }

        _auditLogService.Append(
            actorUserId,
            ActorType.Admin,
            "shipping.courier.update",
            "ShippingCourierProvider",
            courier.Id,
            before,
            CourierSnapshot(courier));
        if (trackingChanged)
        {
            _auditLogService.Append(
                actorUserId,
                ActorType.Admin,
                "shipping.courier.tracking-template.update",
                "ShippingCourierProvider",
                courier.Id,
                before,
                CourierSnapshot(courier));
        }
        if (!wasDefault && courier.IsDefault)
        {
            _auditLogService.Append(
                actorUserId,
                ActorType.Admin,
                "shipping.courier.default",
                "ShippingCourierProvider",
                courier.Id,
                before,
                CourierSnapshot(courier));
        }
        await SaveAsync(cancellationToken);
        return ToCourierResponse(courier);
    }

    public async Task<AdminShippingCourierResponse> SetCourierActiveAsync(
        Guid? actorUserId,
        Guid courierId,
        SetShippingCourierActiveRequest request,
        CancellationToken cancellationToken = default)
    {
        var actor = await RequireAdminAsync(actorUserId, cancellationToken);
        var courier = await LoadCourierAsync(courierId, cancellationToken);
        ApplyConcurrency(courier, request.RowVersion);
        if (courier.IsActive == request.IsActive)
        {
            return ToCourierResponse(courier);
        }

        var before = CourierSnapshot(courier);
        courier.IsActive = request.IsActive;
        if (!courier.IsActive)
        {
            courier.IsDefault = false;
        }
        courier.UpdatedByAdminUserId = actor.Id;
        courier.UpdatedByAdminUser = actor;
        courier.UpdatedAt = _timeProvider.GetUtcNow();
        _auditLogService.Append(
            actorUserId,
            ActorType.Admin,
            request.IsActive ? "shipping.courier.activate" : "shipping.courier.deactivate",
            "ShippingCourierProvider",
            courier.Id,
            before,
            CourierSnapshot(courier));
        await SaveAsync(cancellationToken);
        return ToCourierResponse(courier);
    }

    public async Task<AdminShippingCourierResponse> SetDefaultCourierAsync(
        Guid? actorUserId,
        Guid courierId,
        SetDefaultShippingCourierRequest request,
        CancellationToken cancellationToken = default)
    {
        var actor = await RequireAdminAsync(actorUserId, cancellationToken);
        var courier = await LoadCourierAsync(courierId, cancellationToken);
        ApplyConcurrency(courier, request.RowVersion);
        if (!courier.IsActive)
        {
            throw Validation("isDefault", "Activate this courier before making it the default.");
        }
        if (courier.IsDefault)
        {
            return ToCourierResponse(courier);
        }

        var before = CourierSnapshot(courier);
        await ClearOtherDefaultsAsync(courier.Id, cancellationToken);
        courier.IsDefault = true;
        courier.UpdatedByAdminUserId = actor.Id;
        courier.UpdatedByAdminUser = actor;
        courier.UpdatedAt = _timeProvider.GetUtcNow();
        _auditLogService.Append(
            actorUserId,
            ActorType.Admin,
            "shipping.courier.default",
            "ShippingCourierProvider",
            courier.Id,
            before,
            CourierSnapshot(courier));
        await SaveAsync(cancellationToken);
        return ToCourierResponse(courier);
    }

    public async Task<IReadOnlyCollection<ShippingCourierOptionResponse>> ListActiveCourierOptionsAsync(
        CancellationToken cancellationToken = default) =>
        await _dbContext.ShippingCourierProviders
            .AsNoTracking()
            .Where(item => item.IsActive)
            .OrderBy(item => item.DisplayOrder)
            .ThenBy(item => item.DisplayName)
            .Select(item => new ShippingCourierOptionResponse(
                item.Code,
                item.DisplayName,
                item.IsDefault,
                item.DisplayOrder))
            .ToArrayAsync(cancellationToken);

    public async Task<(string? Code, string DisplayName)> ResolveCourierForShipmentAsync(
        TagOrder order,
        string? courierCode,
        string? customDisplayName,
        CancellationToken cancellationToken = default)
    {
        var code = NormalizeOptional(courierCode)?.ToUpperInvariant();
        if (code is null)
        {
            return (null, NormalizeOptional(customDisplayName)
                ?? throw Validation("courierProvider", "Select or enter a courier provider."));
        }

        var courier = await _dbContext.ShippingCourierProviders
            .AsNoTracking()
            .SingleOrDefaultAsync(item => item.Code == code, cancellationToken)
            ?? throw Validation("courierProviderCode", "This courier is no longer available.");
        var isExistingHistoricalSelection = string.Equals(
            order.CourierProviderCode,
            courier.Code,
            StringComparison.OrdinalIgnoreCase);
        if (!courier.IsActive && !isExistingHistoricalSelection)
        {
            throw Validation("courierProviderCode", "Select an active courier or choose Other.");
        }

        // Preserve the saved display snapshot when an inactive or renamed
        // courier is edited on an existing shipment.
        var display = isExistingHistoricalSelection && !string.IsNullOrWhiteSpace(order.CourierProvider)
            ? order.CourierProvider
            : courier.DisplayName;
        return (courier.Code, display);
    }

    public async Task<IReadOnlyDictionary<Guid, string?>> GetCustomerTrackingUrlsAsync(
        IReadOnlyCollection<TagOrder> orders,
        CancellationToken cancellationToken = default)
    {
        var result = orders.ToDictionary(order => order.Id, _ => (string?)null);
        var eligible = orders.Where(IsTrackingEligible).ToArray();
        if (eligible.Length == 0)
        {
            return result;
        }

        var enabled = await _dbContext.ShippingFulfilmentSettings
            .AsNoTracking()
            .Where(item => item.Id == SettingsId)
            .Select(item => item.CustomerTrackingLinksEnabled)
            .SingleOrDefaultAsync(cancellationToken);
        if (!enabled)
        {
            return result;
        }

        var codes = eligible
            .Select(order => order.CourierProviderCode!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var couriers = await _dbContext.ShippingCourierProviders
            .AsNoTracking()
            .Where(item => item.IsActive && codes.Contains(item.Code))
            .ToDictionaryAsync(item => item.Code, StringComparer.OrdinalIgnoreCase, cancellationToken);
        foreach (var order in eligible)
        {
            if (couriers.TryGetValue(order.CourierProviderCode!, out var courier))
            {
                result[order.Id] = ShippingTrackingLinks.Build(
                    courier.TrackingUrlTemplate,
                    order.TrackingNumber);
            }
        }

        return result;
    }

    public async Task<string?> GetCustomerTrackingUrlAsync(
        TagOrder order,
        CancellationToken cancellationToken = default)
    {
        var urls = await GetCustomerTrackingUrlsAsync([order], cancellationToken);
        return urls.GetValueOrDefault(order.Id);
    }

    private static bool IsTrackingEligible(TagOrder order) =>
        order.Status is OrderStatus.Shipped or OrderStatus.Delivered
        && !string.IsNullOrWhiteSpace(order.CourierProviderCode)
        && !string.IsNullOrWhiteSpace(order.TrackingNumber);

    private IQueryable<ShippingFulfilmentSetting> SettingsQuery() =>
        _dbContext.ShippingFulfilmentSettings
            .Include(item => item.UpdatedByAdminUser)
            .ThenInclude(admin => admin!.User);

    private IQueryable<ShippingCourierProvider> CouriersQuery() =>
        _dbContext.ShippingCourierProviders
            .Include(item => item.UpdatedByAdminUser)
            .ThenInclude(admin => admin!.User);

    private async Task<ShippingCourierProvider> LoadCourierAsync(
        Guid courierId,
        CancellationToken cancellationToken) =>
        await CouriersQuery().SingleOrDefaultAsync(item => item.Id == courierId, cancellationToken)
        ?? throw new ApiException(404, "not_found", "This courier was not found.");

    private async Task<AdminUser> RequireAdminAsync(
        Guid? actorUserId,
        CancellationToken cancellationToken)
    {
        if (!actorUserId.HasValue)
        {
            throw new ApiException(401, "unauthorized", "Authentication is required.");
        }

        return await _dbContext.AdminUsers
            .Include(admin => admin.User)
            .SingleOrDefaultAsync(
                admin => admin.UserId == actorUserId && admin.IsActive && admin.User.Status == UserStatus.Active,
                cancellationToken)
            ?? throw new ApiException(403, "forbidden", "Active administrator access is required.");
    }

    private async Task ClearOtherDefaultsAsync(Guid courierId, CancellationToken cancellationToken)
    {
        var defaults = await _dbContext.ShippingCourierProviders
            .Where(item => item.Id != courierId && item.IsDefault)
            .ToListAsync(cancellationToken);
        foreach (var item in defaults)
        {
            item.IsDefault = false;
            item.UpdatedAt = _timeProvider.GetUtcNow();
        }
    }

    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw Conflict();
        }
        catch (DbUpdateException exception) when (
            UniqueConstraintViolation.IsFor(exception, "IX_ShippingCourierProviders_Code")
            || UniqueConstraintViolation.IsFor(exception, "IX_ShippingCourierProviders_IsDefault"))
        {
            throw Conflict();
        }
    }

    private void ApplyConcurrency(ShippingFulfilmentSetting setting, string? rowVersion)
    {
        _dbContext.Entry(setting).Property(item => item.RowVersion).OriginalValue = DecodeRowVersion(rowVersion);
    }

    private void ApplyConcurrency(ShippingCourierProvider courier, string? rowVersion)
    {
        _dbContext.Entry(courier).Property(item => item.RowVersion).OriginalValue = DecodeRowVersion(rowVersion);
    }

    private static byte[] DecodeRowVersion(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw Validation("rowVersion", "Refresh the page before saving these settings.");
        }
        try
        {
            return Convert.FromBase64String(value);
        }
        catch (FormatException)
        {
            throw Conflict();
        }
    }

    private static void ValidateSettings(UpdateShippingSettingsRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.SenderName))
        {
            throw Validation("senderName", "Enter the parcel sender name.");
        }
        if (string.IsNullOrWhiteSpace(request.AddressLine1))
        {
            throw Validation("addressLine1", "Enter the sender address.");
        }
        if (string.IsNullOrWhiteSpace(request.City))
        {
            throw Validation("city", "Enter the sender city.");
        }
        if (string.IsNullOrWhiteSpace(request.Postcode)
            || !System.Text.RegularExpressions.Regex.IsMatch(request.Postcode.Trim(), @"^\d{5}$"))
        {
            throw Validation("postcode", "Enter a valid 5-digit Malaysian postcode.");
        }
        if (MalaysiaDelivery.ResolveState(request.StateCode ?? "") is null)
        {
            throw Validation("stateCode", "Select a valid Malaysian state.");
        }
        if (!string.Equals(request.Country?.Trim(), MalaysiaDelivery.CountryName, StringComparison.OrdinalIgnoreCase))
        {
            throw Validation("country", "Shipping sender addresses currently support Malaysia only.");
        }
        if (string.IsNullOrWhiteSpace(request.SenderPhone)
            || !System.Text.RegularExpressions.Regex.IsMatch(request.SenderPhone.Trim(), @"^\+?[0-9][0-9 \-]{7,30}$"))
        {
            throw Validation("senderPhone", "Enter a valid sender phone number.");
        }
        ValidatePositiveParcelValue(
            request.DefaultParcelWeightKg,
            100m,
            "defaultParcelWeightKg",
            "Parcel weight must be greater than zero and no more than 100 kg.");
        ValidatePositiveParcelValue(
            request.DefaultParcelLengthCm,
            300m,
            "defaultParcelLengthCm",
            "Parcel length must be greater than zero and no more than 300 cm.");
        ValidatePositiveParcelValue(
            request.DefaultParcelWidthCm,
            300m,
            "defaultParcelWidthCm",
            "Parcel width must be greater than zero and no more than 300 cm.");
        ValidatePositiveParcelValue(
            request.DefaultParcelHeightCm,
            300m,
            "defaultParcelHeightCm",
            "Parcel height must be greater than zero and no more than 300 cm.");
    }

    private static void ValidatePositiveParcelValue(
        decimal value,
        decimal maximum,
        string field,
        string message)
    {
        if (value <= 0 || value > maximum)
        {
            throw Validation(field, message);
        }
    }

    private static void ValidateCourier(
        string? code,
        string? displayName,
        bool isActive,
        bool isDefault,
        string? trackingTemplate)
    {
        if (code is not null && string.Equals(code.Trim(), "OTHER", StringComparison.OrdinalIgnoreCase))
        {
            throw Validation("code", "Other is reserved for custom courier entries.");
        }
        if (string.Equals(displayName?.Trim(), "Other", StringComparison.OrdinalIgnoreCase))
        {
            throw Validation("displayName", "Other is reserved for custom courier entries.");
        }
        if (isDefault && !isActive)
        {
            throw Validation("isDefault", "Only an active courier can be the default.");
        }
        if (!ShippingTrackingLinks.IsValidTemplate(trackingTemplate))
        {
            throw Validation(
                "trackingUrlTemplate",
                $"Enter an HTTPS URL containing exactly one {ShippingTrackingLinks.Placeholder} placeholder.");
        }
    }

    private static AdminShippingSettingsResponse ToSettingsResponse(ShippingFulfilmentSetting item) =>
        new(
            item.SenderName,
            item.CompanyName,
            item.SenderPhone,
            item.SenderEmail,
            item.AddressLine1,
            item.AddressLine2,
            item.City,
            item.Postcode,
            item.StateCode,
            item.Country,
            item.DefaultParcelWeightKg,
            item.DefaultParcelLengthCm,
            item.DefaultParcelWidthCm,
            item.DefaultParcelHeightCm,
            item.CustomerTrackingLinksEnabled,
            !string.IsNullOrWhiteSpace(item.SenderName)
            && !string.IsNullOrWhiteSpace(item.SenderPhone)
            && !string.IsNullOrWhiteSpace(item.AddressLine1)
            && !string.IsNullOrWhiteSpace(item.City)
            && !string.IsNullOrWhiteSpace(item.Postcode)
            && !string.IsNullOrWhiteSpace(item.StateCode),
            item.UpdatedAt,
            item.UpdatedByAdminUser?.User?.DisplayName,
            Convert.ToBase64String(item.RowVersion));

    private static AdminShippingCourierResponse ToCourierResponse(ShippingCourierProvider item) =>
        new(
            item.Id,
            item.Code,
            item.DisplayName,
            item.IsActive,
            item.IsDefault,
            item.TrackingUrlTemplate,
            item.DisplayOrder,
            item.InternalNotes,
            item.CreatedAt,
            item.UpdatedAt,
            item.UpdatedByAdminUser?.User?.DisplayName,
            Convert.ToBase64String(item.RowVersion));

    private static object SafeSettingsSnapshot(ShippingFulfilmentSetting item) => new
    {
        senderConfigured = !string.IsNullOrWhiteSpace(item.SenderName)
            && !string.IsNullOrWhiteSpace(item.AddressLine1),
        hasCompanyName = !string.IsNullOrWhiteSpace(item.CompanyName),
        hasSenderEmail = !string.IsNullOrWhiteSpace(item.SenderEmail),
        item.StateCode,
        item.Country,
        item.DefaultParcelWeightKg,
        item.DefaultParcelLengthCm,
        item.DefaultParcelWidthCm,
        item.DefaultParcelHeightCm,
        item.CustomerTrackingLinksEnabled
    };

    private void AppendSettingsAudit(
        Guid? actorUserId,
        string action,
        ShippingFulfilmentSetting setting,
        object before) =>
        _auditLogService.Append(
            actorUserId,
            ActorType.Admin,
            action,
            "ShippingFulfilmentSetting",
            setting.Id,
            before,
            SafeSettingsSnapshot(setting));

    private static object CourierSnapshot(ShippingCourierProvider item) => new
    {
        item.Code,
        item.DisplayName,
        item.IsActive,
        item.IsDefault,
        item.TrackingUrlTemplate,
        item.DisplayOrder,
        hasInternalNotes = !string.IsNullOrWhiteSpace(item.InternalNotes)
    };

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static ApiException Validation(string field, string message) =>
        new(400, "validation_failed", "Please check the submitted fields.",
            new Dictionary<string, string[]> { [field] = [message] });

    private static ApiException Conflict() =>
        new(409, "concurrency_conflict",
            "These shipping settings were changed by another administrator. Refresh the page and try again.");

    private static ApiException SchemaNotReady() =>
        new(503, "shipping_configuration_unavailable",
            "Shipping and fulfilment configuration is temporarily unavailable. The required database update has not been applied.");
}
