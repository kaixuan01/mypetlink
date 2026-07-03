using MyPetLink.Api.Common;

namespace MyPetLink.Api.Middleware;

public sealed class RequestContextMiddleware
{
    private readonly RequestDelegate _next;

    public RequestContextMiddleware(RequestDelegate next)
    {
        _next = next;
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

        await _next(context);
    }
}
