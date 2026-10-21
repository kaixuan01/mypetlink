using System.Data;
using System.Security.Cryptography;
using System.Text;
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
            // A final unique key keeps pages stable when timestamps tie.
            .ThenBy(record => record.Id)
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

    /// <summary>
    /// The owner's pending care across every active pet, filtered completely
    /// in the query before it is paged.
    ///
    /// A due item is pending while it is an active record with a next due
    /// date, on an active pet the caller owns, and no active record fulfils
    /// it. Ordering is by due date, then creation time, then id, so pages are
    /// stable and a pending item can never fall behind unrelated history the
    /// way it can in the per-pet list, which is ordered by record date.
    /// </summary>
    public async Task<(UpcomingCareRecordsResponse Response, int Total)> ListUpcomingAsync(
        Guid? currentUserId,
        Guid? petId,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        if (petId.HasValue)
        {
            await EnsureOwnedPetExistsAsync(userId, petId.Value, cancellationToken);
        }

        var today = GetMalaysiaToday();
        var activeRecords = OwnedActiveRecords(userId);

        if (petId.HasValue)
        {
            activeRecords = activeRecords.Where(record => record.PetId == petId.Value);
        }

        var pending = PendingOnly(activeRecords);

        var petIdsWithCareRecords = await activeRecords
            .Select(record => record.PetId)
            .Distinct()
            .ToListAsync(cancellationToken);
        var total = await pending.CountAsync(cancellationToken);
        var rows = await pending
            .OrderBy(record => record.DueDate)
            .ThenBy(record => record.CreatedAt)
            .ThenBy(record => record.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(record => new
            {
                record.Id,
                record.PetId,
                PetName = record.Pet.Name,
                record.Type,
                record.Title,
                record.CareName,
                DueDate = record.DueDate!.Value
            })
            .ToListAsync(cancellationToken);

        var items = rows
            .Select(row => new UpcomingCareRecordResponse(
                row.Id,
                row.PetId,
                row.PetName,
                row.Type,
                row.Title,
                row.CareName,
                row.DueDate,
                DeriveStatus(row.DueDate, today)))
            .ToArray();

        return (
            new UpcomingCareRecordsResponse(today, petIdsWithCareRecords, items),
            total);
    }

    /// <summary>
    /// How many pending items one summary reads in full. Counts stay exact
    /// above it; only the choice of items shown is then uncertain, and the
    /// summary says so.
    /// </summary>
    public const int SummaryRowLimit = 1000;
    internal const int SummaryItemsPerScope = 3;
    private const int DueSoonDays = 30;

    /// <summary>
    /// The Dashboard's pending-care summary, for all active pets and for each
    /// one, from a single consistent view of the database.
    ///
    /// Every read runs inside one SERIALIZABLE, read-only transaction on SQL
    /// Server, so the active pets, the pets with care, the exact counts and
    /// the rows behind the items all describe the same committed state — a
    /// row cannot leave or join the pending set between them. This replaces
    /// stitching independently requested pages together, which can describe
    /// several states while reporting the same total. The whole read retries
    /// as a unit on a transient failure, including being chosen as a
    /// deadlock victim.
    /// </summary>
    public async Task<UpcomingCareSummaryResponse> GetUpcomingSummaryAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var today = GetMalaysiaToday();
        var horizon = today.AddDays(DueSoonDays);
        var strategy = _dbContext.Database.CreateExecutionStrategy();

        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = _dbContext.Database.IsRelational()
                ? await _dbContext.Database.BeginTransactionAsync(
                    IsolationLevel.Serializable,
                    cancellationToken)
                : null;

            var activePetIds = await _dbContext.Pets
                .AsNoTracking()
                .Where(pet =>
                    pet.OwnerUserId == userId
                    && pet.DeletedAt == null
                    && pet.ArchivedAt == null
                    && pet.LifecycleStatus == PetLifecycleStatus.Active)
                .OrderBy(pet => pet.Id)
                .Select(pet => pet.Id)
                .ToListAsync(cancellationToken);
            var activeRecords = OwnedActiveRecords(userId);
            var pending = PendingOnly(activeRecords);
            var petIdsWithCareRecords = (await activeRecords
                    .Select(record => record.PetId)
                    .Distinct()
                    .ToListAsync(cancellationToken))
                .ToHashSet();
            var counts = await pending
                .GroupBy(record => record.PetId)
                .Select(group => new
                {
                    PetId = group.Key,
                    Pending = group.Count(),
                    DueWithinHorizon = group.Count(record => record.DueDate <= horizon),
                    Overdue = group.Count(record => record.DueDate < today)
                })
                .ToListAsync(cancellationToken);
            var rows = await pending
                .OrderBy(record => record.DueDate)
                .ThenBy(record => record.CreatedAt)
                .ThenBy(record => record.Id)
                .Take(SummaryRowLimit)
                .Select(record => new
                {
                    record.Id,
                    record.PetId,
                    PetName = record.Pet.Name,
                    record.Type,
                    record.Title,
                    record.CareName,
                    DueDate = record.DueDate!.Value
                })
                .ToListAsync(cancellationToken);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }

            var items = rows
                .Select(row => new UpcomingCareRecordResponse(
                    row.Id,
                    row.PetId,
                    row.PetName,
                    row.Type,
                    row.Title,
                    row.CareName,
                    row.DueDate,
                    DeriveStatus(row.DueDate, today)))
                .ToArray();
            var countsByPet = counts.ToDictionary(count => count.PetId);
            var totalPending = counts.Sum(count => count.Pending);
            var scopes = new List<UpcomingCareScopeResponse>
            {
                new(
                    null,
                    activePetIds.Any(petIdsWithCareRecords.Contains),
                    totalPending,
                    counts.Sum(count => count.DueWithinHorizon),
                    counts.Sum(count => count.Overdue),
                    SelectDashboardItems(items, today))
            };

            foreach (var petId in activePetIds)
            {
                countsByPet.TryGetValue(petId, out var count);
                scopes.Add(new UpcomingCareScopeResponse(
                    petId,
                    petIdsWithCareRecords.Contains(petId),
                    count?.Pending ?? 0,
                    count?.DueWithinHorizon ?? 0,
                    count?.Overdue ?? 0,
                    SelectDashboardItems(items.Where(item => item.PetId == petId), today)));
            }

            return new UpcomingCareSummaryResponse(
                today,
                horizon,
                items.Length == totalPending,
                scopes);
        });
    }

    /// <summary>
    /// The items a scope shows: the most recently missed one, then the
    /// nearest coming ones, then older missed ones. Mirrors the web's
    /// <c>selectDashboardCareRecords</c>, which the local preview uses.
    /// </summary>
    internal static IReadOnlyCollection<UpcomingCareRecordResponse> SelectDashboardItems(
        IEnumerable<UpcomingCareRecordResponse> pendingByDueDate,
        DateOnly malaysiaToday)
    {
        var ordered = pendingByDueDate.ToList();
        var overdue = ordered
            .Where(item => item.DueDate < malaysiaToday)
            .OrderByDescending(item => item.DueDate)
            .ToList();
        var currentAndFuture = ordered.Where(item => item.DueDate >= malaysiaToday);
        var selected = new List<UpcomingCareRecordResponse>(SummaryItemsPerScope);

        if (overdue.Count > 0)
        {
            selected.Add(overdue[0]);
            overdue.RemoveAt(0);
        }

        selected.AddRange(currentAndFuture.Take(SummaryItemsPerScope - selected.Count));
        selected.AddRange(overdue.Take(SummaryItemsPerScope - selected.Count));
        return selected;
    }

    /// <summary>
    /// Whether one due item has been completed, read from the records
    /// themselves: the target, its pet's state, the active record that fulfils
    /// it (same pet, same owner, not deleted or archived) and both records'
    /// attached documents, all inside one SERIALIZABLE read transaction so the
    /// documents belong to exactly the records returned.
    ///
    /// Absence from any pending list is never treated as completion. A target
    /// that changed — deleted from the list (archived), on an archived pet, or
    /// no longer due (its due date removed) — reports that state first, even
    /// when a write validated earlier has since linked a completing record to
    /// it; the record is still returned so the caller can see it, but the
    /// state never pretends the item completed normally.
    /// </summary>
    public async Task<CareRecordCompletionStatusResponse> GetCompletionStatusAsync(
        Guid? currentUserId,
        Guid recordId,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var today = GetMalaysiaToday();
        var strategy = _dbContext.Database.CreateExecutionStrategy();

        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = _dbContext.Database.IsRelational()
                ? await _dbContext.Database.BeginTransactionAsync(
                    IsolationLevel.Serializable,
                    cancellationToken)
                : null;

            var snapshot = await _dbContext.CareRecords
                .AsNoTracking()
                .Where(record =>
                    record.Id == recordId
                    && record.Pet.OwnerUserId == userId
                    && record.Pet.DeletedAt == null
                    && record.DeletedAt == null)
                .Select(record => new
                {
                    Target = record,
                    PetName = record.Pet.Name,
                    PetArchived = record.Pet.ArchivedAt != null
                        || record.Pet.LifecycleStatus == PetLifecycleStatus.Archived,
                    Completion = _dbContext.CareRecords
                        .Where(fulfiller =>
                            fulfiller.FulfillsCareRecordId == record.Id
                            && fulfiller.PetId == record.PetId
                            && fulfiller.Pet.OwnerUserId == userId
                            && fulfiller.Pet.DeletedAt == null
                            && fulfiller.DeletedAt == null
                            && fulfiller.ArchivedAt == null)
                        .OrderBy(fulfiller => fulfiller.CreatedAt)
                        .ThenBy(fulfiller => fulfiller.Id)
                        .FirstOrDefault()
                })
                .SingleOrDefaultAsync(cancellationToken)
                ?? throw NotFound("Care record was not found.");

            var documents = await LoadRecordDocumentsAsync(
                snapshot.Completion is null
                    ? [snapshot.Target.Id]
                    : [snapshot.Target.Id, snapshot.Completion.Id],
                cancellationToken);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }

            var state = snapshot.Target.ArchivedAt.HasValue
                ? "archived"
                : snapshot.PetArchived
                    ? "pet-archived"
                    : !snapshot.Target.DueDate.HasValue
                        ? "no-due-date"
                        : snapshot.Completion is not null
                            ? "completed"
                            : "pending";

            return new CareRecordCompletionStatusResponse(
                state,
                today,
                snapshot.PetName,
                ToResponse(snapshot.Target, DocumentsFor(documents, snapshot.Target.Id)),
                snapshot.Completion is null
                    ? null
                    : ToResponse(snapshot.Completion, DocumentsFor(documents, snapshot.Completion.Id)));
        });
    }

    private static IReadOnlyCollection<CareRecordDocumentResponse> DocumentsFor(
        Dictionary<Guid, CareRecordDocumentResponse[]> documents,
        Guid recordId)
    {
        return documents.TryGetValue(recordId, out var found)
            ? found
            : Array.Empty<CareRecordDocumentResponse>();
    }

    /// <summary>Active care records on the owner's active pets.</summary>
    private IQueryable<CareRecord> OwnedActiveRecords(Guid userId)
    {
        return _dbContext.CareRecords
            .AsNoTracking()
            .Where(record =>
                record.Pet.OwnerUserId == userId
                && record.Pet.DeletedAt == null
                && record.Pet.ArchivedAt == null
                && record.Pet.LifecycleStatus == PetLifecycleStatus.Active
                && record.DeletedAt == null
                && record.ArchivedAt == null);
    }

    /// <summary>
    /// Records with a next due date that no active record has completed.
    /// </summary>
    private IQueryable<CareRecord> PendingOnly(IQueryable<CareRecord> activeRecords)
    {
        return activeRecords.Where(record =>
            record.DueDate != null
            && !_dbContext.CareRecords.Any(fulfiller =>
                fulfiller.FulfillsCareRecordId == record.Id
                && fulfiller.DeletedAt == null
                && fulfiller.ArchivedAt == null));
    }

    public async Task<CareRecordResponse> CreateAsync(
        Guid? currentUserId,
        Guid petId,
        CreateCareRecordRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        return await RunCareWriteAsync(
            petId,
            async () =>
            {
                var record = await CreateRecordCoreAsync(
                    userId,
                    petId,
                    request,
                    stamp: null,
                    cancellationToken);
                return await ToResponseAsync(record, cancellationToken);
            },
            cancellationToken);
    }

    /// <summary>
    /// Validates and writes one new care record. Callers run it inside
    /// <see cref="RunCareWriteAsync"/>, so the fulfilment checks and the
    /// insert see no other care write for this pet in between.
    /// </summary>
    private async Task<CareRecord> CreateRecordCoreAsync(
        Guid userId,
        Guid petId,
        CreateCareRecordRequest request,
        Action<CareRecord>? stamp,
        CancellationToken cancellationToken)
    {
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
        stamp?.Invoke(record);

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

        return record;
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
        var petId = await OwnedRecordPetIdAsync(currentUserId, recordId, cancellationToken);
        return await RunCareWriteAsync(
            petId,
            () => UpdateRecordCoreAsync(currentUserId, recordId, request, cancellationToken),
            cancellationToken);
    }

    private async Task<CareRecordResponse> UpdateRecordCoreAsync(
        Guid? currentUserId,
        Guid recordId,
        UpdateCareRecordRequest request,
        CancellationToken cancellationToken)
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
        var petId = await OwnedRecordPetIdAsync(currentUserId, recordId, cancellationToken);
        await RunCareWriteAsync(
            petId,
            async () =>
            {
                await ArchiveRecordCoreAsync(currentUserId, recordId, cancellationToken);
                return true;
            },
            cancellationToken);
    }

    private async Task ArchiveRecordCoreAsync(
        Guid? currentUserId,
        Guid recordId,
        CancellationToken cancellationToken)
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

    /// <summary>
    /// Logs one pending due item as done in a single step, safely repeatable.
    ///
    /// The client sends a key it generated once for this completion. The same
    /// key with the same request returns the record it created (200,
    /// <c>replayed</c>) — after a lost response, a timeout or a double click —
    /// instead of writing again. The same key with a different request, for
    /// another item or by another owner, is refused (409). A key whose record
    /// was later deleted is refused too (409 <c>completion_removed</c>): it is
    /// never silently re-created.
    ///
    /// The completing record copies the item's type, title and care name, is
    /// dated <paramref name="request"/>.CompletedOn (Malaysia day, not in the
    /// future), may carry the next due date, and is private. It runs under the
    /// pet's care-write lock, like every other care write, so the item can't
    /// be completed, edited or archived by another request between the checks
    /// and the insert.
    /// </summary>
    public async Task<CareCompletionResultResponse> CompleteAsync(
        Guid? currentUserId,
        Guid recordId,
        CompleteCareRecordRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        if (request.IdempotencyKey is not { } key || key == Guid.Empty)
        {
            throw ValidationFailed(new Dictionary<string, string[]>
            {
                ["idempotencyKey"] = ["A completion key is required."]
            });
        }

        var completionErrors = new Dictionary<string, string[]>();
        if (!request.CompletedOn.HasValue)
        {
            completionErrors["completedOn"] = ["Choose the day this care was done."];
        }
        else if (request.CompletedOn.Value > GetMalaysiaToday())
        {
            completionErrors["completedOn"] = ["The day this care was done can't be in the future."];
        }

        if (request.CompletedOn.HasValue
            && request.NextDueDate.HasValue
            && request.NextDueDate.Value < request.CompletedOn.Value)
        {
            completionErrors["nextDueDate"] = ["The next due date can't be before the day it was done."];
        }

        if (completionErrors.Count > 0)
        {
            throw ValidationFailed(completionErrors);
        }

        var petId = await OwnedRecordPetIdAsync(userId, recordId, cancellationToken);
        var fingerprint = CompletionFingerprint(recordId, request);

        return await RunCareWriteAsync(
            petId,
            async () =>
            {
                var replay = await ReplayCompletionAsync(userId, key, fingerprint, cancellationToken);
                if (replay is not null)
                {
                    return replay;
                }

                var target = await _dbContext.CareRecords
                    .AsNoTracking()
                    .Where(record =>
                        record.Id == recordId
                        && record.Pet.OwnerUserId == userId
                        && record.Pet.DeletedAt == null
                        && record.DeletedAt == null)
                    .Select(record => new
                    {
                        record.Id,
                        record.PetId,
                        record.Type,
                        record.Title,
                        record.CareName,
                        record.DueDate,
                        record.ArchivedAt,
                        PetArchived = record.Pet.ArchivedAt != null
                            || record.Pet.LifecycleStatus == PetLifecycleStatus.Archived,
                        Completed = _dbContext.CareRecords.Any(fulfiller =>
                            fulfiller.FulfillsCareRecordId == record.Id
                            && fulfiller.DeletedAt == null
                            && fulfiller.ArchivedAt == null)
                    })
                    .SingleOrDefaultAsync(cancellationToken)
                    ?? throw NotFound("Care record was not found.");

                // The same precedence as the completion status.
                if (target.ArchivedAt.HasValue)
                {
                    throw Conflict("care_item_archived", "This care item was deleted, so it can't be logged as done.");
                }

                if (target.PetArchived)
                {
                    throw Conflict("care_item_pet_archived", "This pet's profile is archived, so care can't be logged for it right now.");
                }

                if (!target.DueDate.HasValue)
                {
                    throw Conflict("care_item_no_due_date", "This care item no longer has a due date, so there is nothing to log as done.");
                }

                if (target.Completed)
                {
                    throw Conflict("care_item_completed", "This care item was already logged as done.");
                }

                var create = new CreateCareRecordRequest(
                    target.Type,
                    target.Title,
                    request.CompletedOn,
                    request.NextDueDate,
                    request.Provider,
                    request.Notes,
                    CareRecordPublicVisibility.Private,
                    MediaFileIds: null,
                    CareName: target.CareName,
                    FulfillsCareRecordId: target.Id);

                CareRecord record;
                try
                {
                    record = await CreateRecordCoreAsync(
                        userId,
                        target.PetId,
                        create,
                        stamp: created =>
                        {
                            created.CompletionIdempotencyKey = key;
                            created.CompletionRequestFingerprint = fingerprint;
                        },
                        cancellationToken);
                }
                catch (DbUpdateException exception) when (IsUniqueViolation(exception, CompletionKeyIndexName))
                {
                    // Only a key already used for another pet's item can get
                    // here: the same pet's requests are serialized above.
                    throw IdempotencyConflict();
                }

                return new CareCompletionResultResponse(
                    "created",
                    await ToResponseAsync(record, cancellationToken));
            },
            cancellationToken);
    }

    private const string CompletionKeyIndexName = "IX_CareRecords_CompletionIdempotencyKey";

    /// <summary>
    /// The earlier answer to this completion key, if there is one: the record
    /// it created when the request matches; a refusal when it doesn't, when
    /// it belongs to someone else, or when that record has since been deleted.
    /// </summary>
    private async Task<CareCompletionResultResponse?> ReplayCompletionAsync(
        Guid userId,
        Guid key,
        string fingerprint,
        CancellationToken cancellationToken)
    {
        var earlier = await _dbContext.CareRecords
            .AsNoTracking()
            .Include(record => record.Pet)
            .SingleOrDefaultAsync(record => record.CompletionIdempotencyKey == key, cancellationToken);

        if (earlier is null)
        {
            return null;
        }

        if (earlier.Pet.OwnerUserId != userId
            || earlier.Pet.DeletedAt != null
            || !string.Equals(earlier.CompletionRequestFingerprint, fingerprint, StringComparison.Ordinal))
        {
            throw IdempotencyConflict();
        }

        if (earlier.ArchivedAt.HasValue || earlier.DeletedAt.HasValue)
        {
            throw Conflict(
                "completion_removed",
                "This care was logged as done, but that record has since been deleted.");
        }

        return new CareCompletionResultResponse("replayed", await ToResponseAsync(earlier, cancellationToken));
    }

    /// <summary>
    /// What a completion request asked for: the item, both dates and the
    /// optional text as it is stored (trimmed, empty as null). Two requests
    /// with the same key and the same fingerprint are the same request.
    ///
    /// The fields are encoded as a versioned JSON array — each value quoted
    /// and escaped, null kept distinct from text — so no value can spill into
    /// its neighbour (a newline in the provider is not the start of the
    /// notes). SHA-256 over its UTF-8 bytes, as lowercase hex.
    /// </summary>
    internal static string CompletionFingerprint(Guid targetId, CompleteCareRecordRequest request)
    {
        var canonical = System.Text.Json.JsonSerializer.Serialize(new string?[]
        {
            CompletionFingerprintVersion,
            targetId.ToString("N"),
            request.CompletedOn?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
            request.NextDueDate?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
            NormalizeOptional(request.Provider),
            NormalizeOptional(request.Notes)
        });
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }

    /// <summary>
    /// Names the fingerprint encoding. A future change to the fields gets a
    /// new version rather than changing what an existing version means.
    /// </summary>
    private const string CompletionFingerprintVersion = "care-completion-v1";

    /// <summary>
    /// Runs one care write for a pet as a single unit. On SQL Server it holds
    /// a transaction-scoped application lock per pet from before the first
    /// read to the commit, so every care write that can touch a fulfilment
    /// link — create, update, archive and complete — validates and writes
    /// with no other care write for that pet in between, whatever the
    /// database's read isolation. Retried as a whole on a transient failure,
    /// starting again from an empty change tracker.
    /// </summary>
    private Task<T> RunCareWriteAsync<T>(
        Guid petId,
        Func<Task<T>> write,
        CancellationToken cancellationToken) =>
        PetCareWriteLock.RunAsync(_dbContext, petId, write, cancellationToken);

    private async Task<Guid> OwnedRecordPetIdAsync(
        Guid? currentUserId,
        Guid recordId,
        CancellationToken cancellationToken)
    {
        var userId = RequireUserId(currentUserId);
        var petId = await _dbContext.CareRecords
            .AsNoTracking()
            .Where(record =>
                record.Id == recordId
                && record.Pet.OwnerUserId == userId
                && record.Pet.DeletedAt == null
                && record.DeletedAt == null)
            .Select(record => (Guid?)record.PetId)
            .SingleOrDefaultAsync(cancellationToken);

        return petId ?? throw NotFound("Care record was not found.");
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
        return record.DueDate.HasValue
            ? DeriveStatus(record.DueDate.Value, GetMalaysiaToday())
            : "complete";
    }

    private static string DeriveStatus(DateOnly dueDate, DateOnly malaysiaToday)
    {
        if (dueDate < malaysiaToday)
        {
            return "overdue";
        }

        return dueDate <= malaysiaToday.AddDays(30) ? "due-soon" : "upcoming";
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

    private static bool IsUniqueViolation(DbUpdateException exception, string indexName)
    {
        return exception.InnerException is Microsoft.Data.SqlClient.SqlException sql
            && sql.Number is 2601 or 2627
            && sql.Message.Contains(indexName, StringComparison.Ordinal);
    }

    private static ApiException Conflict(string code, string message)
    {
        return new ApiException(StatusCodes.Status409Conflict, code, message);
    }

    private static ApiException IdempotencyConflict()
    {
        return Conflict(
            "idempotency_key_conflict",
            "This completion key was already used for a different request.");
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
