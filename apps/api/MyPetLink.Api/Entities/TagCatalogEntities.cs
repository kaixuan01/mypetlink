namespace MyPetLink.Api.Entities;

public sealed class TagProduct : AuditableEntity
{
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public string? ShortDescription { get; set; }
    public string? Description { get; set; }
    public bool IsPublished { get; set; }
    public bool IsArchived { get; set; }
    public int SortOrder { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public ICollection<TagProductVariant> Variants { get; set; } = new List<TagProductVariant>();
    public ICollection<TagProductMedia> Media { get; set; } = new List<TagProductMedia>();
}

public sealed class TagProductVariant : AuditableEntity
{
    public Guid TagProductId { get; set; }
    public string PublicKey { get; set; } = "";
    public string Sku { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public bool SupportsQr { get; set; } = true;
    public bool SupportsNfc { get; set; }
    public string TagVariant { get; set; } = "Standard";
    public decimal? WidthMm { get; set; }
    public decimal? HeightMm { get; set; }
    public decimal? ThicknessMm { get; set; }
    public decimal? WeightGrams { get; set; }
    public string? Material { get; set; }
    public string? Shape { get; set; }
    public string? Colour { get; set; }
    public string? PackagingType { get; set; }
    public decimal BasePrice { get; set; }
    public string Currency { get; set; } = "MYR";
    public decimal? CompareAtPrice { get; set; }
    public string? PrintTemplateCode { get; set; }
    public string? ProductionNotes { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsPurchasable { get; set; }
    public int SortOrder { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public TagProduct TagProduct { get; set; } = null!;
    public ICollection<TagProductMedia> Media { get; set; } = new List<TagProductMedia>();
    public ICollection<PromotionVariant> PromotionVariants { get; set; } = new List<PromotionVariant>();
    public ICollection<SmartTagBatch> SmartTagBatches { get; set; } = new List<SmartTagBatch>();
    public ICollection<SmartTag> SmartTags { get; set; } = new List<SmartTag>();
    public ICollection<TagOrderItem> OrderItems { get; set; } = new List<TagOrderItem>();
}

// Product media reuses MediaFiles for storage and lifecycle. This table only
// records catalog ownership, display ordering, and customer-facing alt text.
public sealed class TagProductMedia : Entity
{
    public Guid TagProductId { get; set; }
    public Guid? TagProductVariantId { get; set; }
    public Guid MediaFileId { get; set; }
    public int SortOrder { get; set; }
    public string AltText { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ArchivedAt { get; set; }

    public TagProduct TagProduct { get; set; } = null!;
    public TagProductVariant? TagProductVariant { get; set; }
    public MediaFile MediaFile { get; set; } = null!;
}

public sealed class Promotion : AuditableEntity
{
    public string Name { get; set; } = "";
    public string? InternalDescription { get; set; }
    public string? DisplayLabel { get; set; }
    public bool IsActive { get; set; }
    public bool IsAutomatic { get; set; } = true;
    public PromotionDiscountType DiscountType { get; set; }
    public decimal DiscountValue { get; set; }
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public int Priority { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public ICollection<PromotionVariant> PromotionVariants { get; set; } = new List<PromotionVariant>();
    public ICollection<TagOrderItem> OrderItems { get; set; } = new List<TagOrderItem>();
}

public sealed class PromotionVariant
{
    public Guid PromotionId { get; set; }
    public Guid TagProductVariantId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Promotion Promotion { get; set; } = null!;
    public TagProductVariant TagProductVariant { get; set; } = null!;
}

// Immutable commercial snapshot for one purchased SKU. Existing pre-catalog
// orders remain readable through TagOrder's legacy fields and have no row here.
public sealed class TagOrderItem : AuditableEntity
{
    public Guid OrderId { get; set; }
    public Guid? ProductVariantId { get; set; }
    public string SkuSnapshot { get; set; } = "";
    public string ProductNameSnapshot { get; set; } = "";
    public string VariantNameSnapshot { get; set; } = "";
    public decimal UnitBasePrice { get; set; }
    public int Quantity { get; set; } = 1;
    public decimal Subtotal { get; set; }
    public Guid? PromotionId { get; set; }
    public string? PromotionNameSnapshot { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal FinalUnitPrice { get; set; }
    public decimal FinalAmount { get; set; }
    public string Currency { get; set; } = "MYR";

    public TagOrder Order { get; set; } = null!;
    public TagProductVariant? ProductVariant { get; set; }
    public Promotion? Promotion { get; set; }
}
