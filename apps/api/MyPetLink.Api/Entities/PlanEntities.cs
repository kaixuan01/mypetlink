namespace MyPetLink.Api.Entities;

public sealed class Plan : AuditableEntity
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public PlanStatus Status { get; set; } = PlanStatus.Available;
    public string PriceLabel { get; set; } = "";
    public string? BillingNote { get; set; }
    public string? Description { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }

    public PlanLimit? Limit { get; set; }
    public ICollection<OwnerProfile> OwnerProfiles { get; set; } = new List<OwnerProfile>();
}

public sealed class PlanLimit : AuditableEntity
{
    public Guid PlanId { get; set; }
    public int MaxPets { get; set; }
    public int MaxMemoriesPerPet { get; set; }
    public int MaxMediaPerMemory { get; set; }
    public int MaxFamilyMembers { get; set; }
    public int MaxCareRecords { get; set; }
    public int ScanHistoryDays { get; set; }
    public bool AllowsSmartTagAddOns { get; set; }
    public bool AllowsFoundReports { get; set; }
    public bool AllowsAdvancedThemes { get; set; }

    public Plan Plan { get; set; } = null!;
}
