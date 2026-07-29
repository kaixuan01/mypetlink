using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record AdminOwnerRefResponse(
    Guid UserId,
    string Email,
    string DisplayName);

public sealed record AdminDashboardSummaryResponse(
    int TotalOwners,
    int TotalPets,
    int ActivePets,
    int MemorialPets,
    int LostModePets,
    int PendingPaymentProofs,
    int OrdersPendingPayment,
    int OrdersPreparing,
    int OrdersShipped,
    int ActiveTags,
    int LostOrDisabledTags,
    int UnclaimedTags);

public sealed record AdminDashboardResponse(
    AdminDashboardSummaryResponse Summary,
    IReadOnlyCollection<AdminTagOrderResponse> RecentOrders,
    IReadOnlyCollection<AdminPaymentProofResponse> RecentPaymentProofs,
    IReadOnlyCollection<AdminAuditLogResponse> RecentActivity);

public sealed record AdminTagOrderResponse(
    TagOrderResponse Order,
    AdminOwnerRefResponse Owner,
    Guid? ProductVariantId,
    AdminEmailOutboxResponse? PaymentConfirmationEmail);

public sealed record AdminPaymentProofResponse(
    PaymentProofResponse Proof,
    string OrderNumber,
    OrderStatus OrderStatus,
    PaymentStatus PaymentStatus,
    string? PetName,
    AdminOwnerRefResponse Owner);

public sealed record RejectPaymentProofRequest(
    [MaxLength(600)] string? Reason);

public sealed record UpdateOrderStatusRequest(
    [Required] OrderStatus? Status,
    [MaxLength(120)] string? TrackingNumber);

public sealed record MarkOrderShippedRequest(
    [MaxLength(120)] string? TrackingNumber);

public sealed record AssignInventoryTagRequest(
    [Required] Guid? TagId);

public sealed record ChangeAssignedTagRequest(
    [Required] Guid? NewTagId,
    [MaxLength(600)] string? Reason);

public sealed record ReplaceTagRequest(
    [Required] Guid? NewTagId,
    [Required, MaxLength(60)] string? Reason,
    [MaxLength(600)] string? Note);

public sealed record AdminSmartTagResponse(
    SmartTagResponse Tag,
    AdminOwnerRefResponse? Owner,
    PetLifecycleStatus? PetLifecycleStatus);

public sealed record AdminGenerateTagsRequest(
    [Required, Range(1, 50)] int Quantity,
    [Required] Guid? ProductVariantId,
    [MaxLength(80)] string? BatchNumber);

public sealed record AdminGenerateTagsResponse(
    string BatchNo,
    int Quantity,
    Guid ProductVariantId,
    string Sku,
    string ProductName,
    string VariantName,
    int CurrentInventoryCount,
    IReadOnlyCollection<SmartTagResponse> Tags);

public sealed record AdminOwnerListItemResponse(
    Guid UserId,
    string Email,
    string DisplayName,
    string OwnerDisplayName,
    string PlanCode,
    string Status,
    string? PhoneE164,
    string? WhatsappE164,
    int PetCount,
    int ActivePetCount,
    int OrderCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt);

public sealed record AdminOwnerDetailResponse(
    AdminOwnerListItemResponse Owner,
    IReadOnlyCollection<PetListItemResponse> Pets,
    IReadOnlyCollection<TagOrderResponse> RecentOrders,
    IReadOnlyCollection<SmartTagResponse> Tags);

public sealed record AdminPetListItemResponse(
    PetListItemResponse Pet,
    AdminOwnerRefResponse Owner,
    string? Breed,
    bool QrSafetyEnabled,
    int TagCount);

public sealed record AdminPetDetailResponse(
    PetDetailResponse Pet,
    AdminOwnerRefResponse Owner,
    IReadOnlyCollection<SmartTagResponse> Tags);




public sealed record AdminAuditLogResponse(
    Guid Id,
    Guid? ActorId,
    ActorType ActorType,
    string Action,
    string Entity,
    Guid? EntityId,
    string? OldValue,
    string? NewValue,
    DateTimeOffset CreatedAt);

// --- Operational status (read-only) ---------------------------------------
// Derived from configuration and database state that is actually in effect.
// Carries no secret, host, credential, endpoint, or provider error detail.

public sealed record AdminEmailStatusResponse(
    bool GlobalDeliveryEnabled,
    bool SmtpConfigured,
    int EnabledTemplateCount,
    int OutboxPendingCount,
    // Pending and template-eligible, held only because global delivery is off.
    int OutboxPausedByGlobalSwitchCount,
    int OutboxSuppressedCount,
    int OutboxFailedCount,
    DateTimeOffset? LastSuccessfulDeliveryAt);

public sealed record AdminStorageStatusResponse(
    string Provider,
    bool ConfigurationComplete,
    bool UsesManagedStorage);

public sealed record AdminPublicRoutingStatusResponse(
    bool PublicSiteBaseUrlConfigured,
    bool SmartTagLinkGenerationAvailable);

public sealed record AdminOrderingStatusResponse(
    bool OrderingEnabled,
    int ActiveDeliveryZoneCount,
    bool CheckoutAvailable);

public sealed record AdminOperationalStatusResponse(
    AdminEmailStatusResponse Email,
    AdminStorageStatusResponse Storage,
    AdminPublicRoutingStatusResponse PublicRouting,
    AdminOrderingStatusResponse Ordering);
