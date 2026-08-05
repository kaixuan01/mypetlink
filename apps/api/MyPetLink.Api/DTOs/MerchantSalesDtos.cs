using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

// Admin-only contracts. Internal notes appear here because every consumer is an
// authenticated admin; nothing in this file is safe to hand to a merchant.

public sealed record MerchantAddressDto(
    [Required, MaxLength(240)] string AddressLine1,
    [MaxLength(240)] string? AddressLine2,
    [Required, MaxLength(16)] string Postcode,
    [Required, MaxLength(120)] string City,
    [Required, MaxLength(120)] string State,
    [Required, MaxLength(80)] string Country);

public sealed record UpsertMerchantRequest(
    [Required, MaxLength(200)] string LegalBusinessName,
    [MaxLength(200)] string? TradingName,
    [MaxLength(64)] string? BusinessRegistrationNumber,
    [MaxLength(64)] string? TaxIdentificationNumber,
    [MaxLength(64)] string? SstRegistrationNumber,
    [Required, MaxLength(160)] string ContactPerson,
    [Required, MaxLength(254)] string ContactEmail,
    [Required, MaxLength(32)] string ContactPhone,
    MerchantAddressDto BillingAddress,
    bool DeliveryAddressSameAsBilling,
    MerchantAddressDto? DeliveryAddress,
    Guid? AssignedSalespersonId,
    [MaxLength(2000)] string? InternalNotes,
    string? ConcurrencyToken = null);

public sealed record MerchantResponse(
    Guid Id,
    string MerchantCode,
    string LegalBusinessName,
    string? TradingName,
    string? BusinessRegistrationNumber,
    string? TaxIdentificationNumber,
    string? SstRegistrationNumber,
    string ContactPerson,
    string ContactEmail,
    string ContactPhone,
    MerchantAddressDto BillingAddress,
    bool DeliveryAddressSameAsBilling,
    MerchantAddressDto DeliveryAddress,
    Guid? AssignedSalespersonId,
    string? AssignedSalespersonName,
    MerchantPaymentTerm PaymentTerm,
    string? InternalNotes,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string ConcurrencyToken);

public sealed record UpsertSalespersonRequest(
    [Required, MaxLength(160)] string Name,
    [MaxLength(254)] string? Email,
    [MaxLength(32)] string? Phone,
    [Range(typeof(decimal), "0", "100")] decimal DefaultCommissionPercentage,
    [MaxLength(2000)] string? InternalNotes,
    string? ConcurrencyToken = null);

public sealed record SalespersonResponse(
    Guid Id,
    string SalespersonCode,
    string Name,
    string? Email,
    string? Phone,
    decimal DefaultCommissionPercentage,
    string? InternalNotes,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string ConcurrencyToken);

/// <summary>
/// One quotation line as submitted. Only the variant, quantity, approved price
/// and discount are read — every descriptive field is resolved server-side, so a
/// tampered product name or subtotal cannot reach a document.
/// </summary>
public sealed record UpsertQuotationItemRequest(
    [Required] Guid ProductVariantId,
    [Range(1, MerchantSalesConstants.MaxQuantityPerLine)] int Quantity,
    [Range(typeof(decimal), "0", "999999.99")] decimal WholesaleUnitPrice,
    [Range(typeof(decimal), "0", "999999.99")] decimal LineDiscount = 0m);

public sealed record UpsertQuotationRequest(
    [Required] Guid MerchantId,
    Guid? SalespersonId,
    DateTimeOffset? ValidUntil,
    [Range(typeof(decimal), "0", "999999.99")] decimal DiscountTotal,
    [Range(typeof(decimal), "0", "999999.99")] decimal DeliveryFee,
    [MaxLength(2000)] string? CustomerNotes,
    [MaxLength(2000)] string? InternalNotes,
    IReadOnlyCollection<UpsertQuotationItemRequest> Items,
    string? ConcurrencyToken = null);

