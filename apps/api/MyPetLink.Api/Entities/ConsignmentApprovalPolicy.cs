namespace MyPetLink.Api.Entities;

public enum ConsignmentApprovalMode { Team, Solo }

// One organisation-wide policy. Nomination restricts the capability; it never grants other access.
public sealed class ConsignmentApprovalPolicy
{
    public int Id { get; set; } = 1;
    public ConsignmentApprovalMode Mode { get; set; }
    public Guid? SelfReviewerAdminUserId { get; set; }
    public Guid? UpdatedByAdminUserId { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

// Append-only review journal, also retaining policy changes and their previous values.
public sealed class ConsignmentReviewEvent : Entity
{
    public Guid? AgreementId { get; set; }
    public Guid? DispatchId { get; set; }
    public string Action { get; set; } = "";
    public string ReviewMode { get; set; } = "";
    public string PolicyMode { get; set; } = "";
    public string? PreviousPolicyMode { get; set; }
    public Guid? SelfReviewerAdminUserId { get; set; }
    public Guid? PreviousSelfReviewerAdminUserId { get; set; }
    public string RequestReference { get; set; } = "";
    public string PolicyVersion { get; set; } = "";
    public Guid ActorAdminUserId { get; set; }
    public DateTimeOffset RecordedAt { get; set; }
    public string Reason { get; set; } = "";
    public string ExternalEvidenceReference { get; set; } = "";
    // Reviews of records that are neither an agreement nor a dispatch (sales reports, price terms).
    public string? SubjectType { get; set; }
    public Guid? SubjectId { get; set; }
}

// The starting terms offered for a new agreement. One organisation-wide row (category D):
// copied into the form when a draft is started, never read again for a saved agreement.
// Seeded inactive with suggested values; nothing is applied until an administrator activates it.
public sealed class ConsignmentDefaultTerms
{
    public int Id { get; set; } = 1;
    public int Revision { get; set; }
    public bool IsActive { get; set; }
    public decimal? PartnerCommissionPercentage { get; set; }
    public int? TrialDurationDays { get; set; }
    public string? DurationTerms { get; set; }
    public string? SettlementFrequency { get; set; }
    public int? PaymentDeadlineDays { get; set; }
    public string? DiscountTerms { get; set; }
    public string? ReturnTerms { get; set; }
    public string? LossTerms { get; set; }
    public Guid? UpdatedByAdminUserId { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

// Append-only copy of every saved revision of the default terms, for audit.
public sealed class ConsignmentDefaultTermsRevision
{
    public int Revision { get; set; }
    public bool IsActive { get; set; }
    public decimal? PartnerCommissionPercentage { get; set; }
    public int? TrialDurationDays { get; set; }
    public string? DurationTerms { get; set; }
    public string? SettlementFrequency { get; set; }
    public int? PaymentDeadlineDays { get; set; }
    public string? DiscountTerms { get; set; }
    public string? ReturnTerms { get; set; }
    public string? LossTerms { get; set; }
    public Guid? RecordedByAdminUserId { get; set; }
    public DateTimeOffset RecordedAt { get; set; }
}
