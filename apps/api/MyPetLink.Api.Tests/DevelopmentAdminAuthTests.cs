using System.Net;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class DevelopmentAdminAuthTests
{
    private const string AdminEmail = "admin.dev@mypetlink.local";

    [Fact]
    public async Task Seed_CreatesOneDevelopmentAdmin_Idempotently()
    {
        await using var db = await CreateDatabaseAsync();
        var seeder = CreateSeeder(db, Environments.Development, enabled: true);

        Assert.True(await seeder.EnsureSeededAsync());
        Assert.True(await seeder.EnsureSeededAsync());

        var user = Assert.Single(await db.Users.Include(item => item.AdminUser).ToListAsync());
        Assert.Equal(AdminEmail, user.Email);
        Assert.Equal("MyPetLink Dev Admin", user.DisplayName);
        Assert.NotNull(user.AdminUser);
        Assert.True(user.AdminUser!.IsActive);
        Assert.Equal(AdminRole.Admin, user.AdminUser.Role);
        Assert.Single(await db.OwnerProfiles.ToListAsync());
        Assert.Single(await db.ExternalLogins
            .Where(login => login.Provider == ExternalLoginProviders.DevTest)
            .ToListAsync());
    }

    [Fact]
    public async Task Seed_CreatesDemoCatalog_Idempotently()
    {
        await using var db = await CreateDatabaseAsync();
        var seeder = CreateSeeder(db, Environments.Development, enabled: true);

        Assert.True(await seeder.EnsureSeededAsync());
        Assert.True(await seeder.EnsureSeededAsync());

        var product = Assert.Single(await db.TagProducts
            .Include(item => item.Variants)
            .Where(item => item.Slug == "mypetlink-paw-pet-tag")
            .ToListAsync());
        Assert.Equal("MyPetLink Paw Pet Tag", product.Name);
        Assert.True(product.IsPublished);
        Assert.Equal(2, product.Variants.Count);

        var lightweight = Assert.Single(product.Variants.Where(item => item.Sku == "PAW-LW-QR"));
        Assert.Equal(MyPetLinkDbContext.LightweightVariantPresetId, lightweight.TagVariantPresetId);
        Assert.Equal("Lightweight", lightweight.TagVariant);
        Assert.True(lightweight.SupportsQr);
        Assert.False(lightweight.SupportsNfc);
        Assert.True(lightweight.IsActive);
        Assert.True(lightweight.IsPurchasable);

        var standard = Assert.Single(product.Variants.Where(item => item.Sku == "PAW-STD-NFC"));
        Assert.Equal(MyPetLinkDbContext.StandardVariantPresetId, standard.TagVariantPresetId);
        Assert.Equal("Standard", standard.TagVariant);
        Assert.True(standard.SupportsQr);
        Assert.True(standard.SupportsNfc);
        Assert.True(standard.IsActive);
        Assert.True(standard.IsPurchasable);
    }

    [Fact]
    public async Task Seed_DoesNotRunOutsideDevelopment()
    {
        await using var db = await CreateDatabaseAsync();
        var seeder = CreateSeeder(db, Environments.Production, enabled: true);

        Assert.False(await seeder.EnsureSeededAsync());
        Assert.Empty(await db.Users.ToListAsync());
        Assert.Empty(await db.AdminUsers.ToListAsync());
    }

    [Fact]
    public void EnabledOutsideDevelopment_FailsStartupValidation()
    {
        var error = Assert.Throws<InvalidOperationException>(() =>
            DevAuthOptions.ValidateForStartup(
                Environment(Environments.Production),
                Options(enabled: true)));

        Assert.Contains("only be true", error.Message);
    }

    [Fact]
    public void EnabledOutsideDevelopment_StopsTheApplicationFromStarting()
    {
        using var factory = Factory(Environments.Production, enabled: true);

        var error = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains(
            "DevAuth:Enabled may only be true",
            error.ToString(),
            StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("")]
    [InlineData("admin@example.com")]
    [InlineData("not-an-email")]
    public void InvalidDevelopmentIdentity_FailsStartupValidation(string email)
    {
        var error = Assert.Throws<InvalidOperationException>(() =>
            DevAuthOptions.ValidateForStartup(
                Environment(Environments.Development),
                Options(enabled: true, email)));

        Assert.Contains("DevAuth:AdminEmail", error.Message);
    }

    [Fact]
    public async Task DevelopmentLogin_UsesNormalTokensPolicyRefreshLogout_AndBoundsRepeatedLogins()
    {
        await using var db = await CreateDatabaseAsync();
        var environment = Environment(Environments.Development);
        var options = Options(enabled: true);
        var seeder = new DevelopmentAdminSeeder(db, environment, Microsoft.Extensions.Options.Options.Create(options));
        var service = CreateAuthService(db, environment, options, seeder);
        var client = new AuthClientContext("127.0.0.1", "DevelopmentAdminAuthTests");

        var login = await service.SignInWithDevelopmentAdminAsync(client);

        Assert.False(string.IsNullOrWhiteSpace(login.AccessToken));
        Assert.False(string.IsNullOrWhiteSpace(login.RefreshToken));
        Assert.Contains(RoleConstants.Admin, login.User.Roles);
        Assert.Equal(15 * 60, login.ExpiresIn);
        Assert.Single(await db.Users.ToListAsync());
        Assert.Single(await db.AdminUsers.ToListAsync());
        Assert.Single(await db.RefreshTokens.ToListAsync());

        var policyHandler = new ActiveAdminRequirementHandler(db);
        var requirement = new ActiveAdminRequirement();
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, login.User.Id.ToString())],
            "test"));
        var authorization = new AuthorizationHandlerContext([requirement], principal, resource: null);
        await policyHandler.HandleAsync(authorization);
        Assert.True(authorization.HasSucceeded);

        var access = await service.GetAdminAuthCheckAsync(login.User.Id);
        Assert.True(access.Admin.IsActive);

        var refreshed = await service.RefreshAsync(
            new RefreshTokenRequest(login.RefreshToken),
            client);
        Assert.NotEqual(login.AccessToken, refreshed.AccessToken);
        Assert.NotEqual(login.RefreshToken, refreshed.RefreshToken);

        await service.LogoutAsync(new LogoutRequest(refreshed.RefreshToken), client);
        var loggedOutTokens = await db.RefreshTokens.ToListAsync();
        Assert.Equal(2, loggedOutTokens.Count);
        Assert.All(loggedOutTokens, token => Assert.NotNull(token.RevokedAt));

        var secondLogin = await service.SignInWithDevelopmentAdminAsync(client);
        Assert.NotEqual(login.RefreshToken, secondLogin.RefreshToken);
        Assert.Single(await db.Users.ToListAsync());
        Assert.Single(await db.AdminUsers.ToListAsync());
        Assert.Single(await db.RefreshTokens.ToListAsync());
    }

    [Fact]
    public async Task DisabledDevelopmentLogin_CannotIssueSession()
    {
        await using var db = await CreateDatabaseAsync();
        var environment = Environment(Environments.Development);
        var options = Options(enabled: false);
        var seeder = new DevelopmentAdminSeeder(db, environment, Microsoft.Extensions.Options.Options.Create(options));
        var service = CreateAuthService(db, environment, options, seeder);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            service.SignInWithDevelopmentAdminAsync(new AuthClientContext("127.0.0.1", null)));

        Assert.Equal(StatusCodes.Status404NotFound, error.StatusCode);
        Assert.Empty(await db.Users.ToListAsync());
    }

    [Fact]
    public void LoopbackGuard_RequiresBothLocalHostAndRemoteAddress()
    {
        var guard = new DevelopmentAuthRequestGuard();
        var allowed = Context("localhost", IPAddress.Loopback);
        var remoteHost = Context("localhost", IPAddress.Parse("203.0.113.25"));
        var remoteName = Context("dev.example.test", IPAddress.Loopback);

        Assert.True(guard.IsLoopback(allowed));
        Assert.False(guard.IsLoopback(remoteHost));
        Assert.False(guard.IsLoopback(remoteName));
    }

    [Fact]
    public async Task DevelopmentLoginRoute_IsAbsentWhenNotExplicitlyEnabled()
    {
        await using var factory = Factory(Environments.Development, enabled: false);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/api/v1/dev-auth/admin-login", content: null);
        var formerRoute = await client.PostAsync("/api/v1/dev/test-login", content: null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, formerRoute.StatusCode);
    }

    [Fact]
    public async Task DevelopmentLoginRoute_IsNotRegisteredInProduction()
    {
        await using var factory = Factory(Environments.Production, enabled: false);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/api/v1/dev-auth/admin-login", content: null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private static WebApplicationFactory<Program> Factory(string environment, bool enabled)
    {
        return new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(environment);
            builder.UseSetting("Jwt:SigningKey", "development-admin-tests-signing-key-at-least-32-characters");
            builder.UseSetting("DevAuth:Enabled", enabled.ToString());
        });
    }

    private static AuthService CreateAuthService(
        MyPetLinkDbContext db,
        IHostEnvironment environment,
        DevAuthOptions options,
        IDevelopmentAdminSeeder seeder)
    {
        return new AuthService(
            db,
            new UnusedExternalAuthService(),
            Microsoft.Extensions.Options.Options.Create(new JwtOptions
            {
                Issuer = "MyPetLink.Api.Tests",
                Audience = "MyPetLink.Api.Tests",
                SigningKey = "development-admin-tests-signing-key-at-least-32-characters",
                AccessTokenMinutes = 15,
                RefreshTokenDays = 30
            }),
            Microsoft.Extensions.Options.Options.Create(new AdminSeedOptions()),
            Microsoft.Extensions.Options.Options.Create(options),
            seeder,
            environment);
    }

    private static DevelopmentAdminSeeder CreateSeeder(
        MyPetLinkDbContext db,
        string environment,
        bool enabled)
    {
        return new DevelopmentAdminSeeder(
            db,
            Environment(environment),
            Microsoft.Extensions.Options.Options.Create(Options(enabled)));
    }

    private static DevAuthOptions Options(bool enabled, string email = AdminEmail) => new()
    {
        Enabled = enabled,
        AdminEmail = email,
        DisplayName = "MyPetLink Dev Admin"
    };

    private static TestHostEnvironment Environment(string name) => new()
    {
        EnvironmentName = name
    };

    private static async Task<MyPetLinkDbContext> CreateDatabaseAsync()
    {
        var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseInMemoryDatabase($"development-admin-auth-{Guid.NewGuid():N}")
            .Options;
        var db = new MyPetLinkDbContext(options);
        await db.Database.EnsureCreatedAsync();
        return db;
    }

    private static DefaultHttpContext Context(string host, IPAddress remoteAddress)
    {
        var context = new DefaultHttpContext();
        context.Request.Host = new HostString(host);
        context.Connection.RemoteIpAddress = remoteAddress;
        return context;
    }

    private sealed class UnusedExternalAuthService : IExternalAuthService
    {
        public Task<ExternalTokenUser> ValidateAsync(
            string provider,
            string token,
            CancellationToken cancellationToken) =>
            throw new InvalidOperationException("External authentication is not used in this test.");
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "MyPetLink.Api.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