public sealed record QuotationItemResponse(
    Guid Id,
    Guid ProductId,
    Guid ProductVariantId,
    string ProductName,
    string SkuCode,
    string OptionName,
    bool SupportsQr,
    bool SupportsNfc,
    decimal? UnitWeightGrams,
    int Quantity,
    decimal WholesaleUnitPrice,
    decimal LineDiscount,
    decimal LineSubtotal,
    int SortOrder);

public sealed record MerchantSalesAddressSnapshot(
    string AddressLine1,
    string? AddressLine2,
    string Postcode,
    string City,
    string State,
    string Country);

public sealed record QuotationResponse(
    Guid Id,
    string QuotationNumber,
    Guid MerchantId,
    string MerchantCode,
    string MerchantLegalName,
    string? MerchantTradingName,
    string ContactPerson,
    string ContactEmail,
    string ContactPhone,
    MerchantSalesAddressSnapshot BillingAddress,
    MerchantSalesAddressSnapshot DeliveryAddress,
    Guid? SalespersonId,
    string? SalespersonCode,
    string? SalespersonName,
    DateTimeOffset QuotationDate,
    DateTimeOffset ValidUntil,
    string Currency,
    MerchantPaymentTerm PaymentTerm,
    decimal MerchandiseSubtotal,
    decimal DiscountTotal,
    decimal DeliveryFee,
    decimal GrandTotal,
    string? CustomerNotes,
    string? InternalNotes,
    MerchantQuotationStatus Status,
    Guid? ConvertedMerchantOrderId,
    string? ConvertedMerchantOrderNumber,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? SentAt,
    DateTimeOffset? AcceptedAt,
    DateTimeOffset? RejectedAt,
    DateTimeOffset? ExpiredAt,
    DateTimeOffset? ConvertedAt,
    DateTimeOffset? CancelledAt,
    IReadOnlyCollection<QuotationItemResponse> Items,
    string ConcurrencyToken);

public sealed record MerchantOrderItemResponse(
    Guid Id,
    Guid ProductId,
    Guid ProductVariantId,
    string ProductName,
    string SkuCode,
    string OptionName,
    bool SupportsQr,
    bool SupportsNfc,
    decimal? UnitWeightGrams,
    int Quantity,
    decimal WholesaleUnitPrice,
    decimal LineDiscount,
    decimal LineSubtotal,
    int SortOrder);

public sealed record MerchantOrderResponse(
    Guid Id,
    string MerchantOrderNumber,
    Guid? SourceQuotationId,
    string? SourceQuotationNumber,
    Guid MerchantId,
    string MerchantCode,
    string MerchantLegalName,
    string? MerchantTradingName,
    string ContactPerson,
    string ContactEmail,
    string ContactPhone,
    MerchantSalesAddressSnapshot BillingAddress,
    MerchantSalesAddressSnapshot DeliveryAddress,
    Guid? SalespersonId,
    string? SalespersonCode,
    string? SalespersonName,
    MerchantPaymentTerm PaymentTerm,
    string Currency,
    decimal MerchandiseSubtotal,
    decimal DiscountTotal,
    decimal DeliveryFee,
    decimal GrandTotal,
    MerchantOrderPaymentStatus PaymentStatus,
    MerchantOrderFulfilmentStatus FulfilmentStatus,
    string? InternalNotes,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? PaymentConfirmedAt,
    DateTimeOffset? CancelledAt,
    IReadOnlyCollection<MerchantOrderItemResponse> Items,
    string ConcurrencyToken);

/// <summary>
/// Conversion result. <paramref name="AlreadyConverted"/> lets a repeated call
/// be answered with the original order instead of an error, so a retried
/// request is safe.
/// </summary>
public sealed record ConvertQuotationResult(
    MerchantOrderResponse Order,
    bool AlreadyConverted);

public sealed record ConcurrencyTokenRequest(string? ConcurrencyToken = null);
