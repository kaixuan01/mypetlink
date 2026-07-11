using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using MyPetLink.Api.Data;

namespace MyPetLink.Api.Tests;

public sealed class HealthEndpointTests
{
    [Fact]
    public async Task Live_RemainsHealthy_WithoutCheckingDatabase()
    {
        await using var factory = CreateFactory(databaseReady: false);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health/live");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(0, factory.Probe.CallCount);
    }

    [Fact]
    public async Task Ready_ReturnsWakeUpContract_WhenDatabaseIsUnavailable()
    {
        await using var factory = CreateFactory(databaseReady: false);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health/ready");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("3", response.Headers.RetryAfter?.Delta?.TotalSeconds.ToString("0"));
        Assert.Contains("not_ready", body);
        Assert.DoesNotContain("database_waking_up", body);
        Assert.DoesNotContain("connection string", body, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(1, factory.Probe.CallCount);
    }

    [Fact]
    public async Task Ready_BecomesHealthy_AfterDatabaseRecovery()
    {
        await using var factory = CreateFactory(databaseReady: false);
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/health/ready")).StatusCode);
        factory.Probe.IsReady = true;

        var recovered = await client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.OK, recovered.StatusCode);
        Assert.Contains("ready", await recovered.Content.ReadAsStringAsync());
    }

    private static ResilienceWebApplicationFactory CreateFactory(bool databaseReady) =>
        new(databaseReady);

    private sealed class ResilienceWebApplicationFactory(bool databaseReady)
        : WebApplicationFactory<Program>
    {
        public StubReadinessProbe Probe { get; } = new(databaseReady);

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IDatabaseReadinessProbe>();
                services.AddSingleton<IDatabaseReadinessProbe>(Probe);
            });
        }
    }

    private sealed class StubReadinessProbe(bool isReady) : IDatabaseReadinessProbe
    {
        public bool IsReady { get; set; } = isReady;
        public int CallCount { get; private set; }

        public Task<bool> IsReadyAsync(CancellationToken cancellationToken)
        {
            CallCount += 1;
            return Task.FromResult(IsReady);
        }
    }
}
