using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class CareRecordService : SkeletonService, ICareRecordService
{
    private const int CareNameMaxLength = 120;
    private static readonly TimeSpan MalaysiaUtcOffset = TimeSpan.FromHours(8);
    private readonly MyPetLinkDbContext _dbContext;
    private readonly TimeProvider _timeProvider;

    public CareRecordService(
        MyPetLinkDbContext dbContext,
        TimeProvider? timeProvider = null)
    {
        _dbContext = dbContext;
        _timeProvider = timeProvider ?? TimeProvider.System;
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

        var documentsByRecord = await LoadRecordDocumentsAsync(
            records.Select(record => record.Id).ToArray(),
            cancellationToken);

        return (
            records
                .Select(record => ToResponse(
                    record,
                    documentsByRecord.TryGetValue(record.Id, out var documents)
                        ? documents
                        : Array.Empty<CareRecordDocumentResponse>()))
                .ToArray(),
            total);
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

        ValidateCreateRequest(request, GetMalaysiaToday());

        var record = new CareRecord
        {
            PetId = pet.Id,
            Pet = pet,
            CreatedAt = _timeProvider.GetUtcNow(),
            Type = request.Type!.Value,
            Title = request.Title.Trim(),
            CareName = NormalizeOptional(request.CareName),
            RecordDate = request.Date,
            DueDate = request.DueDate,
            Provider = NormalizeOptional(request.Provider),
            Notes = NormalizeOptional(request.Notes),
            PublicVisibility = CareVisibilityPolicy.Normalize(
                request.PublicVisibility ?? CareRecordPublicVisibility.Private),
            FulfillsCareRecordId = request.FulfillsCareRecordId
        };

        await ValidateFulfillmentAsync(userId, record, cancellationToken);

        await ReplaceRecordMediaAsync(userId, record, request.MediaFileIds, cancellationToken);
        _dbContext.CareRecords.Add(record);
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsFulfillmentUniqueViolation(exception))
        {
            throw FulfillmentValidationFailed(
                "This care record has already been fulfilled by another record.");
        }

        return await ToResponseAsync(record, cancellationToken);
    }

    public async Task<CareRecordResponse> GetAsync(
        Guid? currentUserId,
        Guid recordId,
        CancellationToken cancellationToken = default)
    {
        var record = await LoadOwnedRecordAsync(currentUserId, recordId, trackChanges: false, cancellationToken);
        return await ToResponseAsync(record, cancellationToken);
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

        ValidateUpdateRequest(request, record, GetMalaysiaToday());

        var userId = RequireUserId(currentUserId);
        var nextType = request.Type ?? record.Type;
        var nextDueDate = request.ClearDueDate == true
            ? null
            : request.DueDate ?? record.DueDate;
        var nextFulfillsCareRecordId = request.ClearFulfillsCareRecordId == true
            ? null
            : request.FulfillsCareRecordId ?? record.FulfillsCareRecordId;
        var candidate = new CareRecord
        {
            Id = record.Id,
            PetId = record.PetId,
            Type = nextType,
            DueDate = nextDueDate,
            CreatedAt = record.CreatedAt,
            FulfillsCareRecordId = nextFulfillsCareRecordId
        };

        await ValidateFulfillmentAsync(userId, candidate, cancellationToken);
        await ValidateIncomingFulfillmentIntegrityAsync(
            record.Id,
            nextType,
            nextDueDate,
            cancellationToken);

        if (request.Type.HasValue)
        {
            record.Type = request.Type.Value;
        }

        if (request.Title is not null)
        {
            record.Title = request.Title.Trim();
        }

        if (request.ClearCareName == true)
        {
            record.CareName = null;
        }
        else if (request.CareName is not null)
        {
            record.CareName = NormalizeOptional(request.CareName);
        }

        if (request.Date.HasValue)
        {
            record.RecordDate = request.Date;
        }

        if (request.ClearDueDate == true)
        {
            record.DueDate = null;
        }
        else if (request.DueDate.HasValue)
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

        record.PublicVisibility = CareVisibilityPolicy.Normalize(
            request.PublicVisibility ?? record.PublicVisibility);
        record.FulfillsCareRecordId = nextFulfillsCareRecordId;

        if (request.MediaFileIds is not null)
        {
            await ReplaceRecordMediaAsync(userId, record, request.MediaFileIds, cancellationToken);
        }

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsFulfillmentUniqueViolation(exception))
        {
            throw FulfillmentValidationFailed(
                "This care record has already been fulfilled by another record.");
        }
        return await ToResponseAsync(record, cancellationToken);
    }

    public async Task ArchiveAsync(
        Guid? currentUserId,
        Guid recordId,
        CancellationToken cancellationToken = default)
    {
        var record = await LoadOwnedRecordAsync(currentUserId, recordId, trackChanges: true, cancellationToken);
        var fulfillingRecord = await _dbContext.CareRecords
            .SingleOrDefaultAsync(
                item => item.FulfillsCareRecordId == record.Id,
                cancellationToken);

        if (fulfillingRecord is not null)
        {
            fulfillingRecord.FulfillsCareRecordId = null;
        }

        var now = _timeProvider.GetUtcNow();
        record.FulfillsCareRecordId = null;
        record.ArchivedAt ??= now;

        var documentLinks = await _dbContext.MediaFileLinks
            .Where(link =>
                link.OwnerType == MediaOwnerType.CareRecord
                && link.OwnerId == record.Id
                && link.ArchivedAt == null)
            .ToListAsync(cancellationToken);

        foreach (var link in documentLinks)
        {
            link.ArchivedAt = now;
        }

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

    private static void ValidateCreateRequest(
        CreateCareRecordRequest request,
        DateOnly today)
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

        ValidateRecordDate(request.Type, request.Date, today, errors);
        ValidateDueDate(request.Date, request.DueDate, errors);
        ValidateOptionalMaxLength(
            request.CareName,
            CareNameMaxLength,
            "careName",
            "Care name must be 120 characters or fewer.",
            errors);

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }
    }

    private static void ValidateUpdateRequest(
        UpdateCareRecordRequest request,
        CareRecord current,
        DateOnly today)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.Title is not null)
        {
            ValidateRequired(request.Title, "title", "Title cannot be empty.", errors);
        }

        ValidateOptionalMaxLength(
            request.CareName,
            CareNameMaxLength,
            "careName",
            "Care name must be 120 characters or fewer.",
            errors);

        if (request.ClearCareName == true && request.CareName is not null)
        {
            errors["careName"] = ["Care name cannot be set and cleared in the same request."];
        }

        if (request.ClearFulfillsCareRecordId == true && request.FulfillsCareRecordId.HasValue)
        {
            errors["fulfillsCareRecordId"] =
                ["Fulfilment cannot be set and cleared in the same request."];
        }

        var recordType = request.Type ?? current.Type;
        var recordDate = request.Date ?? current.RecordDate;
        var dueDate = request.ClearDueDate == true
            ? null
            : request.DueDate ?? current.DueDate;
        ValidateRecordDate(recordType, recordDate, today, errors);
        ValidateDueDate(recordDate, dueDate, errors);

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }
    }

    private static void ValidateRecordDate(
        CareRecordType? recordType,
        DateOnly? recordDate,
        DateOnly today,
        IDictionary<string, string[]> errors)
    {
        if (recordDate.HasValue && recordDate.Value > today)
        {
            errors["date"] = [GetFutureRecordDateMessage(recordType)];
        }
    }

    private static string GetFutureRecordDateMessage(CareRecordType? recordType)
    {
        return recordType switch
        {
            CareRecordType.Vaccine =>
                "Vaccination date cannot be in the future. Use Next Vaccination Due Date to track future care.",
            CareRecordType.Deworming =>
                "Deworming date cannot be in the future. Use Next Deworming Due Date to track future care.",
            CareRecordType.Grooming =>
                "Grooming date cannot be in the future. Use Next Grooming Date to track future care.",
            CareRecordType.VetVisit =>
                "Visit date cannot be in the future. Use Next Follow-up Date to track future care.",
            CareRecordType.Medication =>
                "Start date cannot be in the future. Use Next Review Date to track future care.",
            CareRecordType.Surgery =>
                "Surgery date cannot be in the future. Use Next Follow-up Date to track future care.",
            CareRecordType.LabTest =>
                "Test date cannot be in the future. Use Next Follow-up Date to track future care.",
            _ =>
                "Care date cannot be in the future. Use the next care date to track future care."
        };
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

    private async Task ValidateFulfillmentAsync(
        Guid userId,
        CareRecord candidate,
        CancellationToken cancellationToken)
    {
        if (!candidate.FulfillsCareRecordId.HasValue)
        {
            return;
        }

        var targetId = candidate.FulfillsCareRecordId.Value;
        if (targetId == Guid.Empty || targetId == candidate.Id)
        {
            throw FulfillmentValidationFailed("A care record cannot fulfil itself.");
        }

        var target = await _dbContext.CareRecords
            .AsNoTracking()
            .SingleOrDefaultAsync(
                record =>
                    record.Id == targetId
                    && record.Pet.OwnerUserId == userId
                    && record.Pet.DeletedAt == null
                    && record.DeletedAt == null
                    && record.ArchivedAt == null,
                cancellationToken);

        if (target is null)
        {
            throw FulfillmentValidationFailed(
                "The care record to fulfil is not available.");
        }

        if (target.PetId != candidate.PetId)
        {
            throw FulfillmentValidationFailed(
                "The care record to fulfil must belong to the same pet.");
        }

        if (target.Type != candidate.Type)
        {
            throw FulfillmentValidationFailed(
                "The care record to fulfil must have the same care type.");
        }

        if (!target.DueDate.HasValue)
        {
            throw FulfillmentValidationFailed(
                "Only a care record with a next due date can be fulfilled.");
        }

        var alreadyClaimed = await _dbContext.CareRecords
            .AsNoTracking()
            .AnyAsync(
                record =>
                    record.Id != candidate.Id
                    && record.FulfillsCareRecordId == targetId,
                cancellationToken);

        if (alreadyClaimed)
        {
            throw FulfillmentValidationFailed(
                "This care record has already been fulfilled by another record.");
        }

        if (await WouldCreateFulfillmentCycleAsync(candidate.Id, targetId, cancellationToken))
        {
            throw FulfillmentValidationFailed(
                "This fulfilment would create a cycle between care records.");
        }

        if (target.CreatedAt >= candidate.CreatedAt)
        {
            throw FulfillmentValidationFailed(
                "A care record can fulfil only an older care record.");
        }
    }

    private async Task<bool> WouldCreateFulfillmentCycleAsync(
        Guid candidateId,
        Guid targetId,
        CancellationToken cancellationToken)
    {
        var visited = new HashSet<Guid>();
        Guid? currentId = targetId;

        while (currentId.HasValue)
        {
            if (currentId.Value == candidateId || !visited.Add(currentId.Value))
            {
                return true;
            }

            var lookupId = currentId.Value;
            currentId = await _dbContext.CareRecords
                .AsNoTracking()
                .Where(record => record.Id == lookupId)
                .Select(record => record.FulfillsCareRecordId)
                .SingleOrDefaultAsync(cancellationToken);
        }

        return false;
    }

    private async Task ValidateIncomingFulfillmentIntegrityAsync(
        Guid targetId,
        CareRecordType nextType,
        DateOnly? nextDueDate,
        CancellationToken cancellationToken)
    {
        var fulfillingRecord = await _dbContext.CareRecords
            .AsNoTracking()
            .SingleOrDefaultAsync(
                record =>
                    record.FulfillsCareRecordId == targetId
                    && record.DeletedAt == null
                    && record.ArchivedAt == null,
                cancellationToken);

        if (fulfillingRecord is null)
        {
            return;
        }

        var errors = new Dictionary<string, string[]>();
        if (!nextDueDate.HasValue)
        {
            errors["dueDate"] =
                ["Clear the completing record's due-item selection before removing this next due date."];
        }

        if (fulfillingRecord.Type != nextType)
        {
            errors["type"] =
                ["Clear the completing record's due-item selection before changing this record type."];
        }

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }
    }

    private async Task ReplaceRecordMediaAsync(
        Guid userId,
        CareRecord record,
        IReadOnlyCollection<Guid>? mediaFileIds,
        CancellationToken cancellationToken)
    {
        if (mediaFileIds is null)
        {
            return;
        }

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
                && media.PetId == record.PetId
                && media.UploadStatus == MediaUploadStatus.Ready
                && media.DeletedAt == null
                && (media.Category == MediaUploadCategory.VaccinationDocument
                    || media.Category == MediaUploadCategory.MedicalDocument))
            .ToListAsync(cancellationToken);

        if (mediaFiles.Count != distinctIds.Length)
        {
            throw ValidationFailed(new Dictionary<string, string[]>
            {
                ["mediaFileIds"] = ["One or more files are not available."]
            });
        }

        var existingLinks = await _dbContext.MediaFileLinks
            .Where(link => link.OwnerType == MediaOwnerType.CareRecord && link.OwnerId == record.Id)
            .ToListAsync(cancellationToken);
        var now = _timeProvider.GetUtcNow();

        var stagedPetLinks = await _dbContext.MediaFileLinks
            .Where(link =>
                distinctIds.Contains(link.MediaFileId)
                && link.OwnerType == MediaOwnerType.Pet
                && link.OwnerId == record.PetId
                && link.ArchivedAt == null)
            .ToListAsync(cancellationToken);

        foreach (var link in stagedPetLinks)
        {
            link.ArchivedAt = now;
        }

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
                    OwnerType = MediaOwnerType.CareRecord,
                    OwnerId = record.Id,
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

    private async Task<CareRecordResponse> ToResponseAsync(
        CareRecord record,
        CancellationToken cancellationToken)
    {
        var documentsByRecord = await LoadRecordDocumentsAsync([record.Id], cancellationToken);
        return ToResponse(
            record,
            documentsByRecord.TryGetValue(record.Id, out var documents)
                ? documents
                : Array.Empty<CareRecordDocumentResponse>());
    }

    private async Task<Dictionary<Guid, CareRecordDocumentResponse[]>> LoadRecordDocumentsAsync(
        IReadOnlyCollection<Guid> recordIds,
        CancellationToken cancellationToken)
    {
        if (recordIds.Count == 0)
        {
            return new Dictionary<Guid, CareRecordDocumentResponse[]>();
        }

        var links = await _dbContext.MediaFileLinks
            .AsNoTracking()
            .Include(link => link.MediaFile)
            .Where(link =>
                recordIds.Contains(link.OwnerId)
                && link.OwnerType == MediaOwnerType.CareRecord
                && link.ArchivedAt == null
                && link.MediaFile.UploadStatus == MediaUploadStatus.Ready
                && link.MediaFile.DeletedAt == null
                && (link.MediaFile.Category == MediaUploadCategory.VaccinationDocument
                    || link.MediaFile.Category == MediaUploadCategory.MedicalDocument))
            .OrderBy(link => link.SortOrder)
            .ThenBy(link => link.CreatedAt)
            .ToListAsync(cancellationToken);

        return links
            .GroupBy(link => link.OwnerId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .Select(link => new CareRecordDocumentResponse(
                        link.MediaFileId,
                        link.MediaFile.OriginalFileName,
                        link.MediaFile.ContentType,
                        link.MediaFile.FileSize,
                        link.MediaFile.Category,
                        link.SortOrder))
                    .ToArray());
    }

    private CareRecordResponse ToResponse(
        CareRecord record,
        IReadOnlyCollection<CareRecordDocumentResponse> documents)
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
            CareVisibilityPolicy.Normalize(record.PublicVisibility),
            DeriveStatus(record),
            record.CreatedAt,
            record.UpdatedAt,
            record.ArchivedAt,
            record.CareName,
            record.FulfillsCareRecordId,
            documents);
    }

    private string DeriveStatus(CareRecord record)
    {
        if (!record.DueDate.HasValue)
        {
            return "complete";
        }

        var today = GetMalaysiaToday();
        if (record.DueDate.Value < today)
        {
            return "overdue";
        }

        return record.DueDate.Value <= today.AddDays(30) ? "due-soon" : "upcoming";
    }

    private DateOnly GetMalaysiaToday()
    {
        var malaysiaNow = _timeProvider.GetUtcNow().ToOffset(MalaysiaUtcOffset);
        return DateOnly.FromDateTime(malaysiaNow.DateTime);
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

    private static void ValidateOptionalMaxLength(
        string? value,
        int maxLength,
        string fieldName,
        string message,
        IDictionary<string, string[]> errors)
    {
        if (value is not null && value.Trim().Length > maxLength)
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

    private static ApiException FulfillmentValidationFailed(string message)
    {
        return ValidationFailed(new Dictionary<string, string[]>
        {
            ["fulfillsCareRecordId"] = [message]
        });
    }

    private static bool IsFulfillmentUniqueViolation(DbUpdateException exception)
    {
        return exception.InnerException is Microsoft.Data.SqlClient.SqlException sql
            && sql.Number is 2601 or 2627
            && sql.Message.Contains(
                "IX_CareRecords_FulfillsCareRecordId",
                StringComparison.Ordinal);
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
