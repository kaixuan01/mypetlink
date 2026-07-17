using System.Security.Cryptography;
using System.Text;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// Tag Inventory operations for the Admin Portal: generating retail stock,
// server-side listing/filtering/sorting, bulk fulfilment updates, and filtered
// exports. Fulfilment (Generated -> Printed -> SentToReseller -> Received /
// SentToOwner) is tracked separately from the lifecycle SmartTagStatus and is
// never allowed to change it. Every mutation appends an audit row saved in the
// same SaveChanges as the mutation itself.
public sealed class AdminTagInventoryService : SkeletonService, IAdminTagInventoryService
{
    // Hard ceiling for a single export so one request cannot stream the whole
    // table once inventory grows large. Filters narrow the set below this.
    private const int MaxExportRows = 10_000;

    private static readonly string[] ExportHeaders =
    [
        "Tag Code",
        "Tag Type",
        "Variant",
        "Batch",
        "Reseller",
        "Lifecycle Status",
        "Fulfilment Status",
        "Linked Pet",
        "Linked Owner",
        "Owner Email",
        "Order Number",
        "Generated (UTC)",
        "Last Updated (UTC)",
        "Printed (UTC)",
        "Sent to Reseller (UTC)",
        "Received (UTC)",
        "Sent to Owner (UTC)",
        "Activated (UTC)"
    ];

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;

