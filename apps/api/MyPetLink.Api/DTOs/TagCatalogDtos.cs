using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.DTOs;

public sealed class AdminTagProductQuery : PagedQuery
{
    [MaxLength(200)] public string? Search { get; init; }
    public bool? Published { get; init; }
    public bool? Archived { get; init; }
    public bool? SupportsQr { get; init; }
    public bool? SupportsNfc { get; init; }
    public bool? Purchasable { get; init; }
    [MaxLength(40)] public string? SortBy { get; init; }
    [MaxLength(8)] public string? SortDir { get; init; }
}

public sealed record TagProductMediaRequest(
    Guid MediaFileId,
    Guid? ProductVariantId,
    [param: Range(0, 10_000)] int SortOrder,
    [param: Required, MaxLength(300)] string AltText);

public sealed record UpsertTagProductRequest(
    [param: Required, MaxLength(160)] string Name,
    [param: Required, MaxLength(120)] string Slug,
    [param: MaxLength(300)] string? ShortDescription,
    [param: MaxLength(4000)] string? Description,
    bool IsPublished,
    [param: Range(0, 10_000)] int SortOrder,
    IReadOnlyCollection<TagProductMediaRequest>? Media,
    string? ConcurrencyToken);

public sealed record UpsertTagProductVariantRequest(
    [param: Required, MaxLength(80)] string Sku,
    [param: Required, MaxLength(160)] string DisplayName,
    bool SupportsQr,
    bool SupportsNfc,
    [param: Required] Guid? TagVariantPresetId,
    decimal? WidthMm,
    decimal? HeightMm,
    decimal? ThicknessMm,
    decimal? WeightGrams,
    [param: MaxLength(160)] string? Material,
    [param: MaxLength(120)] string? Shape,
    [param: MaxLength(120)] string? Colour,
    [param: MaxLength(200)] string? PackagingType,
    decimal BasePrice,
    [param: Required, MaxLength(3)] string Currency,
    decimal? CompareAtPrice,
    [param: MaxLength(120)] string? PrintTemplateCode,
    [param: MaxLength(1000)] string? ProductionNotes,
    bool IsActive,
    bool IsPurchasable,
    [param: Range(0, 10_000)] int SortOrder,
    string? ConcurrencyToken);

public sealed record ArchiveCatalogRecordRequest(
    [param: Required] string ConcurrencyToken);

public sealed record UpsertTagVariantPresetRequest(
    [param: Required, MaxLength(40)] string Code,
    [param: Required, MaxLength(80)] string DisplayName,
    [param: MaxLength(400)] string? Description,
    bool IsActive,
    [param: Range(0, 10_000)] int SortOrder,
    string? ConcurrencyToken);

// SkuCount tells the Admin how many SKUs reference the preset — referenced
// presets can only be deactivated, never deleted.
public sealed record AdminTagVariantPresetResponse(
    Guid Id,
    string Code,
    string DisplayName,
    string? Description,
    bool IsActive,
    int SortOrder,
    int SkuCount,
    DateTimeOffset UpdatedAt,
    string ConcurrencyToken);

public sealed record AdminTagProductListItemResponse(
    Guid Id,
    string Name,
    string Slug,
    bool IsPublished,
    bool IsArchived,
    int VariantCount,
    int PurchasableVariantCount,
    DateTimeOffset UpdatedAt,
    string ConcurrencyToken);

public sealed record TagProductMediaResponse(
    Guid Id,
    Guid MediaFileId,
    Guid? ProductVariantId,
    int SortOrder,
    string AltText,
    string? Url);

// Lightweight projection for admin Product/SKU selectors (Tag Inventory
// generation form, Promotion applicable-SKU picker). Deliberately excludes
// media, descriptions, order-item counts, audit data, and concurrency tokens.
// Inventory counts are resolved with a single grouped query, not per variant,
// so the whole catalog loads in one request instead of one-per-product.
public sealed record AdminCatalogOptionVariantResponse(
    Guid Id,
    string Sku,
    string DisplayName,
    bool SupportsQr,
    bool SupportsNfc,
    string TagVariant,
    decimal? WidthMm,
    decimal? HeightMm,
    decimal? ThicknessMm,
    string? Material,
    string? PrintTemplateCode,
    decimal BasePrice,
    string Currency,
    bool IsActive,
    bool IsPurchasable,
    int InventoryCount);

