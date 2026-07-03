using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class CareRecordService : SkeletonService, ICareRecordService
{
    private readonly MyPetLinkDbContext _dbContext;

    public CareRecordService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<(IReadOnlyCollection<CareRecordResponse> Items, int Total)> ListForPetAsync(
        Guid? currentUserId,
        Guid petId,
        int page,
        int pageSize,
        string? type,
        DateOnly? fromDate,
        DateOnly? toDate,
        bool includeArchived,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        await EnsureOwnedPetExistsAsync(userId, petId, cancellationToken);
        ValidateDateRange(fromDate, toDate);

        var query = _dbContext.CareRecords
            .AsNoTracking()
            .Where(record =>
                record.PetId == petId
                && record.Pet.OwnerUserId == userId
                && record.Pet.DeletedAt == null
                && record.DeletedAt == null);

        if (!includeArchived)
        {
            query = query.Where(record => record.ArchivedAt == null);
        }

        if (!string.IsNullOrWhiteSpace(type))
        {
            var parsedType = ParseType(type, "type");
            query = query.Where(record => record.Type == parsedType);
        }

        if (fromDate.HasValue)
        {
            query = query.Where(record => record.RecordDate >= fromDate.Value);
        }

        if (toDate.HasValue)
        {
            query = query.Where(record => record.RecordDate <= toDate.Value);
        }

        var total = await query.CountAsync(cancellationToken);
        var records = await query
            .OrderByDescending(record => record.RecordDate)
            .ThenByDescending(record => record.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (records.Select(ToResponse).ToArray(), total);
    }

    public async Task<CareRecordResponse> CreateAsync(
        Guid? currentUserId,
        Guid petId,
        CreateCareRecordRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var pet = await LoadOwnedPetAsync(userId, petId, cancellationToken);

        if (pet.LifecycleStatus == PetLifecycleStatus.Archived)
        {
            throw InvalidState("Archived pets must be restored before adding new care records.");
        }

        ValidateCreateRequest(request);

        var record = new CareRecord
        {
            PetId = pet.Id,
            Pet = pet,
            Type = request.Type!.Value,
            Title = request.Title.Trim(),
            RecordDate = request.Date,
            DueDate = request.DueDate,
            Provider = NormalizeOptional(request.Provider),
            Notes = NormalizeOptional(request.Notes),
            PublicVisibility = request.PublicVisibility ?? CareRecordPublicVisibility.Private
        };

        _dbContext.CareRecords.Add(record);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return ToResponse(record);
    }

    public async Task<CareRecordResponse> GetAsync(
        Guid? currentUserId,
        Guid recordId,
        CancellationToken cancellationToken = default)
    {
        var record = await LoadOwnedRecordAsync(currentUserId, recordId, trackChanges: false, cancellationToken);
        return ToResponse(record);
    }

    public async Task<CareRecordResponse> UpdateAsync(
        Guid? currentUserId,
        Guid recordId,
        UpdateCareRecordRequest request,
        CancellationToken cancellationToken = default)
    {
        var record = await LoadOwnedRecordAsync(currentUserId, recordId, trackChanges: true, cancellationToken);

        if (record.ArchivedAt.HasValue)
        {
            throw InvalidState("Archived care records cannot be updated.");
        }

        ValidateUpdateRequest(request, record);

        if (request.Type.HasValue)
        {
            record.Type = request.Type.Value;
        }

        if (request.Title is not null)
        {
            record.Title = request.Title.Trim();
        }

        if (request.Date.HasValue)
        {
            record.RecordDate = request.Date;
        }

        if (request.DueDate.HasValue)
        {
            record.DueDate = request.DueDate;
        }

        if (request.Provider is not null)
        {
            record.Provider = NormalizeOptional(request.Provider);
        }

        if (request.Notes is not null)
        {
            record.Notes = NormalizeOptional(request.Notes);
        }

        if (request.PublicVisibility.HasValue)
        {
            record.PublicVisibility = request.PublicVisibility.Value;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToResponse(record);
    }

    public async Task ArchiveAsync(
        Guid? currentUserId,
        Guid recordId,
        CancellationToken cancellationToken = default)
    {
        var record = await LoadOwnedRecordAsync(currentUserId, recordId, trackChanges: true, cancellationToken);
        record.ArchivedAt ??= DateTimeOffset.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);
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

    private async Task<CareRecord> LoadOwnedRecordAsync(
        Guid? currentUserId,
        Guid recordId,
        bool trackChanges,
        CancellationToken cancellationToken)
    {
        var userId = RequireUserId(currentUserId);
        var query = _dbContext.CareRecords
            .Include(record => record.Pet)
            .Where(record =>
                record.Id == recordId
                && record.Pet.OwnerUserId == userId
                && record.Pet.DeletedAt == null
                && record.DeletedAt == null);

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        var record = await query.SingleOrDefaultAsync(cancellationToken);
        return record ?? throw NotFound("Care record was not found.");
    }

    private static void ValidateCreateRequest(CreateCareRecordRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (!request.Type.HasValue)
        {
            errors["type"] = ["Record type is required."];
        }

        ValidateRequired(request.Title, "title", "Title is required.", errors);

        if (!request.Date.HasValue)
        {
            errors["date"] = ["Record date is required."];
        }

        if (!request.PublicVisibility.HasValue)
        {
            errors["publicVisibility"] = ["Public visibility is required."];
        }

        ValidateDueDate(request.Date, request.DueDate, errors);
        ValidateMediaPlaceholder(request.MediaFileIds, errors);

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }
    }

    private static void ValidateUpdateRequest(UpdateCareRecordRequest request, CareRecord current)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.Title is not null)
        {
            ValidateRequired(request.Title, "title", "Title cannot be empty.", errors);
        }

        var recordDate = request.Date ?? current.RecordDate;
        var dueDate = request.DueDate ?? current.DueDate;
        ValidateDueDate(recordDate, dueDate, errors);
        ValidateMediaPlaceholder(request.MediaFileIds, errors);

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }
    }

    private static void ValidateDueDate(
        DateOnly? recordDate,
        DateOnly? dueDate,
        IDictionary<string, string[]> errors)
    {
        if (recordDate.HasValue && dueDate.HasValue && dueDate.Value < recordDate.Value)
        {
            errors["dueDate"] = ["Next due date cannot be earlier than the record date."];
        }
    }

    private static void ValidateDateRange(DateOnly? fromDate, DateOnly? toDate)
    {
        if (fromDate.HasValue && toDate.HasValue && toDate.Value < fromDate.Value)
        {
            throw ValidationFailed(new Dictionary<string, string[]>
            {
                ["toDate"] = ["To date cannot be earlier than from date."]
            });
        }
    }

    private static void ValidateMediaPlaceholder(
        IReadOnlyCollection<Guid>? mediaFileIds,
        IDictionary<string, string[]> errors)
    {
        if (mediaFileIds is { Count: > 0 })
        {
            errors["mediaFileIds"] = ["File attachments are not available for care records yet."];
        }
    }

    private static CareRecordType ParseType(string value, string fieldName)
    {
        var normalized = value.Replace(" ", "", StringComparison.OrdinalIgnoreCase);
        if (Enum.TryParse<CareRecordType>(normalized, ignoreCase: true, out var type))
        {
            return type;
        }

        throw ValidationFailed(new Dictionary<string, string[]>
        {
            [fieldName] = ["Record type is not supported."]
        });
    }

    private static CareRecordResponse ToResponse(CareRecord record)
    {
        return new CareRecordResponse(
            record.Id,
            record.PetId,
            record.Type,
            record.Title,
            record.RecordDate,
            record.DueDate,
            record.Provider,
            record.Notes,
            record.PublicVisibility,
            DeriveStatus(record),
            record.CreatedAt,
            record.UpdatedAt,
            record.ArchivedAt);
    }

    private static string DeriveStatus(CareRecord record)
    {
        if (!record.DueDate.HasValue)
        {
            return "complete";
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        return record.DueDate.Value <= today.AddDays(30) ? "due-soon" : "upcoming";
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
        return new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_record_state", message);
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
