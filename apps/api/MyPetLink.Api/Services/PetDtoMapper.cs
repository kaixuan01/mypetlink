using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

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

    public static PetListItemResponse ToListItem(Pet pet)
    {
        var publicCode = pet.PublicProfile?.PublicCode ?? "";
        var safetyCode = pet.SafetySetting?.SafetyCode ?? "";
        var publicSlug = ResolvePublicSlug(pet);

        return new PetListItemResponse(
            pet.Id,
            pet.Name,
            pet.Species,
            pet.CustomSpecies,
            publicSlug,
            publicCode,
            safetyCode,
            pet.LifecycleStatus,
            pet.LostModeEnabled,
            $"/p/{publicSlug}",
            $"/q/{safetyCode}",
            pet.CreatedAt,
            pet.UpdatedAt);
    }

    public static PetDetailResponse ToDetail(Pet pet)
    {
        var publicCode = pet.PublicProfile?.PublicCode ?? "";
        var safetyCode = pet.SafetySetting?.SafetyCode ?? "";
        var publicSlug = ResolvePublicSlug(pet);

        return new PetDetailResponse(
            pet.Id,
            pet.Name,
            pet.Species,
            pet.CustomSpecies,
            pet.Breed,
            pet.Gender,
            pet.Color,
            pet.Birthday,
            pet.AdoptionDay,
            pet.GeneralArea,
            pet.Bio,
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
