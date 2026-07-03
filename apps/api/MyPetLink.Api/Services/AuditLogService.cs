using System.Text.Json;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class AuditLogService : SkeletonService, IAuditLogService
{
    private static readonly JsonSerializerOptions SerializerOptions =
        new(JsonSerializerDefaults.Web);

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public AuditLogService(MyPetLinkDbContext dbContext, IHttpContextAccessor httpContextAccessor)
    {
        _dbContext = dbContext;
        _httpContextAccessor = httpContextAccessor;
    }

    public void Append(
        Guid? actorId,
        ActorType actorType,
        string action,
        string entity,
        Guid? entityId,
        object? oldValue = null,
        object? newValue = null)
    {
        var httpContext = _httpContextAccessor.HttpContext;

        _dbContext.AuditLogs.Add(new AuditLog
        {
            ActorId = actorId,
            ActorType = actorType,
            Action = action,
            Entity = entity,
            EntityId = entityId,
            OldValue = Serialize(oldValue),
            NewValue = Serialize(newValue),
            IpAddress = httpContext?.Connection.RemoteIpAddress?.ToString(),
            UserAgent = httpContext?.Request.Headers.UserAgent.ToString(),
            CreatedAt = DateTimeOffset.UtcNow
        });
    }

    private static string? Serialize(object? value)
    {
        return value is null ? null : JsonSerializer.Serialize(value, SerializerOptions);
    }
}
