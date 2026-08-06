using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IMerchantFulfilmentService
{
    Task<MerchantOrderAllocationSummary> GetAllocationSummaryAsync(
        Guid merchantOrderId, CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<MerchantEligibleInventoryItem> Items, int Total)>
        ListEligibleInventoryAsync(
            Guid merchantOrderId,
            Guid merchantOrderItemId,
            string? search,
            Guid? batchId,
            int page,
            int pageSize,
            CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<MerchantAllocatedTagResponse>> ListAllocatedTagsAsync(
        Guid merchantOrderId,
        bool includeReleased,
        CancellationToken cancellationToken = default);

    Task<MerchantOrderAllocationSummary> AllocateAsync(
        Guid? actorUserId,
        Guid merchantOrderId,
        AllocateMerchantInventoryRequest request,
        CancellationToken cancellationToken = default);

    Task<MerchantOrderAllocationSummary> AutoAllocateAsync(
        Guid? actorUserId,
        Guid merchantOrderId,
        AutoAllocateMerchantInventoryRequest request,
        CancellationToken cancellationToken = default);

    Task<MerchantOrderAllocationSummary> ReleaseAsync(
        Guid? actorUserId,
        Guid merchantOrderId,
        ReleaseMerchantInventoryRequest request,
        CancellationToken cancellationToken = default);

    Task<MerchantOrderFulfilmentResponse> GetFulfilmentAsync(
        Guid merchantOrderId, CancellationToken cancellationToken = default);

    Task<MerchantOrderFulfilmentResponse> MarkPreparingAsync(
        Guid? actorUserId, Guid merchantOrderId,
        MerchantFulfilmentTransitionRequest request,
        CancellationToken cancellationToken = default);

    Task<MerchantOrderFulfilmentResponse> MarkReadyToShipAsync(
        Guid? actorUserId, Guid merchantOrderId,
        MerchantFulfilmentTransitionRequest request,
        CancellationToken cancellationToken = default);

    Task<MerchantDeliveryOrderResponse> IssueDeliveryOrderAsync(
        Guid? actorUserId, Guid merchantOrderId,
        CancellationToken cancellationToken = default);

    Task<MerchantDeliveryOrderResponse?> GetDeliveryOrderAsync(
        Guid merchantOrderId, CancellationToken cancellationToken = default);

    Task<MerchantOrderFulfilmentResponse> MarkShippedAsync(
        Guid? actorUserId, Guid merchantOrderId,
        MarkMerchantOrderShippedRequest request,
        CancellationToken cancellationToken = default);

    Task<MerchantOrderFulfilmentResponse> MarkDeliveredAsync(
        Guid? actorUserId, Guid merchantOrderId,
        MerchantFulfilmentTransitionRequest request,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Inventory allocation and operational fulfilment for merchant orders.
///
/// Allocation opens only after the money is in: an order must be payment
/// confirmed, its invoice paid, and the order neither cancelled nor already
/// past preparation. Every allocation serialises on the same SKU application
/// lock the retail checkout uses, so retail and merchant demand contend on one
/// resource instead of racing through two independent code paths.
/// </summary>
public sealed class MerchantFulfilmentService : IMerchantFulfilmentService
{
    private const int MaxPageSize = 200;

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly IDocumentNumberService _documentNumbers;
    private readonly IShippingFulfilmentService? _shipping;
    private readonly TimeProvider _timeProvider;

    public MerchantFulfilmentService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        IDocumentNumberService documentNumbers,
        TimeProvider timeProvider,
        IShippingFulfilmentService? shipping = null)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _documentNumbers = documentNumbers;
        _timeProvider = timeProvider;
        _shipping = shipping;
    }

    // =====================================================================
    // Reading
    // =====================================================================

    public async Task<MerchantOrderAllocationSummary> GetAllocationSummaryAsync(
        Guid merchantOrderId, CancellationToken cancellationToken = default)
    {
        var order = await LoadOrderAsync(merchantOrderId, cancellationToken);
        return await BuildSummaryAsync(order, cancellationToken);
    }

    public async Task<(IReadOnlyCollection<MerchantEligibleInventoryItem> Items, int Total)>
        ListEligibleInventoryAsync(
            Guid merchantOrderId,
            Guid merchantOrderItemId,
            string? search,
            Guid? batchId,
            int page,
            int pageSize,
            CancellationToken cancellationToken = default)
    {
        var order = await LoadOrderAsync(merchantOrderId, cancellationToken);
        var item = RequireItem(order, merchantOrderItemId);

        var query = _dbContext.SmartTags
            .AsNoTracking()
            .Where(MerchantInventoryEligibility.For(_dbContext, item.ProductVariantId));

        if (batchId is { } batch)
        {
            query = query.Where(tag => tag.BatchId == batch);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(tag => tag.TagCode.Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);
        var size = Math.Clamp(pageSize, 1, MaxPageSize);
        var skip = Math.Max(0, page - 1) * size;

        var rows = await MerchantInventoryEligibility
            .InPickOrder(query)
            .Skip(skip)
            .Take(size)
            .Select(tag => new MerchantEligibleInventoryItem(
                tag.Id,
                tag.TagCode,
                tag.BatchId,
                tag.Batch == null ? null : tag.Batch.BatchNo,
                tag.FulfilmentStatus.ToString(),
                tag.PrintedAt,
                tag.CreatedAt))
            .ToListAsync(cancellationToken);

        return (rows, total);
    }

    public async Task<IReadOnlyCollection<MerchantAllocatedTagResponse>> ListAllocatedTagsAsync(
        Guid merchantOrderId,
        bool includeReleased,
        CancellationToken cancellationToken = default)
    {
        var query = _dbContext.MerchantOrderAllocatedTags
            .AsNoTracking()
            .Where(allocation => allocation.MerchantOrderId == merchantOrderId);

        if (!includeReleased)
        {
            query = query.Where(allocation => allocation.ReleasedAt == null);
        }

        return await query
            .OrderBy(allocation => allocation.AllocatedAt)
            .ThenBy(allocation => allocation.TagCodeSnapshot)
            .Select(allocation => new MerchantAllocatedTagResponse(
                allocation.Id,
                allocation.MerchantOrderItemId,
                allocation.SmartTagId,
                allocation.TagCodeSnapshot,
                allocation.BatchNoSnapshot,
                allocation.Status.ToString(),
                allocation.AllocatedAt,
                allocation.WasAutomatic,
                allocation.SentToMerchantAt,
                allocation.ReleasedAt,
                allocation.ReleasedReason,
                Convert.ToBase64String(allocation.RowVersion)))
            .ToListAsync(cancellationToken);
    }

    public async Task<MerchantOrderFulfilmentResponse> GetFulfilmentAsync(
        Guid merchantOrderId, CancellationToken cancellationToken = default)
    {
        var order = await LoadOrderAsync(merchantOrderId, cancellationToken);
        return await BuildFulfilmentAsync(order, cancellationToken);
    }

    // =====================================================================
    // Allocation
    // =====================================================================

    public async Task<MerchantOrderAllocationSummary> AllocateAsync(
        Guid? actorUserId,
        Guid merchantOrderId,
        AllocateMerchantInventoryRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(actorUserId, cancellationToken);
        var selected = (request.SmartTagIds ?? []).Distinct().ToArray();
        if (selected.Length == 0)
        {
            throw Validation("smartTagIds", "Choose at least one tag to allocate.");
        }

        var order = await LoadOrderAsync(merchantOrderId, cancellationToken, track: true);
        RequireAllocationAllowed(order);
        var item = RequireItem(order, request.MerchantOrderItemId);
        RequireToken(order, request.ConcurrencyToken);

        await using var inventoryLock = await AcquireLockAsync(item.ProductVariantId, cancellationToken);

        var allocatedNow = await CountAllocatedAsync(item.Id, cancellationToken);
        if (allocatedNow + selected.Length > item.Quantity)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "allocation_exceeds_order_quantity",
                $"This line needs {item.Quantity} units and {allocatedNow} are already allocated. "
                + $"Allocating {selected.Length} more would exceed the order.");
        }

        // Re-read eligibility inside the lock: the list the admin chose from
        // may be seconds old, and another admin may have taken these units.
        var eligible = await _dbContext.SmartTags
            .Where(MerchantInventoryEligibility.For(_dbContext, item.ProductVariantId))
            .Where(tag => selected.Contains(tag.Id))
            .Include(tag => tag.Batch)
            .ToListAsync(cancellationToken);

        if (eligible.Count != selected.Length)
        {
            var found = eligible.Select(tag => tag.Id).ToHashSet();
            var missing = selected.Where(id => !found.Contains(id)).ToArray();
            await ThrowForIneligibleAsync(missing, item, cancellationToken);
        }

        var now = _timeProvider.GetUtcNow();
        foreach (var tag in eligible)
        {
            _dbContext.MerchantOrderAllocatedTags.Add(
                NewAllocation(order, item, tag, admin.Id, now, automatic: false));
        }

        EnterPreparing(order, admin.Id, now);
        _auditLogService.Append(
            admin.Id, ActorType.Admin, "merchant-inventory.allocated",
            "MerchantOrder", order.Id,
            null,
            new
            {
                order.MerchantOrderNumber,
                merchantOrderItemId = item.Id,
                sku = item.SkuCodeSnapshot,
                allocated = eligible.Count,
                batches = eligible.Select(tag => tag.Batch?.BatchNo).Distinct().Count(),
            });

        await SaveAsync(cancellationToken);


        return await BuildSummaryAsync(order, cancellationToken);
    }

    public async Task<MerchantOrderAllocationSummary> AutoAllocateAsync(
        Guid? actorUserId,
        Guid merchantOrderId,
        AutoAllocateMerchantInventoryRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(actorUserId, cancellationToken);
        var order = await LoadOrderAsync(merchantOrderId, cancellationToken, track: true);
        RequireAllocationAllowed(order);
        var item = RequireItem(order, request.MerchantOrderItemId);
        RequireToken(order, request.ConcurrencyToken);

        await using var inventoryLock = await AcquireLockAsync(item.ProductVariantId, cancellationToken);

        var allocatedNow = await CountAllocatedAsync(item.Id, cancellationToken);
        var remaining = item.Quantity - allocatedNow;
        if (request.Quantity > remaining)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "allocation_exceeds_order_quantity",
                remaining <= 0
                    ? "This line is already fully allocated."
                    : $"Only {remaining} more unit(s) are needed on this line.");
        }

        var picked = await MerchantInventoryEligibility
            .InPickOrder(_dbContext.SmartTags
                .Where(MerchantInventoryEligibility.For(_dbContext, item.ProductVariantId)))
            .Take(request.Quantity)
            .Include(tag => tag.Batch)
            .ToListAsync(cancellationToken);

        if (picked.Count < request.Quantity)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "insufficient_inventory",
                $"Only {picked.Count} eligible unit(s) of {item.SkuCodeSnapshot} are in stock. "
                + $"{request.Quantity} were requested.");
        }

        var now = _timeProvider.GetUtcNow();
        foreach (var tag in picked)
        {
            _dbContext.MerchantOrderAllocatedTags.Add(
                NewAllocation(order, item, tag, admin.Id, now, automatic: true));
        }

        EnterPreparing(order, admin.Id, now);
        _auditLogService.Append(
            admin.Id, ActorType.Admin, "merchant-inventory.auto-allocated",
            "MerchantOrder", order.Id,
            null,
            new
            {
                order.MerchantOrderNumber,
                merchantOrderItemId = item.Id,
                sku = item.SkuCodeSnapshot,
                allocated = picked.Count,
                batches = picked.Select(tag => tag.Batch?.BatchNo).Distinct().Count(),
            });

        await SaveAsync(cancellationToken);


        return await BuildSummaryAsync(order, cancellationToken);
    }

    public async Task<MerchantOrderAllocationSummary> ReleaseAsync(
        Guid? actorUserId,
        Guid merchantOrderId,
        ReleaseMerchantInventoryRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(actorUserId, cancellationToken);
        var ids = (request.AllocationIds ?? []).Distinct().ToArray();
        if (ids.Length == 0)
        {
            throw Validation("allocationIds", "Choose at least one allocated tag to release.");
        }

        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            throw Validation("reason", "Give the reason this inventory is being released.");
        }

        var order = await LoadOrderAsync(merchantOrderId, cancellationToken, track: true);
        if (order.FulfilmentStatus is MerchantOrderFulfilmentStatus.Shipped
            or MerchantOrderFulfilmentStatus.Delivered)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "allocation_not_allowed",
                "This order has shipped. Its inventory stays with the merchant.");
        }

        RequireToken(order, request.ConcurrencyToken);

        var allocations = await _dbContext.MerchantOrderAllocatedTags
            .Where(allocation =>
                allocation.MerchantOrderId == order.Id
                && ids.Contains(allocation.Id)
                && allocation.ReleasedAt == null)
            .ToListAsync(cancellationToken);

        if (allocations.Count == 0)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "concurrency_conflict",
                "Those allocations were already released. Reload and try again.");
        }

        var now = _timeProvider.GetUtcNow();
        foreach (var allocation in allocations)
        {
            allocation.ReleasedAt = now;
            allocation.ReleasedReason = request.Reason.Trim();
            allocation.ReleasedByAdminUserId = admin.Id;
        }

        // Releasing below the required quantity invalidates readiness.
        if (order.FulfilmentStatus == MerchantOrderFulfilmentStatus.ReadyToShip)
        {
            order.FulfilmentStatus = MerchantOrderFulfilmentStatus.Preparing;
            order.ReadyToShipAt = null;
        }

        order.FulfilmentUpdatedByAdminUserId = admin.Id;
        order.UpdatedAt = now;
        _auditLogService.Append(
            admin.Id, ActorType.Admin, "merchant-inventory.released",
            "MerchantOrder", order.Id,
            null,
            new
            {
                order.MerchantOrderNumber,
                released = allocations.Count,
                reason = request.Reason.Trim(),
            });

        await SaveAsync(cancellationToken);


        return await BuildSummaryAsync(order, cancellationToken);
    }

    // =====================================================================
    // Fulfilment transitions
    // =====================================================================

    public async Task<MerchantOrderFulfilmentResponse> MarkPreparingAsync(
        Guid? actorUserId, Guid merchantOrderId,
        MerchantFulfilmentTransitionRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(actorUserId, cancellationToken);
        var order = await LoadOrderAsync(merchantOrderId, cancellationToken, track: true);
        RequireAllocationAllowed(order);
        RequireToken(order, request.ConcurrencyToken);

        // Repeating the step is a no-op rather than an error.
        if (order.FulfilmentStatus == MerchantOrderFulfilmentStatus.Preparing)
        {
            return await BuildFulfilmentAsync(order, cancellationToken);
        }

        // EnterPreparing writes the audit event, so the explicit button and the
        // implicit first allocation leave one identical trail.
        var now = _timeProvider.GetUtcNow();
        EnterPreparing(order, admin.Id, now);

        await SaveAsync(cancellationToken);
        return await BuildFulfilmentAsync(order, cancellationToken);
    }

    public async Task<MerchantOrderFulfilmentResponse> MarkReadyToShipAsync(
        Guid? actorUserId, Guid merchantOrderId,
        MerchantFulfilmentTransitionRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(actorUserId, cancellationToken);
        var order = await LoadOrderAsync(merchantOrderId, cancellationToken, track: true);
        RequirePaymentConfirmed(order);
        RequireToken(order, request.ConcurrencyToken);

        if (order.FulfilmentStatus == MerchantOrderFulfilmentStatus.ReadyToShip)
        {
            return await BuildFulfilmentAsync(order, cancellationToken);
        }

        if (order.FulfilmentStatus is MerchantOrderFulfilmentStatus.Shipped
            or MerchantOrderFulfilmentStatus.Delivered)
        {
            throw InvalidTransition(order.FulfilmentStatus, "ready to ship");
        }

        var progress = await LoadProgressAsync(order, cancellationToken);
        var shortfall = progress.Where(row => row.Allocated < row.Required).ToArray();
        if (shortfall.Length > 0)
        {
            var first = shortfall[0];
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "allocation_incomplete",
                $"{first.Sku} still needs {first.Required - first.Allocated} more unit(s). "
                + "Every line must be fully allocated before the order is ready to ship.");
        }

        if (string.IsNullOrWhiteSpace(order.DeliveryAddressLine1Snapshot))
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "allocation_not_allowed",
                "This order has no delivery address recorded, so it cannot be marked ready to ship.");
        }

        var now = _timeProvider.GetUtcNow();
        order.FulfilmentStatus = MerchantOrderFulfilmentStatus.ReadyToShip;
        order.ReadyToShipAt = now;
        order.PreparingAt ??= now;
        order.FulfilmentUpdatedByAdminUserId = admin.Id;
        order.UpdatedAt = now;
        _auditLogService.Append(
            admin.Id, ActorType.Admin, "merchant-order.ready-to-ship",
            "MerchantOrder", order.Id, null,
            new
            {
                order.MerchantOrderNumber,
                allocated = progress.Sum(row => row.Allocated),
                readyToShipAt = now,
            });

        await SaveAsync(cancellationToken);


        return await BuildFulfilmentAsync(order, cancellationToken);
    }

    public async Task<MerchantOrderFulfilmentResponse> MarkShippedAsync(
        Guid? actorUserId, Guid merchantOrderId,
        MarkMerchantOrderShippedRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(actorUserId, cancellationToken);
        var order = await LoadOrderAsync(merchantOrderId, cancellationToken, track: true);
        RequirePaymentConfirmed(order);
        RequireToken(order, request.ConcurrencyToken);

        if (order.FulfilmentStatus is MerchantOrderFulfilmentStatus.Shipped
            or MerchantOrderFulfilmentStatus.Delivered)
        {
            // Repeating the step must not ship a second time.
            return await BuildFulfilmentAsync(order, cancellationToken);
        }

        if (order.FulfilmentStatus != MerchantOrderFulfilmentStatus.ReadyToShip)
        {
            throw InvalidTransition(order.FulfilmentStatus, "shipped");
        }

        if (string.IsNullOrWhiteSpace(request.TrackingNumber))
        {
            throw new ApiException(
                StatusCodes.Status400BadRequest,
                "tracking_required",
                "Enter the tracking number before marking this order shipped.");
        }

        var progress = await LoadProgressAsync(order, cancellationToken);
        if (progress.Any(row => row.Allocated != row.Required))
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "allocation_incomplete",
                "Every line must be fully allocated before the order ships.");
        }

        var courier = await ResolveCourierAsync(request, cancellationToken);
        var now = _timeProvider.GetUtcNow();

        order.CourierProviderCode = courier.Code;
        order.CourierProvider = courier.DisplayName;
        order.CourierService = Trim(request.CourierService);
        order.TrackingNumber = request.TrackingNumber.Trim();
        order.TrackingUrlSnapshot = courier.TrackingUrlTemplate is { Length: > 0 } template
            ? template.Replace("{trackingNumber}", Uri.EscapeDataString(order.TrackingNumber))
            : null;
        order.InternalCourierCost = request.InternalCourierCost;
        order.InternalShippingNotes = Trim(request.InternalShippingNotes);
        order.FulfilmentStatus = MerchantOrderFulfilmentStatus.Shipped;
        order.ShippedAt = now;
        order.FulfilmentUpdatedByAdminUserId = admin.Id;
        order.UpdatedAt = now;

        // The tags leave the building. They become the merchant's stock, stay
        // unassigned to any pet, and are no longer available to retail or to
        // another merchant order.
        var allocations = await _dbContext.MerchantOrderAllocatedTags
            .Where(allocation =>
                allocation.MerchantOrderId == order.Id && allocation.ReleasedAt == null)
            .Include(allocation => allocation.SmartTag)
            .ToListAsync(cancellationToken);

        foreach (var allocation in allocations)
        {
            allocation.Status = MerchantAllocationStatus.SentToMerchant;
            allocation.SentToMerchantAt = now;

            var tag = allocation.SmartTag!;
            tag.FulfilmentStatus = TagFulfilmentStatus.SentToReseller;
            tag.SentToResellerAt ??= now;
            tag.UpdatedAt = now;
            // Status stays Unclaimed on purpose: the final pet owner still has
            // to scan and activate the tag themselves.
        }

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "merchant-order.shipped",
            "MerchantOrder", order.Id, null,
            new
            {
                order.MerchantOrderNumber,
                courier = order.CourierProvider,
                trackingNumber = order.TrackingNumber,
                tags = allocations.Count,
                shippedAt = now,
            });

        await SaveAsync(cancellationToken);


        return await BuildFulfilmentAsync(order, cancellationToken);
    }

    public async Task<MerchantOrderFulfilmentResponse> MarkDeliveredAsync(
        Guid? actorUserId, Guid merchantOrderId,
        MerchantFulfilmentTransitionRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(actorUserId, cancellationToken);
        var order = await LoadOrderAsync(merchantOrderId, cancellationToken, track: true);
        RequireToken(order, request.ConcurrencyToken);

        if (order.FulfilmentStatus == MerchantOrderFulfilmentStatus.Delivered)
        {
            return await BuildFulfilmentAsync(order, cancellationToken);
        }

        if (order.FulfilmentStatus != MerchantOrderFulfilmentStatus.Shipped)
        {
            throw InvalidTransition(order.FulfilmentStatus, "delivered");
        }

        var now = _timeProvider.GetUtcNow();
        order.FulfilmentStatus = MerchantOrderFulfilmentStatus.Delivered;
        order.DeliveredAt = now;
        order.FulfilmentUpdatedByAdminUserId = admin.Id;
        order.UpdatedAt = now;

        _auditLogService.Append(
            admin.Id, ActorType.Admin, "merchant-order.delivered",
            "MerchantOrder", order.Id, null,
            new { order.MerchantOrderNumber, deliveredAt = now });

        await SaveAsync(cancellationToken);
        return await BuildFulfilmentAsync(order, cancellationToken);
    }

    // =====================================================================
    // Delivery order
    // =====================================================================

    public async Task<MerchantDeliveryOrderResponse?> GetDeliveryOrderAsync(
        Guid merchantOrderId, CancellationToken cancellationToken = default)
    {
        var record = await _dbContext.MerchantDeliveryOrders
            .AsNoTracking()
            .Include(document => document.Items)
            .FirstOrDefaultAsync(
                document => document.MerchantOrderId == merchantOrderId
                    && document.CancelledAt == null,
                cancellationToken);

        return record is null ? null : MapDeliveryOrder(record);
    }

    public async Task<MerchantDeliveryOrderResponse> IssueDeliveryOrderAsync(
        Guid? actorUserId, Guid merchantOrderId,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(actorUserId, cancellationToken);
        var order = await LoadOrderAsync(merchantOrderId, cancellationToken, track: true);

        // Issuing again returns what already exists rather than numbering a
        // second document for the same shipment.
        var existing = await GetDeliveryOrderAsync(order.Id, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        RequirePaymentConfirmed(order);
        if (order.FulfilmentStatus is not (MerchantOrderFulfilmentStatus.ReadyToShip
            or MerchantOrderFulfilmentStatus.Shipped
            or MerchantOrderFulfilmentStatus.Delivered))
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "delivery_order_not_ready",
                "Mark the order ready to ship before issuing its delivery order.");
        }

        var progress = await LoadProgressAsync(order, cancellationToken);
        if (progress.Any(row => row.Allocated != row.Required))
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "allocation_incomplete",
                "Every line must be fully allocated before the delivery order is issued.");
        }

        var now = _timeProvider.GetUtcNow();
        var document = new MerchantDeliveryOrder
        {
            DeliveryOrderNumber =
                await _documentNumbers.NextMerchantDeliveryOrderNumberAsync(now, cancellationToken),
            MerchantOrderId = order.Id,
            MerchantOrderNumberSnapshot = order.MerchantOrderNumber,
            MerchantId = order.MerchantId,
            MerchantCodeSnapshot = order.MerchantCodeSnapshot,
            MerchantLegalNameSnapshot = order.MerchantLegalNameSnapshot,
            MerchantTradingNameSnapshot = order.MerchantTradingNameSnapshot,
            ContactPersonSnapshot = order.ContactPersonSnapshot,
            ContactEmailSnapshot = order.ContactEmailSnapshot,
            ContactPhoneSnapshot = order.ContactPhoneSnapshot,
            DeliveryAddressLine1Snapshot = order.DeliveryAddressLine1Snapshot,
            DeliveryAddressLine2Snapshot = order.DeliveryAddressLine2Snapshot,
            DeliveryPostcodeSnapshot = order.DeliveryPostcodeSnapshot,
            DeliveryCitySnapshot = order.DeliveryCitySnapshot,
            DeliveryStateSnapshot = order.DeliveryStateSnapshot,
            DeliveryCountrySnapshot = order.DeliveryCountrySnapshot,
            CourierProviderSnapshot = order.CourierProvider,
            CourierServiceSnapshot = order.CourierService,
            TrackingNumberSnapshot = order.TrackingNumber,
            IssuedAt = now,
            IssuedByAdminUserId = admin.Id,
        };

        foreach (var row in progress.OrderBy(row => row.SortOrder))
        {
            document.Items.Add(new MerchantDeliveryOrderItem
            {
                MerchantOrderItemId = row.ItemId,
                ProductNameSnapshot = row.ProductName,
                SkuCodeSnapshot = row.Sku,
                OptionNameSnapshot = row.OptionName,
                SupportsQrSnapshot = row.SupportsQr,
                SupportsNfcSnapshot = row.SupportsNfc,
                OrderedQuantity = row.Required,
                AllocatedQuantity = row.Allocated,
                // Batch numbers and counts only: no tag codes, no database ids.
                BatchSummarySnapshot = FormatBatches(row.Batches),
                SortOrder = row.SortOrder,
            });
        }

        _dbContext.MerchantDeliveryOrders.Add(document);
        _auditLogService.Append(
            admin.Id, ActorType.Admin, "merchant-delivery-order.issued",
            "MerchantDeliveryOrder", document.Id, null,
            new
            {
                document.DeliveryOrderNumber,
                order.MerchantOrderNumber,
                lines = document.Items.Count,
                issuedAt = now,
            });

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsUniqueViolation(exception))
        {
            // The unique filtered index caught a concurrent issue. Return the
            // document that won rather than reporting a database failure.
            _dbContext.Entry(document).State = EntityState.Detached;
            var concurrent = await GetDeliveryOrderAsync(order.Id, cancellationToken);
            if (concurrent is not null)
            {
                return concurrent;
            }

            throw new ApiException(
                StatusCodes.Status409Conflict,
                "delivery_order_already_issued",
                "A delivery order was already issued for this merchant order.");
        }

        return MapDeliveryOrder(document);
    }

    // =====================================================================
    // Internals
    // =====================================================================

    private sealed record ItemProgress(
        Guid ItemId,
        Guid ProductVariantId,
        string ProductName,
        string Sku,
        string OptionName,
        bool SupportsQr,
        bool SupportsNfc,
        int Required,
        int Allocated,
        int SortOrder,
        IReadOnlyList<MerchantAllocationBatchSummary> Batches);

    private async Task<MerchantOrder> LoadOrderAsync(
        Guid merchantOrderId, CancellationToken cancellationToken, bool track = false)
    {
        var query = _dbContext.MerchantOrders.Include(order => order.Items).AsQueryable();
        if (!track)
        {
            query = query.AsNoTracking();
        }

        return await query.FirstOrDefaultAsync(order => order.Id == merchantOrderId, cancellationToken)
            ?? throw new ApiException(
                StatusCodes.Status404NotFound,
                "merchant_order_not_found",
                "That merchant order could not be found.");
    }

    private static MerchantOrderItem RequireItem(MerchantOrder order, Guid itemId) =>
        order.Items.FirstOrDefault(item => item.Id == itemId)
            ?? throw new ApiException(
                StatusCodes.Status404NotFound,
                "merchant_order_item_not_found",
                "That order line could not be found on this merchant order.");

    private async Task<AdminUser> RequireAdminAsync(
        Guid? actorUserId, CancellationToken cancellationToken)
    {
        if (actorUserId is null)
        {
            throw new ApiException(
                StatusCodes.Status401Unauthorized, "unauthorized", "Authentication is required.");
        }

        return await _dbContext.AdminUsers
            .FirstOrDefaultAsync(
                admin => admin.UserId == actorUserId && admin.IsActive, cancellationToken)
            ?? throw new ApiException(
                StatusCodes.Status403Forbidden, "forbidden", "Admin access is required.");
    }

    private static void RequirePaymentConfirmed(MerchantOrder order)
    {
        if (order.PaymentStatus == MerchantOrderPaymentStatus.Cancelled
            || order.CancelledAt is not null)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "order_cancelled",
                "This merchant order was cancelled.");
        }

        if (order.PaymentStatus != MerchantOrderPaymentStatus.PaymentConfirmed)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "payment_not_confirmed",
                "Inventory is allocated only after the merchant's payment is confirmed.");
        }
    }

    private static void RequireAllocationAllowed(MerchantOrder order)
    {
        RequirePaymentConfirmed(order);

        if (order.FulfilmentStatus is MerchantOrderFulfilmentStatus.Shipped
            or MerchantOrderFulfilmentStatus.Delivered)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "allocation_not_allowed",
                "This order has shipped, so its inventory can no longer be changed.");
        }
    }

    private static void RequireToken(MerchantOrder order, string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return;
        }

        byte[] supplied;
        try
        {
            supplied = Convert.FromBase64String(token);
        }
        catch (FormatException)
        {
            throw new ApiException(
                StatusCodes.Status400BadRequest,
                "invalid_concurrency_token",
                "That edit token is not valid. Reload and try again.");
        }

        if (!supplied.SequenceEqual(order.RowVersion))
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "concurrency_conflict",
                "Someone else changed this order. Reload and try again.");
        }
    }

    private void EnterPreparing(MerchantOrder order, Guid adminId, DateTimeOffset now)
    {
        // Retail moves an order into preparation as soon as the first tag is
        // assigned; merchant orders follow the same convention so an admin
        // never has to remember a separate button before allocating.
        if (order.FulfilmentStatus == MerchantOrderFulfilmentStatus.NotStarted)
        {
            order.FulfilmentStatus = MerchantOrderFulfilmentStatus.Preparing;
            order.PreparingAt ??= now;

            // The implicit entry is the one that usually happens, so it has to
            // leave the same trail as the explicit button.
            _auditLogService.Append(
                adminId, ActorType.Admin, "merchant-order.preparing",
                "MerchantOrder", order.Id, null,
                new { order.MerchantOrderNumber, preparingAt = order.PreparingAt, implicitEntry = true });
        }

        order.FulfilmentUpdatedByAdminUserId = adminId;
        order.UpdatedAt = now;
    }

    private MerchantOrderAllocatedTag NewAllocation(
        MerchantOrder order,
        MerchantOrderItem item,
        SmartTag tag,
        Guid adminId,
        DateTimeOffset now,
        bool automatic) =>
        new()
        {
            MerchantOrderId = order.Id,
            MerchantOrderItemId = item.Id,
            MerchantId = order.MerchantId,
            SmartTagId = tag.Id,
            TagCodeSnapshot = tag.TagCode,
            ProductVariantId = item.ProductVariantId,
            BatchId = tag.BatchId,
            BatchNoSnapshot = tag.Batch?.BatchNo,
            Status = MerchantAllocationStatus.Allocated,
            AllocatedAt = now,
            AllocatedByAdminUserId = adminId,
            WasAutomatic = automatic,
        };

    private Task<int> CountAllocatedAsync(Guid itemId, CancellationToken cancellationToken) =>
        _dbContext.MerchantOrderAllocatedTags.CountAsync(
            allocation =>
                allocation.MerchantOrderItemId == itemId && allocation.ReleasedAt == null,
            cancellationToken);

    private async Task<IReadOnlyList<ItemProgress>> LoadProgressAsync(
        MerchantOrder order, CancellationToken cancellationToken)
    {
        var allocations = await _dbContext.MerchantOrderAllocatedTags
            .AsNoTracking()
            .Where(allocation =>
                allocation.MerchantOrderId == order.Id && allocation.ReleasedAt == null)
            .Select(allocation => new
            {
                allocation.MerchantOrderItemId,
                allocation.BatchId,
                allocation.BatchNoSnapshot,
            })
            .ToListAsync(cancellationToken);

        return order.Items
            .OrderBy(item => item.SortOrder)
            .Select(item =>
            {
                var mine = allocations
                    .Where(allocation => allocation.MerchantOrderItemId == item.Id)
                    .ToList();
                var batches = mine
                    .GroupBy(allocation => new { allocation.BatchId, allocation.BatchNoSnapshot })
                    .OrderBy(group => group.Key.BatchNoSnapshot)
                    .Select(group => new MerchantAllocationBatchSummary(
                        group.Key.BatchId,
                        group.Key.BatchNoSnapshot ?? "Unbatched",
                        group.Count()))
                    .ToList();

                return new ItemProgress(
                    item.Id,
                    item.ProductVariantId,
                    item.ProductNameSnapshot,
                    item.SkuCodeSnapshot,
                    item.OptionNameSnapshot,
                    item.SupportsQrSnapshot,
                    item.SupportsNfcSnapshot,
                    item.Quantity,
                    mine.Count,
                    item.SortOrder,
                    batches);
            })
            .ToList();
    }

    private async Task<MerchantOrderAllocationSummary> BuildSummaryAsync(
        MerchantOrder order, CancellationToken cancellationToken)
    {
        var progress = await LoadProgressAsync(order, cancellationToken);

        var available = new Dictionary<Guid, int>();
        foreach (var variantId in progress.Select(row => row.ProductVariantId).Distinct())
        {
            available[variantId] = await _dbContext.SmartTags.CountAsync(
                MerchantInventoryEligibility.For(_dbContext, variantId), cancellationToken);
        }

        var items = progress
            .Select(row => new MerchantOrderItemAllocationProgress(
                row.ItemId,
                row.ProductVariantId,
                row.ProductName,
                row.Sku,
                row.OptionName,
                row.SupportsQr,
                row.SupportsNfc,
                row.Required,
                row.Allocated,
                Math.Max(0, row.Required - row.Allocated),
                row.Allocated >= row.Required,
                available.GetValueOrDefault(row.ProductVariantId),
                row.Batches))
            .ToList();

        var required = items.Sum(item => item.RequiredUnits);
        var allocated = items.Sum(item => item.AllocatedUnits);
        var complete = items.Count > 0 && items.All(item => item.IsFullyAllocated);
        var blocked = AllocationBlockedReason(order);

        return new MerchantOrderAllocationSummary(
            order.Id,
            order.MerchantOrderNumber,
            order.PaymentStatus.ToString(),
            order.FulfilmentStatus.ToString(),
            blocked is null,
            blocked,
            required,
            allocated,
            Math.Max(0, required - allocated),
            complete,
            blocked is null
                && complete
                && order.FulfilmentStatus is MerchantOrderFulfilmentStatus.NotStarted
                    or MerchantOrderFulfilmentStatus.Preparing,
            items,
            Convert.ToBase64String(order.RowVersion));
    }

    private static string? AllocationBlockedReason(MerchantOrder order)
    {
        if (order.PaymentStatus == MerchantOrderPaymentStatus.Cancelled || order.CancelledAt is not null)
        {
            return "This merchant order was cancelled.";
        }

        if (order.PaymentStatus != MerchantOrderPaymentStatus.PaymentConfirmed)
        {
            return "Inventory is allocated only after the merchant's payment is confirmed.";
        }

        return order.FulfilmentStatus is MerchantOrderFulfilmentStatus.Shipped
            or MerchantOrderFulfilmentStatus.Delivered
            ? "This order has shipped, so its inventory can no longer be changed."
            : null;
    }

    private async Task<MerchantOrderFulfilmentResponse> BuildFulfilmentAsync(
        MerchantOrder order, CancellationToken cancellationToken)
    {
        var summary = await BuildSummaryAsync(order, cancellationToken);
        var deliveryOrder = await GetDeliveryOrderAsync(order.Id, cancellationToken);

        return new MerchantOrderFulfilmentResponse(
            order.Id,
            order.MerchantOrderNumber,
            order.PaymentStatus.ToString(),
            order.FulfilmentStatus.ToString(),
            order.CourierProviderCode,
            order.CourierProvider,
            order.CourierService,
            order.TrackingNumber,
            order.TrackingUrlSnapshot,
            order.InternalCourierCost,
            order.InternalShippingNotes,
            order.PreparingAt,
            order.ReadyToShipAt,
            order.ShippedAt,
            order.DeliveredAt,
            summary,
            deliveryOrder,
            Convert.ToBase64String(order.RowVersion));
    }

    private static MerchantDeliveryOrderResponse MapDeliveryOrder(MerchantDeliveryOrder document) =>
        new(
            document.Id,
            document.DeliveryOrderNumber,
            document.MerchantOrderId,
            document.MerchantOrderNumberSnapshot,
            document.MerchantCodeSnapshot,
            document.MerchantLegalNameSnapshot,
            document.MerchantTradingNameSnapshot,
            document.ContactPersonSnapshot,
            document.ContactEmailSnapshot,
            document.ContactPhoneSnapshot,
            new MerchantSalesAddressSnapshot(
                document.DeliveryAddressLine1Snapshot,
                document.DeliveryAddressLine2Snapshot,
                document.DeliveryPostcodeSnapshot,
                document.DeliveryCitySnapshot,
                document.DeliveryStateSnapshot,
                document.DeliveryCountrySnapshot),
            document.CourierProviderSnapshot,
            document.CourierServiceSnapshot,
            document.TrackingNumberSnapshot,
            document.IssuedAt,
            document.Items
                .OrderBy(item => item.SortOrder)
                .Select(item => new MerchantDeliveryOrderItemResponse(
                    item.MerchantOrderItemId,
                    item.ProductNameSnapshot,
                    item.SkuCodeSnapshot,
                    item.OptionNameSnapshot,
                    item.SupportsQrSnapshot,
                    item.SupportsNfcSnapshot,
                    item.OrderedQuantity,
                    item.AllocatedQuantity,
                    item.BatchSummarySnapshot))
                .ToList(),
            Convert.ToBase64String(document.RowVersion));

    private static string FormatBatches(IReadOnlyList<MerchantAllocationBatchSummary> batches) =>
        batches.Count == 0
            ? "—"
            : string.Join("; ", batches.Select(batch => $"{batch.BatchNo} x {batch.Quantity}"));

    private async Task<(string? Code, string DisplayName, string? TrackingUrlTemplate)>
        ResolveCourierAsync(
            MarkMerchantOrderShippedRequest request, CancellationToken cancellationToken)
    {
        var code = Trim(request.CourierProviderCode);
        var custom = Trim(request.CourierProviderName);

        if (code is not null)
        {
            var provider = await _dbContext.ShippingCourierProviders
                .AsNoTracking()
                .FirstOrDefaultAsync(row => row.Code == code, cancellationToken);
            if (provider is null)
            {
                throw Validation("courierProviderCode", "Choose a configured courier.");
            }

            return (provider.Code, provider.DisplayName, provider.TrackingUrlTemplate);
        }

        if (custom is not null)
        {
            return (null, custom, null);
        }

        var fallback = await _dbContext.ShippingCourierProviders
            .AsNoTracking()
            .Where(row => row.IsActive && row.IsDefault)
            .FirstOrDefaultAsync(cancellationToken);

        return fallback is null
            ? throw Validation("courierProviderCode", "Choose the courier carrying this shipment.")
            : (fallback.Code, fallback.DisplayName, fallback.TrackingUrlTemplate);
    }

    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "concurrency_conflict",
                "Someone else changed this record. Reload and try again.");
        }
        catch (DbUpdateException exception) when (IsUniqueViolation(exception))
        {
            // The active-allocation unique index rejected a tag that another
            // request took first. The admin never sees the database error.
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "inventory_already_allocated",
                "One or more of those tags were allocated to another order first. "
                + "Reload the eligible list and try again.");
        }
    }

    private async Task ThrowForIneligibleAsync(
        IReadOnlyCollection<Guid> missing, MerchantOrderItem item, CancellationToken cancellationToken)
    {
        var rows = await _dbContext.SmartTags
            .AsNoTracking()
            .Where(tag => missing.Contains(tag.Id))
            .Select(tag => new
            {
                tag.Id,
                tag.TagCode,
                tag.ProductVariantId,
                Allocated = _dbContext.MerchantOrderAllocatedTags.Any(allocation =>
                    allocation.SmartTagId == tag.Id && allocation.ReleasedAt == null),
            })
            .ToListAsync(cancellationToken);

        if (rows.Count < missing.Count)
        {
            throw new ApiException(
                StatusCodes.Status404NotFound,
                "inventory_not_eligible",
                "One or more of those tags no longer exist. Reload the eligible list.");
        }

        var wrongSku = rows.FirstOrDefault(row => row.ProductVariantId != item.ProductVariantId);
        if (wrongSku is not null)
        {
            throw new ApiException(
                StatusCodes.Status400BadRequest,
                "sku_mismatch",
                $"Tag {wrongSku.TagCode} is not a {item.SkuCodeSnapshot} unit.");
        }

        var taken = rows.FirstOrDefault(row => row.Allocated);
        if (taken is not null)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "inventory_already_allocated",
                $"Tag {taken.TagCode} is already allocated to another merchant order.");
        }

        throw new ApiException(
            StatusCodes.Status409Conflict,
            "inventory_not_eligible",
            $"Tag {rows[0].TagCode} is not available for a merchant order. "
            + "It may be reserved, activated, or already sent onward.");
    }

    private async Task<IAsyncDisposable?> AcquireLockAsync(
        Guid productVariantId, CancellationToken cancellationToken) =>
        _dbContext.Database.IsSqlServer()
            ? await SqlServerInventoryReservationLock.AcquireAsync(
                _dbContext, [productVariantId], cancellationToken)
            : null;

    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is Microsoft.Data.SqlClient.SqlException sql
        && sql.Number is 2601 or 2627;

    private static ApiException InvalidTransition(
        MerchantOrderFulfilmentStatus current, string target) =>
        new(
            StatusCodes.Status409Conflict,
            "invalid_fulfilment_transition",
            $"An order that is {Describe(current)} cannot become {target}.");

    private static string Describe(MerchantOrderFulfilmentStatus status) => status switch
    {
        MerchantOrderFulfilmentStatus.NotStarted => "not yet in preparation",
        MerchantOrderFulfilmentStatus.Preparing => "still being prepared",
        MerchantOrderFulfilmentStatus.ReadyToShip => "ready to ship",
        MerchantOrderFulfilmentStatus.Shipped => "already shipped",
        _ => "already delivered",
    };

    private static ApiException Validation(string field, string message) =>
        new(
            StatusCodes.Status400BadRequest,
            "validation_failed",
            "Please check the submitted fields.",
            new Dictionary<string, string[]> { [field] = [message] });

    private static string? Trim(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
