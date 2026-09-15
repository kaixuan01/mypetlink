using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// The exact set of owner-approved public fields that a cached social card is
/// keyed on. Exists so the version can be computed from a projection as well as
/// from a loaded entity — the public profile no longer materialises entities,
/// but the hash it produces must stay byte-identical to the one the edge cache
/// and the finder preview already use.
/// </summary>
public sealed record PublicProfileVersionInputs(
    string PublicCode,
    bool IsPublicProfileEnabled,
    DateTimeOffset ProfileUpdatedAt,
    DateTimeOffset PetUpdatedAt,
    string Name,
    string Species,
    string? CustomSpecies,
    string? Breed,
    byte CoverPositionX,
    byte CoverPositionY,
    string ProfileTheme,
    PetLifecycleStatus LifecycleStatus,
    bool LostModeEnabled);

public static class PublicProfileVersion
{
    // Increment whenever the social-card layout or its public field selection changes.
    public const string TemplateVersion = "social-card-v3";

    public static string Create(
        PetPublicProfile profile,
        Pet pet,
        string ageDisplayLabel,
        string? profilePhotoUrl,
        string? coverPhotoUrl)
    {
        return Create(
            new PublicProfileVersionInputs(
                profile.PublicCode,
                profile.IsPublicProfileEnabled,
                profile.UpdatedAt,
                pet.UpdatedAt,
                pet.Name,
                pet.Species,
                pet.CustomSpecies,
                pet.Breed,
                pet.CoverPositionX,
                pet.CoverPositionY,
                pet.ProfileTheme,
                pet.LifecycleStatus,
                pet.LostModeEnabled),
            ageDisplayLabel,
            profilePhotoUrl,
            coverPhotoUrl);
    }

    public static string Create(
        PublicProfileVersionInputs inputs,
        string ageDisplayLabel,
        string? profilePhotoUrl,
        string? coverPhotoUrl)
    {
        // Field order is part of the cache key. Never reorder or insert without
        // bumping TemplateVersion: an existing cached card would otherwise keep
        // serving under a version that no longer describes it.
        var values = new[]
        {
            TemplateVersion,
            inputs.PublicCode,
            inputs.IsPublicProfileEnabled ? "public" : "private",
            inputs.ProfileUpdatedAt.UtcTicks.ToString(CultureInfo.InvariantCulture),
            inputs.PetUpdatedAt.UtcTicks.ToString(CultureInfo.InvariantCulture),
            inputs.Name,
            inputs.Species,
            inputs.CustomSpecies ?? string.Empty,
            inputs.Breed ?? string.Empty,
            ageDisplayLabel,
            profilePhotoUrl ?? string.Empty,
            coverPhotoUrl ?? string.Empty,
            inputs.CoverPositionX.ToString(CultureInfo.InvariantCulture),
            inputs.CoverPositionY.ToString(CultureInfo.InvariantCulture),
            inputs.ProfileTheme,
            inputs.LifecycleStatus.ToString(),
            inputs.LostModeEnabled ? "lost" : "regular"
        };

        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(string.Join('', values)));
        return Convert.ToHexString(digest)[..16].ToLowerInvariant();
    }
}
