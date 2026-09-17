using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The chronological home feed.
///
/// Every test here is really one question: can a reader always tell why a
/// Moment is in front of them? The answer has to be "because I follow them, or
/// because it is mine, and because it was published then" — nothing else.
/// </summary>
public sealed class SocialFeedTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;
    private static readonly Guid Carol = SocialSurfaceHarness.CarolId;
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;
    private static readonly Guid Coco = SocialSurfaceHarness.CocoId;
    private static readonly Guid Buddy = SocialSurfaceHarness.BuddyId;
    private static readonly Guid Shy = SocialSurfaceHarness.ShyId;

    // ---- Whether the viewer follows anybody ------------------------------

    [Fact]
    public async Task Feed_SaysWhenTheViewerFollowsNobody()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Alice, Mochi, "Mochi on the sofa", 10);

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);

        // Her own Moment is there, and she follows no one. Those are separate
        // facts: the page is not empty, but the relationship is.
        Assert.NotEmpty(feed.Items);
        Assert.False(feed.HasFollowing);
    }

    [Fact]
    public async Task Feed_SaysTheViewerFollowsSomebodyEvenWhenNobodyHasPosted()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Alice, "limfamily");

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);

        // The case the old UI got wrong: an empty page here used to be read as
        // "you follow nobody", and this reader was told to go and follow
        // somebody she had already followed.
        Assert.Empty(feed.Items);
        Assert.True(feed.HasFollowing);
    }

    [Fact]
    public async Task Feed_StopsSayingSoAfterAnUnfollow()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Alice, "limfamily");
        Assert.True((await harness.Feed.GetFeedAsync(Alice, null, null)).HasFollowing);

        await harness.Graph.UnfollowAsync(Alice, "limfamily");

        Assert.False((await harness.Feed.GetFeedAsync(Alice, null, null)).HasFollowing);
    }

    [Fact]
    public async Task AFollowedHouseholdsPublicMoment_Appears()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 10);
        await harness.FollowAsync(Alice, "limfamily");

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);

        Assert.Equal("Buddy at the park", Assert.Single(feed.Items).Title);
    }

    [Fact]
    public async Task AnUnfollowedHouseholdsMoment_DoesNot()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 10);

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);

        Assert.Empty(feed.Items);
    }

    [Fact]
    public async Task YourOwnPublicMoments_AppearWithoutFollowingYourself()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Alice, Mochi, "Mochi on the sofa", 10);

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);

        // A feed that omits what you just shared reads as broken, and asking
        // somebody to follow themselves to fix it is worse.
        Assert.Equal("Mochi on the sofa", Assert.Single(feed.Items).Title);
        Assert.Empty(await harness.Db.OwnerFollows.ToListAsync());
    }

    [Fact]
    public async Task YourOwnPrivateMoments_DoNotAppear()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(
            Alice, Mochi, "Vet visit", 10, MemoryVisibility.Private);

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);

        // The feed is a social surface, not a private diary. Your own private
        // Moment belongs on your pet's page, behind your own login.
        Assert.Empty(feed.Items);
    }

    [Fact]
    public async Task Deleted_Archived_AndUnpublishedMoments_DoNotAppear()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Alice, Mochi, "Draft", 10, published: false);
        await harness.AddMomentAsync(Alice, Mochi, "Archived", 11, archived: true);

        var deletedId = await harness.AddMomentAsync(Alice, Mochi, "Deleted", 12);
        var deleted = await harness.Db.PetMemories.SingleAsync(item => item.Id == deletedId);
        deleted.DeletedAt = DateTimeOffset.UtcNow;
        await harness.Db.SaveChangesAsync();

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);

        Assert.Empty(feed.Items);
    }

    [Fact]
    public async Task AHouseholdThatLeavesSocial_DropsOutOfTheFeedItWasIn()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 10);
        await harness.FollowAsync(Alice, "limfamily");

        await harness.SetOwnerSocialAsync(Bob, enabled: false);

        Assert.Empty((await harness.Feed.GetFeedAsync(Alice, null, null)).Items);
    }

    [Fact]
    public async Task ANonDiscoverableHouseholdYouFollow_StillReachesYourFeed()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Carol, Shy, "Shy in the sun", 10);
        await harness.FollowAsync(Alice, "carolpets");

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);

        // "Do not put me in front of strangers" is not "hide me from the people
        // who already chose to follow me". Discoverability gates Explore and
        // search; it must never gate an existing relationship.
        Assert.Equal("Shy in the sun", Assert.Single(feed.Items).Title);
    }

    [Fact]
    public async Task ABlockInEitherDirection_EmptiesBothFeedsOfTheOther()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Alice, Mochi, "Mochi on the sofa", 10);
        await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 11);
        await harness.FollowAsync(Alice, "limfamily");
        await harness.FollowAsync(Bob, "tanfamily");

        await harness.Graph.BlockAsync(Alice, "limfamily", null);

        var aliceFeed = await harness.Feed.GetFeedAsync(Alice, null, null);
        var bobFeed = await harness.Feed.GetFeedAsync(Bob, null, null);

        Assert.DoesNotContain(aliceFeed.Items, item => item.Title == "Buddy at the park");
        Assert.DoesNotContain(bobFeed.Items, item => item.Title == "Mochi on the sofa");

        // Each still sees their own.
        Assert.Single(aliceFeed.Items);
        Assert.Single(bobFeed.Items);
    }

    [Fact]
    public async Task ABlockedAuthorIsFilteredEvenIfAFollowRowSurvives()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 10);
        await harness.FollowAsync(Alice, "limfamily");

        // Blocking removes follows, so put the block in by hand to prove the
        // feed does not rely on that cleanup having run.
        harness.Db.OwnerBlocks.Add(new OwnerBlock
        {
            BlockerUserId = Alice,
            BlockedUserId = Bob
        });
        await harness.Db.SaveChangesAsync();

        Assert.Empty((await harness.Feed.GetFeedAsync(Alice, null, null)).Items);
    }

    [Fact]
    public async Task TheFeedIsStrictlyNewestFirst()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Alice, "limfamily");
        await harness.AddMomentAsync(Bob, Buddy, "Oldest", 10);
        await harness.AddMomentAsync(Alice, Mochi, "Middle", 20);
        await harness.AddMomentAsync(Bob, Buddy, "Newest", 30);

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);

        Assert.Equal(
            new[] { "Newest", "Middle", "Oldest" },
            feed.Items.Select(item => item.Title).ToArray());
    }

    [Fact]
    public async Task AMultiPetMoment_AppearsOnceAndNamesEveryPet()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(
            Alice, Mochi, "Beach day", 10, alsoAbout: new[] { Coco });

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);

        var item = Assert.Single(feed.Items);
        Assert.Equal(2, item.Subjects.Count);
        Assert.Equal("Mochi", item.Subjects.First().Name);
        Assert.True(item.Subjects.First().IsPrimarySubject);
        Assert.False(item.Subjects.Last().IsPrimarySubject);
    }

    [Fact]
    public async Task EveryCardNamesTheHouseholdThatSharedIt()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Alice, "limfamily");
        await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 10);

        var item = Assert.Single((await harness.Feed.GetFeedAsync(Alice, null, null)).Items);

        Assert.NotNull(item.Author);
        Assert.Equal("LimFamily", item.Author!.Handle);
        Assert.Equal("The Lim Family", item.Author.DisplayName);
    }

    [Fact]
    public async Task PagingIsStableWhenAMomentIsPublishedBetweenRequests()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        for (var index = 0; index < 5; index += 1)
        {
            await harness.AddMomentAsync(Alice, Mochi, $"Moment {index}", index * 10);
        }

        var first = await harness.Feed.GetFeedAsync(Alice, null, 2);
        Assert.Equal(new[] { "Moment 4", "Moment 3" },
            first.Items.Select(item => item.Title).ToArray());
        Assert.NotNull(first.NextCursor);

        // Somebody publishes while the reader is mid-scroll. With offset paging
        // this would push a row across the boundary and the reader would see
        // "Moment 3" twice; the cursor names a position, so it cannot.
        await harness.AddMomentAsync(Alice, Coco, "Brand new", 999);

        var second = await harness.Feed.GetFeedAsync(Alice, first.NextCursor, 2);

        Assert.Equal(new[] { "Moment 2", "Moment 1" },
            second.Items.Select(item => item.Title).ToArray());
        Assert.DoesNotContain(second.Items, item => item.Title == "Brand new");
    }

    [Fact]
    public async Task NoMomentIsEverSeenTwiceAcrossAWholePagedWalk()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        for (var index = 0; index < 7; index += 1)
        {
            await harness.AddMomentAsync(Alice, Mochi, $"Moment {index}", index * 10);
        }

        var seen = new List<string>();
        string? cursor = null;

        do
        {
            var page = await harness.Feed.GetFeedAsync(Alice, cursor, 3);
            seen.AddRange(page.Items.Select(item => item.Title));
            cursor = page.NextCursor;
        }
        while (cursor is not null);

        Assert.Equal(7, seen.Count);
        Assert.Equal(7, seen.Distinct().Count());
    }

    [Fact]
    public async Task MomentsPublishedAtTheSameInstant_StillPageWithoutOverlap()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        // Identical PublishedAt: the id is what breaks the tie, which is why
        // the cursor carries both.
        for (var index = 0; index < 4; index += 1)
        {
            await harness.AddMomentAsync(Alice, Mochi, $"Same time {index}", 10);
        }

        var first = await harness.Feed.GetFeedAsync(Alice, null, 2);
        var second = await harness.Feed.GetFeedAsync(Alice, first.NextCursor, 2);

        var titles = first.Items.Concat(second.Items).Select(item => item.Title).ToArray();
        Assert.Equal(4, titles.Length);
        Assert.Equal(4, titles.Distinct().Count());
    }

    [Fact]
    public async Task TheFeedCarriesLikeStateForTheReader()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Mochi on the sofa", 10);
        await harness.Likes.LikeAsync(Bob, momentId);
        await harness.Likes.LikeAsync(Alice, momentId);

        var item = Assert.Single((await harness.Feed.GetFeedAsync(Alice, null, null)).Items);

        Assert.Equal(2, item.LikeCount);
        Assert.True(item.ViewerHasLiked);
    }

    [Fact]
    public async Task AVisitorWithNoSession_HasNoFeedAtAll()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(
            () => harness.Feed.GetFeedAsync(null, null, null));

        Assert.Equal(StatusCodes.Status401Unauthorized, error.StatusCode);
    }

    [Fact]
    public async Task ThePageSizeIsClampedNoMatterWhatIsAskedFor()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        for (var index = 0; index < 40; index += 1)
        {
            await harness.AddMomentAsync(Alice, Mochi, $"Moment {index}", index);
        }

        var huge = await harness.Feed.GetFeedAsync(Alice, null, 100_000);
        var defaulted = await harness.Feed.GetFeedAsync(Alice, null, null);

        Assert.Equal(SocialCursor.MaxPageSize, huge.Items.Count);
        Assert.Equal(SocialCursor.FeedPageSize, defaulted.Items.Count);
    }

    [Fact]
    public async Task AMalformedCursor_StartsAgainRatherThanFailing()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Alice, Mochi, "Mochi on the sofa", 10);

        var feed = await harness.Feed.GetFeedAsync(Alice, "not-a-cursor", null);

        // Cursors end up in history and shared links. A stale one should show
        // the first page, not an error screen.
        Assert.Single(feed.Items);
    }

    [Fact]
    public async Task LostMode_CreatesNoFeedItemAndNoBoost()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Alice, Mochi, "Mochi on the sofa", 10);
        await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 20);
        await harness.FollowAsync(Alice, "limfamily");

        var before = await harness.Feed.GetFeedAsync(Alice, null, null);

        var buddy = await harness.Db.Pets.SingleAsync(pet => pet.Id == Buddy);
        buddy.LostModeEnabled = true;
        await harness.Db.SaveChangesAsync();

        var after = await harness.Feed.GetFeedAsync(Alice, null, null);

        // Enabling Lost Mode changes a pet's SAFETY state. It does not create a
        // post, and it does not move anything up the feed. Sharing a lost alert
        // will be an explicit action somebody takes, not a side effect.
        Assert.Equal(
            before.Items.Select(item => item.Title).ToArray(),
            after.Items.Select(item => item.Title).ToArray());

        // The status is carried on the card so it can be shown quietly.
        var buddyCard = after.Items.Single(item => item.Title == "Buddy at the park");
        Assert.True(buddyCard.Subjects.Single().LostModeEnabled);
    }

    /// <summary>
    /// The other half of the discovery audit.
    ///
    /// Discoverability is a DISCOVERY control, not a secrecy control. Somebody
    /// who already follows this household chose to see their pets, so a
    /// socially-enabled pet still appears in their feed even with discovery off
    /// — the same pet Explore refuses to name to a stranger.
    /// </summary>
    [Fact]
    public async Task Feed_FollowedOwner_MayStillShowSocialEnabledNonDiscoverablePet_WhenPolicyAllows()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetPetDiscoverableAsync(Coco, discoverable: false);
        await harness.FollowAsync(Bob, "tanfamily");
        await harness.AddMomentAsync(
            Alice, Mochi, "Beach day", 10, alsoAbout: new[] { Coco });

        var feed = await harness.Feed.GetFeedAsync(Bob, null, null);

        var item = Assert.Single(feed.Items);
        Assert.Equal(2, item.Subjects.Count);
        Assert.Contains(item.Subjects, subject => subject.Name == "Coco");
    }

    [Fact]
    public async Task Feed_StillHidesAPetTakenOutOfSocialEntirely()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetPetSocialAsync(Coco, enabled: false);
        await harness.FollowAsync(Bob, "tanfamily");
        await harness.AddMomentAsync(
            Alice, Mochi, "Beach day", 10, alsoAbout: new[] { Coco });

        var feed = await harness.Feed.GetFeedAsync(Bob, null, null);

        // Social OFF is the switch that means "not a social subject at all",
        // and it still applies everywhere.
        var item = Assert.Single(feed.Items);
        Assert.Equal("Mochi", Assert.Single(item.Subjects).Name);
    }

    [Fact]
    public async Task TheFeedCarriesNoOwnerContactOrSafetyField()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Alice, Mochi, "Mochi on the sofa", 10);

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);
        var serialized = System.Text.Json.JsonSerializer.Serialize(feed);

        foreach (var forbidden in new[]
        {
            "+60123456789", "alice@example.com", "Alice Tan", "s-pubmochi", "SafetyCode"
        })
        {
            Assert.DoesNotContain(forbidden, serialized, StringComparison.OrdinalIgnoreCase);
        }
    }
}
