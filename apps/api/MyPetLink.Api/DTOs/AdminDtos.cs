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
    AdminOwnerRefResponse Owner);

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
    [Required, MaxLength(32)] string TagType,
    [MaxLength(80)] string? Variant,
    [MaxLength(80)] string? BatchNumber);

public sealed record AdminGenerateTagsResponse(
    string BatchNo,
    int Quantity,
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

public sealed record AdminSettingItemResponse(
    string Key,
    string ValueJson,
    string Category,
    string? Description,
    bool IsPublic);

public sealed record AdminFeatureFlagsResponse(
    string PremiumStatus,
    string GpsStatus,
    bool PaymentGatewayEnabled,
    bool FileStorageEnabled,
    bool SmartTagOrderingEnabled);

public sealed record AdminSettingsResponse(
    IReadOnlyCollection<AdminSettingItemResponse> Settings,
    AdminFeatureFlagsResponse Features);

public sealed record AdminPlanResponse(
    Guid Id,
    string Code,
    string Name,
    string Status,
    string PriceLabel,
    string? BillingNote,
    string? Description,
    int MaxPets,
    int MaxMemoriesPerPet,
    int MaxMediaPerMemory,
    int MaxFamilyMembers,
    int MaxCareRecords,
    int ScanHistoryDays,
    bool AllowsSmartTagAddOns,
    bool AllowsFoundReports,
    bool AllowsAdvancedThemes);

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
