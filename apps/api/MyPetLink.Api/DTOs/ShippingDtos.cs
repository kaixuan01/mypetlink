using System.ComponentModel.DataAnnotations;

namespace MyPetLink.Api.DTOs;

public sealed record AdminShippingFulfilmentResponse(
    AdminShippingSettingsResponse Settings,
    IReadOnlyCollection<AdminShippingCourierResponse> Couriers,
    IReadOnlyCollection<ShippingStateOptionResponse> MalaysiaStates);

public sealed record AdminShippingSettingsResponse(
    string SenderName,
    string? CompanyName,
    string SenderPhone,
    string? SenderEmail,
    string AddressLine1,
    string? AddressLine2,
    string City,
    string Postcode,
    string StateCode,
    string Country,
    decimal DefaultParcelWeightKg,
    decimal DefaultParcelLengthCm,
    decimal DefaultParcelWidthCm,
    decimal DefaultParcelHeightCm,
    bool CustomerTrackingLinksEnabled,
    bool SenderConfigured,
    DateTimeOffset UpdatedAt,
    string? UpdatedBy,
    string RowVersion);

public sealed record UpdateShippingSettingsRequest(
    [Required, MaxLength(160)] string? SenderName,
    [MaxLength(160)] string? CompanyName,
    [Required, MaxLength(32)] string? SenderPhone,
    [EmailAddress, MaxLength(254)] string? SenderEmail,
    [Required, MaxLength(240)] string? AddressLine1,
    [MaxLength(240)] string? AddressLine2,
    [Required, MaxLength(120)] string? City,
    [Required, RegularExpression(@"^\d{5}$", ErrorMessage = "Enter a valid 5-digit Malaysian postcode.")] string? Postcode,
    [Required, MaxLength(8)] string? StateCode,
    [Required, MaxLength(80)] string? Country,
    [Range(typeof(decimal), "0.01", "100")] decimal DefaultParcelWeightKg,
    [Range(typeof(decimal), "0.1", "300")] decimal DefaultParcelLengthCm,
    [Range(typeof(decimal), "0.1", "300")] decimal DefaultParcelWidthCm,
    [Range(typeof(decimal), "0.1", "300")] decimal DefaultParcelHeightCm,
    bool CustomerTrackingLinksEnabled,
    [Required] string? RowVersion);

public sealed record AdminShippingCourierResponse(
    Guid Id,
    string Code,
    string DisplayName,
    bool IsActive,
    bool IsDefault,
    string? TrackingUrlTemplate,
    int DisplayOrder,
    string? InternalNotes,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string? UpdatedBy,
    string RowVersion);

public sealed record CreateShippingCourierRequest(
    [Required, RegularExpression(@"^[A-Z0-9][A-Z0-9_-]{1,31}$",
        ErrorMessage = "Use 2–32 uppercase letters, numbers, hyphens or underscores.")] string? Code,
    [Required, MaxLength(120)] string? DisplayName,
    bool IsActive,
    bool IsDefault,
    [MaxLength(500)] string? TrackingUrlTemplate,
    [Range(0, 10000)] int DisplayOrder,
    [MaxLength(1000)] string? InternalNotes);

public sealed record UpdateShippingCourierRequest(
    [Required, MaxLength(120)] string? DisplayName,
    bool IsActive,
    bool IsDefault,
    [MaxLength(500)] string? TrackingUrlTemplate,
    [Range(0, 10000)] int DisplayOrder,
    [MaxLength(1000)] string? InternalNotes,
    [Required] string? RowVersion);

public sealed record SetShippingCourierActiveRequest(
    bool IsActive,
    [Required] string? RowVersion);

public sealed record SetDefaultShippingCourierRequest(
    [Required] string? RowVersion);

public sealed record ShippingStateOptionResponse(
    string Code,
    string Name);

/// <summary>
/// Safe subset used by the manual shipment editor. It deliberately excludes
/// templates, notes, audit fields and sender details.
/// </summary>
public sealed record ShippingCourierOptionResponse(
    string Code,
    string DisplayName,
    bool IsDefault,
    int DisplayOrder);
