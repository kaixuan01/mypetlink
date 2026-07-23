using System.Security.Claims;

namespace MyPetLink.Api.Common;

public static class SmartTagRateLimitPolicies
{
    public const string PublicTagScan = "public-tag-scan";
    public const string TagActivation = "tag-activation";
}

public sealed class SmartTagRateLimitingOptions
{
    public const string SectionName = "RateLimiting";

    public RequestRateLimitOptions PublicTagScan { get; init; } = new()
    {
        PermitLimit = 60,
        WindowSeconds = 60,
        QueueLimit = 0
    };

    public RequestRateLimitOptions TagActivation { get; init; } = new()
    {
        PermitLimit = 10,
        WindowSeconds = 60,
        QueueLimit = 0
    };
}

public sealed class RequestRateLimitOptions
{
    public int PermitLimit { get; init; }
    public int WindowSeconds { get; init; }
    public int QueueLimit { get; init; }
}

public static class SmartTagRateLimitPartitions
{
    public static string PublicScan(HttpContext context) =>
        $"ip:{ClientIp(context)}";

    public static string Activation(HttpContext context)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        return string.IsNullOrWhiteSpace(userId)
            ? $"ip:{ClientIp(context)}"
            : $"user:{userId}";
    }

    private static string ClientIp(HttpContext context) =>
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}
