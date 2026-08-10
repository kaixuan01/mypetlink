using System.ComponentModel.DataAnnotations;

namespace MyPetLink.Api.DTOs;

// Admin-only contracts. Internal courier cost and internal notes appear here
// because every consumer is an authenticated admin; none of this file is safe
// to hand to a merchant.

// --- Allocation progress ---------------------------------------------------

/// <summary>One production batch's contribution to a line's allocation.</summary>
public sealed record MerchantAllocationBatchSummary(
    Guid? BatchId,
    string BatchNo,
    int Quantity);

public sealed record MerchantOrderItemAllocationProgress(
    Guid MerchantOrderItemId,
    Guid ProductVariantId,
    string ProductName,
    string SkuCode,
    string OptionName,
    bool SupportsQr,
    bool SupportsNfc,
    int RequiredUnits,
    int AllocatedUnits,
    int RemainingUnits,
    bool IsFullyAllocated,
    int EligibleAvailableUnits,
    IReadOnlyCollection<MerchantAllocationBatchSummary> Batches);

public sealed record MerchantOrderAllocationSummary(
    Guid MerchantOrderId,
    string MerchantOrderNumber,
    string PaymentStatus,
    string FulfilmentStatus,
    bool AllocationAllowed,
    string? AllocationBlockedReason,
    int RequiredUnits,
    int AllocatedUnits,
    int RemainingUnits,
    bool IsFullyAllocated,
    bool CanMarkReadyToShip,
    IReadOnlyCollection<MerchantOrderItemAllocationProgress> Items,
    string ConcurrencyToken);

/// <summary>
/// One allocated physical tag. Tag codes appear because an admin verifies the
/// physical carton against this list; they never reach a merchant document.
/// </summary>
public sealed record MerchantAllocatedTagResponse(
    Guid Id,
    Guid MerchantOrderItemId,
    Guid SmartTagId,
    string TagCode,
    string? BatchNo,
    string Status,
    DateTimeOffset AllocatedAt,
    bool WasAutomatic,
    DateTimeOffset? SentToMerchantAt,
    DateTimeOffset? ReleasedAt,
    string? ReleasedReason,
    string ConcurrencyToken);

// --- Eligible inventory ----------------------------------------------------

public sealed record MerchantEligibleInventoryItem(
    Guid SmartTagId,
    string TagCode,
    Guid? BatchId,
    string? BatchNo,
    string FulfilmentStatus,
    DateTimeOffset? PrintedAt,
    DateTimeOffset CreatedAt);

// --- Requests --------------------------------------------------------------

public sealed record AllocateMerchantInventoryRequest(
    [Required(ErrorMessage = "Choose the order line to allocate against.")]
    Guid MerchantOrderItemId,
    IReadOnlyCollection<Guid> SmartTagIds,
    string? ConcurrencyToken = null);

public sealed record AutoAllocateMerchantInventoryRequest(
    [Required(ErrorMessage = "Choose the order line to allocate against.")]
    Guid MerchantOrderItemId,
    [Range(1, 10000, ErrorMessage = "Enter how many units to allocate.")]
    int Quantity,
    string? ConcurrencyToken = null);

public sealed record ReleaseMerchantInventoryRequest(
    IReadOnlyCollection<Guid> AllocationIds,
    [Required(ErrorMessage = "Give the reason this inventory is being released.")]
    [MaxLength(500)]
    string Reason,
    string? ConcurrencyToken = null);

public sealed record MarkMerchantOrderShippedRequest(
    [MaxLength(32)] string? CourierProviderCode,
    [MaxLength(120)] string? CourierProviderName,
    [MaxLength(120)] string? CourierService,
    // Deliberately not [Required]: the service owns this rule so a missing
    // tracking number answers with the typed tracking_required code rather than
    // a generic validation failure.
    [MaxLength(64)] string TrackingNumber,
    decimal? InternalCourierCost,
    [MaxLength(2000)] string? InternalShippingNotes,
    string? ConcurrencyToken = null);

public sealed record MerchantFulfilmentTransitionRequest(string? ConcurrencyToken = null);

// --- Delivery order --------------------------------------------------------

public sealed record MerchantDeliveryOrderItemResponse(
    Guid MerchantOrderItemId,
    string ProductName,
    string SkuCode,
    string OptionName,
    bool SupportsQr,
    bool SupportsNfc,
    int OrderedQuantity,
    int AllocatedQuantity,
    string BatchSummary);

public sealed record MerchantDeliveryOrderResponse(
    Guid Id,
    string DeliveryOrderNumber,
    Guid MerchantOrderId,
    string MerchantOrderNumber,
    string MerchantCode,
    string MerchantLegalName,
    string? MerchantTradingName,
    string ContactPerson,
    string ContactEmail,
    string ContactPhone,
    MerchantSalesAddressSnapshot DeliveryAddress,
    string? CourierProvider,
    string? CourierService,
    string? TrackingNumber,
    DateTimeOffset IssuedAt,
    IReadOnlyCollection<MerchantDeliveryOrderItemResponse> Items,
    string ConcurrencyToken);

// --- Fulfilment view -------------------------------------------------------

public sealed record MerchantOrderFulfilmentResponse(
    Guid MerchantOrderId,
    string MerchantOrderNumber,
    string PaymentStatus,
    string FulfilmentStatus,
    string? CourierProviderCode,
    string? CourierProvider,
    string? CourierService,
    string? TrackingNumber,
    string? TrackingUrl,
    decimal? InternalCourierCost,
    string? InternalShippingNotes,
    DateTimeOffset? PreparingAt,
    DateTimeOffset? ReadyToShipAt,
    DateTimeOffset? ShippedAt,
    DateTimeOffset? DeliveredAt,
    MerchantOrderAllocationSummary Allocation,
    MerchantDeliveryOrderResponse? DeliveryOrder,
    MerchantShipmentEmailStatusResponse? ShipmentEmail,
    string ConcurrencyToken);

/// <summary>
/// What happened to the shipment notice, in words an operator can act on.
/// Carried on the fulfilment payload the order screen already loads, so the
/// status costs no extra request and cannot become an N+1 per order.
/// </summary>
public sealed record MerchantShipmentEmailStatusResponse(
    string State,
    string RecipientEmail,
    DateTimeOffset? SentAt);
