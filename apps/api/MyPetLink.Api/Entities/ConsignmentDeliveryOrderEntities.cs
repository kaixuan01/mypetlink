namespace MyPetLink.Api.Entities;

// The Delivery Order for one consignment delivery: the handover form both parties sign.
// Issued at most once per delivery and append-only. The number, both parties, the delivered
// SKU quantities and the exact PDF are frozen at issue, so a re-download is always the same
// document and a later merchant or branch edit never changes it. Issuing one moves no stock.
// Received By is never signed here: the partner signs the printed copy.
public sealed class ConsignmentDeliveryOrder : Entity
{
    public Guid DispatchId { get; set; }
    public ConsignmentDispatch Dispatch { get; set; } = null!;
    public Guid MerchantId { get; set; }
    public string DeliveryOrderNumber { get; set; } = "";
    public int DeliveredQuantity { get; set; }
    public string SnapshotJson { get; set; } = "";
    public byte[] Content { get; set; } = [];
    public string ContentSha256 { get; set; } = "";
    public string FileName { get; set; } = "";
    public DateTimeOffset IssuedAt { get; set; }
    public Guid IssuedByAdminUserId { get; set; }

    // Set only when the issuing administrator explicitly signed Delivered By with their own
    // signature. The signer is always the issuer; the image itself lives only inside the PDF.
    public Guid? SignatureId { get; set; }
    public Guid? SignedByAdminUserId { get; set; }
    public DateTimeOffset? SignedAt { get; set; }
    public string? SignatoryName { get; set; }
    public string? SignatoryPosition { get; set; }
    public string? SignatureImageSha256 { get; set; }
}
