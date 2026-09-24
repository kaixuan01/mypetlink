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
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Moment Collaboration end to end through the real HTTP pipeline — routing,
/// authorization, the rate-limited controllers, JSON contracts and the public
/// read surfaces — with several households signed in at once.
///
/// The service tests prove the rules; these prove a household can actually
/// get through them over the wire, and that what comes back is safe to hand a
/// browser. They are the durable multi-household coverage the Community
/// browser harness cannot provide: that harness signs in as exactly one
/// Development identity, by design. Authentication here is a test-only scheme
/// on an in-memory host; DevAuth stays off and no token is minted.
/// </summary>
public sealed class MomentCollaborationHttpFlowTests
{
    private static readonly Guid Alice = Guid.Parse("d1111111-1111-1111-1111-111111111111");
    private static readonly Guid Bob = Guid.Parse("d2222222-2222-2222-2222-222222222222");
    private static readonly Guid Erin = Guid.Parse("d3333333-3333-3333-3333-333333333333");
    private static readonly Guid Finn = Guid.Parse("d4444444-4444-4444-4444-444444444444");
    private static readonly Guid Gina = Guid.Parse("d5555555-5555-5555-5555-555555555555");

    private static readonly Guid Mochi = Guid.Parse("d6111111-1111-1111-1111-111111111111");
    private static readonly Guid Buddy = Guid.Parse("d6222222-2222-2222-2222-222222222222");
    private static readonly Guid Pip = Guid.Parse("d6333333-3333-3333-3333-333333333333");
    private static readonly Guid Rex = Guid.Parse("d6444444-4444-4444-4444-444444444444");
    private static readonly Guid Kit = Guid.Parse("d6555555-5555-5555-5555-555555555555");

    private static readonly Guid[] InternalIds = [Alice, Bob, Erin, Finn, Gina, Mochi, Buddy, Pip, Rex, Kit];

    [Fact]
    public async Task InviteThenAccept_ShowsAttributionPublicly_OnlyAfterConsent()
    {
        await using var world = await World.CreateAsync();
        using var alice = world.As(Alice);
        using var bob = world.As(Bob);
        using var anonymous = world.As(null);

        var invited = await alice.PostAsJsonAsync(
            $"/api/v1/social/moments/{world.MomentId}/collaborations",
            new { handle = "limfamily", petSlugs = new[] { "buddy-pubbuddy" } });
        Assert.Equal(HttpStatusCode.OK, invited.StatusCode);
        Assert.Equal("no-store", invited.Headers.CacheControl?.ToString());
        var invitedJson = await Data(invited);
        Assert.Equal("author", invitedJson.GetProperty("viewerRole").GetString());
        Assert.Equal("Pending", invitedJson.GetProperty("items")[0].GetProperty("status").GetString());

        // Pending is consent not yet given: nothing public changes.
        Assert.Empty(await PublicCollaborations(anonymous, world.MomentId));
        Assert.DoesNotContain("Beach day", await Raw(anonymous, "/api/v1/public/pets/buddy-pubbuddy"));

        var incoming = await Data(await bob.GetAsync("/api/v1/social/collaborations/incoming"));
        var invitation = incoming.GetProperty("items")[0];
        Assert.Equal("TanFamily", invitation.GetProperty("author").GetProperty("handle").GetString());
        var collaborationId = invitation.GetProperty("id").GetString();
        Assert.Contains(
            "MomentCollaborationRequested",
            await Raw(bob, "/api/v1/social/notifications"));

        var accepted = await bob.PostAsJsonAsync(
            $"/api/v1/social/collaborations/{collaborationId}/accept",
            new { petSlugs = new[] { "buddy-pubbuddy" } });
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        Assert.Equal("Accepted", (await Data(accepted)).GetProperty("items")[0].GetProperty("status").GetString());

        // The card: the author's pets stay the author's; Bob's household and
        // pet are grouped under the collaboration.
        var card = await Data(await anonymous.GetAsync($"/api/v1/public/moments/{world.MomentId}"));
        Assert.Equal("TanFamily", card.GetProperty("author").GetProperty("handle").GetString());
        Assert.Equal(["Mochi"], card.GetProperty("subjects").EnumerateArray()
            .Select(subject => subject.GetProperty("name").GetString()).ToArray());
        var collaboration = Assert.Single(card.GetProperty("collaborations").EnumerateArray());
        Assert.Equal("LimFamily", collaboration.GetProperty("household").GetProperty("handle").GetString());
        Assert.Equal("Buddy", Assert.Single(collaboration.GetProperty("pets").EnumerateArray())
            .GetProperty("name").GetString());

        // The collaborator pet's Share Profile shows it as someone else's.
        var share = await Data(await anonymous.GetAsync("/api/v1/public/pets/buddy-pubbuddy"));
        var shared = Assert.Single(share.GetProperty("memories").EnumerateArray(),
            memory => memory.GetProperty("title").GetString() == "Beach day");
        Assert.Equal("TanFamily", shared.GetProperty("momentBy").GetProperty("handle").GetString());
        Assert.False(shared.GetProperty("showInLifeTimeline").GetBoolean());

        // ...and its Safety Profile knows nothing about it.
        Assert.DoesNotContain("Beach day", await Raw(anonymous, "/api/v1/public/safety/s-pubbuddy"));

        Assert.Contains("MomentCollaborationAccepted", await Raw(alice, "/api/v1/social/notifications"));

        // Nothing handed to a browser carries an internal id.
        foreach (var body in new[]
        {
            await Raw(anonymous, $"/api/v1/public/moments/{world.MomentId}"),
            await Raw(anonymous, "/api/v1/public/pets/buddy-pubbuddy"),
            await Raw(alice, $"/api/v1/social/moments/{world.MomentId}/collaborations"),
            await Raw(bob, $"/api/v1/social/moments/{world.MomentId}/collaborations"),
            await Raw(alice, $"/api/v1/social/collaboration-candidates?momentId={world.MomentId}")
        })
        {
            foreach (var id in InternalIds)
            {
                Assert.DoesNotContain(id.ToString(), body, StringComparison.OrdinalIgnoreCase);
            }
        }
    }

