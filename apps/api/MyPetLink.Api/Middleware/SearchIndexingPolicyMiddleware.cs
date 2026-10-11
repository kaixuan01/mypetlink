namespace MyPetLink.Api.Middleware;

/// <summary>
/// Keeps every API response out of search results with
/// <c>X-Robots-Tag: noindex</c>.
///
/// The API is a data source for the MyPetLink website and apps, never a page a
/// person should land on from a search engine. Public endpoints return pet
/// names, Moments and profile projections, and a crawler that finds an API URL
/// in a script bundle could otherwise list the raw JSON on its own.
///
/// This is a header rather than a robots.txt <c>Disallow</c> on purpose: search
/// engines render the website's client-side pages (Explore, Share Profiles) by
/// fetching these same endpoints, so they must stay fetchable. The header only
/// says "do not index this response"; it changes no body, status code, CORS
/// decision, cache policy or authorization outcome.
///
/// The header is added when the response starts, so it also covers responses
/// written by later middleware that clears the response first (the error
/// handler), short-circuited CORS preflights, and 404s.
/// </summary>
public sealed class SearchIndexingPolicyMiddleware
{
    public const string HeaderName = "X-Robots-Tag";
    public const string HeaderValue = "noindex";

    private readonly RequestDelegate _next;

    public SearchIndexingPolicyMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(static state =>
        {
            var response = (HttpResponse)state;
            response.Headers[HeaderName] = HeaderValue;
            return Task.CompletedTask;
        }, context.Response);

        return _next(context);
    }
}
