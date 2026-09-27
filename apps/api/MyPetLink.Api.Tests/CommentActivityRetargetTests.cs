using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.DTOs;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Retargeting unread Comment Activity when the Comment it points at goes.
///
/// An unread row stands for what one actor did on one Moment since the
/// recipient last read that kind of Activity from them. Removing its Comment
/// moves it to the newest remaining Comment the recipient can see and has not
/// yet read about, or removes it. It never moves onto a Comment a read row
/// already delivered, which would list the same Comment twice.
///
/// The cast: Alice's Moment; Bob comments; Carol replies and mentions; Erin.
/// </summary>
public sealed class CommentActivityRetargetTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;
    private static readonly Guid Carol = SocialSurfaceHarness.CarolId;
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;
    private static readonly Guid Erin = Guid.Parse("c9111111-1111-1111-1111-111111111111");

    [Fact]
    public async Task DeletingTheNewerCommentNeverRepeatsOneAlreadyRead()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var first = await CommentAsync(harness, Bob, momentId, "First");
        await harness.Notifications.MarkReadAsync(Alice, null);
        var second = await CommentAsync(harness, Bob, momentId, "Second");
        Assert.Equal(
            [$"MomentCommented:{second}*", $"MomentCommented:{first}"],
            await ActivityAsync(harness, Alice));

        await harness.Comments.DeleteAsync(Bob, momentId, second);

        Assert.Equal([$"MomentCommented:{first}"], await ActivityAsync(harness, Alice));
        Assert.Equal(0, (await harness.Notifications.GetUnreadSummaryAsync(Alice)).UnreadCount);
    }

    [Fact]
    public async Task TheUnreadRowStillMovesToTheNewestCommentSinceTheLastRead()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var first = await CommentAsync(harness, Bob, momentId, "First");
        await harness.Notifications.MarkReadAsync(Alice, null);
        var second = await CommentAsync(harness, Bob, momentId, "Second");
        var third = await CommentAsync(harness, Bob, momentId, "Third");

        await harness.Comments.DeleteAsync(Bob, momentId, third);
        Assert.Equal(
            [$"MomentCommented:{second}*", $"MomentCommented:{first}"],
            await ActivityAsync(harness, Alice));

        await harness.Comments.DeleteAsync(Alice, momentId, second);
        Assert.Equal([$"MomentCommented:{first}"], await ActivityAsync(harness, Alice));

        // With nothing read yet, the oldest remaining Comment is still news.
        var otherMoment = await harness.AddMomentAsync(Alice, Mochi, "Park", 20);
        var only = await CommentAsync(harness, Bob, otherMoment, "Only");
        var gone = await CommentAsync(harness, Bob, otherMoment, "Gone");
        await harness.Comments.DeleteAsync(Bob, otherMoment, gone);
        Assert.Equal(
            [$"MomentCommented:{only}*", $"MomentCommented:{first}"],
            await ActivityAsync(harness, Alice));
    }

    [Fact]
    public async Task RepliedRowsFollowTheSameRule()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var parent = await CommentAsync(harness, Bob, momentId, "Nice photo!");
        var first = await CommentAsync(harness, Carol, momentId, "First", parent);
        await ReadAllAsync(harness);
        var second = await CommentAsync(harness, Carol, momentId, "Second", parent);
        var third = await CommentAsync(harness, Carol, momentId, "Third", parent);

        await harness.Comments.DeleteAsync(Carol, momentId, third);
        Assert.Equal(
            [$"MomentCommentReplied:{second}*", $"MomentCommentReplied:{first}"],
            await ActivityAsync(harness, Bob));

        await harness.Comments.DeleteAsync(Carol, momentId, second);
        Assert.Equal([$"MomentCommentReplied:{first}"], await ActivityAsync(harness, Bob));
        Assert.Equal(
            [$"MomentCommented:{first}", $"MomentCommented:{parent}"],
            await ActivityAsync(harness, Alice));
    }

    [Fact]
    public async Task MentionedRowsFollowTheSameRule()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var first = await CommentAsync(harness, Carol, momentId, "@ErinHome first");
        await ReadAllAsync(harness);
        var second = await CommentAsync(harness, Carol, momentId, "@ErinHome second");
        var third = await CommentAsync(harness, Carol, momentId, "@ErinHome third");

        await harness.Comments.DeleteAsync(Carol, momentId, third);
        Assert.Equal(
            [$"MomentCommentMentioned:{second}*", $"MomentCommentMentioned:{first}"],
            await ActivityAsync(harness, Erin));

        await harness.Comments.DeleteAsync(Carol, momentId, second);
        Assert.Equal([$"MomentCommentMentioned:{first}"], await ActivityAsync(harness, Erin));
    }

    [Fact]
    public async Task TheUnreadRowNeverMovesOntoACommentTheRecipientCannotRead()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var parent = await CommentAsync(harness, Bob, momentId, "Nice photo!");
        await ReadAllAsync(harness);
        var topLevel = await CommentAsync(harness, Carol, momentId, "A comment");
        var reply = await CommentAsync(harness, Carol, momentId, "A reply", parent);
        var newest = await CommentAsync(harness, Carol, momentId, "Newest");

        // A block between Carol and the parent's author hides her Reply for
        // everyone (R3). Alice's row must not move onto it and vanish.
        await harness.Graph.BlockAsync(Bob, "carolpets", null);
        await harness.Comments.DeleteAsync(Carol, momentId, newest);

        Assert.Equal($"MomentCommented:{topLevel}*", (await ActivityAsync(harness, Alice))[0]);
        Assert.DoesNotContain(
            (await ActivityAsync(harness, Alice)),
            item => item.Contains(reply.ToString(), StringComparison.Ordinal));

        // Nothing readable left: the unread row goes rather than pointing at
        // something hidden.
        await harness.Comments.DeleteAsync(Carol, momentId, topLevel);
        Assert.Equal(0, (await harness.Notifications.GetUnreadSummaryAsync(Alice)).UnreadCount);
        Assert.False(await harness.Db.OwnerNotifications.AnyAsync(item =>
            item.RecipientUserId == Alice && item.ActorUserId == Carol && item.ReadAt == null));
    }

    // ---- helpers ------------------------------------------------------------------------

    private static async Task<SocialSurfaceHarness> CreateAsync()
    {
        var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddHouseholdAsync(Erin, "ErinHome", "The Ong Home", Guid.NewGuid(), "Pip");
        return harness;
    }

    private static async Task<Guid> CommentAsync(
        SocialSurfaceHarness harness, Guid author, Guid momentId, string body, Guid? parentId = null) =>
        (await harness.Comments.CreateAsync(author, momentId, new CreateMomentCommentRequest(body, parentId))).Comment.Id;

    private static async Task ReadAllAsync(SocialSurfaceHarness harness)
    {
        foreach (var household in new[] { Alice, Bob, Carol, Erin })
        {
            await harness.Notifications.MarkReadAsync(household, null);
        }
    }

    /// <summary>
    /// Everything a household's Activity lists, newest first, as
    /// "Type:CommentId" with "*" for unread — always checked against the badge.
    /// </summary>
    private static async Task<string[]> ActivityAsync(SocialSurfaceHarness harness, Guid household)
    {
        var page = await harness.Notifications.GetAsync(household, null, null);
        Assert.Equal(
            page.Items.Count(item => !item.IsRead),
            (await harness.Notifications.GetUnreadSummaryAsync(household)).UnreadCount);
        return page.Items
            .Select(item => $"{item.Type}:{item.CommentId}{(item.IsRead ? "" : "*")}")
            .ToArray();
    }
}
