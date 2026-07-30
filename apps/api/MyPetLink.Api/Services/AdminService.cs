using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
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

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly IEmailOutboxService _emailOutboxService;
    private readonly IShippingFulfilmentService _shippingFulfilmentService;
    private readonly FeatureOptions _features;
    private readonly IBusinessReferenceGenerator _businessReferences;
    private readonly TimeProvider _timeProvider;

    public AdminService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        IOptions<FeatureOptions> features)
        : this(
            dbContext,
            auditLogService,
            features,
            // No email configuration is supplied here, so the global switch
            // stays off and every template resolves to disabled.
            new EmailOutboxService(
                dbContext,
                auditLogService,
                TimeProvider.System,
                new EmailTemplateGate(dbContext, Options.Create(new EmailOptions()))),
            new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()),
            TimeProvider.System)
    {
    }

    public AdminService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        IOptions<FeatureOptions> features,
        IEmailOutboxService emailOutboxService)
        : this(
            dbContext,
            auditLogService,
            features,
            emailOutboxService,
            new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()),
            TimeProvider.System)
    {
    }

    public AdminService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        IOptions<FeatureOptions> features,
        IEmailOutboxService emailOutboxService,
        IBusinessReferenceGenerator businessReferences,
        TimeProvider timeProvider,
        IShippingFulfilmentService? shippingFulfilmentService = null)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _features = features.Value;
        _emailOutboxService = emailOutboxService;
        _businessReferences = businessReferences;
        _timeProvider = timeProvider;
        _shippingFulfilmentService = shippingFulfilmentService
            ?? new ShippingFulfilmentService(dbContext, auditLogService, timeProvider);
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
                    || order.Status == OrderStatus.PreparingTag
                    || order.Status == OrderStatus.ReadyToShip, cancellationToken),
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
        return await ReviewPaymentProofAsync(
            currentUserId,
            orderId,
            paymentProofId: null,
            approve: true,
            reason: null,
            cancellationToken);
    }

    public async Task<AdminEmailOutboxResponse> RetryPaymentConfirmationEmailAsync(
        Guid? currentUserId,
        Guid orderId,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        return await _emailOutboxService.RetryFailedAsync(
            orderId,
            admin.Id,
            cancellationToken);
    }

    public async Task<AdminOwnerWelcomeEmailResponse> RetryOwnerWelcomeEmailAsync(
        Guid? currentUserId,
        Guid ownerUserId,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        return await _emailOutboxService.RetryOwnerWelcomeAsync(
            ownerUserId,
            admin.Id,
            cancellationToken);
    }

    public async Task<AdminTagOrderResponse> RejectPaymentProofAsync(
        Guid? currentUserId,
        Guid orderId,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        return await ReviewPaymentProofAsync(
            currentUserId,
            orderId,
            paymentProofId: null,
            approve: false,
            reason,
            cancellationToken);
    }

    public async Task<AdminTagOrderResponse> AssignInventoryTagAsync(
        Guid? currentUserId,
        Guid orderId,
        Guid tagId,
        CancellationToken cancellationToken = default)
    {
        if (tagId == Guid.Empty)
        {
            throw ValidationFailed("tagId", "Choose an inventory tag to assign.");
        }

        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        if (order.Status != OrderStatus.PaymentConfirmed)
        {
            throw InvalidState("Inventory tags can only be assigned after payment is confirmed.");
        }

        if (order.SmartTagId.HasValue || order.SmartTag is not null)
        {
            throw InvalidState("This order already has an assigned inventory tag.");
        }

        if (order.Pet.LifecycleStatus is not PetLifecycleStatus.Active || order.Pet.ArchivedAt.HasValue)
        {
            throw InvalidState("Inventory tags can only be assigned to active pet profiles.");
        }

        var tag = await LoadAvailableInventoryTagAsync(order, tagId, "tagId", cancellationToken);

        var oldOrderState = OrderStateSnapshot(order);
        var oldTagState = TagStateSnapshot(tag);
        var now = _timeProvider.GetUtcNow();

        tag.OwnerUserId = order.OwnerUserId;
        tag.OwnerUser = order.OwnerUser;
        tag.PetId = order.PetId;
        tag.Pet = order.Pet;
        tag.OrderId = order.Id;
        tag.Order = order;
        tag.ReplacementForTagId = order.ReplacementForTagId;
        tag.Status = SmartTagStatus.Preparing;
        tag.UpdatedAt = now;

        order.SmartTagId = tag.Id;
        order.SmartTag = tag;
        order.TrackingStatus = "Inventory tag assigned. Tag preparation is next.";
        order.UpdatedAt = now;

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.assign-inventory-tag", "TagOrder", order.Id,
            oldOrderState, OrderStateSnapshot(order));
        _auditLogService.Append(
            admin.Id, ActorType.Admin, "tag.assign-to-order", "SmartTag", tag.Id,
            oldTagState, TagStateSnapshot(tag, "Assigned to portal order"));

        await SaveInventoryAllocationAsync(cancellationToken);
        return ToAdminOrderResponse(order);
    }

    // Swap the assigned inventory tag before the order ships. The old tag was
    // never shipped or activated, so it goes back to Unclaimed inventory and the
    // new tag takes its place.
    public async Task<AdminTagOrderResponse> ChangeAssignedTagAsync(
        Guid? currentUserId,
        Guid orderId,
        Guid newTagId,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        if (order.Status is not (OrderStatus.PaymentConfirmed or OrderStatus.PreparingTag or OrderStatus.ReadyToShip))
        {
            throw InvalidState(
                "The assigned tag can only be changed before the order ships. Use Replace Tag once it has shipped.");
        }

        var oldTag = order.SmartTag;
        if (oldTag is null || !order.SmartTagId.HasValue)
        {
            throw InvalidState("This order has no assigned tag yet. Assign an inventory tag first.");
        }

        if (oldTag.Status is not (SmartTagStatus.Pending or SmartTagStatus.Preparing))
        {
            throw InvalidState(
                "The current tag has already progressed past preparation. Use Replace Tag instead.");
        }

        if (order.Pet.LifecycleStatus is not PetLifecycleStatus.Active || order.Pet.ArchivedAt.HasValue)
        {
            throw InvalidState("Inventory tags can only be assigned to active pet profiles.");
        }

        if (newTagId == oldTag.Id)
        {
            throw ValidationFailed("newTagId", "Choose a different inventory tag.");
        }

        var newTag = await LoadAvailableInventoryTagAsync(order, newTagId, "newTagId", cancellationToken);
        var oldOrderState = OrderStateSnapshot(order);
        var oldTagState = TagStateSnapshot(oldTag);
        var newTagOldState = TagStateSnapshot(newTag);
        var now = _timeProvider.GetUtcNow();
        var normalizedReason = NormalizeOptional(reason);

        // Return the old tag to unclaimed inventory.
        ReturnTagToInventory(oldTag, now);

        // Link the new tag in its place.
        LinkTagToOrder(newTag, order, now);
        newTag.ReplacementForTagId = order.ReplacementForTagId;
        if (order.Status == OrderStatus.ReadyToShip)
        {
            // The newly assigned physical tag has not passed preparation yet.
            // This controlled reset is part of the tag-swap operation, not an
            // arbitrary fulfilment-status rollback.
            order.Status = OrderStatus.PreparingTag;
            order.ReadyToShipAt = null;
        }
        order.TrackingStatus = "Assigned tag updated. Tag preparation is next.";
        order.UpdatedAt = now;

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.change-assigned-tag", "TagOrder", order.Id,
            oldOrderState,
            new
            {
                oldTagCode = oldTag.TagCode,
                newTagCode = newTag.TagCode,
                reason = normalizedReason,
                status = order.Status.ToString(),
                smartTagId = order.SmartTagId
            });
        _auditLogService.Append(
            admin.Id, ActorType.Admin, "tag.unassign-from-order", "SmartTag", oldTag.Id,
            oldTagState, TagStateSnapshot(oldTag, "Returned to unclaimed inventory (tag changed)"));
        _auditLogService.Append(
            admin.Id, ActorType.Admin, "tag.assign-to-order", "SmartTag", newTag.Id,
            newTagOldState, TagStateSnapshot(newTag, "Assigned to portal order (tag changed)"));

        await SaveInventoryAllocationAsync(cancellationToken);
        return ToAdminOrderResponse(order);
    }

    // Replace the tag after it has shipped/been delivered/activated. The old tag
    // is marked Replaced (its scan page stops showing owner contact) but keeps
    // its history; a fresh inventory tag re-enters preparation.
    public async Task<AdminTagOrderResponse> ReplaceTagAsync(
        Guid? currentUserId,
        Guid orderId,
        Guid newTagId,
        string? reason,
        string? note,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        var oldTag = order.SmartTag;
        if (oldTag is null || !order.SmartTagId.HasValue)
        {
            throw InvalidState("This order has no assigned tag to replace.");
        }

        var eligible = order.Status is OrderStatus.Shipped or OrderStatus.Delivered
            || oldTag.Status is SmartTagStatus.Active;
        if (!eligible)
        {
            throw InvalidState(
                "Replace Tag is for orders that have already shipped. Use Change Assigned Tag before shipping.");
        }

        var normalizedReason = NormalizeOptional(reason)
            ?? throw ValidationFailed("reason", "Choose a reason for the replacement.");

        if (order.Pet.LifecycleStatus is not PetLifecycleStatus.Active || order.Pet.ArchivedAt.HasValue)
        {
            throw InvalidState("A replacement tag can only be issued for an active pet profile.");
        }

        if (newTagId == oldTag.Id)
        {
            throw ValidationFailed("newTagId", "Choose a different inventory tag.");
        }

        var newTag = await LoadAvailableInventoryTagAsync(order, newTagId, "newTagId", cancellationToken);
        var oldOrderState = OrderStateSnapshot(order);
        var oldTagState = TagStateSnapshot(oldTag);
        var newTagOldState = TagStateSnapshot(newTag);
        var now = DateTimeOffset.UtcNow;
        var normalizedNote = NormalizeOptional(note);

        // Retire the old tag but keep its owner/pet/order history for the record.
        oldTag.Status = SmartTagStatus.Replaced;
        oldTag.UpdatedAt = now;

        // Bring in the replacement and send the order back through preparation.
        LinkTagToOrder(newTag, order, now);
        newTag.ReplacementForTagId = oldTag.Id;
        order.Status = OrderStatus.PreparingTag;
        order.ShippedAt = null;
        order.DeliveredAt = null;
        order.TrackingStatus = "A replacement tag is being prepared.";

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.replace-tag", "TagOrder", order.Id,
            oldOrderState,
            new
            {
                oldTagCode = oldTag.TagCode,
                newTagCode = newTag.TagCode,
                reason = normalizedReason,
                note = normalizedNote,
                status = order.Status.ToString(),
                smartTagId = order.SmartTagId
            });
        _auditLogService.Append(
            admin.Id, ActorType.Admin, "tag.replace", "SmartTag", oldTag.Id,
            oldTagState, TagStateSnapshot(oldTag, $"Replaced: {normalizedReason}"));
        _auditLogService.Append(
            admin.Id, ActorType.Admin, "tag.assign-to-order", "SmartTag", newTag.Id,
            newTagOldState, TagStateSnapshot(newTag, "Assigned as replacement tag"));

        await SaveInventoryAllocationAsync(cancellationToken);
        return ToAdminOrderResponse(order);
    }

    private async Task SaveInventoryAllocationAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "inventory_allocation_conflict",
                "This inventory tag was changed by another administrator. Refresh the order and choose an available tag.");
        }
    }

    public async Task<AdminTagOrderResponse> MarkOrderPreparingAsync(
        Guid? currentUserId,
        Guid orderId,
        string? rowVersion,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        if (order.Status == OrderStatus.PreparingTag)
        {
            return ToAdminOrderResponse(order);
        }
        if (order.Status != OrderStatus.PaymentConfirmed)
        {
            throw InvalidState("Orders can only start preparation after payment is confirmed.");
        }
        if (order.PaymentStatus != PaymentStatus.Confirmed)
        {
            throw InvalidState("Refunded or unconfirmed orders cannot enter preparation.");
        }

        ApplyOrderConcurrency(order, rowVersion);
        var oldState = OrderStateSnapshot(order);
        var tag = RequireAssignedOrderTag(order, "start preparing");
        var now = _timeProvider.GetUtcNow();
        order.Status = OrderStatus.PreparingTag;
        order.TrackingStatus = "Tag is being prepared.";
        order.UpdatedAt = now;
        tag.Status = SmartTagStatus.Preparing;
        tag.UpdatedAt = now;

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.mark-preparing", "TagOrder", order.Id,
            oldState, OrderStateSnapshot(order));

        await SaveOrderMutationAsync(cancellationToken);
        return ToAdminOrderResponse(order);
    }

    public async Task<AdminTagOrderResponse> MarkOrderReadyToShipAsync(
        Guid? currentUserId,
        Guid orderId,
        string? rowVersion,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        if (order.Status == OrderStatus.ReadyToShip)
        {
            return ToAdminOrderResponse(order);
        }
        if (order.Status != OrderStatus.PreparingTag)
        {
            throw InvalidState("Orders can only be marked ready to ship after preparation has started.");
        }
        if (order.PaymentStatus != PaymentStatus.Confirmed)
        {
            throw InvalidState("Payment must remain confirmed before an order can be marked ready to ship.");
        }

        ApplyOrderConcurrency(order, rowVersion);
        var oldState = OrderStateSnapshot(order);
        var now = _timeProvider.GetUtcNow();
        RequireAssignedOrderTag(order, "mark ready to ship");
        order.Status = OrderStatus.ReadyToShip;
        order.ReadyToShipAt ??= now;
        order.TrackingStatus = "Your tag is ready to ship.";
        order.UpdatedAt = now;

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.mark-ready-to-ship", "TagOrder", order.Id,
            oldState, OrderStateSnapshot(order));

        await SaveOrderMutationAsync(cancellationToken);
        return ToAdminOrderResponse(order);
    }

    public async Task<AdminTagOrderResponse> UpdateShipmentDetailsAsync(
        Guid? currentUserId,
        Guid orderId,
        UpdateShipmentDetailsRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        if (order.Status is not (OrderStatus.PreparingTag or OrderStatus.ReadyToShip or OrderStatus.Shipped))
        {
            throw InvalidState("Shipment details can only be edited while an order is being prepared, ready to ship, or shipped.");
        }

        ApplyOrderConcurrency(order, request.RowVersion);
        var courier = await _shippingFulfilmentService.ResolveCourierForShipmentAsync(
            order,
            request.CourierProviderCode,
            request.CourierProvider,
            cancellationToken);
        var shipment = ValidateShipment(
            courier.Code,
            courier.DisplayName,
            request.CourierService,
            request.TrackingNumber,
            request.ActualCourierCost,
            request.ShippingNotes);
        if (ShipmentMatches(order, shipment))
        {
            return ToAdminOrderResponse(order);
        }
        var oldState = OrderStateSnapshot(order);
        ApplyShipmentDetails(order, shipment);
        order.UpdatedAt = _timeProvider.GetUtcNow();

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.update-shipment", "TagOrder", order.Id,
            oldState, OrderStateSnapshot(order));

        await SaveOrderMutationAsync(cancellationToken);
        return ToAdminOrderResponse(order);
    }

    public async Task<AdminTagOrderResponse> MarkOrderShippedAsync(
        Guid? currentUserId,
        Guid orderId,
        MarkOrderShippedRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        var courier = await _shippingFulfilmentService.ResolveCourierForShipmentAsync(
            order,
            request.CourierProviderCode,
            request.CourierProvider,
            cancellationToken);
        var shipment = ValidateShipment(
            courier.Code,
            courier.DisplayName,
            request.CourierService,
            request.TrackingNumber,
            request.ActualCourierCost,
            request.ShippingNotes);

        // A repeated identical request is harmless. This protects operators
        // from a retry after the original response was interrupted, while the
        // unique outbox key still guarantees one shipment notification.
        if ((order.Status is OrderStatus.Shipped or OrderStatus.Delivered)
            && ShipmentMatches(order, shipment))
        {
            return ToAdminOrderResponse(order);
        }

        if (order.Status != OrderStatus.ReadyToShip)
        {
            throw InvalidState("Orders can only be shipped after they are marked ready to ship.");
        }
        if (order.PaymentStatus != PaymentStatus.Confirmed)
        {
            throw InvalidState("Payment must remain confirmed before an order can be shipped.");
        }

        ApplyOrderConcurrency(order, request.RowVersion);
        var oldState = OrderStateSnapshot(order);
        var now = _timeProvider.GetUtcNow();
        ApplyShipmentDetails(order, shipment);
        order.Status = OrderStatus.Shipped;
        order.ShippedAt ??= now;
        order.TrackingStatus = $"Shipped with {order.CourierProvider}.";
        order.UpdatedAt = now;
        var shippedTag = RequireAssignedOrderTag(order, "ship");
        // The physical tag has left our hands for the owner; keep the
        // fulfilment trail in sync with the order without touching lifecycle.
        AdminTagInventoryService.MarkSentToOwner(shippedTag, now);

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.mark-shipped", "TagOrder", order.Id,
            oldState, OrderStateSnapshot(order));

        await _emailOutboxService.EnqueueOrderShippedAsync(order, now, cancellationToken);
        await SaveOrderMutationAsync(cancellationToken);
        return ToAdminOrderResponse(order);
    }

    public async Task<AdminTagOrderResponse> MarkOrderDeliveredAsync(
        Guid? currentUserId,
        Guid orderId,
        string? rowVersion,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        if (order.Status == OrderStatus.Delivered)
        {
            return ToAdminOrderResponse(order);
        }
        if (order.Status != OrderStatus.Shipped)
        {
            throw InvalidState("Orders can only be marked delivered after they are shipped.");
        }

        ApplyOrderConcurrency(order, rowVersion);
        var oldState = OrderStateSnapshot(order);
        var now = _timeProvider.GetUtcNow();
        order.Status = OrderStatus.Delivered;
        order.DeliveredAt ??= now;
        order.TrackingStatus = string.IsNullOrWhiteSpace(order.City)
            ? "Delivered."
            : $"Delivered to {order.City}.";
        order.UpdatedAt = now;

        var tag = RequireAssignedOrderTag(order, "mark delivered");
        tag.Status = SmartTagStatus.Delivered;
        tag.DeliveredAt ??= now;
        tag.UpdatedAt = now;

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.mark-delivered", "TagOrder", order.Id,
            oldState, OrderStateSnapshot(order));

        await SaveOrderMutationAsync(cancellationToken);
        return ToAdminOrderResponse(order);
    }

    public async Task<AdminTagOrderResponse> CancelOrderAsync(
        Guid? currentUserId,
        Guid orderId,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);

        if (order.Status is OrderStatus.Shipped or OrderStatus.Delivered or OrderStatus.Cancelled)
        {
            throw InvalidState("Shipped, delivered, or already cancelled orders cannot be cancelled.");
        }

        var normalizedReason = NormalizeOptional(reason)
            ?? throw ValidationFailed("reason", "Enter a reason for cancelling this order.");
        var oldState = OrderStateSnapshot(order);
        var now = DateTimeOffset.UtcNow;
        var assignedTag = order.SmartTag;
        var oldTagState = assignedTag is null ? null : TagStateSnapshot(assignedTag);
        order.Status = OrderStatus.Cancelled;
        order.CancelledAt ??= now;
        order.TrackingStatus = "Cancelled";

        // An assigned tag that has not shipped or activated returns to unclaimed
        // stock. This keeps inventory reusable without changing shipped history.
        if (assignedTag is not null
            && assignedTag.Status is SmartTagStatus.Pending or SmartTagStatus.Preparing)
        {
            ReturnTagToInventory(assignedTag, now);
            order.SmartTagId = null;
            order.SmartTag = null;

            _auditLogService.Append(
                admin.Id,
                ActorType.Admin,
                "tag.unassign-from-cancelled-order",
                "SmartTag",
                assignedTag.Id,
                oldTagState,
                TagStateSnapshot(assignedTag, $"Order cancelled: {normalizedReason}"));
        }

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "order.cancel", "TagOrder", order.Id,
            oldState, new { state = OrderStateSnapshot(order), reason = normalizedReason });

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
        return await ReviewPaymentProofAsync(
            currentUserId,
            orderId,
            paymentProofId,
            approve: true,
            reason: null,
            cancellationToken);
    }

    public async Task<AdminTagOrderResponse> RejectPaymentProofByIdAsync(
        Guid? currentUserId,
        Guid paymentProofId,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var orderId = await ResolveProofOrderIdAsync(paymentProofId, cancellationToken);
        return await ReviewPaymentProofAsync(
            currentUserId,
            orderId,
            paymentProofId,
            approve: false,
            reason,
            cancellationToken);
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
            .Include(pet => pet.ProfileMediaFile)
            .Include(pet => pet.CoverMediaFile)
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
            pets.Select(pet => PetDtoMapper.ToListItem(pet)).ToArray(),
            orders.Select(order => TagDtoMapper.ToOrderResponse(order)).ToArray(),
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
            .Include(pet => pet.ProfileMediaFile)
            .Include(pet => pet.CoverMediaFile)
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
            .Include(item => item.ProfileMediaFile)
            .Include(item => item.CoverMediaFile)
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

    // --- Settings and audit logs -----------------------------------------------------


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
            .Include(order => order.PaymentProofs)
            .Include(order => order.EmailOutboxMessages)
            .Include(order => order.Items);
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

    private async Task<AdminTagOrderResponse> ReviewPaymentProofAsync(
        Guid? currentUserId,
        Guid orderId,
        Guid? paymentProofId,
        bool approve,
        string? reason,
        CancellationToken cancellationToken)
    {
        var normalizedReason = approve
            ? null
            : NormalizeOptional(reason) ?? throw ValidationFailed("reason", "Enter a reason for rejecting this payment proof.");
        var strategy = _dbContext.Database.CreateExecutionStrategy();

        var maxAttempts = approve ? 12 : 1;
        for (var referenceAttempt = 0; referenceAttempt < maxAttempts; referenceAttempt++)
        {
            try
            {
                return await strategy.ExecuteAsync(async () =>
                {
                    // A serializable transaction prevents two Admin requests from
                    // reviewing the same pending proof concurrently. In-memory tests use
                    // the same state checks without a provider transaction.
                    _dbContext.ChangeTracker.Clear();
                    await using var transaction = _dbContext.Database.IsRelational()
                        ? await _dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
                        : null;

                    var admin = await RequireAdminAsync(currentUserId, cancellationToken);
                    var order = await LoadOrderAsync(orderId, trackChanges: true, cancellationToken);
                    if (order.Status != OrderStatus.PaymentProofSubmitted || order.PaymentStatus != PaymentStatus.ProofSubmitted)
                    {
                        throw InvalidState(approve
                            ? "Payment can only be confirmed while its submitted proof is waiting for review."
                            : "Only orders with a submitted payment proof can be sent back for resubmission.");
                    }

                    var latestPendingProof = LatestPendingProof(order)
                        ?? throw InvalidState("There is no payment proof waiting for review on this order.");
                    var proof = paymentProofId.HasValue
                        ? order.PaymentProofs.SingleOrDefault(item => item.Id == paymentProofId.Value)
                            ?? throw NotFound("Payment proof was not found.")
                        : latestPendingProof;

                    if (proof.Status != PaymentProofStatus.PendingReview)
                    {
                        throw InvalidState("This payment proof has already been reviewed and cannot be reviewed again.");
                    }
                    if (proof.Id != latestPendingProof.Id)
                    {
                        throw InvalidState("Only the latest submitted payment proof can be reviewed.");
                    }
                    if (order.PaymentProofs.Any(item => item.Id != proof.Id && item.Status == PaymentProofStatus.Approved))
                    {
                        throw InvalidState("This order already has an approved payment proof.");
                    }

                    var oldOrderState = OrderStateSnapshot(order);
                    var oldProofState = PaymentProofStateSnapshot(proof);
                    var now = _timeProvider.GetUtcNow();
                    foreach (var stalePending in order.PaymentProofs.Where(item => item.Id != proof.Id && item.Status == PaymentProofStatus.PendingReview))
                    {
                        stalePending.Status = PaymentProofStatus.Superseded;
                        stalePending.UpdatedAt = now;
                    }
                    proof.Status = approve ? PaymentProofStatus.Approved : PaymentProofStatus.Rejected;
                    proof.ReviewedByAdminUserId = admin.Id;
                    proof.ReviewedAt = now;
                    proof.RejectionReason = normalizedReason;
                    proof.UpdatedAt = now;

                    if (approve)
                    {
                        order.Status = OrderStatus.PaymentConfirmed;
                        order.PaymentStatus = PaymentStatus.Confirmed;
                        order.PaymentConfirmedAt ??= now;
                        order.ReceiptNumber ??= await GenerateReceiptNumberAsync(
                            order.PaymentConfirmedAt.Value.ToUniversalTime(),
                            cancellationToken);
                        order.TrackingStatus = "Payment confirmed. Tag preparation is next.";
                        await _emailOutboxService.EnqueuePaymentConfirmedAsync(
                            order,
                            order.PaymentConfirmedAt.Value,
                            cancellationToken);
                    }
                    else
                    {
                        order.Status = OrderStatus.PendingPayment;
                        order.PaymentStatus = PaymentStatus.Rejected;
                        order.TrackingStatus = "Payment proof needs to be resubmitted.";
                    }
                    order.UpdatedAt = now;

                    var proofAction = approve ? "payment-proof.approve" : "payment-proof.reject";
                    var orderAction = approve ? "order.confirm-payment" : "order.reject-payment-proof";
                    _auditLogService.Append(
                        admin.Id,
                        ActorType.Admin,
                        proofAction,
                        "PaymentProof",
                        proof.Id,
                        oldProofState,
                        new { state = PaymentProofStateSnapshot(proof), reason = normalizedReason, orderId = order.Id });
                    _auditLogService.Append(
                        admin.Id,
                        ActorType.Admin,
                        orderAction,
                        "TagOrder",
                        order.Id,
                        oldOrderState,
                        new { state = OrderStateSnapshot(order), paymentProofId = proof.Id, reason = normalizedReason });

                    await _dbContext.SaveChangesAsync(cancellationToken);
                    if (transaction is not null) await transaction.CommitAsync(cancellationToken);
                    return ToAdminOrderResponse(order);
                });
            }
            catch (DbUpdateException exception) when (
                approve
                && UniqueConstraintViolation.IsFor(exception, "IX_TagOrders_ReceiptNumber")
                && referenceAttempt < maxAttempts - 1)
            {
                // A different confirmation selected the same suffix after our
                // pre-check. The transaction has rolled back; retry with a new
                // receipt reference and a freshly loaded order graph.
            }
            catch (DbUpdateException exception) when (
                approve
                && UniqueConstraintViolation.IsFor(exception, "IX_TagOrders_ReceiptNumber"))
            {
                throw new ApiException(
                    StatusCodes.Status500InternalServerError,
                    "receipt_number_generation_failed",
                    "Could not generate a receipt number. Please try again.");
            }
        }

        throw new InvalidOperationException("Payment proof review did not complete.");
    }

    private async Task<string> GenerateReceiptNumberAsync(
        DateTimeOffset paymentConfirmedAtUtc,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 12; attempt++)
        {
            var candidate = _businessReferences.CreateReceiptNumber(paymentConfirmedAtUtc);
            var exists = await _dbContext.TagOrders.AnyAsync(
                order => order.ReceiptNumber == candidate,
                cancellationToken);

            if (!exists)
            {
                return candidate;
            }
        }

        throw new ApiException(
            StatusCodes.Status500InternalServerError,
            "receipt_number_generation_failed",
            "Could not generate a receipt number. Please try again.");
    }

    private static SmartTag RequireAssignedOrderTag(TagOrder order, string actionLabel)
    {
        var tag = order.SmartTag;

        if (tag is null
            || tag.ArchivedAt.HasValue
            || tag.OwnerUserId != order.OwnerUserId
            || tag.PetId != order.PetId
            || tag.OrderId != order.Id
            || tag.Status is not (SmartTagStatus.Preparing or SmartTagStatus.Delivered or SmartTagStatus.Active))
        {
            throw InvalidState($"Assign an inventory tag before you {actionLabel} this order.");
        }

        return tag;
    }

    // Loads an inventory tag that is safe to assign to this order: it must be
    // unclaimed, unlinked, not archived, and match the order's tag type + variant.
    private async Task<SmartTag> LoadAvailableInventoryTagAsync(
        TagOrder order,
        Guid tagId,
        string fieldName,
        CancellationToken cancellationToken)
    {
        if (tagId == Guid.Empty)
        {
            throw ValidationFailed(fieldName, "Choose an inventory tag.");
        }

        var tag = await LoadTagAsync(tagId, trackChanges: true, cancellationToken);

        if (tag.Status != SmartTagStatus.Unclaimed
            || tag.ArchivedAt.HasValue
            || tag.FulfilmentStatus is not (TagFulfilmentStatus.Generated or TagFulfilmentStatus.Printed)
            || tag.OwnerUserId.HasValue
            || tag.PetId.HasValue
            || tag.OrderId.HasValue)
        {
            throw InvalidState("Only unclaimed, available production inventory can be assigned to an order.");
        }

        var orderItem = order.Items.OrderBy(item => item.CreatedAt).FirstOrDefault();
        if (orderItem?.ProductVariantId is { } productVariantId)
        {
            if (tag.ProductVariantId != productVariantId)
            {
                throw ValidationFailed(fieldName, "Choose an available inventory tag with the same SKU as the order.");
            }

            return tag;
        }

        // Legacy orders created before the product catalog retain their
        // original type/variant matching rule. No SKU is guessed or backfilled.
        var orderHasNfc = order.TagType == TagType.QrNfcSmartTag;
        if (tag.HasNfc != orderHasNfc)
        {
            throw ValidationFailed(fieldName, "Choose an inventory tag with the same tag type as the order.");
        }

        if (!tag.Variant.Equals(order.Variant, StringComparison.OrdinalIgnoreCase))
        {
            throw ValidationFailed(fieldName, "Choose an inventory tag with the same tag variant as the order.");
        }

        return tag;
    }

    // Links an available inventory tag to the order/owner/pet and points the
    // order at it. Preparation is the next fulfillment step.
    private static void LinkTagToOrder(SmartTag tag, TagOrder order, DateTimeOffset now)
    {
        tag.OwnerUserId = order.OwnerUserId;
        tag.OwnerUser = order.OwnerUser;
        tag.PetId = order.PetId;
        tag.Pet = order.Pet;
        tag.OrderId = order.Id;
        tag.Order = order;
        tag.Status = SmartTagStatus.Preparing;
        tag.UpdatedAt = now;

        order.SmartTagId = tag.Id;
        order.SmartTag = tag;
        order.UpdatedAt = now;
    }

    // Detaches a never-shipped tag from its order and returns it to unclaimed
    // inventory so it can be assigned again.
    private static void ReturnTagToInventory(SmartTag tag, DateTimeOffset now)
    {
        tag.OwnerUserId = null;
        tag.OwnerUser = null;
        tag.PetId = null;
        tag.Pet = null;
        tag.OrderId = null;
        tag.Order = null;
        tag.ReplacementForTagId = null;
        tag.Status = SmartTagStatus.Unclaimed;
        tag.UpdatedAt = now;
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

    private static AdminTagOrderResponse ToAdminOrderResponse(TagOrder order)
    {
        return new AdminTagOrderResponse(
            TagDtoMapper.ToOrderResponse(order),
            ToOwnerRef(order.OwnerUser),
            order.Items.OrderBy(item => item.CreatedAt).Select(item => item.ProductVariantId).FirstOrDefault(),
            new AdminShipmentDetailsResponse(
                order.CourierProviderCode,
                order.CourierProvider,
                order.CourierService,
                order.TrackingNumber,
                order.ActualCourierCost,
                order.ShippingNotes,
                order.ReadyToShipAt,
                order.ShippedAt,
                order.DeliveredAt,
                Convert.ToBase64String(order.RowVersion)),
            order.EmailOutboxMessages
                .Where(item => item.MessageType == EmailMessageType.PaymentConfirmed)
                .Select(EmailOutboxService.ToAdminResponse)
                .SingleOrDefault());
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
            receiptNumber = order.ReceiptNumber,
            smartTagId = order.SmartTagId,
            trackingStatus = order.TrackingStatus,
            courierProviderCode = order.CourierProviderCode,
            courierProvider = order.CourierProvider,
            courierService = order.CourierService,
            trackingNumber = order.TrackingNumber,
            actualCourierCost = order.ActualCourierCost,
            shippingNotes = order.ShippingNotes,
            readyToShipAt = order.ReadyToShipAt,
            shippedAt = order.ShippedAt,
            deliveredAt = order.DeliveredAt
        };
    }

    private sealed record ValidatedShipment(
        string? CourierProviderCode,
        string CourierProvider,
        string? CourierService,
        string TrackingNumber,
        decimal? ActualCourierCost,
        string? ShippingNotes);

    private static ValidatedShipment ValidateShipment(
        string? courierProviderCode,
        string? courierProvider,
        string? courierService,
        string? trackingNumber,
        decimal? actualCourierCost,
        string? shippingNotes)
    {
        var provider = NormalizeOptional(courierProvider)
            ?? throw ValidationFailed("courierProvider", "Select or enter a courier provider.");
        var tracking = NormalizeOptional(trackingNumber)
            ?? throw ValidationFailed("trackingNumber", "Enter the courier tracking number.");
        if (actualCourierCost < 0)
        {
            throw ValidationFailed("actualCourierCost", "Courier cost cannot be negative.");
        }

        return new ValidatedShipment(
            courierProviderCode,
            provider,
            NormalizeOptional(courierService),
            tracking,
            actualCourierCost,
            NormalizeOptional(shippingNotes));
    }

    private static void ApplyShipmentDetails(TagOrder order, ValidatedShipment shipment)
    {
        order.CourierProviderCode = shipment.CourierProviderCode;
        order.CourierProvider = shipment.CourierProvider;
        order.CourierService = shipment.CourierService;
        order.TrackingNumber = shipment.TrackingNumber;
        order.ActualCourierCost = shipment.ActualCourierCost;
        order.ShippingNotes = shipment.ShippingNotes;
    }

    private static bool ShipmentMatches(TagOrder order, ValidatedShipment shipment) =>
        string.Equals(order.CourierProviderCode ?? "", shipment.CourierProviderCode ?? "", StringComparison.OrdinalIgnoreCase)
        && string.Equals(order.CourierProvider, shipment.CourierProvider, StringComparison.OrdinalIgnoreCase)
        && string.Equals(order.CourierService ?? "", shipment.CourierService ?? "", StringComparison.OrdinalIgnoreCase)
        && string.Equals(order.TrackingNumber, shipment.TrackingNumber, StringComparison.OrdinalIgnoreCase)
        && order.ActualCourierCost == shipment.ActualCourierCost
        && string.Equals(order.ShippingNotes ?? "", shipment.ShippingNotes ?? "", StringComparison.Ordinal);

    private void ApplyOrderConcurrency(TagOrder order, string? rowVersion)
    {
        if (string.IsNullOrWhiteSpace(rowVersion))
        {
            throw ValidationFailed("rowVersion", "Refresh the order before changing its shipping status.");
        }

        byte[] supplied;
        try
        {
            supplied = Convert.FromBase64String(rowVersion);
        }
        catch (FormatException)
        {
            throw OrderConcurrencyConflict();
        }

        if (!supplied.SequenceEqual(order.RowVersion))
        {
            throw OrderConcurrencyConflict();
        }

        _dbContext.Entry(order).Property(item => item.RowVersion).OriginalValue = supplied;
    }

    private async Task SaveOrderMutationAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw OrderConcurrencyConflict();
        }
        catch (DbUpdateException exception)
            when (UniqueConstraintViolation.IsFor(
                exception,
                "IX_EmailOutbox_RelatedOrderId_MessageType"))
        {
            throw OrderConcurrencyConflict();
        }
    }

    private static ApiException OrderConcurrencyConflict() =>
        new(
            StatusCodes.Status409Conflict,
            "concurrency_conflict",
            "This order was changed by another administrator. The latest details must be loaded before trying again.");

    private static object PaymentProofStateSnapshot(PaymentProof proof)
    {
        return new
        {
            status = proof.Status.ToString(),
            reviewedByAdminUserId = proof.ReviewedByAdminUserId,
            reviewedAt = proof.ReviewedAt,
            rejectionReason = proof.RejectionReason
        };
    }

    private static object TagStateSnapshot(SmartTag tag, string? reason = null)
    {
        return new
        {
            status = tag.Status.ToString(),
            ownerUserId = tag.OwnerUserId,
            petId = tag.PetId,
            orderId = tag.OrderId,
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
