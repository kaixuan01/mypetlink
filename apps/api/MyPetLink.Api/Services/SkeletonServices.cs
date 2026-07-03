using MyPetLink.Api.Common;

namespace MyPetLink.Api.Services;

public abstract class SkeletonService : ISkeletonService
{
    public Task<PlaceholderResponse> NotImplementedAsync(
        string operation,
        CancellationToken cancellationToken = default)
    {
        var response = new PlaceholderResponse(
            operation,
            "Route is reserved in the V1 contract. Business logic will be implemented in the next backend phase.");

        return Task.FromResult(response);
    }
}

public sealed class AdminService : SkeletonService, IAdminService;

public sealed class AuditLogService : SkeletonService, IAuditLogService
{
    private readonly ILogger<AuditLogService> _logger;

    public AuditLogService(ILogger<AuditLogService> logger)
    {
        _logger = logger;
    }

    public Task RecordAsync(
        string action,
        string entity,
        Guid? entityId = null,
        CancellationToken cancellationToken = default)
    {
        _logger.LogInformation(
            "Audit log placeholder: {Action} on {Entity} {EntityId}",
            action,
            entity,
            entityId);

        return Task.CompletedTask;
    }
}
