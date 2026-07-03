namespace MyPetLink.Api.Entities;

public sealed class Pet : AuditableEntity
{
    public Guid OwnerUserId { get; set; }
    public string Slug { get; set; } = "";
    public string Name { get; set; } = "";
    public string Species { get; set; } = "";
    public string? CustomSpecies { get; set; }
    public string? Breed { get; set; }
    public string? Gender { get; set; }
    public string? Color { get; set; }
    public DateOnly? Birthday { get; set; }
    public DateOnly? AdoptionDay { get; set; }
    public string? EstimatedAgeLabel { get; set; }
    public string? GeneralArea { get; set; }
    public string ProfileTheme { get; set; } = "default";
    public PetLifecycleStatus LifecycleStatus { get; set; } = PetLifecycleStatus.Active;
    public PetLifecycleStatus? PreviousLifecycleStatus { get; set; }
    public DateOnly? MemorialPassedAwayDate { get; set; }
    public string? MemorialMessage { get; set; }
    public bool ShowMemorialOnPublicProfile { get; set; }
    public bool LostModeEnabled { get; set; }
    public string? LostLastSeenArea { get; set; }
    public DateTimeOffset? LostLastSeenDateTime { get; set; }
    public string? LostMessage { get; set; }
    public string? LostRewardNote { get; set; }
    public string? LostExtraContactInstruction { get; set; }
    public string? Bio { get; set; }
    public string PersonalityTagsJson { get; set; } = "[]";
    public string? FavoriteFood { get; set; }
    public string? FavoriteToy { get; set; }
    public string? SafetyNote { get; set; }
    public string? EmergencyNote { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }

    public User OwnerUser { get; set; } = null!;
    public PetContact? Contact { get; set; }
    public PetPublicProfile? PublicProfile { get; set; }
    public PetSafetySetting? SafetySetting { get; set; }
    public ICollection<PetMemory> Memories { get; set; } = new List<PetMemory>();
    public ICollection<CareRecord> CareRecords { get; set; } = new List<CareRecord>();
    public ICollection<SmartTag> SmartTags { get; set; } = new List<SmartTag>();
}

public sealed class PetContact : AuditableEntity
{
    public Guid PetId { get; set; }
    public bool UseOwnerDefaults { get; set; } = true;
    public string? OwnerDisplayName { get; set; }
    public string? PhoneE164 { get; set; }
    public string? WhatsappE164 { get; set; }
    public string? EmergencyContactE164 { get; set; }
    public string? GeneralAreaOverride { get; set; }

    public Pet Pet { get; set; } = null!;
}

public sealed class PetPublicProfile : AuditableEntity
{
    public Guid PetId { get; set; }
    public string PublicCode { get; set; } = "";
    public string SlugSnapshot { get; set; } = "";
    public bool ShowOwnerName { get; set; }
    public bool ShowGeneralArea { get; set; } = true;
    public bool ShowCareBadges { get; set; } = true;
    public bool ShowMoments { get; set; } = true;
    public bool ShowTimeline { get; set; } = true;
    public bool ShowBirthdayOnTimeline { get; set; }
    public bool ShowAdoptionDayOnTimeline { get; set; }
    public bool ShowHealthSummary { get; set; }
    public bool IsPublicProfileEnabled { get; set; } = true;

    public Pet Pet { get; set; } = null!;
}

public sealed class PetSafetySetting : AuditableEntity
{
    public Guid PetId { get; set; }
    public string SafetyCode { get; set; } = "";
    public bool QrSafetyEnabled { get; set; } = true;
    public bool ShowPhone { get; set; }
    public bool ShowWhatsapp { get; set; } = true;
    public bool ShowEmergencyNote { get; set; } = true;
    public bool ShowFoundLocationAction { get; set; } = true;

    public Pet Pet { get; set; } = null!;
}
