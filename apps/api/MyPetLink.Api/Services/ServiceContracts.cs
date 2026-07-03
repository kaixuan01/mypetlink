using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;

namespace MyPetLink.Api.Services;

public interface ICurrentUserService
{
    CurrentUser Current { get; }
}

public interface ISkeletonService
{
    Task<PlaceholderResponse> NotImplementedAsync(string operation, CancellationToken cancellationToken = default);
}

public interface IAuthService : ISkeletonService;
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
