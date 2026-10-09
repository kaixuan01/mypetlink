using Microsoft.AspNetCore.Http;
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
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Account suspension through the real sign-in path: an Admin suspension
/// stops sign-in and token refresh — the existing account-status rule, not a
/// new authentication mechanism — and reinstatement restores sign-in. A
/// Community restriction never does either.
/// </summary>
public sealed class AccountSuspensionAuthTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-08T02:00:00Z");
    private static readonly Guid Moderator = Guid.Parse("caa11111-1111-1111-1111-111111111111");

    [Fact]
    public async Task ASuspendedAccountCannotSignInOrRefreshUntilReinstated()
    {
        await using var harness = await Harness.CreateAsync();
        var session = await harness.SignInAsync("owner@example.com");
        var ownerId = session.User.Id;

        await harness.Enforcement.SuspendAccountAsync(Moderator, ownerId, new AdminAccountSuspensionRequest("ScamOrFraud", null));

        // The session's refresh token was revoked with the suspension.
        var refresh = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Auth.RefreshAsync(new RefreshTokenRequest(session.RefreshToken), harness.Client));
        Assert.Equal(StatusCodes.Status401Unauthorized, refresh.StatusCode);

        // A fresh sign-in is refused by the account-status rule.
        var signIn = await Assert.ThrowsAsync<ApiException>(() => harness.SignInAsync("owner@example.com"));
        Assert.Equal((StatusCodes.Status403Forbidden, "user_inactive"), (signIn.StatusCode, signIn.Code));

        await harness.Enforcement.ReinstateAccountAsync(Moderator, ownerId, null);

        var again = await harness.SignInAsync("owner@example.com");
        Assert.Equal(ownerId, again.User.Id);
        Assert.NotEmpty(again.AccessToken);
    }

    [Fact]
    public async Task ACommunityRestrictionNeverStopsSignIn()
    {
        await using var harness = await Harness.CreateAsync();
        var session = await harness.SignInAsync("member@example.com");
        harness.Db.OwnerSocialProfiles.Add(new OwnerSocialProfile
        {
            UserId = session.User.Id,
            Handle = "MemberHome",
            NormalizedHandle = "MEMBERHOME",
            DisplayName = "Member Home",
            NormalizedDisplayName = "MEMBER HOME",
            IsSocialEnabled = true
        });
        await harness.Db.SaveChangesAsync();

        await harness.Enforcement.RestrictAsync(Moderator, session.User.Id, new AdminCommunityRestrictRequest("Harassment", "permanent", null));

        var refreshed = await harness.Auth.RefreshAsync(new RefreshTokenRequest(session.RefreshToken), harness.Client);
        Assert.NotEmpty(refreshed.AccessToken);
        Assert.Equal(session.User.Id, (await harness.SignInAsync("member@example.com")).User.Id);
    }

    private sealed class Harness : IAsyncDisposable
    {
        private Harness(MyPetLinkDbContext db, AuthService auth, AdminCommunityEnforcementService enforcement)
        {
            Db = db;
            Auth = auth;
            Enforcement = enforcement;
        }

        public MyPetLinkDbContext Db { get; }
        public AuthService Auth { get; }
        public AdminCommunityEnforcementService Enforcement { get; }
        public AuthClientContext Client { get; } = new("127.0.0.1", "tests");

        public static async Task<Harness> CreateAsync()
        {
            var db = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options);
            db.Plans.Add(new Plan { Code = "Free", Name = "Free", Status = PlanStatus.Available });
            db.Users.Add(new User
            {
                Id = Moderator,
                Email = "moderator@example.com",
                NormalizedEmail = "MODERATOR@EXAMPLE.COM",
                DisplayName = "Moderator",
                Status = UserStatus.Active
            });
            await db.SaveChangesAsync();

            var clock = new FixedTimeProvider(Now);
            var audit = new AuditLogService(db, new HttpContextAccessor());
            var auth = new AuthService(
                db,
                new TokenAuth(),
                Options.Create(new JwtOptions
                {
                    Issuer = "tests",
                    Audience = "tests",
                    SigningKey = "account-suspension-tests-signing-key-long-enough"
                }),
                Options.Create(new AdminSeedOptions()),
                Options.Create(new DevAuthOptions()),
                Options.Create(new ReferralAttributionOptions { WindowDays = 90 }),
                new NoopSeeder(),
                new TestEnvironment(),
                audit,
                clock);
            var enforcement = new AdminCommunityEnforcementService(
                db,
                new OwnerNotificationService(db, Options.Create(new CloudflareR2Options())),
                audit,
                clock);
            return new Harness(db, auth, enforcement);
        }

        public Task<AuthTokenResponse> SignInAsync(string email) =>
            Auth.SignInWithGoogleAsync(new GoogleLoginRequest(email), Client);

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }

    private sealed class TokenAuth : IExternalAuthService
    {
        public Task<ExternalTokenUser> ValidateAsync(string provider, string token, CancellationToken cancellationToken) =>
            Task.FromResult(new ExternalTokenUser(provider, token, token, true, token.Split('@')[0]));
    }

    private sealed class NoopSeeder : IDevelopmentAdminSeeder
    {
        public Task<bool> EnsureSeededAsync(CancellationToken cancellationToken = default) => Task.FromResult(false);
    }

    private sealed class TestEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "Tests";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
