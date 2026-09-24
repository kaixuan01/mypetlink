using MyPetLink.Api.Entities;

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
    bool ShowCareBadges,
    bool ShowMoments,
    bool ShowTimeline,
    bool ShowBirthdayOnTimeline,
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
    IReadOnlyCollection<PublicCareSummaryResponse> CareRecords,

    /// <summary>
    /// Who shared this pet, when both the owner and the pet participate in
    /// social. Null otherwise — a shareable link is not social participation.
    /// </summary>
    PublicOwnerAttributionResponse? SharedBy = null,

    /// <summary>
    /// Derived from the pet's Smart Tags: true when at least one is active.
    /// A signal only — it carries no tag code, order or inventory detail, and
    /// nothing stores it.
    /// </summary>
    bool HasSmartTagProtection = false,

    /// <summary>
    /// Whether this pet participates in social at all. Independent of
    /// <c>IsPublicProfileEnabled</c>: the share page works either way.
    /// </summary>
    bool IsSocialEnabled = false);

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

/// <summary>One pet a public Moment is about, as a visitor may see it.</summary>
public sealed record PublicMomentSubjectResponse(
    string Name,
    string? PublicSlug,
    string? PhotoUrl,

    /// <summary>
    /// Whether this is the Moment's own pet — the one that owns its Moments tab,
    /// its Life Timeline and its plan allowance. Derived from
    /// <c>PetMemories.PetId</c>, never stored on the membership row.
    /// </summary>
    bool IsPrimarySubject = false,

    /// <summary>
    /// Whether this pet is currently marked missing. Carried so a card can show
    /// a quiet status, never to broadcast or amplify: Lost Mode changes a pet's
    /// safety state and does not create or boost social content.
    /// </summary>
    bool LostModeEnabled = false);

public sealed record PublicMemorySummaryResponse(
    string Title,
    DateOnly? MomentDate,
    string? Type,
    string? Caption,
    MemoryVisibility Visibility,
    bool ShowOnPublicProfile,
    bool ShowInLifeTimeline,
    string? TimelineNote,
    IReadOnlyCollection<MemoryMediaResponse> Media,
    /// <summary>
    /// Set only on a Moment this pet joined through another household's
    /// collaboration: the household that wrote it. Null for the pet's own
    /// household's Moments.
    /// </summary>
    PublicOwnerAttributionResponse? MomentBy = null);

public sealed record PublicCareSummaryResponse(
    string Type,
    DateOnly? RecordDate);

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
    PublicSafetyContactResponse? Contact,

    /// <summary>
    /// The pet's Share Profile, when the owner has switched it on and the pet's
    /// lifecycle still serves that page. Null otherwise, which is how the finder
    /// page decides whether to offer the link at all.
    ///
    /// Community participation is NOT a condition. It was until the Share
    /// Profile and Community were decoupled; see
    /// docs/architecture/product-model.md.
    ///
    /// A slug and nothing else. It is the PET's page, never the owner's
    /// Community identity: somebody scanned an animal, and routing them straight
    /// into a person's Community profile is not what they came for.
    ///
    /// Every entry point to the Safety Profile answers this the same way, and
    /// they all answer it through <see cref="ShareProfileBridge"/>.
    ///
    /// <b>Deliberately required, with no default.</b> It was optional, and the
    /// tag scan path simply stopped constructing the response one argument
    /// early — so the same pet offered the link to a finder who opened
    /// <c>/q/{safetyCode}</c> and withheld it from one who scanned the collar,
    /// and nothing failed to compile. A new construction site must now answer
    /// the question rather than inherit an answer.
    /// </summary>
    string? PublicProfileSlug);

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
