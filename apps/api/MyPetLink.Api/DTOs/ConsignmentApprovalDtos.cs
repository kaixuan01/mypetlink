using System.ComponentModel.DataAnnotations;
namespace MyPetLink.Api.DTOs;

public sealed record ConsignmentSelfReview(bool Confirmed, [MaxLength(1000)] string Reason,
    [MaxLength(1000)] string ExternalEvidenceReference);
public sealed record SaveConsignmentApprovalPolicyRequest([Required] string ConcurrencyToken,
    [Required] string Mode, Guid? SelfReviewerAdminUserId, bool Confirmed,
    [Required, MaxLength(1000)] string Reason);
public sealed record ConsignmentReviewerOption(Guid AdminUserId, string Name, bool HasSelfReviewCapability);
public sealed record ConsignmentApprovalPolicyResponse(string Mode, Guid? SelfReviewerAdminUserId,
    string? SelfReviewerName, bool CanSelfReview, Guid? UpdatedByAdminUserId, DateTimeOffset? UpdatedAt,
    string ConcurrencyToken, IReadOnlyList<ConsignmentReviewerOption> EligibleReviewers,
    IReadOnlyList<ConsignmentReviewResponse> History, bool SelfReviewerIsEligible = false);
public sealed record ConsignmentReviewResponse(Guid Id, string Action, string ReviewMode, Guid ActorAdminUserId,
    DateTimeOffset RecordedAt, string Reason, string ExternalEvidenceReference,
    string PolicyMode, string? PreviousPolicyMode, Guid? SelfReviewerAdminUserId,
    Guid? PreviousSelfReviewerAdminUserId, Guid? AgreementId, Guid? DispatchId, string RequestReference = "")
{
    public bool SelfReviewConfirmed => ReviewMode == "Self-reviewed (Solo)";
}
