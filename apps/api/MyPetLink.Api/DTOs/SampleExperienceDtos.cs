using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record PublicSampleExperienceResponse(
    bool Available,
    PublicSamplePetResponse? Pet);

public sealed record PublicSamplePetResponse(
    string Name,
    string Species,
    string? Breed,
    string AgeDisplayLabel,
    string? Bio,
    string? ProfilePhotoUrl,
    string PublicSlug,
    string PublicCode,
    string SafetyCode);

public sealed record AdminSamplePetOptionResponse(
    Guid PetId,
    string Name,
    string OwnerName,
    string OwnerEmail,
    PetLifecycleStatus Lifecycle,
    bool IsSampleEligible,
    bool PublicProfileAvailable,
    bool SafetyProfileAvailable,
    bool CanBeFeatured,
    string? ProfilePhotoUrl,
    string? PublicSlug,
    string? PublicCode,
    string? SafetyCode);

public sealed record AdminSampleExperienceResponse(
    Guid? FeaturedSamplePetId,
    string Status,
    AdminSamplePetOptionResponse? SelectedPet,
    IReadOnlyCollection<AdminSamplePetOptionResponse> EligiblePets,
    DateTimeOffset UpdatedAt,
    string? UpdatedBy,
    string RowVersion);

public sealed record UpdateSampleExperienceRequest(
    Guid? FeaturedSamplePetId,
    string? RowVersion);

public sealed record UpdateSamplePetEligibilityRequest(
    bool IsSampleEligible,
    string? RowVersion);