    [Fact]
    public async Task AFourthHousehold_IsRefused_UntilARevokeFreesASlot()
    {
        await using var world = await World.CreateAsync();
        using var alice = world.As(Alice);

        Assert.Equal(HttpStatusCode.OK, (await Invite(alice, world, "limfamily", "buddy-pubbuddy")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Invite(alice, world, "erinhome", "pip-pubpip")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Invite(alice, world, "finnhome", "rex-pubrex")).StatusCode);

        var fourth = await Invite(alice, world, "ginahome", "kit-pubkit");
        Assert.Equal(HttpStatusCode.Conflict, fourth.StatusCode);
        Assert.Equal("collaboration_limit_reached", await ErrorCode(fourth));

        var list = await Data(await alice.GetAsync($"/api/v1/social/moments/{world.MomentId}/collaborations"));
        Assert.Equal(3, list.GetProperty("liveHouseholds").GetInt32());
        Assert.False(list.GetProperty("canInvite").GetBoolean());
        var bobsInvitation = list.GetProperty("items").EnumerateArray()
            .Single(item => item.GetProperty("household").GetProperty("handle").GetString() == "LimFamily")
            .GetProperty("id").GetString();

        var revoked = await alice.DeleteAsync(
            $"/api/v1/social/moments/{world.MomentId}/collaborations/{bobsInvitation}");
        Assert.Equal(HttpStatusCode.OK, revoked.StatusCode);

        // A revoked household may be asked again, and it takes the free slot.
        Assert.Equal(HttpStatusCode.OK, (await Invite(alice, world, "limfamily", "buddy-pubbuddy")).StatusCode);
        Assert.Equal("collaboration_limit_reached", await ErrorCode(await Invite(alice, world, "ginahome", "kit-pubkit")));
    }

    [Fact]
    public async Task Leaving_RemovesOnlyThatHousehold_AndIsFinal()
    {
        await using var world = await World.CreateAsync();
        using var alice = world.As(Alice);
        using var bob = world.As(Bob);
        using var erin = world.As(Erin);
        using var anonymous = world.As(null);

        await Invite(alice, world, "limfamily", "buddy-pubbuddy");
        await Invite(alice, world, "erinhome", "pip-pubpip");
        var bobs = await AcceptOnly(bob, "buddy-pubbuddy");
        await AcceptOnly(erin, "pip-pubpip");
        Assert.Equal(2, (await PublicCollaborations(anonymous, world.MomentId)).Length);

        Assert.Equal(HttpStatusCode.OK,
            (await bob.PostAsync($"/api/v1/social/collaborations/{bobs}/leave", null)).StatusCode);

        var remaining = Assert.Single(await PublicCollaborations(anonymous, world.MomentId));
        Assert.Equal("ErinHome", remaining.GetProperty("household").GetProperty("handle").GetString());
        Assert.Equal("collaboration_reinvite_unavailable",
            await ErrorCode(await Invite(alice, world, "limfamily", "buddy-pubbuddy")));
    }

