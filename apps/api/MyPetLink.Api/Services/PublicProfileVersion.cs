using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public static class PublicProfileVersion
{
    // Increment whenever the social-card layout or its public field selection changes.
    public const string TemplateVersion = "social-card-v2";

    public static string Create(
        PetPublicProfile profile,
        Pet pet,
        string ageDisplayLabel,
        string? profilePhotoUrl,
        string? coverPhotoUrl)
    {
        var values = new[]
        {
            TemplateVersion,
            profile.PublicCode,
            profile.IsPublicProfileEnabled ? "public" : "private",
            profile.UpdatedAt.UtcTicks.ToString(CultureInfo.InvariantCulture),
            pet.UpdatedAt.UtcTicks.ToString(CultureInfo.InvariantCulture),
            pet.Name,
            pet.Species,
            pet.CustomSpecies ?? string.Empty,
            pet.Breed ?? string.Empty,
            ageDisplayLabel,
            profilePhotoUrl ?? string.Empty,
            coverPhotoUrl ?? string.Empty,
            pet.CoverPositionX.ToString(CultureInfo.InvariantCulture),
            pet.CoverPositionY.ToString(CultureInfo.InvariantCulture),
            pet.ProfileTheme,
            pet.LifecycleStatus.ToString(),
            pet.LostModeEnabled ? "lost" : "regular"
        };

        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(string.Join('\u001f', values)));
        return Convert.ToHexString(digest)[..16].ToLowerInvariant();
    }
}
