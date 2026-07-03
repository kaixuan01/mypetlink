using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record PetContactRequest(
    bool UseOwnerDefaults,
    string? OwnerDisplayName,
    string? PhoneE164,
    string? WhatsappE164,
    string? EmergencyContactE164,
    string? GeneralAreaOverride);

public sealed record PetVisibilityRequest(
    bool ShowOwnerName,
    bool ShowGeneralArea,
    bool ShowPhone,
    bool ShowWhatsapp,
    bool ShowEmergencyNote,
    bool ShowCareBadges,
    bool ShowMoments,
    bool ShowTimeline,
    bool ShowBirthdayOnTimeline,
    bool ShowAdoptionDayOnTimeline,
    bool ShowHealthSummary);

public sealed record CreatePetRequest(
    [property: Required, MaxLength(120)] string Name,
    [property: Required, MaxLength(80)] string Species,
    string? CustomSpecies,
    string? Breed,
    string? Gender,
    string? Color,
    DateOnly? Birthday,
    DateOnly? AdoptionDay,
    string? GeneralArea,
    string? Bio,
    string? ProfileTheme,
    PetContactRequest? Contact,
    PetVisibilityRequest? Visibility,
    string? SafetyNote,
    string? EmergencyNote);

public sealed record UpdatePetRequest(
    string? Name,
    string? Species,
    string? CustomSpecies,
    string? Breed,
    string? Gender,
    string? Color,
    DateOnly? Birthday,
    DateOnly? AdoptionDay,
    string? GeneralArea,
    string? Bio,
    string? ProfileTheme,
    PetContactRequest? Contact,
    PetVisibilityRequest? Visibility,
    string? SafetyNote,
    string? EmergencyNote);

public sealed record PetResponse(
    Guid Id,
    string Name,
    string Species,
    PetLifecycleStatus LifecycleStatus,
    bool LostModeEnabled,
    string PublicCode,
    string SafetyCode,
    string PublicProfilePath,
    string QrSafetyPath,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record MarkPetMemorialRequest(
    DateOnly? PassedAwayDate,
    string? MemorialMessage,
    bool ShowMemorialOnPublicProfile);

public sealed record UpdateLostModeRequest(
    bool Enabled,
    string? LastSeenArea,
    DateTimeOffset? LastSeenDateTime,
    string? LostMessage,
    string? RewardNote,
    string? ExtraContactInstruction);
