namespace MyPetLink.Api.DTOs;

// Admin-only, and always about the signed-in administrator's own signature: no request names
// whose signature it is. The image itself is never part of a response; it is fetched from its
// own endpoint, by its owner only.

/// <summary>
/// Saves a new version of your signature. Leave the image out to keep the current one and
/// change only the name or position. CurrentSignatureId is the version you are replacing (null
/// when you have none), so a change made in another window is never silently overwritten.
/// </summary>
public sealed record SaveDocumentSignatureRequest(
    string? SignatoryName,
    string? SignatoryPosition,
    string? ImageBase64,
    string? ContentType,
    Guid? CurrentSignatureId);

public sealed record RemoveDocumentSignatureRequest(Guid SignatureId);

public sealed record DocumentSignatureSummary(
    Guid Id,
    string SignatoryName,
    string SignatoryPosition,
    int ImageWidth,
    int ImageHeight,
    DateTimeOffset SavedAt);

public sealed record DocumentSignatureStatusResponse(
    DocumentSignatureSummary? Signature,
    int MaxUploadBytes);

/// <summary>
/// Optional when generating a Delivery Order. Naming your signature applies it to Delivered By
/// only when Confirmed is also true; without a signature the document is issued unsigned.
/// </summary>
public sealed record ConsignmentDeliveryOrderSigningRequest(Guid? SignatureId, bool Confirmed);
