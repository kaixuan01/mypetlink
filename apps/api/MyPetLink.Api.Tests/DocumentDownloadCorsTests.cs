using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The Admin Portal and the API are different origins, so a document download
/// is a cross-origin fetch. Content-Disposition is not CORS-safelisted: unless
/// the policy exposes it, the browser hides the filename the API chose and
/// every saved document falls back to a generic name that collides with the
/// next one.
/// </summary>
public sealed class DocumentDownloadCorsTests
{
    [Fact]
    public async Task ThePolicyExposesContentDispositionToTheAdminPortal()
    {
        await using var factory = new DevelopmentFactory();
        using var client = factory.CreateClient();

        using var request = new HttpRequestMessage(HttpMethod.Get, "/health/live");
        request.Headers.Add("Origin", "http://localhost:3000");

        var response = await client.SendAsync(request);
        var exposed = response.Headers.TryGetValues("Access-Control-Expose-Headers", out var values)
            ? string.Join(",", values)
            : "";

        Assert.Contains("Content-Disposition", exposed, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ThePreflightForADocumentDownloadAllowsTheAdminPortal()
    {
        await using var factory = new DevelopmentFactory();
        using var client = factory.CreateClient();

        using var request = new HttpRequestMessage(
            HttpMethod.Options,
            "/api/v1/admin/merchant-sales/invoices/00000000-0000-0000-0000-000000000001/invoice.pdf");
        request.Headers.Add("Origin", "http://localhost:3000");
        request.Headers.Add("Access-Control-Request-Method", "GET");
        request.Headers.Add("Access-Control-Request-Headers", "authorization");

        var response = await client.SendAsync(request);

        Assert.Contains(
            "http://localhost:3000",
            response.Headers.GetValues("Access-Control-Allow-Origin"));
    }

    private sealed class DevelopmentFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder) =>
            builder.UseEnvironment("Development");
    }
}
