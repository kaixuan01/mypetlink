using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
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
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Community moderation seen from outside, through the real HTTP pipeline:
/// a hidden Moment and a restricted household change Community and nothing
/// else. The Safety Profile and every Smart Tag entry point (the API behind
/// <c>/q</c>, <c>/n</c> and <c>/t</c>) answer byte for byte as they did before,
/// and the owner keeps the Owner Portal. Test-only authentication on an
/// in-memory host; DevAuth stays off.
/// </summary>
public sealed class CommunityModerationHttpFlowTests
{
    private static readonly Guid Alice = Guid.Parse("b8111111-1111-1111-1111-111111111111");     // @TanFamily
    private static readonly Guid Bob = Guid.Parse("b8222222-2222-2222-2222-222222222222");       // @LimFamily
    private static readonly Guid Moderator = Guid.Parse("b8333333-3333-3333-3333-333333333333");
    private static readonly Guid Mochi = Guid.Parse("b8411111-1111-1111-1111-111111111111");
    private const string TagCode = "MPL-MODR-TAG1";

    [Fact]
    public async Task HidingAMomentChangesCommunityAndLeavesSafetyAndSmartTagsAlone()
    {
        await using var world = await World.CreateAsync();
        using var alice = world.As(Alice);
        using var anonymous = world.As(null);
        var before = await CommunityIndependentPayloadsAsync(anonymous);

        await world.MutateAsync(db =>
        {
            CommunityModeration.HideMoment(db.PetMemories.Single(item => item.Id == world.HiddenMomentId), Moderator, DateTimeOffset.UtcNow);
        });

        // Unavailable exactly like a Moment that does not exist.
        var hidden = await anonymous.GetAsync($"/api/v1/public/moments/{world.HiddenMomentId}");
        var missing = await anonymous.GetAsync($"/api/v1/public/moments/{Guid.NewGuid()}");
        Assert.Equal(missing.StatusCode, hidden.StatusCode);
        Assert.Equal(await ErrorCode(missing), await ErrorCode(hidden));

        var share = await Data(await anonymous.GetAsync("/api/v1/public/pets/mochi-pubmochi"));
        Assert.DoesNotContain(share.GetProperty("memories").EnumerateArray(),
            memory => memory.GetProperty("title").GetString() == "Beach day");

        // The owner still has it, marked, in the Owner Portal.
        var owned = (await Data(await alice.GetAsync($"/api/v1/pets/{Mochi}/memories"))).EnumerateArray()
            .Single(memory => memory.GetProperty("id").GetGuid() == world.HiddenMomentId);
        Assert.Equal(JsonValueKind.String, owned.GetProperty("hiddenByMyPetLinkAt").ValueKind);

        // Safety Profile and every Smart Tag entry point: unchanged. The Share
        // Profile itself still answers too.
        var after = await CommunityIndependentPayloadsAsync(anonymous);
        Assert.Equal(before.Safety, after.Safety);
        Assert.Equal(before.Legacy, after.Legacy);
        Assert.Equal(before.Qr, after.Qr);
        Assert.Equal(before.Nfc, after.Nfc);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/api/v1/public/pets/mochi-pubmochi")).StatusCode);
    }

