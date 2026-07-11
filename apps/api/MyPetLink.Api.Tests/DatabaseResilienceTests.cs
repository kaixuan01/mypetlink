using System.Data.Common;
using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Middleware;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

public sealed class DatabaseResilienceTests
{
    [Theory]
    [InlineData(40613)] // Azure SQL database temporarily unavailable.
    [InlineData(40501)] // Azure SQL throttling.
    public void Classifier_UsesProviderPolicy_ForTransientSqlErrors(int errorNumber)
    {
        using var context = CreateSqlServerContext();
        var classifier = new DatabaseTransientExceptionClassifier(context);

        Assert.True(classifier.IsTransient(CreateSqlException(errorNumber, "Temporary failure.")));
    }

    [Theory]
    [InlineData(207)] // Invalid column.
    [InlineData(208)] // Invalid object/table.
    [InlineData(2627)] // Unique constraint.
    [InlineData(18456)] // Login/authentication failure.
    public void Classifier_DoesNotTreatPermanentSqlErrorsAsWakeUp(int errorNumber)
    {
        using var context = CreateSqlServerContext();
        var classifier = new DatabaseTransientExceptionClassifier(context);

        Assert.False(classifier.IsTransient(CreateSqlException(errorNumber, "Permanent failure.")));
    }

    [Fact]
    public void Classifier_DoesNotRetryCancellation()
    {
        using var context = CreateSqlServerContext();
        var classifier = new DatabaseTransientExceptionClassifier(context);

        Assert.False(classifier.IsTransient(new OperationCanceledException()));
    }

    [Fact]
    public void Classifier_TreatsProviderTimeoutAsTransient()
    {
        using var context = CreateSqlServerContext();
        var classifier = new DatabaseTransientExceptionClassifier(context);

        Assert.True(classifier.IsTransient(new TimeoutException("Timed out.")));
    }

    [Fact]
    public void Classifier_UnwrapsExhaustedExecutionStrategyFailure()
    {
        using var context = CreateSqlServerContext();
        var classifier = new DatabaseTransientExceptionClassifier(context);
        var exception = new RetryLimitExceededException(
            "Retries exhausted.",
            CreateSqlException(40613, "Temporary failure."));

        Assert.True(classifier.IsTransient(exception));
        Assert.Equal(40613, classifier.GetPrimarySqlErrorNumber(exception));
    }

    [Fact]
    public void WriteEntities_UseStableClientGeneratedKeys_ForRetrySafety()
    {
        var entities = new Entity[]
        {
            new User(),
            new RefreshToken(),
            new Pet(),
            new MediaFile(),
            new PetMemory()
        };

        Assert.All(entities, entity => Assert.NotEqual(Guid.Empty, entity.Id));
        Assert.Equal(entities.Length, entities.Select(entity => entity.Id).Distinct().Count());
    }

    [Fact]
    public async Task Middleware_ReturnsSafeWakeUpEnvelope_ForConfirmedTransientFailure()
    {
        var rawMessage = "server=tcp:secret;password=secret";
        var middleware = new ErrorHandlingMiddleware(
            _ => throw new TestDbException(rawMessage),
            NullLogger<ErrorHandlingMiddleware>.Instance);
        var context = CreateHttpContext();

        await middleware.InvokeAsync(
            context,
            new StubClassifier(isTransient: true, errorNumber: 40613),
            Options.Create(new DatabaseResilienceOptions { ApiRetryAfterSeconds = 3 }));

        context.Response.Body.Position = 0;
        var body = await new StreamReader(context.Response.Body).ReadToEndAsync();

        Assert.Equal(StatusCodes.Status503ServiceUnavailable, context.Response.StatusCode);
        Assert.Equal("3", context.Response.Headers.RetryAfter);
        Assert.Contains("database_waking_up", body);
        Assert.Contains("retryAfterSeconds", body);
        Assert.DoesNotContain(rawMessage, body);
    }

