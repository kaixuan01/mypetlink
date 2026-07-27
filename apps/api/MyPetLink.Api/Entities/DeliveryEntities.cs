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
