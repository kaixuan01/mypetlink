using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

public sealed class TagScanService : SkeletonService, ITagScanService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly CloudflareR2Options _r2Options;

    public TagScanService(MyPetLinkDbContext dbContext, IOptions<CloudflareR2Options> r2Options)
    {
        _dbContext = dbContext;
        _r2Options = r2Options.Value;
    }

    public async Task<TagScanPageResponse> ResolveAsync(
        string tagCode,
        TagScanContext context,
        CancellationToken cancellationToken = default)
    {
        var normalizedCode = NormalizeTagCode(tagCode);

        if (string.IsNullOrWhiteSpace(normalizedCode))
        {
            await RecordScanAsync(null, normalizedCode, TagScanResolvedState.NotFound, context, cancellationToken);
            return new TagScanPageResponse("notFound", tagCode, null, null);
        }

        var tag = await _dbContext.SmartTags
            .Include(item => item.Pet)
                .ThenInclude(pet => pet!.OwnerUser)
                    .ThenInclude(user => user.OwnerProfile)
            .Include(item => item.Pet)
                .ThenInclude(pet => pet!.Contact)
            .Include(item => item.Pet)
                .ThenInclude(pet => pet!.SafetySetting)
            .Include(item => item.Pet)
                .ThenInclude(pet => pet!.ProfileMediaFile)
            .Include(item => item.Pet)
                .ThenInclude(pet => pet!.CoverMediaFile)
            .SingleOrDefaultAsync(
                item => item.TagCode == normalizedCode && item.DeletedAt == null,
                cancellationToken);

        if (tag is null)
        {
            await RecordScanAsync(null, normalizedCode, TagScanResolvedState.NotFound, context, cancellationToken);
            return new TagScanPageResponse("notFound", normalizedCode, null, null);
        }

        if (tag.ArchivedAt.HasValue || IsInactiveTagStatus(tag.Status))
        {
            await RecordScanAsync(tag, normalizedCode, TagScanResolvedState.Inactive, context, cancellationToken);
            return new TagScanPageResponse("inactive", tag.TagCode, tag.Status.ToString(), null);
        }

        if (tag.Status == SmartTagStatus.Unclaimed || !tag.PetId.HasValue)
        {
            await RecordScanAsync(tag, normalizedCode, TagScanResolvedState.Unclaimed, context, cancellationToken);
            return new TagScanPageResponse("unclaimed", tag.TagCode, tag.Status.ToString(), null);
        }

        if (!IsActiveSafetyPet(tag.Pet))
        {
            await RecordScanAsync(tag, normalizedCode, TagScanResolvedState.Inactive, context, cancellationToken);
            return new TagScanPageResponse("inactive", tag.TagCode, tag.Status.ToString(), null);
        }

        if (tag.Status is SmartTagStatus.Pending or SmartTagStatus.Preparing or SmartTagStatus.Delivered)
        {
            await RecordScanAsync(tag, normalizedCode, TagScanResolvedState.Pending, context, cancellationToken);
            return new TagScanPageResponse("pending", tag.TagCode, tag.Status.ToString(), null);
        }

        if (tag.Status != SmartTagStatus.Active)
        {
            await RecordScanAsync(tag, normalizedCode, TagScanResolvedState.Inactive, context, cancellationToken);
            return new TagScanPageResponse("inactive", tag.TagCode, tag.Status.ToString(), null);
        }

        var profile = BuildSafetyProfile(tag.Pet!, _r2Options.PublicBaseUrl);

        if (profile is null)
        {
            await RecordScanAsync(tag, normalizedCode, TagScanResolvedState.Inactive, context, cancellationToken);
            return new TagScanPageResponse("inactive", tag.TagCode, tag.Status.ToString(), null);
        }

        tag.LastScannedAt = DateTimeOffset.UtcNow;
        await RecordScanAsync(tag, normalizedCode, TagScanResolvedState.Active, context, cancellationToken);

        return new TagScanPageResponse("active", tag.TagCode, tag.Status.ToString(), profile);
    }

    public async Task SubmitLocationConsentAsync(
        string tagCode,
        SubmitScanLocationConsentRequest request,
        CancellationToken cancellationToken = default)
    {
        var normalizedCode = NormalizeTagCode(tagCode);
        var scan = await _dbContext.TagScans.SingleOrDefaultAsync(
            item => item.Id == request.TagScanId && item.TagCode == normalizedCode,
            cancellationToken);

        if (scan is null)
        {
            throw new ApiException(
                StatusCodes.Status404NotFound,
                "scan_not_found",
                "Tag scan was not found.");
        }

        scan.FinderConsentPreciseLocation = request.Consent;

        if (request.Consent)
        {
            ValidateCoordinate(request.Latitude, "latitude", -90m, 90m);
            ValidateCoordinate(request.Longitude, "longitude", -180m, 180m);
            scan.Latitude = request.Latitude;
            scan.Longitude = request.Longitude;
        }
        else
        {
            scan.Latitude = null;
            scan.Longitude = null;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task RecordScanAsync(
        SmartTag? tag,
        string tagCode,
        TagScanResolvedState state,
        TagScanContext context,
        CancellationToken cancellationToken)
    {
        _dbContext.TagScans.Add(new TagScan
        {
            SmartTagId = tag?.Id,
            PetId = tag?.PetId,
            TagCode = tag?.TagCode ?? tagCode,
            ResolvedState = state,
            ScanTime = DateTimeOffset.UtcNow,
            IpAddress = TrimToMax(context.IpAddress, 64),
            Referer = TrimToMax(context.Referer, 600),
            UserAgent = TrimToMax(context.UserAgent, 600)
        });

        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private static bool IsActiveSafetyPet(Pet? pet)
    {
        return pet is not null
            && pet.DeletedAt is null
            && pet.ArchivedAt is null
            && pet.LifecycleStatus == PetLifecycleStatus.Active;
    }

    private static bool IsInactiveTagStatus(SmartTagStatus status)
    {
        return status is SmartTagStatus.Lost
            or SmartTagStatus.Disabled
            or SmartTagStatus.Replaced
            or SmartTagStatus.Archived;
    }

    private static PublicSafetyPageResponse? BuildSafetyProfile(Pet pet, string? publicBaseUrl)
    {
        var safetySetting = pet.SafetySetting;

        if (safetySetting is null || !safetySetting.QrSafetyEnabled)
        {
            return null;
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
            PetDtoMapper.ResolvePublicMediaUrl(pet.ProfileMediaFile, publicBaseUrl),
            PetDtoMapper.ResolvePublicMediaUrl(pet.CoverMediaFile, publicBaseUrl),
            safetySetting.ShowFoundLocationAction,
            contact);
    }

    private static void ValidateCoordinate(decimal? value, string field, decimal min, decimal max)
    {
        if (!value.HasValue || value.Value < min || value.Value > max)
        {
            throw new ApiException(
                StatusCodes.Status400BadRequest,
                "validation_failed",
                "Please check the submitted fields.",
                new Dictionary<string, string[]>
                {
                    [field] = ["Location value is outside the supported range."]
                });
        }
    }

    private static string NormalizeTagCode(string value)
    {
        return value.Trim().ToUpperInvariant();
    }

    private static string? TrimToMax(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }
}
