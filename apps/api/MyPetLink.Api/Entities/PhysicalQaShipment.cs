namespace MyPetLink.Api.Entities;

/// <summary>
/// One enrolled shipment manifest. A shipment reference names exactly one
/// manifest: the server-computed fingerprint of its distinct, normalized tag
/// codes and the expected package count are fixed at enrollment and never
/// updated, so the shipment cannot later gain, lose or swap a code. A
/// correction would need its own explicit, audited workflow.
/// </summary>
public sealed class PhysicalQaShipment : Entity
{
    public string ShipmentReference { get; set; } = "";
    public int ExpectedCount { get; set; }
    // SHA-256 (uppercase hex) of the sorted distinct codes joined with "\n".
    public string ManifestSha256 { get; set; } = "";
    public Guid EnrolledByAdminUserId { get; set; }
    public AdminUser? EnrolledByAdminUser { get; set; }
    public DateTimeOffset EnrolledAt { get; set; }
}
