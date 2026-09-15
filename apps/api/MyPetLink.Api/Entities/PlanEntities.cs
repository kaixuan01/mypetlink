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
    /// <summary>
    /// How large a PRIVATE archive a plan allows, per pet.
    ///
    /// Renamed from <c>MaxMemoriesPerPet</c>, which was misleading: it now
    /// governs only the private personal archive. Public Moments are social
    /// contributions and are deliberately NOT capped by it — a social product
    /// in which a free account can post ten times ever does not work.
    ///
    /// Public Moments remain bounded by the controls that actually protect the
    /// system rather than the wallet: the Moment-creation rate limit, the
    /// per-Moment media cap (<see cref="MaxMediaPerMemory"/>), upload size
    /// limits, and ordinary authorization.
    /// </summary>
    public int MaxPrivateMemoriesPerPet { get; set; }
    public int MaxMediaPerMemory { get; set; }
    public int MaxFamilyMembers { get; set; }
    public int MaxCareRecords { get; set; }
    public int ScanHistoryDays { get; set; }
    public bool AllowsSmartTagAddOns { get; set; }
    public bool AllowsFoundReports { get; set; }
    public bool AllowsAdvancedThemes { get; set; }

    public Plan Plan { get; set; } = null!;
}
