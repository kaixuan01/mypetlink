using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// Backend for the Admin Portal Phase 1 manual operations. Every mutation
// appends an AuditLogs row (via IAuditLogService) that is saved in the same
// SaveChanges as the mutation itself.
public sealed class AdminService : SkeletonService, IAdminService
{
    private const string DefaultShape = "Round";

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;

    public AdminService(MyPetLinkDbContext dbContext, IAuditLogService auditLogService)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
    }

    // --- Dashboard ------------------------------------------------------------

    public async Task<AdminDashboardResponse> GetDashboardAsync(CancellationToken cancellationToken = default)
    {
        var summary = new AdminDashboardSummaryResponse(
            TotalOwners: await _dbContext.OwnerProfiles
                .CountAsync(profile => profile.ArchivedAt == null, cancellationToken),
            TotalPets: await ActivePetsBase().CountAsync(cancellationToken),
            ActivePets: await ActivePetsBase()
                .CountAsync(pet => pet.LifecycleStatus == PetLifecycleStatus.Active, cancellationToken),
            MemorialPets: await ActivePetsBase()
                .CountAsync(pet => pet.LifecycleStatus == PetLifecycleStatus.Memorial, cancellationToken),
            LostModePets: await ActivePetsBase()
                .CountAsync(pet => pet.LifecycleStatus == PetLifecycleStatus.Active && pet.LostModeEnabled, cancellationToken),
            PendingPaymentProofs: await _dbContext.PaymentProofs
                .CountAsync(proof => proof.Status == PaymentProofStatus.PendingReview, cancellationToken),
            OrdersPendingPayment: await _dbContext.TagOrders
                .CountAsync(order => order.Status == OrderStatus.PendingPayment, cancellationToken),
            OrdersPreparing: await _dbContext.TagOrders
                .CountAsync(order =>
                    order.Status == OrderStatus.PaymentConfirmed
                    || order.Status == OrderStatus.PreparingTag, cancellationToken),
            OrdersShipped: await _dbContext.TagOrders
                .CountAsync(order => order.Status == OrderStatus.Shipped, cancellationToken),
            ActiveTags: await VisibleTagsBase()
                .CountAsync(tag =>
                    tag.Status == SmartTagStatus.Active
                    && tag.ArchivedAt == null
                    && tag.Pet != null
                    && tag.Pet.LifecycleStatus == PetLifecycleStatus.Active, cancellationToken),
            LostOrDisabledTags: await VisibleTagsBase()
                .CountAsync(tag =>
                    tag.ArchivedAt == null
                    && (tag.Status == SmartTagStatus.Lost || tag.Status == SmartTagStatus.Disabled), cancellationToken),
            UnclaimedTags: await VisibleTagsBase()
                .CountAsync(tag =>
                    tag.Status == SmartTagStatus.Unclaimed
                    && tag.PetId == null
                    && tag.ArchivedAt == null, cancellationToken));

        var recentOrders = await IncludeOrderGraph(_dbContext.TagOrders.AsNoTracking())
            .OrderByDescending(order => order.CreatedAt)
            .Take(5)
            .ToListAsync(cancellationToken);

        var recentProofs = await IncludeProofGraph(_dbContext.PaymentProofs.AsNoTracking())
            .OrderByDescending(proof => proof.UploadedAt)
            .Take(5)
            .ToListAsync(cancellationToken);

        var recentActivity = await _dbContext.AuditLogs
            .AsNoTracking()
            .OrderByDescending(log => log.CreatedAt)
            .Take(8)
            .ToListAsync(cancellationToken);

        return new AdminDashboardResponse(
            summary,
            recentOrders.Select(ToAdminOrderResponse).ToArray(),
            recentProofs.Select(ToAdminProofResponse).ToArray(),
            recentActivity.Select(ToAuditLogResponse).ToArray());
    }

    // --- Orders ----------------------------------------------------------------

    public async Task<(IReadOnlyCollection<AdminTagOrderResponse> Items, int Total)> ListOrdersAsync(
        int page,
        int pageSize,
        string? status,
        string? paymentStatus,
        Guid? petId,
        Guid? ownerId,
        string? tagType,
        string? search,
        CancellationToken cancellationToken = default)
    {
        var query = _dbContext.TagOrders.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = ParseEnum<OrderStatus>(status, "status", "Order status is not supported.");
            query = query.Where(order => order.Status == parsed);
        }

        if (!string.IsNullOrWhiteSpace(paymentStatus))
        {
            var parsed = ParseEnum<PaymentStatus>(paymentStatus, "paymentStatus", "Payment status is not supported.");
            query = query.Where(order => order.PaymentStatus == parsed);
        }

        if (petId.HasValue)
        {
            query = query.Where(order => order.PetId == petId.Value);
        }

        if (ownerId.HasValue)
        {
            query = query.Where(order => order.OwnerUserId == ownerId.Value);
        }

        if (!string.IsNullOrWhiteSpace(tagType))
        {
            var hasNfc = ParseTagType(tagType);
            query = query.Where(order =>
                order.TagType == (hasNfc ? TagType.QrNfcSmartTag : TagType.QrPetTag));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(order =>
                order.OrderNumber.Contains(term)
                || order.Pet.Name.Contains(term)
                || order.OwnerUser.Email.Contains(term)
                || order.OwnerUser.DisplayName.Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);
        var orders = await IncludeOrderGraph(query)
            .OrderByDescending(order => order.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (orders.Select(ToAdminOrderResponse).ToArray(), total);
    }

    public async Task<AdminTagOrderResponse> GetOrderAsync(Guid orderId, CancellationToken cancellationToken = default)
    {
        var order = await LoadOrderAsync(orderId, trackChanges: false, cancellationToken);
        return ToAdminOrderResponse(order);
    }

    public async Task<AdminTagOrderResponse> ConfirmPaymentAsync(
        Guid? currentUserId,
        Guid orderId,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        if (order.Status != OrderStatus.PaymentProofSubmitted)
        {
            throw InvalidState("Payment can only be confirmed after a payment proof is submitted.");
        }

        var pendingProof = LatestPendingProof(order)
            ?? throw InvalidState("There is no payment proof waiting for review on this order.");

        var oldState = OrderStateSnapshot(order);
        var now = DateTimeOffset.UtcNow;

        pendingProof.Status = PaymentProofStatus.Approved;
        pendingProof.ReviewedByAdminUserId = admin.Id;
        pendingProof.ReviewedAt = now;
        pendingProof.RejectionReason = null;

        order.Status = OrderStatus.PaymentConfirmed;
        order.PaymentStatus = PaymentStatus.Confirmed;
        order.PaymentConfirmedAt ??= now;
        order.TrackingStatus = "Payment confirmed. Tag preparation is next.";

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.confirm-payment", "TagOrder", order.Id,
            oldState, OrderStateSnapshot(order));

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToAdminOrderResponse(order);
    }

    public async Task<AdminTagOrderResponse> RejectPaymentProofAsync(
        Guid? currentUserId,
        Guid orderId,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        if (order.Status != OrderStatus.PaymentProofSubmitted)
        {
            throw InvalidState("Only orders with a submitted payment proof can be sent back for resubmission.");
        }

        var pendingProof = LatestPendingProof(order)
            ?? throw InvalidState("There is no payment proof waiting for review on this order.");

        var oldState = OrderStateSnapshot(order);
        var friendlyReason = NormalizeOptional(reason)
            ?? "We could not verify this payment proof. Please resubmit your receipt or screenshot.";

        pendingProof.Status = PaymentProofStatus.Rejected;
        pendingProof.ReviewedByAdminUserId = admin.Id;
        pendingProof.ReviewedAt = DateTimeOffset.UtcNow;
        pendingProof.RejectionReason = friendlyReason;

        order.Status = OrderStatus.PendingPayment;
        order.PaymentStatus = PaymentStatus.Rejected;
        order.TrackingStatus = "Payment proof needs to be resubmitted.";

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.reject-payment-proof", "TagOrder", order.Id,
            oldState, OrderStateSnapshot(order));

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToAdminOrderResponse(order);
    }

    public async Task<AdminTagOrderResponse> MarkOrderPreparingAsync(
        Guid? currentUserId,
        Guid orderId,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        if (order.Status != OrderStatus.PaymentConfirmed)
        {
            throw InvalidState("Orders can only start preparation after payment is confirmed.");
        }

        var oldState = OrderStateSnapshot(order);
        order.Status = OrderStatus.PreparingTag;
        order.TrackingStatus = "Tag is being prepared.";
        SyncPendingFamilyTag(order, SmartTagStatus.Preparing);

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.mark-preparing", "TagOrder", order.Id,
            oldState, OrderStateSnapshot(order));

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToAdminOrderResponse(order);
    }

    public async Task<AdminTagOrderResponse> MarkOrderShippedAsync(
        Guid? currentUserId,
        Guid orderId,
        string? trackingNumber,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        if (order.Status != OrderStatus.PreparingTag)
        {
            throw InvalidState("Orders can only be shipped after tag preparation has started.");
        }

        var oldState = OrderStateSnapshot(order);
        var now = DateTimeOffset.UtcNow;
        order.Status = OrderStatus.Shipped;
        order.ShippedAt ??= now;
        order.TrackingNumber = NormalizeOptional(trackingNumber) ?? order.TrackingNumber;
        order.TrackingStatus = string.IsNullOrWhiteSpace(order.City)
            ? "Tag is on the way."
            : $"On the way to {order.City}.";

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.mark-shipped", "TagOrder", order.Id,
            oldState, OrderStateSnapshot(order));

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToAdminOrderResponse(order);
    }

    public async Task<AdminTagOrderResponse> MarkOrderDeliveredAsync(
        Guid? currentUserId,
        Guid orderId,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        if (order.Status != OrderStatus.Shipped)
        {
            throw InvalidState("Orders can only be marked delivered after they are shipped.");
        }

        var oldState = OrderStateSnapshot(order);
        var now = DateTimeOffset.UtcNow;
        order.Status = OrderStatus.Delivered;
        order.DeliveredAt ??= now;
        order.TrackingStatus = string.IsNullOrWhiteSpace(order.City)
            ? "Delivered."
            : $"Delivered to {order.City}.";

        // The tag becomes Delivered and waits for the owner to activate it;
        // activation stays an owner action by product rule.
        var tag = SyncPendingFamilyTag(order, SmartTagStatus.Delivered);
        if (tag is not null)
        {
            tag.DeliveredAt ??= now;
        }

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.mark-delivered", "TagOrder", order.Id,
            oldState, OrderStateSnapshot(order));

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToAdminOrderResponse(order);
    }

    public async Task<AdminTagOrderResponse> CancelOrderAsync(
        Guid? currentUserId,
        Guid orderId,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        if (order.Status is OrderStatus.Shipped or OrderStatus.Delivered or OrderStatus.Cancelled)
        {
            throw InvalidState("Shipped, delivered, or already cancelled orders cannot be cancelled.");
        }

        var oldState = OrderStateSnapshot(order);
        var now = DateTimeOffset.UtcNow;
        order.Status = OrderStatus.Cancelled;
        order.CancelledAt ??= now;
        order.TrackingStatus = "Cancelled";

        if (order.SmartTag is not null
            && order.SmartTag.Status is SmartTagStatus.Pending or SmartTagStatus.Preparing or SmartTagStatus.Delivered)
        {
            order.SmartTag.Status = SmartTagStatus.Archived;
            order.SmartTag.ArchivedAt ??= now;
        }

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.cancel", "TagOrder", order.Id,
            oldState, OrderStateSnapshot(order));

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToAdminOrderResponse(order);
    }

    // --- Payment proofs ---------------------------------------------------------

    public async Task<(IReadOnlyCollection<AdminPaymentProofResponse> Items, int Total)> ListPaymentProofsAsync(
        int page,
        int pageSize,
        string? status,
        string? orderStatus,
        Guid? ownerId,
        string? search,
        CancellationToken cancellationToken = default)
    {
        var query = _dbContext.PaymentProofs.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = ParseEnum<PaymentProofStatus>(status, "status", "Payment proof status is not supported.");
            query = query.Where(proof => proof.Status == parsed);
        }

        if (!string.IsNullOrWhiteSpace(orderStatus))
        {
            var parsed = ParseEnum<OrderStatus>(orderStatus, "orderStatus", "Order status is not supported.");
            query = query.Where(proof => proof.Order.Status == parsed);
        }

        if (ownerId.HasValue)
        {
            query = query.Where(proof => proof.Order.OwnerUserId == ownerId.Value);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(proof =>
                proof.Order.OrderNumber.Contains(term)
                || proof.Order.OwnerUser.Email.Contains(term)
                || (proof.PaymentReference != null && proof.PaymentReference.Contains(term)));
        }

        var total = await query.CountAsync(cancellationToken);
        var proofs = await IncludeProofGraph(query)
            .OrderByDescending(proof => proof.UploadedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (proofs.Select(ToAdminProofResponse).ToArray(), total);
    }

    public async Task<AdminPaymentProofResponse> GetPaymentProofAsync(
        Guid paymentProofId,
        CancellationToken cancellationToken = default)
    {
        var proof = await IncludeProofGraph(_dbContext.PaymentProofs.AsNoTracking())
            .SingleOrDefaultAsync(item => item.Id == paymentProofId, cancellationToken)
            ?? throw NotFound("Payment proof was not found.");

        return ToAdminProofResponse(proof);
    }

    public async Task<AdminTagOrderResponse> ApprovePaymentProofAsync(
        Guid? currentUserId,
        Guid paymentProofId,
        CancellationToken cancellationToken = default)
    {
        var orderId = await ResolveProofOrderIdAsync(paymentProofId, cancellationToken);
        return await ConfirmPaymentAsync(currentUserId, orderId, cancellationToken);
    }

    public async Task<AdminTagOrderResponse> RejectPaymentProofByIdAsync(
        Guid? currentUserId,
        Guid paymentProofId,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var orderId = await ResolveProofOrderIdAsync(paymentProofId, cancellationToken);
        return await RejectPaymentProofAsync(currentUserId, orderId, reason, cancellationToken);
    }

    // --- Smart tags --------------------------------------------------------------

    public async Task<(IReadOnlyCollection<AdminSmartTagResponse> Items, int Total)> ListTagsAsync(
        int page,
        int pageSize,
        string? status,
        string? type,
        Guid? petId,
        Guid? ownerId,
        Guid? orderId,
        string? batchNumber,
        string? search,
        bool inventoryOnly,
        CancellationToken cancellationToken = default)
    {
        var query = VisibleTagsBase().AsNoTracking();

        if (inventoryOnly)
        {
            query = query.Where(tag => tag.BatchId != null || tag.Status == SmartTagStatus.Unclaimed);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = ParseEnum<SmartTagStatus>(status, "status", "Tag status is not supported.");
            query = parsed == SmartTagStatus.Archived
                ? query.Where(tag => tag.Status == parsed || tag.ArchivedAt != null)
                : query.Where(tag => tag.Status == parsed && tag.ArchivedAt == null);
        }

        if (!string.IsNullOrWhiteSpace(type))
        {
            var hasNfc = ParseTagType(type);
            query = query.Where(tag => tag.HasNfc == hasNfc);
        }

        if (petId.HasValue)
        {
            query = query.Where(tag => tag.PetId == petId.Value);
        }

        if (ownerId.HasValue)
        {
            query = query.Where(tag => tag.OwnerUserId == ownerId.Value);
        }

        if (orderId.HasValue)
        {
            query = query.Where(tag => tag.OrderId == orderId.Value);
        }

        if (!string.IsNullOrWhiteSpace(batchNumber))
        {
            var term = batchNumber.Trim();
            query = query.Where(tag => tag.Batch != null && tag.Batch.BatchNo == term);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(tag =>
                tag.TagCode.Contains(term)
                || (tag.Pet != null && tag.Pet.Name.Contains(term))
                || (tag.OwnerUser != null && tag.OwnerUser.Email.Contains(term)));
        }

        var total = await query.CountAsync(cancellationToken);
        var tags = await IncludeTagGraph(query)
            .OrderByDescending(tag => tag.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (tags.Select(ToAdminTagResponse).ToArray(), total);
    }

    public async Task<AdminSmartTagResponse> GetTagAsync(Guid tagId, CancellationToken cancellationToken = default)
    {
        var tag = await LoadTagAsync(tagId, trackChanges: false, cancellationToken);
        return ToAdminTagResponse(tag);
    }

    public async Task<AdminSmartTagResponse> UpdateTagStatusAsync(
        Guid? currentUserId,
        Guid tagId,
        string action,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var tag = await LoadTagAsync(tagId, trackChanges: true, cancellationToken);
        var oldState = TagStateSnapshot(tag);

        switch (action)
        {
            case "disable":
                EnsureTagStatus(tag, "disabled", SmartTagStatus.Active, SmartTagStatus.Delivered, SmartTagStatus.Unclaimed);
                tag.Status = SmartTagStatus.Disabled;
                break;
            case "mark-lost":
                EnsureTagStatus(tag, "marked lost", SmartTagStatus.Active, SmartTagStatus.Delivered);
                tag.Status = SmartTagStatus.Lost;
                break;
            case "replace":
                EnsureTagStatus(tag, "marked replaced", SmartTagStatus.Active, SmartTagStatus.Lost, SmartTagStatus.Disabled);
                tag.Status = SmartTagStatus.Replaced;
                break;
            case "archive":
                if (tag.ArchivedAt.HasValue)
                {
                    throw InvalidState("This tag is already archived.");
                }

                tag.ArchivedAt = DateTimeOffset.UtcNow;
                break;
            case "restore":
                if (!tag.ArchivedAt.HasValue && tag.Status != SmartTagStatus.Archived)
                {
                    throw InvalidState("Only archived tags can be restored.");
                }

                tag.ArchivedAt = null;
                if (tag.Status == SmartTagStatus.Archived)
                {
                    tag.Status = SmartTagStatus.Disabled;
                }

                break;
            default:
                throw ValidationFailed("action", "Tag action is not supported.");
        }

        _auditLogService.Append(
            admin.Id, ActorType.Admin, $"tag.{action}", "SmartTag", tag.Id,
            oldState, TagStateSnapshot(tag, NormalizeOptional(reason)));

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToAdminTagResponse(tag);
    }

    // --- Tag inventory -------------------------------------------------------------

    public async Task<AdminGenerateTagsResponse> GenerateTagInventoryAsync(
        Guid? currentUserId,
        AdminGenerateTagsRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var hasNfc = ParseTagType(request.TagType);
        var shape = NormalizeOptional(request.Shape) ?? DefaultShape;
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
            Shape = shape,
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
                Shape = shape,
                Status = SmartTagStatus.Unclaimed
            });
        }

        _dbContext.SmartTags.AddRange(tags);

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "tag-inventory.generate", "SmartTagBatch", batch.Id,
            null, new { batchNo, request.Quantity, tagType = hasNfc ? "QR_NFC" : "QR", shape });

        await _dbContext.SaveChangesAsync(cancellationToken);

        return new AdminGenerateTagsResponse(
            batchNo,
            tags.Count,
            tags.Select(TagDtoMapper.ToSmartTagResponse).ToArray());
    }

    public async Task<(string FileName, string Csv)> ExportTagInventoryCsvAsync(
        string? batchNumber,
        CancellationToken cancellationToken = default)
    {
        var query = VisibleTagsBase()
            .AsNoTracking()
            .Where(tag => tag.BatchId != null || tag.Status == SmartTagStatus.Unclaimed);
        var normalizedBatch = NormalizeOptional(batchNumber);

        if (normalizedBatch is not null)
        {
            query = query.Where(tag => tag.Batch != null && tag.Batch.BatchNo == normalizedBatch);
        }

        var tags = await query
            .Include(tag => tag.Batch)
            .OrderBy(tag => tag.Batch!.BatchNo)
            .ThenBy(tag => tag.TagCode)
            .ToListAsync(cancellationToken);

        var builder = new StringBuilder();
        builder.AppendLine("tag_code,tag_type,batch_number,status,created_at");

        foreach (var tag in tags)
        {
            builder.AppendLine(string.Join(',',
                CsvField(tag.TagCode),
                CsvField(tag.HasNfc ? "QR_NFC" : "QR"),
                CsvField(tag.Batch?.BatchNo ?? ""),
                CsvField(tag.ArchivedAt.HasValue ? "Archived" : tag.Status.ToString()),
                CsvField(tag.CreatedAt.UtcDateTime.ToString("yyyy-MM-dd HH:mm:ss"))));
        }

        var exportedBatches = await _dbContext.SmartTagBatches
            .Where(batch => normalizedBatch == null || batch.BatchNo == normalizedBatch)
            .ToListAsync(cancellationToken);
        var exportedAt = DateTimeOffset.UtcNow;

        foreach (var batch in exportedBatches)
        {
            batch.ExportedAt = exportedAt;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        var fileName = normalizedBatch is null
            ? "mypetlink-tag-inventory.csv"
            : $"mypetlink-tag-inventory-{normalizedBatch}.csv";

        return (fileName, builder.ToString());
    }

    // --- Owners ----------------------------------------------------------------------

    public async Task<(IReadOnlyCollection<AdminOwnerListItemResponse> Items, int Total)> ListOwnersAsync(
        int page,
        int pageSize,
        string? search,
        string? plan,
        string? status,
        CancellationToken cancellationToken = default)
    {
        var query = _dbContext.OwnerProfiles
            .AsNoTracking()
            .Where(profile => profile.ArchivedAt == null);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(profile =>
                profile.User.Email.Contains(term)
                || profile.User.DisplayName.Contains(term)
                || profile.OwnerDisplayName.Contains(term));
        }

        if (!string.IsNullOrWhiteSpace(plan))
        {
            var term = plan.Trim();
            query = query.Where(profile => profile.Plan.Code == term);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = ParseEnum<UserStatus>(status, "status", "User status is not supported.");
            query = query.Where(profile => profile.User.Status == parsed);
        }

        var total = await query.CountAsync(cancellationToken);
        var owners = await query
            .OrderByDescending(profile => profile.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(profile => new AdminOwnerListItemResponse(
                profile.UserId,
                profile.User.Email,
                profile.User.DisplayName,
                profile.OwnerDisplayName,
                profile.Plan.Code,
                profile.User.Status.ToString(),
                profile.User.PhoneE164,
                profile.User.WhatsappE164,
                _dbContext.Pets.Count(pet => pet.OwnerUserId == profile.UserId && pet.DeletedAt == null),
                _dbContext.Pets.Count(pet =>
                    pet.OwnerUserId == profile.UserId
                    && pet.DeletedAt == null
                    && pet.LifecycleStatus == PetLifecycleStatus.Active),
                _dbContext.TagOrders.Count(order => order.OwnerUserId == profile.UserId),
                profile.CreatedAt,
                profile.User.LastLoginAt))
            .ToListAsync(cancellationToken);

        return (owners, total);
    }

    public async Task<AdminOwnerDetailResponse> GetOwnerAsync(
        Guid ownerUserId,
        CancellationToken cancellationToken = default)
    {
        var owner = (await ListOwnerItemAsync(ownerUserId, cancellationToken))
            ?? throw NotFound("Owner was not found.");

        var pets = await _dbContext.Pets
            .AsNoTracking()
            .Include(pet => pet.PublicProfile)
            .Include(pet => pet.SafetySetting)
            .Where(pet => pet.OwnerUserId == ownerUserId && pet.DeletedAt == null)
            .OrderByDescending(pet => pet.CreatedAt)
            .ToListAsync(cancellationToken);

        var orders = await IncludeOrderGraph(
                _dbContext.TagOrders.AsNoTracking().Where(order => order.OwnerUserId == ownerUserId))
            .OrderByDescending(order => order.CreatedAt)
            .Take(10)
            .ToListAsync(cancellationToken);

        var tags = await IncludeTagGraph(
                VisibleTagsBase().AsNoTracking().Where(tag => tag.OwnerUserId == ownerUserId))
            .OrderByDescending(tag => tag.CreatedAt)
            .ToListAsync(cancellationToken);

        return new AdminOwnerDetailResponse(
            owner,
            pets.Select(PetDtoMapper.ToListItem).ToArray(),
            orders.Select(TagDtoMapper.ToOrderResponse).ToArray(),
            tags.Select(TagDtoMapper.ToSmartTagResponse).ToArray());
    }

    // --- Pets ---------------------------------------------------------------------------

    public async Task<(IReadOnlyCollection<AdminPetListItemResponse> Items, int Total)> ListPetsAsync(
        int page,
        int pageSize,
        string? lifecycleStatus,
        bool? lostMode,
        Guid? ownerId,
        string? search,
        CancellationToken cancellationToken = default)
    {
        var query = ActivePetsBase().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(lifecycleStatus) && !lifecycleStatus.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            var parsed = ParseEnum<PetLifecycleStatus>(lifecycleStatus, "lifecycleStatus", "Lifecycle status is not supported.");
            query = query.Where(pet => pet.LifecycleStatus == parsed);
        }

        if (lostMode.HasValue)
        {
            query = query.Where(pet =>
                pet.LostModeEnabled == lostMode.Value
                && (!lostMode.Value || pet.LifecycleStatus == PetLifecycleStatus.Active));
        }

        if (ownerId.HasValue)
        {
            query = query.Where(pet => pet.OwnerUserId == ownerId.Value);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(pet =>
                pet.Name.Contains(term)
                || pet.Slug.Contains(term)
                || pet.OwnerUser.Email.Contains(term)
                || pet.OwnerUser.DisplayName.Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);
        var pets = await query
            .Include(pet => pet.OwnerUser)
            .Include(pet => pet.PublicProfile)
            .Include(pet => pet.SafetySetting)
            .OrderByDescending(pet => pet.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);
        var tagCounts = await _dbContext.SmartTags
            .Where(tag => tag.DeletedAt == null && tag.PetId != null)
            .GroupBy(tag => tag.PetId!.Value)
            .Select(group => new { PetId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.PetId, item => item.Count, cancellationToken);

        return (pets
            .Select(pet => new AdminPetListItemResponse(
                PetDtoMapper.ToListItem(pet),
                ToOwnerRef(pet.OwnerUser),
                pet.Breed,
                pet.SafetySetting?.QrSafetyEnabled ?? false,
                tagCounts.GetValueOrDefault(pet.Id)))
            .ToArray(), total);
    }

    public async Task<AdminPetDetailResponse> GetPetAsync(Guid petId, CancellationToken cancellationToken = default)
    {
        var pet = await ActivePetsBase()
            .AsNoTracking()
            .Include(item => item.OwnerUser)
            .Include(item => item.Contact)
            .Include(item => item.PublicProfile)
            .Include(item => item.SafetySetting)
            .SingleOrDefaultAsync(item => item.Id == petId, cancellationToken)
            ?? throw NotFound("Pet was not found.");

        var tags = await IncludeTagGraph(
                VisibleTagsBase().AsNoTracking().Where(tag => tag.PetId == petId))
            .OrderByDescending(tag => tag.CreatedAt)
            .ToListAsync(cancellationToken);

        return new AdminPetDetailResponse(
            PetDtoMapper.ToDetail(pet),
            ToOwnerRef(pet.OwnerUser),
            tags.Select(TagDtoMapper.ToSmartTagResponse).ToArray());
    }

    // --- Settings and audit logs ------------------------------------------------------------

    public async Task<AdminSettingsResponse> GetSettingsAsync(CancellationToken cancellationToken = default)
    {
        var settings = await _dbContext.AppSettings
            .AsNoTracking()
            .OrderBy(setting => setting.Category)
            .ThenBy(setting => setting.Key)
            .Select(setting => new AdminSettingItemResponse(
                setting.Key,
                setting.ValueJson,
                setting.Category,
                setting.Description,
                setting.IsPublic))
            .ToListAsync(cancellationToken);

        return new AdminSettingsResponse(
            settings,
            new AdminFeatureFlagsResponse(
                PremiumStatus: "Coming Soon",
                GpsStatus: "Coming Later",
                PaymentGatewayEnabled: false,
                FileStorageEnabled: false));
    }

    public async Task<(IReadOnlyCollection<AdminAuditLogResponse> Items, int Total)> ListAuditLogsAsync(
        int page,
        int pageSize,
        string? action,
        string? entity,
        Guid? entityId,
        Guid? actorId,
        DateTimeOffset? fromDate,
        DateTimeOffset? toDate,
        CancellationToken cancellationToken = default)
    {
        var query = _dbContext.AuditLogs.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(action))
        {
            var term = action.Trim();
            query = query.Where(log => log.Action.StartsWith(term));
        }

        if (!string.IsNullOrWhiteSpace(entity))
        {
            var term = entity.Trim();
            query = query.Where(log => log.Entity == term);
        }

        if (entityId.HasValue)
        {
            query = query.Where(log => log.EntityId == entityId.Value);
        }

        if (actorId.HasValue)
        {
            query = query.Where(log => log.ActorId == actorId.Value);
        }

        if (fromDate.HasValue)
        {
            query = query.Where(log => log.CreatedAt >= fromDate.Value);
        }

        if (toDate.HasValue)
        {
            query = query.Where(log => log.CreatedAt <= toDate.Value);
        }

        var total = await query.CountAsync(cancellationToken);
        var logs = await query
            .OrderByDescending(log => log.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (logs.Select(ToAuditLogResponse).ToArray(), total);
    }

    // --- Shared helpers ------------------------------------------------------------

    private IQueryable<Pet> ActivePetsBase()
    {
        return _dbContext.Pets.Where(pet => pet.DeletedAt == null);
    }

    private IQueryable<SmartTag> VisibleTagsBase()
    {
        return _dbContext.SmartTags.Where(tag => tag.DeletedAt == null);
    }

    private static IQueryable<TagOrder> IncludeOrderGraph(IQueryable<TagOrder> query)
    {
        return query
            .Include(order => order.OwnerUser)
            .Include(order => order.Pet)
            .Include(order => order.SmartTag)
            .Include(order => order.PaymentProofs);
    }

    private static IQueryable<PaymentProof> IncludeProofGraph(IQueryable<PaymentProof> query)
    {
        return query
            .Include(proof => proof.Order)
                .ThenInclude(order => order.OwnerUser)
            .Include(proof => proof.Order)
                .ThenInclude(order => order.Pet);
    }

    private static IQueryable<SmartTag> IncludeTagGraph(IQueryable<SmartTag> query)
    {
        return query
            .Include(tag => tag.Pet)
            .Include(tag => tag.Order)
            .Include(tag => tag.Batch)
            .Include(tag => tag.OwnerUser);
    }

    private async Task<TagOrder> LoadOrderAsync(Guid orderId, bool trackChanges, CancellationToken cancellationToken)
    {
        var query = IncludeOrderGraph(_dbContext.TagOrders).Where(order => order.Id == orderId);

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        var order = await query.SingleOrDefaultAsync(cancellationToken);
        return order ?? throw NotFound("Order was not found.");
    }

    private async Task<SmartTag> LoadTagAsync(Guid tagId, bool trackChanges, CancellationToken cancellationToken)
    {
        var query = IncludeTagGraph(VisibleTagsBase()).Where(tag => tag.Id == tagId);

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        var tag = await query.SingleOrDefaultAsync(cancellationToken);
        return tag ?? throw NotFound("Tag was not found.");
    }

    private async Task<AdminOwnerListItemResponse?> ListOwnerItemAsync(
        Guid ownerUserId,
        CancellationToken cancellationToken)
    {
        return await _dbContext.OwnerProfiles
            .AsNoTracking()
            .Where(profile => profile.UserId == ownerUserId && profile.ArchivedAt == null)
            .Select(profile => new AdminOwnerListItemResponse(
                profile.UserId,
                profile.User.Email,
                profile.User.DisplayName,
                profile.OwnerDisplayName,
                profile.Plan.Code,
                profile.User.Status.ToString(),
                profile.User.PhoneE164,
                profile.User.WhatsappE164,
                _dbContext.Pets.Count(pet => pet.OwnerUserId == profile.UserId && pet.DeletedAt == null),
                _dbContext.Pets.Count(pet =>
                    pet.OwnerUserId == profile.UserId
                    && pet.DeletedAt == null
                    && pet.LifecycleStatus == PetLifecycleStatus.Active),
                _dbContext.TagOrders.Count(order => order.OwnerUserId == profile.UserId),
                profile.CreatedAt,
                profile.User.LastLoginAt))
            .SingleOrDefaultAsync(cancellationToken);
    }

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

    private async Task<Guid> ResolveProofOrderIdAsync(Guid paymentProofId, CancellationToken cancellationToken)
    {
        var orderId = await _dbContext.PaymentProofs
            .Where(proof => proof.Id == paymentProofId)
            .Select(proof => (Guid?)proof.OrderId)
            .SingleOrDefaultAsync(cancellationToken);

        return orderId ?? throw NotFound("Payment proof was not found.");
    }

    private SmartTag? SyncPendingFamilyTag(TagOrder order, SmartTagStatus nextStatus)
    {
        var tag = order.SmartTag;

        if (tag is null
            || tag.ArchivedAt.HasValue
            || tag.Status is not (SmartTagStatus.Pending or SmartTagStatus.Preparing or SmartTagStatus.Delivered))
        {
            return null;
        }

        tag.Status = nextStatus;
        return tag;
    }

    private static PaymentProof? LatestPendingProof(TagOrder order)
    {
        return order.PaymentProofs
            .Where(proof => proof.Status == PaymentProofStatus.PendingReview)
            .OrderByDescending(proof => proof.UploadedAt)
            .FirstOrDefault();
    }

    private static void EnsureTagStatus(SmartTag tag, string actionLabel, params SmartTagStatus[] allowed)
    {
        if (tag.ArchivedAt.HasValue || !allowed.Contains(tag.Status))
        {
            throw InvalidState($"This tag cannot be {actionLabel} from its current status.");
        }
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

    private static AdminTagOrderResponse ToAdminOrderResponse(TagOrder order)
    {
        return new AdminTagOrderResponse(
            TagDtoMapper.ToOrderResponse(order),
            ToOwnerRef(order.OwnerUser));
    }

    private static AdminPaymentProofResponse ToAdminProofResponse(PaymentProof proof)
    {
        return new AdminPaymentProofResponse(
            TagDtoMapper.ToPaymentProofResponse(proof),
            proof.Order.OrderNumber,
            proof.Order.Status,
            proof.Order.PaymentStatus,
            proof.Order.Pet?.Name,
            ToOwnerRef(proof.Order.OwnerUser));
    }

    private AdminSmartTagResponse ToAdminTagResponse(SmartTag tag)
    {
        return new AdminSmartTagResponse(
            TagDtoMapper.ToSmartTagResponse(tag),
            tag.OwnerUser is null ? null : ToOwnerRef(tag.OwnerUser),
            tag.Pet?.LifecycleStatus);
    }

    private static AdminAuditLogResponse ToAuditLogResponse(AuditLog log)
    {
        return new AdminAuditLogResponse(
            log.Id,
            log.ActorId,
            log.ActorType,
            log.Action,
            log.Entity,
            log.EntityId,
            log.OldValue,
            log.NewValue,
            log.CreatedAt);
    }

    private static AdminOwnerRefResponse ToOwnerRef(User user)
    {
        return new AdminOwnerRefResponse(user.Id, user.Email, user.DisplayName);
    }

    private static object OrderStateSnapshot(TagOrder order)
    {
        return new
        {
            status = order.Status.ToString(),
            paymentStatus = order.PaymentStatus.ToString(),
            trackingStatus = order.TrackingStatus,
            trackingNumber = order.TrackingNumber
        };
    }

    private static object TagStateSnapshot(SmartTag tag, string? reason = null)
    {
        return new
        {
            status = tag.Status.ToString(),
            archived = tag.ArchivedAt.HasValue,
            reason
        };
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
        return value.Contains(',') || value.Contains('"')
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

    private static ApiException InvalidState(string message)
    {
        return new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_state", message);
    }

    private static ApiException NotFound(string message)
    {
        return new ApiException(StatusCodes.Status404NotFound, "not_found", message);
    }
}
