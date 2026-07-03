using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class SmartTagService : SkeletonService, ISmartTagService
{
    private readonly MyPetLinkDbContext _dbContext;

    public SmartTagService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<(IReadOnlyCollection<SmartTagResponse> Items, int Total)> ListAsync(
        Guid? currentUserId,
        int page,
        int pageSize,
        Guid? petId,
        string? status,
        string? type,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);

        if (petId.HasValue)
        {
            await EnsureOwnedPetExistsAsync(userId, petId.Value, cancellationToken);
        }

        var query = OwnedTagsQuery(userId).AsNoTracking();

        if (petId.HasValue)
        {
            query = query.Where(tag => tag.PetId == petId.Value);
        }

        query = ApplyFilters(query, status, type);

        var total = await query.CountAsync(cancellationToken);
        var tags = await IncludeTagResponseGraph(query)
            .OrderByDescending(tag => tag.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (tags.Select(TagDtoMapper.ToSmartTagResponse).ToArray(), total);
    }

    public async Task<(IReadOnlyCollection<SmartTagResponse> Items, int Total)> ListForPetAsync(
        Guid? currentUserId,
        Guid petId,
        int page,
        int pageSize,
        string? status,
        string? type,
        CancellationToken cancellationToken = default)
    {
        return await ListAsync(
            currentUserId,
            page,
            pageSize,
            petId,
            status,
            type,
            cancellationToken);
    }

    public async Task<SmartTagResponse> GetAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default)
    {
        var tag = await LoadOwnedTagAsync(currentUserId, tagId, trackChanges: false, cancellationToken);
        return TagDtoMapper.ToSmartTagResponse(tag);
    }

    public async Task<SmartTagResponse> ActivateAsync(
        Guid? currentUserId,
        string tagCode,
        ActivateTagRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var normalizedCode = NormalizeTagCode(tagCode);

        if (string.IsNullOrWhiteSpace(normalizedCode))
        {
            throw NotFound("Tag was not found.");
        }

        var pet = await LoadOwnedPetAsync(userId, request.PetId, cancellationToken);

        if (pet.LifecycleStatus != PetLifecycleStatus.Active || pet.ArchivedAt.HasValue)
        {
            throw InvalidState("Tags can only be activated for active pet profiles.");
        }

        var tag = await _dbContext.SmartTags
            .Include(item => item.Pet)
            .Include(item => item.Order)
            .Include(item => item.Batch)
            .SingleOrDefaultAsync(
                item => item.TagCode == normalizedCode && item.DeletedAt == null,
                cancellationToken);

        if (tag is null)
        {
            throw NotFound("Tag was not found.");
        }

        if (tag.OwnerUserId.HasValue && tag.OwnerUserId.Value != userId)
        {
            throw NotFound("Tag was not found.");
        }

        if (tag.PetId.HasValue && tag.PetId.Value != pet.Id)
        {
            throw InvalidState("This tag is already reserved for another pet profile.");
        }

        if (tag.ArchivedAt.HasValue
            || (tag.Status != SmartTagStatus.Unclaimed && tag.Status != SmartTagStatus.Delivered))
        {
            throw InvalidState("This tag cannot be activated yet.");
        }

        var now = DateTimeOffset.UtcNow;
        tag.OwnerUserId = userId;
        tag.PetId = pet.Id;
        tag.Pet = pet;
        tag.Status = SmartTagStatus.Active;
        tag.ActivatedAt ??= now;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return TagDtoMapper.ToSmartTagResponse(tag);
    }

    public async Task<SmartTagResponse> MarkLostAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default)
    {
        var tag = await LoadOwnedTagAsync(currentUserId, tagId, trackChanges: true, cancellationToken);

        if (tag.Status != SmartTagStatus.Active && tag.Status != SmartTagStatus.Delivered)
        {
            throw InvalidState("Only active or delivered tags can be reported lost.");
        }

        tag.Status = SmartTagStatus.Lost;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return TagDtoMapper.ToSmartTagResponse(tag);
    }

    public async Task<SmartTagResponse> DisableAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default)
    {
        var tag = await LoadOwnedTagAsync(currentUserId, tagId, trackChanges: true, cancellationToken);

        if (tag.Status != SmartTagStatus.Active && tag.Status != SmartTagStatus.Delivered)
        {
            throw InvalidState("Only active or delivered tags can be disabled by the owner.");
        }

        tag.Status = SmartTagStatus.Disabled;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return TagDtoMapper.ToSmartTagResponse(tag);
    }

    public async Task<SmartTagResponse> ArchiveAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default)
    {
        var tag = await LoadOwnedTagAsync(currentUserId, tagId, trackChanges: true, cancellationToken);

        if (!CanOwnerArchive(tag))
        {
            throw InvalidState("Active tags must be reported lost or disabled before they can be archived.");
        }

        tag.ArchivedAt ??= DateTimeOffset.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return TagDtoMapper.ToSmartTagResponse(tag);
    }

    public async Task<SmartTagResponse> RestoreAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default)
    {
        var tag = await LoadOwnedTagAsync(currentUserId, tagId, trackChanges: true, cancellationToken);
        tag.ArchivedAt = null;

        if (tag.Status == SmartTagStatus.Archived)
        {
            tag.Status = SmartTagStatus.Disabled;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        return TagDtoMapper.ToSmartTagResponse(tag);
    }

    private IQueryable<SmartTag> OwnedTagsQuery(Guid userId)
    {
        return _dbContext.SmartTags.Where(tag =>
            tag.DeletedAt == null
            && (tag.OwnerUserId == userId || (tag.Pet != null && tag.Pet.OwnerUserId == userId)));
    }

    private static IQueryable<SmartTag> IncludeTagResponseGraph(IQueryable<SmartTag> query)
    {
        return query
            .Include(tag => tag.Pet)
            .Include(tag => tag.Order)
            .Include(tag => tag.Batch);
    }

    private static IQueryable<SmartTag> ApplyFilters(
        IQueryable<SmartTag> query,
        string? status,
        string? type)
    {
        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsedStatus = ParseStatus(status);
            query = query.Where(tag => tag.Status == parsedStatus);
        }

        if (!string.IsNullOrWhiteSpace(type))
        {
            var hasNfc = ParseType(type);
            query = query.Where(tag => tag.HasNfc == hasNfc);
        }

        return query;
    }

    private async Task<Pet> LoadOwnedPetAsync(
        Guid userId,
        Guid petId,
        CancellationToken cancellationToken)
    {
        var pet = await _dbContext.Pets.SingleOrDefaultAsync(
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

    private async Task<SmartTag> LoadOwnedTagAsync(
        Guid? currentUserId,
        Guid tagId,
        bool trackChanges,
        CancellationToken cancellationToken)
    {
        var userId = RequireUserId(currentUserId);
        var query = IncludeTagResponseGraph(OwnedTagsQuery(userId))
            .Where(tag => tag.Id == tagId);

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        var tag = await query.SingleOrDefaultAsync(cancellationToken);
        return tag ?? throw NotFound("Tag was not found.");
    }

    private static bool CanOwnerArchive(SmartTag tag)
    {
        if (tag.ArchivedAt.HasValue || tag.Status == SmartTagStatus.Archived)
        {
            return true;
        }

        if (tag.Pet is not null && tag.Pet.LifecycleStatus != PetLifecycleStatus.Active)
        {
            return true;
        }

        return tag.Status is SmartTagStatus.Lost
            or SmartTagStatus.Disabled
            or SmartTagStatus.Replaced
            or SmartTagStatus.Unclaimed;
    }

    private static SmartTagStatus ParseStatus(string value)
    {
        var normalized = NormalizeEnumInput(value);

        if (Enum.TryParse<SmartTagStatus>(normalized, ignoreCase: true, out var status))
        {
            return status;
        }

        throw ValidationFailed("status", "Tag status is not supported.");
    }

    private static bool ParseType(string value)
    {
        var normalized = NormalizeEnumInput(value);

        return normalized switch
        {
            "Qr" or "QrPetTag" or "QrTag" => false,
            "QrNfc" or "QrNfcSmartTag" or "Nfc" or "QrNfcTag" => true,
            _ => throw ValidationFailed("type", "Tag type is not supported.")
        };
    }

    private static string NormalizeEnumInput(string value)
    {
        return value
            .Trim()
            .Replace("_", "", StringComparison.OrdinalIgnoreCase)
            .Replace("-", "", StringComparison.OrdinalIgnoreCase)
            .Replace(" ", "", StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeTagCode(string value)
    {
        return value.Trim().ToUpperInvariant();
    }

    private static Guid RequireUserId(Guid? currentUserId)
    {
        return currentUserId ?? throw Unauthorized();
    }

    private static ApiException ValidationFailed(string field, string message)
    {
        return new ApiException(
            StatusCodes.Status400BadRequest,
            "validation_failed",
            "Please check the submitted fields.",
            new Dictionary<string, string[]>
            {
                [field] = [message]
            });
    }

    private static ApiException InvalidState(string message)
    {
        return new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_tag_state", message);
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
}
