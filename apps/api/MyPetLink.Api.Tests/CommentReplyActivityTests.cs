using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Activity for Replies. For a Reply by X under A's Comment on M's Moment,
/// mentioning S, each household hears at most once: A "replied to your
/// comment", else M "commented on your Moment", else S "mentioned you". Rows
/// coalesce per actor and Moment like all Comment Activity, retarget or go when
/// a Reply is removed, and show only while the recipient can read the Reply.
///
/// The cast: Alice's Moment (M); Bob's Comment (A); Carol replies (X); Erin is
/// mentioned.
/// </summary>
public sealed class CommentReplyActivityTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;
    private static readonly Guid Carol = SocialSurfaceHarness.CarolId;
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;
    private static readonly Guid Erin = Guid.Parse("c8111111-1111-1111-1111-111111111111");

    // ---- who hears -------------------------------------------------------------------

    [Fact]
    public async Task TheParentsAuthorHearsRepliedAndADistinctMomentAuthorHearsCommented()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness, Bob);
        await ReadAllAsync(harness);

        var reply = await ReplyAsync(harness, Carol, momentId, parentId, "Thank you!");

        Assert.Equal([$"MomentCommentReplied:{reply}"], await ActivityAsync(harness, Bob));
        Assert.Equal([$"MomentCommented:{reply}"], await ActivityAsync(harness, Alice));
        Assert.Empty(await ActivityAsync(harness, Carol));
    }

    [Fact]
    public async Task AReplyToTheMomentAuthorsOwnCommentReachesThemOnceAsReplied()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness, Alice);

        var reply = await ReplyAsync(harness, Carol, momentId, parentId, "@TanFamily lovely");

        Assert.Equal([$"MomentCommentReplied:{reply}"], await ActivityAsync(harness, Alice));
    }

    [Fact]
    public async Task NobodyHearsAboutReplyingToThemselves()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness, Bob);
        await ReadAllAsync(harness);

        var ownReply = await ReplyAsync(harness, Bob, momentId, parentId, "Adding to my own comment");
        Assert.Empty(await ActivityAsync(harness, Bob));
        Assert.Equal([$"MomentCommented:{ownReply}"], await ActivityAsync(harness, Alice));

        // The Moment's author replying is news to the parent's author only.
        var authorReply = await ReplyAsync(harness, Alice, momentId, parentId, "Thanks Bob");
        Assert.Equal([$"MomentCommentReplied:{authorReply}"], await ActivityAsync(harness, Bob));
        Assert.Equal([$"MomentCommented:{ownReply}"], await ActivityAsync(harness, Alice));
    }

    [Fact]
    public async Task MentionsNeverAddASecondRowForSomebodyAlreadyTold()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness, Bob);
        await ReadAllAsync(harness);

        var reply = await ReplyAsync(
            harness, Carol, momentId, parentId, "@LimFamily @TanFamily @ErinHome @CarolPets all of you");

        Assert.Equal(4, await harness.Db.MomentCommentMentions.CountAsync(item => item.CommentId == reply));
        Assert.Equal([$"MomentCommentReplied:{reply}"], await ActivityAsync(harness, Bob));
        Assert.Equal([$"MomentCommented:{reply}"], await ActivityAsync(harness, Alice));
        Assert.Equal([$"MomentCommentMentioned:{reply}"], await ActivityAsync(harness, Erin));
        Assert.Empty(await ActivityAsync(harness, Carol));
    }

    // ---- coalescing --------------------------------------------------------------------

    [Fact]
    public async Task RepliesCoalesceWithRepliesOnlyAndANewRowFollowsARead()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness, Bob);
        var secondParent = (await harness.Comments.CreateAsync(
            Bob, momentId, new CreateMomentCommentRequest("Another from Bob"))).Comment.Id;
        await ReadAllAsync(harness);

        await ReplyAsync(harness, Carol, momentId, parentId, "One");
        var latest = await ReplyAsync(harness, Carol, momentId, secondParent, "Two");

        Assert.Equal([$"MomentCommentReplied:{latest}"], await ActivityAsync(harness, Bob));
        Assert.Equal([$"MomentCommented:{latest}"], await ActivityAsync(harness, Alice));

        await harness.Notifications.MarkReadAsync(Bob, null);
        var third = await ReplyAsync(harness, Carol, momentId, parentId, "Three");
        var bob = await ActivityAsync(harness, Bob, includeRead: true);
        Assert.Equal([$"MomentCommentReplied:{third}", $"MomentCommentReplied:{latest}"], bob);

        // Replying to Erin while also mentioning her elsewhere: two different
        // things, two rows, never merged.
        var erinsComment = (await harness.Comments.CreateAsync(
            Erin, momentId, new CreateMomentCommentRequest("Erin's comment"))).Comment.Id;
        await ReadAllAsync(harness);
        var mention = await ReplyAsync(harness, Carol, momentId, parentId, "@ErinHome see this");
        var toErin = await ReplyAsync(harness, Carol, momentId, erinsComment, "Replying to you");
        Assert.Equal(
            [$"MomentCommentReplied:{toErin}", $"MomentCommentMentioned:{mention}"],
            await ActivityAsync(harness, Erin));
    }

    // ---- withdrawal and retargeting --------------------------------------------------

    [Fact]
    public async Task RemovingRepliesRetargetsThenWithdrawsEachRow()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness, Bob);
        await ReadAllAsync(harness);
        var first = await ReplyAsync(harness, Carol, momentId, parentId, "First");
        var second = await ReplyAsync(harness, Carol, momentId, parentId, "Second");

        await harness.Comments.DeleteAsync(Carol, momentId, second);
        Assert.Equal([$"MomentCommentReplied:{first}"], await ActivityAsync(harness, Bob));
        Assert.Equal([$"MomentCommented:{first}"], await ActivityAsync(harness, Alice));

        // Removed by the Moment's author: the same withdrawal.
        await harness.Comments.DeleteAsync(Alice, momentId, first);
        Assert.Empty(await ActivityAsync(harness, Bob));
        Assert.Empty(await ActivityAsync(harness, Alice));
        Assert.Equal(0, (await harness.Notifications.GetUnreadSummaryAsync(Bob)).UnreadCount);
    }

    [Fact]
    public async Task CommentedIsNeverRetargetedOntoAReplyItsRecipientHeardAboutAsReplied()
    {
        using var harness = await CreateAsync();
        var (momentId, alicesComment) = await ThreadAsync(harness, Alice);
        await ReadAllAsync(harness);

        var reply = await ReplyAsync(harness, Carol, momentId, alicesComment, "Replying to Alice");
        var topLevel = (await harness.Comments.CreateAsync(
            Carol, momentId, new CreateMomentCommentRequest("And a comment"))).Comment.Id;
        Assert.Equal(
            [$"MomentCommented:{topLevel}", $"MomentCommentReplied:{reply}"],
            await ActivityAsync(harness, Alice));

        await harness.Comments.DeleteAsync(Carol, momentId, topLevel);

        Assert.Equal([$"MomentCommentReplied:{reply}"], await ActivityAsync(harness, Alice));
    }

    [Fact]
    public async Task AMentionIsNeverRetargetedOntoAReplyItsRecipientHeardAboutAsReplied()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var erinsComment = (await harness.Comments.CreateAsync(
            Erin, momentId, new CreateMomentCommentRequest("Erin's comment"))).Comment.Id;
        var mention = (await harness.Comments.CreateAsync(
            Carol, momentId, new CreateMomentCommentRequest("@ErinHome hello"))).Comment.Id;
        var reply = await ReplyAsync(harness, Carol, momentId, erinsComment, "@ErinHome replying");
        Assert.Equal(
            [$"MomentCommentReplied:{reply}", $"MomentCommentMentioned:{mention}"],
            await ActivityAsync(harness, Erin));

        await harness.Comments.DeleteAsync(Carol, momentId, mention);

        Assert.Equal([$"MomentCommentReplied:{reply}"], await ActivityAsync(harness, Erin));
    }

    // ---- visibility -----------------------------------------------------------------

    [Fact]
    public async Task ABlockBetweenReplierAndParentAuthorHidesTheReplysActivityForEveryone()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness, Bob);
        await ReadAllAsync(harness);
        var reply = await ReplyAsync(harness, Carol, momentId, parentId, "@ErinHome look");

        await harness.Graph.BlockAsync(Bob, "carolpets", null);

        // Alice and Erin are on good terms with Carol; the Reply is hidden by
        // R3, and its Activity goes with it.
        foreach (var household in new[] { Alice, Bob, Erin })
        {
            Assert.Empty(await ActivityAsync(harness, household));
            Assert.Equal(0, (await harness.Notifications.GetUnreadSummaryAsync(household)).UnreadCount);
        }

        await harness.Graph.UnblockAsync(Bob, "carolpets");
        Assert.Equal([$"MomentCommented:{reply}"], await ActivityAsync(harness, Alice));
        Assert.Equal([$"MomentCommentReplied:{reply}"], await ActivityAsync(harness, Bob));
        Assert.Equal([$"MomentCommentMentioned:{reply}"], await ActivityAsync(harness, Erin));
    }

    [Fact]
    public async Task RemovingTheParentHidesItsRepliesActivityWithoutDeletingIt()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness, Bob);
        await ReadAllAsync(harness);
        var reply = await ReplyAsync(harness, Carol, momentId, parentId, "@ErinHome look");
        var rows = await harness.Db.OwnerNotifications.CountAsync(item => item.CommentId == reply);

        await harness.Comments.DeleteAsync(Alice, momentId, parentId);

        foreach (var household in new[] { Alice, Bob, Erin })
        {
            Assert.Empty(await ActivityAsync(harness, household));
            Assert.Equal(0, (await harness.Notifications.GetUnreadSummaryAsync(household)).UnreadCount);
        }

        Assert.Equal(3, rows);
        Assert.Equal(rows, await harness.Db.OwnerNotifications.CountAsync(item => item.CommentId == reply));
    }

    [Fact]
    public async Task AHiddenMomentOrARestrictedReplierTakesTheActivityAway()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness, Bob);
        await ReadAllAsync(harness);
        await ReplyAsync(harness, Carol, momentId, parentId, "@ErinHome look");

        var moment = await harness.Db.PetMemories.SingleAsync(item => item.Id == momentId);
        CommunityModeration.HideMoment(moment, Alice, DateTimeOffset.UtcNow);
        await harness.Db.SaveChangesAsync();
        foreach (var household in new[] { Alice, Bob, Erin })
        {
            Assert.Empty(await ActivityAsync(harness, household));
        }

        CommunityModeration.UnhideMoment(moment);
        var carol = await harness.Db.OwnerSocialProfiles.SingleAsync(profile => profile.UserId == Carol);
        CommunityModeration.RestrictHousehold(carol, Alice, DateTimeOffset.UtcNow);
        await harness.Db.SaveChangesAsync();
        foreach (var household in new[] { Alice, Bob, Erin })
        {
            Assert.Empty(await ActivityAsync(harness, household));
            Assert.Equal(0, (await harness.Notifications.GetUnreadSummaryAsync(household)).UnreadCount);
        }
    }

    [Fact]
    public async Task RepliedDeepLinksThroughTheAnchorToTheReply()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness, Bob);
        await ReadAllAsync(harness);
        var reply = await ReplyAsync(harness, Carol, momentId, parentId, "Found it");

        var activity = Assert.Single((await harness.Notifications.GetAsync(Bob, null, null)).Items);
        Assert.Equal(("MomentCommentReplied", momentId, reply), (activity.Type, activity.MomentId!.Value, activity.CommentId!.Value));
        Assert.Equal("CarolPets", activity.Actor.Handle);

        // /moments/{momentId}#comment-{replyId}: the thread names the parent,
        // and the parent's Replies reach the Reply.
        var thread = await harness.Comments.GetAsync(momentId, Bob, null, null, default, reply);
        Assert.Equal(parentId, thread.AnchorParentCommentId);
        var replies = await harness.Comments.GetRepliesAsync(momentId, parentId, Bob, null, null, default, reply);
        Assert.Contains(reply, replies.Items.Select(item => item.Id));
    }

    // ---- world --------------------------------------------------------------------

    private static async Task<SocialSurfaceHarness> CreateAsync()
    {
        var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddHouseholdAsync(Erin, "ErinHome", "The Ong Home", Guid.NewGuid(), "Pip");
        return harness;
    }

    private static async Task<(Guid MomentId, Guid ParentId)> ThreadAsync(SocialSurfaceHarness harness, Guid parentAuthor)
    {
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var parent = await harness.Comments.CreateAsync(parentAuthor, momentId, new CreateMomentCommentRequest("Nice photo!"));
        return (momentId, parent.Comment.Id);
    }

    private static async Task<Guid> ReplyAsync(
        SocialSurfaceHarness harness, Guid author, Guid momentId, Guid parentId, string body) =>
        (await harness.Comments.CreateAsync(author, momentId, new CreateMomentCommentRequest(body, parentId))).Comment.Id;

    /// <summary>Marks everything read for every household, so a test starts from quiet.</summary>
    private static async Task ReadAllAsync(SocialSurfaceHarness harness)
    {
        foreach (var household in new[] { Alice, Bob, Carol, Erin })
        {
            await harness.Notifications.MarkReadAsync(household, null);
        }
    }

    /// <summary>
    /// A household's Activity as "Type:CommentId", newest first — unread only
    /// unless asked, and always checked against the unread badge.
    /// </summary>
    private static async Task<string[]> ActivityAsync(
        SocialSurfaceHarness harness, Guid household, bool includeRead = false)
    {
        var page = await harness.Notifications.GetAsync(household, null, null);
        Assert.Equal(
            page.Items.Count(item => !item.IsRead),
            (await harness.Notifications.GetUnreadSummaryAsync(household)).UnreadCount);
        return page.Items
            .Where(item => includeRead || !item.IsRead)
            .Select(item => $"{item.Type}:{item.CommentId}")
            .ToArray();
    }
}
