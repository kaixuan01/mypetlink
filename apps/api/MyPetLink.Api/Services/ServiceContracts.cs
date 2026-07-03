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
public interface ITagScanService : ISkeletonService;
public interface ISmartTagService : ISkeletonService;
public interface IOrderService : ISkeletonService;
public interface IPaymentProofService : ISkeletonService;
public interface IAdminService : ISkeletonService;

public interface IAuditLogService : ISkeletonService
{
    Task RecordAsync(string action, string entity, Guid? entityId = null, CancellationToken cancellationToken = default);
}
