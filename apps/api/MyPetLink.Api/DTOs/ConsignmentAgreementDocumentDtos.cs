using System.ComponentModel.DataAnnotations;
namespace MyPetLink.Api.DTOs;

/// <summary>
/// Where an agreement's paperwork stands. Status is derived from the saved agreement,
/// its issued documents and signed copies; it never records an approval of its own.
/// </summary>
public sealed record ConsignmentAgreementDocumentSummary(Guid AgreementId, string Reference, int Version,
    string Status, string StatusLabel, IReadOnlyList<string> MissingForDocument, string? CurrentTermsFingerprint,
    Guid? CurrentIssuedDocumentId, bool IssuedPartyDetailsChanged, bool SignedCopyMatchesCurrentTerms,
    bool CanIssue, string ConcurrencyToken,
    IReadOnlyList<ConsignmentIssuedAgreementResponse> IssuedDocuments,
    IReadOnlyList<ConsignmentSignedAgreementResponse> SignedCopies);
public sealed record ConsignmentIssuedAgreementResponse(Guid Id, int IssueNumber, int AgreementVersion,
    string TermsFingerprint, string ContentSha256, string FileName, DateTimeOffset IssuedAt,
    string? IssuedByName, bool IsCurrent);
public sealed record ConsignmentSignedAgreementResponse(Guid Id, Guid IssuedDocumentId, int IssueNumber, int AgreementVersion,
    string OriginalFileName, string ContentType, long FileSize, string Sha256, string PartnerSignatoryName,
    string? PartnerSignatoryDesignation, DateOnly PartnerSignedOn, string? CompanySignatoryName,
    string? CompanySignatoryDesignation, DateOnly? CompanySignedOn, string? Notes, DateTimeOffset UploadedAt,
    string? UploadedByName, bool MatchesCurrentTerms);
public sealed record IssueConsignmentAgreementRequest([Required] string ConcurrencyToken);
public sealed record UploadConsignmentSignedAgreementRequest(
    Guid IssuedDocumentId, [Required, MaxLength(200)] string FileName, [Required, MaxLength(64)] string ContentType,
    [Required] string ContentBase64, [Required, MaxLength(200)] string PartnerSignatoryName,
    [MaxLength(200)] string? PartnerSignatoryDesignation, DateOnly PartnerSignedOn,
    [MaxLength(200)] string? CompanySignatoryName, [MaxLength(200)] string? CompanySignatoryDesignation,
    DateOnly? CompanySignedOn, [MaxLength(1000)] string? Notes);
