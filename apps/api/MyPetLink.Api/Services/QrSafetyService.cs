using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class QrSafetyService : SkeletonService, IQrSafetyService
{
    private readonly MyPetLinkDbContext _dbContext;

    public QrSafetyService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
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
                "This QR Safety Page is not available.");
        }

        var pet = safetySetting.Pet;
        if (pet.LifecycleStatus == PetLifecycleStatus.Memorial)
        {
            return new PublicSafetyPageResponse(
                safetySetting.SafetyCode,
                "Memorial",
                pet.Name,
                pet.Species,
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
                ShowFoundLocationAction: false,
                Contact: null);
        }

        var phone = safetySetting.ShowPhone ? PetDtoMapper.ResolvePhone(pet) : null;
        var whatsapp = safetySetting.ShowWhatsapp ? PetDtoMapper.ResolveWhatsapp(pet) : null;
        var emergencyContact = safetySetting.ShowPhone ? pet.Contact?.EmergencyContactE164 : null;
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
            safetySetting.ShowFoundLocationAction,
            contact);
    }

    private static ApiException NotFound()
    {
        return new ApiException(
            StatusCodes.Status404NotFound,
            "qr_safety_not_found",
            "This QR Safety Page is not available.");
    }
}
