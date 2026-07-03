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
public interface IAdminService : ISkeletonService;

public sealed record TagScanContext(
    string? IpAddress,
    string? UserAgent,
    string? Referer);

public interface IAuditLogService : ISkeletonService
{
    Task RecordAsync(string action, string entity, Guid? entityId = null, CancellationToken cancellationToken = default);
}
