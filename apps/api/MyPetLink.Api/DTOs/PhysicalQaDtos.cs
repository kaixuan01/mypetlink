using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.DTOs;

public sealed class PhysicalQaQuery : PagedQuery
{
    [MaxLength(80)] public string? Batch { get; init; }
    [MaxLength(80)] public string? Sku { get; init; }
    [MaxLength(32)] public string? TagCode { get; init; }
    [MaxLength(32)] public string? QaStatus { get; init; }
    [MaxLength(100)] public string? Shipment { get; init; }
}

public sealed record PhysicalQaItem(Guid Id, string TagCode, string? Batch, string? Sku,
    string? Shipment, PhysicalQaStatus? QaStatus, int Version, string ExpectedQrUrl,
    string ExpectedNfcUrl, string? QrUrl, string? NfcUrl, DateTimeOffset? QrVerifiedAt,
    DateTimeOffset? NfcVerifiedAt, QaCaptureSource? NfcSource, string? NfcSerialNumber,
    PhysicalTagCondition PhysicalCondition, string? Remarks, DateTimeOffset? InspectedAt,
    string? InspectedBy, bool CanInspect);

public sealed record PhysicalQaSummary(int TotalExpected, int Passed, int Failed,
    int NeedsReview, int Pending, int Inspected);

public sealed record PhysicalQaCaptureRequest(
    [Required, MaxLength(32)] string TagCode, int ExpectedVersion,
    QaCaptureSource Source, [Required, MaxLength(600)] string Url,
    [MaxLength(100)] string? SerialNumber);

// ChipId is the normalized NFC chip ID, or null when the phone reported no
// usable ID. A pass needs one; the inspection screen says so before saving.
public sealed record PhysicalQaCaptureResponse(string Evidence, string? ObservedCode,
    bool Matches, string? Problem, string? ChipId = null);

public sealed record SavePhysicalQaRequest(Guid InspectionId, int ExpectedVersion,
    PhysicalQaStatus Decision, PhysicalTagCondition PhysicalCondition,
    [MaxLength(6000)] string? QrEvidence, [MaxLength(6000)] string? NfcEvidence,
    [MaxLength(600)] string? Remarks);

public sealed record PhysicalQaCohortRequest(
    [Required, MaxLength(100)] string ShipmentReference,
    [Required, MinLength(1), MaxLength(10000)] string[] TagCodes,
    [Range(1, 10000)] int ExpectedCount, bool AcknowledgeCommitments = false);

/// <summary>
/// Reconciliation of a shipment manifest against inventory. Matching codes
/// prove the codes exist in inventory, not that each package is physically
/// unique: inspection of every package is what establishes that.
/// </summary>
public sealed record PhysicalQaCohortPreview(
    int ExpectedCount,
    int ManifestEntries,
    int UniqueCodes,
    int Found,
    int Eligible,
    int AlreadyEnrolled,
    int OutstandingRetailReservations,
    IReadOnlyCollection<PhysicalQaManifestDuplicate> DuplicateCodes,
    IReadOnlyCollection<string> InvalidCodes,
    IReadOnlyCollection<string> MissingCodes,
    IReadOnlyCollection<PhysicalQaBatchBreakdown> Batches,
    IReadOnlyCollection<PhysicalQaSkuBreakdown> Skus,
    IReadOnlyCollection<PhysicalQaCommitment> Commitments,
    IReadOnlyCollection<string> Problems,
    bool RequiresAcknowledgement,
    bool ListsTruncated);

public sealed record PhysicalQaManifestDuplicate(string TagCode, int Occurrences);

/// <summary>
/// One production batch touched by the manifest. <c>NotInManifest</c> counts
/// live codes of the same batch that the manifest does not list.
/// </summary>
public sealed record PhysicalQaBatchBreakdown(string? BatchNo, int InManifest, int BatchTotal,
    int NotInManifest, IReadOnlyCollection<string> NotInManifestCodes);

public sealed record PhysicalQaSkuBreakdown(string? Sku, string? ProductName, string? VariantName,
    string? TagVariant, int Count);

public sealed record PhysicalQaCommitment(string TagCode, PhysicalQaCommitmentKind Kind,
    string Reference, string Status);

public sealed record PhysicalQaHistoryItem(Guid Id, string Action, DateTimeOffset CreatedAt,
    string? AdminName, string? Result);
