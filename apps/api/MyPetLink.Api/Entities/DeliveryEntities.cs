namespace MyPetLink.Api.Entities;

public sealed class DeliveryRate : AuditableEntity
{
    public string Name { get; set; } = "";
    public string ZoneCode { get; set; } = "";
    public string ApplicableStateCodesJson { get; set; } = "[]";
    public decimal Fee { get; set; }
    public string Currency { get; set; } = "MYR";
    public decimal? FreeShippingThreshold { get; set; }
    public bool IsActive { get; set; }
    public int DisplayOrder { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>
/// Optional per-state exception to a zone's default delivery rate.
///
/// The state's zone is NOT stored here. It is always derived from
/// <c>MalaysiaDelivery</c> so stored data can never drift from the canonical
/// state-to-zone mapping, and an administrator can never move a state between
/// zones by editing an override.
///
/// A missing or disabled row means the zone default applies. An override never
/// makes delivery available: the zone default must still be active.
/// </summary>
public sealed class DeliveryStateRateOverride : AuditableEntity
{
    /// <summary>Canonical MalaysiaDelivery state code, for example "KTN".</summary>
    public string StateCode { get; set; } = "";
    public decimal Fee { get; set; }
    public string Currency { get; set; } = "MYR";
    public decimal? FreeShippingThreshold { get; set; }
    public bool IsEnabled { get; set; }
    public Guid? UpdatedByAdminUserId { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public AdminUser? UpdatedByAdminUser { get; set; }
}
