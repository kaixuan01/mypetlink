using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

public sealed class MemoryService : SkeletonService, IMemoryService
{
    private const string FamilyOnlyVisibility = "Family Only";
    private const string FamilyOnlyApiVisibility = "FamilyOnly";

    private readonly MyPetLinkDbContext _dbContext;
    private readonly CloudflareR2Options _r2Options;

    public MemoryService(MyPetLinkDbContext dbContext, IOptions<CloudflareR2Options> r2Options)
    {
        _dbContext = dbContext;
        _r2Options = r2Options.Value;
    }

    public async Task<(IReadOnlyCollection<MemoryResponse> Items, int Total)> ListForPetAsync(
        Guid? currentUserId,
        Guid petId,
        int page,
        int pageSize,
        string? visibility,
        bool includeArchived,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        await EnsureOwnedPetExistsAsync(userId, petId, cancellationToken);

        var query = _dbContext.PetMemories
            .AsNoTracking()
            .Where(memory =>
                memory.PetId == petId
                && memory.Pet.OwnerUserId == userId
                && memory.Pet.DeletedAt == null
                && memory.DeletedAt == null);

        if (!includeArchived)
        {
            query = query.Where(memory => memory.ArchivedAt == null);
        }

        if (!string.IsNullOrWhiteSpace(visibility))
        {
            var parsedVisibility = MemoryVisibilityPolicy.Normalize(
                ParseVisibility(visibility, "visibility"));
            query = parsedVisibility == MemoryVisibility.Public
                ? query.Where(memory => memory.Visibility == MemoryVisibility.Public)
                : query.Where(memory => memory.Visibility != MemoryVisibility.Public);
        }

        var total = await query.CountAsync(cancellationToken);
        var memories = await query
            .OrderByDescending(memory => memory.MomentDate)
            .ThenByDescending(memory => memory.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (await ToResponsesAsync(memories, cancellationToken), total);
    }

    public async Task<MemoryResponse> CreateAsync(
        Guid? currentUserId,
        Guid petId,
        CreateMemoryRequest request,
        CancellationToken cancellationToken = default)
    {
        var user = await LoadOwnerUserAsync(currentUserId, cancellationToken);
        var pet = await LoadOwnedPetAsync(user.Id, petId, cancellationToken);

        if (pet.LifecycleStatus == PetLifecycleStatus.Archived)
        {
            throw InvalidState("Archived pets must be restored before adding new memories.");
        }

        ValidateCreateRequest(request);

        var visibility = MemoryVisibilityPolicy.Normalize(
            request.Visibility ?? MemoryVisibility.Private);

        // The plan allowance protects the PRIVATE archive only. A public Moment
        // is a social contribution and does not consume it; abuse is bounded by
        // the Moment-creation rate limit, the per-Moment media cap and upload
        // size limits instead.
        //
        // The allowance is counted against the primary pet only. Additional
        // subjects are recorded in MomentPets and never cost an allowance, so a
        // multi-pet household is not penalised for using the feature.
        if (!MemoryVisibilityPolicy.IsPublic(visibility))
        {
            await EnsurePrivateMemoryAllowanceAsync(user, petId, cancellationToken);
        }

        var additionalPetIds = await ResolveAdditionalPetIdsAsync(
            user.Id,
            pet.Id,
            request.AdditionalPetIds,
            cancellationToken);
        var memory = new PetMemory
        {
            PetId = pet.Id,
            Pet = pet,
            // Authorship comes from the authenticated session and from nowhere
            // else. There is no request field a client could use to claim it.
            AuthorUserId = user.Id,
            PublishedAt = MemoryVisibilityPolicy.IsPublic(visibility)
                ? DateTimeOffset.UtcNow
                : null,
            Title = request.Title.Trim(),
            MomentDate = request.Date,
            Type = NormalizeOptional(request.Type),
            Caption = NormalizeOptional(request.Caption),
            Visibility = visibility,
            ShowInLifeTimeline = request.ShowInLifeTimeline ?? false,
            TimelineNote = NormalizeOptional(request.TimelineNote)
        };

        _dbContext.PetMemories.Add(memory);
        SyncMomentPets(memory, additionalPetIds);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await AttachMediaToMemoryAsync(user.Id, memory, request.MediaFileIds, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return await ToResponseAsync(memory, cancellationToken);
    }

    public async Task<MemoryResponse> GetAsync(
        Guid? currentUserId,
        Guid memoryId,
        CancellationToken cancellationToken = default)
    {
        var memory = await LoadOwnedMemoryAsync(currentUserId, memoryId, trackChanges: false, cancellationToken);
        return await ToResponseAsync(memory, cancellationToken);
    }

    public async Task<MemoryResponse> UpdateAsync(
        Guid? currentUserId,
        Guid memoryId,
        UpdateMemoryRequest request,
        CancellationToken cancellationToken = default)
    {
        var memory = await LoadOwnedMemoryAsync(currentUserId, memoryId, trackChanges: true, cancellationToken);

        if (memory.ArchivedAt.HasValue)
        {
            throw InvalidState("Archived memories cannot be updated.");
        }

        ValidateUpdateRequest(request);

        if (request.Title is not null)
        {
            memory.Title = request.Title.Trim();
        }

        if (request.Date.HasValue)
        {
            memory.MomentDate = request.Date;
        }

        if (request.Type is not null)
        {
            memory.Type = NormalizeOptional(request.Type);
        }

        if (request.Caption is not null)
        {
            memory.Caption = NormalizeOptional(request.Caption);
        }

        if (request.Visibility.HasValue)
        {
            var requestedVisibility = MemoryVisibilityPolicy.Normalize(request.Visibility.Value);
            var wasPublic = MemoryVisibilityPolicy.IsPublic(memory.Visibility);

            // Turning a public Moment private moves it into the archive the
            // plan allowance protects, so it must be charged now. Without this
            // an owner could post publicly without limit and then make every
            // one of them private, arriving at an unlimited private archive by
            // another route.
            if (wasPublic && !MemoryVisibilityPolicy.IsPublic(requestedVisibility))
            {
                var owner = await LoadOwnerUserAsync(currentUserId, cancellationToken);
                await EnsurePrivateMemoryAllowanceAsync(owner, memory.PetId, cancellationToken);
            }

            memory.Visibility = requestedVisibility;
        }

        // Publication time is set once, the first time a Moment becomes public,
        // and is never moved afterwards.
        //
        // Ordinary edits must not bump it, or fixing a typo would push an old
        // Moment back to the top of every feed. The same reasoning settles
        // public -> private -> public: the original publication time is kept,
        // because re-publishing is not a new Moment and using it to resurface
        // old content would be the same trick by another route. A Moment that
        // has genuinely changed is a new Moment.
        if (MemoryVisibilityPolicy.IsPublic(memory.Visibility))
        {
            memory.PublishedAt ??= DateTimeOffset.UtcNow;
        }

        if (request.ShowInLifeTimeline.HasValue)
        {
            memory.ShowInLifeTimeline = request.ShowInLifeTimeline.Value;
        }

        // Normalize legacy rows whenever they are written, without clamping
        // Timeline placement. The compatibility flag is no longer set here: the
        // DbContext derives it from Visibility on every save, so there is one
        // place that does it rather than every service remembering to.
        memory.Visibility = MemoryVisibilityPolicy.Normalize(memory.Visibility);

        if (request.TimelineNote is not null)
        {
            memory.TimelineNote = NormalizeOptional(request.TimelineNote);
        }

        if (request.MediaFileIds is not null)
        {
            var mediaUserId = RequireUserId(currentUserId);
            await ReplaceMemoryMediaAsync(mediaUserId, memory, request.MediaFileIds, cancellationToken);
        }

        if (request.AdditionalPetIds is not null)
        {
            var subjectUserId = RequireUserId(currentUserId);
            var additionalPetIds = await ResolveAdditionalPetIdsAsync(
                subjectUserId,
                memory.PetId,
                request.AdditionalPetIds,
                cancellationToken);

            await ReplaceMomentPetsAsync(memory, additionalPetIds, cancellationToken);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return await ToResponseAsync(memory, cancellationToken);
    }

    public async Task ArchiveAsync(
        Guid? currentUserId,
        Guid memoryId,
        CancellationToken cancellationToken = default)
    {
        var memory = await LoadOwnedMemoryAsync(currentUserId, memoryId, trackChanges: true, cancellationToken);
        memory.ArchivedAt ??= DateTimeOffset.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<User> LoadOwnerUserAsync(Guid? currentUserId, CancellationToken cancellationToken)
    {
        var userId = RequireUserId(currentUserId);
        var user = await _dbContext.Users
            .Include(item => item.OwnerProfile)
                .ThenInclude(profile => profile!.Plan)
                    .ThenInclude(plan => plan.Limit)
            .SingleOrDefaultAsync(item => item.Id == userId && item.DeletedAt == null, cancellationToken);

        return user ?? throw Unauthorized();
    }

    private async Task<Pet> LoadOwnedPetAsync(
        Guid userId,
        Guid petId,
        CancellationToken cancellationToken)
    {
        var pet = await _dbContext.Pets
            .SingleOrDefaultAsync(
                item => item.Id == petId && item.OwnerUserId == userId && item.DeletedAt == null,
                cancellationToken);

        return pet ?? throw NotFound("Pet was not found.");
    }

    private async Task EnsureOwnedPetExistsAsync(
        Guid userId,
        Guid petId,
        CancellationToken cancellationToken)
    {
        var exists = await _dbContext.Pets.AnyAsync(
            item => item.Id == petId && item.OwnerUserId == userId && item.DeletedAt == null,
            cancellationToken);

        if (!exists)
        {
            throw NotFound("Pet was not found.");
        }
    }

    private async Task<PetMemory> LoadOwnedMemoryAsync(
        Guid? currentUserId,
        Guid memoryId,
        bool trackChanges,
        CancellationToken cancellationToken)
    {
        var userId = RequireUserId(currentUserId);
        var query = _dbContext.PetMemories
            .Include(memory => memory.Pet)
            .Where(memory =>
                memory.Id == memoryId
                && memory.Pet.OwnerUserId == userId
                && memory.Pet.DeletedAt == null
                && memory.DeletedAt == null);

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        var memory = await query.SingleOrDefaultAsync(cancellationToken);
        return memory ?? throw NotFound("Memory was not found.");
    }

    /// <summary>
    /// Validates the extra subject pets and returns them without the primary
    /// pet or any duplicates.
    ///
    /// Phase 1 permits only the caller's own pets. Tagging someone else's pet
    /// puts their animal on a page they do not control, which needs their
    /// consent rather than a notification afterwards.
    /// </summary>
    private async Task<IReadOnlyCollection<Guid>> ResolveAdditionalPetIdsAsync(
        Guid userId,
        Guid primaryPetId,
        IReadOnlyCollection<Guid>? requestedPetIds,
        CancellationToken cancellationToken)
    {
        if (requestedPetIds is null || requestedPetIds.Count == 0)
        {
            return Array.Empty<Guid>();
        }

        var candidateIds = requestedPetIds
            .Where(petId => petId != Guid.Empty && petId != primaryPetId)
            .Distinct()
            .ToArray();

        if (candidateIds.Length == 0)
        {
            return Array.Empty<Guid>();
        }

        var ownedPetIds = await _dbContext.Pets
            .AsNoTracking()
            .Where(pet =>
                candidateIds.Contains(pet.Id)
                && pet.OwnerUserId == userId
                && pet.DeletedAt == null)
            .Select(pet => pet.Id)
            .ToListAsync(cancellationToken);

        if (ownedPetIds.Count != candidateIds.Length)
        {
            throw new ApiException(
                StatusCodes.Status403Forbidden,
                "pet_not_owned",
                "You can only add your own pets to a moment.");
        }

        return ownedPetIds;
    }

    /// <summary>
    /// Writes the membership rows for a new Moment, including one for the
    /// primary pet, so "which pets are in this Moment" is one query with no
    /// special case.
    ///
    /// The primary row is not marked in any way. It is identifiable because its
    /// PetId equals PetMemory.PetId, which is the only place the primary
    /// subject is recorded.
    /// </summary>
    private void SyncMomentPets(PetMemory memory, IReadOnlyCollection<Guid> additionalPetIds)
    {
        _dbContext.MomentPets.Add(new MomentPet
        {
            MomentId = memory.Id,
            PetId = memory.PetId
        });

        foreach (var petId in additionalPetIds)
        {
            _dbContext.MomentPets.Add(new MomentPet
            {
                MomentId = memory.Id,
                PetId = petId
            });
        }
    }

    /// <summary>
    /// Replaces the additional subjects of an existing Moment.
    ///
    /// The primary pet's membership row is never removed. The primary pet is
    /// fixed for the life of the Moment because it owns the Moment's place in
    /// that pet's timeline and its plan allowance, and a caller editing the
    /// "who else is in this" list must not be able to drop it.
    /// </summary>
    private async Task ReplaceMomentPetsAsync(
        PetMemory memory,
        IReadOnlyCollection<Guid> additionalPetIds,
        CancellationToken cancellationToken)
    {
        var existing = await _dbContext.MomentPets
            .Where(item => item.MomentId == memory.Id)
            .ToListAsync(cancellationToken);

        // Membership rows can only ever be missing, never contradictory, so
        // repairing one here is safe and needs no reconciliation job. A Moment
        // written before this table existed reaches this path with none.
        if (existing.All(item => item.PetId != memory.PetId))
        {
            _dbContext.MomentPets.Add(new MomentPet
            {
                MomentId = memory.Id,
                PetId = memory.PetId
            });
        }

        foreach (var row in existing.Where(item => item.PetId != memory.PetId))
        {
            if (!additionalPetIds.Contains(row.PetId))
            {
                _dbContext.MomentPets.Remove(row);
            }
        }

        var keptPetIds = existing
            .Where(item => item.PetId != memory.PetId)
            .Select(item => item.PetId)
            .ToHashSet();

        foreach (var petId in additionalPetIds.Where(petId => !keptPetIds.Contains(petId)))
        {
            _dbContext.MomentPets.Add(new MomentPet
            {
                MomentId = memory.Id,
                PetId = petId
            });
        }
    }


    /// <summary>
    /// Enforces the private-archive allowance for one pet.
    ///
    /// Only PRIVATE Moments are counted. Public Moments are social content and
    /// are not capped by a plan; counting them here is what made a free account
    /// able to post ten times in its life.
    /// </summary>
    private async Task EnsurePrivateMemoryAllowanceAsync(
        User user,
        Guid petId,
        CancellationToken cancellationToken)
    {
        var maxPrivateMemories = user.OwnerProfile?.Plan.Limit?.MaxPrivateMemoriesPerPet
            ?? throw ServerConfig("plan_limit_not_configured", "The memory plan limit is not configured.");

        var privateMemoryCount = await _dbContext.PetMemories.CountAsync(
            memory =>
                memory.PetId == petId
                && memory.DeletedAt == null
                && memory.ArchivedAt == null
                && memory.Visibility != MemoryVisibility.Public,
            cancellationToken);

        if (privateMemoryCount >= maxPrivateMemories)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "plan_limit_reached",
                $"Your current plan keeps up to {maxPrivateMemories} private memories per pet. "
                + "Sharing a moment publicly does not use this allowance.");
        }
    }

    private static void ValidateCreateRequest(CreateMemoryRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateRequired(request.Title, "title", "Title is required.", errors);
        ValidateRequired(request.Type, "type", "Moment category is required.", errors);

        if (!request.Date.HasValue)
        {
            errors["date"] = ["Moment date is required."];
        }

        if (!request.Visibility.HasValue)
        {
            errors["visibility"] = ["Visibility is required."];
        }

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }
    }

    private static void ValidateUpdateRequest(UpdateMemoryRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.Title is not null)
        {
            ValidateRequired(request.Title, "title", "Title cannot be empty.", errors);
        }

        if (request.Type is not null)
        {
            ValidateRequired(request.Type, "type", "Moment category cannot be empty.", errors);
        }

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }
    }

    private static MemoryVisibility ParseVisibility(string value, string fieldName)
    {
        var normalized = value
            .Replace(" ", "", StringComparison.OrdinalIgnoreCase)
            .Replace("-", "", StringComparison.OrdinalIgnoreCase);

        if (string.Equals(normalized, FamilyOnlyApiVisibility, StringComparison.OrdinalIgnoreCase)
            || string.Equals(value, FamilyOnlyVisibility, StringComparison.OrdinalIgnoreCase))
        {
            return MemoryVisibility.FamilyOnly;
        }

        if (Enum.TryParse<MemoryVisibility>(normalized, ignoreCase: true, out var visibility))
        {
            return visibility;
        }

        throw ValidationFailed(new Dictionary<string, string[]>
        {
            [fieldName] = ["Visibility is not supported."]
        });
    }

    private async Task<IReadOnlyCollection<MemoryResponse>> ToResponsesAsync(
        IReadOnlyCollection<PetMemory> memories,
        CancellationToken cancellationToken)
    {
        var memoryIds = memories.Select(memory => memory.Id).ToArray();
        var mediaByMemory = await LoadMemoryMediaAsync(memoryIds, cancellationToken);
        var petsByMemory = await LoadAdditionalPetIdsAsync(memoryIds, cancellationToken);

        return memories
            .Select(memory => ToResponse(
                memory,
                mediaByMemory.TryGetValue(memory.Id, out var media) ? media : Array.Empty<MemoryMediaResponse>(),
                petsByMemory.TryGetValue(memory.Id, out var pets) ? pets : Array.Empty<Guid>()))
            .ToArray();
    }

    private async Task<MemoryResponse> ToResponseAsync(PetMemory memory, CancellationToken cancellationToken)
    {
        var mediaByMemory = await LoadMemoryMediaAsync([memory.Id], cancellationToken);
        var petsByMemory = await LoadAdditionalPetIdsAsync([memory.Id], cancellationToken);
        return ToResponse(
            memory,
            mediaByMemory.TryGetValue(memory.Id, out var media) ? media : Array.Empty<MemoryMediaResponse>(),
            petsByMemory.TryGetValue(memory.Id, out var pets) ? pets : Array.Empty<Guid>());
    }

    private async Task<Dictionary<Guid, MemoryMediaResponse[]>> LoadMemoryMediaAsync(
        IReadOnlyCollection<Guid> memoryIds,
        CancellationToken cancellationToken)
    {
        if (memoryIds.Count == 0)
        {
            return new Dictionary<Guid, MemoryMediaResponse[]>();
        }

        var links = await _dbContext.MediaFileLinks
            .AsNoTracking()
            .Include(link => link.MediaFile)
            .Where(link =>
                memoryIds.Contains(link.OwnerId)
                && link.OwnerType == MediaOwnerType.PetMemory
                && link.ArchivedAt == null
                && link.MediaFile.UploadStatus == MediaUploadStatus.Ready
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

    private async Task AttachMediaToMemoryAsync(
        Guid userId,
        PetMemory memory,
        IReadOnlyCollection<Guid>? mediaFileIds,
        CancellationToken cancellationToken)
    {
        if (mediaFileIds is null || mediaFileIds.Count == 0)
        {
            return;
        }

        await ReplaceMemoryMediaAsync(userId, memory, mediaFileIds, cancellationToken);
    }

    private async Task ReplaceMemoryMediaAsync(
        Guid userId,
        PetMemory memory,
        IReadOnlyCollection<Guid> mediaFileIds,
        CancellationToken cancellationToken)
    {
        var distinctIds = mediaFileIds.Where(id => id != Guid.Empty).Distinct().ToArray();

        if (distinctIds.Length != mediaFileIds.Count)
        {
            throw ValidationFailed(new Dictionary<string, string[]>
            {
                ["mediaFileIds"] = ["Media files must be unique."]
            });
        }

        var mediaFiles = await _dbContext.MediaFiles
            .Where(media =>
                distinctIds.Contains(media.Id)
                && media.OwnerUserId == userId
                && media.PetId == memory.PetId
                && media.UploadStatus == MediaUploadStatus.Ready
                && media.DeletedAt == null
                && (media.Category == MediaUploadCategory.MomentImage
                    || media.Category == MediaUploadCategory.MomentVideo))
            .ToListAsync(cancellationToken);

        if (mediaFiles.Count != distinctIds.Length)
        {
            throw ValidationFailed(new Dictionary<string, string[]>
            {
                ["mediaFileIds"] = ["One or more media files are not available."]
            });
        }

        var existingLinks = await _dbContext.MediaFileLinks
            .Where(link => link.OwnerType == MediaOwnerType.PetMemory && link.OwnerId == memory.Id)
            .ToListAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;

        foreach (var link in existingLinks.Where(link => !distinctIds.Contains(link.MediaFileId)))
        {
            link.ArchivedAt ??= now;
        }

        for (var index = 0; index < distinctIds.Length; index++)
        {
            var mediaId = distinctIds[index];
            var link = existingLinks.FirstOrDefault(item => item.MediaFileId == mediaId);

            if (link is null)
            {
                _dbContext.MediaFileLinks.Add(new MediaFileLink
                {
                    MediaFileId = mediaId,
                    OwnerType = MediaOwnerType.PetMemory,
                    OwnerId = memory.Id,
                    SortOrder = index,
                    CreatedAt = now
                });
            }
            else
            {
                link.SortOrder = index;
                link.ArchivedAt = null;
            }
        }

        memory.CoverMediaFileId = distinctIds.FirstOrDefault() == Guid.Empty ? null : distinctIds.First();
    }

    private static MemoryResponse ToResponse(
        PetMemory memory,
        IReadOnlyCollection<MemoryMediaResponse> media,
        IReadOnlyCollection<Guid> additionalPetIds)
    {
        var visibility = MemoryVisibilityPolicy.Normalize(memory.Visibility);

        return new MemoryResponse(
            memory.Id,
            memory.PetId,
            memory.Title,
            memory.MomentDate,
            memory.Type,
            memory.Caption,
            visibility,
            MemoryVisibilityPolicy.IsPublic(visibility),
            memory.ShowInLifeTimeline,
            memory.TimelineNote,
            media,
            memory.CoverMediaFileId,
            memory.CreatedAt,
            memory.UpdatedAt,
            memory.ArchivedAt,
            additionalPetIds,
            memory.PublishedAt);
    }

    /// <summary>
    /// Additional subject pets for a set of Moments, in one query rather than
    /// one per Moment.
    /// </summary>
    private async Task<Dictionary<Guid, Guid[]>> LoadAdditionalPetIdsAsync(
        IReadOnlyCollection<Guid> momentIds,
        CancellationToken cancellationToken)
    {
        if (momentIds.Count == 0)
        {
            return new Dictionary<Guid, Guid[]>();
        }

        var rows = await _dbContext.MomentPets
            .AsNoTracking()
            .Where(item => momentIds.Contains(item.MomentId) && item.PetId != item.Moment.PetId)
            .Select(item => new { item.MomentId, item.PetId })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(row => row.MomentId)
            .ToDictionary(
                group => group.Key,
                group => group.Select(row => row.PetId).ToArray());
    }

    private static void ValidateRequired(
        string? value,
        string fieldName,
        string message,
        IDictionary<string, string[]> errors)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            errors[fieldName] = [message];
        }
    }

    private static string? NormalizeOptional(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static Guid RequireUserId(Guid? currentUserId)
    {
        return currentUserId ?? throw Unauthorized();
    }

    private static ApiException ValidationFailed(IReadOnlyDictionary<string, string[]> errors)
    {
        return new ApiException(
            StatusCodes.Status400BadRequest,
            "validation_failed",
            "Please check the submitted fields.",
            errors);
    }

    private static ApiException InvalidState(string message)
    {
        return new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_memory_state", message);
    }

    private static ApiException NotFound(string message)
    {
        return new ApiException(StatusCodes.Status404NotFound, "not_found", message);
    }

    private static ApiException Unauthorized()
    {
        return new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");
    }

    private static ApiException ServerConfig(string code, string message)
    {
        return new ApiException(StatusCodes.Status500InternalServerError, code, message);
    }
}
