using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

internal static class PetDtoMapper
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly Regex UnsafeSlugCharacters = new(@"[^a-z0-9]+", RegexOptions.Compiled);

    public static readonly PetVisibilityRequest DefaultVisibilityRequest = new(
        ShowOwnerName: false,
        ShowGeneralArea: true,
        ShowPhone: false,
        ShowWhatsapp: true,
        ShowEmergencyNote: true,
        ShowCareBadges: true,
        ShowMoments: true,
        ShowTimeline: true,
        ShowBirthdayOnTimeline: false,
        ShowAdoptionDayOnTimeline: false,
        ShowHealthSummary: false);

    public static readonly PetVisibilityResponse DefaultVisibility = ToVisibilityResponse(DefaultVisibilityRequest);

    public static string BuildPublicSlug(string petName, string publicCode)
    {
        var baseSlug = Slugify(petName);
        var maxBaseLength = Math.Max(1, 150 - publicCode.Length);

        if (baseSlug.Length > maxBaseLength)
        {
            baseSlug = baseSlug[..maxBaseLength].Trim('-');
        }

        return $"{baseSlug}-{publicCode}";
    }

    public static string ExtractPublicCode(string publicSlugOrCode)
    {
        var trimmed = publicSlugOrCode.Trim();
        var lastDash = trimmed.LastIndexOf('-');
        return lastDash >= 0 && lastDash < trimmed.Length - 1
            ? trimmed[(lastDash + 1)..]
            : trimmed;
    }

    public static string GenerateCode(string prefix, int randomByteCount = 10)
    {
        return $"{prefix}{Base32NoPadding(RandomNumberGenerator.GetBytes(randomByteCount))}".ToLowerInvariant();
    }

    public static PetVisibilityResponse ParseVisibility(string? json)
    {
        if (string.IsNullOrWhiteSpace(json) || json.Trim() == "{}")
        {
            return DefaultVisibility;
        }

        try
        {
            var request = JsonSerializer.Deserialize<PetVisibilityRequest>(json, JsonOptions);
            return request is null ? DefaultVisibility : ToVisibilityResponse(request);
        }
        catch (JsonException)
        {
            return DefaultVisibility;
        }
    }

    public static string SerializeVisibility(PetVisibilityRequest visibility)
    {
        return JsonSerializer.Serialize(visibility, JsonOptions);
    }

    // Personality tags, favourite foods/toys, and allergies are stored as JSON
    // arrays (Pet.PersonalityTagsJson / FavoriteFoodsJson / FavoriteToysJson /
    // AllergiesJson).
    // Parse/Serialize both run the same normalization so what is read back always
    // matches what was saved: trimmed, de-duplicated (case-insensitive), capped
    // in length and count, and never replaced with defaults.
    public const int MaxPersonalityTags = 12;
    public const int MaxPersonalityTagLength = 40;
    public const int MaxFavoriteItems = 3;
    public const int MaxFavoriteItemLength = 80;
    public const int MaxAllergies = 8;
    public const int MaxAllergyLength = 80;

    public static IReadOnlyList<string> ParsePersonalityTags(string? json)
    {
        return ParseStringList(json, MaxPersonalityTagLength, MaxPersonalityTags);
    }

    public static string SerializePersonalityTags(IEnumerable<string>? tags)
    {
        return JsonSerializer.Serialize(NormalizePersonalityTags(tags), JsonOptions);
    }

    public static IReadOnlyList<string> NormalizePersonalityTags(IEnumerable<string>? tags)
    {
        return NormalizeStringList(tags, MaxPersonalityTagLength, MaxPersonalityTags);
    }

    public static IReadOnlyList<string> ParseFavoriteList(string? json)
    {
        return ParseStringList(json, MaxFavoriteItemLength, MaxFavoriteItems);
    }

    public static string SerializeFavoriteList(IEnumerable<string>? items)
    {
        return JsonSerializer.Serialize(NormalizeFavoriteList(items), JsonOptions);
    }

    public static IReadOnlyList<string> NormalizeFavoriteList(IEnumerable<string>? items)
    {
        return NormalizeStringList(items, MaxFavoriteItemLength, MaxFavoriteItems);
    }

    public static IReadOnlyList<string> ParseAllergies(string? json)
    {
        return ParseStringList(json, MaxAllergyLength, MaxAllergies);
    }

    public static string SerializeAllergies(IEnumerable<string>? allergies)
    {
        return JsonSerializer.Serialize(NormalizeAllergies(allergies), JsonOptions);
    }

    public static IReadOnlyList<string> NormalizeAllergies(IEnumerable<string>? allergies)
    {
        return NormalizeStringList(allergies, MaxAllergyLength, MaxAllergies);
    }

    private static IReadOnlyList<string> ParseStringList(
        string? json,
        int maxItemLength,
        int maxItems)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<string>();
        }

        try
        {
            var items = JsonSerializer.Deserialize<List<string>>(json, JsonOptions);
            return NormalizeStringList(items, maxItemLength, maxItems);
        }
        catch (JsonException)
        {
            return Array.Empty<string>();
        }
    }

    private static IReadOnlyList<string> NormalizeStringList(
        IEnumerable<string>? values,
        int maxItemLength,
        int maxItems)
    {
        if (values is null)
        {
            return Array.Empty<string>();
        }

        var result = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var raw in values)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                continue;
            }

            var item = raw.Trim();

            if (item.Length > maxItemLength)
            {
                item = item[..maxItemLength].Trim();
            }

            if (item.Length == 0 || !seen.Add(item))
            {
                continue;
            }

            result.Add(item);

            if (result.Count >= maxItems)
            {
                break;
            }
        }

        return result;
    }

    public static PetVisibilityResponse ToVisibilityResponse(PetVisibilityRequest visibility)
    {
        return new PetVisibilityResponse(
            visibility.ShowOwnerName,
            visibility.ShowGeneralArea,
            visibility.ShowPhone,
            visibility.ShowWhatsapp,
            visibility.ShowEmergencyNote,
            visibility.ShowCareBadges,
            visibility.ShowMoments,
            visibility.ShowTimeline,
            visibility.ShowBirthdayOnTimeline,
            visibility.ShowAdoptionDayOnTimeline,
            visibility.ShowHealthSummary);
    }

    public static PetVisibilityResponse ToVisibilityResponse(Pet pet)
    {
        var publicProfile = pet.PublicProfile;
        var safetySetting = pet.SafetySetting;

        return new PetVisibilityResponse(
            publicProfile?.ShowOwnerName ?? DefaultVisibility.ShowOwnerName,
            publicProfile?.ShowGeneralArea ?? DefaultVisibility.ShowGeneralArea,
            safetySetting?.ShowPhone ?? DefaultVisibility.ShowPhone,
            safetySetting?.ShowWhatsapp ?? DefaultVisibility.ShowWhatsapp,
            safetySetting?.ShowEmergencyNote ?? DefaultVisibility.ShowEmergencyNote,
            publicProfile?.ShowCareBadges ?? DefaultVisibility.ShowCareBadges,
            publicProfile?.ShowMoments ?? DefaultVisibility.ShowMoments,
            publicProfile?.ShowTimeline ?? DefaultVisibility.ShowTimeline,
            publicProfile?.ShowBirthdayOnTimeline ?? DefaultVisibility.ShowBirthdayOnTimeline,
            publicProfile?.ShowAdoptionDayOnTimeline ?? DefaultVisibility.ShowAdoptionDayOnTimeline,
            publicProfile?.ShowHealthSummary ?? DefaultVisibility.ShowHealthSummary);
    }

    public static PetContactResponse ToContactResponse(PetContact? contact)
    {
        return new PetContactResponse(
            contact?.UseOwnerDefaults ?? true,
            contact?.OwnerDisplayName,
            contact?.PhoneE164,
            contact?.WhatsappE164,
            contact?.EmergencyContactE164,
            contact?.GeneralAreaOverride);
    }

    public static PetListItemResponse ToListItem(Pet pet, string? publicBaseUrl = null)
    {
        var publicCode = pet.PublicProfile?.PublicCode ?? "";
        var safetyCode = pet.SafetySetting?.SafetyCode ?? "";
        var publicSlug = ResolvePublicSlug(pet);
        var age = PetAgeCalculator.Calculate(pet.Birthday, pet.EstimatedBirthYear);
        var profilePhotoUrl = ResolvePublicMediaUrl(pet.ProfileMediaFile, publicBaseUrl);
        var coverPhotoUrl = ResolvePublicMediaUrl(pet.CoverMediaFile, publicBaseUrl);
        var publicProfileVersion = pet.PublicProfile is null
            ? null
            : PublicProfileVersion.Create(
                pet.PublicProfile,
                pet,
                age.DisplayLabel,
                profilePhotoUrl,
                coverPhotoUrl);

        return new PetListItemResponse(
            pet.Id,
            pet.Name,
            pet.Species,
            pet.CustomSpecies,
            pet.Birthday,
            pet.EstimatedBirthYear,
            age,
            pet.ProfileMediaFileId,
            pet.CoverMediaFileId,
            profilePhotoUrl,
            coverPhotoUrl,
            pet.CoverPositionX,
            pet.CoverPositionY,
            ParsePersonalityTags(pet.PersonalityTagsJson),
            publicSlug,
            publicCode,
            publicProfileVersion,
            safetyCode,
            pet.LifecycleStatus,
            pet.LostModeEnabled,
            $"/p/{publicSlug}",
            $"/q/{safetyCode}",
            pet.CreatedAt,
            pet.UpdatedAt);
    }

    public static PetDetailResponse ToDetail(Pet pet, string? publicBaseUrl = null)
    {
        var publicCode = pet.PublicProfile?.PublicCode ?? "";
        var safetyCode = pet.SafetySetting?.SafetyCode ?? "";
        var publicSlug = ResolvePublicSlug(pet);
        var age = PetAgeCalculator.Calculate(pet.Birthday, pet.EstimatedBirthYear);
        var profilePhotoUrl = ResolvePublicMediaUrl(pet.ProfileMediaFile, publicBaseUrl);
        var coverPhotoUrl = ResolvePublicMediaUrl(pet.CoverMediaFile, publicBaseUrl);
        var publicProfileVersion = pet.PublicProfile is null
            ? null
            : PublicProfileVersion.Create(
                pet.PublicProfile,
                pet,
                age.DisplayLabel,
                profilePhotoUrl,
                coverPhotoUrl);

        return new PetDetailResponse(
            pet.Id,
            pet.Name,
            pet.Species,
            pet.CustomSpecies,
            pet.Breed,
            pet.Gender,
            pet.Color,
            pet.Birthday,
            pet.EstimatedBirthYear,
            age,
            pet.AdoptionDay,
            pet.GeneralArea,
            pet.Bio,
            ParsePersonalityTags(pet.PersonalityTagsJson),
            ParseFavoriteList(pet.FavoriteFoodsJson),
            ParseFavoriteList(pet.FavoriteToysJson),
            ParseAllergies(pet.AllergiesJson),
            pet.ProfileMediaFileId,
            pet.CoverMediaFileId,
            profilePhotoUrl,
            coverPhotoUrl,
            pet.CoverPositionX,
            pet.CoverPositionY,
            pet.ProfileTheme,
            pet.LifecycleStatus,
            pet.LostModeEnabled,
            pet.LostLastSeenArea,
            pet.LostLastSeenDateTime,
            pet.LostMessage,
            pet.LostRewardNote,
            pet.LostExtraContactInstruction,
            pet.MemorialPassedAwayDate,
            pet.MemorialMessage,
            pet.ShowMemorialOnPublicProfile,
            publicCode,
            publicSlug,
            publicProfileVersion,
            safetyCode,
            $"/p/{publicSlug}",
            $"/q/{safetyCode}",
            ToContactResponse(pet.Contact),
            ToVisibilityResponse(pet),
            pet.SafetyNote,
            pet.EmergencyNote,
            pet.CreatedAt,
            pet.UpdatedAt,
            pet.ArchivedAt);
    }

    public static string ResolvePublicSlug(Pet pet)
    {
        if (!string.IsNullOrWhiteSpace(pet.PublicProfile?.SlugSnapshot))
        {
            return pet.PublicProfile.SlugSnapshot;
        }

        if (!string.IsNullOrWhiteSpace(pet.Slug))
        {
            return pet.Slug;
        }

        return pet.PublicProfile?.PublicCode ?? pet.Id.ToString("N");
    }

    public static string? ResolveOwnerDisplayName(Pet pet)
    {
        if (pet.Contact?.UseOwnerDefaults == false)
        {
            return NormalizeOptional(pet.Contact.OwnerDisplayName);
        }

        return NormalizeOptional(pet.Contact?.OwnerDisplayName)
            ?? NormalizeOptional(pet.OwnerUser.OwnerProfile?.OwnerDisplayName)
            ?? NormalizeOptional(pet.OwnerUser.DisplayName);
    }

    public static string? ResolveGeneralArea(Pet pet)
    {
        return NormalizeOptional(pet.Contact?.GeneralAreaOverride)
            ?? NormalizeOptional(pet.GeneralArea)
            ?? NormalizeOptional(pet.OwnerUser.OwnerProfile?.DefaultGeneralArea);
    }

    public static string? ResolvePhone(Pet pet)
    {
        if (pet.Contact?.UseOwnerDefaults == false)
        {
            return NormalizeOptional(pet.Contact.PhoneE164);
        }

        return NormalizeOptional(pet.Contact?.PhoneE164)
            ?? NormalizeOptional(pet.OwnerUser.PhoneE164);
    }

    public static string? ResolveWhatsapp(Pet pet)
    {
        if (pet.Contact?.UseOwnerDefaults == false)
        {
            return NormalizeOptional(pet.Contact.WhatsappE164);
        }

        return NormalizeOptional(pet.Contact?.WhatsappE164)
            ?? NormalizeOptional(pet.OwnerUser.WhatsappE164);
    }

    public static string? NormalizeOptional(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    public static string? ResolvePublicMediaUrl(MediaFile? media, string? publicBaseUrl)
    {
        if (media is null
            || !media.IsPublic
            || media.UploadStatus != MediaUploadStatus.Ready
            || media.DeletedAt.HasValue)
        {
            return null;
        }

        var url = MediaUrlBuilder.BuildPublicUrl(publicBaseUrl, media.ObjectKey);
        return string.IsNullOrWhiteSpace(url) ? null : url;
    }

    private static string Slugify(string value)
    {
        var slug = value.Trim().ToLowerInvariant();
        slug = UnsafeSlugCharacters.Replace(slug, "-").Trim('-');
        return string.IsNullOrWhiteSpace(slug) ? "pet" : slug;
    }

    private static string Base32NoPadding(byte[] bytes)
    {
        const string alphabet = "abcdefghijklmnopqrstuvwxyz234567";
        var output = new StringBuilder((bytes.Length * 8 + 4) / 5);
        var buffer = 0;
        var bitsLeft = 0;

        foreach (var item in bytes)
        {
            buffer = (buffer << 8) | item;
            bitsLeft += 8;

            while (bitsLeft >= 5)
            {
                output.Append(alphabet[(buffer >> (bitsLeft - 5)) & 31]);
                bitsLeft -= 5;
            }
        }

        if (bitsLeft > 0)
        {
            output.Append(alphabet[(buffer << (5 - bitsLeft)) & 31]);
        }

        return output.ToString();
    }
}
