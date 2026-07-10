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
            var parsedVisibility = ParseVisibility(visibility, "visibility");
            query = query.Where(memory => memory.Visibility == parsedVisibility);
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
        await EnsureCanCreateMemoryAsync(user, petId, cancellationToken);

        var visibility = request.Visibility ?? MemoryVisibility.Private;
        var memory = new PetMemory
        {
            PetId = pet.Id,
            Pet = pet,
            Title = request.Title.Trim(),
            MomentDate = request.Date,
            Type = NormalizeOptional(request.Type),
            Caption = NormalizeOptional(request.Caption),
            Visibility = visibility,
            ShowOnPublicProfile = visibility == MemoryVisibility.Public && (request.ShowOnPublicProfile ?? false),
            ShowInLifeTimeline = visibility == MemoryVisibility.Public && (request.ShowInLifeTimeline ?? false),
            TimelineNote = NormalizeOptional(request.TimelineNote)
        };

        _dbContext.PetMemories.Add(memory);
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
            memory.Visibility = request.Visibility.Value;
        }

        if (request.ShowOnPublicProfile.HasValue)
        {
            memory.ShowOnPublicProfile = request.ShowOnPublicProfile.Value;
        }

        if (request.ShowInLifeTimeline.HasValue)
        {
            memory.ShowInLifeTimeline = request.ShowInLifeTimeline.Value;
        }

        if (memory.Visibility != MemoryVisibility.Public)
        {
            memory.ShowOnPublicProfile = false;
            memory.ShowInLifeTimeline = false;
        }

        if (request.TimelineNote is not null)
        {
            memory.TimelineNote = NormalizeOptional(request.TimelineNote);
        }

        if (request.MediaFileIds is not null)
        {
            var userId = RequireUserId(currentUserId);
            await ReplaceMemoryMediaAsync(userId, memory, request.MediaFileIds, cancellationToken);
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

    private async Task EnsureCanCreateMemoryAsync(
        User user,
        Guid petId,
        CancellationToken cancellationToken)
    {
        var maxMemories = user.OwnerProfile?.Plan.Limit?.MaxMemoriesPerPet
            ?? throw ServerConfig("plan_limit_not_configured", "The memory plan limit is not configured.");

        var activeMemoryCount = await _dbContext.PetMemories.CountAsync(
            memory =>
                memory.PetId == petId
                && memory.DeletedAt == null
                && memory.ArchivedAt == null,
            cancellationToken);

        if (activeMemoryCount >= maxMemories)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "plan_limit_reached",
                $"Your current plan allows up to {maxMemories} memories per pet.");
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
        var mediaByMemory = await LoadMemoryMediaAsync(memories.Select(memory => memory.Id).ToArray(), cancellationToken);

        return memories
            .Select(memory => ToResponse(
                memory,
                mediaByMemory.TryGetValue(memory.Id, out var media) ? media : Array.Empty<MemoryMediaResponse>()))
            .ToArray();
    }

    private async Task<MemoryResponse> ToResponseAsync(PetMemory memory, CancellationToken cancellationToken)
    {
        var mediaByMemory = await LoadMemoryMediaAsync([memory.Id], cancellationToken);
        return ToResponse(
            memory,
            mediaByMemory.TryGetValue(memory.Id, out var media) ? media : Array.Empty<MemoryMediaResponse>());
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

    private static MemoryResponse ToResponse(PetMemory memory, IReadOnlyCollection<MemoryMediaResponse> media)
    {
        return new MemoryResponse(
            memory.Id,
            memory.PetId,
            memory.Title,
            memory.MomentDate,
            memory.Type,
            memory.Caption,
            memory.Visibility,
            memory.ShowOnPublicProfile,
            memory.ShowInLifeTimeline,
            memory.TimelineNote,
            media,
            memory.CoverMediaFileId,
            memory.CreatedAt,
            memory.UpdatedAt,
            memory.ArchivedAt);
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
