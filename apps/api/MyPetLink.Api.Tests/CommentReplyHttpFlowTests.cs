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
/// The Reply read model through the real HTTP pipeline: what the wire carries
/// for a thread and for a thread's Replies, that every unreadable parent looks
/// the same, that anchors never act as an oracle, and that posting still writes
/// only top-level Comments. Replies are seeded directly — nothing can write one
/// yet. Test-only authentication on an in-memory host; DevAuth stays off.
/// </summary>
public sealed class CommentReplyHttpFlowTests
{
    private static readonly Guid Alice = Guid.Parse("a8111111-1111-1111-1111-111111111111"); // @TanFamily, Moment author
    private static readonly Guid Bob = Guid.Parse("a8222222-2222-2222-2222-222222222222");   // @LimFamily, parent author
    private static readonly Guid Carol = Guid.Parse("a8333333-3333-3333-3333-333333333333"); // @CarolPets, replies
    private static readonly Guid Erin = Guid.Parse("a8444444-4444-4444-4444-444444444444");  // @ErinHome, replies
    private static readonly Guid Gina = Guid.Parse("a8555555-5555-5555-5555-555555555555");  // @GinaHome, a reader

    private static readonly Guid Mochi = Guid.Parse("a8911111-1111-1111-1111-111111111111");

    private static readonly Guid[] InternalIds = [Alice, Bob, Carol, Erin, Gina, Mochi];

    [Fact]
    public async Task TheThreadListsTopLevelCommentsWithReplyCountsAndNoInternalIds()
    {
        await using var world = await World.CreateAsync();
        using var anonymous = world.As(null);

        var raw = await Raw(anonymous, $"/api/v1/public/moments/{world.MomentId}/comments");
        var thread = Data(raw);

        var item = Assert.Single(thread.GetProperty("items").EnumerateArray());
        Assert.Equal(world.ParentId, item.GetProperty("id").GetGuid());
        Assert.Equal(JsonValueKind.Null, item.GetProperty("parentCommentId").ValueKind);
        Assert.Equal(2, item.GetProperty("replyCount").GetInt32());
        Assert.Equal(3, thread.GetProperty("commentCount").GetInt32());
        Assert.Equal(JsonValueKind.Null, thread.GetProperty("anchorParentCommentId").ValueKind);

        var replies = await Raw(anonymous, $"/api/v1/public/moments/{world.MomentId}/comments/{world.ParentId}/replies");
        foreach (var body in new[] { raw, replies })
        {
            foreach (var id in InternalIds)
            {
                Assert.DoesNotContain(id.ToString(), body, StringComparison.OrdinalIgnoreCase);
            }
        }
    }

