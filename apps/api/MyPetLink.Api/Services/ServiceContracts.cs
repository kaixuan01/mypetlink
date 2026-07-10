using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;

namespace MyPetLink.Api.Services;

public interface ICurrentUserService
{
    CurrentUser Current { get; }
}

public interface ISkeletonService
{
    Task<PlaceholderResponse> NotImplementedAsync(string operation, CancellationToken cancellationToken = default);
}

public interface IAuthService : ISkeletonService
{
    Task<AuthTokenResponse> SignInWithGoogleAsync(
        GoogleLoginRequest request,
        AuthClientContext clientContext,
        CancellationToken cancellationToken = default);

    // Development-only test login. Implementations must reject the call
    // (404) when the host environment is not Development.
    Task<AuthTokenResponse> SignInWithDevTestUserAsync(
        DevTestLoginRequest request,
        AuthClientContext clientContext,
        CancellationToken cancellationToken = default);

    Task<TokenRefreshResponse> RefreshAsync(
        RefreshTokenRequest request,
        AuthClientContext clientContext,
        CancellationToken cancellationToken = default);

    Task LogoutAsync(
        LogoutRequest request,
        AuthClientContext clientContext,
        CancellationToken cancellationToken = default);

    Task<CurrentSessionResponse> GetCurrentSessionAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default);

    Task<AdminAuthCheckResponse> GetAdminAuthCheckAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default);
}

public interface IOwnerProfileService : ISkeletonService
{
    Task<OwnerProfileResponse> GetAsync(Guid? currentUserId, CancellationToken cancellationToken = default);

    Task<OwnerProfileResponse> UpdateAsync(
        Guid? currentUserId,
        UpdateOwnerProfileRequest request,
        CancellationToken cancellationToken = default);
}

public interface IPetService : ISkeletonService
{
    Task<(IReadOnlyCollection<PetListItemResponse> Items, int Total)> ListAsync(
        Guid? currentUserId,
        int page,
        int pageSize,
        string? lifecycleStatus,
        CancellationToken cancellationToken = default);

    Task<PetDetailResponse> CreateAsync(
        Guid? currentUserId,
        CreatePetRequest request,
        CancellationToken cancellationToken = default);

    Task<PetDetailResponse> GetAsync(
        Guid? currentUserId,
        Guid petId,
        CancellationToken cancellationToken = default);

    Task<PetDetailResponse> UpdateAsync(
        Guid? currentUserId,
        Guid petId,
        UpdatePetRequest request,
        CancellationToken cancellationToken = default);

    Task<PetDetailResponse> MarkMemorialAsync(
        Guid? currentUserId,
        Guid petId,
        MarkPetMemorialRequest request,
        CancellationToken cancellationToken = default);

    Task<PetDetailResponse> RestoreActiveAsync(
        Guid? currentUserId,
        Guid petId,
        CancellationToken cancellationToken = default);

    Task<PetDetailResponse> ArchiveAsync(
        Guid? currentUserId,
        Guid petId,
        CancellationToken cancellationToken = default);
}

public interface IPublicProfileService : ISkeletonService
{
    Task<PublicPetProfileResponse> GetByPublicSlugAsync(
        string publicSlug,
        CancellationToken cancellationToken = default);
}

public interface IMemoryService : ISkeletonService
{
    Task<(IReadOnlyCollection<MemoryResponse> Items, int Total)> ListForPetAsync(
        Guid? currentUserId,
        Guid petId,
        int page,
        int pageSize,
        string? visibility,
        bool includeArchived,
        CancellationToken cancellationToken = default);

    Task<MemoryResponse> CreateAsync(
        Guid? currentUserId,
        Guid petId,
        CreateMemoryRequest request,
        CancellationToken cancellationToken = default);

    Task<MemoryResponse> GetAsync(
        Guid? currentUserId,
        Guid memoryId,
        CancellationToken cancellationToken = default);

    Task<MemoryResponse> UpdateAsync(
        Guid? currentUserId,
        Guid memoryId,
        UpdateMemoryRequest request,
        CancellationToken cancellationToken = default);

    Task ArchiveAsync(
        Guid? currentUserId,
        Guid memoryId,
        CancellationToken cancellationToken = default);
}

