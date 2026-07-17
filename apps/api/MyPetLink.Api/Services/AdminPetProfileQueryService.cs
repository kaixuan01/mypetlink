using System.Linq.Expressions;
using System.Text;
using System.Text.Json;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

// Read-only operational projection for support staff. Owner-controlled profile
// fields are deliberately not mutated by this service.
public sealed class AdminPetProfileQueryService : SkeletonService, IAdminPetProfileQueryService
{
    private const int MaxExportRows = 10_000;
    private static readonly string[] ExportHeaders =
    [
        "Pet Name", "Owner Name", "Owner Email", "Pet Type", "Breed", "Gender",
        "Lifecycle", "Lost Mode", "Public Profile Enabled", "Public Profile Status",
        "Public Profile Slug", "QR Safety Enabled", "QR Safety Status",
        "Active Smart Tag Count", "Total Smart Tag Count", "Allergies Present",
        "Created At (UTC)", "Updated At (UTC)"
    ];

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly string? _publicMediaBaseUrl;

    public AdminPetProfileQueryService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        IOptions<CloudflareR2Options> r2Options)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _publicMediaBaseUrl = r2Options.Value.PublicBaseUrl;
    }

    public async Task<(IReadOnlyCollection<AdminPetProfileItemResponse> Items, int Total)> ListAsync(
        AdminPetProfileQuery query,
        CancellationToken cancellationToken = default)
    {
        var filtered = BuildFilteredQuery(query, includeView: true);
        var total = await filtered.CountAsync(cancellationToken);
        var pets = await IncludeSupportGraph(ApplySort(filtered, query.SortBy, query.SortDir))
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        return (pets.Select(ToItem).ToArray(), total);
    }

    public async Task<AdminPetProfileCountsResponse> CountByStatusAsync(
        AdminPetProfileQuery query,
        CancellationToken cancellationToken = default)
    {
        // Only the shortcut view is omitted. Explicit lifecycle/Lost Mode and
        // every other toolbar filter still constrain the counts.
        var pets = BuildFilteredQuery(query, includeView: false);
        var counts = await pets.GroupBy(_ => 1).Select(group => new
        {
            All = group.Count(),
            Active = group.Count(pet => pet.LifecycleStatus == PetLifecycleStatus.Active),
            LostMode = group.Count(pet => pet.LifecycleStatus == PetLifecycleStatus.Active && pet.LostModeEnabled),
            Memorial = group.Count(pet => pet.LifecycleStatus == PetLifecycleStatus.Memorial),
            Archived = group.Count(pet => pet.LifecycleStatus == PetLifecycleStatus.Archived)
        }).SingleOrDefaultAsync(cancellationToken);

        return counts is null
            ? new AdminPetProfileCountsResponse(0, 0, 0, 0, 0)
            : new AdminPetProfileCountsResponse(
                counts.All, counts.Active, counts.LostMode, counts.Memorial, counts.Archived);
    }

    public async Task<AdminPetProfileDetailResponse> GetAsync(
        Guid petId,
        CancellationToken cancellationToken = default)
    {
        var pet = await IncludeSupportGraph(_dbContext.Pets.AsNoTracking().Where(item =>
                item.Id == petId && item.DeletedAt == null))
            .AsSplitQuery()
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw NotFound();

        var logs = await _dbContext.AuditLogs.AsNoTracking()
            .Where(log => log.Entity == "Pet" && log.EntityId == petId)
            .OrderByDescending(log => log.CreatedAt)
            .Take(100)
            .ToListAsync(cancellationToken);
        var actorIds = logs.Where(log => log.ActorId.HasValue).Select(log => log.ActorId!.Value).Distinct().ToArray();
        var actorNames = actorIds.Length == 0
            ? new Dictionary<Guid, string>()
            : await _dbContext.AdminUsers.AsNoTracking()
                .Where(admin => actorIds.Contains(admin.Id))
                .Select(admin => new { admin.Id, admin.User.DisplayName })
                .ToDictionaryAsync(item => item.Id, item => item.DisplayName, cancellationToken);

        var setting = pet.SafetySetting;
        var phone = PetDtoMapper.ResolvePhone(pet);
        var whatsapp = PetDtoMapper.ResolveWhatsapp(pet);
        var emergencyContact = PetDtoMapper.NormalizeOptional(pet.Contact?.EmergencyContactE164);

        return new AdminPetProfileDetailResponse(
            ToItem(pet),
            pet.Color,
            pet.Birthday,
            pet.EstimatedBirthYear,
            pet.AdoptionDay,
            PetDtoMapper.ResolvePublicMediaUrl(pet.CoverMediaFile, _publicMediaBaseUrl),
            PetDtoMapper.ResolveGeneralArea(pet),
            PetDtoMapper.NormalizeOptional(pet.OwnerUser.PhoneE164),
            PetDtoMapper.NormalizeOptional(pet.OwnerUser.WhatsappE164),
            PetDtoMapper.ResolveOwnerDisplayName(pet),
            setting?.ShowPhone == true ? phone : null,
            setting?.ShowWhatsapp == true ? whatsapp : null,
            setting?.ShowPhone == true ? emergencyContact : null,
            pet.PublicProfile?.ShowOwnerName ?? false,
            pet.PublicProfile?.ShowGeneralArea ?? false,
            setting?.ShowPhone ?? false,
            setting?.ShowWhatsapp ?? false,
            setting?.ShowEmergencyNote ?? false,
            pet.PublicProfile?.ShowHealthSummary ?? false,
            pet.PublicProfile?.ShowAllergiesOnPublicProfile ?? false,
            PetDtoMapper.ParseAllergies(pet.AllergiesJson),
            pet.SafetyNote,
            pet.EmergencyNote,
            pet.LostLastSeenArea,
            pet.LostMessage,
            pet.LostRewardNote,
            pet.LostExtraContactInstruction,
            pet.MemorialPassedAwayDate,
            pet.MemorialMessage,
            pet.ShowMemorialOnPublicProfile,
            pet.SmartTags
                .Where(tag => tag.DeletedAt == null)
                .OrderByDescending(tag => tag.UpdatedAt)
                .Select(tag => new AdminPetTagSummaryResponse(
                    tag.Id, tag.TagCode, tag.HasNfc, tag.Variant, tag.Status,
                    tag.ArchivedAt.HasValue || tag.Status == SmartTagStatus.Archived,
                    tag.ActivatedAt, tag.LastScannedAt))
                .ToArray(),
            logs.Select(log => new AdminPetHistoryItemResponse(
                    log.Action,
                    log.ActorType,
                    log.ActorId.HasValue && actorNames.TryGetValue(log.ActorId.Value, out var name) ? name : null,
                    DescribeAudit(log.NewValue),
                    log.CreatedAt))
                .ToArray());
    }

    public async Task<AdminTagInventoryExport> ExportAsync(
        Guid? currentUserId,
        AdminPetProfileQuery query,
        string? format,
        IReadOnlyCollection<Guid>? petIds,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var normalizedFormat = NormalizeOptional(format)?.ToLowerInvariant() ?? "csv";
        if (normalizedFormat is not ("csv" or "xlsx"))
        {
            throw ValidationFailed("format", "Choose CSV or Excel for the export.");
        }

        var filtered = BuildFilteredQuery(query, includeView: true);
        if (petIds is { Count: > 0 })
        {
            filtered = filtered.Where(pet => petIds.Contains(pet.Id));
        }

        var count = await filtered.CountAsync(cancellationToken);
        if (count > MaxExportRows)
        {
            throw ValidationFailed("filters", $"Narrow the filters to {MaxExportRows} rows or fewer before exporting.");
        }

        var pets = await IncludeSupportGraph(ApplySort(filtered, query.SortBy, query.SortDir))
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        var rows = pets.Select(ToItem).ToArray();

        _auditLogService.Append(
            admin.Id,
            ActorType.Admin,
            "pet-profiles.export",
            "Pet",
            null,
            null,
            new { format = normalizedFormat, rowCount = rows.Length, selectedRowsOnly = petIds is { Count: > 0 } });
        await _dbContext.SaveChangesAsync(cancellationToken);

        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmm");
        return normalizedFormat == "xlsx"
            ? new AdminTagInventoryExport(
                $"mypetlink-pet-profiles-{stamp}.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                BuildXlsx(rows))
            : new AdminTagInventoryExport(
                $"mypetlink-pet-profiles-{stamp}.csv",
                "text/csv",
                Encoding.UTF8.GetBytes(BuildCsv(rows)));
    }

    private IQueryable<Pet> BuildFilteredQuery(AdminPetProfileQuery query, bool includeView)
    {
        var pets = _dbContext.Pets.AsNoTracking().Where(pet => pet.DeletedAt == null);
        var search = NormalizeOptional(query.Search);
        if (search is not null)
        {
            pets = pets.Where(pet =>
                pet.Name.Contains(search)
                || pet.Species.Contains(search)
                || (pet.CustomSpecies != null && pet.CustomSpecies.Contains(search))
                || (pet.Breed != null && pet.Breed.Contains(search))
                || pet.Slug.Contains(search)
                || pet.OwnerUser.DisplayName.Contains(search)
                || (pet.OwnerUser.OwnerProfile != null && pet.OwnerUser.OwnerProfile.OwnerDisplayName.Contains(search))
                || pet.OwnerUser.Email.Contains(search)
                || (pet.OwnerUser.PhoneE164 != null && pet.OwnerUser.PhoneE164.Contains(search))
                || (pet.OwnerUser.WhatsappE164 != null && pet.OwnerUser.WhatsappE164.Contains(search))
                || (pet.Contact != null && pet.Contact.PhoneE164 != null && pet.Contact.PhoneE164.Contains(search))
                || (pet.Contact != null && pet.Contact.WhatsappE164 != null && pet.Contact.WhatsappE164.Contains(search))
                || (pet.PublicProfile != null && (pet.PublicProfile.PublicCode.Contains(search) || pet.PublicProfile.SlugSnapshot.Contains(search)))
                || (pet.SafetySetting != null && pet.SafetySetting.SafetyCode.Contains(search))
                || _dbContext.SmartTags.Any(tag => tag.PetId == pet.Id && tag.DeletedAt == null && tag.TagCode.Contains(search))
                || _dbContext.TagOrders.Any(order => order.PetId == pet.Id && order.OrderNumber.Contains(search)));
        }

        if (includeView && NormalizeOptional(query.View)?.ToLowerInvariant() is { } view)
        {
            pets = view switch
            {
                "active" => pets.Where(pet => pet.LifecycleStatus == PetLifecycleStatus.Active),
                "lost-mode" => pets.Where(pet => pet.LifecycleStatus == PetLifecycleStatus.Active && pet.LostModeEnabled),
                "memorial" => pets.Where(pet => pet.LifecycleStatus == PetLifecycleStatus.Memorial),
                "archived" => pets.Where(pet => pet.LifecycleStatus == PetLifecycleStatus.Archived),
                "all" => pets,
                _ => throw ValidationFailed("view", "Pet profile view is not supported.")
            };
        }

        if (NormalizeOptional(query.Lifecycle) is { } lifecycle)
        {
            var parsed = ParseEnum<PetLifecycleStatus>(lifecycle, "lifecycle", "Pet lifecycle is not supported.");
            pets = pets.Where(pet => pet.LifecycleStatus == parsed);
        }
        if (query.LostMode.HasValue) pets = pets.Where(pet => pet.LostModeEnabled == query.LostMode.Value);
        if (query.HasLastSeen.HasValue)
            pets = query.HasLastSeen.Value
                ? pets.Where(pet => pet.LostLastSeenDateTime.HasValue || (pet.LostLastSeenArea != null && pet.LostLastSeenArea != ""))
                : pets.Where(pet => !pet.LostLastSeenDateTime.HasValue && (pet.LostLastSeenArea == null || pet.LostLastSeenArea == ""));
        if (NormalizeOptional(query.PetType) is { } petType)
            pets = pets.Where(pet => pet.Species == petType || pet.CustomSpecies == petType);
        if (NormalizeOptional(query.Breed) is { } breed)
            pets = pets.Where(pet => pet.Breed != null && pet.Breed.Contains(breed));
        if (NormalizeOptional(query.Gender) is { } gender)
            pets = pets.Where(pet => pet.Gender == gender);
        if (NormalizeOptional(query.AgeMode)?.ToLowerInvariant() is { } ageMode)
        {
            pets = ageMode switch
            {
                "exact" => pets.Where(pet => pet.Birthday.HasValue),
                "estimated" => pets.Where(pet => !pet.Birthday.HasValue && pet.EstimatedBirthYear.HasValue),
                "unknown" => pets.Where(pet => !pet.Birthday.HasValue && !pet.EstimatedBirthYear.HasValue),
                _ => throw ValidationFailed("ageMode", "Age information type is not supported.")
            };
        }

        if (NormalizeOptional(query.PublicProfile)?.ToLowerInvariant() is { } publicStatus)
        {
            pets = publicStatus switch
            {
                "accessible" => pets.Where(IsPublicProfileAccessibleExpression()),
                "setup-issue" => pets.Where(HasPublicProfileIssueExpression()),
                "unavailable" => pets.Where(IsPublicProfileUnavailableExpression()),
                _ => throw ValidationFailed("publicProfile", "Public Profile status is not supported.")
            };
        }
        if (query.ShowAllergiesPublicly.HasValue)
            pets = pets.Where(pet => pet.PublicProfile != null
                && pet.PublicProfile.ShowAllergiesOnPublicProfile == query.ShowAllergiesPublicly.Value);
        if (NormalizeOptional(query.ProfileTheme) is { } profileTheme)
            pets = pets.Where(pet => pet.ProfileTheme == profileTheme);
        if (query.HasProfilePhoto.HasValue)
            pets = query.HasProfilePhoto.Value
                ? pets.Where(pet => pet.ProfileMediaFile != null
                    && pet.ProfileMediaFile.IsPublic
                    && pet.ProfileMediaFile.UploadStatus == MediaUploadStatus.Ready
                    && !pet.ProfileMediaFile.DeletedAt.HasValue)
                : pets.Where(pet => pet.ProfileMediaFile == null
                    || !pet.ProfileMediaFile.IsPublic
                    || pet.ProfileMediaFile.UploadStatus != MediaUploadStatus.Ready
                    || pet.ProfileMediaFile.DeletedAt.HasValue);
        if (query.HasCoverPhoto.HasValue)
            pets = query.HasCoverPhoto.Value
                ? pets.Where(pet => pet.CoverMediaFile != null
                    && pet.CoverMediaFile.IsPublic
                    && pet.CoverMediaFile.UploadStatus == MediaUploadStatus.Ready
                    && !pet.CoverMediaFile.DeletedAt.HasValue)
                : pets.Where(pet => pet.CoverMediaFile == null
                    || !pet.CoverMediaFile.IsPublic
                    || pet.CoverMediaFile.UploadStatus != MediaUploadStatus.Ready
                    || pet.CoverMediaFile.DeletedAt.HasValue);

        if (NormalizeOptional(query.QrSafety)?.ToLowerInvariant() is { } qrStatus)
        {
            pets = qrStatus switch
            {
                "accessible" => pets.Where(IsQrSafetyAccessibleExpression()),
                "setup-issue" => pets.Where(HasQrSafetyIssueExpression()),
                "unavailable" => pets.Where(IsQrSafetyUnavailableExpression()),
                _ => throw ValidationFailed("qrSafety", "QR Safety status is not supported.")
            };
        }
        if (query.HasFinderContact.HasValue)
            pets = query.HasFinderContact.Value
                ? pets.Where(HasFinderContactExpression())
                : pets.Where(HasNoFinderContactExpression());
        if (query.HasAllergies.HasValue)
            pets = query.HasAllergies.Value
                ? pets.Where(pet => pet.AllergiesJson.StartsWith("[")
                    && pet.AllergiesJson.EndsWith("]")
                    && pet.AllergiesJson.Contains("\""))
                : pets.Where(pet => !pet.AllergiesJson.StartsWith("[")
                    || !pet.AllergiesJson.EndsWith("]")
                    || !pet.AllergiesJson.Contains("\""));
        if (query.HasEmergencyNote.HasValue)
            pets = query.HasEmergencyNote.Value
                ? pets.Where(pet => pet.EmergencyNote != null && pet.EmergencyNote != "")
                : pets.Where(pet => pet.EmergencyNote == null || pet.EmergencyNote == "");

        if (NormalizeOptional(query.TagState)?.ToLowerInvariant() is { } tagState)
        {
            pets = tagState switch
            {
                "any" => pets.Where(pet => _dbContext.SmartTags.Any(tag => tag.PetId == pet.Id && tag.DeletedAt == null)),
                "none" => pets.Where(pet => !_dbContext.SmartTags.Any(tag => tag.PetId == pet.Id && tag.DeletedAt == null)),
                "active" => pets.Where(pet => _dbContext.SmartTags.Any(tag => tag.PetId == pet.Id && tag.DeletedAt == null && tag.ArchivedAt == null && tag.Status == SmartTagStatus.Active)),
                "inactive-only" => pets.Where(pet =>
                    _dbContext.SmartTags.Any(tag => tag.PetId == pet.Id && tag.DeletedAt == null)
                    && !_dbContext.SmartTags.Any(tag => tag.PetId == pet.Id && tag.DeletedAt == null && tag.ArchivedAt == null && tag.Status == SmartTagStatus.Active)),
                _ => throw ValidationFailed("tagState", "Smart Tag relationship is not supported.")
            };
        }
        if (NormalizeOptional(query.TagType)?.Replace("_", "", StringComparison.Ordinal).ToLowerInvariant() is { } tagType)
        {
            var hasNfc = tagType switch
            {
                "qr" => false,
                "qrnfc" or "nfc" => true,
                _ => throw ValidationFailed("tagType", "Smart Tag type is not supported.")
            };
            pets = pets.Where(pet => _dbContext.SmartTags.Any(tag =>
                tag.PetId == pet.Id && tag.DeletedAt == null && tag.HasNfc == hasNfc));
        }

        if (query.OwnerId.HasValue) pets = pets.Where(pet => pet.OwnerUserId == query.OwnerId.Value);
        if (NormalizeOptional(query.Owner) is { } owner)
            pets = pets.Where(pet => pet.OwnerUser.DisplayName.Contains(owner)
                || pet.OwnerUser.Email.Contains(owner)
                || (pet.OwnerUser.OwnerProfile != null && pet.OwnerUser.OwnerProfile.OwnerDisplayName.Contains(owner)));

        ValidateRange(query.CreatedFrom, query.CreatedTo, "createdFrom");
        ValidateRange(query.UpdatedFrom, query.UpdatedTo, "updatedFrom");
        if (query.CreatedFrom.HasValue) pets = pets.Where(pet => pet.CreatedAt >= query.CreatedFrom);
        if (query.CreatedTo.HasValue) pets = pets.Where(pet => pet.CreatedAt <= query.CreatedTo);
        if (query.UpdatedFrom.HasValue) pets = pets.Where(pet => pet.UpdatedAt >= query.UpdatedFrom);
        if (query.UpdatedTo.HasValue) pets = pets.Where(pet => pet.UpdatedAt <= query.UpdatedTo);

        return pets;
    }

    private IQueryable<Pet> IncludeSupportGraph(IQueryable<Pet> pets)
        => pets
            .Include(pet => pet.OwnerUser).ThenInclude(owner => owner.OwnerProfile)
            .Include(pet => pet.Contact)
            .Include(pet => pet.PublicProfile)
            .Include(pet => pet.SafetySetting)
            .Include(pet => pet.ProfileMediaFile)
            .Include(pet => pet.CoverMediaFile)
            .Include(pet => pet.SmartTags);

    private static IQueryable<Pet> ApplySort(IQueryable<Pet> pets, string? sortBy, string? sortDir)
    {
        var direction = NormalizeOptional(sortDir)?.ToLowerInvariant() ?? "desc";
        if (direction is not ("asc" or "desc"))
            throw ValidationFailed("sortDir", "Sort direction must be ascending or descending.");
        var descending = direction == "desc";
        var field = NormalizeOptional(sortBy)?.ToLowerInvariant() ?? "updatedat";
        IOrderedQueryable<Pet> ordered = field switch
        {
            "name" => Order(pets, pet => pet.Name, descending),
            "owner" => Order(pets, pet => pet.OwnerUser.DisplayName, descending),
            "pettype" => Order(pets, pet => pet.Species, descending),
            "lifecycle" => Order(pets, pet => pet.LifecycleStatus, descending),
            "lostmode" => Order(pets, pet => pet.LostModeEnabled, descending),
            "createdat" => Order(pets, pet => pet.CreatedAt, descending),
            "updatedat" => Order(pets, pet => pet.UpdatedAt, descending),
            "lastseenat" => Order(pets, pet => pet.LostLastSeenDateTime, descending),
            "smarttagcount" => Order(pets, pet => pet.SmartTags.Count(tag => tag.DeletedAt == null), descending),
            _ => throw ValidationFailed("sortBy", "Sorting by this field is not supported.")
        };
        return ordered.ThenBy(pet => pet.Id);
    }

    private AdminPetProfileItemResponse ToItem(Pet pet)
    {
        var age = PetAgeCalculator.Calculate(pet.Birthday, pet.EstimatedBirthYear);
        var tags = pet.SmartTags.Where(tag => tag.DeletedAt == null).ToArray();
        var publicAccessible = IsPublicProfileAccessible(pet);
        var qrAccessible = IsQrSafetyAccessible(pet);

        return new AdminPetProfileItemResponse(
            pet.Id,
            pet.Name,
            pet.Species,
            pet.CustomSpecies,
            pet.Breed,
            pet.Gender,
            pet.Birthday.HasValue ? "Exact birthday" : pet.EstimatedBirthYear.HasValue ? "Estimated birth year" : "Unknown",
            age.DisplayLabel,
            PetDtoMapper.ResolvePublicMediaUrl(pet.ProfileMediaFile, _publicMediaBaseUrl),
            pet.OwnerUserId,
            PetDtoMapper.NormalizeOptional(pet.OwnerUser.OwnerProfile?.OwnerDisplayName)
                ?? PetDtoMapper.NormalizeOptional(pet.OwnerUser.DisplayName)
                ?? pet.OwnerUser.Email,
            pet.OwnerUser.Email,
            pet.LifecycleStatus,
            pet.LostModeEnabled && pet.LifecycleStatus == PetLifecycleStatus.Active,
            pet.LostLastSeenDateTime,
            pet.PublicProfile?.IsPublicProfileEnabled ?? false,
            publicAccessible,
            HasPublicProfileIssue(pet),
            pet.PublicProfile is null ? null : PetDtoMapper.ResolvePublicSlug(pet),
            PetDtoMapper.NormalizeOptional(pet.PublicProfile?.PublicCode),
            pet.ProfileTheme,
            pet.SafetySetting?.QrSafetyEnabled ?? false,
            qrAccessible,
            HasQrSafetyIssue(pet),
            PetDtoMapper.NormalizeOptional(pet.SafetySetting?.SafetyCode),
            HasFinderContact(pet),
            PetDtoMapper.ParseAllergies(pet.AllergiesJson).Count > 0,
            pet.PublicProfile?.ShowAllergiesOnPublicProfile ?? false,
            tags.Count(tag => tag.ArchivedAt == null && tag.Status == SmartTagStatus.Active),
            tags.Length,
            pet.CreatedAt,
            pet.UpdatedAt);
    }

    private static Expression<Func<Pet, bool>> IsPublicProfileAccessibleExpression()
        => pet => pet.PublicProfile != null
            && pet.PublicProfile.IsPublicProfileEnabled
            && pet.PublicProfile.PublicCode != ""
            && (pet.PublicProfile.SlugSnapshot != "" || pet.Slug != "")
            && pet.LifecycleStatus != PetLifecycleStatus.Archived
            && (pet.LifecycleStatus != PetLifecycleStatus.Memorial || pet.ShowMemorialOnPublicProfile);

    private static bool IsPublicProfileAccessible(Pet pet)
        => pet.PublicProfile?.IsPublicProfileEnabled == true
            && !string.IsNullOrWhiteSpace(pet.PublicProfile.PublicCode)
            && (!string.IsNullOrWhiteSpace(pet.PublicProfile.SlugSnapshot) || !string.IsNullOrWhiteSpace(pet.Slug))
            && pet.LifecycleStatus != PetLifecycleStatus.Archived
            && (pet.LifecycleStatus != PetLifecycleStatus.Memorial || pet.ShowMemorialOnPublicProfile);

    private static Expression<Func<Pet, bool>> IsPublicProfileUnavailableExpression()
        => pet => pet.PublicProfile == null
            || !pet.PublicProfile.IsPublicProfileEnabled
            || (pet.LifecycleStatus == PetLifecycleStatus.Memorial && !pet.ShowMemorialOnPublicProfile);

    private static Expression<Func<Pet, bool>> HasPublicProfileIssueExpression()
        => pet => pet.PublicProfile != null
            && pet.PublicProfile.IsPublicProfileEnabled
            && (pet.PublicProfile.PublicCode == ""
                || (pet.PublicProfile.SlugSnapshot == "" && pet.Slug == "")
                || pet.LifecycleStatus == PetLifecycleStatus.Archived);

    private static bool HasPublicProfileIssue(Pet pet)
        => pet.PublicProfile?.IsPublicProfileEnabled == true
            && (string.IsNullOrWhiteSpace(pet.PublicProfile.PublicCode)
                || (string.IsNullOrWhiteSpace(pet.PublicProfile.SlugSnapshot) && string.IsNullOrWhiteSpace(pet.Slug))
                || pet.LifecycleStatus == PetLifecycleStatus.Archived);

    private static Expression<Func<Pet, bool>> IsQrSafetyAccessibleExpression()
        => pet => pet.SafetySetting != null
            && pet.SafetySetting.QrSafetyEnabled
            && pet.SafetySetting.SafetyCode != ""
            && pet.LifecycleStatus != PetLifecycleStatus.Archived;

    private static bool IsQrSafetyAccessible(Pet pet)
        => pet.SafetySetting?.QrSafetyEnabled == true
            && !string.IsNullOrWhiteSpace(pet.SafetySetting.SafetyCode)
            && pet.LifecycleStatus != PetLifecycleStatus.Archived;

    private static Expression<Func<Pet, bool>> IsQrSafetyUnavailableExpression()
        => pet => pet.SafetySetting == null || !pet.SafetySetting.QrSafetyEnabled;

    private static Expression<Func<Pet, bool>> HasQrSafetyIssueExpression()
        => pet => pet.SafetySetting != null
            && pet.SafetySetting.QrSafetyEnabled
            && (pet.SafetySetting.SafetyCode == "" || pet.LifecycleStatus == PetLifecycleStatus.Archived);

    private static bool HasQrSafetyIssue(Pet pet)
        => pet.SafetySetting?.QrSafetyEnabled == true
            && (string.IsNullOrWhiteSpace(pet.SafetySetting.SafetyCode)
                || pet.LifecycleStatus == PetLifecycleStatus.Archived);

    private static Expression<Func<Pet, bool>> HasFinderContactExpression()
        => pet => pet.SafetySetting != null && (
            (pet.SafetySetting.ShowPhone && (
                (pet.Contact != null && pet.Contact.UseOwnerDefaults == false && pet.Contact.PhoneE164 != null && pet.Contact.PhoneE164 != "")
                || ((pet.Contact == null || pet.Contact.UseOwnerDefaults)
                    && ((pet.Contact != null && pet.Contact.PhoneE164 != null && pet.Contact.PhoneE164 != "")
                        || (pet.OwnerUser.PhoneE164 != null && pet.OwnerUser.PhoneE164 != "")))
                || (pet.Contact != null && pet.Contact.EmergencyContactE164 != null && pet.Contact.EmergencyContactE164 != "")))
            || (pet.SafetySetting.ShowWhatsapp && (
                (pet.Contact != null && pet.Contact.UseOwnerDefaults == false && pet.Contact.WhatsappE164 != null && pet.Contact.WhatsappE164 != "")
                || ((pet.Contact == null || pet.Contact.UseOwnerDefaults)
                    && ((pet.Contact != null && pet.Contact.WhatsappE164 != null && pet.Contact.WhatsappE164 != "")
                        || (pet.OwnerUser.WhatsappE164 != null && pet.OwnerUser.WhatsappE164 != ""))))));

    private static Expression<Func<Pet, bool>> HasNoFinderContactExpression()
        => pet => pet.SafetySetting == null || !(
            (pet.SafetySetting.ShowPhone && (
                (pet.Contact != null && pet.Contact.UseOwnerDefaults == false && pet.Contact.PhoneE164 != null && pet.Contact.PhoneE164 != "")
                || ((pet.Contact == null || pet.Contact.UseOwnerDefaults)
                    && ((pet.Contact != null && pet.Contact.PhoneE164 != null && pet.Contact.PhoneE164 != "")
                        || (pet.OwnerUser.PhoneE164 != null && pet.OwnerUser.PhoneE164 != "")))
                || (pet.Contact != null && pet.Contact.EmergencyContactE164 != null && pet.Contact.EmergencyContactE164 != "")))
            || (pet.SafetySetting.ShowWhatsapp && (
                (pet.Contact != null && pet.Contact.UseOwnerDefaults == false && pet.Contact.WhatsappE164 != null && pet.Contact.WhatsappE164 != "")
                || ((pet.Contact == null || pet.Contact.UseOwnerDefaults)
                    && ((pet.Contact != null && pet.Contact.WhatsappE164 != null && pet.Contact.WhatsappE164 != "")
                        || (pet.OwnerUser.WhatsappE164 != null && pet.OwnerUser.WhatsappE164 != ""))))));

    private static bool HasFinderContact(Pet pet)
    {
        var setting = pet.SafetySetting;
        return setting is not null
            && ((setting.ShowPhone && (PetDtoMapper.ResolvePhone(pet) is not null
                    || PetDtoMapper.NormalizeOptional(pet.Contact?.EmergencyContactE164) is not null))
                || (setting.ShowWhatsapp && PetDtoMapper.ResolveWhatsapp(pet) is not null));
    }

    private static IOrderedQueryable<Pet> Order<TKey>(
        IQueryable<Pet> pets,
        Expression<Func<Pet, TKey>> key,
        bool descending)
        => descending ? pets.OrderByDescending(key) : pets.OrderBy(key);

    private static string BuildCsv(IReadOnlyList<AdminPetProfileItemResponse> rows)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', ExportHeaders.Select(Csv)));
        foreach (var row in rows) builder.AppendLine(string.Join(',', ExportRow(row).Select(Csv)));
        return builder.ToString();
    }

    private static byte[] BuildXlsx(IReadOnlyList<AdminPetProfileItemResponse> rows)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Pet Profiles");
        for (var column = 0; column < ExportHeaders.Length; column++)
        {
            sheet.Cell(1, column + 1).Value = ExportHeaders[column];
            sheet.Cell(1, column + 1).Style.Font.Bold = true;
        }
        for (var index = 0; index < rows.Count; index++)
        {
            var values = ExportRow(rows[index]);
            for (var column = 0; column < values.Length; column++)
                sheet.Cell(index + 2, column + 1).SetValue(values[column]);
        }
        sheet.SheetView.FreezeRows(1);
        sheet.Columns().AdjustToContents(1, Math.Min(rows.Count + 1, 200));
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static string[] ExportRow(AdminPetProfileItemResponse row)
    {
        var publicStatus = row.PublicProfileSetupIssue ? "Setup issue" : row.PublicProfileAccessible ? "Accessible" : "Unavailable";
        var qrStatus = row.QrSafetySetupIssue ? "Setup issue" : row.QrSafetyAccessible ? "Accessible" : "Unavailable";
        return
        [
            row.Name, row.OwnerName, row.OwnerEmail,
            string.IsNullOrWhiteSpace(row.CustomSpecies) ? row.Species : row.CustomSpecies,
            row.Breed ?? "", row.Gender ?? "", row.Lifecycle.ToString(), row.LostModeEnabled ? "On" : "Off",
            row.PublicProfileEnabled ? "Yes" : "No", publicStatus, row.PublicSlug ?? "",
            row.QrSafetyEnabled ? "Yes" : "No", qrStatus,
            row.ActiveSmartTagCount.ToString(), row.TotalSmartTagCount.ToString(), row.HasAllergies ? "Yes" : "No",
            ExportDate(row.CreatedAt), ExportDate(row.UpdatedAt)
        ];
    }

    private async Task<AdminUser> RequireAdminAsync(Guid? userId, CancellationToken cancellationToken)
    {
        if (!userId.HasValue)
            throw new ApiException(StatusCodes.Status401Unauthorized, "unauthorized", "Authentication is required.");
        return await _dbContext.AdminUsers.SingleOrDefaultAsync(
                item => item.UserId == userId && item.IsActive && item.DisabledAt == null,
                cancellationToken)
            ?? throw new ApiException(StatusCodes.Status403Forbidden, "forbidden", "Admin access is required.");
    }

    private static string? DescribeAudit(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            if (root.TryGetProperty("reason", out var reason) && reason.ValueKind == JsonValueKind.String)
                return PetDtoMapper.NormalizeOptional(reason.GetString());
            if (root.TryGetProperty("status", out var status) && status.ValueKind == JsonValueKind.String)
                return $"Status: {status.GetString()}";
        }
        catch (JsonException)
        {
            // Historical malformed audit JSON must never leak raw into the UI.
        }
        return null;
    }

    private static void ValidateRange(DateTimeOffset? from, DateTimeOffset? to, string field)
    {
        if (from.HasValue && to.HasValue && from > to)
            throw ValidationFailed(field, "The start of this date range must be before the end.");
    }

    private static T ParseEnum<T>(string value, string field, string message) where T : struct, Enum
        => Enum.TryParse<T>(value, true, out var parsed) ? parsed : throw ValidationFailed(field, message);
    private static string? NormalizeOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static string Csv(string value) => $"\"{value.Replace("\"", "\"\"")}\"";
    private static string ExportDate(DateTimeOffset? value) => value?.UtcDateTime.ToString("yyyy-MM-dd HH:mm") ?? "";
    private static ApiException NotFound() => new(
        StatusCodes.Status404NotFound, "pet_not_found", "This pet profile could not be found.");
    private static ApiException ValidationFailed(string field, string message) => new(
        StatusCodes.Status400BadRequest,
        "validation_failed",
        "Please check the submitted fields.",
        new Dictionary<string, string[]> { [field] = [message] });
}
