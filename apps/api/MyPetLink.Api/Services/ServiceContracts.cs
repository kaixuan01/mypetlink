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
public interface IPetService : ISkeletonService;
public interface IPublicProfileService : ISkeletonService;
public interface IQrSafetyService : ISkeletonService;
public interface ITagScanService : ISkeletonService;
public interface ISmartTagService : ISkeletonService;
public interface IOrderService : ISkeletonService;
public interface IPaymentProofService : ISkeletonService;
public interface IAdminService : ISkeletonService;

public interface IAuditLogService : ISkeletonService
{
    Task RecordAsync(string action, string entity, Guid? entityId = null, CancellationToken cancellationToken = default);
}
