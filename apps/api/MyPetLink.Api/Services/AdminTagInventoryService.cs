using System.Security.Cryptography;
using System.Text;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
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
    private readonly PublicSiteOptions _publicSiteOptions;

    public AdminTagInventoryService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        IOptions<PublicSiteOptions> publicSiteOptions)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _publicSiteOptions = publicSiteOptions.Value;
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
        if (!request.ProductVariantId.HasValue)
        {
            throw ValidationFailed("productVariantId", "Choose a product SKU.");
        }

        var productVariant = await _dbContext.TagProductVariants
            .Include(item => item.TagProduct)
            .SingleOrDefaultAsync(item => item.Id == request.ProductVariantId.Value, cancellationToken)
            ?? throw ValidationFailed("productVariantId", "The selected SKU could not be found.");

        ValidateProductionVariant(productVariant);
        var hasNfc = productVariant.SupportsNfc;
        var variant = TagVariants.Normalize(productVariant.TagVariant);
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
            ProductVariantId = productVariant.Id,
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
                ProductVariantId = productVariant.Id,
                HasNfc = hasNfc,
                Variant = variant,
                Status = SmartTagStatus.Unclaimed,
                FulfilmentStatus = TagFulfilmentStatus.Generated
            });
        }

        _dbContext.SmartTags.AddRange(tags);

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "tag-inventory.generate", "SmartTagBatch", batch.Id,
            null, new { batchNo, request.Quantity, productVariant.Id, productVariant.Sku, productVariant.TagProduct.Name });

        await _dbContext.SaveChangesAsync(cancellationToken);

        var currentInventoryCount = await _dbContext.SmartTags.CountAsync(
            tag => tag.ProductVariantId == productVariant.Id && tag.DeletedAt == null,
            cancellationToken);

        return new AdminGenerateTagsResponse(
            batchNo,
            tags.Count,
            productVariant.Id,
            productVariant.Sku,
            productVariant.TagProduct.Name,
            productVariant.DisplayName,
            currentInventoryCount,
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
            TagTypeLabel(row.HasNfc),
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
                sheet.Cell(index + 2, column + 1).SetValue(AdminExportSanitizer.SpreadsheetSafe(values[column]));
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
            query.Sku,
            query.ProductVariantId,
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

    // --- Manufacturer production export ------------------------------------------------

    // Workbook columns, in the order the manufacturer receives them.
    private static readonly string[] ManufacturerHeaders =
    [
        "Sequence No.",
        "Tag Code",
        "Tag Type",
        "Tag Variant",
        "QR Content",
        "NFC Content",
        "Batch No.",
        "Printed Code",
        "Print Template / SKU",
        "Production Notes"
    ];

    // 1-based workbook columns that must stay plain text so Excel never
    // reformats codes, batch numbers, or URLs.
    private static readonly int[] ManufacturerTextColumns = [2, 5, 6, 7, 8];

    // Internal-only projection used to decide whether a tag may be sent for
    // production. Linkage and lifecycle fields never reach the workbook.
    private sealed record ManufacturerCandidate(
        Guid Id,
        string TagCode,
        Guid? ProductVariantId,
        bool? SupportsNfc,
        string? ProductVariant,
        string? Sku,
        string? PrintTemplateCode,
        string? ProductionNotes,
        string? BatchNo,
        SmartTagStatus Status,
        bool IsArchived,
        TagFulfilmentStatus Fulfilment,
        bool IsLinked);

    // Production-focused export shared with the physical tag manufacturer. It
    // contains only what is needed to print QR codes and encode NFC chips —
    // never owner, pet, order, payment, or internal operational data — and it
    // never changes any tag's lifecycle or fulfilment status. Only unclaimed,
    // batch-tracked stock that has not left our hands (Generated or Printed)
    // is eligible; anything else blocks the export with per-tag reasons.
    public async Task<AdminTagInventoryExport> ExportManufacturerAsync(
        Guid? currentUserId,
        AdminTagInventoryQuery query,
        IReadOnlyCollection<Guid>? tagIds,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);

        if (TagLinks.ScanUrl(_publicSiteOptions.BaseUrl, "MPL-TEST-TEST") is null)
        {
            throw new ApiException(
                StatusCodes.Status503ServiceUnavailable,
                "production_export_unavailable",
                "The public website address is not configured for this environment, so tag QR links cannot be generated yet.");
        }

        var tags = BuildFilteredQuery(query);

        if (tagIds is { Count: > 0 })
        {
            tags = tags.Where(tag => tagIds.Contains(tag.Id));
        }

        var total = await tags.CountAsync(cancellationToken);

        if (total == 0)
        {
            throw new ApiException(
                StatusCodes.Status400BadRequest,
                "production_export_blocked",
                tagIds is { Count: > 0 }
                    ? "The selected tags could no longer be found. Please refresh the list and reselect."
                    : "No tags match the current filters, so there is nothing to send for production.");
        }

        if (tagIds is { Count: > 0 } && total != tagIds.Distinct().Count())
        {
            throw new ApiException(
                StatusCodes.Status400BadRequest,
                "production_export_blocked",
                "Some selected tags could no longer be found. Please refresh the list and reselect.");
        }

        if (total > MaxExportRows)
        {
            throw ValidationFailed(
                "filters",
                $"This export would contain {total} rows. Narrow the filters to {MaxExportRows} rows or fewer.");
        }

        // Deterministic production order: an explicitly chosen table sort is
        // preserved; otherwise rows group by batch and then tag code.
        var ordered = NormalizeOptional(query.SortBy) is not null
            ? ApplySort(tags, query.SortBy, query.SortDir)
            : tags
                .OrderBy(tag => tag.Batch == null ? "" : tag.Batch.BatchNo)
                .ThenBy(tag => tag.TagCode)
                .ThenBy(tag => tag.Id);

        var candidates = await ordered
            .Select(tag => new ManufacturerCandidate(
                tag.Id,
                tag.TagCode,
                tag.ProductVariantId,
                tag.ProductVariant == null ? null : tag.ProductVariant.SupportsNfc,
                tag.ProductVariant == null ? null : tag.ProductVariant.TagVariant,
                tag.ProductVariant == null ? null : tag.ProductVariant.Sku,
                tag.ProductVariant == null ? null : tag.ProductVariant.PrintTemplateCode,
                tag.ProductVariant == null ? null : tag.ProductVariant.ProductionNotes,
                tag.Batch == null ? null : tag.Batch.BatchNo,
                tag.Status,
                tag.ArchivedAt != null,
                tag.FulfilmentStatus,
                tag.PetId != null || tag.OwnerUserId != null))
            .ToListAsync(cancellationToken);

        var problems = CollectProductionProblems(candidates);

        if (problems.Count > 0)
        {
            throw ProductionExportBlocked(problems);
        }

        var rows = candidates
            .Select(candidate => new AdminManufacturerTagRow(
                candidate.TagCode,
                candidate.SupportsNfc!.Value,
                TagVariants.Normalize(candidate.ProductVariant),
                candidate.BatchNo!,
                candidate.PrintTemplateCode ?? candidate.Sku!,
                candidate.ProductionNotes ?? ""))
            .ToList();

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "tag-inventory.export-manufacturer", "SmartTag", null,
            null,
            new
            {
                rowCount = rows.Count,
                selectedRowsOnly = tagIds is { Count: > 0 },
                filters = FilterSnapshot(query)
            });

        // Same batch bookkeeping as the internal export: remember when each
        // batch last went out in an export. Lifecycle and fulfilment are never
        // touched here.
        var exportedBatchNos = rows.Select(row => row.BatchNo).Distinct().ToArray();
        var exportedAt = DateTimeOffset.UtcNow;
        var batches = await _dbContext.SmartTagBatches
            .Where(batch => exportedBatchNos.Contains(batch.BatchNo))
            .ToListAsync(cancellationToken);

        foreach (var batch in batches)
        {
            batch.ExportedAt = exportedAt;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        var scopeName = exportedBatchNos.Length == 1
            ? exportedBatchNos[0]
            : exportedAt.UtcDateTime.ToString("yyyy-MM-dd");

        return new AdminTagInventoryExport(
            $"MyPetLink-Tag-Production-{scopeName}.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            BuildManufacturerXlsx(rows));
    }

    private List<(string TagCode, string Reason)> CollectProductionProblems(
        IReadOnlyList<ManufacturerCandidate> candidates)
    {
        var problems = new List<(string TagCode, string Reason)>();
        var seenCodes = new HashSet<string>(StringComparer.Ordinal);

        foreach (var candidate in candidates)
        {
            var code = candidate.TagCode;

            if (string.IsNullOrWhiteSpace(code))
            {
                problems.Add(("(no code)", "This tag has no tag code."));
                continue;
            }

            if (!seenCodes.Add(code))
            {
                problems.Add((code, "This tag code appears more than once in the export."));
                continue;
            }

            if (!candidate.ProductVariantId.HasValue
                || string.IsNullOrWhiteSpace(candidate.Sku)
                || string.IsNullOrWhiteSpace(candidate.ProductVariant)
                || !candidate.SupportsNfc.HasValue
                || string.IsNullOrWhiteSpace(candidate.PrintTemplateCode))
            {
                problems.Add((code, "This legacy tag has no complete approved SKU mapping. Link it to a verified product variant before production export."));
                continue;
            }

            if (candidate.IsArchived || candidate.Status == SmartTagStatus.Archived)
            {
                problems.Add((code, "Archived tags cannot be sent for production."));
                continue;
            }

            if (candidate.Status != SmartTagStatus.Unclaimed)
            {
                problems.Add((code,
                    $"Only unclaimed stock can be sent for production. This tag is {LifecycleLabel(candidate.Status, archived: false)}."));
                continue;
            }

            if (candidate.IsLinked)
            {
                problems.Add((code, "This tag is already linked to an owner or pet."));
                continue;
            }

            if (candidate.Fulfilment is not (TagFulfilmentStatus.Generated or TagFulfilmentStatus.Printed))
            {
                problems.Add((code,
                    $"This tag is already {FulfilmentLabel(candidate.Fulfilment)}, so producing it again is not safe."));
                continue;
            }

            if (string.IsNullOrWhiteSpace(candidate.BatchNo))
            {
                problems.Add((code, "This tag has no production batch number."));
                continue;
            }

            if (TagLinks.ScanUrl(_publicSiteOptions.BaseUrl, code) is null)
            {
                problems.Add((code, "A QR link could not be generated for this tag."));
            }
        }

        return problems;
    }

    private static ApiException ProductionExportBlocked(
        IReadOnlyList<(string TagCode, string Reason)> problems)
    {
        const int shown = 5;
        var lines = problems
            .Take(shown)
            .Select(problem => $"{problem.TagCode}: {problem.Reason}");
        var summary = string.Join(" ", lines);
        var suffix = problems.Count > shown
            ? $" …and {problems.Count - shown} more."
            : "";

        return new ApiException(
            StatusCodes.Status400BadRequest,
            "production_export_blocked",
            $"{problems.Count} tag{(problems.Count == 1 ? " is" : "s are")} not ready for production export. {summary}{suffix}",
            new Dictionary<string, string[]>
            {
                ["tags"] = problems
                    .Select(problem => $"{problem.TagCode}: {problem.Reason}")
                    .ToArray()
            });
    }

    private byte[] BuildManufacturerXlsx(IReadOnlyList<AdminManufacturerTagRow> rows)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Tag Production");

        for (var column = 0; column < ManufacturerHeaders.Length; column++)
        {
            var cell = sheet.Cell(1, column + 1);
            cell.Value = ManufacturerHeaders[column];
            cell.Style.Font.Bold = true;
        }

        foreach (var column in ManufacturerTextColumns)
        {
            sheet.Column(column).Style.NumberFormat.Format = "@";
        }

        for (var index = 0; index < rows.Count; index++)
        {
            var row = rows[index];
            var scanUrl = TagLinks.ScanUrl(_publicSiteOptions.BaseUrl, row.TagCode)!;
            var sheetRow = index + 2;

            sheet.Cell(sheetRow, 1).SetValue(index + 1);
            SetManufacturerText(sheet, sheetRow, 2, row.TagCode);
            SetManufacturerText(sheet, sheetRow, 3, TagTypeLabel(row.HasNfc));
            SetManufacturerText(sheet, sheetRow, 4, row.Variant);
            SetManufacturerText(sheet, sheetRow, 5, scanUrl);
            // QR and NFC are separate manufacturing operations, so they stay
            // separate columns even while the encoded URL is identical.
            SetManufacturerText(sheet, sheetRow, 6, row.HasNfc ? scanUrl : "");
            SetManufacturerText(sheet, sheetRow, 7, row.BatchNo);
            // The printed code is the human-readable text on the physical tag;
            // today it matches the encoded tag code exactly.
            SetManufacturerText(sheet, sheetRow, 8, row.TagCode);
            // Print Template / SKU has no approved product mapping yet, and
            // Production Notes has no production-safe source field; both stay
            // blank deliberately.
            SetManufacturerText(sheet, sheetRow, 9, row.PrintTemplateOrSku);
            SetManufacturerText(sheet, sheetRow, 10, row.ProductionNotes);
        }

        sheet.SheetView.FreezeRows(1);
        sheet.Range(1, 1, Math.Max(rows.Count + 1, 1), ManufacturerHeaders.Length).SetAutoFilter();
        sheet.Columns().AdjustToContents(1, Math.Min(rows.Count + 1, 200));

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static void SetManufacturerText(IXLWorksheet sheet, int row, int column, string value)
    {
        sheet.Cell(row, column).SetValue(AdminExportSanitizer.SpreadsheetSafe(value));
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
                || (tag.Order != null && tag.Order.OrderNumber.Contains(search))
                || (tag.ProductVariant != null && tag.ProductVariant.Sku.Contains(search))
                || (tag.ProductVariant != null && tag.ProductVariant.TagProduct.Name.Contains(search)));

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

        var sku = NormalizeOptional(query.Sku);
        if (sku is not null)
        {
            tags = tags.Where(tag => tag.ProductVariant != null && tag.ProductVariant.Sku.Contains(sku));
        }

        if (query.ProductVariantId.HasValue)
        {
            tags = tags.Where(tag => tag.ProductVariantId == query.ProductVariantId.Value);
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
            // Variant labels are Admin-configurable presets, so any value is a
            // valid filter; canonicalize only the two built-in casings.
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
            tag.ProductVariantId,
            tag.ProductVariant == null ? null : tag.ProductVariant.Sku,
            tag.ProductVariant == null ? null : tag.ProductVariant.TagProduct.Name,
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

    // Product-facing tag type names, shared by every export.
    internal static string TagTypeLabel(bool hasNfc)
    {
        return hasNfc ? "QR + NFC Smart Tag" : "QR Pet Tag";
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

    private static void ValidateProductionVariant(TagProductVariant variant)
    {
        if (variant.ArchivedAt.HasValue || !variant.IsActive || variant.TagProduct.IsArchived)
        {
            throw ValidationFailed("productVariantId", "Choose an active, non-archived SKU.");
        }

        if (!variant.SupportsQr
            || !variant.WidthMm.HasValue
            || !variant.HeightMm.HasValue
            || !variant.WeightGrams.HasValue
            || string.IsNullOrWhiteSpace(variant.Material)
            || string.IsNullOrWhiteSpace(variant.Shape)
            || string.IsNullOrWhiteSpace(variant.Colour)
            || string.IsNullOrWhiteSpace(variant.PackagingType)
            || string.IsNullOrWhiteSpace(variant.PrintTemplateCode))
        {
            throw ValidationFailed(
                "productVariantId",
                "Complete the SKU's QR capability, physical specifications, packaging, and print template before generating inventory.");
        }
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

    private static string CsvField(string value) => AdminExportSanitizer.Csv(value);

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