    [Fact]
    public async Task Blocking_DissolvesThatPairOnly_AndUnblockingRestoresNothing()
    {
        await using var world = await World.CreateAsync();
        using var alice = world.As(Alice);
        using var bob = world.As(Bob);
        using var erin = world.As(Erin);
        using var anonymous = world.As(null);

        await Invite(alice, world, "limfamily", "buddy-pubbuddy");
        await Invite(alice, world, "erinhome", "pip-pubpip");
        await AcceptOnly(bob, "buddy-pubbuddy");
        await AcceptOnly(erin, "pip-pubpip");

        // The collaborator blocks the author.
        Assert.Equal(HttpStatusCode.OK,
            (await bob.PostAsync("/api/v1/social/owners/tanfamily/block", null)).StatusCode);

        var remaining = Assert.Single(await PublicCollaborations(anonymous, world.MomentId));
        Assert.Equal("ErinHome", remaining.GetProperty("household").GetProperty("handle").GetString());
        var authorView = await Raw(alice, $"/api/v1/social/moments/{world.MomentId}/collaborations");
        Assert.DoesNotContain("LimFamily", authorView);
        Assert.DoesNotContain("Dissolved", authorView);

        Assert.Equal(HttpStatusCode.OK,
            (await bob.DeleteAsync("/api/v1/social/owners/tanfamily/block")).StatusCode);

        Assert.Single(await PublicCollaborations(anonymous, world.MomentId));
        Assert.Equal("collaboration_reinvite_unavailable",
            await ErrorCode(await Invite(alice, world, "limfamily", "buddy-pubbuddy")));
    }

    [Fact]
    public async Task ACollaborator_CannotManageTheMoment_OrAnyoneElsesPlace()
    {
        await using var world = await World.CreateAsync();
        using var alice = world.As(Alice);
        using var bob = world.As(Bob);
        using var anonymous = world.As(null);

        await Invite(alice, world, "limfamily", "buddy-pubbuddy");
        await Invite(alice, world, "erinhome", "pip-pubpip");
        await AcceptOnly(bob, "buddy-pubbuddy");
        var erinsInvitation = (await Data(await alice.GetAsync(
                $"/api/v1/social/moments/{world.MomentId}/collaborations")))
            .GetProperty("items").EnumerateArray()
            .Single(item => item.GetProperty("household").GetProperty("handle").GetString() == "ErinHome")
            .GetProperty("id").GetString();

        Assert.Equal("social_moment_not_found",
            await ErrorCode(await Invite(bob, world, "ginahome", "kit-pubkit")));
        Assert.Equal(HttpStatusCode.NotFound, (await bob.DeleteAsync(
            $"/api/v1/social/moments/{world.MomentId}/collaborations/{erinsInvitation}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PostAsJsonAsync(
            $"/api/v1/social/collaborations/{erinsInvitation}/accept",
            new { petSlugs = new[] { "pip-pubpip" } })).StatusCode);
        Assert.NotEqual(HttpStatusCode.OK, (await bob.PutAsJsonAsync(
            $"/api/v1/memories/{world.MomentId}",
            new { caption = "Mine now" })).StatusCode);
        Assert.NotEqual(HttpStatusCode.OK,
            (await bob.DeleteAsync($"/api/v1/memories/{world.MomentId}")).StatusCode);

        var card = await Data(await anonymous.GetAsync($"/api/v1/public/moments/{world.MomentId}"));
        Assert.NotEqual("Mine now", card.GetProperty("caption").GetString());

        Assert.Equal(HttpStatusCode.Unauthorized, (await Invite(anonymous, world, "limfamily", "buddy-pubbuddy")).StatusCode);
    }

    // ---- helpers ----------------------------------------------------------

