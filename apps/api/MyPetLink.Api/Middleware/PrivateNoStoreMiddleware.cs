using MyPetLink.Api.Common;

namespace MyPetLink.Api.Middleware;

/// <summary>
/// Gives every response of an endpoint marked <see cref="PrivateNoStoreAttribute"/>
/// <c>Cache-Control: private, no-store</c>.
///
/// Registered between routing (which selects the endpoint) and authorization
/// (which may answer with a challenge before any controller code runs). The
/// header is set when the response starts, as
/// <see cref="SearchIndexingPolicyMiddleware"/> does, so it survives the error
/// handler clearing the response.
/// </summary>
public sealed class PrivateNoStoreMiddleware
{
    private readonly RequestDelegate _next;

    public PrivateNoStoreMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public Task InvokeAsync(HttpContext context)
    {
        if (context.GetEndpoint()?.Metadata.GetMetadata<PrivateNoStoreAttribute>() is not null)
        {
            context.Response.OnStarting(static state =>
            {
                ((HttpResponse)state).Headers.CacheControl = PrivateNoStoreAttribute.HeaderValue;
                return Task.CompletedTask;
            }, context.Response);
        }

        return _next(context);
    }
}
