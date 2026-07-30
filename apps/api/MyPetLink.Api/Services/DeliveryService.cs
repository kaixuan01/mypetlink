using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class DeliveryService : SkeletonService, IDeliveryService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly ITagPricingService _pricingService;
    private readonly IAuditLogService _auditLogService;

    public DeliveryService(
        MyPetLinkDbContext dbContext,
        ITagPricingService pricingService,
        IAuditLogService auditLogService)
    {
        _dbContext = dbContext;
        _pricingService = pricingService;
        _auditLogService = auditLogService;
    }

    public IReadOnlyCollection<MalaysiaStateResponse> ListStates() =>
        MalaysiaDelivery.States.Select(state => new MalaysiaStateResponse(
            state.Code, state.Name, state.ZoneCode, state.ZoneName, state.Aliases)).ToArray();

    public async Task<DeliveryQuoteResponse> QuoteAsync(
        DeliveryQuoteRequest request,
        CancellationToken cancellationToken = default)
    {
        var state = ResolveRequiredState(request.StateCode);
        if (request.Quantity != 1)
        {
            throw Validation("quantity", "One physical tag can be ordered at a time.");
        }

        var (_, productQuote) = await _pricingService.GetPurchasableVariantAsync(
            request.ProductVariantKey, cancellationToken);
        if (!string.Equals(productQuote.Currency, MalaysiaDelivery.Currency, StringComparison.OrdinalIgnoreCase))
        {
            throw new ApiException(409, "unsupported_currency", "Delivery is not currently available for this order. Please contact MyPetLink support.");
        }

        var effective = await ResolveEffectiveRateAsync(state, cancellationToken);
        return BuildQuote(state, effective, productQuote, request.Quantity);
    }

    public async Task<IReadOnlyCollection<AdminDeliveryRateResponse>> ListRatesAsync(
        CancellationToken cancellationToken = default)
    {
        var rates = await _dbContext.DeliveryRates.AsNoTracking()
            .OrderBy(rate => rate.DisplayOrder).ThenBy(rate => rate.Name)
            .ToListAsync(cancellationToken);
        var enabledOverrides = await _dbContext.DeliveryStateRateOverrides.AsNoTracking()
            .Where(item => item.IsEnabled)
            .Select(item => item.StateCode)
            .ToListAsync(cancellationToken);
        // Zone membership is derived, so the count cannot drift from
        // MalaysiaDelivery even if a state is remapped in code later.
        var perZone = enabledOverrides
            .Select(code => MalaysiaDelivery.ResolveState(code)?.ZoneCode)
            .Where(zone => zone is not null)
            .GroupBy(zone => zone!)
            .ToDictionary(group => group.Key, group => group.Count());

        return rates
            .Select(rate => ToAdminResponse(
                rate,
                perZone.TryGetValue(rate.ZoneCode, out var count) ? count : 0))
            .ToArray();
    }

    public Task<AdminDeliveryRateResponse> CreateRateAsync(
        Guid? actorId,
        UpsertDeliveryRateRequest request,
        CancellationToken cancellationToken = default) =>
        SaveRateAsync(actorId, null, request, cancellationToken);

    public Task<AdminDeliveryRateResponse> UpdateRateAsync(
        Guid? actorId,
        Guid id,
        UpsertDeliveryRateRequest request,
        CancellationToken cancellationToken = default) =>
        SaveRateAsync(actorId, id, request, cancellationToken);

    public async Task<DeliveryResolution> ResolveAsync(
        string? stateCode,
        TagPricingQuote productQuote,
        int quantity,
        CancellationToken cancellationToken)
    {
        var state = ResolveRequiredState(stateCode);
        var effective = await ResolveEffectiveRateAsync(state, cancellationToken);
        return new DeliveryResolution(
            state,
            effective.ZoneRate,
            BuildQuote(state, effective, productQuote, quantity),
            effective.Source);
    }

    /// <summary>
    /// Server-side pricing precedence:
    ///
    ///   active state override -> active zone default -> delivery unavailable
    ///
    /// The zone default is resolved first and must be active. An override is an
    /// exception to a live zone's price, never a way to make delivery available
    /// in a zone that is switched off.
    /// </summary>
    private async Task<EffectiveDeliveryRate> ResolveEffectiveRateAsync(
        MalaysiaStateDefinition state,
        CancellationToken cancellationToken)
    {
        // Zone remains the master availability control, so this runs first and
        // fails closed.
        var zoneRate = await ResolveActiveRateAsync(state.ZoneCode, cancellationToken);

        var stateOverride = await _dbContext.DeliveryStateRateOverrides
            .AsNoTracking()
            .SingleOrDefaultAsync(
                item => item.StateCode == state.Code && item.IsEnabled,
                cancellationToken);

        // An override replaces both the fee and the threshold. A null override
        // threshold means this state simply has no free-delivery threshold.
        return stateOverride is null
            ? new EffectiveDeliveryRate(
                zoneRate,
                zoneRate.Fee,
                zoneRate.FreeShippingThreshold,
                DeliveryRateSources.ZoneDefault)
            : new EffectiveDeliveryRate(
                zoneRate,
                stateOverride.Fee,
                stateOverride.FreeShippingThreshold,
                DeliveryRateSources.StateOverride);
    }

    private sealed record EffectiveDeliveryRate(
        DeliveryRate ZoneRate,
        decimal Fee,
        decimal? FreeShippingThreshold,
        string Source);

    private async Task<AdminDeliveryRateResponse> SaveRateAsync(
        Guid? actorId,
        Guid? id,
        UpsertDeliveryRateRequest request,
        CancellationToken cancellationToken)
    {
        var zoneCode = request.ZoneCode.Trim().ToUpperInvariant();
        if (!MalaysiaDelivery.Zones.TryGetValue(zoneCode, out _))
            throw Validation("zoneCode", "Choose a supported Malaysia delivery zone.");
        if (!string.Equals(request.Currency.Trim(), MalaysiaDelivery.Currency, StringComparison.OrdinalIgnoreCase))
            throw Validation("currency", "Delivery rates must use MYR.");
        if (string.IsNullOrWhiteSpace(request.Name))
            throw Validation("name", "Enter a delivery rate name.");
        if (request.Fee < 0)
            throw Validation("fee", "Delivery fee cannot be negative.");
        if (request.FreeShippingThreshold < 0)
            throw Validation("freeShippingThreshold", "Free delivery threshold cannot be negative.");

        var duplicate = await _dbContext.DeliveryRates.AnyAsync(
            rate => rate.ZoneCode == zoneCode && (!id.HasValue || rate.Id != id.Value), cancellationToken);
        if (duplicate)
            throw new ApiException(409, "duplicate_value", "A delivery rate already exists for this zone.");

        DeliveryRate rate;
        object? before = null;
        if (id.HasValue)
        {
            rate = await _dbContext.DeliveryRates.SingleOrDefaultAsync(item => item.Id == id.Value, cancellationToken)
                ?? throw new ApiException(404, "not_found", "Delivery rate was not found.");
            if (string.IsNullOrWhiteSpace(request.ConcurrencyToken))
                throw Validation("concurrencyToken", "Refresh this delivery rate before saving changes.");
            try
            {
                _dbContext.Entry(rate).Property(item => item.RowVersion).OriginalValue =
                    Convert.FromBase64String(request.ConcurrencyToken);
            }
            catch (FormatException)
            {
                throw Validation("concurrencyToken", "Refresh this delivery rate before saving changes.");
            }
            before = Snapshot(rate);
        }
        else
        {
            rate = new DeliveryRate();
            _dbContext.DeliveryRates.Add(rate);
        }

        var stateCodes = MalaysiaDelivery.States.Where(state => state.ZoneCode == zoneCode)
            .Select(state => state.Code).ToArray();
        rate.Name = request.Name.Trim();
        rate.ZoneCode = zoneCode;
        rate.ApplicableStateCodesJson = JsonSerializer.Serialize(stateCodes);
        rate.Fee = decimal.Round(request.Fee, 2, MidpointRounding.AwayFromZero);
        rate.Currency = MalaysiaDelivery.Currency;
        rate.FreeShippingThreshold = request.FreeShippingThreshold is null
            ? null : decimal.Round(request.FreeShippingThreshold.Value, 2, MidpointRounding.AwayFromZero);
        rate.IsActive = request.IsActive;
        rate.DisplayOrder = request.DisplayOrder;

        _auditLogService.Append(actorId, ActorType.Admin,
            id.HasValue ? "delivery-rate.update" : "delivery-rate.create",
            "DeliveryRate", rate.Id, before, Snapshot(rate));

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ApiException(409, "concurrency_conflict", "This delivery rate was changed by another administrator. Refresh it and try again.");
        }
        return ToAdminResponse(rate);
    }


    // --- State overrides ---------------------------------------------------

    public async Task<AdminDeliveryZoneStateRatesResponse> ListStateRatesAsync(
        string zoneCode,
        CancellationToken cancellationToken = default)
    {
        var zone = NormalizeZone(zoneCode);
        var zoneRate = await _dbContext.DeliveryRates.AsNoTracking()
            .SingleOrDefaultAsync(rate => rate.ZoneCode == zone, cancellationToken);
        // Zone membership always comes from MalaysiaDelivery, never stored data.
        var states = MalaysiaDelivery.States.Where(state => state.ZoneCode == zone).ToArray();
        var stateCodes = states.Select(state => state.Code).ToArray();
        var overrides = await _dbContext.DeliveryStateRateOverrides.AsNoTracking()
            .Include(item => item.UpdatedByAdminUser)
            .ThenInclude(admin => admin!.User)
            .Where(item => stateCodes.Contains(item.StateCode))
            .ToDictionaryAsync(item => item.StateCode, cancellationToken);

        var rows = states.Select(state =>
        {
            overrides.TryGetValue(state.Code, out var stored);
            var applies = stored is not null && stored.IsEnabled;
            return new AdminDeliveryStateRateResponse(
                state.Code,
                state.Name,
                state.ZoneCode,
                state.ZoneName,
                applies ? stored!.Fee : zoneRate?.Fee ?? 0m,
                applies ? stored!.FreeShippingThreshold : zoneRate?.FreeShippingThreshold,
                zoneRate?.Fee ?? 0m,
                zoneRate?.FreeShippingThreshold,
                applies
                    ? DeliveryRateSources.StateOverrideLabel
                    : DeliveryRateSources.ZoneDefaultLabel,
                stored is not null,
                stored?.IsEnabled ?? false,
                stored?.Fee,
                stored?.FreeShippingThreshold,
                stored?.UpdatedAt,
                stored?.UpdatedByAdminUser?.User?.DisplayName,
                stored is null ? null : Convert.ToBase64String(stored.RowVersion));
        }).ToArray();

        return new AdminDeliveryZoneStateRatesResponse(
            zone,
            MalaysiaDelivery.Zones.GetValueOrDefault(zone, zone),
            zoneRate?.IsActive ?? false,
            zoneRate?.Fee ?? 0m,
            zoneRate?.FreeShippingThreshold,
            rows.Count(row => row.OverrideEnabled),
            rows.Count(row => row.HasOverride),
            rows);
    }

    public async Task<AdminDeliveryZoneStateRatesResponse> SaveStateOverrideAsync(
        Guid? actorId,
        string zoneCode,
        UpsertDeliveryStateOverrideRequest request,
        CancellationToken cancellationToken = default)
    {
        var zone = NormalizeZone(zoneCode);
        var state = MalaysiaDelivery.ResolveState(request.StateCode)
            ?? throw Validation("stateCode", "Choose a supported Malaysian state or federal territory.");

        // A state can never be moved between zones through an override.
        if (!string.Equals(state.ZoneCode, zone, StringComparison.OrdinalIgnoreCase))
        {
            throw Validation(
                "stateCode",
                $"{state.Name} belongs to the {state.ZoneName} delivery zone.");
        }

        if (request.Fee < 0)
            throw Validation("fee", "Delivery fee cannot be negative.");
        if (request.FreeShippingThreshold < 0)
            throw Validation("freeShippingThreshold", "Free delivery threshold cannot be negative.");

        var existing = await _dbContext.DeliveryStateRateOverrides
            .SingleOrDefaultAsync(item => item.StateCode == state.Code, cancellationToken);

        DeliveryStateRateOverride stored;
        object? before = null;
        if (existing is null)
        {
            stored = new DeliveryStateRateOverride { StateCode = state.Code };
            _dbContext.DeliveryStateRateOverrides.Add(stored);
        }
        else
        {
            stored = existing;
            if (string.IsNullOrWhiteSpace(request.ConcurrencyToken))
                throw Validation("concurrencyToken", "Refresh this delivery-rate override before saving changes.");
            try
            {
                _dbContext.Entry(stored).Property(item => item.RowVersion).OriginalValue =
                    Convert.FromBase64String(request.ConcurrencyToken);
            }
            catch (FormatException)
            {
                throw Validation("concurrencyToken", "Refresh this delivery-rate override before saving changes.");
            }

            before = OverrideSnapshot(stored, state);
        }

        stored.Fee = decimal.Round(request.Fee, 2, MidpointRounding.AwayFromZero);
        stored.Currency = MalaysiaDelivery.Currency;
        stored.FreeShippingThreshold = request.FreeShippingThreshold is null
            ? null
            : decimal.Round(request.FreeShippingThreshold.Value, 2, MidpointRounding.AwayFromZero);
        stored.IsEnabled = request.IsEnabled;
        stored.UpdatedByAdminUserId = actorId;

        _auditLogService.Append(
            actorId,
            ActorType.Admin,
            existing is null
                ? "delivery-state-override.create"
                : request.IsEnabled
                    ? "delivery-state-override.update"
                    : "delivery-state-override.disable",
            "DeliveryStateRateOverride",
            stored.Id,
            before,
            OverrideSnapshot(stored, state));

        await SaveOverrideAsync(cancellationToken);
        return await ListStateRatesAsync(zone, cancellationToken);
    }

    public async Task<AdminDeliveryZoneStateRatesResponse> RemoveStateOverrideAsync(
        Guid? actorId,
        string zoneCode,
        string stateCode,
        CancellationToken cancellationToken = default)
    {
        var zone = NormalizeZone(zoneCode);
        var state = MalaysiaDelivery.ResolveState(stateCode)
            ?? throw Validation("stateCode", "Choose a supported Malaysian state or federal territory.");
        if (!string.Equals(state.ZoneCode, zone, StringComparison.OrdinalIgnoreCase))
        {
            throw Validation(
                "stateCode",
                $"{state.Name} belongs to the {state.ZoneName} delivery zone.");
        }

        var stored = await _dbContext.DeliveryStateRateOverrides
            .SingleOrDefaultAsync(item => item.StateCode == state.Code, cancellationToken)
            ?? throw new ApiException(404, "not_found", $"{state.Name} does not have a delivery-rate override.");

        _auditLogService.Append(
            actorId,
            ActorType.Admin,
            "delivery-state-override.remove",
            "DeliveryStateRateOverride",
            stored.Id,
            OverrideSnapshot(stored, state),
            null);
        _dbContext.DeliveryStateRateOverrides.Remove(stored);
        await SaveOverrideAsync(cancellationToken);
        return await ListStateRatesAsync(zone, cancellationToken);
    }

    private async Task SaveOverrideAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ApiException(
                409,
                "concurrency_conflict",
                "This delivery-rate override was updated by another administrator. Refresh and try again.");
        }
        catch (DbUpdateException exception)
            when (UniqueConstraintViolation.IsFor(
                      exception,
                      "IX_DeliveryStateRateOverrides_StateCode"))
        {
            throw new ApiException(
                409,
                "duplicate_value",
                "That state already has a delivery-rate override.");
        }
    }

    private static string NormalizeZone(string zoneCode)
    {
        var zone = zoneCode?.Trim().ToUpperInvariant() ?? "";
        return MalaysiaDelivery.Zones.ContainsKey(zone)
            ? zone
            : throw Validation("zoneCode", "Choose a supported Malaysia delivery zone.");
    }

    private static object OverrideSnapshot(
        DeliveryStateRateOverride stored,
        MalaysiaStateDefinition state) => new
    {
        stored.StateCode,
        stateName = state.Name,
        zoneCode = state.ZoneCode,
        zoneName = state.ZoneName,
        stored.Fee,
        stored.Currency,
        stored.FreeShippingThreshold,
        stored.IsEnabled
    };

    private async Task<DeliveryRate> ResolveActiveRateAsync(string zoneCode, CancellationToken cancellationToken) =>
        await _dbContext.DeliveryRates.AsNoTracking()
            .SingleOrDefaultAsync(rate => rate.ZoneCode == zoneCode && rate.IsActive, cancellationToken)
        ?? throw new ApiException(409, "delivery_unavailable", "Delivery is not currently available for this address. Please contact MyPetLink support.");

    private static DeliveryQuoteResponse BuildQuote(
        MalaysiaStateDefinition state,
        EffectiveDeliveryRate effective,
        TagPricingQuote productQuote,
        int quantity)
    {
        var subtotal = decimal.Round(productQuote.BasePrice * quantity, 2);
        var discount = decimal.Round(productQuote.DiscountAmount * quantity, 2);
        var discountedItems = subtotal - discount;
        var threshold = effective.FreeShippingThreshold;
        var qualifies = threshold.HasValue && discountedItems >= threshold.Value;
        var fee = qualifies ? 0m : effective.Fee;
        var isOverride = string.Equals(
            effective.Source,
            DeliveryRateSources.StateOverride,
            StringComparison.Ordinal);
        var reason = qualifies
            ? $"Free delivery for orders of RM {threshold!.Value:0.00} or more."
            : effective.Fee == 0
                ? isOverride
                    ? $"Free delivery for {state.Name}."
                    : "Free delivery for this zone."
                : null;
        return new DeliveryQuoteResponse(
            state.Code, state.Name, MalaysiaDelivery.CountryName, state.ZoneCode, state.ZoneName,
            effective.ZoneRate.Name, subtotal, discount, fee, fee == 0, reason,
            decimal.Round(discountedItems + fee, 2), MalaysiaDelivery.Currency,
            threshold, isOverride, DeliveryRateSources.LabelFor(effective.Source));
    }

    private static MalaysiaStateDefinition ResolveRequiredState(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw Validation("stateCode", "Please select a state for your delivery address.");
        return MalaysiaDelivery.ResolveState(value)
            ?? throw Validation("stateCode", "Delivery is not currently available for the selected state. Please contact MyPetLink support.");
    }

    private static AdminDeliveryRateResponse ToAdminResponse(
        DeliveryRate rate,
        int enabledStateOverrideCount = 0)
    {
        var states = MalaysiaDelivery.States.Where(state => state.ZoneCode == rate.ZoneCode).ToArray();
        return new(rate.Id, rate.Name, rate.ZoneCode,
            MalaysiaDelivery.Zones.GetValueOrDefault(rate.ZoneCode, rate.ZoneCode),
            states.Select(state => state.Code).ToArray(), states.Select(state => state.Name).ToArray(),
            rate.Fee, rate.Currency, rate.FreeShippingThreshold, rate.IsActive, rate.DisplayOrder,
            rate.CreatedAt, rate.UpdatedAt, Convert.ToBase64String(rate.RowVersion),
            enabledStateOverrideCount);
    }

    private static object Snapshot(DeliveryRate rate) => new
    {
        rate.Name, rate.ZoneCode, rate.Fee, rate.Currency,
        rate.FreeShippingThreshold, rate.IsActive, rate.DisplayOrder
    };

    private static ApiException Validation(string field, string message) =>
        new(400, "validation_failed", "Please check the submitted fields.",
            new Dictionary<string, string[]> { [field] = [message] });
}