public interface ICareRecordService : ISkeletonService
{
    Task<(IReadOnlyCollection<CareRecordResponse> Items, int Total)> ListForPetAsync(
        Guid? currentUserId,
        Guid petId,
        int page,
        int pageSize,
        string? type,
        DateOnly? fromDate,
        DateOnly? toDate,
        bool includeArchived,
        CancellationToken cancellationToken = default);

    Task<CareRecordResponse> CreateAsync(
        Guid? currentUserId,
        Guid petId,
        CreateCareRecordRequest request,
        CancellationToken cancellationToken = default);

    Task<CareRecordResponse> GetAsync(
        Guid? currentUserId,
        Guid recordId,
        CancellationToken cancellationToken = default);

    Task<CareRecordResponse> UpdateAsync(
        Guid? currentUserId,
        Guid recordId,
        UpdateCareRecordRequest request,
        CancellationToken cancellationToken = default);

    Task ArchiveAsync(
        Guid? currentUserId,
        Guid recordId,
        CancellationToken cancellationToken = default);
}

public interface IMediaService : ISkeletonService
{
    Task<MediaUploadResponse> InitializeUploadAsync(
        Guid? currentUserId,
        InitializeMediaUploadRequest request,
        CancellationToken cancellationToken = default);

    Task<CompleteMediaUploadResponse> CompleteUploadAsync(
        Guid? currentUserId,
        Guid mediaId,
        CancellationToken cancellationToken = default);

    Task DeleteAsync(
        Guid? currentUserId,
        Guid mediaId,
        CancellationToken cancellationToken = default);

    Task<MediaDownloadUrlResponse> CreatePrivateDownloadUrlAsync(
        Guid? currentUserId,
        Guid mediaId,
        CancellationToken cancellationToken = default);

    Task<int> DeleteStalePendingUploadsAsync(
        TimeSpan olderThan,
        CancellationToken cancellationToken = default);
}

public interface IQrSafetyService : ISkeletonService
{
    Task<PublicSafetyPageResponse> GetBySafetyCodeAsync(
        string safetyCode,
        CancellationToken cancellationToken = default);
}

public interface ITagScanService : ISkeletonService
{
    Task<TagScanPageResponse> ResolveAsync(
        string tagCode,
        TagScanContext context,
        CancellationToken cancellationToken = default);

    Task SubmitLocationConsentAsync(
        string tagCode,
        SubmitScanLocationConsentRequest request,
        CancellationToken cancellationToken = default);
}

public interface ISmartTagService : ISkeletonService
{
    Task<(IReadOnlyCollection<SmartTagResponse> Items, int Total)> ListAsync(
        Guid? currentUserId,
        int page,
        int pageSize,
        Guid? petId,
        string? status,
        string? type,
        CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<SmartTagResponse> Items, int Total)> ListForPetAsync(
        Guid? currentUserId,
        Guid petId,
        int page,
        int pageSize,
        string? status,
        string? type,
        CancellationToken cancellationToken = default);

    Task<SmartTagResponse> GetAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default);

    Task<SmartTagResponse> ActivateAsync(
        Guid? currentUserId,
        string tagCode,
        ActivateTagRequest request,
        CancellationToken cancellationToken = default);

    Task<SmartTagResponse> MarkLostAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default);

    Task<SmartTagResponse> DisableAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default);

    Task<SmartTagResponse> ArchiveAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default);

    Task<SmartTagResponse> RestoreAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default);
}

public interface IOrderService : ISkeletonService
{
    Task<(IReadOnlyCollection<TagOrderResponse> Items, int Total)> ListAsync(
        Guid? currentUserId,
        int page,
        int pageSize,
        string? status,
        string? paymentStatus,
        Guid? petId,
        CancellationToken cancellationToken = default);

    Task<TagOrderResponse> GetAsync(
        Guid? currentUserId,
        string orderKey,
        CancellationToken cancellationToken = default);

    Task<CreateTagOrderResponse> CreateAsync(
        Guid? currentUserId,
        CreateTagOrderRequest request,
        CancellationToken cancellationToken = default);

    Task<TagOrderResponse> SubmitPaymentProofAsync(
        Guid? currentUserId,
        string orderKey,
        UploadPaymentProofRequest request,
        CancellationToken cancellationToken = default);

    Task<TagOrderResponse> CancelAsync(
        Guid? currentUserId,
        string orderKey,
        CancellationToken cancellationToken = default);
}