    [Fact]
    public async Task RepliesAreAnonymousUncachedOldestFirstAndPaged()
    {
        await using var world = await World.CreateAsync();
        using var anonymous = world.As(null);
        using var gina = world.As(Gina);

        var response = await anonymous.GetAsync(
            $"/api/v1/public/moments/{world.MomentId}/comments/{world.ParentId}/replies");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        var page = Data(await response.Content.ReadAsStringAsync());
        Assert.Equal(world.ParentId, page.GetProperty("parentCommentId").GetGuid());
        Assert.Equal(2, page.GetProperty("replyCount").GetInt32());
        var items = page.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal([world.CarolReplyId, world.ErinReplyId], items.Select(reply => reply.GetProperty("id").GetGuid()));
        Assert.All(items, reply =>
        {
            Assert.Equal(world.ParentId, reply.GetProperty("parentCommentId").GetGuid());
            Assert.Equal(0, reply.GetProperty("replyCount").GetInt32());
            Assert.False(reply.TryGetProperty("replies", out _));
        });
        Assert.Equal("CarolPets", items[0].GetProperty("author").GetProperty("handle").GetString());

        // One at a time, by cursor.
        var seen = new List<Guid>();
        string? cursor = null;
        do
        {
            var path = $"/api/v1/public/moments/{world.MomentId}/comments/{world.ParentId}/replies?limit=1"
                + (cursor is null ? "" : $"&cursor={Uri.EscapeDataString(cursor)}");
            var next = Data(await Raw(anonymous, path));
            seen.AddRange(next.GetProperty("items").EnumerateArray().Select(reply => reply.GetProperty("id").GetGuid()));
            cursor = next.GetProperty("nextCursor").GetString();
        }
        while (cursor is not null);
        Assert.Equal([world.CarolReplyId, world.ErinReplyId], seen);

        // A signed-in reader's own blocks apply.
        await world.SeedAsync(db => db.OwnerBlocks.Add(new OwnerBlock { BlockerUserId = Gina, BlockedUserId = Carol }));
        var forGina = Data(await Raw(gina, $"/api/v1/public/moments/{world.MomentId}/comments/{world.ParentId}/replies"));
        Assert.Equal(1, forGina.GetProperty("replyCount").GetInt32());
        Assert.Equal(world.ErinReplyId, Assert.Single(forGina.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task EveryUnreadableParentIsTheSameNeutralNotFound()
    {
        await using var world = await World.CreateAsync();
        using var anonymous = world.As(null);
        using var gina = world.As(Gina);

        var otherMomentId = await world.AddMomentAsync(MemoryVisibility.Public);
        var privateMomentId = await world.AddMomentAsync(MemoryVisibility.Private);
        var privateParent = await world.AddCommentAsync(privateMomentId, null, Bob, "On a private Moment");
        var deletedParent = await world.AddCommentAsync(world.MomentId, null, Erin, "Deleted");
        await world.SeedAsync(async db =>
        {
            var row = await db.MomentComments.SingleAsync(comment => comment.Id == deletedParent);
            row.Body = "";
            row.DeletedAt = DateTimeOffset.UtcNow;
            row.DeletedByUserId = Erin;
        });

        var errors = new List<string>();
        async Task Expect404(HttpClient client, Guid momentId, Guid commentId)
        {
            var response = await client.GetAsync($"/api/v1/public/moments/{momentId}/comments/{commentId}/replies");
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            errors.Add(Error(await response.Content.ReadAsStringAsync()));
        }

        await Expect404(anonymous, world.MomentId, Guid.NewGuid());
        await Expect404(anonymous, world.MomentId, deletedParent);
        await Expect404(anonymous, world.MomentId, world.CarolReplyId);
        await Expect404(anonymous, otherMomentId, world.ParentId);
        await Expect404(anonymous, privateMomentId, privateParent);

        await world.SeedAsync(db => db.OwnerBlocks.Add(new OwnerBlock { BlockerUserId = Bob, BlockedUserId = Gina }));
        await Expect404(gina, world.MomentId, world.ParentId);

        Assert.Equal(6, errors.Count);
        Assert.All(errors, error => Assert.Equal(errors[0], error));
        Assert.Contains("comment_not_found", errors[0]);
        Assert.Contains("This comment is not available.", errors[0]);
    }

    [Fact]
    public async Task AnAnchorToAReplyNamesItsParentAndHiddenOrMalformedAnchorsChangeNothing()
    {
        await using var world = await World.CreateAsync();
        using var anonymous = world.As(null);
        var threadPath = $"/api/v1/public/moments/{world.MomentId}/comments";

        var anchored = Data(await Raw(anonymous, $"{threadPath}?anchor={world.ErinReplyId}"));
        Assert.Equal(world.ParentId, anchored.GetProperty("anchorParentCommentId").GetGuid());

        var replies = Data(await Raw(
            anonymous, $"{threadPath}/{world.ParentId}/replies?anchor={world.ErinReplyId}"));
        Assert.Contains(world.ErinReplyId,
            replies.GetProperty("items").EnumerateArray().Select(reply => reply.GetProperty("id").GetGuid()));

        // A deleted Reply, a Reply hidden by a block between it and its
        // parent's author, a nested Reply, and anchors that are not ids at all.
        var deletedReply = await world.AddCommentAsync(world.MomentId, world.ParentId, Gina, "Soon gone");
        var nested = await world.AddCommentAsync(world.MomentId, world.CarolReplyId, Gina, "Too deep");
        var blockedReply = await world.AddCommentAsync(world.MomentId, world.ParentId, Gina, "Blocked away");
        await world.SeedAsync(async db =>
        {
            var row = await db.MomentComments.SingleAsync(comment => comment.Id == deletedReply);
            row.Body = "";
            row.DeletedAt = DateTimeOffset.UtcNow;
            row.DeletedByUserId = Gina;
            db.OwnerBlocks.Add(new OwnerBlock { BlockerUserId = Bob, BlockedUserId = Gina });
        });

        var baseline = Data(await Raw(anonymous, threadPath)).GetRawText();
        var replyBaseline = Data(await Raw(anonymous, $"{threadPath}/{world.ParentId}/replies")).GetRawText();
        foreach (var anchor in new[] { deletedReply.ToString(), nested.ToString(), blockedReply.ToString(), Guid.NewGuid().ToString(), "not-an-id", "" })
        {
            Assert.Equal(baseline, Data(await Raw(anonymous, $"{threadPath}?anchor={anchor}")).GetRawText());
            Assert.Equal(replyBaseline, Data(await Raw(
                anonymous, $"{threadPath}/{world.ParentId}/replies?anchor={anchor}")).GetRawText());
        }
    }

    [Fact]
    public async Task PostingStillWritesOnlyTopLevelCommentsWhateverTheClientSends()
    {
        await using var world = await World.CreateAsync();
        using var gina = world.As(Gina);
        using var anonymous = world.As(null);

        var created = await gina.PostAsJsonAsync(
            $"/api/v1/social/moments/{world.MomentId}/comments",
            new { body = "Trying to reply", parentCommentId = world.ParentId, parentId = world.ParentId });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var comment = Data(await created.Content.ReadAsStringAsync()).GetProperty("comment");
        Assert.Equal(JsonValueKind.Null, comment.GetProperty("parentCommentId").ValueKind);
        Assert.Equal(0, comment.GetProperty("replyCount").GetInt32());

        var row = await world.ReadAsync(db => db.MomentComments.AsNoTracking()
            .SingleAsync(item => item.Id == comment.GetProperty("id").GetGuid()));
        Assert.Null(row.ParentCommentId);

        var thread = Data(await Raw(anonymous, $"/api/v1/public/moments/{world.MomentId}/comments"));
        var items = thread.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, items.Length);
        Assert.Equal(2, items.Single(item => item.GetProperty("id").GetGuid() == world.ParentId)
            .GetProperty("replyCount").GetInt32());

        // And anonymous callers still cannot post at all.
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await anonymous.PostAsJsonAsync(
                $"/api/v1/social/moments/{world.MomentId}/comments",
                new { body = "Hello", parentCommentId = world.ParentId })).StatusCode);
    }

