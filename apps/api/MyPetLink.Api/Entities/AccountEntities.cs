namespace MyPetLink.Api.Entities;

public sealed class User : AuditableEntity
{
    public string Email { get; set; } = "";
    public string NormalizedEmail { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string? PhoneE164 { get; set; }
    public string? WhatsappE164 { get; set; }
    public UserStatus Status { get; set; } = UserStatus.Active;
    public DateTimeOffset? LastLoginAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }

    public OwnerProfile? OwnerProfile { get; set; }
    public AdminUser? AdminUser { get; set; }
    public ICollection<ExternalLogin> ExternalLogins { get; set; } = new List<ExternalLogin>();
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
    public ICollection<Pet> Pets { get; set; } = new List<Pet>();
}

public sealed class ExternalLogin : AuditableEntity
{
    public Guid UserId { get; set; }
    public string Provider { get; set; } = "Google";
    public string ProviderSubjectId { get; set; } = "";
    public string ProviderEmail { get; set; } = "";
    public string? ProviderDisplayName { get; set; }

    public User User { get; set; } = null!;
}

public sealed class RefreshToken : Entity
{
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public Guid? ReplacedByTokenId { get; set; }
    public string? CreatedByIp { get; set; }
    public string? RevokedByIp { get; set; }
    public string? UserAgent { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User User { get; set; } = null!;
    public RefreshToken? ReplacedByToken { get; set; }
}

public sealed class OwnerProfile : AuditableEntity
{
    public Guid UserId { get; set; }
    public Guid PlanId { get; set; }
    public string OwnerDisplayName { get; set; } = "";
    public string? DefaultGeneralArea { get; set; }
    public string PrivacyDefaultsJson { get; set; } = "{}";
    public string NotificationPreferencesJson { get; set; } = "{}";
    public DateTimeOffset? GrandfatheredAt { get; set; }
    public string? PlanOverrideJson { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }

    public User User { get; set; } = null!;
    public Plan Plan { get; set; } = null!;
}

public sealed class AdminUser : AuditableEntity
{
    public Guid UserId { get; set; }
    public AdminRole Role { get; set; } = AdminRole.Admin;
    public bool IsActive { get; set; } = true;
    public Guid? CreatedByAdminUserId { get; set; }
    public DateTimeOffset? DisabledAt { get; set; }

    public User User { get; set; } = null!;
    public AdminUser? CreatedByAdminUser { get; set; }
}
