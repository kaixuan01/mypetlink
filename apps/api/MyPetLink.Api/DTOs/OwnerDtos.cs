using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace MyPetLink.Api.DTOs;

public sealed record OwnerContactSettingsResponse(
    string DisplayName,
    string? PhoneE164,
    string? WhatsappE164,
    string? DefaultGeneralArea);

// The owner's current plan with the limits the backend actually enforces.
// This is the single source the Owner Portal should display, so usage meters
// can never disagree with create/restore enforcement.
public sealed record OwnerPlanSummaryResponse(
    string Code,
    string Name,
    string Status,
    int MaxPets,
    int MaxMemoriesPerPet,
    int MaxMediaPerMemory,
    int MaxCareRecords);

public sealed record OwnerProfileResponse(
    Guid UserId,
    Guid OwnerProfileId,
    string DisplayName,
    string Email,
    string? PhoneE164,
    string? WhatsappE164,
    string? DefaultGeneralArea,
    OwnerContactSettingsResponse DefaultContact,
    PetVisibilityResponse DefaultPrivacy,
    JsonElement NotificationPreferences,
    string PlanCode,
    OwnerPlanSummaryResponse Plan,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record UpdateOwnerProfileRequest(
    [MaxLength(200)] string? DisplayName,
    [MaxLength(32)] string? PhoneE164,
    [MaxLength(32)] string? WhatsappE164,
    [MaxLength(200)] string? DefaultGeneralArea,
    PetVisibilityRequest? PrivacyDefaults,
    JsonElement? NotificationPreferences);