    // ---- helpers ----------------------------------------------------------

    private static async Task<string> Raw(HttpClient client, string path)
    {
        var response = await client.GetAsync(path);
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {body}");
        return body;
    }

    private static JsonElement Data(string body)
    {
        using var json = JsonDocument.Parse(body);
        return json.RootElement.GetProperty("data").Clone();
    }

    /// <summary>The error object alone; the envelope's request id differs per call.</summary>
    private static string Error(string body)
    {
        using var json = JsonDocument.Parse(body);
        return json.RootElement.GetProperty("error").GetRawText();
    }

    /// <summary>
    /// An in-memory API with Alice's public Moment, Bob's Comment on it, and
    /// Replies from Carol then Erin.
    /// </summary>
    private sealed class World : IAsyncDisposable
    {
        private static readonly DateTimeOffset Start = DateTimeOffset.UtcNow.AddHours(-1);
        private readonly ReplyFactory _factory;
        private int _minutes;

        private World(ReplyFactory factory)
        {
            _factory = factory;
        }

        public Guid MomentId { get; private set; }
        public Guid ParentId { get; private set; }
        public Guid CarolReplyId { get; private set; }
        public Guid ErinReplyId { get; private set; }

        public static async Task<World> CreateAsync()
        {
            var world = new World(new ReplyFactory());
            await world.SeedAsync(db =>
            {
                SocialSurfaceHarness.AddOwner(db, Alice, "alice@example.com", "Alice Tan", "TanFamily", "The Tan Family", true, true);
                SocialSurfaceHarness.AddOwner(db, Bob, "bob@example.com", "Bob Lim", "LimFamily", "The Lim Family", true, true);
                SocialSurfaceHarness.AddOwner(db, Carol, "carol@example.com", "Carol Ng", "CarolPets", "Carol's Pets", true, true);
                SocialSurfaceHarness.AddOwner(db, Erin, "erin@example.com", "Erin Ong", "ErinHome", "The Ong Home", true, true);
                SocialSurfaceHarness.AddOwner(db, Gina, "gina@example.com", "Gina Yap", "GinaHome", "The Yap Home", true, true);
            });
            await world.SeedAsync(db => SocialSurfaceHarness.AddPet(db, Mochi, Alice, "Mochi", "Cat", true, true));

            world.MomentId = await world.AddMomentAsync(MemoryVisibility.Public);
            world.ParentId = await world.AddCommentAsync(world.MomentId, null, Bob, "Bob's comment");
            world.CarolReplyId = await world.AddCommentAsync(world.MomentId, world.ParentId, Carol, "Carol's reply");
            world.ErinReplyId = await world.AddCommentAsync(world.MomentId, world.ParentId, Erin, "Erin's reply");
            return world;
        }

