using System.Security.Cryptography;
using System.Text;
using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class OrderService : SkeletonService, IOrderService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly FeatureOptions _features;
    private readonly ITagPricingService _pricingService;
    private readonly IDeliveryService _deliveryService;
    private readonly IBusinessReferenceGenerator _businessReferences;
    private readonly TimeProvider _timeProvider;
    private readonly IShippingFulfilmentService _shippingFulfilmentService;
    private readonly ITagOrderInventoryAvailabilityService? _inventoryAvailability;
    private readonly IOrderCheckoutSettingsService? _checkoutSettings;
    private readonly IAuditLogService _auditLogService;

    public OrderService(
        MyPetLinkDbContext dbContext,
        IOptions<FeatureOptions> features,
        ITagPricingService pricingService,
        IDeliveryService deliveryService)
        : this(
            dbContext,
            features,
            pricingService,
            deliveryService,
            new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()),
            TimeProvider.System,
            inventoryAvailability: null)
    {
    }

    public OrderService(
        MyPetLinkDbContext dbContext,
        IOptions<FeatureOptions> features,
        ITagPricingService pricingService,
        IDeliveryService deliveryService,
        IBusinessReferenceGenerator businessReferences,
        TimeProvider timeProvider,
        IShippingFulfilmentService? shippingFulfilmentService = null,
        ITagOrderInventoryAvailabilityService? inventoryAvailability = null,
        IOrderCheckoutSettingsService? checkoutSettings = null,
        IAuditLogService? auditLogService = null)
    {
        _dbContext = dbContext;
        _features = features.Value;
        _pricingService = pricingService;
        _deliveryService = deliveryService;
        _businessReferences = businessReferences;
        _timeProvider = timeProvider;
        _shippingFulfilmentService = shippingFulfilmentService
            ?? new ShippingFulfilmentService(
                dbContext,
                new AuditLogService(dbContext, new HttpContextAccessor()),
                timeProvider);
        _inventoryAvailability = inventoryAvailability;
        _checkoutSettings = checkoutSettings;
        _auditLogService = auditLogService
            ?? new AuditLogService(dbContext, new HttpContextAccessor());
    }

    public async Task<(IReadOnlyCollection<TagOrderResponse> Items, int Total)> ListAsync(
        Guid? currentUserId,
        int page,
        int pageSize,
        string? status,
        string? paymentStatus,
        Guid? petId,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);

        if (petId.HasValue)
        {
            await EnsureOwnedPetExistsAsync(userId, petId.Value, cancellationToken);
        }

        var query = OwnedOrdersQuery(userId).AsNoTracking();

        if (petId.HasValue)
        {
            query = query.Where(order =>
                order.PetId == petId.Value
                || order.Items.Any(item => item.PetId == petId.Value));
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsedStatus = ParseOrderStatus(status);
            query = query.Where(order => order.Status == parsedStatus);
        }

        if (!string.IsNullOrWhiteSpace(paymentStatus))
        {
            var parsedPaymentStatus = ParsePaymentStatus(paymentStatus);
            query = query.Where(order => order.PaymentStatus == parsedPaymentStatus);
        }

        var total = await query.CountAsync(cancellationToken);
        var orders = await IncludeOrderResponseGraph(query)
            .OrderByDescending(order => order.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var trackingUrls = await _shippingFulfilmentService.GetCustomerTrackingUrlsAsync(
            orders,
            cancellationToken);
        return (
            orders.Select(order => TagDtoMapper.ToOrderResponse(
                order,
                trackingUrls.GetValueOrDefault(order.Id))).ToArray(),
            total);
    }

    public async Task<TagOrderResponse> GetAsync(
        Guid? currentUserId,
        string orderKey,
        CancellationToken cancellationToken = default)
    {
        var order = await LoadOwnedOrderAsync(currentUserId, orderKey, trackChanges: false, cancellationToken);
        var trackingUrl = await _shippingFulfilmentService.GetCustomerTrackingUrlAsync(
            order,
            cancellationToken);
        return TagDtoMapper.ToOrderResponse(order, trackingUrl);
    }

    public async Task<CreateTagOrderResponse> CreateAsync(
        Guid? currentUserId,
        CreateTagOrderRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_features.SmartTagOrderingEnabled)
        {
            throw FeatureDisabled();
        }

        var userId = RequireUserId(currentUserId);
        await EnsureUserExistsAsync(userId, cancellationToken);
        ValidateCreateRequest(request);

        // Idempotency: a repeat of the same submission attempt (same key +
        // same payload) returns the original order instead of creating another.
        var idempotencyKey = NormalizeOptional(request.IdempotencyKey);
        var fingerprint = idempotencyKey is null ? null : ComputeRequestFingerprint(request);

        if (idempotencyKey is not null)
        {
            var existing = await FindByIdempotencyKeyAsync(userId, idempotencyKey, cancellationToken);
            if (existing is not null)
            {
                return await BuildIdempotentReplayAsync(userId, existing, fingerprint!, cancellationToken);
            }
        }

        var requestedItems = NormalizeCreateItems(request.Items);
        var requestedPetIds = requestedItems.Select(item => item.PetId).Distinct().ToArray();
        var pets = await _dbContext.Pets
            .Where(item =>
                requestedPetIds.Contains(item.Id)
                && item.OwnerUserId == userId
                && item.DeletedAt == null)
            .ToDictionaryAsync(item => item.Id, cancellationToken);
        if (pets.Count != requestedPetIds.Length)
        {
            // Privacy-preserving: an absent and a cross-owner pet are identical.
            throw NotFound("One or more pets were not found.");
        }
        if (pets.Values.Any(pet => pet.LifecycleStatus != PetLifecycleStatus.Active || pet.ArchivedAt.HasValue))
        {
            throw InvalidState("Physical tags can only be ordered for active pet profiles.");
        }

        var primaryPet = pets[requestedItems[0].PetId];

        SmartTag? replacementForTag = null;

        if (request.ReplacementForTagId.HasValue)
        {
            if (requestedItems.Count != 1 || requestedItems[0].Quantity != 1)
            {
                throw ValidationFailed(
                    "replacementForTagId",
                    "A replacement must be ordered as one tag in its own order.");
            }
            replacementForTag = await _dbContext.SmartTags.SingleOrDefaultAsync(
                tag =>
                    tag.Id == request.ReplacementForTagId.Value
                    && tag.OwnerUserId == userId
                    && tag.DeletedAt == null,
                cancellationToken);

            if (replacementForTag is null)
            {
                throw NotFound("Replacement tag was not found.");
            }
            if (replacementForTag.PetId != primaryPet.Id)
            {
                throw ValidationFailed("items[0].petId", "The replacement tag must stay with its linked pet.");
            }
        }

        var pricedItems = new List<(CreateTagOrderItemRequest Request, TagProductVariant Variant, TagPricingQuote Quote)>();
        var requestedInventory = new Dictionary<Guid, int>();
        foreach (var item in requestedItems)
        {
            var (variant, quote) = await _pricingService.GetPurchasableVariantAsync(
                item.ProductVariantKey,
                cancellationToken);
            if (!string.Equals(quote.Currency, MalaysiaDelivery.Currency, StringComparison.OrdinalIgnoreCase))
            {
                throw new ApiException(409, "unsupported_currency", "This order cannot be priced in the selected currency.");
            }
            pricedItems.Add((item, variant, quote));
            requestedInventory[variant.Id] = requestedInventory.GetValueOrDefault(variant.Id) + item.Quantity;
        }

        // Every execution path, including service-level callers, must reject a
        // line that exceeds the physical unclaimed stock currently present.
        // The injected availability service adds outstanding-order reservations
        // to this check in the production request path.
        foreach (var (productVariantId, requested) in requestedInventory)
        {
            var physicalStock = await _dbContext.SmartTags.CountAsync(tag =>
                tag.ProductVariantId == productVariantId
                && tag.Status == SmartTagStatus.Unclaimed
                && tag.ArchivedAt == null
                && tag.DeletedAt == null
                && (tag.FulfilmentStatus == TagFulfilmentStatus.Generated
                    || tag.FulfilmentStatus == TagFulfilmentStatus.Printed)
                && tag.OwnerUserId == null
                && tag.PetId == null
                && tag.OrderId == null
                && tag.OrderItemId == null,
                cancellationToken);
            if (physicalStock < requested)
            {
                throw new ApiException(
                    StatusCodes.Status409Conflict,
                    "out_of_stock",
                    "There is not enough available inventory for one or more tag options in this order.");
            }
        }

        // SQL Server application locks make the stock-minus-reservations check
        // and atomic order insert one SKU-scoped concurrency boundary without
        // conflicting with the configured retrying execution strategy. Locks
        // are acquired in stable order so carts containing the same SKUs cannot
        // deadlock each other. No public Tag Code is allocated at checkout.
        await using var inventoryLock = _inventoryAvailability is not null
            && _dbContext.Database.IsSqlServer()
            ? await SqlServerInventoryReservationLock.AcquireAsync(
                _dbContext,
                requestedInventory.Keys,
                cancellationToken)
            : null;
        await using var transaction = _inventoryAvailability is not null
            && _dbContext.Database.IsRelational()
            && !_dbContext.Database.IsSqlServer()
            ? await _dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;
        if (_inventoryAvailability is not null)
        {
            await _inventoryAvailability.EnsureAvailableAsync(requestedInventory, cancellationToken);
        }

        var firstVariant = pricedItems[0].Variant;
        var tagType = firstVariant.SupportsNfc ? TagType.QrNfcSmartTag : TagType.QrPetTag;
        var now = _timeProvider.GetUtcNow();
        var delivery = request.Delivery!;
        var merchandiseSubtotal = pricedItems.Sum(item =>
            decimal.Round(item.Quote.BasePrice * item.Request.Quantity, 2, MidpointRounding.AwayFromZero));
        var discountAmount = pricedItems.Sum(item =>
            decimal.Round(item.Quote.DiscountAmount * item.Request.Quantity, 2, MidpointRounding.AwayFromZero));
        var finalAmount = merchandiseSubtotal - discountAmount;
        var deliveryResolution = await _deliveryService.ResolveAsync(
            delivery.StateCode,
            new DeliveryPricingSummary(merchandiseSubtotal, discountAmount, MalaysiaDelivery.Currency),
            cancellationToken);
        var deliveryQuote = deliveryResolution.Quote;
        var reservationMinutes = _checkoutSettings is null
            ? OrderCheckoutSetting.DefaultPaymentReservationMinutes
            : await _checkoutSettings.GetPaymentReservationMinutesAsync(cancellationToken);
        var order = new TagOrder
        {
            OrderNumber = await GenerateOrderNumberAsync(now, cancellationToken),
            OwnerUserId = userId,
            PetId = primaryPet.Id,
            Pet = primaryPet,
            ReplacementForTagId = replacementForTag?.Id,
            ReplacementForTag = replacementForTag,
            TagType = tagType,
            Variant = firstVariant.TagVariant,
            Amount = finalAmount,
            Currency = MalaysiaDelivery.Currency,
            DeliveryFee = deliveryQuote.DeliveryFee,
            TotalAmount = deliveryQuote.Total,
            Status = OrderStatus.PendingPayment,
            PaymentStatus = PaymentStatus.Pending,
            RecipientName = delivery.RecipientName.Trim(),
            DeliveryPhoneE164 = delivery.PhoneE164.Trim(),
            AddressLine1 = delivery.AddressLine1.Trim(),
            AddressLine2 = NormalizeOptional(delivery.AddressLine2),
            Postcode = delivery.Postcode.Trim(),
            City = delivery.City.Trim(),
            State = deliveryResolution.State.Name,
            StateCode = deliveryResolution.State.Code,
            Country = MalaysiaDelivery.CountryName,
            DeliveryZoneName = deliveryResolution.State.ZoneName,
            DeliveryMethodName = deliveryQuote.DeliveryMethod,
            FreeShippingReason = deliveryQuote.FreeDeliveryReason,
            DeliveryRateSource = deliveryResolution.RateSource,
            DeliveryNotes = NormalizeOptional(delivery.Notes),
            TrackingStatus = "Awaiting QR payment.",
            // Immutable snapshot: later policy changes must not move an
            // existing customer's payment deadline in either direction.
            PaymentReservationExpiresAt = now.AddMinutes(reservationMinutes),
            IdempotencyKey = idempotencyKey,
            RequestFingerprint = fingerprint,
            CreatedAt = now,
            UpdatedAt = now
        };

        foreach (var priced in pricedItems)
        {
            var itemPet = pets[priced.Request.PetId];
            var lineSubtotal = decimal.Round(
                priced.Quote.BasePrice * priced.Request.Quantity,
                2,
                MidpointRounding.AwayFromZero);
            var lineDiscount = decimal.Round(
                priced.Quote.DiscountAmount * priced.Request.Quantity,
                2,
                MidpointRounding.AwayFromZero);
            order.Items.Add(new TagOrderItem
            {
                Order = order,
                PetId = itemPet.Id,
                Pet = itemPet,
                PetNameSnapshot = itemPet.Name,
                ProductVariantId = priced.Variant.Id,
                ProductVariant = priced.Variant,
                SkuSnapshot = priced.Variant.Sku,
                ProductNameSnapshot = priced.Variant.TagProduct.Name,
                VariantNameSnapshot = priced.Variant.DisplayName,
                SupportsQrSnapshot = priced.Variant.SupportsQr,
                SupportsNfcSnapshot = priced.Variant.SupportsNfc,
                UnitBasePrice = priced.Quote.BasePrice,
                Quantity = priced.Request.Quantity,
                Subtotal = lineSubtotal,
                PromotionId = priced.Quote.PromotionId,
                PromotionNameSnapshot = priced.Quote.PromotionName,
                DiscountAmount = lineDiscount,
                FinalUnitPrice = priced.Quote.FinalPrice,
                FinalAmount = lineSubtotal - lineDiscount,
                UnitWeightGramsSnapshot = priced.Variant.WeightGrams,
                Currency = priced.Quote.Currency
            });
        }

        _dbContext.TagOrders.Add(order);

        for (var attempt = 0; ; attempt++)
        {
            try
            {
                await _dbContext.SaveChangesAsync(cancellationToken);
                break;
            }
            catch (DbUpdateException exception) when (
                UniqueConstraintViolation.IsFor(exception, "IX_TagOrders_OrderNumber")
                && attempt < 11)
            {
                // The unique index is the final guard for a concurrent insert
                // that selected the same random suffix after our pre-check.
                order.OrderNumber = await GenerateOrderNumberAsync(now, cancellationToken);
            }
            catch (DbUpdateException exception) when (
                UniqueConstraintViolation.IsFor(exception, "IX_TagOrders_OrderNumber"))
            {
                throw new ApiException(
                    StatusCodes.Status500InternalServerError,
                    "order_number_generation_failed",
                    "Could not generate an order number. Please try again.");
            }
            catch (DbUpdateException) when (idempotencyKey is not null)
            {
                // A concurrent request with the same key may have won the insert
                // race (the filtered unique index rejects the duplicate). Abandon
                // this attempt's tracked graph and, if a matching order now exists,
                // return it; otherwise the failure was unrelated, so surface it.
                if (transaction is not null)
                {
                    await transaction.RollbackAsync(cancellationToken);
                }
                _dbContext.ChangeTracker.Clear();
                var winner = await FindByIdempotencyKeyAsync(userId, idempotencyKey, cancellationToken);
                if (winner is null)
                {
                    throw;
                }
                return await BuildIdempotentReplayAsync(userId, winner, fingerprint!, cancellationToken);
            }
        }

        if (transaction is not null)
        {
            await transaction.CommitAsync(cancellationToken);
        }

        var hydratedOrder = await LoadOwnedOrderByIdAsync(userId, order.Id, trackChanges: false, cancellationToken);

        return new CreateTagOrderResponse(
            TagDtoMapper.ToOrderResponse(hydratedOrder),
            null);
    }

    private async Task<TagOrder?> FindByIdempotencyKeyAsync(
        Guid userId, string idempotencyKey, CancellationToken cancellationToken)
    {
        return await _dbContext.TagOrders
            .AsNoTracking()
            .SingleOrDefaultAsync(
                order => order.OwnerUserId == userId && order.IdempotencyKey == idempotencyKey,
                cancellationToken);
    }

    private async Task<CreateTagOrderResponse> BuildIdempotentReplayAsync(
        Guid userId, TagOrder existing, string fingerprint, CancellationToken cancellationToken)
    {
        // Same key, different payload = a client bug or collision. Never return
        // the wrong order silently.
        if (!string.Equals(existing.RequestFingerprint, fingerprint, StringComparison.Ordinal))
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "idempotency_key_conflict",
                "This request was already used for a different order. Start a new order to change the details.");
        }

        var hydrated = await LoadOwnedOrderByIdAsync(userId, existing.Id, trackChanges: false, cancellationToken);
        return new CreateTagOrderResponse(TagDtoMapper.ToOrderResponse(hydrated), null);
    }

    // Deterministic fingerprint over the material request fields, so a repeat
    // with the same key but different content is detected. Price and stock come
    // from server state and are intentionally excluded.
    private static string ComputeRequestFingerprint(CreateTagOrderRequest request)
    {
        var delivery = request.Delivery!;
        var items = NormalizeCreateItems(request.Items);
        var canonical = string.Join(
            '|',
            string.Join(';', items
                .OrderBy(item => item.PetId)
                .ThenBy(item => item.ProductVariantKey, StringComparer.Ordinal)
                .Select(item => $"{item.PetId:N}:{item.ProductVariantKey}:{item.Quantity}")),
            request.ReplacementForTagId?.ToString() ?? "",
            delivery.RecipientName.Trim(),
            delivery.PhoneE164.Trim(),
            delivery.AddressLine1.Trim(),
            (delivery.AddressLine2 ?? "").Trim(),
            delivery.Postcode.Trim(),
            delivery.City.Trim(),
            delivery.StateCode!.Trim(),
            (delivery.Notes ?? "").Trim());
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(canonical));
        return Convert.ToHexString(hash);
    }

    /// <summary>
    /// An owner may only release an order that is still unpaid and has no proof
    /// waiting for or holding an admin decision.
    /// </summary>
    internal static bool CanOwnerCancel(TagOrder order) =>
        order.Status == OrderStatus.PendingPayment
        && order.PaymentStatus != PaymentStatus.Confirmed
        && order.PaymentConfirmedAt == null
        && order.ShippedAt == null
        && !order.PaymentProofs.Any(proof =>
            proof.Status is PaymentProofStatus.PendingReview or PaymentProofStatus.Approved);

    public async Task<TagOrderResponse> SubmitPaymentProofAsync(
        Guid? currentUserId,
        string orderKey,
        UploadPaymentProofRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        ValidatePaymentProofRequest(request);

        // Resolve ownership first, then serialize every decision about this
        // reservation with checkout, expiry, cancellation and Admin review.
        // The tracked graph is reloaded only after the lock is held so no
        // stale pre-lock state can be written back over the winning action.
        var resolvedOrder = await LoadOwnedOrderAsync(
            currentUserId, orderKey, trackChanges: false, cancellationToken);
        await using var inventoryLock = _dbContext.Database.IsSqlServer()
            ? await SqlServerInventoryReservationLock.AcquireForOrderAsync(
                _dbContext, resolvedOrder.Id, cancellationToken)
            : null;
        _dbContext.ChangeTracker.Clear();
        var order = await LoadOwnedOrderByIdAsync(
            userId, resolvedOrder.Id, trackChanges: true, cancellationToken);

        if (order.PaymentReservationExpiredAt.HasValue)
        {
            throw PaymentWindowExpired();
        }

        if (order.Status is not (OrderStatus.PendingPayment or OrderStatus.PaymentProofSubmitted))
        {
            throw InvalidState("Payment proof can only be submitted before payment is confirmed.");
        }

        // The server, not the browser countdown, decides whether the window is
        // still open. A submission that arrives after the deadline is refused
        // even if the worker has not swept the order yet.
        if (order.Status == OrderStatus.PendingPayment
            && order.PaymentReservationExpiresAt is { } deadline
            && _timeProvider.GetUtcNow() >= deadline)
        {
            throw PaymentWindowExpired();
        }

        foreach (var proof in order.PaymentProofs.Where(item => item.Status == PaymentProofStatus.PendingReview))
        {
            proof.Status = PaymentProofStatus.Superseded;
        }

        var mediaFile = request.MediaFileId.HasValue
            ? await LoadOwnedMediaFileAsync(userId, order.Id, request.MediaFileId.Value, cancellationToken)
            : CreateMetadataOnlyMediaFile(userId, request.FileName);
        var fileName = MediaFileMetadata.SanitizeOriginalFileName(mediaFile.OriginalFileName)
            ?? "payment-proof-metadata";
        var proofEntity = new PaymentProof
        {
            OrderId = order.Id,
            Order = order,
            MediaFileId = mediaFile.Id,
            MediaFile = mediaFile,
            OriginalFileName = fileName,
            StorageFileName = mediaFile.StorageFileName,
            ContentType = mediaFile.ContentType,
            FileSize = mediaFile.FileSize,
            StorageProvider = mediaFile.StorageProvider,
            StoragePath = mediaFile.StoragePath,
            Sha256 = mediaFile.Sha256,
            UploadedAt = _timeProvider.GetUtcNow(),
            PaymentMethod = NormalizeOptional(request.PaymentMethod) ?? "QR Payment",
            SubmittedAmount = request.SubmittedAmount,
            PaymentReference = NormalizeOptional(request.PaymentReference),
            OwnerNote = NormalizeOptional(request.OwnerNote),
            Status = PaymentProofStatus.PendingReview
        };

        if (!request.MediaFileId.HasValue)
        {
            _dbContext.MediaFiles.Add(mediaFile);
        }

        _dbContext.PaymentProofs.Add(proofEntity);
        order.Status = OrderStatus.PaymentProofSubmitted;
        order.PaymentStatus = PaymentStatus.ProofSubmitted;
        order.TrackingStatus = "Payment proof submitted. We will review it before preparing the tag.";

        await _dbContext.SaveChangesAsync(cancellationToken);

        var hydratedOrder = await LoadOwnedOrderByIdAsync(userId, order.Id, trackChanges: false, cancellationToken);
        return TagDtoMapper.ToOrderResponse(hydratedOrder);
    }

    /// <summary>
    /// Lets the owner release their own unpaid order. Idempotent, releases the
    /// reserved inventory back to unclaimed stock, and is refused once a proof
    /// is awaiting or holds an admin decision.
    /// </summary>
    public async Task<TagOrderResponse> CancelAsync(
        Guid? currentUserId,
        string orderKey,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var resolvedOrder = await LoadOwnedOrderAsync(
            currentUserId, orderKey, trackChanges: false, cancellationToken);

        // The same SKU-scoped lock checkout and expiry use, so releasing stock
        // cannot race a concurrent order for the same variant.
        await using var inventoryLock = _dbContext.Database.IsSqlServer()
            ? await SqlServerInventoryReservationLock.AcquireForOrderAsync(
                _dbContext, resolvedOrder.Id, cancellationToken)
            : null;
        _dbContext.ChangeTracker.Clear();
        var order = await LoadOwnedOrderByIdAsync(
            userId, resolvedOrder.Id, trackChanges: true, cancellationToken);

        // Repeat cancellation is a no-op rather than an error, so a double
        // click or a retried request cannot release inventory twice.
        if (order.Status == OrderStatus.Cancelled)
        {
            return TagDtoMapper.ToOrderResponse(order);
        }

        if (!CanOwnerCancel(order))
        {
            throw InvalidState(
                "This order can no longer be cancelled here. If you have already submitted payment proof, "
                + "our team will review it. Contact MyPetLink support if you need help.");
        }

        var now = _timeProvider.GetUtcNow();
        order.Status = OrderStatus.Cancelled;
        order.CancelledAt ??= now;
        order.TrackingStatus = "Order cancelled at your request.";
        order.UpdatedAt = now;

        // An unshipped tag returns to unclaimed stock. Archiving it here would
        // permanently remove a physical tag from sellable inventory.
        foreach (var tag in order.AssignedTags.Where(tag =>
                     tag.Status is SmartTagStatus.Pending or SmartTagStatus.Preparing))
        {
            tag.OwnerUserId = null;
            tag.PetId = null;
            tag.OrderId = null;
            tag.OrderItemId = null;
            tag.Status = SmartTagStatus.Unclaimed;
            tag.UpdatedAt = now;
        }

        order.SmartTagId = null;
        order.SmartTag = null;

        _auditLogService.Append(
            userId,
            ActorType.Owner,
            "order.cancel-by-owner",
            "TagOrder",
            order.Id,
            new { status = OrderStatus.PendingPayment.ToString() },
            new { status = order.Status.ToString(), cancelledAt = now });

        await _dbContext.SaveChangesAsync(cancellationToken);

        var hydratedOrder = await LoadOwnedOrderByIdAsync(userId, order.Id, trackChanges: false, cancellationToken);
        return TagDtoMapper.ToOrderResponse(hydratedOrder);
    }

    private static ApiException PaymentWindowExpired() => new(
        StatusCodes.Status409Conflict,
        "payment_window_expired",
        "This order expired because payment was not completed in time. "
        + "Please place a new order.");

    private IQueryable<TagOrder> OwnedOrdersQuery(Guid userId)
    {
        return _dbContext.TagOrders.Where(order => order.OwnerUserId == userId);
    }

    private static IQueryable<TagOrder> IncludeOrderResponseGraph(IQueryable<TagOrder> query)
    {
        return query
            .Include(order => order.Pet)
            .Include(order => order.SmartTag)
            .Include(order => order.AssignedTags)
                .ThenInclude(tag => tag.Pet)
            .Include(order => order.PaymentProofs)
            .Include(order => order.EmailOutboxMessages)
            .Include(order => order.Items)
                .ThenInclude(item => item.Pet)
            .Include(order => order.Items)
                .ThenInclude(item => item.AssignedTags);
    }

    private async Task<TagOrder> LoadOwnedOrderAsync(
        Guid? currentUserId,
        string orderKey,
        bool trackChanges,
        CancellationToken cancellationToken)
    {
        var userId = RequireUserId(currentUserId);
        var query = IncludeOrderResponseGraph(OwnedOrdersQuery(userId));
        var normalizedOrderKey = orderKey.Trim();

        query = Guid.TryParse(normalizedOrderKey, out var orderId)
            ? query.Where(order => order.Id == orderId)
            : query.Where(order => order.OrderNumber == normalizedOrderKey);

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        var order = await query.SingleOrDefaultAsync(cancellationToken);
        return order ?? throw NotFound("Order was not found.");
    }

    private async Task<TagOrder> LoadOwnedOrderByIdAsync(
        Guid userId,
        Guid orderId,
        bool trackChanges,
        CancellationToken cancellationToken)
    {
        var query = IncludeOrderResponseGraph(OwnedOrdersQuery(userId))
            .Where(order => order.Id == orderId);

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        var order = await query.SingleOrDefaultAsync(cancellationToken);
        return order ?? throw NotFound("Order was not found.");
    }

    private async Task EnsureUserExistsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var exists = await _dbContext.Users.AnyAsync(
            user => user.Id == userId && user.DeletedAt == null,
            cancellationToken);

        if (!exists)
        {
            throw Unauthorized();
        }
    }

    private async Task<Pet> LoadOwnedPetAsync(
        Guid userId,
        Guid petId,
        CancellationToken cancellationToken)
    {
        var pet = await _dbContext.Pets.SingleOrDefaultAsync(
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

    private async Task<MediaFile> LoadOwnedMediaFileAsync(
        Guid userId,
        Guid orderId,
        Guid mediaFileId,
        CancellationToken cancellationToken)
    {
        var mediaFile = await _dbContext.MediaFiles.SingleOrDefaultAsync(
            file =>
                file.Id == mediaFileId
                && file.OwnerUserId == userId
                && file.UploadStatus == MediaUploadStatus.Ready
                && file.Category == MediaUploadCategory.OrderReceipt
                && !file.IsPublic
                && file.DeletedAt == null,
            cancellationToken);

        if (mediaFile is null)
        {
            throw NotFound("Payment proof file was not found.");
        }

        var linkedToOrder = await _dbContext.MediaFileLinks.AnyAsync(
            link =>
                link.MediaFileId == mediaFile.Id
                && link.OwnerType == MediaOwnerType.TagOrder
                && link.OwnerId == orderId
                && link.ArchivedAt == null,
            cancellationToken);

        return linkedToOrder ? mediaFile : throw NotFound("Payment proof file was not found.");
    }

    private MediaFile CreateMetadataOnlyMediaFile(Guid userId, string? fileName)
    {
        var safeFileName = MediaFileMetadata.SanitizeOriginalFileName(fileName)
            ?? "payment-proof-metadata";
        var now = _timeProvider.GetUtcNow();

        return new MediaFile
        {
            OwnerUserId = userId,
            OriginalFileName = safeFileName,
            StorageFileName = $"metadata-only-{Guid.NewGuid():N}",
            ContentType = MediaFileMetadata.InferContentType(safeFileName),
            FileSize = 0,
            StorageProvider = "MetadataOnly",
            StoragePath = "",
            Sha256 = "",
            CreatedAt = now,
            UploadedAt = now
        };
    }

    private static void ValidateCreateRequest(CreateTagOrderRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateCreateItems(request.Items, errors);

        if (request.Delivery is null)
        {
            errors["delivery"] = ["Delivery details are required."];
        }
        else
        {
            ValidateRequired(request.Delivery.RecipientName, "delivery.recipientName", "Recipient name is required.", errors);
            ValidateRequired(request.Delivery.PhoneE164, "delivery.phoneE164", "Delivery phone is required.", errors);
            ValidateRequired(request.Delivery.AddressLine1, "delivery.addressLine1", "Address line 1 is required.", errors);
            ValidateRequired(request.Delivery.Postcode, "delivery.postcode", "Postcode is required.", errors);
            ValidateRequired(request.Delivery.City, "delivery.city", "City is required.", errors);
            ValidateRequired(request.Delivery.StateCode, "delivery.stateCode", "Please select a state for your delivery address.", errors);
        }

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }
    }

    private static void ValidatePaymentProofRequest(UploadPaymentProofRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (!request.MediaFileId.HasValue && string.IsNullOrWhiteSpace(request.FileName))
        {
            errors["fileName"] = ["Upload a receipt or screenshot filename for this payment proof."];
        }

        if (!request.SubmittedAmount.HasValue || request.SubmittedAmount <= 0)
        {
            errors["submittedAmount"] = ["Enter the amount paid."];
        }
        else if (decimal.Round(request.SubmittedAmount.Value, 2) != request.SubmittedAmount.Value)
        {
            errors["submittedAmount"] = ["Use no more than two decimal places for the amount paid."];
        }

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }
    }

    private static void ValidateCreateItems(
        IReadOnlyCollection<CreateTagOrderItemRequest>? items,
        IDictionary<string, string[]> errors)
    {
        if (items is null || items.Count == 0)
        {
            errors["items"] = ["Add at least one physical tag to this order."];
            return;
        }
        if (items.Count > TagOrderLimits.MaxLinesPerOrder)
        {
            errors["items"] = [$"An order can contain up to {TagOrderLimits.MaxLinesPerOrder} tag lines."];
        }

        var totalUnits = 0;
        var index = 0;
        foreach (var item in items)
        {
            if (item.PetId == Guid.Empty)
                errors[$"items[{index}].petId"] = ["Choose a pet for this tag."];
            if (string.IsNullOrWhiteSpace(item.ProductVariantKey))
                errors[$"items[{index}].productVariantKey"] = ["Choose a tag option."];
            if (item.Quantity < 1 || item.Quantity > TagOrderLimits.MaxQuantityPerLine)
                errors[$"items[{index}].quantity"] = [$"Quantity must be between 1 and {TagOrderLimits.MaxQuantityPerLine}."];
            totalUnits += Math.Max(0, item.Quantity);
            index++;
        }
        if (totalUnits > TagOrderLimits.MaxUnitsPerOrder)
            errors["items"] = [$"An order can contain up to {TagOrderLimits.MaxUnitsPerOrder} physical tags."];
    }

    // Identical pet + SKU selections are one fulfilment line with a higher
    // quantity. Different pets always remain separate immutable item rows.
    private static IReadOnlyList<CreateTagOrderItemRequest> NormalizeCreateItems(
        IReadOnlyCollection<CreateTagOrderItemRequest>? items)
    {
        var errors = new Dictionary<string, string[]>();
        ValidateCreateItems(items, errors);
        if (errors.Count > 0)
            throw ValidationFailed(errors);

        var merged = items!
            .Select(item => new CreateTagOrderItemRequest(
                item.PetId,
                item.ProductVariantKey.Trim(),
                item.Quantity))
            .GroupBy(item => new { item.PetId, item.ProductVariantKey })
            .Select(group => new CreateTagOrderItemRequest(
                group.Key.PetId,
                group.Key.ProductVariantKey,
                group.Sum(item => item.Quantity)))
            .ToArray();

        if (merged.Any(item => item.Quantity > TagOrderLimits.MaxQuantityPerLine))
        {
            throw ValidationFailed(
                "items",
                $"The same pet and tag option can have up to {TagOrderLimits.MaxQuantityPerLine} units per order.");
        }

        return merged;
    }

    private async Task<string> GenerateOrderNumberAsync(
        DateTimeOffset createdAtUtc,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 12; attempt++)
        {
            var code = _businessReferences.CreateOrderNumber(createdAtUtc);
            var exists = await _dbContext.TagOrders.AnyAsync(
                order => order.OrderNumber == code,
                cancellationToken);

            if (!exists)
            {
                return code;
            }
        }

        throw new ApiException(
            StatusCodes.Status500InternalServerError,
            "order_number_generation_failed",
            "Could not generate an order number. Please try again.");
    }

    private static OrderStatus ParseOrderStatus(string value)
    {
        var normalized = NormalizeEnumInput(value);

        if (Enum.TryParse<OrderStatus>(normalized, ignoreCase: true, out var status))
        {
            return status;
        }

        throw ValidationFailed("status", "Order status is not supported.");
    }

    private static PaymentStatus ParsePaymentStatus(string value)
    {
        var normalized = NormalizeEnumInput(value);

        if (Enum.TryParse<PaymentStatus>(normalized, ignoreCase: true, out var status))
        {
            return status;
        }

        throw ValidationFailed("paymentStatus", "Payment status is not supported.");
    }

    private static string NormalizeEnumInput(string value)
    {
        return value
            .Trim()
            .Replace("_", "", StringComparison.OrdinalIgnoreCase)
            .Replace("-", "", StringComparison.OrdinalIgnoreCase)
            .Replace(" ", "", StringComparison.OrdinalIgnoreCase);
    }

    private static string? NormalizeOptional(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
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

    private static Guid RequireUserId(Guid? currentUserId)
    {
        return currentUserId ?? throw Unauthorized();
    }

    private static ApiException ValidationFailed(string field, string message)
    {
        return ValidationFailed(new Dictionary<string, string[]>
        {
            [field] = [message]
        });
    }

    private static ApiException ValidationFailed(IReadOnlyDictionary<string, string[]> errors)
    {
        return new ApiException(
            StatusCodes.Status400BadRequest,
            "validation_failed",
            "Please check the submitted fields.",
            errors);
    }

    private static ApiException InvalidState(string message)
    {
        return new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_order_state", message);
    }

    private static ApiException FeatureDisabled()
    {
        return new ApiException(
            StatusCodes.Status403Forbidden,
            "feature_disabled",
            "Smart Tag ordering is not available yet. Your free Safety Profile is still active.");
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
