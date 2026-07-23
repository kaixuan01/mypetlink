namespace MyPetLink.Api.Entities;

public sealed class TagScan : Entity
{
    public Guid? SmartTagId { get; set; }
    public Guid? PetId { get; set; }
    public string TagCode { get; set; } = "";
    public TagScanResolvedState ResolvedState { get; set; } = TagScanResolvedState.NotFound;
    public TagScanSource Source { get; set; } = TagScanSource.Unknown;
    public DateTimeOffset ScanTime { get; set; } = DateTimeOffset.UtcNow;
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public string? Country { get; set; }
    public string? City { get; set; }
    public string? IpAddress { get; set; }
    public string? Browser { get; set; }
    public string? OperatingSystem { get; set; }
    public string? DeviceType { get; set; }
    public string? Referer { get; set; }
    public string? UserAgent { get; set; }
    public bool FinderConsentPreciseLocation { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public SmartTag? SmartTag { get; set; }
    public Pet? Pet { get; set; }
}

public sealed class FoundReport : Entity
{
    public Guid PetId { get; set; }
    public Guid? SmartTagId { get; set; }
    public Guid? TagScanId { get; set; }
    public string? FinderMessage { get; set; }
    public string? FinderContact { get; set; }
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public string? Country { get; set; }
    public string? City { get; set; }
    public bool PreciseLocationConsent { get; set; }
    public DateTimeOffset SubmittedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ArchivedAt { get; set; }

    public Pet Pet { get; set; } = null!;
    public SmartTag? SmartTag { get; set; }
    public TagScan? TagScan { get; set; }
}

public sealed class AuditLog : Entity
{
    public Guid? ActorId { get; set; }
    public ActorType ActorType { get; set; } = ActorType.System;
    public string Action { get; set; } = "";
    public string Entity { get; set; } = "";
    public Guid? EntityId { get; set; }
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AppSetting : AuditableEntity
{
    public string Key { get; set; } = "";
    public string ValueJson { get; set; } = "{}";
    public string Category { get; set; } = "";
    public string? Description { get; set; }
    public bool IsPublic { get; set; }
    public Guid? UpdatedByAdminUserId { get; set; }

    public AdminUser? UpdatedByAdminUser { get; set; }
}
