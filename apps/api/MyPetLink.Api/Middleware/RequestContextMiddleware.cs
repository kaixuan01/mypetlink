using MyPetLink.Api.Common;

namespace MyPetLink.Api.Middleware;

public sealed class RequestContextMiddleware
{
    private readonly ILogger<RequestContextMiddleware> _logger;
    private readonly RequestDelegate _next;

    public RequestContextMiddleware(
        RequestDelegate next,
        ILogger<RequestContextMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var requestId = context.Request.Headers.TryGetValue("X-Request-Id", out var values)
            ? values.FirstOrDefault()
            : null;

        requestId = string.IsNullOrWhiteSpace(requestId)
            ? context.TraceIdentifier
            : requestId.Trim();

        context.Items[RequestContextKeys.RequestId] = requestId;
        context.Response.Headers["X-Request-Id"] = requestId;

        using (_logger.BeginScope(new Dictionary<string, object>
        {
            ["RequestId"] = requestId,
            ["RequestPath"] = context.Request.Path.Value ?? "",
            ["RequestMethod"] = context.Request.Method
        }))
        {
            await _next(context);
        }
    }
}
