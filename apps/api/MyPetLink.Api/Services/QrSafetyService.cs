using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

public sealed class QrSafetyService : SkeletonService, IQrSafetyService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly CloudflareR2Options _r2Options;

    public QrSafetyService(MyPetLinkDbContext dbContext, IOptions<CloudflareR2Options> r2Options)
    {
        _dbContext = dbContext;
        _r2Options = r2Options.Value;
    }

    public async Task<PublicSafetyPageResponse> GetBySafetyCodeAsync(
        string safetyCode,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(safetyCode))
        {
            throw NotFound();
        }

        var safetySetting = await _dbContext.PetSafetySettings
            .AsNoTracking()
            .Include(item => item.Pet)
                .ThenInclude(pet => pet.OwnerUser)
                    .ThenInclude(user => user.OwnerProfile)
            .Include(item => item.Pet)
                .ThenInclude(pet => pet.Contact)
            .Include(item => item.Pet)
                .ThenInclude(pet => pet.ProfileMediaFile)
            .Include(item => item.Pet)
                .ThenInclude(pet => pet.CoverMediaFile)
            .SingleOrDefaultAsync(item => item.SafetyCode == safetyCode.Trim(), cancellationToken);

        if (safetySetting is null
            || safetySetting.Pet.DeletedAt.HasValue
            || safetySetting.Pet.LifecycleStatus == PetLifecycleStatus.Archived)
        {
            throw NotFound();
        }

        if (!safetySetting.QrSafetyEnabled)
        {
            throw new ApiException(
                StatusCodes.Status403Forbidden,
                "qr_safety_disabled",
                "This Safety Profile is not available.");
        }

        var pet = safetySetting.Pet;
        if (pet.LifecycleStatus == PetLifecycleStatus.Memorial)
        {
            return new PublicSafetyPageResponse(
                safetySetting.SafetyCode,
                "Memorial",
                pet.Name,
                pet.Species,
                pet.Birthday,
                pet.EstimatedBirthYear,
                PetAgeCalculator.Calculate(pet.Birthday, pet.EstimatedBirthYear),
                pet.LifecycleStatus,
                LostModeEnabled: false,
                PetDtoMapper.ResolveGeneralArea(pet),
                pet.SafetyNote,
                EmergencyNote: null,
                LostLastSeenArea: null,
                LostLastSeenDateTime: null,
                LostMessage: null,
                LostRewardNote: null,
                LostExtraContactInstruction: null,
                ProfilePhotoUrl: PetDtoMapper.ResolvePublicMediaUrl(pet.ProfileMediaFile, _r2Options.PublicBaseUrl),
                CoverPhotoUrl: PetDtoMapper.ResolvePublicMediaUrl(pet.CoverMediaFile, _r2Options.PublicBaseUrl),
                CoverPositionX: pet.CoverPositionX,
                CoverPositionY: pet.CoverPositionY,
                ProfileTheme: pet.ProfileTheme,
                Allergies: PetDtoMapper.ParseAllergies(pet.AllergiesJson),
                ShowFoundLocationAction: false,
                Contact: null);
        }

        var phone = safetySetting.ShowPhone ? PetDtoMapper.ResolvePhone(pet) : null;
        var whatsapp = safetySetting.ShowWhatsapp ? PetDtoMapper.ResolveWhatsapp(pet) : null;
        var emergencyContact = safetySetting.ShowPhone ? PetDtoMapper.ResolveEmergencyContact(pet) : null;
        var contact = phone is null && whatsapp is null && emergencyContact is null
            ? null
            : new PublicSafetyContactResponse(
                PetDtoMapper.ResolveOwnerDisplayName(pet),
                phone,
                whatsapp,
                emergencyContact);

        return new PublicSafetyPageResponse(
            safetySetting.SafetyCode,
            pet.LostModeEnabled ? "LostMode" : "Active",
            pet.Name,
            pet.Species,
            pet.Birthday,
            pet.EstimatedBirthYear,
            PetAgeCalculator.Calculate(pet.Birthday, pet.EstimatedBirthYear),
            pet.LifecycleStatus,
            pet.LostModeEnabled,
            PetDtoMapper.ResolveGeneralArea(pet),
            pet.SafetyNote,
            safetySetting.ShowEmergencyNote ? pet.EmergencyNote : null,
            pet.LostModeEnabled ? pet.LostLastSeenArea : null,
            pet.LostModeEnabled ? pet.LostLastSeenDateTime : null,
            pet.LostModeEnabled ? pet.LostMessage : null,
            pet.LostModeEnabled ? pet.LostRewardNote : null,
            pet.LostModeEnabled ? pet.LostExtraContactInstruction : null,
            PetDtoMapper.ResolvePublicMediaUrl(pet.ProfileMediaFile, _r2Options.PublicBaseUrl),
            PetDtoMapper.ResolvePublicMediaUrl(pet.CoverMediaFile, _r2Options.PublicBaseUrl),
            pet.CoverPositionX,
            pet.CoverPositionY,
            pet.ProfileTheme,
            PetDtoMapper.ParseAllergies(pet.AllergiesJson),
            safetySetting.ShowFoundLocationAction,
            contact);
    }

    private static ApiException NotFound()
    {
        return new ApiException(
            StatusCodes.Status404NotFound,
            "qr_safety_not_found",
            "This Safety Profile is not available.");
    }
}
