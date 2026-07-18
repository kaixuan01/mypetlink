using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class OrderService : SkeletonService, IOrderService
{
    private const decimal QrTagAmount = 19.90m;
    private const decimal QrNfcTagAmount = 39.90m;
    private const string Currency = "MYR";

    private readonly MyPetLinkDbContext _dbContext;
    private readonly FeatureOptions _features;

    public OrderService(MyPetLinkDbContext dbContext, IOptions<FeatureOptions> features)
    {
        _dbContext = dbContext;
        _features = features.Value;
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
            query = query.Where(order => order.PetId == petId.Value);
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

        return (orders.Select(TagDtoMapper.ToOrderResponse).ToArray(), total);
    }

    public async Task<TagOrderResponse> GetAsync(
        Guid? currentUserId,
        string orderKey,
        CancellationToken cancellationToken = default)
    {
        var order = await LoadOwnedOrderAsync(currentUserId, orderKey, trackChanges: false, cancellationToken);
        return TagDtoMapper.ToOrderResponse(order);
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

        var pet = await LoadOwnedPetAsync(userId, request.PetId, cancellationToken);

        if (pet.LifecycleStatus == PetLifecycleStatus.Archived || pet.ArchivedAt.HasValue)
        {
            throw InvalidState("Archived pets cannot receive new tag orders.");
        }

        if (pet.LifecycleStatus == PetLifecycleStatus.Memorial)
        {
            throw InvalidState("Memorial profiles cannot receive new tag orders.");
        }

        SmartTag? replacementForTag = null;

        if (request.ReplacementForTagId.HasValue)
        {
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
        }

        var tagType = request.TagType!.Value;
        var now = DateTimeOffset.UtcNow;
        var delivery = request.Delivery!;
        var order = new TagOrder
        {
            OrderNumber = await GenerateOrderNumberAsync(cancellationToken),
            OwnerUserId = userId,
            PetId = pet.Id,
            Pet = pet,
            ReplacementForTagId = replacementForTag?.Id,
            ReplacementForTag = replacementForTag,
            TagType = tagType,
            Variant = TagVariants.Normalize(request.Variant),
            Amount = GetAmount(tagType),
            Currency = Currency,
            DeliveryFee = 0m,
            Status = OrderStatus.PendingPayment,
            PaymentStatus = PaymentStatus.Pending,
            RecipientName = delivery.RecipientName.Trim(),
            DeliveryPhoneE164 = delivery.PhoneE164.Trim(),
            AddressLine1 = delivery.AddressLine1.Trim(),
            AddressLine2 = NormalizeOptional(delivery.AddressLine2),
            Postcode = delivery.Postcode.Trim(),
            City = delivery.City.Trim(),
            State = delivery.State.Trim(),
            DeliveryNotes = NormalizeOptional(delivery.Notes),
            TrackingStatus = "Awaiting QR payment.",
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.TagOrders.Add(order);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var hydratedOrder = await LoadOwnedOrderByIdAsync(userId, order.Id, trackChanges: false, cancellationToken);

        return new CreateTagOrderResponse(
            TagDtoMapper.ToOrderResponse(hydratedOrder),
            null);
    }

    public async Task<TagOrderResponse> SubmitPaymentProofAsync(
        Guid? currentUserId,
        string orderKey,
        UploadPaymentProofRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var order = await LoadOwnedOrderAsync(currentUserId, orderKey, trackChanges: true, cancellationToken);

        if (order.Status is not (OrderStatus.PendingPayment or OrderStatus.PaymentProofSubmitted))
        {
            throw InvalidState("Payment proof can only be submitted before payment is confirmed.");
        }

        ValidatePaymentProofRequest(request);

        foreach (var proof in order.PaymentProofs.Where(item => item.Status == PaymentProofStatus.PendingReview))
        {
            proof.Status = PaymentProofStatus.Superseded;
        }

        var mediaFile = request.MediaFileId.HasValue
            ? await LoadOwnedMediaFileAsync(userId, order.Id, request.MediaFileId.Value, cancellationToken)
            : CreateMetadataOnlyMediaFile(userId, request.FileName);
        var fileName = NormalizeOptional(request.FileName)
            ?? NormalizeOptional(mediaFile.OriginalFileName)
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
            UploadedAt = DateTimeOffset.UtcNow,
            PaymentMethod = NormalizeOptional(request.PaymentMethod) ?? "QR Payment",
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

    public async Task<TagOrderResponse> CancelAsync(
        Guid? currentUserId,
        string orderKey,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var order = await LoadOwnedOrderAsync(currentUserId, orderKey, trackChanges: true, cancellationToken);

        if (order.Status is not (OrderStatus.PendingPayment or OrderStatus.PaymentProofSubmitted))
        {
            throw InvalidState("This order cannot be cancelled after preparation has started.");
        }

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

        await _dbContext.SaveChangesAsync(cancellationToken);

        var hydratedOrder = await LoadOwnedOrderByIdAsync(userId, order.Id, trackChanges: false, cancellationToken);
        return TagDtoMapper.ToOrderResponse(hydratedOrder);
    }

    private IQueryable<TagOrder> OwnedOrdersQuery(Guid userId)
    {
        return _dbContext.TagOrders.Where(order => order.OwnerUserId == userId);
    }

    private static IQueryable<TagOrder> IncludeOrderResponseGraph(IQueryable<TagOrder> query)
    {
        return query
            .Include(order => order.Pet)
            .Include(order => order.SmartTag)
            .Include(order => order.PaymentProofs);
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

    private static MediaFile CreateMetadataOnlyMediaFile(Guid userId, string? fileName)
    {
        var safeFileName = NormalizeOptional(fileName) ?? "payment-proof-metadata";
        var now = DateTimeOffset.UtcNow;

        return new MediaFile
        {
            OwnerUserId = userId,
            OriginalFileName = safeFileName,
            StorageFileName = $"metadata-only-{Guid.NewGuid():N}",
            ContentType = InferContentType(safeFileName),
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

        if (request.PetId == Guid.Empty)
        {
            errors["petId"] = ["Choose a pet for this tag order."];
        }

        if (!request.TagType.HasValue)
        {
            errors["tagType"] = ["Choose a tag type."];
        }

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
            ValidateRequired(request.Delivery.State, "delivery.state", "State is required.", errors);
        }

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }
    }

    private static void ValidatePaymentProofRequest(UploadPaymentProofRequest request)
    {
        if (!request.MediaFileId.HasValue && string.IsNullOrWhiteSpace(request.FileName))
        {
            throw ValidationFailed(new Dictionary<string, string[]>
            {
                ["fileName"] = ["Upload a receipt or screenshot filename for this payment proof."]
            });
        }
    }

    private async Task<string> GenerateOrderNumberAsync(CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 12; attempt++)
        {
            var code = $"MPL-ORD-{DateTimeOffset.UtcNow:yyyyMMdd}-{RandomNumberGenerator.GetInt32(1000, 10000)}";
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

    private static decimal GetAmount(TagType tagType)
    {
        return tagType == TagType.QrNfcSmartTag ? QrNfcTagAmount : QrTagAmount;
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

    private static string InferContentType(string fileName)
    {
        return fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)
            ? "application/pdf"
            : "application/octet-stream";
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
