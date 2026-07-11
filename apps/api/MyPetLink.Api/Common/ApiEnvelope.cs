using Microsoft.AspNetCore.Mvc;

namespace MyPetLink.Api.Common;

public sealed record ApiResponse<T>(T Data, ApiMeta Meta);

public sealed record ApiErrorResponse(ApiError Error, ApiMeta Meta);

public sealed record ApiError(
    string Code,
    string Message,
    IReadOnlyDictionary<string, string[]>? Details = null);

public sealed record ApiMeta(
    string RequestId,
    int? Page = null,
    int? PageSize = null,
    int? Total = null,
    int? RetryAfterSeconds = null);

public sealed record PlaceholderResponse(string Feature, string Message);

public static class ApiEnvelope
{
    public static ApiResponse<T> Ok<T>(
        T data,
        HttpContext httpContext,
        int? page = null,
        int? pageSize = null,
        int? total = null)
    {
        return new ApiResponse<T>(
            data,
            new ApiMeta(GetRequestId(httpContext), page, pageSize, total));
    }

    public static ApiErrorResponse Error(
        HttpContext httpContext,
        string code,
        string message,
        IReadOnlyDictionary<string, string[]>? details = null,
        int? retryAfterSeconds = null)
    {
        return new ApiErrorResponse(
            new ApiError(code, message, details),
            new ApiMeta(GetRequestId(httpContext), RetryAfterSeconds: retryAfterSeconds));
    }

    public static Dictionary<string, string[]> ModelStateErrors(ActionContext context)
    {
        return context.ModelState
            .Where(entry => entry.Value?.Errors.Count > 0)
            .ToDictionary(
                entry => entry.Key,
                entry => entry.Value!.Errors
                    .Select(error => string.IsNullOrWhiteSpace(error.ErrorMessage)
                        ? "The submitted value is invalid."
                        : error.ErrorMessage)
                    .ToArray());
    }

    public static string GetRequestId(HttpContext httpContext)
    {
        if (httpContext.Items.TryGetValue(RequestContextKeys.RequestId, out var value)
            && value is string requestId
            && !string.IsNullOrWhiteSpace(requestId))
        {
            return requestId;
        }

        return httpContext.TraceIdentifier;
    }
}

public static class RequestContextKeys
{
    public const string RequestId = "MyPetLink.RequestId";
}
