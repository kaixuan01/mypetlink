namespace MyPetLink.Api.Entities;

/// <summary>
/// Admin-managed operational defaults for manually fulfilled parcels.
/// Delivery prices remain owned by DeliveryRates and are intentionally not
/// represented here.
/// </summary>
public sealed class ShippingFulfilmentSetting : AuditableEntity
{
    public string SenderName { get; set; } = "";
    public string? CompanyName { get; set; }
    public string SenderPhone { get; set; } = "";
    public string? SenderEmail { get; set; }
    public string AddressLine1 { get; set; } = "";
    public string? AddressLine2 { get; set; }
    public string City { get; set; } = "";
    public string Postcode { get; set; } = "";
    public string StateCode { get; set; } = "";
    public string Country { get; set; } = "Malaysia";
    public decimal DefaultParcelWeightKg { get; set; } = 0.5m;
    public decimal DefaultParcelLengthCm { get; set; } = 18m;
    public decimal DefaultParcelWidthCm { get; set; } = 12m;
    public decimal DefaultParcelHeightCm { get; set; } = 3m;
    public bool CustomerTrackingLinksEnabled { get; set; }
    public Guid? UpdatedByAdminUserId { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public AdminUser? UpdatedByAdminUser { get; set; }
}

/// <summary>
/// A selectable manual-shipping courier. Code is the immutable business key;
/// DisplayName may change without rewriting order snapshots.
/// </summary>
public sealed class ShippingCourierProvider : AuditableEntity
{
    public string Code { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public bool IsActive { get; set; }
    public bool IsDefault { get; set; }
    public string? TrackingUrlTemplate { get; set; }
    public int DisplayOrder { get; set; }
    public string? InternalNotes { get; set; }
    public Guid? UpdatedByAdminUserId { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public AdminUser? UpdatedByAdminUser { get; set; }
}