public sealed record AdminCatalogOptionProductResponse(
    Guid Id,
    string Name,
    bool IsPublished,
    IReadOnlyCollection<AdminCatalogOptionVariantResponse> Variants);

public sealed record AdminTagProductVariantResponse(
    Guid Id,
    Guid ProductId,
    string PublicKey,
    string Sku,
    string DisplayName,
    bool SupportsQr,
    bool SupportsNfc,
    Guid? TagVariantPresetId,
    string TagVariant,
    decimal? WidthMm,
    decimal? HeightMm,
    decimal? ThicknessMm,
    decimal? WeightGrams,
    string? Material,
    string? Shape,
    string? Colour,
    string? PackagingType,
    decimal BasePrice,
    string Currency,
    decimal? CompareAtPrice,
    string? PrintTemplateCode,
    string? ProductionNotes,
    bool IsActive,
    bool IsPurchasable,
    bool IsArchived,
    bool ProductionFieldsLocked,
    int InventoryCount,
    int SortOrder,
    DateTimeOffset UpdatedAt,
    string ConcurrencyToken);

public sealed record AdminTagProductResponse(
    Guid Id,
    string Name,
    string Slug,
    string? ShortDescription,
    string? Description,
    bool IsPublished,
    bool IsArchived,
    int SortOrder,
    IReadOnlyCollection<TagProductMediaResponse> Media,
    IReadOnlyCollection<AdminTagProductVariantResponse> Variants,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string ConcurrencyToken);

public sealed class AdminPromotionQuery : PagedQuery
{
    [MaxLength(200)] public string? Search { get; init; }
    public bool? Active { get; init; }
}

public sealed record UpsertPromotionRequest(
    [param: Required, MaxLength(160)] string Name,
    [param: MaxLength(1000)] string? InternalDescription,
    [param: MaxLength(160)] string? DisplayLabel,
    bool IsActive,
    bool IsAutomatic,
    PromotionDiscountType DiscountType,
    decimal DiscountValue,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    [param: Range(0, 10_000)] int Priority,
    [param: Required, MinLength(1)] Guid[] ProductVariantIds,
    string? ConcurrencyToken);

public sealed record AdminPromotionResponse(
    Guid Id,
    string Name,
    string? InternalDescription,
    string? DisplayLabel,
    bool IsActive,
    bool IsAutomatic,
    PromotionDiscountType DiscountType,
    decimal DiscountValue,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    int Priority,
    IReadOnlyCollection<Guid> ProductVariantIds,
    DateTimeOffset UpdatedAt,
    string ConcurrencyToken);

public sealed record TagProductPriceResponse(
    decimal BasePrice,
    decimal DiscountAmount,
    decimal FinalPrice,
    string Currency,
    string? PromotionName,
    string? PromotionLabel,
    DateTimeOffset? PromotionEndsAt);

public sealed record PublicTagProductMediaResponse(
    string Url,
    string AltText,
    int SortOrder);

public sealed record PublicTagProductVariantResponse(
    string Key,
    string Sku,
    string Name,
    bool SupportsQr,
    bool SupportsNfc,
    string TagVariant,
    decimal? WidthMm,
    decimal? HeightMm,
    decimal? ThicknessMm,
    decimal? WeightGrams,
    string? Material,
    string? Shape,
    string? Colour,
    string? PackagingType,
    TagProductPriceResponse Price,
    bool InStock,
    IReadOnlyCollection<PublicTagProductMediaResponse> Media);

public sealed record PublicTagProductResponse(
    string Slug,
    string Name,
    string? ShortDescription,
    string? Description,
    IReadOnlyCollection<PublicTagProductMediaResponse> Media,
    IReadOnlyCollection<PublicTagProductVariantResponse> Variants);