    [Fact]
    public async Task ARestrictedHouseholdLosesCommunityAndKeepsEverythingElse()
    {
        await using var world = await World.CreateAsync();
        using var alice = world.As(Alice);
        using var anonymous = world.As(null);
        var before = await CommunityIndependentPayloadsAsync(anonymous);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/api/v1/public/owners/tanfamily")).StatusCode);

        await world.MutateAsync(db =>
        {
            CommunityModeration.RestrictHousehold(db.OwnerSocialProfiles.Single(item => item.UserId == Alice), Moderator, DateTimeOffset.UtcNow);
        });

        // Community: the profile and its Moments are gone, and it stays off.
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync("/api/v1/public/owners/tanfamily")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/v1/public/moments/{world.HiddenMomentId}")).StatusCode);
        var refused = await alice.PutAsJsonAsync("/api/v1/social/me/profile", new { isSocialEnabled = true });
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        Assert.Equal("community_restricted", await ErrorCode(refused));

        // Not an account suspension: signed in, Owner Portal, pets and Moments.
        Assert.Equal(HttpStatusCode.OK, (await alice.GetAsync("/api/v1/pets")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await alice.GetAsync($"/api/v1/pets/{Mochi}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await alice.GetAsync($"/api/v1/pets/{Mochi}/memories")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await alice.GetAsync("/api/v1/social/me/profile")).StatusCode);

        // Share Profile answers; Safety Profile and Smart Tags are unchanged.
        var share = await Data(await anonymous.GetAsync("/api/v1/public/pets/mochi-pubmochi"));
        Assert.Equal("Mochi", share.GetProperty("name").GetString());
        var after = await CommunityIndependentPayloadsAsync(anonymous);
        Assert.Equal(before.Safety, after.Safety);
        Assert.Equal(before.Legacy, after.Legacy);
        Assert.Equal(before.Qr, after.Qr);
        Assert.Equal(before.Nfc, after.Nfc);
    }

    // ---- helpers ----------------------------------------------------------

    private sealed record Payloads(string Safety, string Legacy, string Qr, string Nfc);

    /// <summary>The Safety Profile and the three Smart Tag entry points, as payloads.</summary>
    private static async Task<Payloads> CommunityIndependentPayloadsAsync(HttpClient client)
    {
        var payloads = new Payloads(
            (await Data(await client.GetAsync("/api/v1/public/safety/s-pubmochi"))).GetRawText(),
            (await Data(await client.GetAsync($"/api/v1/public/tags/{TagCode}"))).GetRawText(),
            (await Data(await client.GetAsync($"/api/v1/public/tags/{TagCode}/qr"))).GetRawText(),
            (await Data(await client.GetAsync($"/api/v1/public/tags/{TagCode}/nfc"))).GetRawText());

        // Real Safety pages for Mochi, not four identical "unknown tag" answers.
        Assert.All(new[] { payloads.Safety, payloads.Legacy, payloads.Qr, payloads.Nfc },
            payload => Assert.Contains("\"Mochi\"", payload));
        return payloads;
    }

    private static async Task<JsonElement> Data(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {body}");
        using var json = JsonDocument.Parse(body);
        return json.RootElement.GetProperty("data").Clone();
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("error").GetProperty("code").GetString();
    }

    private sealed class World : IAsyncDisposable
    {
        private readonly ModerationFactory _factory;

        private World(ModerationFactory factory, Guid hiddenMomentId)
        {
            _factory = factory;
            HiddenMomentId = hiddenMomentId;
        }

        public Guid HiddenMomentId { get; }

        public static async Task<World> CreateAsync()
        {
            var factory = new ModerationFactory();
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();

            SocialSurfaceHarness.AddOwner(db, Alice, "alice@example.com", "Alice Tan", "TanFamily", "The Tan Family", true, true);
            SocialSurfaceHarness.AddOwner(db, Bob, "bob@example.com", "Bob Lim", "LimFamily", "The Lim Family", true, true);
            SocialSurfaceHarness.AddOwner(db, Moderator, "mod@example.com", "Moderator", "ModHome", "Mod Home", false, false);
            await db.SaveChangesAsync();

            SocialSurfaceHarness.AddPet(db, Mochi, Alice, "Mochi", "Cat", true, true);
            db.SmartTags.Add(new SmartTag
            {
                TagCode = TagCode,
                OwnerUserId = Alice,
                PetId = Mochi,
                HasNfc = true,
                Status = SmartTagStatus.Active,
                ActivatedAt = DateTimeOffset.UtcNow.AddDays(-3)
            });

            var moment = new PetMemory
            {
                Id = Guid.NewGuid(),
                PetId = Mochi,
                AuthorUserId = Alice,
                Title = "Beach day",
                Type = "Memory",
                Visibility = MemoryVisibility.Public,
                ShowInLifeTimeline = true,
                PublishedAt = DateTimeOffset.UtcNow.AddHours(-1)
            };
            db.PetMemories.Add(moment);
            db.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = Mochi });
            await db.SaveChangesAsync();

            return new World(factory, moment.Id);
        }

        public async Task MutateAsync(Action<MyPetLinkDbContext> change)
        {
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
            change(db);
            await db.SaveChangesAsync();
        }

        public HttpClient As(Guid? userId)
        {
            var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
            if (userId.HasValue)
            {
                client.DefaultRequestHeaders.Add(TestAuthHandler.Header, userId.Value.ToString());
            }

            return client;
        }

        public ValueTask DisposeAsync() => _factory.DisposeAsync();
    }

    private sealed class ModerationFactory : WebApplicationFactory<Program>
    {
        private readonly string _database = $"moderation-http-{Guid.NewGuid():N}";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Issuer"] = "MyPetLink.Moderation.Tests",
                    ["Jwt:Audience"] = "MyPetLink.Moderation.Client",
                    ["Jwt:SigningKey"] = "moderation-http-test-signing-key-long-enough-for-hs256",
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
                services.AddAuthentication(options =>
                    {
                        options.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                        options.DefaultChallengeScheme = TestAuthHandler.SchemeName;
                        options.DefaultForbidScheme = TestAuthHandler.SchemeName;
                    })
                    .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, _ => { });
            });
        }
    }

    private sealed class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
    {
        public const string SchemeName = "ModerationHttpTest";
        public const string Header = "X-Test-User";

        public TestAuthHandler(
            IOptionsMonitor<AuthenticationSchemeOptions> options,
            ILoggerFactory logger,
            UrlEncoder encoder)
            : base(options, logger, encoder)
        {
        }

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue(Header, out var value)
                || !Guid.TryParse(value.ToString(), out var userId))
            {
                return Task.FromResult(AuthenticateResult.NoResult());
            }

            var identity = new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId.ToString()), new Claim(ClaimTypes.Role, "Owner")],
                SchemeName);
            return Task.FromResult(AuthenticateResult.Success(
                new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
        }
    }
}
