using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
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
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

public sealed class PhysicalQaHttpTests
{
    [Fact]
    public async Task QaPermissionIsEnforcedByHttpAndRevocationTakesEffectOnNextRequest()
    {
        await using var factory = new Factory(); using var client = factory.CreateClient();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
            await PhysicalQaTests.Seed(db);
            var admin = await db.AdminUsers.SingleAsync();
            var role = new AdminRoleDefinition { Code = "qa-test-viewer", Name = "QA viewer" };
            role.Capabilities.Add(new AdminRoleCapability { Capability = AdminCapabilities.InventoryView });
            role.Assignments.Add(new AdminUserRoleAssignment { AdminUserId = admin.Id });
            db.AdminRoles.Add(role); await db.SaveChangesAsync();
        }
        const string root = "/api/v1/admin/tag-inventory/qa";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(root + "/lookup?code=" + PhysicalQaTests.Code)).StatusCode);
        client.DefaultRequestHeaders.Add("X-QA-Test-User", PhysicalQaTests.UserId.ToString());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(root + "/lookup?code=" + PhysicalQaTests.Code)).StatusCode);
        var capture = new { tagCode = PhysicalQaTests.Code, expectedVersion = 1, source = "WebNfc", url = "https://mypetlink.example/n/" + PhysicalQaTests.Code };
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(root + "/capture", capture)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync(root + "/" + PhysicalQaTests.TagId, new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(root + "/cohort/preview", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(root + "/export")).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
            var role = await db.AdminRoles.SingleAsync(r => r.Code == "qa-test-viewer");
            db.AdminRoleCapabilities.Add(new AdminRoleCapability { AdminRoleId = role.Id, Capability = AdminCapabilities.InventoryQaManage }); await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(root + "/capture", capture)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(root + "/capture", new { source = "WebNfc" })).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
            db.AdminRoleCapabilities.Remove(await db.AdminRoleCapabilities.SingleAsync(c => c.Capability == AdminCapabilities.InventoryQaManage && c.AdminRole.Code == "qa-test-viewer"));
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(root + "/capture", capture)).StatusCode);
        using (var scope = factory.Services.CreateScope()) Assert.Empty(await scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>().TagScans.ToListAsync());
    }

    private sealed class Factory : WebApplicationFactory<Program>
    {
        private readonly string _database = "physical-qa-http-" + Guid.NewGuid();
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Issuer"] = "qa-test", ["Jwt:Audience"] = "qa-client", ["Jwt:SigningKey"] = "qa-test-key-long-enough-to-sign-test-tokens-only",
                ["DevAuth:Enabled"] = "false", ["PublicSite:BaseUrl"] = "https://mypetlink.example",
            }));
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<MyPetLinkDbContext>>(); services.RemoveAll<MyPetLinkDbContext>();
                services.AddDbContext<MyPetLinkDbContext>(o => o.UseInMemoryDatabase(_database));
            });
            builder.ConfigureTestServices(services => services.AddAuthentication(o =>
            {
                o.DefaultAuthenticateScheme = "QaTest"; o.DefaultChallengeScheme = "QaTest"; o.DefaultForbidScheme = "QaTest";
            }).AddScheme<AuthenticationSchemeOptions, Handler>("QaTest", _ => { }));
        }
    }
    private sealed class Handler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync() => Task.FromResult(
            Request.Headers.TryGetValue("X-QA-Test-User", out var header) && Guid.TryParse(header, out var id)
                ? AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, id.ToString())], "QaTest")), "QaTest"))
                : AuthenticateResult.NoResult());
    }
}
