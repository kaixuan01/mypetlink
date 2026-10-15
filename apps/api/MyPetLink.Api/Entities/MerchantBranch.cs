namespace MyPetLink.Api.Entities;

// Physical locations only. Billing, fulfilment and inventory remain merchant-level.
public sealed class MerchantBranch : AuditableEntity
{
    public Guid MerchantId { get; set; }
    public Merchant Merchant { get; set; } = null!;
    public string Name { get; set; } = "";
    public string AddressLine1 { get; set; } = "";
    public string? AddressLine2 { get; set; }
    public string City { get; set; } = "";
    public string State { get; set; } = "";
    public string Postcode { get; set; } = "";
    public string Country { get; set; } = "Malaysia";
    public string? GoogleMapsUrl { get; set; }
    public string? WazeUrl { get; set; }
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public string? ContactPhone { get; set; }
    public string? WhatsApp { get; set; }
    public string? BusinessHours { get; set; }
    public bool IsActive { get; set; } = true;
    public bool ShowOnWebsite { get; set; }
    public int DisplayOrder { get; set; }
    public byte[] RowVersion { get; set; } = [];
}
