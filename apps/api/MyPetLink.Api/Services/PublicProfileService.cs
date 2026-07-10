using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

public sealed class PublicProfileService : SkeletonService, IPublicProfileService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly CloudflareR2Options _r2Options;

    public PublicProfileService(MyPetLinkDbContext dbContext, IOptions<CloudflareR2Options> r2Options)
    {
        _dbContext = dbContext;
        _r2Options = r2Options.Value;
    }

    public async Task<PublicPetProfileResponse> GetByPublicSlugAsync(
        string publicSlug,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(publicSlug))
        {
            throw NotFound();
        }

        var publicCode = PetDtoMapper.ExtractPublicCode(publicSlug);

        var profile = await _dbContext.PetPublicProfiles
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
            .Include(item => item.Pet)
                .ThenInclude(pet => pet.Memories)
            .Include(item => item.Pet)
                .ThenInclude(pet => pet.CareRecords)
            .SingleOrDefaultAsync(item => item.PublicCode == publicCode, cancellationToken);

        if (profile is null
            || !profile.IsPublicProfileEnabled
            || profile.Pet.DeletedAt.HasValue
            || profile.Pet.LifecycleStatus == PetLifecycleStatus.Archived)
        {
            throw NotFound();
        }

        var pet = profile.Pet;
        if (pet.LifecycleStatus == PetLifecycleStatus.Memorial && !pet.ShowMemorialOnPublicProfile)
        {
            throw NotFound();
        }

        var publicMemories = profile.ShowMoments
            ? pet.Memories
                .Where(memory =>
                    memory.DeletedAt == null
                    && memory.ArchivedAt == null
                    && memory.Visibility == MemoryVisibility.Public
                    && (memory.ShowOnPublicProfile || memory.ShowInLifeTimeline))
                .OrderByDescending(memory => memory.MomentDate)
                .ThenByDescending(memory => memory.CreatedAt)
                .ToArray()
            : Array.Empty<PetMemory>();
        var memoryMedia = publicMemories.Length == 0
            ? new Dictionary<Guid, MemoryMediaResponse[]>()
            : await LoadPublicMemoryMediaAsync(publicMemories.Select(memory => memory.Id).ToArray(), cancellationToken);
        var memories = publicMemories
                .Select(memory => new PublicMemorySummaryResponse(
                    memory.Title,
                    memory.MomentDate,
                    memory.Type,
                    memory.Caption,
                    memory.ShowOnPublicProfile,
                    memory.ShowInLifeTimeline,
                    memory.TimelineNote,
                    memoryMedia.TryGetValue(memory.Id, out var media) ? media : Array.Empty<MemoryMediaResponse>()))
                .ToArray();

        var careRecords = profile.ShowCareBadges
            ? pet.CareRecords
                .Where(record =>
                    record.DeletedAt == null
                    && record.ArchivedAt == null
                    && record.PublicVisibility != CareRecordPublicVisibility.Private)
                .OrderByDescending(record => record.RecordDate)
                .ThenBy(record => record.Title)
                .Select(record => new PublicCareSummaryResponse(
                    record.Type.ToString(),
                    record.Title,
                    record.RecordDate,
                    record.DueDate,
                    record.Provider,
                    record.PublicVisibility == CareRecordPublicVisibility.PublicDetails ? record.Notes : null))
                .ToArray()
            : Array.Empty<PublicCareSummaryResponse>();

        return new PublicPetProfileResponse(
            profile.PublicCode,
            PetDtoMapper.ResolvePublicSlug(pet),
            pet.Name,
            pet.Species,
            pet.CustomSpecies,
            pet.LifecycleStatus,
            pet.LostModeEnabled && pet.LifecycleStatus == PetLifecycleStatus.Active,
            profile.ShowOwnerName ? PetDtoMapper.ResolveOwnerDisplayName(pet) : null,
            profile.ShowGeneralArea ? PetDtoMapper.ResolveGeneralArea(pet) : null,
            PetDtoMapper.ResolvePublicMediaUrl(pet.ProfileMediaFile, _r2Options.PublicBaseUrl),
            PetDtoMapper.ResolvePublicMediaUrl(pet.CoverMediaFile, _r2Options.PublicBaseUrl),
            pet.Bio,
            pet.LifecycleStatus == PetLifecycleStatus.Memorial ? pet.MemorialMessage : null,
            memories,
            careRecords);
    }

    private async Task<Dictionary<Guid, MemoryMediaResponse[]>> LoadPublicMemoryMediaAsync(
        IReadOnlyCollection<Guid> memoryIds,
        CancellationToken cancellationToken)
    {
        var links = await _dbContext.MediaFileLinks
            .AsNoTracking()
            .Include(link => link.MediaFile)
            .Where(link =>
                memoryIds.Contains(link.OwnerId)
                && link.OwnerType == MediaOwnerType.PetMemory
                && link.ArchivedAt == null
                && link.MediaFile.UploadStatus == MediaUploadStatus.Ready
                && link.MediaFile.IsPublic
                && link.MediaFile.DeletedAt == null)
            .OrderBy(link => link.SortOrder)
            .ToListAsync(cancellationToken);

        return links
            .GroupBy(link => link.OwnerId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .Select(link => new MemoryMediaResponse(
                        link.MediaFileId,
                        link.MediaFile.MediaType == MediaFileType.Video ? "video" : "image",
                        PetDtoMapper.ResolvePublicMediaUrl(link.MediaFile, _r2Options.PublicBaseUrl),
                        link.Caption,
                        link.AltText,
                        link.SortOrder))
                    .ToArray());
    }

    private static ApiException NotFound()
    {
        return new ApiException(
            StatusCodes.Status404NotFound,
            "public_profile_not_found",
            "This public pet profile is not available.");
    }
}
