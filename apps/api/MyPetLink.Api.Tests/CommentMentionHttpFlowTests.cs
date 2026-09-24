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
/// Comment @Mentions through the real HTTP pipeline, with several households
/// signed in at once: who the actor is, what the wire carries, and that it
/// never tells one unavailable household from another. Test-only
/// authentication on an in-memory host; DevAuth stays off.
/// </summary>
public sealed class CommentMentionHttpFlowTests
{
    private static readonly Guid Alice = Guid.Parse("a7111111-1111-1111-1111-111111111111"); // @TanFamily, author
    private static readonly Guid Bob = Guid.Parse("a7222222-2222-2222-2222-222222222222");   // @LimFamily
    private static readonly Guid Erin = Guid.Parse("a7333333-3333-3333-3333-333333333333");  // @ErinHome
    private static readonly Guid Dave = Guid.Parse("a7444444-4444-4444-4444-444444444444");  // Community off
    private static readonly Guid Gina = Guid.Parse("a7555555-5555-5555-5555-555555555555");  // blocks Bob
    private static readonly Guid Hank = Guid.Parse("a7666666-6666-6666-6666-666666666666");  // suspended
    private static readonly Guid Ivy = Guid.Parse("a7777777-7777-7777-7777-777777777777");   // incomplete identity

    private static readonly Guid Mochi = Guid.Parse("a7811111-1111-1111-1111-111111111111");

    private static readonly Guid[] InternalIds = [Alice, Bob, Erin, Dave, Gina, Hank, Ivy, Mochi];

    [Fact]
    public async Task TheCommenterIsTheSignedInAccountAndMentionsReachTheWire()
    {
        await using var world = await World.CreateAsync();
        using var bob = world.As(Bob);
        using var erin = world.As(Erin);
        using var anonymous = world.As(null);

        // Anything a client says about who it is, is ignored.
        var created = await bob.PostAsJsonAsync(
            $"/api/v1/social/moments/{world.MomentId}/comments",
            new { body = "@ErinHome look at Mochi 😂", authorUserId = Alice, actorId = Alice, userId = Alice });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var comment = (await Data(created)).GetProperty("comment");
        Assert.Equal("LimFamily", comment.GetProperty("author").GetProperty("handle").GetString());
        var span = Assert.Single(comment.GetProperty("mentions").EnumerateArray());
        Assert.Equal(0, span.GetProperty("start").GetInt32());
        Assert.Equal("@ErinHome".Length, span.GetProperty("length").GetInt32());
        Assert.Equal("ErinHome", span.GetProperty("household").GetProperty("handle").GetString());

        var thread = await Data(await anonymous.GetAsync($"/api/v1/public/moments/{world.MomentId}/comments"));
        Assert.Equal("ErinHome", thread.GetProperty("items")[0].GetProperty("mentions")[0]
            .GetProperty("household").GetProperty("handle").GetString());

        // Enough for the deep link /moments/{id}#comment-{id}.
        var activity = (await Data(await erin.GetAsync("/api/v1/social/notifications"))).GetProperty("items")
            .EnumerateArray().Single(item => item.GetProperty("type").GetString() == "MomentCommentMentioned");
        Assert.Equal(world.MomentId, activity.GetProperty("momentId").GetGuid());
        Assert.Equal(comment.GetProperty("id").GetGuid(), activity.GetProperty("commentId").GetGuid());
        Assert.Equal("LimFamily", activity.GetProperty("actor").GetProperty("handle").GetString());

        foreach (var body in new[]
        {
            await Raw(anonymous, $"/api/v1/public/moments/{world.MomentId}/comments"),
            await Raw(bob, $"/api/v1/public/moments/{world.MomentId}/comments"),
            await Raw(erin, "/api/v1/social/notifications"),
            await Raw(bob, $"/api/v1/social/moments/{world.MomentId}/comments/mention-suggestions")
        })
        {
            foreach (var id in InternalIds)
            {
                Assert.DoesNotContain(id.ToString(), body, StringComparison.OrdinalIgnoreCase);
            }
        }
    }