    private static Task<HttpResponseMessage> Invite(HttpClient client, World world, string handle, string petSlug) =>
        client.PostAsJsonAsync(
            $"/api/v1/social/moments/{world.MomentId}/collaborations",
            new { handle, petSlugs = new[] { petSlug } });

    private static async Task<string> AcceptOnly(HttpClient invitee, string petSlug)
    {
        var incoming = await Data(await invitee.GetAsync("/api/v1/social/collaborations/incoming"));
        var id = incoming.GetProperty("items")[0].GetProperty("id").GetString()!;
        var accepted = await invitee.PostAsJsonAsync(
            $"/api/v1/social/collaborations/{id}/accept",
            new { petSlugs = new[] { petSlug } });
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        return id;
    }

    private static async Task<JsonElement[]> PublicCollaborations(HttpClient client, Guid momentId)
    {
        var card = await Data(await client.GetAsync($"/api/v1/public/moments/{momentId}"));
        return card.GetProperty("collaborations").EnumerateArray().ToArray();
    }

    private static async Task<JsonElement> Data(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {body}");
        using var json = JsonDocument.Parse(body);
        return json.RootElement.GetProperty("data").Clone();
    }

    private static async Task<string> Raw(HttpClient client, string path)
    {
        var response = await client.GetAsync(path);
        return await response.Content.ReadAsStringAsync();
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("error").GetProperty("code").GetString();
    }

    /// <summary>One in-memory API with five households and one public Moment.</summary>
    private sealed class World : IAsyncDisposable
    {
        private readonly CollaborationFactory _factory;

        private World(CollaborationFactory factory, Guid momentId)
        {
            _factory = factory;
            MomentId = momentId;
        }

        public Guid MomentId { get; }

        public static async Task<World> CreateAsync()
        {
            var factory = new CollaborationFactory();
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();

            SocialSurfaceHarness.AddOwner(db, Alice, "alice@example.com", "Alice Tan", "TanFamily", "The Tan Family", true, true);
            SocialSurfaceHarness.AddOwner(db, Bob, "bob@example.com", "Bob Lim", "LimFamily", "The Lim Family", true, true);
            SocialSurfaceHarness.AddOwner(db, Erin, "erin@example.com", "Erin Ong", "ErinHome", "The Ong Home", true, true);
            SocialSurfaceHarness.AddOwner(db, Finn, "finn@example.com", "Finn Koh", "FinnHome", "The Koh Home", true, true);
            SocialSurfaceHarness.AddOwner(db, Gina, "gina@example.com", "Gina Yap", "GinaHome", "The Yap Home", true, true);
            await db.SaveChangesAsync();

            SocialSurfaceHarness.AddPet(db, Mochi, Alice, "Mochi", "Cat", true, true);
            SocialSurfaceHarness.AddPet(db, Buddy, Bob, "Buddy", "Dog", true, true);
            SocialSurfaceHarness.AddPet(db, Pip, Erin, "Pip", "Rabbit", true, true);
            SocialSurfaceHarness.AddPet(db, Rex, Finn, "Rex", "Dog", true, true);
            SocialSurfaceHarness.AddPet(db, Kit, Gina, "Kit", "Cat", true, true);
            await db.SaveChangesAsync();

            var moment = new PetMemory
            {
                Id = Guid.NewGuid(),
                PetId = Mochi,
                AuthorUserId = Alice,
                Title = "Beach day",
                Caption = "Sand everywhere",
                Type = "Memory",
                Visibility = MemoryVisibility.Public,
                PublishedAt = DateTimeOffset.UtcNow.AddHours(-1)
            };
            db.PetMemories.Add(moment);
            db.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = Mochi });
            await db.SaveChangesAsync();

            return new World(factory, moment.Id);
        }

        /// <summary>A client signed in as <paramref name="userId"/>, or anonymous.</summary>
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

    private sealed class CollaborationFactory : WebApplicationFactory<Program>
    {
        private readonly string _database = $"collaboration-http-{Guid.NewGuid():N}";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Issuer"] = "MyPetLink.Collaboration.Tests",
                    ["Jwt:Audience"] = "MyPetLink.Collaboration.Client",
                    ["Jwt:SigningKey"] = "collaboration-http-test-signing-key-long-enough",
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
        public const string SchemeName = "CollaborationHttpTest";
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
