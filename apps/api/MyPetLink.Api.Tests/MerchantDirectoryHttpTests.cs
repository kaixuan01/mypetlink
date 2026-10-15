using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers.Admin;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class MerchantDirectoryHttpTests
{
    [Fact]
    public async Task BrowserServiceSmokeUsesRealVersionedKestrelRoutesAndCapabilityAuthorization()
    {
        await using var db = await AdminAccessTestHarness.CreateAsync(AdminRole.SuperAdmin);
        var admin = await db.AdminUsers.SingleAsync();
        var merchant = MerchantDirectoryTests.Merchant(); db.Add(merchant); await db.SaveChangesAsync();
        db.SavingChanges += (_, _) => {
            foreach (var entry in db.ChangeTracker.Entries<MerchantBranch>().Where(entry => entry.State == EntityState.Added)) entry.Entity.RowVersion = [1];
        };
        using var host = ServerBuilder(db).UseKestrel().UseUrls("http://127.0.0.1:0").Build();
        await host.StartAsync();
        var origin = host.ServerFeatures.Get<IServerAddressesFeature>()!.Addresses.Single();
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !File.Exists(Path.Combine(root.FullName, "package.json"))) root = root.Parent;
        Assert.NotNull(root);
        var start = new System.Diagnostics.ProcessStartInfo
        {
            FileName = OperatingSystem.IsWindows() ? "cmd.exe" : "npm",
            WorkingDirectory = root!.FullName, RedirectStandardOutput = true, RedirectStandardError = true,
            UseShellExecute = false, CreateNoWindow = true,
        };
        if (OperatingSystem.IsWindows()) { start.ArgumentList.Add("/c"); start.ArgumentList.Add("npm --workspace apps/web exec -- vitest run src/services/merchantDirectoryService.routing.test.ts"); }
        else foreach (var argument in new[] { "--workspace", "apps/web", "exec", "--", "vitest", "run", "src/services/merchantDirectoryService.routing.test.ts" }) start.ArgumentList.Add(argument);
        start.Environment["MYPETLINK_DIRECTORY_SMOKE_URL"] = origin;
        start.Environment["MYPETLINK_DIRECTORY_SMOKE_MERCHANT"] = merchant.Id.ToString();
        start.Environment["MYPETLINK_DIRECTORY_SMOKE_ADMIN"] = admin.UserId.ToString();
        using var process = System.Diagnostics.Process.Start(start)!;
        var output = process.StandardOutput.ReadToEndAsync(); var errors = process.StandardError.ReadToEndAsync();
        try { await process.WaitForExitAsync(new CancellationTokenSource(TimeSpan.FromMinutes(2)).Token); }
        catch { process.Kill(entireProcessTree: true); throw; }
        Assert.True(process.ExitCode == 0, (await output) + (await errors));
        Assert.Contains("3 passed", await output);
        await host.StopAsync();
    }
    [Fact]
    public async Task AdminMutationsRejectAnonymousOwnerReadOnlyAndDisabledAdministrators()
    {
        await using var db = await AdminAccessTestHarness.CreateAsync(AdminRole.SuperAdmin);
        var admin = await db.AdminUsers.SingleAsync();
        var merchant = MerchantDirectoryTests.Merchant(); db.Add(merchant); await db.SaveChangesAsync();
        using var server = Server(db); using var client = server.CreateClient();
        var listingPath = $"/api/v1/admin/merchant-sales/merchants/{merchant.Id}/listing";
        var branchPath = $"/api/v1/admin/merchant-sales/merchants/{merchant.Id}/branches";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PutAsJsonAsync(listingPath, new UpdateMerchantListingRequest(true, null, "AQ==", MerchantDirectoryTests.Permission()))).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-User", Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(branchPath, MerchantDirectoryTests.Branch())).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-User"); client.DefaultRequestHeaders.Add("X-Test-User", admin.UserId.ToString());
        await AdminAccessTestHarness.SetRolesAsync(db, admin, AdminRoleTemplates.AuditorCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync(listingPath, new UpdateMerchantListingRequest(true, null, "AQ==", MerchantDirectoryTests.Permission()))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(branchPath, MerchantDirectoryTests.Branch())).StatusCode);
        await AdminAccessTestHarness.SetRolesAsync(db, admin, AdminRoleTemplates.SuperAdminCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(listingPath, new UpdateMerchantListingRequest(true, null, "AQ==", MerchantDirectoryTests.Permission()))).StatusCode);
        admin.IsActive = false; await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(branchPath, MerchantDirectoryTests.Branch())).StatusCode);
        Assert.Empty(await db.MerchantBranches.ToListAsync());
    }

    [Fact]
    public async Task PublicHttpResponsesAreUncachedPrivacySafeAndWithdrawnLinksReturn404()
    {
        await using var db = AdminAccessTestHarness.CreateDb();
        var merchant = MerchantDirectoryTests.Merchant(true); db.Add(merchant); await db.SaveChangesAsync();
        var service = MerchantDirectoryTests.Service(db);
        await service.UpsertBranchAsync(null, merchant.Id, null, MerchantDirectoryTests.Branch("Public branch", true), default);
        await service.UpsertBranchAsync(null, merchant.Id, null, MerchantDirectoryTests.Branch("SECRET BRANCH"), default);
        using var server = Server(db); using var client = server.CreateClient();
        var response = await client.GetAsync("/api/v1/public/partner-stores");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); Assert.True(response.Headers.CacheControl!.NoStore);
        Assert.Equal("no-store", response.Headers.GetValues("CDN-Cache-Control").Single());
        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("Public branch", json); Assert.DoesNotContain("SECRET", json); Assert.DoesNotContain("PRIVATE", json);
        Assert.DoesNotContain(merchant.Id.ToString(), json);
        var publicPath = $"/api/v1/public/partner-stores/{merchant.DirectoryPublicCode}";
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(publicPath)).StatusCode);
        var listing = await service.GetListingAsync(merchant.Id, default);
        await service.UpdateListingAsync(null, merchant.Id, new(false, null, listing.ConcurrencyToken), default);
        var withdrawn = await client.GetAsync(publicPath);
        Assert.Equal(HttpStatusCode.NotFound, withdrawn.StatusCode);
        Assert.True(withdrawn.Headers.CacheControl!.NoStore);
        var empty = JsonDocument.Parse(await client.GetStringAsync("/api/v1/public/partner-stores"));
        Assert.Equal(0, empty.RootElement.GetProperty("data").GetArrayLength());
    }

    private static TestServer Server(MyPetLink.Api.Data.MyPetLinkDbContext db) => new(ServerBuilder(db));
    private static IWebHostBuilder ServerBuilder(MyPetLink.Api.Data.MyPetLinkDbContext db) => new WebHostBuilder()
        .ConfigureServices(services => {
            services.AddLogging(); services.AddSingleton(db); services.AddHttpContextAccessor();
            services.AddScoped<ICurrentUserService, CurrentUserService>();
            services.AddScoped<IAdminAccessResolver, AdminAccessResolver>();
            services.AddScoped<IAuthorizationHandler, AdminCapabilityRequirementHandler>();
            services.AddSingleton(MerchantDirectoryTests.Service(db));
            services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, TestAuthentication>("Test", _ => {});
            services.AddAuthorization(options => {
                foreach (var capability in AdminCapabilityCatalog.AllKeys)
                    options.AddPolicy(capability, policy => { policy.RequireAuthenticatedUser(); policy.AddRequirements(new AdminCapabilityRequirement(capability)); });
            });
            services.AddControllers().AddApplicationPart(typeof(AdminMerchantListingController).Assembly);
        }).Configure(app => {
            app.Use(async (context, next) => {
                try { await next(); }
                catch (ApiException error) {
                    context.Response.StatusCode = error.StatusCode;
                    await context.Response.WriteAsJsonAsync(ApiEnvelope.Error(context, error.Code, error.Message, error.Details));
                }
            });
            app.UseRouting(); app.UseAuthentication(); app.UseAuthorization(); app.UseEndpoints(endpoints => endpoints.MapControllers());
        });

    private sealed class TestAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Test-User", out var subject))
            {
                var bearer = Request.Headers.Authorization.ToString();
                if (!bearer.StartsWith("Bearer ") || !Guid.TryParse(bearer[7..], out _)) return Task.FromResult(AuthenticateResult.NoResult());
                subject = bearer[7..];
            }
            var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, subject.ToString())], "Test"));
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, "Test")));
        }
    }
}
