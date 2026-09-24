using System.Security.Claims;

namespace MyPetLink.Api.Common;

/// <summary>
/// Rate-limit policy names for social endpoints.
///
/// Controllers name a policy; they never carry a number. Every limit lives in
/// <see cref="SocialRateLimitingOptions"/> so it can be tuned per environment
/// without a code change and without the same value appearing twice.
/// </summary>
public static class SocialRateLimitPolicies
{
    /// <summary>Follow and unfollow. Per account.</summary>
    public const string Follow = "social-follow";

    /// <summary>Liking. Per account. Unliking uses <see cref="Withdraw"/>.</summary>
    public const string Like = "social-like";

    /// <summary>Creating a Comment. Per account.</summary>
    public const string Comment = "social-comment";

    /// <summary>
    /// Taking something back: unfollow, unlike, unblock.
    ///
    /// Deliberately NOT the same bucket as the action it undoes. Sharing one
    /// allowance means somebody who follows thirty accounts in an hour then
    /// cannot unfollow any of them for the rest of it — the limit stops the
    /// recovery rather than the abuse. Nothing is opened up by being generous
    /// here, because the doing side is already bounded: follow-unfollow churn
    /// is capped by the follow limit whatever this one says.
    /// </summary>
    public const string Withdraw = "social-withdraw";

    /// <summary>Creating a Moment. Per account. Also bounds media upload volume.</summary>
    public const string MomentCreate = "social-moment-create";

    /// <summary>Public pet and profile search. Per account, or per IP when anonymous.</summary>
    public const string Search = "social-search";

    /// <summary>
    /// Handle availability checks. The tightest of the set: this endpoint
    /// answers questions about names nobody has claimed, so it is the natural
    /// place to enumerate from.
    /// </summary>
    public const string HandleAvailability = "social-handle-availability";

    /// <summary>
    /// Claiming or renaming a handle, and writing the social profile. Per
    /// account. Deliberately separate from availability: a write is rarer and
    /// more expensive than a check.
    /// </summary>
    public const string ProfileMutation = "social-profile-mutation";
}

/// <summary>
/// Limits for the social policies, bound from "RateLimiting:Social".
///
/// IMPORTANT — these are PER APPLICATION INSTANCE. The limiter is the in-process
/// fixed-window limiter ASP.NET Core provides, and it keeps its counters in the
/// memory of one process. Running two instances behind a load balancer doubles
/// every effective limit, and a restart resets every window. That is an accepted
/// trade for a single-instance soft launch; see
/// docs/deployment/environment-variables.md for the conditions that require
/// moving this to a shared store or to the edge.
///
/// Defaults are the soft-launch starting points: generous enough that a real
/// person never meets them, tight enough that a script does.
/// </summary>
public sealed class SocialRateLimitingOptions
{
    public const string SectionName = "RateLimiting:Social";

    /// <summary>~30 per hour.</summary>
    public RequestRateLimitOptions Follow { get; init; } = new()
    {
        PermitLimit = 30,
        WindowSeconds = 3600,
        QueueLimit = 0
    };

    /// <summary>~120 per hour.</summary>
    public RequestRateLimitOptions Like { get; init; } = new()
    {
        PermitLimit = 120,
        WindowSeconds = 3600,
        QueueLimit = 0
    };

    /// <summary>~20 per ten minutes.</summary>
    public RequestRateLimitOptions Comment { get; init; } = new()
    {
        PermitLimit = 20,
        WindowSeconds = 600,
        QueueLimit = 0
    };

    /// <summary>~20 per hour. Each Moment can carry several uploads.</summary>
    public RequestRateLimitOptions MomentCreate { get; init; } = new()
    {
        PermitLimit = 20,
        WindowSeconds = 3600,
        QueueLimit = 0
    };

    /// <summary>~30 per minute.</summary>
    public RequestRateLimitOptions Search { get; init; } = new()
    {
        PermitLimit = 30,
        WindowSeconds = 60,
        QueueLimit = 0
    };

    /// <summary>~20 per minute.</summary>
    public RequestRateLimitOptions HandleAvailability { get; init; } = new()
    {
        PermitLimit = 20,
        WindowSeconds = 60,
        QueueLimit = 0
    };

    /// <summary>~20 per hour.</summary>
    public RequestRateLimitOptions ProfileMutation { get; init; } = new()
    {
        PermitLimit = 20,
        WindowSeconds = 3600,
        QueueLimit = 0
    };

    /// <summary>
    /// ~200 per hour. Generous on purpose: undoing is the recovery path, and a
    /// limit that blocks recovery is worse than the churn it prevents.
    /// </summary>
    public RequestRateLimitOptions Withdraw { get; init; } = new()
    {
        PermitLimit = 200,
        WindowSeconds = 3600,
        QueueLimit = 0
    };
}

/// <summary>
/// Partition keys for the social policies.
///
/// Authenticated social writes partition by user id, not by IP: a household
/// behind one carrier NAT must not share an allowance, and an attacker rotating
/// IPs must not get a fresh one.
/// </summary>
public static class SocialRateLimitPartitions
{
    /// <summary>Per account. Falls back to IP for an unauthenticated caller.</summary>
    public static string PerUser(HttpContext context)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        return string.IsNullOrWhiteSpace(userId)
            ? $"ip:{ClientIp(context)}"
            : $"user:{userId}";
    }

    private static string ClientIp(HttpContext context) =>
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}
