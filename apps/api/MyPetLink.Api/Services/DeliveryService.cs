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

        var rate = await ResolveActiveRateAsync(state.ZoneCode, cancellationToken);
        return BuildQuote(state, rate, productQuote, request.Quantity);
    }

    public async Task<IReadOnlyCollection<AdminDeliveryRateResponse>> ListRatesAsync(
        CancellationToken cancellationToken = default) =>
        (await _dbContext.DeliveryRates.AsNoTracking()
            .OrderBy(rate => rate.DisplayOrder).ThenBy(rate => rate.Name)
            .ToListAsync(cancellationToken))
        .Select(ToAdminResponse).ToArray();

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
        var rate = await ResolveActiveRateAsync(state.ZoneCode, cancellationToken);
        return new DeliveryResolution(state, rate, BuildQuote(state, rate, productQuote, quantity));
    }

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

    private async Task<DeliveryRate> ResolveActiveRateAsync(string zoneCode, CancellationToken cancellationToken) =>
        await _dbContext.DeliveryRates.AsNoTracking()
            .SingleOrDefaultAsync(rate => rate.ZoneCode == zoneCode && rate.IsActive, cancellationToken)
        ?? throw new ApiException(409, "delivery_unavailable", "Delivery is not currently available for this address. Please contact MyPetLink support.");

    private static DeliveryQuoteResponse BuildQuote(
        MalaysiaStateDefinition state, DeliveryRate rate, TagPricingQuote productQuote, int quantity)
    {
        var subtotal = decimal.Round(productQuote.BasePrice * quantity, 2);
        var discount = decimal.Round(productQuote.DiscountAmount * quantity, 2);
        var discountedItems = subtotal - discount;
        var qualifies = rate.FreeShippingThreshold.HasValue && discountedItems >= rate.FreeShippingThreshold.Value;
        var fee = qualifies ? 0m : rate.Fee;
        var reason = qualifies
            ? $"Free delivery for orders of RM {rate.FreeShippingThreshold!.Value:0.00} or more."
            : rate.Fee == 0 ? "Free delivery for this zone." : null;
        return new DeliveryQuoteResponse(
            state.Code, state.Name, MalaysiaDelivery.CountryName, state.ZoneCode, state.ZoneName,
            rate.Name, subtotal, discount, fee, fee == 0, reason,
            decimal.Round(discountedItems + fee, 2), MalaysiaDelivery.Currency);
    }

    private static MalaysiaStateDefinition ResolveRequiredState(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw Validation("stateCode", "Please select a state for your delivery address.");
        return MalaysiaDelivery.ResolveState(value)
            ?? throw Validation("stateCode", "Delivery is not currently available for the selected state. Please contact MyPetLink support.");
    }

    private static AdminDeliveryRateResponse ToAdminResponse(DeliveryRate rate)
    {
        var states = MalaysiaDelivery.States.Where(state => state.ZoneCode == rate.ZoneCode).ToArray();
        return new(rate.Id, rate.Name, rate.ZoneCode,
            MalaysiaDelivery.Zones.GetValueOrDefault(rate.ZoneCode, rate.ZoneCode),
            states.Select(state => state.Code).ToArray(), states.Select(state => state.Name).ToArray(),
            rate.Fee, rate.Currency, rate.FreeShippingThreshold, rate.IsActive, rate.DisplayOrder,
            rate.CreatedAt, rate.UpdatedAt, Convert.ToBase64String(rate.RowVersion));
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
