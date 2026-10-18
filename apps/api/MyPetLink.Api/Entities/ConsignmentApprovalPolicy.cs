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
}
