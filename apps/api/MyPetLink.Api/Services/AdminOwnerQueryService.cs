using System.Text;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Services;

// Read-only support projection for owner accounts. Full contact values are
// deliberately absent from list rows and only returned by the on-demand detail
// endpoint. No owner-controlled field is mutated here.
public sealed class AdminOwnerQueryService : SkeletonService, IAdminOwnerQueryService
{
    private const int MaxExportRows = 10_000;
    private static readonly string[] ExportHeaders =
    [
        "Owner Name", "Email", "Phone", "WhatsApp", "Contact Ready",
        "Account Status", "Plan", "Pet Count", "Order Count",
        "Active Smart Tag Count", "Joined At (UTC)", "Updated At (UTC)"
    ];

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;

    public AdminOwnerQueryService(MyPetLinkDbContext dbContext, IAuditLogService auditLogService)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
    }

    public async Task<(IReadOnlyCollection<AdminOwnerSupportItemResponse> Items, int Total)> ListAsync(
        AdminOwnerQuery query,
        CancellationToken cancellationToken = default)
    {
        var filtered = BuildFilteredQuery(query, includeStatus: true);
        var total = await filtered.CountAsync(cancellationToken);
        var projections = await Project(ApplySort(filtered, query.SortBy, query.SortDir))
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return (projections.Select(ToItem).ToArray(), total);
    }

    public async Task<AdminOwnerCountsResponse> CountAsync(
        AdminOwnerQuery query,
        CancellationToken cancellationToken = default)
    {
        var filtered = BuildFilteredQuery(query, includeStatus: false);
        var readyOwnerIds = ContactReadyUsers().Select(user => user.Id);

        return new AdminOwnerCountsResponse(
            await filtered.CountAsync(cancellationToken),
            await filtered.CountAsync(profile => profile.User.Status == UserStatus.Active, cancellationToken),
            await filtered.CountAsync(profile => profile.User.Status == UserStatus.Suspended, cancellationToken),
            await filtered.CountAsync(profile => !readyOwnerIds.Contains(profile.UserId), cancellationToken),
            await filtered.CountAsync(profile => !_dbContext.Pets.Any(pet => pet.OwnerUserId == profile.UserId && pet.DeletedAt == null), cancellationToken));
    }

    public async Task<AdminOwnerDetailResponseV2> GetAsync(
        Guid? currentUserId,
        Guid ownerUserId,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var profile = await _dbContext.OwnerProfiles
            .AsNoTracking()
            .Include(item => item.User).ThenInclude(user => user.ExternalLogins)
            .Include(item => item.Plan).ThenInclude(plan => plan.Limit)
            .SingleOrDefaultAsync(item => item.UserId == ownerUserId && item.ArchivedAt == null, cancellationToken)
            ?? throw NotFound("Owner account was not found.");

        var projection = await Project(_dbContext.OwnerProfiles.AsNoTracking().Where(item => item.UserId == ownerUserId))
            .SingleAsync(cancellationToken);
        var owner = ToItem(projection);

        var pets = await _dbContext.Pets.AsNoTracking()
            .Where(pet => pet.OwnerUserId == ownerUserId && pet.DeletedAt == null)
            .OrderByDescending(pet => pet.UpdatedAt)
            .Select(pet => new AdminOwnerPetSummaryResponse(
                pet.Id,
                pet.Name,
                pet.LifecycleStatus,
                pet.LifecycleStatus == PetLifecycleStatus.Active && pet.LostModeEnabled,
                pet.PublicProfile != null && pet.PublicProfile.IsPublicProfileEnabled
                    && (pet.PublicProfile.PublicCode == ""
                        || pet.PublicProfile.SlugSnapshot == ""
                        || pet.LifecycleStatus == PetLifecycleStatus.Archived
                        || (pet.LifecycleStatus == PetLifecycleStatus.Memorial && !pet.ShowMemorialOnPublicProfile)),
                pet.SafetySetting != null && pet.SafetySetting.QrSafetyEnabled
                    && (pet.SafetySetting.SafetyCode == "" || pet.LifecycleStatus == PetLifecycleStatus.Archived),
                pet.UpdatedAt))
            .Take(100)
            .ToListAsync(cancellationToken);

        var orders = await _dbContext.TagOrders.AsNoTracking()
            .Where(order => order.OwnerUserId == ownerUserId)
            .OrderByDescending(order => order.UpdatedAt)
            .Select(order => new AdminOwnerOrderSummaryResponse(
                order.Id, order.OrderNumber, order.Status, order.PaymentStatus,
                order.Amount + order.DeliveryFee, order.Currency, order.CreatedAt, order.UpdatedAt))
            .Take(20)
            .ToListAsync(cancellationToken);

        var proofs = await _dbContext.PaymentProofs.AsNoTracking()
            .Where(proof => proof.Order.OwnerUserId == ownerUserId)
            .OrderByDescending(proof => proof.UploadedAt)
            .Select(proof => new AdminOwnerPaymentProofSummaryResponse(
                proof.Id, proof.OrderId, proof.Order.OrderNumber, proof.Status,
                proof.UploadedAt, proof.ReviewedAt))
            .Take(20)
            .ToListAsync(cancellationToken);

        var tags = await _dbContext.SmartTags.AsNoTracking()
            .Where(tag => tag.OwnerUserId == ownerUserId && tag.DeletedAt == null)
            .OrderByDescending(tag => tag.UpdatedAt)
            .Select(tag => new AdminOwnerSmartTagSummaryResponse(
                tag.Id, tag.TagCode, tag.Status,
                tag.ArchivedAt.HasValue || tag.Status == SmartTagStatus.Archived,
                tag.CreatedAt, tag.UpdatedAt))
            .Take(100)
            .ToListAsync(cancellationToken);

        var highestMemoriesOnPet = await _dbContext.PetMemories.AsNoTracking()
            .Where(memory => memory.Pet.OwnerUserId == ownerUserId
                && memory.Pet.DeletedAt == null
                && memory.ArchivedAt == null)
            .GroupBy(memory => memory.PetId)
            .Select(group => (int?)group.Count())
            .MaxAsync(cancellationToken) ?? 0;

        var logs = await _dbContext.AuditLogs.AsNoTracking()
            .Where(log => (log.Entity == "User" && log.EntityId == ownerUserId)
                || (log.Entity == "OwnerProfile" && log.EntityId == profile.Id))
            .OrderByDescending(log => log.CreatedAt)
            .Take(50)
            .ToListAsync(cancellationToken);
        var actorIds = logs.Where(log => log.ActorId.HasValue).Select(log => log.ActorId!.Value).Distinct().ToArray();
        var actorNames = actorIds.Length == 0
            ? new Dictionary<Guid, string>()
            : await _dbContext.AdminUsers.AsNoTracking()
                .Where(admin => actorIds.Contains(admin.Id))
                .Select(admin => new { admin.Id, admin.User.DisplayName })
                .ToDictionaryAsync(item => item.Id, item => item.DisplayName, cancellationToken);

        var history = logs.Select(log => new AdminOwnerHistoryItemResponse(
                HumanizeAuditAction(log.Action),
                log.ActorId.HasValue && actorNames.TryGetValue(log.ActorId.Value, out var actorName)
                    ? actorName
                    : log.ActorType.ToString(),
                log.CreatedAt))
            .Concat(new[]
            {
                new AdminOwnerHistoryItemResponse("Owner account created", "Owner", profile.User.CreatedAt),
                new AdminOwnerHistoryItemResponse("Owner profile updated", "Owner", profile.UpdatedAt)
            })
            .Concat(profile.User.LastLoginAt.HasValue
                ? new[] { new AdminOwnerHistoryItemResponse("Last signed in", "Owner", profile.User.LastLoginAt.Value) }
                : Array.Empty<AdminOwnerHistoryItemResponse>())
            .OrderByDescending(item => item.CreatedAt)
            .Take(50)
            .ToArray();

        var maxMemories = profile.Plan.Limit?.MaxMemoriesPerPet ?? 0;
        var response = new AdminOwnerDetailResponseV2(
            owner,
            PhoneNumberRules.IsUsableE164(profile.User.PhoneE164) ? profile.User.PhoneE164 : null,
            PhoneNumberRules.IsUsableE164(profile.User.WhatsappE164) ? profile.User.WhatsappE164 : null,
            NormalizeOptional(profile.DefaultGeneralArea),
            PetDtoMapper.ParseVisibility(profile.PrivacyDefaultsJson),
            profile.User.ExternalLogins.Select(login => login.Provider).Where(value => !string.IsNullOrWhiteSpace(value)).Distinct().Order().ToArray(),
            highestMemoriesOnPet,
            maxMemories > 0 && highestMemoriesOnPet * 10 >= maxMemories * 8,
            pets,
            orders,
            proofs,
            tags,
            history);
        _auditLogService.Append(
            admin.Id,
            ActorType.Admin,
            "owners.detail-view",
            "OwnerProfile",
            profile.Id,
            null,
            new { ownerUserId });
        await _dbContext.SaveChangesAsync(cancellationToken);
        return response;
    }

    public async Task<AdminTagInventoryExport> ExportAsync(
        Guid? currentUserId,
        AdminOwnerQuery query,
        string? format,
        IReadOnlyCollection<Guid>? ownerIds,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var normalizedFormat = NormalizeOptional(format)?.ToLowerInvariant() ?? "csv";
        if (normalizedFormat is not ("csv" or "xlsx"))
            throw ValidationFailed("format", "Choose CSV or Excel for the export.");

        var filtered = BuildFilteredQuery(query, includeStatus: true);
        if (ownerIds is { Count: > 0 }) filtered = filtered.Where(profile => ownerIds.Contains(profile.UserId));
        var count = await filtered.CountAsync(cancellationToken);
        if (count > MaxExportRows)
            throw ValidationFailed("filters", $"Narrow the filters to {MaxExportRows} rows or fewer before exporting.");

        var projections = await Project(ApplySort(filtered, query.SortBy, query.SortDir)).ToListAsync(cancellationToken);
        var rows = projections.Select(ToExportRow).ToArray();

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "owners.export", "OwnerProfile", null, null,
            new { format = normalizedFormat, rowCount = rows.Length, selectedRowsOnly = ownerIds is { Count: > 0 } });
        await _dbContext.SaveChangesAsync(cancellationToken);

        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmm");
        return normalizedFormat == "xlsx"
            ? new AdminTagInventoryExport(
                $"mypetlink-owners-{stamp}.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                BuildXlsx(rows))
            : new AdminTagInventoryExport(
                $"mypetlink-owners-{stamp}.csv",
                "text/csv;charset=utf-8",
                Encoding.UTF8.GetBytes(BuildCsv(rows)));
    }

    private IQueryable<OwnerProfile> BuildFilteredQuery(AdminOwnerQuery query, bool includeStatus)
    {
        ValidateRange(query.JoinedFrom, query.JoinedTo, "joined");
        ValidateRange(query.UpdatedFrom, query.UpdatedTo, "updated");
        ValidateCountRange(query.PetCountMin, query.PetCountMax, "petCount");
        ValidateCountRange(query.OrderCountMin, query.OrderCountMax, "orderCount");

        var owners = _dbContext.OwnerProfiles.AsNoTracking().Where(profile => profile.ArchivedAt == null);
        var readyOwnerIds = ContactReadyUsers().Select(user => user.Id);
        var search = NormalizeOptional(query.Search);
        if (search is not null)
        {
            var normalizedEmail = search.ToUpperInvariant();
            var phone = PhoneNumberRules.NormalizeSupportSearch(search);
            owners = owners.Where(profile =>
                profile.OwnerDisplayName.Contains(search)
                || profile.User.DisplayName.Contains(search)
                || profile.User.NormalizedEmail.Contains(normalizedEmail)
                || (phone != null && ((profile.User.PhoneE164 != null && profile.User.PhoneE164.Contains(phone))
                    || (profile.User.WhatsappE164 != null && profile.User.WhatsappE164.Contains(phone))))
                || _dbContext.Pets.Any(pet => pet.OwnerUserId == profile.UserId && pet.DeletedAt == null && pet.Name.Contains(search))
                || _dbContext.TagOrders.Any(order => order.OwnerUserId == profile.UserId && order.OrderNumber.Contains(search))
                || _dbContext.SmartTags.Any(tag => tag.OwnerUserId == profile.UserId && tag.DeletedAt == null && tag.TagCode.Contains(search)));
        }

        if (includeStatus && NormalizeOptional(query.Status) is { } status)
        {
            var parsed = ParseEnum<UserStatus>(status, "status", "Account status is not supported.");
            owners = owners.Where(profile => profile.User.Status == parsed);
        }
        if (query.ContactReady.HasValue)
            owners = query.ContactReady.Value
                ? owners.Where(profile => readyOwnerIds.Contains(profile.UserId))
                : owners.Where(profile => !readyOwnerIds.Contains(profile.UserId));
        if (query.ProfileComplete.HasValue)
        {
            owners = query.ProfileComplete.Value
                ? owners.Where(profile => profile.OwnerDisplayName != "" && profile.DefaultGeneralArea != null
                    && profile.DefaultGeneralArea != "" && readyOwnerIds.Contains(profile.UserId))
                : owners.Where(profile => profile.OwnerDisplayName == "" || profile.DefaultGeneralArea == null
                    || profile.DefaultGeneralArea == "" || !readyOwnerIds.Contains(profile.UserId));
        }
        if (NormalizeOptional(query.AuthProvider) is { } provider)
            owners = owners.Where(profile => profile.User.ExternalLogins.Any(login => login.Provider == provider));

        var petCounts = _dbContext.Pets.Where(pet => pet.DeletedAt == null);
        if (query.HasPets.HasValue)
            owners = query.HasPets.Value
                ? owners.Where(profile => petCounts.Any(pet => pet.OwnerUserId == profile.UserId))
                : owners.Where(profile => !petCounts.Any(pet => pet.OwnerUserId == profile.UserId));
        if (query.PetCountMin.HasValue)
            owners = owners.Where(profile => petCounts.Count(pet => pet.OwnerUserId == profile.UserId) >= query.PetCountMin.Value);
        if (query.PetCountMax.HasValue)
            owners = owners.Where(profile => petCounts.Count(pet => pet.OwnerUserId == profile.UserId) <= query.PetCountMax.Value);
        if (query.HasActivePet.HasValue)
            owners = FilterAny(owners, query.HasActivePet.Value, profile => petCounts.Any(pet => pet.OwnerUserId == profile.UserId && pet.LifecycleStatus == PetLifecycleStatus.Active));
        if (query.HasArchivedOrMemorialPet.HasValue)
            owners = FilterAny(owners, query.HasArchivedOrMemorialPet.Value, profile => petCounts.Any(pet => pet.OwnerUserId == profile.UserId && pet.LifecycleStatus != PetLifecycleStatus.Active));
        if (query.HasLostModePet.HasValue)
            owners = FilterAny(owners, query.HasLostModePet.Value, profile => petCounts.Any(pet => pet.OwnerUserId == profile.UserId && pet.LifecycleStatus == PetLifecycleStatus.Active && pet.LostModeEnabled));

        var orders = _dbContext.TagOrders.AsNoTracking();
        if (query.HasOrders.HasValue)
            owners = query.HasOrders.Value
                ? owners.Where(profile => orders.Any(order => order.OwnerUserId == profile.UserId))
                : owners.Where(profile => !orders.Any(order => order.OwnerUserId == profile.UserId));
        if (query.OrderCountMin.HasValue)
            owners = owners.Where(profile => orders.Count(order => order.OwnerUserId == profile.UserId) >= query.OrderCountMin.Value);
        if (query.OrderCountMax.HasValue)
            owners = owners.Where(profile => orders.Count(order => order.OwnerUserId == profile.UserId) <= query.OrderCountMax.Value);
        if (query.HasPendingPayment.HasValue)
            owners = FilterAny(owners, query.HasPendingPayment.Value, profile => orders.Any(order => order.OwnerUserId == profile.UserId && order.PaymentStatus == PaymentStatus.Pending));
        if (query.HasPendingProof.HasValue)
            owners = FilterAny(owners, query.HasPendingProof.Value, profile => _dbContext.PaymentProofs.Any(proof => proof.Order.OwnerUserId == profile.UserId && proof.Status == PaymentProofStatus.PendingReview));
        if (query.HasActiveFulfilment.HasValue)
            owners = FilterAny(owners, query.HasActiveFulfilment.Value, profile => orders.Any(order => order.OwnerUserId == profile.UserId && (order.Status == OrderStatus.PaymentConfirmed || order.Status == OrderStatus.PreparingTag || order.Status == OrderStatus.Shipped)));
        if (query.HasDeliveredOrder.HasValue)
            owners = FilterAny(owners, query.HasDeliveredOrder.Value, profile => orders.Any(order => order.OwnerUserId == profile.UserId && order.Status == OrderStatus.Delivered));

        if (NormalizeOptional(query.TagState)?.ToLowerInvariant() is { } tagState)
        {
            var tags = _dbContext.SmartTags.Where(tag => tag.DeletedAt == null);
            owners = tagState switch
            {
                "any" => owners.Where(profile => tags.Any(tag => tag.OwnerUserId == profile.UserId)),
                "none" => owners.Where(profile => !tags.Any(tag => tag.OwnerUserId == profile.UserId)),
                "active" => owners.Where(profile => tags.Any(tag => tag.OwnerUserId == profile.UserId && tag.ArchivedAt == null && tag.Status == SmartTagStatus.Active)),
                "inactive-only" => owners.Where(profile => tags.Any(tag => tag.OwnerUserId == profile.UserId)
                    && !tags.Any(tag => tag.OwnerUserId == profile.UserId && tag.ArchivedAt == null && tag.Status == SmartTagStatus.Active)),
                _ => throw ValidationFailed("tagState", "Smart Tag relationship is not supported.")
            };
        }
        if (NormalizeOptional(query.Plan) is { } plan)
            owners = owners.Where(profile => profile.Plan.Code == plan);
        if (query.PetUsageNearLimit.HasValue)
        {
            owners = query.PetUsageNearLimit.Value
                ? owners.Where(profile => profile.Plan.Limit != null && profile.Plan.Limit.MaxPets > 0
                    && petCounts.Count(pet => pet.OwnerUserId == profile.UserId && pet.LifecycleStatus == PetLifecycleStatus.Active) * 10 >= profile.Plan.Limit.MaxPets * 8)
                : owners.Where(profile => profile.Plan.Limit == null || profile.Plan.Limit.MaxPets <= 0
                    || petCounts.Count(pet => pet.OwnerUserId == profile.UserId && pet.LifecycleStatus == PetLifecycleStatus.Active) * 10 < profile.Plan.Limit.MaxPets * 8);
        }
        if (query.MemoryUsageNearLimit.HasValue)
        {
            owners = FilterAny(owners, query.MemoryUsageNearLimit.Value, profile =>
                profile.Plan.Limit != null && profile.Plan.Limit.MaxMemoriesPerPet > 0
                && petCounts.Any(pet => pet.OwnerUserId == profile.UserId
                    && pet.Memories.Count(memory => memory.ArchivedAt == null) * 10 >= profile.Plan.Limit.MaxMemoriesPerPet * 8));
        }

        if (query.JoinedFrom.HasValue) owners = owners.Where(profile => profile.User.CreatedAt >= query.JoinedFrom.Value);
        if (query.JoinedTo.HasValue) owners = owners.Where(profile => profile.User.CreatedAt <= query.JoinedTo.Value);
        if (query.UpdatedFrom.HasValue) owners = owners.Where(profile => (profile.User.UpdatedAt > profile.UpdatedAt ? profile.User.UpdatedAt : profile.UpdatedAt) >= query.UpdatedFrom.Value);
        if (query.UpdatedTo.HasValue) owners = owners.Where(profile => (profile.User.UpdatedAt > profile.UpdatedAt ? profile.User.UpdatedAt : profile.UpdatedAt) <= query.UpdatedTo.Value);
        return owners;
    }

    private IQueryable<User> ContactReadyUsers()
        => _dbContext.Users.AsNoTracking().Where(user =>
            (user.PhoneE164 != null && user.PhoneE164.StartsWith("+")
                && user.PhoneE164.Length >= 8 && user.PhoneE164.Length <= 16
                && !EF.Functions.Like(user.PhoneE164.Substring(1), "%[^0-9]%")
                && !user.PhoneE164.StartsWith("+0"))
            || (user.WhatsappE164 != null && user.WhatsappE164.StartsWith("+")
                && user.WhatsappE164.Length >= 8 && user.WhatsappE164.Length <= 16
                && !EF.Functions.Like(user.WhatsappE164.Substring(1), "%[^0-9]%")
                && !user.WhatsappE164.StartsWith("+0")));

    private IQueryable<OwnerRowProjection> Project(IQueryable<OwnerProfile> owners)
    {
        var readyOwnerIds = ContactReadyUsers().Select(user => user.Id);
        var finderReadyPets = _dbContext.Pets.AsNoTracking().Where(pet =>
            pet.DeletedAt == null && pet.LifecycleStatus == PetLifecycleStatus.Active
            && pet.SafetySetting != null && pet.SafetySetting.QrSafetyEnabled
            && ((pet.SafetySetting.ShowPhone
                    && ((pet.Contact != null && pet.Contact.UseOwnerDefaults == false
                            && pet.Contact.PhoneE164 != null && pet.Contact.PhoneE164.StartsWith("+")
                            && pet.Contact.PhoneE164.Length >= 8 && pet.Contact.PhoneE164.Length <= 16
                            && !EF.Functions.Like(pet.Contact.PhoneE164.Substring(1), "%[^0-9]%")
                            && !pet.Contact.PhoneE164.StartsWith("+0"))
                        || ((pet.Contact == null || pet.Contact.UseOwnerDefaults)
                            && pet.OwnerUser.PhoneE164 != null && pet.OwnerUser.PhoneE164.StartsWith("+")
                            && pet.OwnerUser.PhoneE164.Length >= 8 && pet.OwnerUser.PhoneE164.Length <= 16
                            && !EF.Functions.Like(pet.OwnerUser.PhoneE164.Substring(1), "%[^0-9]%")
                            && !pet.OwnerUser.PhoneE164.StartsWith("+0"))))
                || (pet.SafetySetting.ShowWhatsapp
                    && ((pet.Contact != null && pet.Contact.UseOwnerDefaults == false
                            && pet.Contact.WhatsappE164 != null && pet.Contact.WhatsappE164.StartsWith("+")
                            && pet.Contact.WhatsappE164.Length >= 8 && pet.Contact.WhatsappE164.Length <= 16
                            && !EF.Functions.Like(pet.Contact.WhatsappE164.Substring(1), "%[^0-9]%")
                            && !pet.Contact.WhatsappE164.StartsWith("+0"))
                        || ((pet.Contact == null || pet.Contact.UseOwnerDefaults)
                            && pet.OwnerUser.WhatsappE164 != null && pet.OwnerUser.WhatsappE164.StartsWith("+")
                            && pet.OwnerUser.WhatsappE164.Length >= 8 && pet.OwnerUser.WhatsappE164.Length <= 16
                            && !EF.Functions.Like(pet.OwnerUser.WhatsappE164.Substring(1), "%[^0-9]%")
                            && !pet.OwnerUser.WhatsappE164.StartsWith("+0"))))));

        return owners.Select(profile => new OwnerRowProjection
        {
            OwnerUserId = profile.UserId,
            DisplayName = profile.OwnerDisplayName == "" ? profile.User.DisplayName : profile.OwnerDisplayName,
            Email = profile.User.Email,
            PhoneE164 = profile.User.PhoneE164,
            WhatsappE164 = profile.User.WhatsappE164,
            Status = profile.User.Status,
            PlanCode = profile.Plan.Code,
            PlanName = profile.Plan.Name,
            HasGeneralArea = profile.DefaultGeneralArea != null && profile.DefaultGeneralArea != "",
            ContactReady = readyOwnerIds.Contains(profile.UserId),
            FinderReadyPetCount = finderReadyPets.Count(pet => pet.OwnerUserId == profile.UserId),
            FinderContactIssuePetCount = _dbContext.Pets.Count(pet => pet.OwnerUserId == profile.UserId && pet.DeletedAt == null
                && pet.LifecycleStatus == PetLifecycleStatus.Active && pet.SafetySetting != null && pet.SafetySetting.QrSafetyEnabled)
                - finderReadyPets.Count(pet => pet.OwnerUserId == profile.UserId),
            PetCount = _dbContext.Pets.Count(pet => pet.OwnerUserId == profile.UserId && pet.DeletedAt == null),
            ActivePetCount = _dbContext.Pets.Count(pet => pet.OwnerUserId == profile.UserId && pet.DeletedAt == null && pet.LifecycleStatus == PetLifecycleStatus.Active),
            MemorialPetCount = _dbContext.Pets.Count(pet => pet.OwnerUserId == profile.UserId && pet.DeletedAt == null && pet.LifecycleStatus == PetLifecycleStatus.Memorial),
            ArchivedPetCount = _dbContext.Pets.Count(pet => pet.OwnerUserId == profile.UserId && pet.DeletedAt == null && pet.LifecycleStatus == PetLifecycleStatus.Archived),
            LostModePetCount = _dbContext.Pets.Count(pet => pet.OwnerUserId == profile.UserId && pet.DeletedAt == null && pet.LifecycleStatus == PetLifecycleStatus.Active && pet.LostModeEnabled),
            OrderCount = _dbContext.TagOrders.Count(order => order.OwnerUserId == profile.UserId),
            PendingPaymentOrderCount = _dbContext.TagOrders.Count(order => order.OwnerUserId == profile.UserId && order.PaymentStatus == PaymentStatus.Pending),
            PendingProofCount = _dbContext.PaymentProofs.Count(proof => proof.Order.OwnerUserId == profile.UserId && proof.Status == PaymentProofStatus.PendingReview),
            ActiveFulfilmentOrderCount = _dbContext.TagOrders.Count(order => order.OwnerUserId == profile.UserId && (order.Status == OrderStatus.PaymentConfirmed || order.Status == OrderStatus.PreparingTag || order.Status == OrderStatus.Shipped)),
            DeliveredOrderCount = _dbContext.TagOrders.Count(order => order.OwnerUserId == profile.UserId && order.Status == OrderStatus.Delivered),
            ActiveSmartTagCount = _dbContext.SmartTags.Count(tag => tag.OwnerUserId == profile.UserId && tag.DeletedAt == null && tag.ArchivedAt == null && tag.Status == SmartTagStatus.Active),
            TotalSmartTagCount = _dbContext.SmartTags.Count(tag => tag.OwnerUserId == profile.UserId && tag.DeletedAt == null),
            MemoryCount = _dbContext.PetMemories.Count(memory => memory.Pet.OwnerUserId == profile.UserId && memory.ArchivedAt == null),
            MaxPets = profile.Plan.Limit == null ? 0 : profile.Plan.Limit.MaxPets,
            MaxMemoriesPerPet = profile.Plan.Limit == null ? 0 : profile.Plan.Limit.MaxMemoriesPerPet,
            HighestMemoriesOnPet = _dbContext.PetMemories
                .Where(memory => memory.Pet.OwnerUserId == profile.UserId
                    && memory.Pet.DeletedAt == null
                    && memory.ArchivedAt == null)
                .GroupBy(memory => memory.PetId)
                .Select(group => (int?)group.Count())
                .Max() ?? 0,
            JoinedAt = profile.User.CreatedAt,
            UpdatedAt = profile.User.UpdatedAt > profile.UpdatedAt ? profile.User.UpdatedAt : profile.UpdatedAt,
            LastLoginAt = profile.User.LastLoginAt
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
        var field = NormalizeOptional(sortBy)?.ToLowerInvariant() ?? "joinedat";
        var sorted = field switch
        {
            "name" => Order(owners, profile => profile.OwnerDisplayName == "" ? profile.User.DisplayName : profile.OwnerDisplayName, descending),
            "email" => Order(owners, profile => profile.User.NormalizedEmail, descending),
            "joinedat" => Order(owners, profile => profile.User.CreatedAt, descending),
            "updatedat" => Order(owners, profile => profile.User.UpdatedAt > profile.UpdatedAt ? profile.User.UpdatedAt : profile.UpdatedAt, descending),
            "petcount" => Order(owners, profile => _dbContext.Pets.Count(pet => pet.OwnerUserId == profile.UserId && pet.DeletedAt == null), descending),
            "ordercount" => Order(owners, profile => _dbContext.TagOrders.Count(order => order.OwnerUserId == profile.UserId), descending),
            "activetagcount" => Order(owners, profile => _dbContext.SmartTags.Count(tag => tag.OwnerUserId == profile.UserId && tag.DeletedAt == null && tag.ArchivedAt == null && tag.Status == SmartTagStatus.Active), descending),
            "status" => Order(owners, profile => profile.User.Status, descending),
            "plan" => Order(owners, profile => profile.Plan.Code, descending),
            _ => throw ValidationFailed("sortBy", "Sorting by this field is not supported.")
        };
        return descending ? sorted.ThenByDescending(profile => profile.UserId) : sorted.ThenBy(profile => profile.UserId);
    }

    private static IOrderedQueryable<OwnerProfile> Order<TKey>(IQueryable<OwnerProfile> query, System.Linq.Expressions.Expression<Func<OwnerProfile, TKey>> key, bool descending)
        => descending ? query.OrderByDescending(key) : query.OrderBy(key);

    private static IQueryable<OwnerProfile> FilterAny(
        IQueryable<OwnerProfile> owners,
        bool expected,
        System.Linq.Expressions.Expression<Func<OwnerProfile, bool>> predicate)
        => expected ? owners.Where(predicate) : owners.Where(System.Linq.Expressions.Expression.Lambda<Func<OwnerProfile, bool>>(
            System.Linq.Expressions.Expression.Not(predicate.Body), predicate.Parameters));

    private static AdminOwnerSupportItemResponse ToItem(OwnerRowProjection row)
    {
        var phoneReady = PhoneNumberRules.IsUsableE164(row.PhoneE164);
        var whatsappReady = PhoneNumberRules.IsUsableE164(row.WhatsappE164);
        var contactReady = phoneReady || whatsappReady;
        var channel = phoneReady && whatsappReady ? "Phone and WhatsApp" : phoneReady ? "Phone" : whatsappReady ? "WhatsApp" : "No usable contact";
        var value = phoneReady ? row.PhoneE164 : whatsappReady ? row.WhatsappE164 : null;
        return new AdminOwnerSupportItemResponse(
            row.OwnerUserId, row.DisplayName, row.Email, row.Status, row.PlanCode, row.PlanName,
            !string.IsNullOrWhiteSpace(row.DisplayName) && row.HasGeneralArea && contactReady,
            contactReady,
            value is null ? channel : $"{channel} · {MaskPhone(value)}",
            row.FinderReadyPetCount, Math.Max(0, row.FinderContactIssuePetCount),
            row.PetCount, row.ActivePetCount, row.MemorialPetCount, row.ArchivedPetCount, row.LostModePetCount,
            row.OrderCount, row.PendingPaymentOrderCount, row.PendingProofCount,
            row.ActiveFulfilmentOrderCount, row.DeliveredOrderCount,
            row.ActiveSmartTagCount, row.TotalSmartTagCount, row.MemoryCount,
            row.MaxPets, row.MaxMemoriesPerPet,
            row.MaxPets > 0 && row.ActivePetCount * 10 >= row.MaxPets * 8,
            row.MaxMemoriesPerPet > 0 && row.HighestMemoriesOnPet * 10 >= row.MaxMemoriesPerPet * 8,
            row.JoinedAt, row.UpdatedAt, row.LastLoginAt);
    }

    private static string MaskPhone(string value)
    {
        var normalized = value.Trim();
        if (normalized.Length <= 7) return "••••";
        return $"{normalized[..Math.Min(3, normalized.Length)]} •••• {normalized[^4..]}";
    }

    private static string[] ToExportRow(OwnerRowProjection row)
    {
        var item = ToItem(row);
        return
        [
            item.DisplayName, item.Email,
            PhoneNumberRules.IsUsableE164(row.PhoneE164) ? row.PhoneE164! : "",
            PhoneNumberRules.IsUsableE164(row.WhatsappE164) ? row.WhatsappE164! : "",
            item.ContactReady ? "Yes" : "No", item.Status.ToString(), item.PlanCode,
            item.PetCount.ToString(), item.OrderCount.ToString(), item.ActiveSmartTagCount.ToString(),
            ExportDate(item.JoinedAt), ExportDate(item.UpdatedAt)
        ];
    }

    private static string BuildCsv(IReadOnlyList<string[]> rows)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', ExportHeaders.Select(Csv)));
        foreach (var row in rows) builder.AppendLine(string.Join(',', row.Select(Csv)));
        return builder.ToString();
    }

    private static byte[] BuildXlsx(IReadOnlyList<string[]> rows)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Owners");
        for (var column = 0; column < ExportHeaders.Length; column++)
        {
            sheet.Cell(1, column + 1).Value = ExportHeaders[column];
            sheet.Cell(1, column + 1).Style.Font.Bold = true;
        }
        for (var index = 0; index < rows.Count; index++)
            for (var column = 0; column < rows[index].Length; column++)
                sheet.Cell(index + 2, column + 1).SetValue(SpreadsheetSafe(rows[index][column]));
        sheet.SheetView.FreezeRows(1);
        sheet.Columns().AdjustToContents(1, Math.Min(rows.Count + 1, 200));
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static string Csv(string value) => AdminExportSanitizer.Csv(value);
    private static string SpreadsheetSafe(string value) => AdminExportSanitizer.SpreadsheetSafe(value);
    private static string ExportDate(DateTimeOffset value) => value.UtcDateTime.ToString("yyyy-MM-dd HH:mm");
    private static string HumanizeAuditAction(string value) => value.Replace('-', ' ').Replace('.', ' ');
    private static string? NormalizeOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private async Task<AdminUser> RequireAdminAsync(Guid? userId, CancellationToken cancellationToken)
    {
        if (!userId.HasValue)
            throw new ApiException(StatusCodes.Status401Unauthorized, "unauthorized", "Authentication is required.");
        return await _dbContext.AdminUsers.SingleOrDefaultAsync(
                item => item.UserId == userId && item.IsActive && item.DisabledAt == null,
                cancellationToken)
            ?? throw new ApiException(StatusCodes.Status403Forbidden, "forbidden", "Admin access is required.");
    }

    private static void ValidateRange(DateTimeOffset? from, DateTimeOffset? to, string field)
    {
        if (from.HasValue && to.HasValue && from > to)
            throw ValidationFailed(field, "The start of this date range must be before the end.");
    }
    private static void ValidateCountRange(int? min, int? max, string field)
    {
        if (min.HasValue && max.HasValue && min > max)
            throw ValidationFailed(field, "The minimum count must not exceed the maximum count.");
    }
    private static T ParseEnum<T>(string value, string field, string message) where T : struct, Enum
        => Enum.TryParse<T>(value.Trim(), true, out var parsed) ? parsed : throw ValidationFailed(field, message);
    private static ApiException NotFound(string message) => new(
        StatusCodes.Status404NotFound, "owner_not_found", message);
    private static ApiException ValidationFailed(string field, string message) => new(
        StatusCodes.Status400BadRequest,
        "validation_failed",
        "Please check the submitted fields.",
        new Dictionary<string, string[]> { [field] = [message] });

    private sealed class OwnerRowProjection
    {
        public Guid OwnerUserId { get; init; }
        public string DisplayName { get; init; } = "";
        public string Email { get; init; } = "";
        public string? PhoneE164 { get; init; }
        public string? WhatsappE164 { get; init; }
        public UserStatus Status { get; init; }
        public string PlanCode { get; init; } = "";
        public string PlanName { get; init; } = "";
        public bool HasGeneralArea { get; init; }
        public bool ContactReady { get; init; }
        public int FinderReadyPetCount { get; init; }
        public int FinderContactIssuePetCount { get; init; }
        public int PetCount { get; init; }
        public int ActivePetCount { get; init; }
        public int MemorialPetCount { get; init; }
        public int ArchivedPetCount { get; init; }
        public int LostModePetCount { get; init; }
        public int OrderCount { get; init; }
        public int PendingPaymentOrderCount { get; init; }
        public int PendingProofCount { get; init; }
        public int ActiveFulfilmentOrderCount { get; init; }
        public int DeliveredOrderCount { get; init; }
        public int ActiveSmartTagCount { get; init; }
        public int TotalSmartTagCount { get; init; }
        public int MemoryCount { get; init; }
        public int MaxPets { get; init; }
        public int MaxMemoriesPerPet { get; init; }
        public int HighestMemoriesOnPet { get; init; }
        public DateTimeOffset JoinedAt { get; init; }
        public DateTimeOffset UpdatedAt { get; init; }
        public DateTimeOffset? LastLoginAt { get; init; }
    }
}