    public AdminTagInventoryService(MyPetLinkDbContext dbContext, IAuditLogService auditLogService)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
    }

    // --- Listing -----------------------------------------------------------------

    public async Task<(IReadOnlyCollection<AdminTagInventoryItemResponse> Items, int Total)> ListAsync(
        AdminTagInventoryQuery query,
        CancellationToken cancellationToken = default)
    {
        var tags = ApplySort(BuildFilteredQuery(query), query.SortBy, query.SortDir);

        var total = await tags.CountAsync(cancellationToken);
        var items = await ProjectToItems(tags)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return (items, total);
    }

    // --- Generation ----------------------------------------------------------------

    public async Task<AdminGenerateTagsResponse> GenerateAsync(
        Guid? currentUserId,
        AdminGenerateTagsRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var hasNfc = ParseTagType(request.TagType);
        var variant = TagVariants.Normalize(request.Variant);
        var now = DateTimeOffset.UtcNow;
        var batchNo = NormalizeOptional(request.BatchNumber)
            ?? await GenerateBatchNumberAsync(now, cancellationToken);

        var batchNoInUse = await _dbContext.SmartTagBatches
            .AnyAsync(batch => batch.BatchNo == batchNo, cancellationToken);

        if (batchNoInUse)
        {
            throw ValidationFailed("batchNumber", "This batch number is already in use.");
        }

        var batch = new SmartTagBatch
        {
            BatchNo = batchNo,
            Quantity = request.Quantity,
            HasNfc = hasNfc,
            Variant = variant,
            GeneratedByAdminUserId = admin.Id,
            GeneratedAt = now
        };

        _dbContext.SmartTagBatches.Add(batch);

        var tags = new List<SmartTag>(request.Quantity);

        for (var index = 0; index < request.Quantity; index++)
        {
            tags.Add(new SmartTag
            {
                TagCode = await GenerateUniqueTagCodeAsync(tags, cancellationToken),
                Batch = batch,
                HasNfc = hasNfc,
                Variant = variant,
                Status = SmartTagStatus.Unclaimed,
                FulfilmentStatus = TagFulfilmentStatus.Generated
            });
        }

        _dbContext.SmartTags.AddRange(tags);

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "tag-inventory.generate", "SmartTagBatch", batch.Id,
            null, new { batchNo, request.Quantity, tagType = hasNfc ? "QR_NFC" : "QR", variant });

        await _dbContext.SaveChangesAsync(cancellationToken);

        return new AdminGenerateTagsResponse(
            batchNo,
            tags.Count,
            tags.Select(TagDtoMapper.ToSmartTagResponse).ToArray());
    }

    // --- Bulk fulfilment updates ------------------------------------------------------

    // Allowed transitions per bulk action. Fulfilment actions only ever move
    // the fulfilment status forward and never touch the lifecycle status, so
    // Active/Archived tags cannot be changed by accident.
    private static readonly IReadOnlyDictionary<string, (TagFulfilmentStatus From, TagFulfilmentStatus To)> BulkTransitions =
        new Dictionary<string, (TagFulfilmentStatus, TagFulfilmentStatus)>(StringComparer.OrdinalIgnoreCase)
        {
            ["mark-printed"] = (TagFulfilmentStatus.Generated, TagFulfilmentStatus.Printed),
            ["send-to-reseller"] = (TagFulfilmentStatus.Printed, TagFulfilmentStatus.SentToReseller),
            ["mark-received"] = (TagFulfilmentStatus.SentToReseller, TagFulfilmentStatus.Received),
            ["send-to-owner"] = (TagFulfilmentStatus.Printed, TagFulfilmentStatus.SentToOwner)
        };

    public async Task<AdminTagInventoryBulkActionResponse> BulkUpdateFulfilmentAsync(
        Guid? currentUserId,
        AdminTagInventoryBulkActionRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);

        if (!BulkTransitions.TryGetValue(request.Action.Trim(), out var transition))
        {
            throw ValidationFailed("action", "This inventory action is not supported.");
        }

        var requestedIds = request.TagIds.Distinct().ToArray();
        var tags = await _dbContext.SmartTags
            .Where(tag => tag.DeletedAt == null && requestedIds.Contains(tag.Id))
            .ToListAsync(cancellationToken);
        var tagsById = tags.ToDictionary(tag => tag.Id);

        var now = DateTimeOffset.UtcNow;
        var failures = new List<AdminTagInventoryBulkFailure>();
        var updatedIds = new List<Guid>();

        foreach (var tagId in requestedIds)
        {
            if (!tagsById.TryGetValue(tagId, out var tag))
            {
                failures.Add(new AdminTagInventoryBulkFailure(tagId, "", "This tag could not be found."));
                continue;
            }

            if (tag.ArchivedAt.HasValue || tag.Status == SmartTagStatus.Archived)
            {
                failures.Add(new AdminTagInventoryBulkFailure(tagId, tag.TagCode, "Archived tags cannot be updated."));
                continue;
            }

            if (tag.Status != SmartTagStatus.Unclaimed)
            {
                failures.Add(new AdminTagInventoryBulkFailure(
                    tagId, tag.TagCode,
                    $"Only unclaimed stock can be updated. This tag is {LifecycleLabel(tag.Status, archived: false)}."));
                continue;
            }

            if (tag.FulfilmentStatus != transition.From)
            {
                failures.Add(new AdminTagInventoryBulkFailure(
                    tagId, tag.TagCode,
                    $"This tag is {FulfilmentLabel(tag.FulfilmentStatus)} and must be {FulfilmentLabel(transition.From)} for this step."));
                continue;
            }

            ApplyFulfilment(tag, transition.To, now);
            updatedIds.Add(tagId);

            // One audit row per tag keeps each tag's history complete and
            // queryable from its detail view.
            _auditLogService.Append(
                admin.Id, ActorType.Admin, $"tag-inventory.{request.Action.Trim().ToLowerInvariant()}", "SmartTag", tag.Id,
                new { fulfilmentStatus = transition.From.ToString() },
                new { fulfilmentStatus = transition.To.ToString(), tagCode = tag.TagCode });
        }

        if (updatedIds.Count > 0)
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return new AdminTagInventoryBulkActionResponse(
            request.Action.Trim().ToLowerInvariant(),
            requestedIds.Length,
            updatedIds.Count,
            failures);
    }

    // Called by the order flow when a portal order ships: the physical tag has
    // left our hands for the owner. Lifecycle is managed by the order flow.
    public static void MarkSentToOwner(SmartTag tag, DateTimeOffset now)
    {
        ApplyFulfilment(tag, TagFulfilmentStatus.SentToOwner, now);
    }

    private static void ApplyFulfilment(SmartTag tag, TagFulfilmentStatus next, DateTimeOffset now)
    {
        tag.FulfilmentStatus = next;
        tag.UpdatedAt = now;

        switch (next)
        {
            case TagFulfilmentStatus.Printed:
                tag.PrintedAt ??= now;
                break;
            case TagFulfilmentStatus.SentToReseller:
                tag.SentToResellerAt ??= now;
                break;
            case TagFulfilmentStatus.Received:
                tag.ReceivedAt ??= now;
                break;
            case TagFulfilmentStatus.SentToOwner:
                tag.SentToOwnerAt ??= now;
                break;
        }
    }

    // --- Export ---------------------------------------------------------------------

    public async Task<AdminTagInventoryExport> ExportAsync(
        Guid? currentUserId,
        AdminTagInventoryQuery query,
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

        var tags = BuildFilteredQuery(query);

        if (tagIds is { Count: > 0 })
        {
            tags = tags.Where(tag => tagIds.Contains(tag.Id));
        }

        var total = await tags.CountAsync(cancellationToken);

        if (total > MaxExportRows)
        {
            throw ValidationFailed(
                "filters",
                $"This export would contain {total} rows. Narrow the filters to {MaxExportRows} rows or fewer.");
        }

        var rows = await ProjectToItems(ApplySort(tags, query.SortBy, query.SortDir))
            .ToListAsync(cancellationToken);

        // Manufacturer-workflow convenience: remember when each batch was last
        // included in an export.
        var exportedBatchNos = rows
            .Where(row => !string.IsNullOrEmpty(row.BatchNo))
            .Select(row => row.BatchNo!)
            .Distinct()
            .ToArray();

        if (exportedBatchNos.Length > 0)
        {
            var exportedAt = DateTimeOffset.UtcNow;
            var batches = await _dbContext.SmartTagBatches
                .Where(batch => exportedBatchNos.Contains(batch.BatchNo))
                .ToListAsync(cancellationToken);

            foreach (var batch in batches)
            {
                batch.ExportedAt = exportedAt;
            }
        }

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "tag-inventory.export", "SmartTag", null,
            null,
            new
            {
                format = normalizedFormat,
                rowCount = rows.Count,
                selectedRowsOnly = tagIds is { Count: > 0 },
                filters = FilterSnapshot(query)
            });

        await _dbContext.SaveChangesAsync(cancellationToken);

        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmm");
        var baseName = NormalizeOptional(query.Batch) is { } batchName
            ? $"mypetlink-tag-inventory-{batchName}-{stamp}"
            : $"mypetlink-tag-inventory-{stamp}";

        return normalizedFormat == "xlsx"
            ? new AdminTagInventoryExport(
                $"{baseName}.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                BuildXlsx(rows))
            : new AdminTagInventoryExport(
                $"{baseName}.csv",
                "text/csv",
                Encoding.UTF8.GetBytes(BuildCsv(rows)));
    }

    private static string[] ExportRow(AdminTagInventoryItemResponse row)
    {
        return
        [
            row.TagCode,
            row.HasNfc ? "QR + NFC Smart Tag" : "QR Pet Tag",
            row.Variant,
            row.BatchNo ?? "",
            row.ResellerName ?? "",
            LifecycleLabel(row.Status, row.IsArchived),
            FulfilmentLabel(row.FulfilmentStatus),
            row.PetName ?? "",
            row.OwnerName ?? "",
            row.OwnerEmail ?? "",
            row.OrderNumber ?? "",
            ExportDate(row.CreatedAt),
            ExportDate(row.UpdatedAt),
            ExportDate(row.PrintedAt),
            ExportDate(row.SentToResellerAt),
            ExportDate(row.ReceivedAt),
            ExportDate(row.SentToOwnerAt),
            ExportDate(row.ActivatedAt)
        ];
    }

    private static string BuildCsv(IReadOnlyList<AdminTagInventoryItemResponse> rows)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', ExportHeaders.Select(CsvField)));

        foreach (var row in rows)
        {
            builder.AppendLine(string.Join(',', ExportRow(row).Select(CsvField)));
        }

        return builder.ToString();
    }

    private static byte[] BuildXlsx(IReadOnlyList<AdminTagInventoryItemResponse> rows)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Tag Inventory");

        for (var column = 0; column < ExportHeaders.Length; column++)
        {
            var cell = sheet.Cell(1, column + 1);
            cell.Value = ExportHeaders[column];
            cell.Style.Font.Bold = true;
        }

        for (var index = 0; index < rows.Count; index++)
        {
            var values = ExportRow(rows[index]);

            for (var column = 0; column < values.Length; column++)
            {
                sheet.Cell(index + 2, column + 1).SetValue(values[column]);
            }
        }

        sheet.SheetView.FreezeRows(1);
        sheet.Columns().AdjustToContents(1, Math.Min(rows.Count + 1, 200));

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static string ExportDate(DateTimeOffset? value)
    {
        return value?.UtcDateTime.ToString("yyyy-MM-dd HH:mm") ?? "";
    }

    private static object FilterSnapshot(AdminTagInventoryQuery query)
    {
        return new
        {
            query.Search,
            query.TagCode,
            query.Batch,
            query.Status,
            query.Fulfilment,
            query.TagType,
            query.Variant,
            query.PetId,
            query.OwnerId,
            query.Claimed,
            query.Reseller,
            query.GeneratedFrom,
            query.GeneratedTo,
            query.UpdatedFrom,
            query.UpdatedTo,
            query.SortBy,
            query.SortDir
        };
    }

    // --- Query building ----------------------------------------------------------------

    private IQueryable<SmartTag> BuildFilteredQuery(AdminTagInventoryQuery query)
    {
        // Inventory scope: everything generated as stock (has a batch) plus any
        // legacy unclaimed tags without a batch.
        var tags = _dbContext.SmartTags
            .AsNoTracking()
            .Where(tag => tag.DeletedAt == null)
            .Where(tag => tag.BatchId != null || tag.Status == SmartTagStatus.Unclaimed);

        var search = NormalizeOptional(query.Search);
        if (search is not null)
        {
            tags = tags.Where(tag =>
                tag.TagCode.Contains(search)
                || (tag.Batch != null && tag.Batch.BatchNo.Contains(search))
                || (tag.Batch != null && tag.Batch.ResellerName != null && tag.Batch.ResellerName.Contains(search))
                || (tag.Pet != null && tag.Pet.Name.Contains(search))
                || (tag.OwnerUser != null && tag.OwnerUser.Email.Contains(search))
                || (tag.OwnerUser != null && tag.OwnerUser.DisplayName.Contains(search))
                || (tag.Order != null && tag.Order.OrderNumber.Contains(search)));
        }

        var tagCode = NormalizeOptional(query.TagCode);
        if (tagCode is not null)
        {
            tags = tags.Where(tag => tag.TagCode.Contains(tagCode));
        }

        var batch = NormalizeOptional(query.Batch);
        if (batch is not null)
        {
            tags = tags.Where(tag => tag.Batch != null && tag.Batch.BatchNo == batch);
        }

        var status = NormalizeOptional(query.Status);
        if (status is not null)
        {
            if (status.Equals("archived", StringComparison.OrdinalIgnoreCase))
            {
                tags = tags.Where(tag => tag.Status == SmartTagStatus.Archived || tag.ArchivedAt != null);
            }
            else
            {
                var parsed = ParseEnum<SmartTagStatus>(status, "status", "Tag status is not supported.");
                tags = tags.Where(tag => tag.Status == parsed && tag.ArchivedAt == null);
            }
        }

        var fulfilment = NormalizeOptional(query.Fulfilment);
        if (fulfilment is not null)
        {
            var parsed = ParseEnum<TagFulfilmentStatus>(fulfilment, "fulfilment", "Fulfilment status is not supported.");
            tags = tags.Where(tag => tag.FulfilmentStatus == parsed);
        }

        var tagType = NormalizeOptional(query.TagType);
        if (tagType is not null)
        {
            var hasNfc = ParseTagType(tagType);
            tags = tags.Where(tag => tag.HasNfc == hasNfc);
        }

        var variant = NormalizeOptional(query.Variant);
        if (variant is not null)
        {
            if (!variant.Equals(TagVariants.Lightweight, StringComparison.OrdinalIgnoreCase)
                && !variant.Equals(TagVariants.Standard, StringComparison.OrdinalIgnoreCase))
            {
                throw ValidationFailed("variant", "Tag variant is not supported.");
            }

            var normalizedVariant = TagVariants.Normalize(variant);
            tags = tags.Where(tag => tag.Variant == normalizedVariant);
        }

        if (query.PetId.HasValue)
        {
            tags = tags.Where(tag => tag.PetId == query.PetId.Value);
        }

        if (query.OwnerId.HasValue)
        {
            tags = tags.Where(tag => tag.OwnerUserId == query.OwnerId.Value);
        }

        if (query.Claimed.HasValue)
        {
            tags = query.Claimed.Value
                ? tags.Where(tag => tag.PetId != null)
                : tags.Where(tag => tag.PetId == null);
        }

        var reseller = NormalizeOptional(query.Reseller);
        if (reseller is not null)
        {
            tags = tags.Where(tag =>
                tag.Batch != null
                && tag.Batch.ResellerName != null
                && tag.Batch.ResellerName.Contains(reseller));
        }

        if (query.GeneratedFrom.HasValue && query.GeneratedTo.HasValue
            && query.GeneratedFrom.Value > query.GeneratedTo.Value)
        {
            throw ValidationFailed("generatedFrom", "The start of the generated date range must be before the end.");
        }

        if (query.UpdatedFrom.HasValue && query.UpdatedTo.HasValue
            && query.UpdatedFrom.Value > query.UpdatedTo.Value)
        {
            throw ValidationFailed("updatedFrom", "The start of the updated date range must be before the end.");
        }

        if (query.GeneratedFrom.HasValue)
        {
            tags = tags.Where(tag => tag.CreatedAt >= query.GeneratedFrom.Value);
        }

        if (query.GeneratedTo.HasValue)
        {
            tags = tags.Where(tag => tag.CreatedAt <= query.GeneratedTo.Value);
        }

        if (query.UpdatedFrom.HasValue)
        {
            tags = tags.Where(tag => tag.UpdatedAt >= query.UpdatedFrom.Value);
        }

        if (query.UpdatedTo.HasValue)
        {
            tags = tags.Where(tag => tag.UpdatedAt <= query.UpdatedTo.Value);
        }

        return tags;
    }

    // Sort allow-list: only these fields can be used in ORDER BY, so arbitrary
    // column names from the query string never reach SQL. Every sort ends with
    // the tag id so paging is deterministic.
    private static IQueryable<SmartTag> ApplySort(IQueryable<SmartTag> tags, string? sortBy, string? sortDir)
    {
        var direction = NormalizeOptional(sortDir)?.ToLowerInvariant() ?? "desc";

        if (direction is not ("asc" or "desc"))
        {
            throw ValidationFailed("sortDir", "Sort direction must be ascending or descending.");
        }

        var descending = direction == "desc";
        var field = NormalizeOptional(sortBy)?.ToLowerInvariant() ?? "generatedat";

        IOrderedQueryable<SmartTag> ordered = field switch
        {
            "generatedat" or "createdat" => Order(tags, tag => tag.CreatedAt, descending),
            "updatedat" => Order(tags, tag => tag.UpdatedAt, descending),
            "tagcode" => Order(tags, tag => tag.TagCode, descending),
            "batch" => Order(tags, tag => tag.Batch == null ? "" : tag.Batch.BatchNo, descending),
            "status" => Order(tags, tag => tag.Status, descending),
            "fulfilment" => Order(tags, tag => tag.FulfilmentStatus, descending),
            "variant" => Order(tags, tag => tag.Variant, descending),
            _ => throw ValidationFailed("sortBy", "Sorting by this field is not supported.")
        };

        return ordered.ThenBy(tag => tag.Id);
    }

    private static IOrderedQueryable<SmartTag> Order<TKey>(
        IQueryable<SmartTag> tags,
        System.Linq.Expressions.Expression<Func<SmartTag, TKey>> key,
        bool descending)
    {
        return descending ? tags.OrderByDescending(key) : tags.OrderBy(key);
    }

    private static IQueryable<AdminTagInventoryItemResponse> ProjectToItems(IQueryable<SmartTag> tags)
    {
        return tags.Select(tag => new AdminTagInventoryItemResponse(
            tag.Id,
            tag.TagCode,
            tag.HasNfc,
            tag.Variant,
            tag.Batch == null ? null : tag.Batch.BatchNo,
            tag.Batch == null ? null : tag.Batch.ResellerName,
            tag.Status,
            tag.ArchivedAt != null,
            tag.FulfilmentStatus,
            tag.PetId,
            tag.Pet == null ? null : tag.Pet.Name,
            tag.OwnerUserId,
            tag.OwnerUser == null ? null : tag.OwnerUser.DisplayName,
            tag.OwnerUser == null ? null : tag.OwnerUser.Email,
            tag.OrderId,
            tag.Order == null ? null : tag.Order.OrderNumber,
            tag.CreatedAt,
            tag.UpdatedAt,
            tag.PrintedAt,
            tag.SentToResellerAt,
            tag.ReceivedAt,
            tag.SentToOwnerAt,
            tag.ActivatedAt,
            tag.DeliveredAt,
            tag.LastScannedAt));
    }

    // --- Display labels -------------------------------------------------------------

    internal static string LifecycleLabel(SmartTagStatus status, bool archived)
    {
        return archived ? "Archived" : status.ToString();
    }

    internal static string FulfilmentLabel(TagFulfilmentStatus status)
    {
        return status switch
        {
            TagFulfilmentStatus.Generated => "Generated",
            TagFulfilmentStatus.Printed => "Printed",
            TagFulfilmentStatus.SentToReseller => "Sent to Reseller",
            TagFulfilmentStatus.Received => "Received",
            TagFulfilmentStatus.SentToOwner => "Sent to Owner",
            _ => status.ToString()
        };
    }

    // --- Shared helpers -------------------------------------------------------------

    private async Task<AdminUser> RequireAdminAsync(Guid? currentUserId, CancellationToken cancellationToken)
    {
        if (!currentUserId.HasValue)
        {
            throw new ApiException(StatusCodes.Status401Unauthorized, "unauthorized", "Authentication is required.");
        }

        var admin = await _dbContext.AdminUsers
            .SingleOrDefaultAsync(item =>
                item.UserId == currentUserId.Value
                && item.IsActive
                && item.DisabledAt == null, cancellationToken);

        return admin ?? throw new ApiException(
            StatusCodes.Status403Forbidden,
            "forbidden",
            "Admin access is required.");
    }

    private async Task<string> GenerateBatchNumberAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 12; attempt++)
        {
            var candidate = $"BATCH-{now:yyyyMM}-{RandomNumberGenerator.GetInt32(1000, 10000)}";
            var exists = await _dbContext.SmartTagBatches
                .AnyAsync(batch => batch.BatchNo == candidate, cancellationToken);

            if (!exists)
            {
                return candidate;
            }
        }

        throw new ApiException(
            StatusCodes.Status500InternalServerError,
            "batch_number_generation_failed",
            "Could not generate a batch number. Please try again.");
    }

    private async Task<string> GenerateUniqueTagCodeAsync(
        IReadOnlyCollection<SmartTag> pendingTags,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 12; attempt++)
        {
            var code = $"MPL-{RandomToken(4)}-{RandomToken(4)}";

            if (pendingTags.Any(tag => tag.TagCode == code))
            {
                continue;
            }

            var exists = await _dbContext.SmartTags.AnyAsync(tag => tag.TagCode == code, cancellationToken);

            if (!exists)
            {
                return code;
            }
        }

        throw new ApiException(
            StatusCodes.Status500InternalServerError,
            "tag_code_generation_failed",
            "Could not generate a tag code. Please try again.");
    }

    private static string RandomToken(int length)
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return string.Create(length, alphabet, static (span, chars) =>
        {
            for (var index = 0; index < span.Length; index++)
            {
                span[index] = chars[RandomNumberGenerator.GetInt32(chars.Length)];
            }
        });
    }

    private static bool ParseTagType(string value)
    {
        var normalized = value
            .Trim()
            .Replace("_", "", StringComparison.OrdinalIgnoreCase)
            .Replace("-", "", StringComparison.OrdinalIgnoreCase)
            .Replace(" ", "", StringComparison.OrdinalIgnoreCase)
            .ToUpperInvariant();

        return normalized switch
        {
            "QR" or "QRPETTAG" or "QRTAG" => false,
            "QRNFC" or "QRNFCSMARTTAG" or "NFC" or "QRNFCTAG" => true,
            _ => throw ValidationFailed("tagType", "Tag type is not supported.")
        };
    }

    private static TEnum ParseEnum<TEnum>(string value, string field, string message)
        where TEnum : struct, Enum
    {
        var normalized = value
            .Trim()
            .Replace("_", "", StringComparison.OrdinalIgnoreCase)
            .Replace("-", "", StringComparison.OrdinalIgnoreCase)
            .Replace(" ", "", StringComparison.OrdinalIgnoreCase);

        if (Enum.TryParse<TEnum>(normalized, ignoreCase: true, out var parsed))
        {
            return parsed;
        }

        throw ValidationFailed(field, message);
    }

    private static string CsvField(string value)
    {
        return value.Contains(',') || value.Contains('"') || value.Contains('\n')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
    }

    private static string? NormalizeOptional(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
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
}

public sealed record AdminTagInventoryExport(
    string FileName,
    string ContentType,
    byte[] Content);
