using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IOrderCheckoutSettingsService
{
    /// <summary>Minutes an unpaid order may hold its inventory reservation.</summary>
    Task<int> GetPaymentReservationMinutesAsync(CancellationToken cancellationToken = default);

    Task<AdminOrderCheckoutSettingsResponse> GetAsync(CancellationToken cancellationToken = default);

    Task<AdminOrderCheckoutSettingsResponse> UpdateAsync(
        Guid? currentUserId,
        UpdateOrderCheckoutSettingsRequest request,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Owns the checkout payment-window policy. Governance category D: a runtime
/// business value changed by Admin without a deployment, stored as a typed
/// column on a single row rather than in a generic key/value table.
/// </summary>
public sealed class OrderCheckoutSettingsService : IOrderCheckoutSettingsService
{
    public static readonly Guid SettingsId = Guid.Parse("4a2f6d18-9c31-4b7e-8f52-6d0a1b3c5e70");

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;
    private readonly OrderReservationOptions _workerOptions;

    public OrderCheckoutSettingsService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        TimeProvider timeProvider,
        IOptions<OrderReservationOptions>? workerOptions = null)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider;
        _workerOptions = workerOptions?.Value ?? new OrderReservationOptions();
    }

    public async Task<int> GetPaymentReservationMinutesAsync(
        CancellationToken cancellationToken = default)
    {
        var configured = await _dbContext.OrderCheckoutSettings
            .AsNoTracking()
            .Where(item => item.Id == SettingsId)
            .Select(item => (int?)item.PaymentReservationMinutes)
            .SingleOrDefaultAsync(cancellationToken);

        // A missing row must never disable the reservation window; fall back to
        // the documented default rather than leaving orders unbounded.
        return Clamp(configured ?? OrderCheckoutSetting.DefaultPaymentReservationMinutes);
    }

    public async Task<AdminOrderCheckoutSettingsResponse> GetAsync(
        CancellationToken cancellationToken = default)
    {
        var settings = await LoadAsync(trackChanges: false, cancellationToken);
        return ToResponse(settings);
    }

    public async Task<AdminOrderCheckoutSettingsResponse> UpdateAsync(
        Guid? currentUserId,
        UpdateOrderCheckoutSettingsRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);

        var minutes = request.PaymentReservationMinutes;
        if (minutes is < OrderCheckoutSetting.MinPaymentReservationMinutes
            or > OrderCheckoutSetting.MaxPaymentReservationMinutes)
        {
            throw Validation(
                "paymentReservationMinutes",
                $"Enter between {OrderCheckoutSetting.MinPaymentReservationMinutes} minutes and "
                + $"{OrderCheckoutSetting.MaxPaymentReservationMinutes / 60} hours.");
        }

        var settings = await LoadAsync(trackChanges: true, cancellationToken);
        ApplyConcurrency(settings, request.RowVersion);

        var previous = new { settings.PaymentReservationMinutes };
        settings.PaymentReservationMinutes = minutes;
        settings.UpdatedByAdminUserId = admin.Id;
        settings.UpdatedByAdminUser = admin;
        settings.UpdatedAt = _timeProvider.GetUtcNow();

        _auditLogService.Append(
            admin.Id,
            ActorType.Admin,
            "order-checkout-settings.update",
            "OrderCheckoutSetting",
            settings.Id,
            previous,
            new { settings.PaymentReservationMinutes });

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "concurrency_conflict",
                "These order checkout settings were changed by another administrator. "
                + "Refresh the page and try again.");
        }
        return ToResponse(settings);
    }

    private async Task<OrderCheckoutSetting> LoadAsync(
        bool trackChanges,
        CancellationToken cancellationToken)
    {
        var query = _dbContext.OrderCheckoutSettings
            .Include(item => item.UpdatedByAdminUser)
                .ThenInclude(admin => admin!.User)
            .AsQueryable();

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        return await query.SingleOrDefaultAsync(item => item.Id == SettingsId, cancellationToken)
            ?? throw new ApiException(
                StatusCodes.Status503ServiceUnavailable,
                "settings_unavailable",
                "Checkout settings are not available right now. Please try again shortly.");
    }

    private void ApplyConcurrency(OrderCheckoutSetting settings, string? rowVersion)
    {
        if (string.IsNullOrWhiteSpace(rowVersion))
        {
            throw Validation("rowVersion", "Refresh the page before saving these settings.");
        }

        try
        {
            _dbContext.Entry(settings).Property(item => item.RowVersion).OriginalValue =
                Convert.FromBase64String(rowVersion);
        }
        catch (FormatException)
        {
            throw Validation("rowVersion", "Reload the page and try again.");
        }
    }

    private static ApiException Validation(string field, string message) =>
        new(400, "validation_failed", "Please check the submitted fields.",
            new Dictionary<string, string[]> { [field] = [message] });

    private static int Clamp(int minutes) => Math.Clamp(
        minutes,
        OrderCheckoutSetting.MinPaymentReservationMinutes,
        OrderCheckoutSetting.MaxPaymentReservationMinutes);

    private async Task<AdminUser> RequireAdminAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken)
    {
        if (!currentUserId.HasValue)
        {
            throw new ApiException(401, "unauthorized", "Authentication is required.");
        }

        return await _dbContext.AdminUsers
            .Include(item => item.User)
            .SingleOrDefaultAsync(
                item => item.UserId == currentUserId.Value && item.IsActive,
                cancellationToken)
            ?? throw new ApiException(403, "forbidden", "Admin access is required.");
    }

    private AdminOrderCheckoutSettingsResponse ToResponse(OrderCheckoutSetting settings) =>
        new(
            settings.PaymentReservationMinutes,
            OrderCheckoutSetting.MinPaymentReservationMinutes,
            OrderCheckoutSetting.MaxPaymentReservationMinutes,
            settings.UpdatedAt,
            settings.UpdatedByAdminUser?.User?.DisplayName,
            Convert.ToBase64String(settings.RowVersion),
            new AdminPaymentReservationWorkerStatusResponse(
                _workerOptions.ExpiryEnabled,
                _workerOptions.PollIntervalSeconds,
                _workerOptions.BatchSize));
}
