using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Common;

namespace MyPetLink.Api.DTOs;

public sealed record MalaysiaStateResponse(string Code, string Name, string ZoneCode, string ZoneName, IReadOnlyCollection<string> Aliases);

public sealed record DeliveryQuoteRequest(
    [MaxLength(8)] string? StateCode,
    [Required, MaxLength(32)] string ProductVariantKey,
    [Range(1, 1)] int Quantity);

public sealed record DeliveryQuoteResponse(
    string StateCode,
    string StateName,
    string Country,
    string ZoneCode,
    string ZoneName,
    string DeliveryMethod,
    decimal ItemSubtotal,
    decimal DiscountAmount,
    decimal DeliveryFee,
    bool IsFreeDelivery,
    string? FreeDeliveryReason,
    decimal Total,
    string Currency,
    // Effective threshold actually used for this quote, after any state
    // override. Null means the fee always applies.
    decimal? FreeDeliveryThreshold = null,
    bool StateOverrideApplied = false,
    // Safe display label: "Zone default" or "State override".
    string RateSource = DeliveryRateSources.ZoneDefaultLabel);

public sealed record UpsertDeliveryRateRequest(
    [Required, MaxLength(120)] string Name,
    [Required, MaxLength(16)] string ZoneCode,
    [Range(typeof(decimal), "0", "999999.99")] decimal Fee,
    [Required, MaxLength(3)] string Currency,
    [Range(typeof(decimal), "0", "999999.99")] decimal? FreeShippingThreshold,
    bool IsActive,
    [Range(0, 10000)] int DisplayOrder,
    string? ConcurrencyToken);

public sealed record AdminDeliveryRateResponse(
    Guid Id,
    string Name,
    string ZoneCode,
    string ZoneName,
    IReadOnlyCollection<string> ApplicableStateCodes,
    IReadOnlyCollection<string> ApplicableStateNames,
    decimal Fee,
    string Currency,
    decimal? FreeShippingThreshold,
    bool IsActive,
    int DisplayOrder,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string ConcurrencyToken,
    // Enabled state-level exceptions to this zone default.
    int EnabledStateOverrideCount = 0);

// --- State overrides ------------------------------------------------------

public sealed record AdminDeliveryStateRateResponse(
    string StateCode,
    string StateName,
    string ZoneCode,
    string ZoneName,
    decimal EffectiveFee,
    decimal? EffectiveFreeShippingThreshold,
    decimal ZoneDefaultFee,
    decimal? ZoneDefaultFreeShippingThreshold,
    // "Zone default" or "State override".
    string Source,
    bool HasOverride,
    bool OverrideEnabled,
    decimal? OverrideFee,
    decimal? OverrideFreeShippingThreshold,
    DateTimeOffset? OverrideUpdatedAt,
    string? OverrideUpdatedBy,
    string? ConcurrencyToken);

public sealed record AdminDeliveryZoneStateRatesResponse(
    string ZoneCode,
    string ZoneName,
    bool ZoneActive,
    decimal ZoneDefaultFee,
    decimal? ZoneDefaultFreeShippingThreshold,
    int EnabledOverrideCount,
    int StoredOverrideCount,
    IReadOnlyCollection<AdminDeliveryStateRateResponse> States);

public sealed record UpsertDeliveryStateOverrideRequest(
    [Required, MaxLength(8)] string StateCode,
    [Range(typeof(decimal), "0", "999999.99")] decimal Fee,
    [Range(typeof(decimal), "0", "999999.99")] decimal? FreeShippingThreshold,
    bool IsEnabled,
    string? ConcurrencyToken);