    [Fact]
    public async Task Middleware_ReturnsInternalError_ForNonTransientDatabaseFailure()
    {
        var rawMessage = "Invalid column name 'EstimatedBirthYear'.";
        var middleware = new ErrorHandlingMiddleware(
            _ => throw new TestDbException(rawMessage),
            NullLogger<ErrorHandlingMiddleware>.Instance);
        var context = CreateHttpContext();

        await middleware.InvokeAsync(
            context,
            new StubClassifier(isTransient: false, errorNumber: 207),
            Options.Create(new DatabaseResilienceOptions()));

        context.Response.Body.Position = 0;
        var body = await new StreamReader(context.Response.Body).ReadToEndAsync();

        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);
        Assert.Contains("server_error", body);
        Assert.DoesNotContain("database_waking_up", body);
        Assert.DoesNotContain(rawMessage, body);
    }

    [Theory]
    [InlineData(StatusCodes.Status400BadRequest, "validation_failed")]
    [InlineData(StatusCodes.Status401Unauthorized, "unauthorized")]
    [InlineData(StatusCodes.Status403Forbidden, "forbidden")]
    public async Task Middleware_DoesNotReclassifyApplicationErrors(
        int statusCode,
        string code)
    {
        var middleware = new ErrorHandlingMiddleware(
            _ => throw new ApiException(statusCode, code, "Safe application error."),
            NullLogger<ErrorHandlingMiddleware>.Instance);
        var context = CreateHttpContext();

        await middleware.InvokeAsync(
            context,
            new StubClassifier(isTransient: true, errorNumber: 40613),
            Options.Create(new DatabaseResilienceOptions()));

        context.Response.Body.Position = 0;
        var body = await new StreamReader(context.Response.Body).ReadToEndAsync();

        Assert.Equal(statusCode, context.Response.StatusCode);
        Assert.Contains(code, body);
        Assert.DoesNotContain("database_waking_up", body);
    }

    private static MyPetLinkDbContext CreateSqlServerContext()
    {
        var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseSqlServer("Server=(localdb)\\MSSQLLocalDB;Database=ResilienceClassifierOnly;Trusted_Connection=True;")
            .Options;
        return new MyPetLinkDbContext(options);
    }

    private static DefaultHttpContext CreateHttpContext()
    {
        var context = new DefaultHttpContext();
        context.TraceIdentifier = "resilience-test-request";
        context.Response.Body = new MemoryStream();
        return context;
    }

    private static SqlException CreateSqlException(int number, string message)
    {
        var error = (SqlError)Activator.CreateInstance(
            typeof(SqlError),
            BindingFlags.Instance | BindingFlags.NonPublic,
            binder: null,
            args: [number, (byte)0, (byte)0, "test-server", message, "test-procedure", 1, (uint)0, null],
            culture: null)!;
        var errors = (SqlErrorCollection)Activator.CreateInstance(
            typeof(SqlErrorCollection),
            BindingFlags.Instance | BindingFlags.NonPublic,
            binder: null,
            args: null,
            culture: null)!;
        typeof(SqlErrorCollection)
            .GetMethod("Add", BindingFlags.Instance | BindingFlags.NonPublic)!
            .Invoke(errors, [error]);

        return (SqlException)typeof(SqlException)
            .GetMethod(
                "CreateException",
                BindingFlags.Static | BindingFlags.NonPublic,
                binder: null,
                types: [typeof(SqlErrorCollection), typeof(string), typeof(Guid), typeof(Exception)],
                modifiers: null)!
            .Invoke(null, [errors, "15.0.0", Guid.NewGuid(), null])!;
    }

    private sealed class StubClassifier(bool isTransient, int? errorNumber)
        : IDatabaseTransientExceptionClassifier
    {
        public bool IsTransient(Exception exception) => isTransient;
        public int? GetPrimarySqlErrorNumber(Exception exception) => errorNumber;
    }

    private sealed class TestDbException(string message) : DbException(message);
}
