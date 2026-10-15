using System.ComponentModel.DataAnnotations;

namespace MyPetLink.Api.DTOs;

// Private operational evidence, stored only in the existing audit history.
public sealed record PublicationPermissionRequest(
    [Required, MaxLength(32)] string Source,
    [Required, MaxLength(500)] string Reference,
    IReadOnlyCollection<Guid>? BranchIds = null);

public sealed record UpdateMerchantListingRequest(
    bool ShowOnWebsite,
    [MaxLength(2000)] string? BusinessDescription,
    [Required] string ConcurrencyToken,
    PublicationPermissionRequest? Permission = null,
    [MaxLength(500)] string? WithdrawalReason = null);

public sealed record UpsertMerchantBranchRequest(
    [Required, MaxLength(160)] string Name,
    MerchantAddressDto Address,
    [MaxLength(2048)] string? GoogleMapsUrl = null,
    [MaxLength(2048)] string? WazeUrl = null,
    [Range(typeof(decimal), "-90", "90")] decimal? Latitude = null,
    [Range(typeof(decimal), "-180", "180")] decimal? Longitude = null,
    [MaxLength(32)] string? ContactPhone = null,
    [MaxLength(32)] string? WhatsApp = null,
    [MaxLength(500)] string? BusinessHours = null,
    bool IsActive = true,
    bool ShowOnWebsite = false,
    [Range(0, 10000)] int DisplayOrder = 0,
    string? ConcurrencyToken = null,
    PublicationPermissionRequest? Permission = null,
    [MaxLength(500)] string? WithdrawalReason = null,
    string? MerchantConcurrencyToken = null);

public sealed record AdminMerchantBranchResponse(
    Guid Id, string Name, MerchantAddressDto Address, string? GoogleMapsUrl,
    string? WazeUrl, decimal? Latitude, decimal? Longitude, string? ContactPhone,
    string? WhatsApp, string? BusinessHours, bool IsActive, bool ShowOnWebsite,
    int DisplayOrder, bool IsPublished, string ConcurrencyToken);

public sealed record AdminMerchantListingResponse(
    bool ShowOnWebsite, string? BusinessDescription, bool IsPublished,
    string? PublicCode, string ConcurrencyToken,
    IReadOnlyCollection<AdminMerchantBranchResponse> Branches,
    bool MerchantIsActive = false,
    Guid? LogoMediaFileId = null,
    string? LogoUrl = null);

public sealed record UpdateMerchantLogoRequest(
    Guid? MediaId,
    [Required] string ConcurrencyToken);

// These contracts intentionally contain no internal IDs, billing contacts,
// registration numbers, sales assignments, consent flags or commercial terms.
public sealed record PublicPartnerBranchResponse(
    string Name, MerchantAddressDto Address, string? GoogleMapsUrl, string? WazeUrl,
    decimal? Latitude, decimal? Longitude, string? ContactPhone, string? WhatsApp,
    string? BusinessHours);

public sealed record PublicPartnerStoreResponse(
    string PublicCode, string Name, string? BusinessDescription,
    IReadOnlyCollection<PublicPartnerBranchResponse> Branches,
    string? LogoUrl = null);
