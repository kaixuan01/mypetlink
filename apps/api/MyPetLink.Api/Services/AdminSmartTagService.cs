using System.Linq.Expressions;
using System.Data;
using System.Text;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// Admin lifecycle operations for tags that may be linked to owners and pets.
// Physical stock fulfilment deliberately remains in AdminTagInventoryService.
public sealed class AdminSmartTagService : SkeletonService, IAdminSmartTagService
{
    private const int MaxExportRows = 10_000;
    private static readonly string[] ExportHeaders =
    [
        "Tag Code", "Tag Type", "Variant", "Lifecycle Status", "Pet", "Owner",
        "Owner Email", "Order", "Activated At (UTC)", "Last Scanned At (UTC)",
        "Scan Count", "Created At (UTC)", "Updated At (UTC)"
    ];

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;

    public AdminSmartTagService(MyPetLinkDbContext dbContext, IAuditLogService auditLogService)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
    }

    public async Task<(IReadOnlyCollection<AdminSmartTagItemResponse> Items, int Total)> ListAsync(
        AdminSmartTagQuery query,
        CancellationToken cancellationToken = default)
    {
        var filtered = BuildFilteredQuery(query, includeStatus: true);
        var total = await filtered.CountAsync(cancellationToken);
        var items = await Project(ApplySort(filtered, query.SortBy, query.SortDir))
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return (items, total);
    }

    public async Task<AdminSmartTagStatusCountsResponse> CountByStatusAsync(
        AdminSmartTagQuery query,
        CancellationToken cancellationToken = default)
    {
        // Status is intentionally omitted so shortcut counts remain useful
        // while every other active search/filter still constrains them.
        var tags = BuildFilteredQuery(query, includeStatus: false);
        var counts = await tags.GroupBy(_ => 1).Select(group => new
        {
            All = group.Count(),
            Active = group.Count(tag => tag.ArchivedAt == null && tag.Status == SmartTagStatus.Active),
            Awaiting = group.Count(tag => tag.ArchivedAt == null &&
                (tag.Status == SmartTagStatus.Pending || tag.Status == SmartTagStatus.Preparing || tag.Status == SmartTagStatus.Delivered)),
            Unclaimed = group.Count(tag => tag.ArchivedAt == null && tag.Status == SmartTagStatus.Unclaimed),
            Lost = group.Count(tag => tag.ArchivedAt == null && tag.Status == SmartTagStatus.Lost),
            Disabled = group.Count(tag => tag.ArchivedAt == null && tag.Status == SmartTagStatus.Disabled),
            Replaced = group.Count(tag => tag.ArchivedAt == null && tag.Status == SmartTagStatus.Replaced),
            Archived = group.Count(tag => tag.ArchivedAt != null || tag.Status == SmartTagStatus.Archived)
        }).SingleOrDefaultAsync(cancellationToken);

        return counts is null
            ? new AdminSmartTagStatusCountsResponse(0, 0, 0, 0, 0, 0, 0, 0)
            : new AdminSmartTagStatusCountsResponse(
                counts.All, counts.Active, counts.Awaiting, counts.Unclaimed,
                counts.Lost, counts.Disabled, counts.Replaced, counts.Archived);
    }

    public async Task<AdminSmartTagItemResponse> GetAsync(
        Guid tagId,
        CancellationToken cancellationToken = default)
    {
        var response = await Project(_dbContext.SmartTags.AsNoTracking().Where(tag => tag.Id == tagId && tag.DeletedAt == null))
            .SingleOrDefaultAsync(cancellationToken);
        return response ?? throw NotFound();
    }

    public async Task<IReadOnlyCollection<AdminSmartTagScanResponse>> ListScansAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default)
    {
        await RequireAdminAsync(currentUserId, cancellationToken);
        if (!await _dbContext.SmartTags.AsNoTracking().AnyAsync(
                tag => tag.Id == tagId && tag.DeletedAt == null, cancellationToken))
            throw NotFound();

        return await _dbContext.TagScans.AsNoTracking()
            .Where(scan => scan.SmartTagId == tagId)
            .OrderByDescending(scan => scan.ScanTime)
            .ThenByDescending(scan => scan.Id)
            .Take(50)
            .Select(scan => new AdminSmartTagScanResponse(
                scan.Id, scan.ResolvedState, scan.ScanTime,
                scan.City, scan.Country, scan.DeviceType))
            .ToArrayAsync(cancellationToken);
    }

    public async Task<AdminSmartTagItemResponse> UpdateStatusAsync(
        Guid? currentUserId,
        Guid tagId,
        string action,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var tag = await _dbContext.SmartTags.SingleOrDefaultAsync(
            item => item.Id == tagId && item.DeletedAt == null, cancellationToken)
            ?? throw NotFound();

        ApplyAction(tag, action, reason, admin.Id);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return await GetAsync(tag.Id, cancellationToken);
    }

    public Task<AdminSmartTagItemResponse> ClaimAsync(
        Guid? currentUserId,
        Guid tagId,
        AdminSmartTagClaimRequest request,
        CancellationToken cancellationToken = default)
        => UpdateAssignmentAsync(currentUserId, tagId, "claim", request.OwnerUserId, request.PetId,
            request.ExpectedUpdatedAt, request.Reason, cancellationToken);

    public Task<AdminSmartTagItemResponse> AssignPetAsync(
        Guid? currentUserId,
        Guid tagId,
        AdminSmartTagAssignPetRequest request,
        CancellationToken cancellationToken = default)
        => UpdateAssignmentAsync(currentUserId, tagId, "assign-pet", null, request.PetId,
            request.ExpectedUpdatedAt, request.Reason, cancellationToken);

    public Task<AdminSmartTagItemResponse> UnassignPetAsync(
        Guid? currentUserId,
        Guid tagId,
        AdminSmartTagUnassignPetRequest request,
        CancellationToken cancellationToken = default)
        => UpdateAssignmentAsync(currentUserId, tagId, "unassign-pet", null, null,
            request.ExpectedUpdatedAt, request.Reason, cancellationToken);

    public Task<AdminSmartTagItemResponse> TransferOwnershipAsync(
        Guid? currentUserId,
        Guid tagId,
        AdminSmartTagTransferRequest request,
        CancellationToken cancellationToken = default)
        => UpdateAssignmentAsync(currentUserId, tagId, "transfer", request.NewOwnerUserId, request.NewPetId,
            request.ExpectedUpdatedAt, request.Reason, cancellationToken);

    private async Task<AdminSmartTagItemResponse> UpdateAssignmentAsync(
        Guid? currentUserId,
        Guid tagId,
        string operation,
        Guid? requestedOwnerId,
        Guid? requestedPetId,
        DateTimeOffset expectedUpdatedAt,
        string? reason,
        CancellationToken cancellationToken)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        await using var transaction = _dbContext.Database.IsRelational()
            ? await _dbContext.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            : null;

        var tagQuery = _dbContext.SmartTags.Where(item => item.Id == tagId && item.DeletedAt == null);
        var tag = (_dbContext.Database.IsRelational()
                ? await tagQuery.AsNoTracking().SingleOrDefaultAsync(cancellationToken)
                : await tagQuery.SingleOrDefaultAsync(cancellationToken))
            ?? throw NotFound();

        if (tag.UpdatedAt.ToUniversalTime() != expectedUpdatedAt.ToUniversalTime())
        {
            throw Conflict();
        }

        EnsureAssignmentLifecycle(tag, operation);
        var oldOwnerId = tag.OwnerUserId;
        var oldPetId = tag.PetId;
        var oldStatus = tag.Status;
        var normalizedReason = NormalizeOptional(reason);
        if (normalizedReason is { Length: > 600 })
            throw ValidationFailed("reason", "Keep the reason to 600 characters or fewer.");

        Guid newOwnerId;
        Guid? newPetId;
        string auditAction;

        switch (operation)
        {
            case "claim":
                if (!requestedOwnerId.HasValue || requestedOwnerId == Guid.Empty || !requestedPetId.HasValue || requestedPetId == Guid.Empty)
                    throw ValidationFailed("assignment", "Choose an owner and one of that owner's pets.");
                if (tag.OwnerUserId.HasValue || tag.PetId.HasValue || tag.Status != SmartTagStatus.Unclaimed)
                    throw InvalidState("Only an unclaimed tag without an owner or pet can be claimed on behalf of an owner.");
                newOwnerId = requestedOwnerId!.Value;
                newPetId = requestedPetId!.Value;
                auditAction = "smart-tags.owner-and-pet-assigned";
                tag.Status = SmartTagStatus.Pending;
                break;
            case "assign-pet":
                if (!requestedPetId.HasValue || requestedPetId == Guid.Empty)
                    throw ValidationFailed("petId", "Choose a pet.");
                if (!tag.OwnerUserId.HasValue)
                    throw InvalidState("Assign an owner and pet before using the normal pet assignment action.");
                newOwnerId = tag.OwnerUserId.Value;
                newPetId = requestedPetId!.Value;
                if (newPetId == tag.PetId)
                    throw ValidationFailed("petId", "Choose a different pet.");
                auditAction = tag.PetId.HasValue ? "smart-tags.pet-reassigned" : "smart-tags.pet-assigned";
                break;
            case "unassign-pet":
                if (!tag.OwnerUserId.HasValue || !tag.PetId.HasValue)
                    throw InvalidState("This tag does not currently have a pet to unassign.");
                if (tag.Status == SmartTagStatus.Active && normalizedReason is null)
                    throw ValidationFailed("reason", "Add a reason before unassigning an active tag.");
                newOwnerId = tag.OwnerUserId.Value;
                newPetId = null;
                auditAction = "smart-tags.pet-unassigned";
                break;
            case "transfer":
                if (!requestedOwnerId.HasValue || requestedOwnerId == Guid.Empty || !requestedPetId.HasValue || requestedPetId == Guid.Empty)
                    throw ValidationFailed("assignment", "Choose a new owner and one of that owner's pets.");
                if (!tag.OwnerUserId.HasValue)
                    throw InvalidState("An unclaimed tag must use Assign owner and pet, not ownership transfer.");
                if (normalizedReason is null)
                    throw ValidationFailed("reason", "Add a reason for the ownership transfer.");
                newOwnerId = requestedOwnerId!.Value;
                newPetId = requestedPetId!.Value;
                if (newOwnerId == tag.OwnerUserId)
                    throw ValidationFailed("newOwnerUserId", "Choose a different owner. Use Change assigned pet for the current owner.");
                auditAction = "smart-tags.ownership-transferred";
                // A transferred tag must be activated by its new owner. An
                // Admin transfer never silently grants an active finder page.
                tag.Status = SmartTagStatus.Pending;
                tag.ActivatedAt = null;
                break;
            default:
                throw ValidationFailed("operation", "This assignment operation is not supported.");
        }

        var owner = await _dbContext.Users.AsNoTracking().SingleOrDefaultAsync(
            user => user.Id == newOwnerId && user.DeletedAt == null && user.Status == UserStatus.Active,
            cancellationToken);
        if (owner is null)
            throw ValidationFailed(operation == "transfer" ? "newOwnerUserId" : "ownerUserId", "Choose an active owner account.");

        if (newPetId.HasValue)
        {
            var pet = await _dbContext.Pets.AsNoTracking().SingleOrDefaultAsync(
                item => item.Id == newPetId && item.DeletedAt == null, cancellationToken);
            if (pet is null || pet.LifecycleStatus == PetLifecycleStatus.Archived)
                throw ValidationFailed("petId", "Choose an active or memorial pet profile.");
            if (pet.OwnerUserId != newOwnerId)
                throw ValidationFailed("petId", "The selected pet must belong to the selected owner.");
        }

        tag.OwnerUserId = newOwnerId;
        tag.PetId = newPetId;
        tag.UpdatedAt = DateTimeOffset.UtcNow;

        if (_dbContext.Database.IsRelational())
        {
            // The timestamp predicate is an optimistic concurrency guard. It
            // makes the relationship update atomic without adding a schema
            // column or allowing a stale Admin dialog to overwrite newer work.
            var affected = await _dbContext.SmartTags
                .Where(item => item.Id == tag.Id && item.DeletedAt == null && item.UpdatedAt == expectedUpdatedAt)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(item => item.OwnerUserId, tag.OwnerUserId)
                    .SetProperty(item => item.PetId, tag.PetId)
                    .SetProperty(item => item.Status, tag.Status)
                    .SetProperty(item => item.ActivatedAt, tag.ActivatedAt)
                    .SetProperty(item => item.UpdatedAt, tag.UpdatedAt), cancellationToken);
            if (affected != 1) throw Conflict();
        }
        _auditLogService.Append(admin.Id, ActorType.Admin, auditAction, "SmartTag", tag.Id,
            new { ownerUserId = oldOwnerId, petId = oldPetId, status = oldStatus.ToString() },
            new { ownerUserId = tag.OwnerUserId, petId = tag.PetId, status = tag.Status.ToString(), reason = normalizedReason });
        await _dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return await GetAsync(tag.Id, cancellationToken);
    }

    public async Task<AdminSmartTagBulkActionResponse> BulkUpdateAsync(
        Guid? currentUserId,
        AdminSmartTagBulkActionRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var action = Normalize(request.Action).ToLowerInvariant();
        if (action is not ("disable" or "archive"))
        {
            throw ValidationFailed("action", "Choose Disable selected or Archive selected.");
        }

        var requestedIds = request.TagIds.Distinct().ToArray();
        var rows = await _dbContext.SmartTags
            .Where(tag => tag.DeletedAt == null && requestedIds.Contains(tag.Id))
            .ToDictionaryAsync(tag => tag.Id, cancellationToken);
        var failures = new List<AdminSmartTagBulkFailure>();
        var updated = 0;

        foreach (var id in requestedIds)
        {
            if (!rows.TryGetValue(id, out var tag))
            {
                failures.Add(new AdminSmartTagBulkFailure(id, "", "This tag could not be found."));
                continue;
            }

            try
            {
                ApplyAction(tag, action, request.Reason, admin.Id);
                updated++;
            }
            catch (ApiException exception)
            {
                _dbContext.Entry(tag).State = EntityState.Unchanged;
                failures.Add(new AdminSmartTagBulkFailure(id, tag.TagCode, exception.Message));
            }
        }

        if (updated > 0)
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return new AdminSmartTagBulkActionResponse(action, requestedIds.Length, updated, failures);
    }

    public async Task<AdminTagInventoryExport> ExportAsync(
        Guid? currentUserId,
        AdminSmartTagQuery query,
        string? format,
        IReadOnlyCollection<Guid>? tagIds,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var normalizedFormat = NormalizeOptional(format)?.ToLowerInvariant() ?? "csv";
        if (normalizedFormat is not ("csv" or "xlsx"))
        {
            throw ValidationFailed("format", "Choose CSV or Excel for the export.");
        }

        var filtered = BuildFilteredQuery(query, includeStatus: true);
        if (tagIds is { Count: > 0 })
        {
            filtered = filtered.Where(tag => tagIds.Contains(tag.Id));
        }

        var count = await filtered.CountAsync(cancellationToken);
        if (count > MaxExportRows)
        {
            throw ValidationFailed("filters", $"Narrow the filters to {MaxExportRows} rows or fewer before exporting.");
        }

        var rows = await Project(ApplySort(filtered, query.SortBy, query.SortDir)).ToListAsync(cancellationToken);
        _auditLogService.Append(admin.Id, ActorType.Admin, "smart-tags.export", "SmartTag", null, null,
            new { format = normalizedFormat, rowCount = rows.Count, selectedRowsOnly = tagIds is { Count: > 0 } });
        await _dbContext.SaveChangesAsync(cancellationToken);

        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmm");
        return normalizedFormat == "xlsx"
            ? new AdminTagInventoryExport($"mypetlink-smart-tags-{stamp}.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", BuildXlsx(rows))
            : new AdminTagInventoryExport($"mypetlink-smart-tags-{stamp}.csv", "text/csv",
                Encoding.UTF8.GetBytes(BuildCsv(rows)));
    }

    private IQueryable<SmartTag> BuildFilteredQuery(AdminSmartTagQuery query, bool includeStatus)
    {
        var tags = _dbContext.SmartTags.AsNoTracking().Where(tag => tag.DeletedAt == null);
        var search = NormalizeOptional(query.Search);
        if (search is not null)
        {
            tags = tags.Where(tag => tag.TagCode.Contains(search)
                || (tag.Pet != null && tag.Pet.Name.Contains(search))
                || (tag.OwnerUser != null && (tag.OwnerUser.DisplayName.Contains(search) || tag.OwnerUser.Email.Contains(search)))
                || (tag.Order != null && tag.Order.OrderNumber.Contains(search))
                || (tag.Batch != null && tag.Batch.BatchNo.Contains(search)));
        }

        if (includeStatus && NormalizeOptional(query.Status) is { } status)
        {
            if (status.Equals("awaiting-activation", StringComparison.OrdinalIgnoreCase))
            {
                tags = tags.Where(tag => tag.ArchivedAt == null &&
                    (tag.Status == SmartTagStatus.Pending || tag.Status == SmartTagStatus.Preparing || tag.Status == SmartTagStatus.Delivered));
            }
            else if (status.Equals("archived", StringComparison.OrdinalIgnoreCase))
            {
                tags = tags.Where(tag => tag.ArchivedAt != null || tag.Status == SmartTagStatus.Archived);
            }
            else
            {
                var parsed = ParseEnum<SmartTagStatus>(status, "status", "Tag lifecycle status is not supported.");
                tags = tags.Where(tag => tag.ArchivedAt == null && tag.Status == parsed);
            }
        }

        if (NormalizeOptional(query.TagType) is { } type)
        {
            var hasNfc = type.Trim().Replace("_", "").Replace("-", "").ToUpperInvariant() switch
            {
                "QR" => false,
                "QRNFC" or "NFC" => true,
                _ => throw ValidationFailed("tagType", "Tag type is not supported.")
            };
            tags = tags.Where(tag => tag.HasNfc == hasNfc);
        }

        if (NormalizeOptional(query.Variant) is { } variant)
        {
            if (!variant.Equals(TagVariants.Lightweight, StringComparison.OrdinalIgnoreCase)
                && !variant.Equals(TagVariants.Standard, StringComparison.OrdinalIgnoreCase))
            {
                throw ValidationFailed("variant", "Tag variant is not supported.");
            }
            var normalized = TagVariants.Normalize(variant);
            tags = tags.Where(tag => tag.Variant == normalized);
        }

        if (query.Claimed.HasValue)
            tags = query.Claimed.Value ? tags.Where(tag => tag.OwnerUserId != null) : tags.Where(tag => tag.OwnerUserId == null);
        if (query.PetId.HasValue) tags = tags.Where(tag => tag.PetId == query.PetId.Value);
        if (query.OwnerId.HasValue) tags = tags.Where(tag => tag.OwnerUserId == query.OwnerId.Value);
        if (NormalizeOptional(query.Pet) is { } pet)
            tags = tags.Where(tag => tag.Pet != null && tag.Pet.Name.Contains(pet));
        if (NormalizeOptional(query.Owner) is { } owner)
            tags = tags.Where(tag => tag.OwnerUser != null &&
                (tag.OwnerUser.DisplayName.Contains(owner) || tag.OwnerUser.Email.Contains(owner)));
        if (query.HasOrder.HasValue)
            tags = query.HasOrder.Value ? tags.Where(tag => tag.OrderId != null) : tags.Where(tag => tag.OrderId == null);
        if (query.HasScans.HasValue)
            tags = query.HasScans.Value
                ? tags.Where(tag => _dbContext.TagScans.Any(scan => scan.SmartTagId == tag.Id))
                : tags.Where(tag => !_dbContext.TagScans.Any(scan => scan.SmartTagId == tag.Id));

        ValidateRange(query.ActivatedFrom, query.ActivatedTo, "activatedFrom");
        ValidateRange(query.CreatedFrom, query.CreatedTo, "createdFrom");
        ValidateRange(query.LastScannedFrom, query.LastScannedTo, "lastScannedFrom");
        if (query.ActivatedFrom.HasValue) tags = tags.Where(tag => tag.ActivatedAt >= query.ActivatedFrom);
        if (query.ActivatedTo.HasValue) tags = tags.Where(tag => tag.ActivatedAt <= query.ActivatedTo);
        if (query.CreatedFrom.HasValue) tags = tags.Where(tag => tag.CreatedAt >= query.CreatedFrom);
        if (query.CreatedTo.HasValue) tags = tags.Where(tag => tag.CreatedAt <= query.CreatedTo);
        if (query.LastScannedFrom.HasValue) tags = tags.Where(tag => tag.LastScannedAt >= query.LastScannedFrom);
        if (query.LastScannedTo.HasValue) tags = tags.Where(tag => tag.LastScannedAt <= query.LastScannedTo);
        return tags;
    }

    private static IQueryable<SmartTag> ApplySort(IQueryable<SmartTag> tags, string? sortBy, string? sortDir)
    {
        var direction = NormalizeOptional(sortDir)?.ToLowerInvariant() ?? "desc";
        if (direction is not ("asc" or "desc")) throw ValidationFailed("sortDir", "Sort direction must be ascending or descending.");
        var desc = direction == "desc";
        var field = NormalizeOptional(sortBy)?.ToLowerInvariant() ?? "updatedat";
        IOrderedQueryable<SmartTag> ordered = field switch
        {
            "tagcode" => Order(tags, tag => tag.TagCode, desc),
            "status" => Order(tags, tag => tag.Status, desc),
            "pet" => Order(tags, tag => tag.Pet == null ? "" : tag.Pet.Name, desc),
            "owner" => Order(tags, tag => tag.OwnerUser == null ? "" : tag.OwnerUser.DisplayName, desc),
            "activatedat" => Order(tags, tag => tag.ActivatedAt, desc),
            "lastscannedat" => Order(tags, tag => tag.LastScannedAt, desc),
            "createdat" => Order(tags, tag => tag.CreatedAt, desc),
            "updatedat" => Order(tags, tag => tag.UpdatedAt, desc),
            _ => throw ValidationFailed("sortBy", "Sorting by this field is not supported.")
        };
        return ordered.ThenBy(tag => tag.Id);
    }

    private static IOrderedQueryable<SmartTag> Order<TKey>(IQueryable<SmartTag> tags, Expression<Func<SmartTag, TKey>> key, bool desc)
        => desc ? tags.OrderByDescending(key) : tags.OrderBy(key);

    private IQueryable<AdminSmartTagItemResponse> Project(IQueryable<SmartTag> tags)
        => tags.Select(tag => new AdminSmartTagItemResponse(
            tag.Id, tag.TagCode, tag.HasNfc, tag.Variant, tag.Status,
            tag.ArchivedAt != null || tag.Status == SmartTagStatus.Archived,
            tag.PetId, tag.Pet == null ? null : tag.Pet.Name,
            tag.Pet == null || tag.Pet.SafetySetting == null ? null : tag.Pet.SafetySetting.SafetyCode,
            tag.Pet != null && tag.Pet.SafetySetting != null && tag.Pet.SafetySetting.QrSafetyEnabled,
            tag.OwnerUserId, tag.OwnerUser == null ? null : tag.OwnerUser.DisplayName,
            tag.OwnerUser == null ? null : tag.OwnerUser.Email,
            tag.OrderId, tag.Order == null ? null : tag.Order.OrderNumber,
            tag.Batch == null ? null : tag.Batch.BatchNo,
            tag.ActivatedAt, tag.LastScannedAt,
            _dbContext.TagScans.Count(scan => scan.SmartTagId == tag.Id),
            tag.CreatedAt, tag.UpdatedAt, tag.ReplacementForTagId,
            tag.ReplacementForTag == null ? null : tag.ReplacementForTag.TagCode,
            _dbContext.SmartTags.Where(candidate => candidate.ReplacementForTagId == tag.Id && candidate.DeletedAt == null)
                .Select(candidate => candidate.TagCode).FirstOrDefault()));

    private void ApplyAction(SmartTag tag, string actionValue, string? reason, Guid actorId)
    {
        var action = Normalize(actionValue).ToLowerInvariant();
        var oldStatus = tag.Status;
        var oldArchivedAt = tag.ArchivedAt;
        var now = DateTimeOffset.UtcNow;

        switch (action)
        {
            case "disable" when tag.ArchivedAt == null && tag.Status is SmartTagStatus.Active or SmartTagStatus.Delivered or SmartTagStatus.Unclaimed:
                tag.Status = SmartTagStatus.Disabled;
                break;
            case "mark-lost" when tag.ArchivedAt == null && tag.Status is SmartTagStatus.Active or SmartTagStatus.Delivered:
                tag.Status = SmartTagStatus.Lost;
                break;
            case "archive" when tag.ArchivedAt == null && tag.Status is not (SmartTagStatus.Archived or SmartTagStatus.Replaced):
                tag.Status = SmartTagStatus.Archived;
                tag.ArchivedAt = now;
                break;
            case "restore" when tag.ArchivedAt != null || tag.Status == SmartTagStatus.Archived:
                tag.Status = SmartTagStatus.Disabled;
                tag.ArchivedAt = null;
                break;
            case "reactivate" when tag.ArchivedAt == null
                && tag.Status is SmartTagStatus.Disabled or SmartTagStatus.Lost
                && tag.OwnerUserId.HasValue && tag.PetId.HasValue:
                tag.Status = tag.ActivatedAt.HasValue ? SmartTagStatus.Active : SmartTagStatus.Delivered;
                break;
            default:
                throw ValidationFailed("action", $"{ActionLabel(action)} is not available for a {LifecycleLabel(tag)} tag.");
        }

        tag.UpdatedAt = now;
        _auditLogService.Append(actorId, ActorType.Admin, $"smart-tags.{action}", "SmartTag", tag.Id,
            new { status = oldStatus.ToString(), archivedAt = oldArchivedAt },
            new { status = tag.Status.ToString(), archivedAt = tag.ArchivedAt, reason = NormalizeOptional(reason) });
    }

    private static string ActionLabel(string action) => action switch
    {
        "disable" => "Disable",
        "mark-lost" => "Mark lost",
        "archive" => "Archive",
        "restore" => "Restore",
        "reactivate" => "Reactivate",
        _ => "This action"
    };

    private static string LifecycleLabel(AdminSmartTagItemResponse row) => row.IsArchived ? "Archived" : LifecycleLabel(row.Status);
    private static string LifecycleLabel(SmartTag tag) => tag.ArchivedAt != null ? "Archived" : LifecycleLabel(tag.Status);
    private static string LifecycleLabel(SmartTagStatus status) => status switch
    {
        SmartTagStatus.Pending => "Pending activation",
        SmartTagStatus.Preparing => "Preparing for owner",
        SmartTagStatus.Delivered => "Delivered / awaiting activation",
        _ => status.ToString()
    };

    private static string BuildCsv(IReadOnlyList<AdminSmartTagItemResponse> rows)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', ExportHeaders.Select(Csv)));
        foreach (var row in rows) builder.AppendLine(string.Join(',', ExportRow(row).Select(Csv)));
        return builder.ToString();
    }

    private static byte[] BuildXlsx(IReadOnlyList<AdminSmartTagItemResponse> rows)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Smart Tags");
        for (var column = 0; column < ExportHeaders.Length; column++)
        {
            sheet.Cell(1, column + 1).Value = ExportHeaders[column];
            sheet.Cell(1, column + 1).Style.Font.Bold = true;
        }
        for (var index = 0; index < rows.Count; index++)
        {
            var values = ExportRow(rows[index]);
            for (var column = 0; column < values.Length; column++) sheet.Cell(index + 2, column + 1).SetValue(AdminExportSanitizer.SpreadsheetSafe(values[column]));
        }
        sheet.SheetView.FreezeRows(1);
        sheet.Columns().AdjustToContents(1, Math.Min(rows.Count + 1, 200));
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static string[] ExportRow(AdminSmartTagItemResponse row) =>
    [
        row.TagCode, row.HasNfc ? "QR + NFC Smart Tag" : "QR Pet Tag", row.Variant,
        LifecycleLabel(row), row.PetName ?? "", row.OwnerName ?? "", row.OwnerEmail ?? "",
        row.OrderNumber ?? "", ExportDate(row.ActivatedAt), ExportDate(row.LastScannedAt),
        row.ScanCount.ToString(), ExportDate(row.CreatedAt), ExportDate(row.UpdatedAt)
    ];

    private static string ExportDate(DateTimeOffset? value) => value?.UtcDateTime.ToString("yyyy-MM-dd HH:mm") ?? "";
    private static string Csv(string value) => AdminExportSanitizer.Csv(value);

    private async Task<AdminUser> RequireAdminAsync(Guid? userId, CancellationToken cancellationToken)
    {
        if (!userId.HasValue) throw new ApiException(StatusCodes.Status401Unauthorized, "unauthorized", "Authentication is required.");
        var admin = await _dbContext.AdminUsers.SingleOrDefaultAsync(
            item => item.UserId == userId && item.IsActive && item.DisabledAt == null, cancellationToken);
        return admin ?? throw new ApiException(StatusCodes.Status403Forbidden, "forbidden", "Admin access is required.");
    }

    private static void ValidateRange(DateTimeOffset? from, DateTimeOffset? to, string field)
    {
        if (from.HasValue && to.HasValue && from > to) throw ValidationFailed(field, "The start of this date range must be before the end.");
    }

    private static T ParseEnum<T>(string value, string field, string message) where T : struct, Enum
        => Enum.TryParse<T>(value, true, out var parsed) ? parsed : throw ValidationFailed(field, message);
    private static string Normalize(string? value) => NormalizeOptional(value) ?? throw ValidationFailed("action", "Choose an action.");
    private static string? NormalizeOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static ApiException NotFound() => new(StatusCodes.Status404NotFound, "tag_not_found", "This tag could not be found.");
    private static ApiException Conflict() => new(StatusCodes.Status409Conflict, "tag_changed",
        "This tag changed after the details were opened. Refresh it and review the latest assignment before trying again.");
    private static ApiException InvalidState(string message) => new(
        StatusCodes.Status422UnprocessableEntity, "invalid_tag_state", message);
    private static void EnsureAssignmentLifecycle(SmartTag tag, string operation)
    {
        if (tag.ArchivedAt.HasValue || tag.Status is SmartTagStatus.Archived or SmartTagStatus.Replaced)
            throw InvalidState("Archived and replaced tags are read-only.");
        if (operation != "claim" && tag.Status is SmartTagStatus.Lost or SmartTagStatus.Disabled)
            throw InvalidState("Resolve the Lost or Disabled lifecycle state before changing this tag's assignment.");
        if (operation == "claim" && tag.Status != SmartTagStatus.Unclaimed)
            throw InvalidState("Only an unclaimed tag can be claimed on behalf of an owner.");
    }
    private static ApiException ValidationFailed(string field, string message) => new(
        StatusCodes.Status400BadRequest, "validation_failed", "Please check the submitted fields.",
        new Dictionary<string, string[]> { [field] = [message] });
}
