namespace MyPetLink.Api.Entities;

/// <summary>
/// Named commission policies. A salesperson is governed by legacy terms until
/// an administrator records their move to a named policy with an effective
/// date; nothing moves anyone automatically.
/// </summary>
public static class CommissionPolicyCodes
{
    public const string V1_1 = "v1.1";
    public static readonly IReadOnlyList<string> All = [V1_1];
    public static bool IsKnown(string? code) => code is not null && All.Contains(code);
}

/// <summary>
/// The recorded acceptance that moves one salesperson onto a named commission
/// policy from an effective date. Append-only: the terms are never edited, and
/// an assignment can only be ended (from a date) by a new audited action.
/// Assignments for one salesperson never overlap, so a sale is governed by at
/// most one policy.
/// </summary>
public sealed class SalespersonPolicyAssignment : AuditableEntity
{
    public Guid SalespersonId { get; set; }
    public Salesperson? Salesperson { get; set; }
    public string PolicyCode { get; set; } = "";

    /// <summary>When the salesperson accepted the policy. The effective date can never precede it.</summary>
    public DateTimeOffset AcceptedAt { get; set; }
    public DateTimeOffset EffectiveFrom { get; set; }
    public DateTimeOffset? EffectiveToExclusive { get; set; }

    /// <summary>The signed agreement, letter or message that records the acceptance.</summary>
    public string AgreementReference { get; set; } = "";
    public string? Notes { get; set; }
    public Guid CreatedByAdminUserId { get; set; }

    public DateTimeOffset? EndedAt { get; set; }
    public Guid? EndedByAdminUserId { get; set; }
    public string? EndReason { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>
/// One continuous stretch during which a salesperson was the merchant's
/// officially assigned servicing representative. Kept beside
/// <see cref="Merchant.AssignedSalespersonId"/>, which is only the current
/// value: a reassignment closes the open row and opens a new one from the
/// moment it was recorded, so earlier periods keep the salesperson they had.
/// At most one row per merchant is open.
/// </summary>
public sealed class MerchantServicingAssignment : Entity
{
    public Guid MerchantId { get; set; }
    public Merchant? Merchant { get; set; }
    public Guid SalespersonId { get; set; }
    public Salesperson? Salesperson { get; set; }
    public string SalespersonCodeSnapshot { get; set; } = "";
    public string SalespersonNameSnapshot { get; set; } = "";
    public DateTimeOffset EffectiveFrom { get; set; }
    public DateTimeOffset? EffectiveToExclusive { get; set; }

    /// <summary>Rollout (the assignment in place when history began) or MerchantEdit.</summary>
    public string Source { get; set; } = "";
    public Guid? RecordedByAdminUserId { get; set; }
    public DateTimeOffset RecordedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

public static class MerchantServicingSources
{
    public const string Rollout = "Rollout";
    public const string MerchantEdit = "MerchantEdit";
}
