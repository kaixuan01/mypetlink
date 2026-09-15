using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;
using Xunit.Abstractions;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// How the social queries behave on a database that is not tiny.
///
/// Every earlier measurement was taken at two thousand rows, where SQL Server
/// scans whatever you give it because scanning is genuinely cheaper. These run
/// at ten thousand households so the optimiser has a real choice, and they
/// report elapsed time rather than asserting one — a developer laptop's
/// milliseconds are not a production benchmark, and pretending otherwise is
/// worse than reporting nothing. What they DO assert is shape: round trips that
/// stay constant, and predicates that stay sargable.
/// </summary>
public sealed class SocialScaleRelationalTests
{
    private readonly ITestOutputHelper _output;

    public SocialScaleRelationalTests(ITestOutputHelper output)
    {
        _output = output;
    }

    private const int Households = 10_000;

    private static readonly Guid ViewerId = Guid.Parse("e0000000-0000-4000-8000-000000000001");

    [RelationalFact]
    public async Task ExploreSuggestions_StayWorkableAtTenThousandHouseholds()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await SeedAsync(scope, followEvery: 0);

        await using var context = scope.NewContext();
        var discovery = NewDiscovery(context);

        // Once to compile and warm, then the measured pass.
        await discovery.GetSuggestedPetsAsync(null, null, null);

        var timer = Stopwatch.StartNew();
        var suggestions = await discovery.GetSuggestedPetsAsync(ViewerId, null, null);
        timer.Stop();

        _output.WriteLine($"suggested pets ({Households} households): {timer.ElapsedMilliseconds} ms");

        Assert.NotEmpty(suggestions.Items);