public interface IPaymentProofService : ISkeletonService
{
    Task<PaymentProofResponse> GetAsync(
        Guid? currentUserId,
        Guid paymentProofId,
        CancellationToken cancellationToken = default);
}
public interface IAdminService : ISkeletonService
{
    Task<AdminDashboardResponse> GetDashboardAsync(CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminTagOrderResponse> Items, int Total)> ListOrdersAsync(
        int page,
        int pageSize,
        string? status,
        string? paymentStatus,
        Guid? petId,
        Guid? ownerId,
        string? tagType,
        string? search,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> GetOrderAsync(Guid orderId, CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> ConfirmPaymentAsync(
        Guid? currentUserId,
        Guid orderId,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> RejectPaymentProofAsync(
        Guid? currentUserId,
        Guid orderId,
        string? reason,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> AssignInventoryTagAsync(
        Guid? currentUserId,
        Guid orderId,
        Guid tagId,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> ChangeAssignedTagAsync(
        Guid? currentUserId,
        Guid orderId,
        Guid newTagId,
        string? reason,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> ReplaceTagAsync(
        Guid? currentUserId,
        Guid orderId,
        Guid newTagId,
        string? reason,
        string? note,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> MarkOrderPreparingAsync(
        Guid? currentUserId,
        Guid orderId,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> MarkOrderShippedAsync(
        Guid? currentUserId,
        Guid orderId,
        string? trackingNumber,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> MarkOrderDeliveredAsync(
        Guid? currentUserId,
        Guid orderId,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> CancelOrderAsync(
        Guid? currentUserId,
        Guid orderId,
        CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminPaymentProofResponse> Items, int Total)> ListPaymentProofsAsync(
        int page,
        int pageSize,
        string? status,
        string? orderStatus,
        Guid? ownerId,
        string? search,
        CancellationToken cancellationToken = default);

    Task<AdminPaymentProofResponse> GetPaymentProofAsync(
        Guid paymentProofId,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> ApprovePaymentProofAsync(
        Guid? currentUserId,
        Guid paymentProofId,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> RejectPaymentProofByIdAsync(
        Guid? currentUserId,
        Guid paymentProofId,
        string? reason,
        CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminSmartTagResponse> Items, int Total)> ListTagsAsync(
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
        CancellationToken cancellationToken = default);

    Task<AdminSmartTagResponse> GetTagAsync(Guid tagId, CancellationToken cancellationToken = default);

    Task<AdminSmartTagResponse> UpdateTagStatusAsync(
        Guid? currentUserId,
        Guid tagId,
        string action,
        string? reason,
        CancellationToken cancellationToken = default);

    Task<AdminGenerateTagsResponse> GenerateTagInventoryAsync(
        Guid? currentUserId,
        AdminGenerateTagsRequest request,
        CancellationToken cancellationToken = default);

    Task<(string FileName, string Csv)> ExportTagInventoryCsvAsync(
        string? batchNumber,
        CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminOwnerListItemResponse> Items, int Total)> ListOwnersAsync(
        int page,
        int pageSize,
        string? search,
        string? plan,
        string? status,
        CancellationToken cancellationToken = default);

    Task<AdminOwnerDetailResponse> GetOwnerAsync(Guid ownerUserId, CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminPetListItemResponse> Items, int Total)> ListPetsAsync(
        int page,
        int pageSize,
        string? lifecycleStatus,
        bool? lostMode,
        Guid? ownerId,
        string? search,
        CancellationToken cancellationToken = default);

    Task<AdminPetDetailResponse> GetPetAsync(Guid petId, CancellationToken cancellationToken = default);

    Task<AdminSettingsResponse> GetSettingsAsync(CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminAuditLogResponse> Items, int Total)> ListAuditLogsAsync(
        int page,
        int pageSize,
        string? action,
        string? entity,
        Guid? entityId,
        Guid? actorId,
        DateTimeOffset? fromDate,
        DateTimeOffset? toDate,
        CancellationToken cancellationToken = default);
}

public sealed record TagScanContext(
    string? IpAddress,
    string? UserAgent,
    string? Referer);

public interface IAuditLogService : ISkeletonService
{
    // Adds an audit row to the current DbContext without saving, so the caller
    // persists the audit entry and the mutation in one SaveChanges.
    void Append(
        Guid? actorId,
        Entities.ActorType actorType,
        string action,
        string entity,
        Guid? entityId,
        object? oldValue = null,
        object? newValue = null);
}
