using System.Text.Json;
using MyPetLink.Api.Common;

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

    public async Task InvokeAsync(HttpContext context)
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

            var response = ApiEnvelope.Error(
                context,
                exception.Code,
                exception.Message,
                exception.Details);

            await JsonSerializer.SerializeAsync(context.Response.Body, response, JsonOptions, context.RequestAborted);
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Unhandled API exception.");

            if (context.Response.HasStarted)
            {
                throw;
            }

            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";

            var response = ApiEnvelope.Error(
                context,
                "server_error",
                "Something went wrong while processing the request.");

            await JsonSerializer.SerializeAsync(context.Response.Body, response, JsonOptions, context.RequestAborted);
        }
    }
}
