using MyPetLink.Api.Entities;
using System.Text.Json.Serialization;

namespace MyPetLink.Api.DTOs;

public sealed record PublicPetProfileResponse(
    string PublicCode,
    string PublicSlug,
    string PublicProfileVersion,
    string? SafetyCode,
    string Name,
    string Species,
    string? CustomSpecies,
    string? Breed,
    string? Gender,
    string? Color,
    DateOnly? Birthday,
    short? EstimatedBirthYear,
    PetAgeInfoResponse Age,
    DateOnly? AdoptionDay,
    string ProfileTheme,
    PetLifecycleStatus LifecycleStatus,
    bool LostModeEnabled,
    string? LostLastSeenArea,
    DateTimeOffset? LostLastSeenDateTime,
    string? LostMessage,
    string? LostRewardNote,
    string? LostExtraContactInstruction,
    string? OwnerDisplayName,
    string? GeneralArea,
    string? ProfilePhotoUrl,
    string? CoverPhotoUrl,
    byte CoverPositionX,
    byte CoverPositionY,
    string? Bio,
    IReadOnlyList<string> PersonalityTags,
    IReadOnlyList<string> FavoriteFoods,
    IReadOnlyList<string> FavoriteToys,
    IReadOnlyList<string> Allergies,
    string? MemorialMessage,
    IReadOnlyCollection<PublicMemorySummaryResponse> Memories,
    IReadOnlyCollection<PublicCareSummaryResponse> CareRecords);

public sealed record PublicProfileSocialResponse(
    string PublicCode,
    string PublicSlug,
    string PublicProfileVersion,
    string Name,
    string Species,
    string? CustomSpecies,
    string? Breed,
    string AgeDisplayLabel,
    PetLifecycleStatus LifecycleStatus,
    bool LostModeEnabled,
    string? ProfilePhotoUrl,
    string? CoverPhotoUrl,
    byte CoverPositionX,
    byte CoverPositionY,
    // Bounded presentation key only, so the Share Card can match the profile a
    // reader will land on. Never any owner, contact, safety, or tag data.
    string ProfileTheme);

public sealed record PublicMemorySummaryResponse(
    string Title,
    DateOnly? MomentDate,
    string? Type,
    string? Caption,
    bool ShowOnPublicProfile,
    bool ShowInLifeTimeline,
    string? TimelineNote,
    IReadOnlyCollection<MemoryMediaResponse> Media);

public sealed record PublicCareSummaryResponse(
    string Type,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Title,
    DateOnly? RecordDate,
    DateOnly? DueDate,
    CareRecordPublicVisibility PublicVisibility,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Notes);

/// <summary>
/// Deliberately tiny projection used only to build link-preview metadata for the
/// finder-facing pages (<c>/q</c>, <c>/t</c>, <c>/n</c>).
///
/// Link previews are public and are cached by platforms we do not control, so
/// this record carries no contact details, no owner identity, no location, no
/// codes and no identifiers — only what a visitor already sees at the top of the
/// page. <see cref="PublicSlug"/> is populated solely when the owner has the
/// Public Share Profile switched on, which is what allows the existing social
/// card to be reused; otherwise the preview falls back to generic branding.
/// </summary>
public sealed record PublicFinderSocialResponse(
    string State,
    string Name,
    string? PublicSlug,
    string? PublicProfileVersion);

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
    DateOnly? Birthday,
    short? EstimatedBirthYear,
    PetAgeInfoResponse Age,
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
    string? ProfilePhotoUrl,
    string? CoverPhotoUrl,
    byte CoverPositionX,
    byte CoverPositionY,
    string ProfileTheme,
    IReadOnlyList<string> Allergies,
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
    TagScanSource ScanSource,
    PublicSafetyPageResponse? Profile);

public sealed record SubmitScanLocationConsentRequest(
    Guid TagScanId,
    decimal? Latitude,
    decimal? Longitude,
    bool Consent);
