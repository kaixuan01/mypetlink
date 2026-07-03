using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record PublicPetProfileResponse(
    string PublicCode,
    string PublicSlug,
    string Name,
    string Species,
    string? CustomSpecies,
    PetLifecycleStatus LifecycleStatus,
    bool LostModeEnabled,
    string? OwnerDisplayName,
    string? GeneralArea,
    string? Bio,
    string? MemorialMessage,
    IReadOnlyCollection<PublicMemorySummaryResponse> Memories,
    IReadOnlyCollection<PublicCareSummaryResponse> CareRecords);

public sealed record PublicMemorySummaryResponse(
    string Title,
    DateOnly? MomentDate,
    string? Type,
    string? Caption);

public sealed record PublicCareSummaryResponse(
    string Type,
    string Title,
    DateOnly? RecordDate,
    DateOnly? DueDate,
    string? Provider,
    string? Notes);

public sealed record PublicSafetyContactResponse(
    string? OwnerDisplayName,
    string? PhoneE164,
    string? WhatsappE164,
    string? EmergencyContactE164);

public sealed record PublicSafetyPageResponse(
    string SafetyCode,
    string State,
    string Name,
    string Species,
    PetLifecycleStatus LifecycleStatus,
    bool LostModeEnabled,
    string? GeneralArea,
    string? SafetyNote,
    string? EmergencyNote,
    string? LostLastSeenArea,
    DateTimeOffset? LostLastSeenDateTime,
    string? LostMessage,
    string? LostRewardNote,
    string? LostExtraContactInstruction,
    bool ShowFoundLocationAction,
    PublicSafetyContactResponse? Contact);

public sealed record QrSafetyPageResponse(
    string SafetyCode,
    string Name,
    PetLifecycleStatus LifecycleStatus,
    bool LostModeEnabled,
    string? SafetyNote,
    string? EmergencyNote,
    bool ShowPhone,
    bool ShowWhatsapp);

public sealed record TagScanPageResponse(
    string State,
    string TagCode,
    string? Status,
    PublicSafetyPageResponse? Profile);

public sealed record SubmitScanLocationConsentRequest(
    Guid TagScanId,
    decimal? Latitude,
    decimal? Longitude,
    bool Consent);
