using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using MyPetLink.Api.Data;
using MyPetLink.Api.Middleware;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Every API response tells search engines not to index it, and nothing else
/// about the response changes: public endpoints stay public (Explore renders
/// from them), protected ones still refuse anonymous callers, CORS still
/// answers the website, and error responses written by the error handler —
/// which clears the response first — still carry the header.
/// </summary>
public sealed class SearchIndexingPolicyTests
{
    private const string WebsiteOrigin = "http://localhost:3000";

    [Fact]
    public async Task APublicCatalogueResponseIsNoindexAndOtherwiseUnchanged()
    {
        await using var factory = new IndexingFactory();
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/tag-products");
        request.Headers.Add("Origin", WebsiteOrigin);

        var response = await client.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertNoindex(response);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("\"data\"", body, StringComparison.Ordinal);
        Assert.Contains(WebsiteOrigin, response.Headers.GetValues("Access-Control-Allow-Origin"));
        // The policy adds one header; it does not start caching API responses.
        Assert.Null(response.Headers.CacheControl);
    }

    [Theory]
    [InlineData("/api/v1/social/explore/species")]
    [InlineData("/api/v1/social/explore/pets")]
    [InlineData("/api/v1/social/explore/moments")]
    public async Task CommunityExploreStaysPubliclyReadable(string path)
    {
        await using var factory = new IndexingFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync(path);

        // Search engines render /explore by calling these anonymously, which is
        // why the API is noindexed by header and never disallowed in robots.txt.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertNoindex(response);
    }

    [Fact]
    public async Task AnErrorWrittenByTheErrorHandlerStillCarriesTheHeader()
    {
        await using var factory = new IndexingFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/tag-products/no-such-product");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        AssertNoindex(response);
        Assert.Contains("\"error\"", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task AProtectedEndpointStillRefusesAnonymousCallers()
    {
        await using var factory = new IndexingFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/owner/profile");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        AssertNoindex(response);
    }

    [Fact]
    public async Task AnUnknownRouteIsNoindex()
    {
        await using var factory = new IndexingFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        AssertNoindex(response);
    }

    [Fact]
    public async Task ACorsPreflightIsAnsweredAsBeforeAndIsNoindex()
    {
        await using var factory = new IndexingFactory();
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/v1/social/explore/moments");
        request.Headers.Add("Origin", WebsiteOrigin);
        request.Headers.Add("Access-Control-Request-Method", "GET");
        request.Headers.Add("Access-Control-Request-Headers", "authorization");

        var response = await client.SendAsync(request);

        Assert.True(response.IsSuccessStatusCode, $"Preflight answered {(int)response.StatusCode}.");
        Assert.Contains(WebsiteOrigin, response.Headers.GetValues("Access-Control-Allow-Origin"));
        AssertNoindex(response);
    }

    [Fact]
    public async Task HealthChecksAreNoindex()
    {
        await using var factory = new IndexingFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health/live");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertNoindex(response);
    }

    private static void AssertNoindex(HttpResponseMessage response)
    {
        Assert.True(
            response.Headers.TryGetValues(SearchIndexingPolicyMiddleware.HeaderName, out var values),
            $"{response.RequestMessage?.RequestUri} has no X-Robots-Tag header.");
        Assert.Equal(["noindex"], values);
    }

    private sealed class IndexingFactory : WebApplicationFactory<Program>
    {
        private readonly string _database = $"search-indexing-{Guid.NewGuid():N}";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Issuer"] = "MyPetLink.Indexing.Tests",
                    ["Jwt:Audience"] = "MyPetLink.Indexing.Client",
                    ["Jwt:SigningKey"] = "indexing-http-test-signing-key-long-enough-for-hs256",
                    ["DevAuth:Enabled"] = "false",
                }));
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<MyPetLinkDbContext>>();
                services.RemoveAll<MyPetLinkDbContext>();
                services.AddDbContext<MyPetLinkDbContext>(options => options.UseInMemoryDatabase(_database));
            });
        }
    }
}
