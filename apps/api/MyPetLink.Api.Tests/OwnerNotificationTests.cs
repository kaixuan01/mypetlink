using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// In-app activity.
///
/// Two things these tests exist to hold. Activity must never become the back
/// door that hands somebody a blocked account's identity. And a notification
/// must never describe something that did not happen, or that has since been
/// taken back.
/// </summary>
public sealed class OwnerNotificationTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;
    private static readonly Guid Carol = SocialSurfaceHarness.CarolId;
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;
    private static readonly Guid Coco = SocialSurfaceHarness.CocoId;
    private static readonly Guid Buddy = SocialSurfaceHarness.BuddyId;

    // ---- follows --------------------------------------------------------

    [Fact]
    public async Task FollowingSomebody_TellsThemAndNotYou()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        await harness.FollowAsync(Bob, "tanfamily");

        var forAlice = await harness.Notifications.GetAsync(Alice, null, null);
        var forBob = await harness.Notifications.GetAsync(Bob, null, null);

        var item = Assert.Single(forAlice.Items);
        Assert.Equal("NewFollower", item.Type);
        Assert.Equal("LimFamily", item.Actor.Handle);
        Assert.Empty(forBob.Items);
    }

    [Fact]
    public async Task FollowingYourself_IsImpossibleAndNotifiesNobody()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        await Assert.ThrowsAsync<ApiException>(
            () => harness.Graph.FollowAsync(Alice, "tanfamily"));

        Assert.Empty(await harness.Db.OwnerNotifications.ToListAsync());
    }

    [Fact]
    public async Task ARefusedFollow_LeavesNoActivityBehind()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.Graph.BlockAsync(Alice, "limfamily", null);

        await Assert.ThrowsAsync<ApiException>(
            () => harness.Graph.FollowAsync(Bob, "tanfamily"));

        // The follow and its notification share one save. A failed interaction
        // cannot leave phantom activity.
        Assert.Empty(await harness.Db.OwnerNotifications.ToListAsync());
    }

    [Fact]
    public async Task Unfollowing_TakesTheUnreadNotificationWithIt()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Bob, "tanfamily");
        await harness.Graph.UnfollowAsync(Bob, "tanfamily");

        var forAlice = await harness.Notifications.GetAsync(Alice, null, null);

        // Activity that says somebody started following you, when they no
        // longer do, is simply wrong.
        Assert.Empty(forAlice.Items);
    }

    [Fact]
    public async Task UnfollowingAfterItWasRead_LeavesTheHistoryAlone()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Bob, "tanfamily");
        await harness.Notifications.MarkReadAsync(Alice, null);

        await harness.Graph.UnfollowAsync(Bob, "tanfamily");

        var forAlice = await harness.Notifications.GetAsync(Alice, null, null);

        // It described something that really happened, and Alice has seen it.
        // Rewriting history she has already read is worse than leaving it.
        var item = Assert.Single(forAlice.Items);
        Assert.True(item.IsRead);
        Assert.Equal(0, forAlice.UnreadCount);
    }

    [Fact]
    public async Task FollowingAgainLater_ProducesRealActivityAgain()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Bob, "tanfamily");
        await harness.Notifications.MarkReadAsync(Alice, null);
        await harness.Graph.UnfollowAsync(Bob, "tanfamily");
        await harness.FollowAsync(Bob, "tanfamily");

        var forAlice = await harness.Notifications.GetAsync(Alice, null, null);

        // No forever-unique index: a genuine later follow is genuine news.
        Assert.Equal(2, forAlice.Items.Count);
        Assert.Equal(1, forAlice.UnreadCount);
    }

    [Fact]
    public async Task RapidFollowToggling_NeverStacksUpUnreadActivity()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        for (var round = 0; round < 5; round += 1)
        {
            await harness.FollowAsync(Bob, "tanfamily");
            await harness.Graph.UnfollowAsync(Bob, "tanfamily");
        }

        await harness.FollowAsync(Bob, "tanfamily");
        var forAlice = await harness.Notifications.GetAsync(Alice, null, null);

        Assert.Single(forAlice.Items);
    }

    // ---- likes ----------------------------------------------------------

    [Fact]
    public async Task LikingAMoment_TellsItsAuthor()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        await harness.Likes.LikeAsync(Bob, momentId);

        var item = Assert.Single((await harness.Notifications.GetAsync(Alice, null, null)).Items);

        Assert.Equal("MomentLiked", item.Type);
        Assert.Equal("LimFamily", item.Actor.Handle);
        Assert.Equal("Mochi", item.PetName);
        Assert.Equal("Beach day", item.MomentTitle);
    }

    [Fact]
    public async Task AMultiPetMomentsActivity_NamesEveryPetInOrder()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(
            Alice, Mochi, "Beach day", 10, alsoAbout: new[] { Coco });

        await harness.Likes.LikeAsync(Bob, momentId);

        var item = Assert.Single((await harness.Notifications.GetAsync(Alice, null, null)).Items);

        // The copy reads "your Moment of Mochi & Coco"; the primary pet leads.
        Assert.Equal(new[] { "Mochi", "Coco" }, item.MomentSubjectNames.ToArray());
    }

    [Fact]
    public async Task LikingYourOwnMoment_TellsYouNothing()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        await harness.Likes.LikeAsync(Alice, momentId);

        // Self-like stays allowed — a harmless way to mark a favourite — it is
        // simply not news to you.
        Assert.Empty((await harness.Notifications.GetAsync(Alice, null, null)).Items);
        Assert.Single(await harness.Db.MomentLikes.ToListAsync());
    }

    [Fact]
    public async Task ARefusedLike_LeavesNoActivityBehind()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(
            Alice, Mochi, "Vet visit", 10, MemoryVisibility.Private);

        await Assert.ThrowsAsync<ApiException>(
            () => harness.Likes.LikeAsync(Bob, momentId));

        Assert.Empty(await harness.Db.OwnerNotifications.ToListAsync());
    }

    [Fact]
    public async Task Unliking_TakesTheUnreadNotificationWithIt()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        await harness.Likes.LikeAsync(Bob, momentId);
        await harness.Likes.UnlikeAsync(Bob, momentId);

        Assert.Empty((await harness.Notifications.GetAsync(Alice, null, null)).Items);
    }

    [Fact]
    public async Task LikingAgainLater_IsNotPermanentlySilenced()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        await harness.Likes.LikeAsync(Bob, momentId);
        await harness.Notifications.MarkReadAsync(Alice, null);
        await harness.Likes.UnlikeAsync(Bob, momentId);
        await harness.Likes.LikeAsync(Bob, momentId);

        var forAlice = await harness.Notifications.GetAsync(Alice, null, null);

        Assert.Equal(2, forAlice.Items.Count);
        Assert.Equal(1, forAlice.UnreadCount);
    }

    [Fact]
    public async Task RapidLikeToggling_NeverFloodsTheAuthor()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        for (var round = 0; round < 5; round += 1)
        {
            await harness.Likes.LikeAsync(Bob, momentId);
            await harness.Likes.UnlikeAsync(Bob, momentId);
        }

        await harness.Likes.LikeAsync(Bob, momentId);

        Assert.Single((await harness.Notifications.GetAsync(Alice, null, null)).Items);
    }

    [Fact]
    public async Task TwoPeopleLikingTheSameMoment_AreTwoPiecesOfActivity()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        await harness.Likes.LikeAsync(Bob, momentId);
        await harness.Likes.LikeAsync(Carol, momentId);

        Assert.Equal(2, (await harness.Notifications.GetAsync(Alice, null, null)).Items.Count);
    }

    // ---- blocking and absent actors -------------------------------------

    [Fact]
    public async Task BlockingRemovesTheActorFromActivityEntirely()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await harness.Likes.LikeAsync(Bob, momentId);

        await harness.Graph.BlockAsync(Alice, "limfamily", null);

        var forAlice = await harness.Notifications.GetAsync(Alice, null, null);
        var serialized = System.Text.Json.JsonSerializer.Serialize(forAlice);

        // Not merely hidden in the UI: the handle never leaves the server, so
        // activity cannot become a path back into a blocked interaction.
        Assert.Empty(forAlice.Items);
        Assert.Equal(0, forAlice.UnreadCount);
        Assert.DoesNotContain("LimFamily", serialized, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ABlockInTheOtherDirection_HidesTheActivityToo()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Bob, "tanfamily");

        // Bob followed Alice, then Alice blocked him... from Bob's side.
        await harness.Graph.BlockAsync(Bob, "tanfamily", null);

        Assert.Empty((await harness.Notifications.GetAsync(Alice, null, null)).Items);
    }

    [Fact]
    public async Task AnActorWhoLeavesSocial_StopsAppearingInActivity()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Bob, "tanfamily");

        await harness.SetOwnerSocialAsync(Bob, enabled: false);

        var forAlice = await harness.Notifications.GetAsync(Alice, null, null);

        // Identity is resolved at read time, never copied into the row, so
        // leaving social takes the name with it.
        Assert.Empty(forAlice.Items);
        Assert.Equal(0, forAlice.UnreadCount);
    }

    [Fact]
    public async Task UnknownActivityTypesAreNeverProjectedOrCounted()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        harness.Db.OwnerNotifications.Add(new OwnerNotification
        {
            RecipientUserId = Alice,
            ActorUserId = Bob,
            Type = OwnerNotificationType.Unknown
        });
        await harness.Db.SaveChangesAsync();

        var page = await harness.Notifications.GetAsync(Alice, null, null);
        Assert.Empty(page.Items);
        Assert.Equal(0, page.UnreadCount);
    }

    [Fact]
    public async Task LikeWithoutDisplayableCommunityIdentityCreatesNoActivity()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var profile = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == Bob);
        profile.DisplayName = null;
        await harness.Db.SaveChangesAsync();

        var result = await harness.Likes.LikeAsync(Bob, momentId);

        Assert.True(result.ViewerHasLiked);
        Assert.Empty(await harness.Db.OwnerNotifications.ToListAsync());
    }

    [Fact]
    public async Task NoNotificationRowEverStoresAnAccountName()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Bob, "tanfamily");

        var row = Assert.Single(await harness.Db.OwnerNotifications.ToListAsync());

        Assert.DoesNotContain(
            typeof(OwnerNotification).GetProperties(),
            property => property.PropertyType == typeof(string));
        Assert.Equal(Bob, row.ActorUserId);
    }

    // ---- reading, counting, paging --------------------------------------

    [Fact]
    public async Task TheUnreadCountMatchesWhatTheListShows()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await harness.Likes.LikeAsync(Bob, momentId);
        await harness.Likes.LikeAsync(Carol, momentId);
        await harness.Graph.BlockAsync(Alice, "limfamily", null);

        var page = await harness.Notifications.GetAsync(Alice, null, null);
        var summary = await harness.Notifications.GetUnreadSummaryAsync(Alice);

        // A badge saying two over a list showing one is a bug the recipient
        // notices immediately, so the count is filtered exactly as the list is.
        Assert.Single(page.Items);
        Assert.Equal(1, page.UnreadCount);
        Assert.Equal(1, summary.UnreadCount);
    }

    [Fact]
    public async Task MarkingEverythingRead_EmptiesTheBadgeWithoutEmptyingTheList()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Bob, "tanfamily");
        await harness.FollowAsync(Carol, "tanfamily");

        var summary = await harness.Notifications.MarkReadAsync(Alice, null);
        var page = await harness.Notifications.GetAsync(Alice, null, null);

        Assert.Equal(0, summary.UnreadCount);
        Assert.Equal(2, page.Items.Count);
        Assert.All(page.Items, item => Assert.True(item.IsRead));
    }

    [Fact]
    public async Task MarkingOneRead_LeavesTheRest()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Bob, "tanfamily");
        await harness.FollowAsync(Carol, "tanfamily");

        var page = await harness.Notifications.GetAsync(Alice, null, null);
        var summary = await harness.Notifications.MarkReadAsync(
            Alice,
            new MarkNotificationsReadRequest(new[] { page.Items.First().Id }));

        Assert.Equal(1, summary.UnreadCount);
    }

    [Fact]
    public async Task OneAccountCannotMarkAnothersActivityRead()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Bob, "tanfamily");

        var alicePage = await harness.Notifications.GetAsync(Alice, null, null);
        var stolen = alicePage.Items.Single().Id;

        await harness.Notifications.MarkReadAsync(
            Bob,
            new MarkNotificationsReadRequest(new[] { stolen }));

        // The recipient comes from the token, so an id belonging to somebody
        // else simply matches nothing.
        var summary = await harness.Notifications.GetUnreadSummaryAsync(Alice);
        Assert.Equal(1, summary.UnreadCount);
    }

    [Fact]
    public async Task ActivityIsCursorPagedNewestFirstWithoutRepeating()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        for (var index = 0; index < 7; index += 1)
        {
            var momentId = await harness.AddMomentAsync(
                Alice, Mochi, $"Moment {index}", index * 10);
            await harness.Likes.LikeAsync(Bob, momentId);
        }

        var seen = new List<Guid>();
        string? cursor = null;

        do
        {
            var page = await harness.Notifications.GetAsync(Alice, cursor, 3);
            seen.AddRange(page.Items.Select(item => item.Id));
            cursor = page.NextCursor;
        }
        while (cursor is not null);

        Assert.Equal(7, seen.Count);
        Assert.Equal(7, seen.Distinct().Count());
    }

    [Fact]
    public async Task AVisitorWithNoSession_HasNoActivity()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(
            () => harness.Notifications.GetAsync(null, null, null));

        Assert.Equal(StatusCodes.Status401Unauthorized, error.StatusCode);
    }

    [Fact]
    public async Task ALikeNotificationCarriesThePetPageItLeadsTo()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await harness.Likes.LikeAsync(Bob, momentId);

        var item = Assert.Single((await harness.Notifications.GetAsync(Alice, null, null)).Items);

        // There is no standalone Moment route yet, so a like leads to the pet's
        // own public page, where the Moment is listed.
        Assert.Equal("mochi-pubmochi", item.PetPublicSlug);
    }

    [Fact]
    public async Task ActivityCarriesNoContactOrSafetyField()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await harness.Likes.LikeAsync(Bob, momentId);

        var serialized = System.Text.Json.JsonSerializer.Serialize(
            await harness.Notifications.GetAsync(Alice, null, null));

        foreach (var forbidden in new[]
        {
            "+60123456789", "bob@example.com", "Bob Lim", "s-pubmochi"
        })
        {
            Assert.DoesNotContain(forbidden, serialized, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task ActivityWritesNoEmail()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        await harness.FollowAsync(Bob, "tanfamily");
        await harness.Likes.LikeAsync(Bob, momentId);

        // Phase 1K is in-app only. Social email is a new consent category and an
        // abuse amplifier; it waits for engagement data.
        Assert.Empty(await harness.Db.EmailOutbox.ToListAsync());
    }

    [Fact]
    public async Task SocialActivityWritesNoSafetyOrTagRow()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        var safetyBefore = await harness.Db.PetSafetySettings.AsNoTracking().ToListAsync();
        await harness.FollowAsync(Bob, "tanfamily");
        await harness.Likes.LikeAsync(Bob, momentId);
        await harness.Graph.BlockAsync(Alice, "limfamily", null);
        var safetyAfter = await harness.Db.PetSafetySettings.AsNoTracking().ToListAsync();

        Assert.Equal(safetyBefore.Count, safetyAfter.Count);
        Assert.All(safetyAfter, setting => Assert.True(setting.QrSafetyEnabled));
        Assert.Empty(await harness.Db.TagScans.ToListAsync());
    }

    [Fact]
    public async Task AnActorWhoIsNoLongerActive_DisappearsFromActivityUntilReinstated()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await harness.FollowAsync(Bob, "tanfamily");
        await harness.Likes.LikeAsync(Bob, momentId);
        await harness.Comments.CreateAsync(Bob, momentId, new CreateMomentCommentRequest("Hello"));

        var before = await harness.Notifications.GetAsync(Alice, null, null);
        Assert.Equal(
            new[] { "MomentCommented", "MomentLiked", "NewFollower" },
            before.Items.Select(item => item.Type).OrderBy(type => type));

        foreach (var status in new[] { UserStatus.Suspended, UserStatus.Deleted, UserStatus.Invited })
        {
            (await harness.Db.Users.FindAsync(Bob))!.Status = status;
            await harness.Db.SaveChangesAsync();

            var hidden = await harness.Notifications.GetAsync(Alice, null, null);
            Assert.Empty(hidden.Items);
            Assert.Equal(0, hidden.UnreadCount);
            Assert.Equal(0, (await harness.Notifications.GetUnreadSummaryAsync(Alice)).UnreadCount);
        }

        // Read-time only: the rows were never removed.
        Assert.Equal(3, await harness.Db.OwnerNotifications.CountAsync(item => item.ActorUserId == Bob));

        (await harness.Db.Users.FindAsync(Bob))!.Status = UserStatus.Active;
        await harness.Db.SaveChangesAsync();
        var restored = await harness.Notifications.GetAsync(Alice, null, null);
        Assert.Equal(3, restored.Items.Count);
        Assert.Equal(3, restored.UnreadCount);
    }
}
