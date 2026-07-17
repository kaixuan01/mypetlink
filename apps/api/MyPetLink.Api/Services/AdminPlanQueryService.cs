using System.Text;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// Read-only Plans surface for the Admin Portal. Plan definitions come from the
// seeded Plans/PlanLimits tables — the same rows the backend enforces against —
// so this module can never disagree with enforcement. Owner-plan rows measure
// usage with the exact counting rules used by PetService (active pets) and
// MemoryService (non-archived memories per pet). There are no plan mutations
// here: no subscription billing exists yet, and manual plan changes are a
// deliberate product decision that has not been taken.
public sealed class AdminPlanQueryService : SkeletonService, IAdminPlanQueryService
{
    private const int MaxExportRows = 10_000;

    // Usage states shared by list, filters, counts, and exports. "Near" starts
    // at 80% of the limit; "Over" only happens for legacy/early-access data and
    // never blocks the owner.
    internal const string UsageWithin = "Within";
    internal const string UsageNear = "Near";
    internal const string UsageAt = "At";
    internal const string UsageOver = "Over";

    private static readonly string[] ExportHeaders =
    [
        "Owner Name", "Owner Email", "Plan", "Plan Code", "Plan Status", "Assignment",
        "Active Pets", "Pet Limit", "Pet Usage",
        "Memories (Busiest Pet)", "Memory Limit", "Memory Usage", "Total Memories",
        "Care Records", "Care Record Limit",
        "Manual Override", "Effective Date (UTC)", "Updated At (UTC)"
    ];

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;

