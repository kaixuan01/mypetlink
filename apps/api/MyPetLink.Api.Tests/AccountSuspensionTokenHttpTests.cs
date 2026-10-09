using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Account suspension through the real JWT pipeline: an access token issued
/// before a suspension stops working on its very next request — not when it
/// expires — while anonymous and finder-facing pages keep working, even for a
/// browser that still sends the old token. A Community restriction never does
/// any of this.
/// </summary>
public sealed class AccountSuspensionTokenHttpTests
{
    private static readonly Guid Moderator = Guid.Parse("cab11111-1111-1111-1111-111111111111");
    private static readonly Guid PetId = Guid.Parse("cab21111-1111-1111-1111-111111111111");

    [Fact]
    public async Task ASuspendedAccountsExistingTokenIsRefusedImmediatelyButFinderPagesStillWork()
    {
        await using var factory = new TokenFactory();
        var (ownerId, token) = await factory.SignInAsync("owner@example.com");
        using var owner = factory.CreateClient();
        owner.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var anonymous = factory.CreateClient();

        await AssertOkAsync(owner, "/api/v1/pets");

        await factory.WithServicesAsync(services => services.GetRequiredService<IAdminCommunityEnforcementService>()
            .SuspendAccountAsync(Moderator, ownerId, new AdminAccountSuspensionRequest("ScamOrFraud", null)));

        // The same, unexpired token: refused at once, with the account-status code.
        using var refused = await owner.GetAsync("/api/v1/pets");
        Assert.Equal(HttpStatusCode.Unauthorized, refused.StatusCode);
        Assert.Contains($"\"{ActiveAccountTokenCheck.ErrorCode}\"", await refused.Content.ReadAsStringAsync());

        // Finder pages never depend on it — anonymous, or with the stale token attached.
        foreach (var client in new[] { anonymous, owner })
        {
            using var safety = await client.GetAsync("/api/v1/public/safety/s-pubmochi");
            Assert.Equal(HttpStatusCode.OK, safety.StatusCode);
            Assert.Contains("\"Mochi\"", await safety.Content.ReadAsStringAsync());
        }

        await factory.WithServicesAsync(services => services.GetRequiredService<IAdminCommunityEnforcementService>()
            .ReinstateAccountAsync(Moderator, ownerId, null));
        await AssertOkAsync(owner, "/api/v1/pets");
    }

    [Fact]
    public async Task ACommunityRestrictionNeverInvalidatesASession()
    {
        await using var factory = new TokenFactory();
        var (ownerId, token) = await factory.SignInAsync("member@example.com");
        await factory.WithServicesAsync(async services =>
        {
            var db = services.GetRequiredService<MyPetLinkDbContext>();
            db.OwnerSocialProfiles.Add(new OwnerSocialProfile
            {
                UserId = ownerId,
                Handle = "MemberHome",
                NormalizedHandle = "memberhome",
                DisplayName = "Member Home",
                NormalizedDisplayName = "MEMBER HOME",
                IsSocialEnabled = true
            });
            await db.SaveChangesAsync();
            await services.GetRequiredService<IAdminCommunityEnforcementService>()
                .RestrictAsync(Moderator, ownerId, new AdminCommunityRestrictRequest("Harassment", "permanent", null));
        });
        using var owner = factory.CreateClient();
        owner.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        await AssertOkAsync(owner, "/api/v1/pets");
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync("/api/v1/social/me/profile")).StatusCode);
    }

    private static async Task AssertOkAsync(HttpClient client, string path)
    {
        using var response = await client.GetAsync(path);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{path}: {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
    }

    private sealed class TokenFactory : WebApplicationFactory<Program>
    {
        private const string Issuer = "MyPetLink.AccountSuspension.Tests";
        private const string Audience = "MyPetLink.AccountSuspension.Client";
        private const string SigningKey = "account-suspension-token-test-signing-key-long-enough";
        private readonly string _database = $"account-suspension-tokens-{Guid.NewGuid():N}";

        public async Task<(Guid UserId, string AccessToken)> SignInAsync(string email)
        {
            _ = Server;
            Guid userId = default;
            string token = "";
            await WithServicesAsync(async services =>
            {
                var db = services.GetRequiredService<MyPetLinkDbContext>();
                if (!await db.Plans.AnyAsync(plan => plan.Code == "Free"))
                {
                    db.Plans.Add(new Plan { Code = "Free", Name = "Free", Status = PlanStatus.Available });
                }

                if (!await db.Users.AnyAsync(user => user.Id == Moderator))
                {
                    db.Users.Add(new User
                    {
                        Id = Moderator,
                        Email = "moderator@example.com",
                        NormalizedEmail = "MODERATOR@EXAMPLE.COM",
                        DisplayName = "Moderator",
                        Status = UserStatus.Active
                    });
                }

                await db.SaveChangesAsync();
                var session = await services.GetRequiredService<IAuthService>().SignInWithGoogleAsync(
                    new GoogleLoginRequest(email),
                    new AuthClientContext("127.0.0.1", "tests"));
                userId = session.User.Id;
                token = session.AccessToken;
                if (!await db.Pets.AnyAsync(pet => pet.Id == PetId))
                {
                    SocialSurfaceHarness.AddPet(db, PetId, userId, "Mochi", "Cat", false, false);
                    await db.SaveChangesAsync();
                }
            });
            return (userId, token);
        }

        public async Task WithServicesAsync(Func<IServiceProvider, Task> work)
        {
            using var scope = Services.CreateScope();
            await work(scope.ServiceProvider);
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Issuer"] = Issuer,
                    ["Jwt:Audience"] = Audience,
                    ["Jwt:SigningKey"] = SigningKey,
                    ["DevAuth:Enabled"] = "false"
                }));
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<MyPetLinkDbContext>>();
                services.RemoveAll<MyPetLinkDbContext>();
                services.AddDbContext<MyPetLinkDbContext>(options => options.UseInMemoryDatabase(_database));
            });
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IExternalAuthService>();
                services.AddScoped<IExternalAuthService, EmailIsTheToken>();

                // Program.cs reads the JWT settings before a test host's
                // configuration applies, so validate with the same settings the
                // sign-in service signs with. The events — including the
                // account-status check under test — are left exactly as they are.
                services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
                {
                    options.TokenValidationParameters.ValidIssuer = Issuer;
                    options.TokenValidationParameters.ValidAudience = Audience;
                    options.TokenValidationParameters.IssuerSigningKey =
                        new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SigningKey));
                });
            });
        }
    }

    private sealed class EmailIsTheToken : IExternalAuthService
    {
        public Task<ExternalTokenUser> ValidateAsync(string provider, string token, CancellationToken cancellationToken) =>
            Task.FromResult(new ExternalTokenUser(provider, token, token, true, token.Split('@')[0]));
    }
}