    [Fact]
    public async Task SuggestionsAreSignedInUncachedAndContextual()
    {
        await using var world = await World.CreateAsync();
        using var bob = world.As(Bob);
        using var anonymous = world.As(null);

        var response = await bob.GetAsync($"/api/v1/social/moments/{world.MomentId}/comments/mention-suggestions");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        var first = (await Data(response)).GetProperty("items")[0];
        Assert.Equal("TanFamily", first.GetProperty("household").GetProperty("handle").GetString());
        Assert.Equal("author", first.GetProperty("context").GetString());

        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await anonymous.GetAsync($"/api/v1/social/moments/{world.MomentId}/comments/mention-suggestions")).StatusCode);
    }

    [Fact]
    public async Task UnavailableHouseholdsAreIndistinguishableFromMissingOnes()
    {
        await using var world = await World.CreateAsync();
        using var bob = world.As(Bob);

        var mentionResults = new List<string>();
        var suggestionResults = new List<string>();
        foreach (var handle in new[] { "NobodyHome", "DavePets", "GinaHome", "HankHome", "IvyHome" })
        {
            var created = await bob.PostAsJsonAsync(
                $"/api/v1/social/moments/{world.MomentId}/comments",
                new { body = $"hi @{handle}" });
            Assert.Equal(HttpStatusCode.OK, created.StatusCode);
            mentionResults.Add((await Data(created)).GetProperty("comment").GetProperty("mentions").GetRawText());

            var suggestions = await bob.GetAsync(
                $"/api/v1/social/moments/{world.MomentId}/comments/mention-suggestions?q={handle[..3].ToLowerInvariant()}");
            Assert.Equal(HttpStatusCode.OK, suggestions.StatusCode);
            suggestionResults.Add((await Data(suggestions)).GetProperty("items").GetRawText());
        }

        Assert.All(mentionResults, result => Assert.Equal("[]", result));
        Assert.All(suggestionResults, result => Assert.Equal("[]", result));
    }

    [Fact]
    public async Task DeleteAndRemoveWithdrawTheMentionAndOnlyThoseTwoMayDoEither()
    {
        await using var world = await World.CreateAsync();
        using var alice = world.As(Alice);
        using var bob = world.As(Bob);
        using var erin = world.As(Erin);

        var first = await CommentIdAsync(bob, world, "one @ErinHome");
        var second = await CommentIdAsync(bob, world, "two @ErinHome");
        Assert.Equal(1, await MentionActivityCountAsync(erin));

        // Being mentioned gives no say over the Comment.
        Assert.Equal(HttpStatusCode.NotFound,
            (await erin.DeleteAsync($"/api/v1/social/moments/{world.MomentId}/comments/{first}")).StatusCode);

        Assert.Equal(HttpStatusCode.OK,
            (await bob.DeleteAsync($"/api/v1/social/moments/{world.MomentId}/comments/{second}")).StatusCode);
        Assert.Equal(1, await MentionActivityCountAsync(erin));
        Assert.Equal(HttpStatusCode.OK,
            (await alice.DeleteAsync($"/api/v1/social/moments/{world.MomentId}/comments/{first}")).StatusCode);
        Assert.Equal(0, await MentionActivityCountAsync(erin));
        Assert.Equal(0, (await Data(await erin.GetAsync("/api/v1/social/notifications/unread"))).GetProperty("unreadCount").GetInt32());
    }

    [Fact]
    public async Task AMentionLeavesShareAndSafetyProfilesUntouched()
    {
        await using var world = await World.CreateAsync();
        using var bob = world.As(Bob);
        using var anonymous = world.As(null);

        // The payloads, not the envelopes: each response carries its own request id.
        var shareBefore = (await Data(await anonymous.GetAsync("/api/v1/public/pets/pip-pubpip"))).GetRawText();
        var safetyBefore = (await Data(await anonymous.GetAsync("/api/v1/public/safety/s-pubpip"))).GetRawText();

        await CommentIdAsync(bob, world, "look @ErinHome");

        Assert.Equal(shareBefore, (await Data(await anonymous.GetAsync("/api/v1/public/pets/pip-pubpip"))).GetRawText());
        Assert.Equal(safetyBefore, (await Data(await anonymous.GetAsync("/api/v1/public/safety/s-pubpip"))).GetRawText());
        Assert.DoesNotContain("mention", shareBefore, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("mention", safetyBefore, StringComparison.OrdinalIgnoreCase);
    }

    // ---- helpers ----------------------------------------------------------

    private static async Task<Guid> CommentIdAsync(HttpClient client, World world, string body)
    {
        var created = await client.PostAsJsonAsync($"/api/v1/social/moments/{world.MomentId}/comments", new { body });
        return (await Data(created)).GetProperty("comment").GetProperty("id").GetGuid();
    }

    private static async Task<int> MentionActivityCountAsync(HttpClient client) =>
        (await Data(await client.GetAsync("/api/v1/social/notifications"))).GetProperty("items")
            .EnumerateArray()
            .Count(item => item.GetProperty("type").GetString() == "MomentCommentMentioned");

    private static async Task<JsonElement> Data(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {body}");
        using var json = JsonDocument.Parse(body);
        return json.RootElement.GetProperty("data").Clone();
    }

    private static async Task<string> Raw(HttpClient client, string path) =>
        await (await client.GetAsync(path)).Content.ReadAsStringAsync();

    /// <summary>An in-memory API with a public Moment and the households above.</summary>
    private sealed class World : IAsyncDisposable
    {
        private readonly MentionFactory _factory;

        private World(MentionFactory factory, Guid momentId)
        {
            _factory = factory;
            MomentId = momentId;
        }

        public Guid MomentId { get; }

        public static async Task<World> CreateAsync()
        {
            var factory = new MentionFactory();
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();

            SocialSurfaceHarness.AddOwner(db, Alice, "alice@example.com", "Alice Tan", "TanFamily", "The Tan Family", true, true);
            SocialSurfaceHarness.AddOwner(db, Bob, "bob@example.com", "Bob Lim", "LimFamily", "The Lim Family", true, true);
            SocialSurfaceHarness.AddOwner(db, Erin, "erin@example.com", "Erin Ong", "ErinHome", "The Ong Home", true, true);
            SocialSurfaceHarness.AddOwner(db, Dave, "dave@example.com", "Dave Rao", "DavePets", "Dave's Pets", false, false);
            SocialSurfaceHarness.AddOwner(db, Gina, "gina@example.com", "Gina Yap", "GinaHome", "The Yap Home", true, true);
            SocialSurfaceHarness.AddOwner(db, Hank, "hank@example.com", "Hank Koh", "HankHome", "The Koh Home", true, true);
            SocialSurfaceHarness.AddOwner(db, Ivy, "ivy@example.com", "Ivy Lau", "IvyHome", "The Lau Home", true, true);
            await db.SaveChangesAsync();

            SocialSurfaceHarness.AddPet(db, Mochi, Alice, "Mochi", "Cat", true, true);
            SocialSurfaceHarness.AddPet(db, Guid.NewGuid(), Erin, "Pip", "Rabbit", true, true);
            (await db.Users.FindAsync(Hank))!.Status = UserStatus.Suspended;
            (await db.OwnerSocialProfiles.SingleAsync(profile => profile.UserId == Ivy)).DisplayName = "";
            db.OwnerBlocks.Add(new OwnerBlock { BlockerUserId = Gina, BlockedUserId = Bob });

            var moment = new PetMemory
            {
                Id = Guid.NewGuid(),
                PetId = Mochi,
                AuthorUserId = Alice,
                Title = "Beach day",
                Type = "Memory",
                Visibility = MemoryVisibility.Public,
                PublishedAt = DateTimeOffset.UtcNow.AddHours(-1)
            };
            db.PetMemories.Add(moment);
            db.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = Mochi });
            await db.SaveChangesAsync();

            return new World(factory, moment.Id);
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

    private sealed class MentionFactory : WebApplicationFactory<Program>
    {
        private readonly string _database = $"mention-http-{Guid.NewGuid():N}";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Issuer"] = "MyPetLink.Mention.Tests",
                    ["Jwt:Audience"] = "MyPetLink.Mention.Client",
                    ["Jwt:SigningKey"] = "mention-http-test-signing-key-long-enough-for-hs256",
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
        public const string SchemeName = "MentionHttpTest";
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