        // The correlated MAX per candidate is the known cost here. It is bounded
        // by the page, not by the table: the shelf is at most 24 rows whatever
        // the database holds.
        Assert.True(suggestions.Items.Count <= 24);
    }

    [RelationalFact]
    public async Task Search_StaysAPrefixQueryAtTenThousandHouseholds()
    {
        var capture = new CapturingCommands();
        await using var scope = await RelationalDatabase.CreateAsync(capture);
        await SeedAsync(scope, followEvery: 0);

        await using var context = scope.NewContext();
        var discovery = NewDiscovery(context);

        await discovery.SearchAsync(null, "pet9", null, null, null);

        capture.Reset();
        var timer = Stopwatch.StartNew();
        var results = await discovery.SearchAsync(null, "pet9123", null, null, null);
        timer.Stop();

        _output.WriteLine($"search ({Households} households): {timer.ElapsedMilliseconds} ms, "
            + $"{capture.Commands.Count} round trips");

        Assert.NotEmpty(results.Pets);

        foreach (var sql in capture.Commands)
        {
            // Still sargable at scale: no leading wildcard, and the column is
            // never wrapped in a function.
            Assert.DoesNotContain("LIKE N'%", sql, StringComparison.Ordinal);
            Assert.DoesNotContain("LOWER(", sql, StringComparison.OrdinalIgnoreCase);
        }
    }

    [RelationalTheory]
    [InlineData(1)]
    [InlineData(50)]
    [InlineData(500)]
    public async Task TheFeed_HoldsItsShapeAsTheFollowListGrows(int follows)
    {
        var capture = new CapturingCommands();
        await using var scope = await RelationalDatabase.CreateAsync(capture);
        await SeedAsync(scope, followEvery: Math.Max(1, Households / follows));

        await using var context = scope.NewContext();
        var feed = new SocialFeedService(context, NewProjection(context));

        await feed.GetFeedAsync(ViewerId, null, null);

        capture.Reset();
        var timer = Stopwatch.StartNew();
        var first = await feed.GetFeedAsync(ViewerId, null, null);
        timer.Stop();
        var firstPageMs = timer.ElapsedMilliseconds;
        var firstPageTrips = capture.Commands.Count;

        capture.Reset();
        timer.Restart();
        var second = await feed.GetFeedAsync(ViewerId, first.NextCursor, null);
        timer.Stop();

        _output.WriteLine(
            $"feed ~{follows} follows: page 1 {firstPageMs} ms / {firstPageTrips} trips, "
            + $"page 2 {timer.ElapsedMilliseconds} ms / {capture.Commands.Count} trips, "
            + $"{first.Items.Count} items");

        Assert.NotEmpty(first.Items);
        Assert.NotEmpty(second.Items);

        // The shape is what is asserted: six round trips per page whatever the
        // follow list holds. If this ever grows with the graph, the query has
        // stopped being one query.
        Assert.Equal(6, firstPageTrips);
        Assert.Equal(6, capture.Commands.Count);
    }

    [RelationalFact]
    public async Task Notifications_CountAndPageWithoutAQueryPerRow()
    {
        var capture = new CapturingCommands();
        await using var scope = await RelationalDatabase.CreateAsync(capture);
        await SeedAsync(scope, followEvery: 0, notifications: 150);

        await using var context = scope.NewContext();
        var notifications = new OwnerNotificationService(
            context,
            Options.Create(new CloudflareR2Options()));

        await notifications.GetUnreadSummaryAsync(ViewerId);

        capture.Reset();
        var timer = Stopwatch.StartNew();
        var badge = await notifications.GetUnreadSummaryAsync(ViewerId);
        timer.Stop();
        var badgeMs = timer.ElapsedMilliseconds;
        var badgeTrips = capture.Commands.Count;

        capture.Reset();
        timer.Restart();
        var page = await notifications.GetAsync(ViewerId, null, null);
        timer.Stop();

        _output.WriteLine(
            $"notifications: badge {badgeMs} ms / {badgeTrips} trips ({badge.UnreadCount} unread), "
            + $"page {timer.ElapsedMilliseconds} ms / {capture.Commands.Count} trips "
            + $"({page.Items.Count} items)");

        Assert.Equal(1, badgeTrips);

        // The page: the rows, the subject names, and the unread count. Never one
        // query per actor or per Moment.
        Assert.True(
            capture.Commands.Count <= 3,
            $"Expected at most 3 queries for one activity page, saw {capture.Commands.Count}.");
        Assert.NotEmpty(page.Items);

        var empty = await notifications.GetAsync(
            Guid.Parse("e0000000-0000-4000-8000-0000000000ff"), null, null);
        Assert.Empty(empty.Items);
    }

    // ---- plumbing -------------------------------------------------------

    private static SocialMomentProjection NewProjection(MyPetLinkDbContext context) =>
        new(context, Options.Create(new CloudflareR2Options()));

    private static SocialDiscoveryService NewDiscovery(MyPetLinkDbContext context) =>
        new(context, Options.Create(new CloudflareR2Options()), NewProjection(context));

    /// <summary>
    /// Ten thousand households, each with a pet and a public Moment. Written in
    /// chunks so one SaveChanges is never asked to track fifty thousand
    /// entities at once.
    /// </summary>
    private static async Task SeedAsync(
        RelationalScope scope,
        int followEvery,
        int notifications = 0)
    {
        await using var context = scope.NewContext();
        var planId = context.Plans.Single(item => item.Code == "Free").Id;

        AddOwner(context, ViewerId, "viewer", planId);
        await context.SaveChangesAsync();

        var published = DateTimeOffset.UtcNow;
        var actorIds = new List<Guid>();

        for (var index = 0; index < Households; index += 1)
        {
            var ownerId = Guid.NewGuid();
            var petId = Guid.NewGuid();

            AddOwner(context, ownerId, $"pet{index}", planId);

            context.Pets.Add(new Pet
            {
                Id = petId,
                OwnerUserId = ownerId,
                Slug = $"pet{index}-{index}",
                Name = $"Pet{index}",
                Species = index % 3 == 0 ? "Cat" : index % 3 == 1 ? "Dog" : "Rabbit",
                PublicProfile = new PetPublicProfile
                {
                    PetId = petId,
                    PublicCode = $"code{index}",
                    SlugSnapshot = $"pet{index}-{index}",
                    IsPublicProfileEnabled = true,
                    ShowMoments = true
                },
                SocialProfile = new PetSocialProfile
                {
                    PetId = petId,
                    IsSocialEnabled = true,
                    IsDiscoverable = true
                }
            });

            var moment = new PetMemory
            {
                Id = Guid.NewGuid(),
                PetId = petId,
                AuthorUserId = ownerId,
                Title = $"Moment {index}",
                Type = "Memory",
                Visibility = MemoryVisibility.Public,
                PublishedAt = published.AddMinutes(-index)
            };
            context.PetMemories.Add(moment);
            context.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = petId });

            if (followEvery > 0 && index % followEvery == 0)
            {
                context.OwnerFollows.Add(new OwnerFollow
                {
                    FollowerUserId = ViewerId,
                    FollowedUserId = ownerId
                });
            }

            if (actorIds.Count < notifications)
            {
                actorIds.Add(ownerId);
            }

            if (index % 1_000 == 999)
            {
                await context.SaveChangesAsync();
                context.ChangeTracker.Clear();
            }
        }

        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        foreach (var actorId in actorIds)
        {
            context.OwnerNotifications.Add(new OwnerNotification
            {
                RecipientUserId = ViewerId,
                ActorUserId = actorId,
                Type = OwnerNotificationType.NewFollower,
                CreatedAt = published.AddMinutes(-actorIds.IndexOf(actorId))
            });
        }

        if (actorIds.Count > 0)
        {
            await context.SaveChangesAsync();
        }

        foreach (var table in new[]
        {
            "Pets", "OwnerSocialProfiles", "OwnerFollows", "PetMemories",
            "MomentPets", "OwnerNotifications", "PetSocialProfiles"
        })
        {
            await context.Database.ExecuteSqlRawAsync($"UPDATE STATISTICS [{table}]");
        }
    }

    private static void AddOwner(
        MyPetLinkDbContext context,
        Guid id,
        string handle,
        Guid planId)
    {
        context.Users.Add(new User
        {
            Id = id,
            Email = $"{handle}@example.com",
            NormalizedEmail = $"{handle}@example.com".ToUpperInvariant(),
            DisplayName = handle,
            Status = UserStatus.Active,
            OwnerProfile = new OwnerProfile
            {
                UserId = id,
                OwnerDisplayName = handle,
                PlanId = planId
            },
            SocialProfile = new OwnerSocialProfile
            {
                UserId = id,
                Handle = handle,
                NormalizedHandle = handle,
                DisplayName = $"The {handle} Family",
                NormalizedDisplayName = $"the {handle} family",
                IsSocialEnabled = true,
                IsDiscoverable = true,
                AllowFollowers = true
            }
        });
    }

    /// <summary>Counts what EF actually sent, so "one query" can be asserted.</summary>
    private sealed class CapturingCommands : Microsoft.EntityFrameworkCore.Diagnostics.DbCommandInterceptor
    {
        public List<string> Commands { get; } = new();

        public void Reset() => Commands.Clear();

        public override System.Data.Common.DbDataReader ReaderExecuted(
            System.Data.Common.DbCommand command,
            Microsoft.EntityFrameworkCore.Diagnostics.CommandExecutedEventData eventData,
            System.Data.Common.DbDataReader result)
        {
            Commands.Add(command.CommandText);
            return base.ReaderExecuted(command, eventData, result);
        }

        public override ValueTask<System.Data.Common.DbDataReader> ReaderExecutedAsync(
            System.Data.Common.DbCommand command,
            Microsoft.EntityFrameworkCore.Diagnostics.CommandExecutedEventData eventData,
            System.Data.Common.DbDataReader result,
            CancellationToken cancellationToken = default)
        {
            Commands.Add(command.CommandText);
            return base.ReaderExecutedAsync(command, eventData, result, cancellationToken);
        }
    }
}
