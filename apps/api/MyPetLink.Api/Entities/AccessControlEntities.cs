namespace MyPetLink.Api.Entities;

/// <summary>
/// A reusable Admin Portal permission template.
///
/// Named <c>AdminRoleDefinition</c> because <see cref="AdminRole"/> is the
/// legacy single-role enum that this table replaces as the authorization
/// source. The enum column on <see cref="AdminUser"/> is retained read-only so
/// an application rollback still finds the value it expects.
/// </summary>
public sealed class AdminRoleDefinition : AuditableEntity
{
    /// <summary>Stable identifier used by seeding and deployment scripts. Never renamed.</summary>
    public string Code { get; set; } = "";

    public string Name { get; set; } = "";
    public string Description { get; set; } = "";

    /// <summary>Built-in role: capabilities may be tuned, but it can never be deleted.</summary>
    public bool IsSystemRole { get; set; }

    /// <summary>
    /// Founder access. A role with this flag holds every capability that
    /// exists now and every capability added later, so a new module is never
    /// invisible to the people responsible for the whole system. Only a holder
    /// of such a role may grant or remove one.
    /// </summary>
    public bool GrantsAllCapabilities { get; set; }

    public int SortOrder { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public ICollection<AdminRoleCapability> Capabilities { get; set; } = new List<AdminRoleCapability>();
    public ICollection<AdminUserRoleAssignment> Assignments { get; set; } = new List<AdminUserRoleAssignment>();
}

/// <summary>One capability granted by one role.</summary>
public sealed class AdminRoleCapability : Entity
{
    public Guid AdminRoleId { get; set; }

    /// <summary>
    /// A key from the capability catalogue. Rows whose key is no longer in the
    /// catalogue are ignored when access is resolved, so a removed capability
    /// can never keep granting access.
    /// </summary>
    public string Capability { get; set; } = "";

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public AdminRoleDefinition AdminRole { get; set; } = null!;
}

/// <summary>One role held by one admin user. An admin may hold several.</summary>
public sealed class AdminUserRoleAssignment : Entity
{
    public Guid AdminUserId { get; set; }
    public Guid AdminRoleId { get; set; }
    public DateTimeOffset AssignedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? AssignedByAdminUserId { get; set; }

    public AdminUser AdminUser { get; set; } = null!;
    public AdminRoleDefinition AdminRole { get; set; } = null!;
    public AdminUser? AssignedByAdminUser { get; set; }
}