        public async Task<Guid> AddMomentAsync(MemoryVisibility visibility)
        {
            var moment = new PetMemory
            {
                Id = Guid.NewGuid(),
                PetId = Mochi,
                AuthorUserId = Alice,
                Title = "Beach day",
                Type = "Memory",
                Visibility = visibility,
                PublishedAt = Start
            };
            await SeedAsync(db =>
            {
                db.PetMemories.Add(moment);
                db.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = Mochi });
            });
            return moment.Id;
        }

        /// <summary>Writes a Comment row directly, a minute after the last.</summary>
        public async Task<Guid> AddCommentAsync(Guid momentId, Guid? parentId, Guid authorId, string body)
        {
            var comment = new MomentComment
            {
                MomentId = momentId,
                ParentCommentId = parentId,
                AuthorUserId = authorId,
                Body = body,
                CreatedAt = Start.AddMinutes(++_minutes)
            };
            await SeedAsync(db => db.MomentComments.Add(comment));
            return comment.Id;
        }

        public Task SeedAsync(Action<MyPetLinkDbContext> change) =>
            SeedAsync(db =>
            {
                change(db);
                return Task.CompletedTask;
            });

        public async Task SeedAsync(Func<MyPetLinkDbContext, Task> change)
        {
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
            await change(db);
            await db.SaveChangesAsync();
        }

        public async Task<T> ReadAsync<T>(Func<MyPetLinkDbContext, Task<T>> read)
        {
            using var scope = _factory.Services.CreateScope();
            return await read(scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>());
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

    private sealed class ReplyFactory : WebApplicationFactory<Program>
    {
        private readonly string _database = $"reply-http-{Guid.NewGuid():N}";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Issuer"] = "MyPetLink.Reply.Tests",
                    ["Jwt:Audience"] = "MyPetLink.Reply.Client",
                    ["Jwt:SigningKey"] = "reply-http-test-signing-key-long-enough-for-hs256",
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
        public const string SchemeName = "ReplyHttpTest";
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
