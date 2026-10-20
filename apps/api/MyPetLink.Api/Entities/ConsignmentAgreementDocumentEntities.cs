namespace MyPetLink.Api.Entities;

// One agreement document issued for the partner's signature. Append-only: the
// terms and both parties are frozen in SnapshotJson and the exact PDF sent is
// kept, so a later edit of the draft can never change what was issued.
public sealed class ConsignmentAgreementDocument : Entity
{
    public Guid AgreementId { get; set; }
    public ConsignmentAgreement Agreement { get; set; } = null!;
    public Guid MerchantId { get; set; }
    public string AgreementReference { get; set; } = "";
    public int AgreementVersion { get; set; }
    public int IssueNumber { get; set; }
    // SHA-256 of the commercial terms alone, so a signed copy can be matched to
    // the terms in force whatever happens to the parties' contact details.
    public string TermsFingerprint { get; set; } = "";
    public string SnapshotJson { get; set; } = "";
    public byte[] Content { get; set; } = [];
    public string ContentSha256 { get; set; } = "";
    public string FileName { get; set; } = "";
    public DateTimeOffset IssuedAt { get; set; }
    public Guid IssuedByAdminUserId { get; set; }
}

// The partner's actual signed copy, exactly as uploaded. Append-only and never
// the generated document: it is linked to the issue it answers and keeps that
// issue's terms fingerprint, so it can never vouch for terms edited later.
public sealed class ConsignmentSignedAgreement : Entity
{
    public Guid AgreementId { get; set; }
    public Guid MerchantId { get; set; }
    public int AgreementVersion { get; set; }
    public Guid IssuedDocumentId { get; set; }
    public ConsignmentAgreementDocument IssuedDocument { get; set; } = null!;
    public string TermsFingerprint { get; set; } = "";
    public string OriginalFileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long FileSize { get; set; }
    public string Sha256 { get; set; } = "";
    public byte[] Content { get; set; } = [];
    public string PartnerSignatoryName { get; set; } = "";
    public string? PartnerSignatoryDesignation { get; set; }
    public DateOnly PartnerSignedOn { get; set; }
    public string? CompanySignatoryName { get; set; }
    public string? CompanySignatoryDesignation { get; set; }
    public DateOnly? CompanySignedOn { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset UploadedAt { get; set; }
    public Guid UploadedByAdminUserId { get; set; }
}
