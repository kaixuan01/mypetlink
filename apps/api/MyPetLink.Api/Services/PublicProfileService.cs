using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class PublicProfileService : SkeletonService, IPublicProfileService
{
    private readonly MyPetLinkDbContext _dbContext;

    public PublicProfileService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
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

        var memories = profile.ShowMoments
            ? pet.Memories
                .Where(memory =>
                    memory.DeletedAt == null
                    && memory.ArchivedAt == null
                    && memory.Visibility == MemoryVisibility.Public
                    && memory.ShowOnPublicProfile)
                .OrderByDescending(memory => memory.MomentDate)
                .ThenByDescending(memory => memory.CreatedAt)
                .Select(memory => new PublicMemorySummaryResponse(
                    memory.Title,
                    memory.MomentDate,
                    memory.Type,
                    memory.Caption))
                .ToArray()
            : Array.Empty<PublicMemorySummaryResponse>();

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
            pet.Bio,
            pet.LifecycleStatus == PetLifecycleStatus.Memorial ? pet.MemorialMessage : null,
            memories,
            careRecords);
    }

    private static ApiException NotFound()
    {
        return new ApiException(
            StatusCodes.Status404NotFound,
            "public_profile_not_found",
            "This public pet profile is not available.");
    }
}