    public AdminPlanQueryService(MyPetLinkDbContext dbContext, IAuditLogService auditLogService)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
    }

    // --- Plan definitions -------------------------------------------------------

    public async Task<IReadOnlyCollection<AdminPlanDefinitionResponse>> ListDefinitionsAsync(
        CancellationToken cancellationToken = default)
    {
        return await _dbContext.Plans
            .AsNoTracking()
            .OrderBy(plan => plan.Name)
            .Select(plan => new AdminPlanDefinitionResponse(
                plan.Id,
                plan.Code,
                plan.Name,
                plan.Status.ToString(),
                plan.ArchivedAt != null,
                plan.PriceLabel,
                plan.BillingNote,
                plan.Description,
                plan.Limit == null ? 0 : plan.Limit.MaxPets,
                plan.Limit == null ? 0 : plan.Limit.MaxMemoriesPerPet,
                plan.Limit == null ? 0 : plan.Limit.MaxMediaPerMemory,
                plan.Limit == null ? 0 : plan.Limit.MaxFamilyMembers,
                plan.Limit == null ? 0 : plan.Limit.MaxCareRecords,
                plan.Limit == null ? 0 : plan.Limit.ScanHistoryDays,
                plan.Limit != null && plan.Limit.AllowsSmartTagAddOns,
                plan.Limit != null && plan.Limit.AllowsFoundReports,
                plan.Limit != null && plan.Limit.AllowsAdvancedThemes,
                plan.OwnerProfiles.Count(profile => profile.ArchivedAt == null),
                plan.CreatedAt,
                plan.UpdatedAt))
            .ToListAsync(cancellationToken);
    }

    // --- Owner plans --------------------------------------------------------------

    public async Task<(IReadOnlyCollection<AdminOwnerPlanItemResponse> Items, int Total)> ListOwnersAsync(
        AdminOwnerPlanQuery query,
        CancellationToken cancellationToken = default)
    {
        var filtered = BuildFilteredQuery(query);
        var total = await filtered.CountAsync(cancellationToken);
        var rows = await Project(ApplySort(filtered, query.SortBy, query.SortDir))
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return (rows.Select(ToItem).ToArray(), total);
    }

    public async Task<AdminOwnerPlanCountsResponse> CountAsync(
        AdminOwnerPlanQuery query,
        CancellationToken cancellationToken = default)
    {
        var filtered = BuildFilteredQuery(query);

        return new AdminOwnerPlanCountsResponse(
            await filtered.CountAsync(cancellationToken),
            await UsageStateFilter(filtered, UsageNear).CountAsync(cancellationToken),
            await UsageStateFilter(filtered, UsageAt).CountAsync(cancellationToken),
            await UsageStateFilter(filtered, UsageOver).CountAsync(cancellationToken),
            await filtered.CountAsync(
                profile => profile.PlanOverrideJson != null || profile.GrandfatheredAt != null,
                cancellationToken));
    }

    public async Task<AdminOwnerPlanDetailResponse> GetOwnerAsync(
        Guid? currentUserId,
        Guid ownerUserId,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var profile = await _dbContext.OwnerProfiles
            .AsNoTracking()
            .Include(item => item.User)
            .Include(item => item.Plan).ThenInclude(plan => plan.Limit)
            .SingleOrDefaultAsync(item => item.UserId == ownerUserId && item.ArchivedAt == null, cancellationToken)
            ?? throw NotFound("Owner plan record was not found.");

        var row = await Project(
                _dbContext.OwnerProfiles.AsNoTracking().Where(item => item.UserId == ownerUserId))
            .SingleAsync(cancellationToken);

        var plan = (await ListDefinitionsAsync(cancellationToken))
            .Single(definition => definition.Id == profile.PlanId);

        var memorialPets = await _dbContext.Pets.CountAsync(
            pet => pet.OwnerUserId == ownerUserId && pet.DeletedAt == null
                && pet.LifecycleStatus == PetLifecycleStatus.Memorial, cancellationToken);
        var archivedPets = await _dbContext.Pets.CountAsync(
            pet => pet.OwnerUserId == ownerUserId && pet.DeletedAt == null
                && pet.LifecycleStatus == PetLifecycleStatus.Archived, cancellationToken);

        var media = await _dbContext.MediaFiles
            .Where(file => file.OwnerUserId == ownerUserId
                && file.DeletedAt == null
                && file.UploadStatus == MediaUploadStatus.Ready)
            .GroupBy(_ => 1)
            .Select(group => new { Count = group.Count(), Bytes = group.Sum(file => file.FileSize) })
            .SingleOrDefaultAsync(cancellationToken);

        // Plan history: plan-related audit entries for this profile plus the
        // assignment itself. Plans cannot change yet, so assignment is the
        // profile creation.
        var logs = await _dbContext.AuditLogs.AsNoTracking()
            .Where(log => log.Entity == "OwnerProfile" && log.EntityId == profile.Id
                && (log.Action.StartsWith("plans.") || log.Action.StartsWith("plan.")))
            .OrderByDescending(log => log.CreatedAt)
            .Take(50)
            .ToListAsync(cancellationToken);
        var actorIds = logs.Where(log => log.ActorId.HasValue).Select(log => log.ActorId!.Value).Distinct().ToArray();
        var actorNames = actorIds.Length == 0
            ? new Dictionary<Guid, string>()
            : await _dbContext.AdminUsers.AsNoTracking()
                .Where(item => actorIds.Contains(item.Id))
                .Select(item => new { item.Id, item.User.DisplayName })
                .ToDictionaryAsync(item => item.Id, item => item.DisplayName, cancellationToken);

        var history = logs
            .Select(log => new AdminOwnerHistoryItemResponse(
                HumanizeAuditAction(log.Action),
                log.ActorId.HasValue && actorNames.TryGetValue(log.ActorId.Value, out var actor)
                    ? actor
                    : log.ActorType.ToString(),
                log.CreatedAt))
            .Concat(profile.GrandfatheredAt.HasValue
                ? new[] { new AdminOwnerHistoryItemResponse("Legacy allowance recorded", "System", profile.GrandfatheredAt.Value) }
                : Array.Empty<AdminOwnerHistoryItemResponse>())
            .Append(new AdminOwnerHistoryItemResponse($"{profile.Plan.Name} assigned", "System", profile.CreatedAt))
            .OrderByDescending(item => item.CreatedAt)
            .Take(50)
            .ToArray();

        var response = new AdminOwnerPlanDetailResponse(
            ToItem(row),
            plan,
            memorialPets,
            archivedPets,
            media?.Count ?? 0,
            media?.Bytes ?? 0,
            NormalizeOptional(profile.PlanOverrideJson),
            profile.GrandfatheredAt,
            history);

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "plans.owner-detail-view", "OwnerProfile", profile.Id,
            null, new { ownerUserId });
        await _dbContext.SaveChangesAsync(cancellationToken);
        return response;
    }

    // --- Export ---------------------------------------------------------------------

    public async Task<AdminTagInventoryExport> ExportAsync(
        Guid? currentUserId,
        AdminOwnerPlanQuery query,
        string? format,
        IReadOnlyCollection<Guid>? ownerIds,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var normalizedFormat = NormalizeOptional(format)?.ToLowerInvariant() ?? "csv";

        if (normalizedFormat is not ("csv" or "xlsx"))
        {
            throw ValidationFailed("format", "Choose CSV or Excel for the export.");
        }

        var filtered = BuildFilteredQuery(query);

        if (ownerIds is { Count: > 0 })
        {
            filtered = filtered.Where(profile => ownerIds.Contains(profile.UserId));
        }

        var count = await filtered.CountAsync(cancellationToken);

        if (count > MaxExportRows)
        {
            throw ValidationFailed("filters", $"Narrow the filters to {MaxExportRows} rows or fewer before exporting.");
        }

        var rows = (await Project(ApplySort(filtered, query.SortBy, query.SortDir)).ToListAsync(cancellationToken))
            .Select(ToItem)
            .Select(ToExportRow)
            .ToArray();

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "plans.export", "OwnerProfile", null, null,
            new { format = normalizedFormat, rowCount = rows.Length, selectedRowsOnly = ownerIds is { Count: > 0 } });
        await _dbContext.SaveChangesAsync(cancellationToken);

        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmm");
        return normalizedFormat == "xlsx"
            ? new AdminTagInventoryExport(
                $"mypetlink-owner-plans-{stamp}.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                BuildXlsx(rows))
            : new AdminTagInventoryExport(
                $"mypetlink-owner-plans-{stamp}.csv",
                "text/csv;charset=utf-8",
                Encoding.UTF8.GetBytes(BuildCsv(rows)));
    }

    private static string[] ToExportRow(AdminOwnerPlanItemResponse item)
    {
        return
        [
            item.DisplayName, item.Email, item.PlanName, item.PlanCode, PlanStatusLabel(item.PlanStatus),
            "Assigned",
            item.ActivePetCount.ToString(), item.MaxPets.ToString(), UsageLabel(item.PetUsageState),
            item.HighestMemoriesOnPet.ToString(), item.MaxMemoriesPerPet.ToString(),
            UsageLabel(item.MemoryUsageState), item.TotalMemoryCount.ToString(),
            item.CareRecordCount.ToString(), item.MaxCareRecords.ToString(),
            item.HasOverride || item.Grandfathered ? "Yes" : "No",
            ExportDate(item.AssignedAt), ExportDate(item.UpdatedAt)
        ];
    }

    // --- Query building --------------------------------------------------------------

    private IQueryable<OwnerProfile> BuildFilteredQuery(AdminOwnerPlanQuery query)
    {
        ValidateRange(query.AssignedFrom, query.AssignedTo, "assigned");
        ValidateRange(query.UpdatedFrom, query.UpdatedTo, "updated");

        var owners = _dbContext.OwnerProfiles.AsNoTracking().Where(profile => profile.ArchivedAt == null);

        var search = NormalizeOptional(query.Search);
        if (search is not null)
        {
            var normalizedEmail = search.ToUpperInvariant();
            owners = owners.Where(profile =>
                profile.OwnerDisplayName.Contains(search)
                || profile.User.DisplayName.Contains(search)
                || profile.User.NormalizedEmail.Contains(normalizedEmail)
                || profile.Plan.Code.Contains(search)
                || profile.Plan.Name.Contains(search));
        }

        if (NormalizeOptional(query.Plan) is { } plan)
        {
            owners = owners.Where(profile => profile.Plan.Code == plan);
        }

        if (NormalizeOptional(query.PetUsage) is { } petUsage)
        {
            owners = UsageStateFilter(owners, ParseUsageState(petUsage, "petUsage"));
        }

        if (NormalizeOptional(query.MemoryUsage) is { } memoryUsage)
        {
            owners = MemoryUsageStateFilter(owners, ParseUsageState(memoryUsage, "memoryUsage"));
        }

        if (query.HasOverride.HasValue)
        {
            owners = query.HasOverride.Value
                ? owners.Where(profile => profile.PlanOverrideJson != null || profile.GrandfatheredAt != null)
                : owners.Where(profile => profile.PlanOverrideJson == null && profile.GrandfatheredAt == null);
        }

        if (query.AssignedFrom.HasValue)
        {
            owners = owners.Where(profile => profile.CreatedAt >= query.AssignedFrom.Value);
        }

        if (query.AssignedTo.HasValue)
        {
            owners = owners.Where(profile => profile.CreatedAt <= query.AssignedTo.Value);
        }

        if (query.UpdatedFrom.HasValue)
        {
            owners = owners.Where(profile => profile.UpdatedAt >= query.UpdatedFrom.Value);
        }

        if (query.UpdatedTo.HasValue)
        {
            owners = owners.Where(profile => profile.UpdatedAt <= query.UpdatedTo.Value);
        }

        return owners;
    }

    // Active-pet count vs MaxPets, in SQL, matching PetService enforcement.
    private IQueryable<OwnerProfile> UsageStateFilter(IQueryable<OwnerProfile> owners, string state)
    {
        var activePets = _dbContext.Pets.Where(pet =>
            pet.DeletedAt == null && pet.LifecycleStatus == PetLifecycleStatus.Active);

        return state switch
        {
            UsageWithin => owners.Where(profile => profile.Plan.Limit != null && profile.Plan.Limit.MaxPets > 0
                && activePets.Count(pet => pet.OwnerUserId == profile.UserId) * 10 < profile.Plan.Limit.MaxPets * 8),
            UsageNear => owners.Where(profile => profile.Plan.Limit != null && profile.Plan.Limit.MaxPets > 0
                && activePets.Count(pet => pet.OwnerUserId == profile.UserId) * 10 >= profile.Plan.Limit.MaxPets * 8
                && activePets.Count(pet => pet.OwnerUserId == profile.UserId) < profile.Plan.Limit.MaxPets),
            UsageAt => owners.Where(profile => profile.Plan.Limit != null && profile.Plan.Limit.MaxPets > 0
                && activePets.Count(pet => pet.OwnerUserId == profile.UserId) == profile.Plan.Limit.MaxPets),
            _ => owners.Where(profile => profile.Plan.Limit != null && profile.Plan.Limit.MaxPets > 0
                && activePets.Count(pet => pet.OwnerUserId == profile.UserId) > profile.Plan.Limit.MaxPets)
        };
    }

    // Busiest-pet memory count vs MaxMemoriesPerPet, matching MemoryService
    // enforcement (per pet, non-deleted, non-archived). The "busiest pet"
    // decides the state; the per-pet predicate keeps the whole check
    // translatable to SQL without loading owners into memory.
    private IQueryable<OwnerProfile> MemoryUsageStateFilter(IQueryable<OwnerProfile> owners, string state)
    {
        var activePets = _dbContext.Pets.Where(pet => pet.DeletedAt == null);

        return state switch
        {
            UsageWithin => owners.Where(profile => profile.Plan.Limit != null && profile.Plan.Limit.MaxMemoriesPerPet > 0
                && !activePets.Any(pet => pet.OwnerUserId == profile.UserId
                    && pet.Memories.Count(memory => memory.DeletedAt == null && memory.ArchivedAt == null) * 10 >= profile.Plan.Limit.MaxMemoriesPerPet * 8)),
            UsageNear => owners.Where(profile => profile.Plan.Limit != null && profile.Plan.Limit.MaxMemoriesPerPet > 0
                && activePets.Any(pet => pet.OwnerUserId == profile.UserId
                    && pet.Memories.Count(memory => memory.DeletedAt == null && memory.ArchivedAt == null) * 10 >= profile.Plan.Limit.MaxMemoriesPerPet * 8)
                && !activePets.Any(pet => pet.OwnerUserId == profile.UserId
                    && pet.Memories.Count(memory => memory.DeletedAt == null && memory.ArchivedAt == null) >= profile.Plan.Limit.MaxMemoriesPerPet)),
            UsageAt => owners.Where(profile => profile.Plan.Limit != null && profile.Plan.Limit.MaxMemoriesPerPet > 0
                && activePets.Any(pet => pet.OwnerUserId == profile.UserId
                    && pet.Memories.Count(memory => memory.DeletedAt == null && memory.ArchivedAt == null) == profile.Plan.Limit.MaxMemoriesPerPet)
                && !activePets.Any(pet => pet.OwnerUserId == profile.UserId
                    && pet.Memories.Count(memory => memory.DeletedAt == null && memory.ArchivedAt == null) > profile.Plan.Limit.MaxMemoriesPerPet)),
            _ => owners.Where(profile => profile.Plan.Limit != null && profile.Plan.Limit.MaxMemoriesPerPet > 0
                && activePets.Any(pet => pet.OwnerUserId == profile.UserId
                    && pet.Memories.Count(memory => memory.DeletedAt == null && memory.ArchivedAt == null) > profile.Plan.Limit.MaxMemoriesPerPet))
        };
    }

    private IQueryable<OwnerPlanRowProjection> Project(IQueryable<OwnerProfile> owners)
    {
        return owners.Select(profile => new OwnerPlanRowProjection
        {
            OwnerUserId = profile.UserId,
            DisplayName = profile.OwnerDisplayName == "" ? profile.User.DisplayName : profile.OwnerDisplayName,
            Email = profile.User.Email,
            PlanCode = profile.Plan.Code,
            PlanName = profile.Plan.Name,
            PlanStatus = profile.Plan.Status.ToString(),
            PetCount = _dbContext.Pets.Count(pet => pet.OwnerUserId == profile.UserId && pet.DeletedAt == null),
            ActivePetCount = _dbContext.Pets.Count(pet => pet.OwnerUserId == profile.UserId
                && pet.DeletedAt == null && pet.LifecycleStatus == PetLifecycleStatus.Active),
            MaxPets = profile.Plan.Limit == null ? 0 : profile.Plan.Limit.MaxPets,
            TotalMemoryCount = _dbContext.PetMemories.Count(memory => memory.Pet.OwnerUserId == profile.UserId
                && memory.Pet.DeletedAt == null && memory.DeletedAt == null && memory.ArchivedAt == null),
            HighestMemoriesOnPet = _dbContext.PetMemories
                .Where(memory => memory.Pet.OwnerUserId == profile.UserId
                    && memory.Pet.DeletedAt == null && memory.DeletedAt == null && memory.ArchivedAt == null)
                .GroupBy(memory => memory.PetId)
                .Select(group => (int?)group.Count())
                .Max() ?? 0,
            MaxMemoriesPerPet = profile.Plan.Limit == null ? 0 : profile.Plan.Limit.MaxMemoriesPerPet,
            CareRecordCount = _dbContext.CareRecords.Count(record => record.Pet.OwnerUserId == profile.UserId
                && record.Pet.DeletedAt == null && record.DeletedAt == null && record.ArchivedAt == null),
            MaxCareRecords = profile.Plan.Limit == null ? 0 : profile.Plan.Limit.MaxCareRecords,
            HasOverride = profile.PlanOverrideJson != null,
            Grandfathered = profile.GrandfatheredAt != null,
            AssignedAt = profile.CreatedAt,
            UpdatedAt = profile.UpdatedAt
        });
    }

    private IQueryable<OwnerProfile> ApplySort(IQueryable<OwnerProfile> owners, string? sortBy, string? sortDir)
    {
        var descending = (NormalizeOptional(sortDir)?.ToLowerInvariant() ?? "desc") switch
        {
            "asc" => false,
            "desc" => true,
            _ => throw ValidationFailed("sortDir", "Sort direction must be ascending or descending.")
        };
        var field = NormalizeOptional(sortBy)?.ToLowerInvariant() ?? "updatedat";
        var activePets = _dbContext.Pets.Where(pet =>
            pet.DeletedAt == null && pet.LifecycleStatus == PetLifecycleStatus.Active);

        var sorted = field switch
        {
            "owner" => Order(owners, profile => profile.OwnerDisplayName == "" ? profile.User.DisplayName : profile.OwnerDisplayName, descending),
            "email" => Order(owners, profile => profile.User.NormalizedEmail, descending),
            "plan" => Order(owners, profile => profile.Plan.Code, descending),
            "petusage" => Order(owners, profile => activePets.Count(pet => pet.OwnerUserId == profile.UserId), descending),
            "memoryusage" => Order(owners, profile => _dbContext.PetMemories
                .Where(memory => memory.Pet.OwnerUserId == profile.UserId
                    && memory.Pet.DeletedAt == null && memory.DeletedAt == null && memory.ArchivedAt == null)
                .GroupBy(memory => memory.PetId)
                .Select(group => (int?)group.Count())
                .Max() ?? 0, descending),
            "carerecords" => Order(owners, profile => _dbContext.CareRecords.Count(record => record.Pet.OwnerUserId == profile.UserId
                && record.Pet.DeletedAt == null && record.DeletedAt == null && record.ArchivedAt == null), descending),
            "assignedat" => Order(owners, profile => profile.CreatedAt, descending),
            "updatedat" => Order(owners, profile => profile.UpdatedAt, descending),
            _ => throw ValidationFailed("sortBy", "Sorting by this field is not supported.")
        };

        return descending ? sorted.ThenByDescending(profile => profile.UserId) : sorted.ThenBy(profile => profile.UserId);
    }

    private static IOrderedQueryable<OwnerProfile> Order<TKey>(
        IQueryable<OwnerProfile> query,
        System.Linq.Expressions.Expression<Func<OwnerProfile, TKey>> key,
        bool descending)
        => descending ? query.OrderByDescending(key) : query.OrderBy(key);

    private static AdminOwnerPlanItemResponse ToItem(OwnerPlanRowProjection row)
    {
        return new AdminOwnerPlanItemResponse(
            row.OwnerUserId,
            row.DisplayName,
            row.Email,
            row.PlanCode,
            row.PlanName,
            row.PlanStatus,
            row.PetCount,
            row.ActivePetCount,
            row.MaxPets,
            DeriveUsageState(row.ActivePetCount, row.MaxPets),
            row.TotalMemoryCount,
            row.HighestMemoriesOnPet,
            row.MaxMemoriesPerPet,
            DeriveUsageState(row.HighestMemoriesOnPet, row.MaxMemoriesPerPet),
            row.CareRecordCount,
            row.MaxCareRecords,
            row.HasOverride,
            row.Grandfathered,
            row.AssignedAt,
            row.UpdatedAt);
    }

    // Single derivation of usage states, mirrored by the SQL filters above.
    public static string DeriveUsageState(int used, int limit)
    {
        if (limit <= 0)
        {
            return UsageWithin;
        }

        if (used > limit)
        {
            return UsageOver;
        }

        if (used == limit)
        {
            return UsageAt;
        }

        return used * 10 >= limit * 8 ? UsageNear : UsageWithin;
    }

    internal static string UsageLabel(string state) => state switch
    {
        UsageNear => "Near limit",
        UsageAt => "At limit",
        UsageOver => "Over limit",
        _ => "Within limit"
    };

    internal static string PlanStatusLabel(string status) => status switch
    {
        "Available" => "Available",
        "ComingSoon" => "Coming Soon",
        "Disabled" => "Disabled",
        _ => status
    };

    private static string ParseUsageState(string value, string field) => value.Trim().ToLowerInvariant() switch
    {
        "within" => UsageWithin,
        "near" => UsageNear,
        "at" => UsageAt,
        "over" => UsageOver,
        _ => throw ValidationFailed(field, "Usage state must be within, near, at, or over.")
    };

    // --- Export documents -------------------------------------------------------------

    private static string BuildCsv(IReadOnlyList<string[]> rows)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', ExportHeaders.Select(Csv)));

        foreach (var row in rows)
        {
            builder.AppendLine(string.Join(',', row.Select(Csv)));
        }

        return builder.ToString();
    }

    private static byte[] BuildXlsx(IReadOnlyList<string[]> rows)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Owner Plans");

        for (var column = 0; column < ExportHeaders.Length; column++)
        {
            sheet.Cell(1, column + 1).Value = ExportHeaders[column];
            sheet.Cell(1, column + 1).Style.Font.Bold = true;
        }

        for (var index = 0; index < rows.Count; index++)
        {
            for (var column = 0; column < rows[index].Length; column++)
            {
                sheet.Cell(index + 2, column + 1).SetValue(SpreadsheetSafe(rows[index][column]));
            }
        }

        sheet.SheetView.FreezeRows(1);
        sheet.Columns().AdjustToContents(1, Math.Min(rows.Count + 1, 200));
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static string Csv(string value) => $"\"{SpreadsheetSafe(value).Replace("\"", "\"\"")}\"";

    private static string SpreadsheetSafe(string value)
    {
        var trimmed = value.TrimStart();
        return trimmed.Length > 0 && "=+-@\t\r".Contains(trimmed[0]) ? $"'{value}" : value;
    }

    private static string ExportDate(DateTimeOffset value) => value.UtcDateTime.ToString("yyyy-MM-dd HH:mm");

    private static string HumanizeAuditAction(string value) => value.Replace('-', ' ').Replace('.', ' ');

    private static string? NormalizeOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private async Task<AdminUser> RequireAdminAsync(Guid? userId, CancellationToken cancellationToken)
    {
        if (!userId.HasValue)
        {
            throw new ApiException(StatusCodes.Status401Unauthorized, "unauthorized", "Authentication is required.");
        }

        return await _dbContext.AdminUsers.SingleOrDefaultAsync(
                item => item.UserId == userId && item.IsActive && item.DisabledAt == null,
                cancellationToken)
            ?? throw new ApiException(StatusCodes.Status403Forbidden, "forbidden", "Admin access is required.");
    }

    private static void ValidateRange(DateTimeOffset? from, DateTimeOffset? to, string field)
    {
        if (from.HasValue && to.HasValue && from > to)
        {
            throw ValidationFailed(field, "The start of this date range must be before the end.");
        }
    }

    private static ApiException NotFound(string message) => new(
        StatusCodes.Status404NotFound, "owner_plan_not_found", message);

    private static ApiException ValidationFailed(string field, string message) => new(
        StatusCodes.Status400BadRequest,
        "validation_failed",
        "Please check the submitted fields.",
        new Dictionary<string, string[]> { [field] = [message] });

    private sealed class OwnerPlanRowProjection
    {
        public Guid OwnerUserId { get; init; }
        public string DisplayName { get; init; } = "";
        public string Email { get; init; } = "";
        public string PlanCode { get; init; } = "";
        public string PlanName { get; init; } = "";
        public string PlanStatus { get; init; } = "";
        public int PetCount { get; init; }
        public int ActivePetCount { get; init; }
        public int MaxPets { get; init; }
        public int TotalMemoryCount { get; init; }
        public int HighestMemoriesOnPet { get; init; }
        public int MaxMemoriesPerPet { get; init; }
        public int CareRecordCount { get; init; }
        public int MaxCareRecords { get; init; }
        public bool HasOverride { get; init; }
        public bool Grandfathered { get; init; }
        public DateTimeOffset AssignedAt { get; init; }
        public DateTimeOffset UpdatedAt { get; init; }
    }
}
