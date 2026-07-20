using System.Text.Json;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;

namespace MyPetLink.Api.Middleware;

public sealed class ErrorHandlingMiddleware
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly ILogger<ErrorHandlingMiddleware> _logger;
    private readonly RequestDelegate _next;

    public ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(
        HttpContext context,
        IDatabaseTransientExceptionClassifier transientClassifier,
        IOptions<DatabaseResilienceOptions> resilienceOptions)
    {
        try
        {
            await _next(context);
        }
        catch (ApiException exception)
        {
            if (context.Response.HasStarted)
            {
                throw;
            }

            context.Response.Clear();
            context.Response.StatusCode = exception.StatusCode;
            context.Response.ContentType = "application/json";
            SetRequestIdHeader(context);

            var response = ApiEnvelope.Error(
                context,
                exception.Code,
                exception.Message,
                exception.Details);

            await JsonSerializer.SerializeAsync(context.Response.Body, response, JsonOptions, context.RequestAborted);
        }
        catch (Exception exception) when (
            !context.RequestAborted.IsCancellationRequested
            && transientClassifier.IsTransient(exception))
        {
            var retryAfterSeconds = Math.Clamp(
                resilienceOptions.Value.ApiRetryAfterSeconds,
                1,
                60);
            var requestId = ApiEnvelope.GetRequestId(context);

            _logger.LogWarning(
                exception,
                "Temporary database availability event after provider retries. " +
                "RequestId={RequestId} Method={Method} Path={Path} SqlErrorNumber={SqlErrorNumber} ExceptionType={ExceptionType}.",
                requestId,
                context.Request.Method,
                context.Request.Path,
                transientClassifier.GetPrimarySqlErrorNumber(exception),
                exception.GetType().Name);

            if (context.Response.HasStarted)
            {
                throw;
            }

            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            context.Response.ContentType = "application/json";
            context.Response.Headers.RetryAfter = retryAfterSeconds.ToString();
            SetRequestIdHeader(context);

            var response = ApiEnvelope.Error(
                context,
                "database_waking_up",
                "MyPetLink is getting things ready. Please hold on for a little moment.",
                retryAfterSeconds: retryAfterSeconds);

            await JsonSerializer.SerializeAsync(context.Response.Body, response, JsonOptions, context.RequestAborted);
        }
        catch (Exception exception)
        {
            var requestId = ApiEnvelope.GetRequestId(context);
            _logger.LogError(
                exception,
                "Unhandled API exception. RequestId={RequestId} Method={Method} Path={Path} ExceptionType={ExceptionType}.",
                requestId,
                context.Request.Method,
                context.Request.Path,
                exception.GetType().FullName);

            if (context.Response.HasStarted)
            {
                throw;
            }

            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";
            SetRequestIdHeader(context);

            var response = ApiEnvelope.Error(
                context,
                "server_error",
                "Something went wrong while processing the request.");

            await JsonSerializer.SerializeAsync(context.Response.Body, response, JsonOptions, context.RequestAborted);
        }
    }

    private static void SetRequestIdHeader(HttpContext context) =>
        context.Response.Headers["X-Request-Id"] = ApiEnvelope.GetRequestId(context);
}
