using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Text.Encodings.Web;
using MyPetLink.Api.Data;

namespace MyPetLink.Api.Tests;

public sealed class SmartTagRateLimitingTests
{
    private const string SigningKey =
        "rate-limit-test-signing-key-that-is-long-enough";

    [Theory]
    [InlineData("/api/v1/public/tags/MPL-LIMIT-LEGACY")]
    [InlineData("/api/v1/public/tags/MPL-LIMIT-QR/qr")]
    [InlineData("/api/v1/public/tags/MPL-LIMIT-NFC/nfc")]
    public async Task PublicTagRoutes_AllowRequestsBelowLimit(string path)
    {
        await using var factory = new RateLimitFactory();
        using var client = CreateClient(factory, "198.51.100.10");

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task PublicTagRoute_AboveLimitReturnsStandard429WithRetryAfter()
    {
        await using var factory = new RateLimitFactory();
        using var client = CreateClient(factory, "198.51.100.20");
        const string path = "/api/v1/public/tags/MPL-LIMIT-QR/qr";

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(path)).StatusCode);
        var rejected = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.NotNull(rejected.Headers.RetryAfter);
        using var json = JsonDocument.Parse(await rejected.Content.ReadAsStringAsync());
        Assert.Equal(
            "rate_limit_exceeded",
            json.RootElement.GetProperty("error").GetProperty("code").GetString());
        Assert.Equal(
            "Too many requests. Please wait a moment and try again.",
            json.RootElement.GetProperty("error").GetProperty("message").GetString());
        Assert.True(
            json.RootElement.GetProperty("meta")
                .GetProperty("retryAfterSeconds")
                .GetInt32() > 0);
    }

    [Fact]
    public async Task PublicTagRoute_UsesIndependentClientIpPartitions()
    {
        await using var factory = new RateLimitFactory();
        using var first = CreateClient(factory, "198.51.100.30");
        using var second = CreateClient(factory, "198.51.100.31");
        const string path = "/api/v1/public/tags/MPL-LIMIT-IP/qr";

        await first.GetAsync(path);
        await first.GetAsync(path);
        Assert.Equal(
            HttpStatusCode.TooManyRequests,
            (await first.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await second.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task Activation_UsesIndependentAuthenticatedUserPartitions()
    {
        await using var factory = new RateLimitFactory();
        using var first = CreateClient(factory, "198.51.100.40");
        using var second = CreateClient(factory, "198.51.100.40");
        first.DefaultRequestHeaders.Add("X-Test-User", Guid.NewGuid().ToString());
        second.DefaultRequestHeaders.Add("X-Test-User", Guid.NewGuid().ToString());

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await Activate(first, "MPL-ACTIVATE-LIMIT")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await Activate(first, "MPL-ACTIVATE-LIMIT")).StatusCode);
        Assert.Equal(
            HttpStatusCode.TooManyRequests,
            (await Activate(first, "MPL-ACTIVATE-LIMIT")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await Activate(second, "MPL-ACTIVATE-LIMIT")).StatusCode);
    }

    [Fact]
    public async Task Activation_UnauthenticatedRequestsUseIpPartition()
    {
        await using var factory = new RateLimitFactory();
        using var client = CreateClient(factory, "198.51.100.50");

        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await Activate(client, "MPL-ACTIVATE-AUTH")).StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await Activate(client, "MPL-ACTIVATE-AUTH")).StatusCode);
        var rejected = await Activate(client, "MPL-ACTIVATE-AUTH");

        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
    }

    [Fact]
    public async Task RateLimiter_DoesNotChangePrivacyResponsesBelowLimit()
    {
        await using var factory = new RateLimitFactory();
        using var client = CreateClient(factory, "198.51.100.60");
        var userId = Guid.NewGuid();
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString());

        var publicResponse = await client.GetAsync(
            "/api/v1/public/tags/MPL-UNKNOWN-PRIVACY/nfc");
        var activationResponse = await Activate(client, "MPL-UNKNOWN-PRIVACY");

        Assert.Equal(HttpStatusCode.OK, publicResponse.StatusCode);
        using var publicJson = JsonDocument.Parse(
            await publicResponse.Content.ReadAsStringAsync());
        Assert.Equal(
            "notFound",
            publicJson.RootElement.GetProperty("data").GetProperty("state").GetString());
        Assert.Equal(HttpStatusCode.NotFound, activationResponse.StatusCode);
    }

    private static HttpClient CreateClient(
        WebApplicationFactory<Program> factory,
        string ip)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });
        client.DefaultRequestHeaders.Add("X-Test-Client-IP", ip);
        return client;
    }

    private static Task<HttpResponseMessage> Activate(
        HttpClient client,
        string code) =>
        client.PostAsync(
            $"/api/v1/tags/{code}/activate",
            new StringContent(
                """{"petId":null}""",
                Encoding.UTF8,
                "application/json"));

    private sealed class RateLimitFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(
                    new Dictionary<string, string?>
                    {
                        ["Jwt:Issuer"] = "MyPetLink.RateLimit.Tests",
                        ["Jwt:Audience"] = "MyPetLink.RateLimit.Client",
                        ["Jwt:SigningKey"] = SigningKey,
                        ["DevAuth:Enabled"] = "false",
                        ["RateLimiting:PublicTagScan:PermitLimit"] = "2",
                        ["RateLimiting:PublicTagScan:WindowSeconds"] = "5",
                        ["RateLimiting:PublicTagScan:QueueLimit"] = "0",
                        ["RateLimiting:TagActivation:PermitLimit"] = "2",
                        ["RateLimiting:TagActivation:WindowSeconds"] = "5",
                        ["RateLimiting:TagActivation:QueueLimit"] = "0"
                    }));
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<MyPetLinkDbContext>>();
                services.RemoveAll<MyPetLinkDbContext>();
                services.AddDbContext<MyPetLinkDbContext>(options =>
                    options.UseInMemoryDatabase($"rate-limit-{Guid.NewGuid():N}"));
                services.AddSingleton<IStartupFilter, TestClientIpStartupFilter>();
            });
            builder.ConfigureTestServices(services =>
            {
                services.AddAuthentication(options =>
                    {
                        options.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                        options.DefaultChallengeScheme = TestAuthHandler.SchemeName;
                        options.DefaultForbidScheme = TestAuthHandler.SchemeName;
                    })
                    .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(
                        TestAuthHandler.SchemeName,
                        _ => { });
            });
        }
    }

    private sealed class TestClientIpStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(
            Action<IApplicationBuilder> next) =>
            app =>
            {
                app.Use(async (context, continuation) =>
                {
                    if (context.Request.Headers.TryGetValue(
                            "X-Test-Client-IP",
                            out var value)
                        && IPAddress.TryParse(value.ToString(), out var address))
                    {
                        context.Connection.RemoteIpAddress = address;
                    }

                    await continuation();
                });
                next(app);
            };
    }

    private sealed class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
    {
        public const string SchemeName = "RateLimitTest";

        public TestAuthHandler(
            IOptionsMonitor<AuthenticationSchemeOptions> options,
            ILoggerFactory logger,
            UrlEncoder encoder)
            : base(options, logger, encoder)
        {
        }

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Test-User", out var value)
                || !Guid.TryParse(value.ToString(), out var userId))
            {
                return Task.FromResult(AuthenticateResult.NoResult());
            }

            var identity = new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId.ToString())],
                SchemeName);
            return Task.FromResult(
                AuthenticateResult.Success(
                    new AuthenticationTicket(
                        new ClaimsPrincipal(identity),
                        SchemeName)));
        }
    }
}
