using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The one-level Reply read model, before anything can write a Reply.
///
/// Replies are seeded straight into the table, the way a later write path — or
/// a bad import, or a partial rollback — would leave them. Every read has to
/// agree about which of them exist: the thread, a thread's Replies, the counts,
/// anchors, mentions, reports and moderation context all go through
/// <see cref="SocialVisibility.VisibleComments"/>.
///
/// The thread used throughout: Alice's Moment; Bob's top-level Comment;
/// Replies from Carol and Frank. Erin is a bystander.
/// </summary>
public sealed class CommentReplyReadModelTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;
    private static readonly Guid Carol = SocialSurfaceHarness.CarolId;
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;
    private static readonly Guid Erin = Guid.Parse("c6111111-1111-1111-1111-111111111111");
    private static readonly Guid Frank = Guid.Parse("c6222222-2222-2222-2222-222222222222");

    private static readonly DateTimeOffset Start = new(2026, 9, 1, 8, 0, 0, TimeSpan.Zero);

    // ---- existing Comments ------------------------------------------------------

    [Fact]
    public async Task ExistingTopLevelCommentsReadExactlyAsBefore()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var first = await harness.Comments.CreateAsync(Bob, momentId, new CreateMomentCommentRequest("First"));
        var second = await harness.Comments.CreateAsync(Carol, momentId, new CreateMomentCommentRequest("Second"));

        var page = await harness.Comments.GetAsync(momentId, null, null, null);

        Assert.Equal([second.Comment.Id, first.Comment.Id], page.Items.Select(item => item.Id));
        Assert.All(page.Items, item =>
        {
            Assert.Null(item.ParentCommentId);
            Assert.Equal(0, item.ReplyCount);
        });
        Assert.Equal(2, page.CommentCount);
        Assert.Null(page.AnchorParentCommentId);

        Assert.Null(first.Comment.ParentCommentId);
        Assert.Equal(0, first.Comment.ReplyCount);
        Assert.Null((await harness.Db.MomentComments.FindAsync(first.Comment.Id))!.ParentCommentId);

        var anchored = await harness.Comments.GetAsync(momentId, null, null, null, default, first.Comment.Id);
        Assert.Null(anchored.AnchorParentCommentId);
        Assert.Equal(page.Items.Select(item => item.Id), anchored.Items.Select(item => item.Id));
    }

    // ---- thread shape and counts ----------------------------------------------------

    [Fact]
    public async Task TheThreadListsTopLevelCommentsOnlyAndCountsRepliesPerParent()
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);
        var quiet = await harness.Comments.CreateAsync(Erin, thread.MomentId, new CreateMomentCommentRequest("Quiet one"));

        foreach (var viewer in new Guid?[] { null, Erin, Alice })
        {
            var page = await harness.Comments.GetAsync(thread.MomentId, viewer, null, null);

            Assert.Equal([quiet.Comment.Id, thread.ParentId], page.Items.Select(item => item.Id));
            Assert.Equal(2, page.Items.Single(item => item.Id == thread.ParentId).ReplyCount);
            Assert.Equal(0, page.Items.Single(item => item.Id == quiet.Comment.Id).ReplyCount);
            Assert.All(page.Items, item => Assert.Null(item.ParentCommentId));

            // Every Comment and Reply the viewer can read.
            Assert.Equal(4, page.CommentCount);
        }
    }

    [Fact]
    public async Task EveryMomentCardCountsReadableRepliesTheSameWay()
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);
        await harness.FollowAsync(Erin, "tanfamily");

        async Task<int[]> Counts() =>
        [
            (await harness.Comments.GetAsync(thread.MomentId, Erin, null, null)).CommentCount,
            (await harness.PublicProfiles.GetMomentAsync(thread.MomentId, Erin)).CommentCount,
            Assert.Single((await harness.PublicProfiles.GetOwnerMomentsAsync(
                "tanfamily", null, null, Erin)).Items).CommentCount,
            Assert.Single((await harness.PublicProfiles.GetPetMomentsAsync(
                "mochi-pubmochi", null, null, Erin)).Items).CommentCount,
            Assert.Single((await harness.Feed.GetFeedAsync(Erin, null, null)).Items).CommentCount,
            Assert.Single((await harness.Discovery.GetLatestMomentsAsync(
                Erin, null, null, null)).Items).CommentCount
        ];

        Assert.All(await Counts(), count => Assert.Equal(3, count));

        // Erin stops seeing Carol: one Reply fewer everywhere, for Erin only.
        await harness.Graph.BlockAsync(Erin, "carolpets", null);
        Assert.All(await Counts(), count => Assert.Equal(2, count));
        Assert.Equal(3, (await harness.Comments.GetAsync(thread.MomentId, null, null, null)).CommentCount);
    }

    // ---- the Replies route ------------------------------------------------------

    [Fact]
    public async Task RepliesReadOldestFirstInPagesOfTenWithAStableCursorAcrossTies()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var parent = await harness.Comments.CreateAsync(Bob, momentId, new CreateMomentCommentRequest("Parent"));
        var expected = await SeedRepliesAsync(harness, momentId, parent.Comment.Id, 25);

        var seen = new List<Guid>();
        string? cursor = null;
        var pages = 0;
        do
        {
            var page = await harness.Comments.GetRepliesAsync(momentId, parent.Comment.Id, null, cursor, null);
            pages += 1;
            Assert.True(page.Items.Count <= MomentCommentService.ReplyPageSize);
            Assert.Equal(25, page.ReplyCount);
            Assert.Equal(parent.Comment.Id, page.ParentCommentId);
            Assert.All(page.Items, item =>
            {
                Assert.Equal(parent.Comment.Id, item.ParentCommentId);
                Assert.Equal(0, item.ReplyCount);
            });
            seen.AddRange(page.Items.Select(item => item.Id));
            cursor = page.NextCursor;
        }
        while (cursor is not null);

        Assert.Equal(3, pages);
        Assert.Equal(expected, seen);
    }

    [Fact]
    public async Task RepliesAreReadableAnonymouslyAndCarryEachViewersOwnAction()
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);

        async Task<string?> ActionFor(Guid? viewer) =>
            (await harness.Comments.GetRepliesAsync(thread.MomentId, thread.ParentId, viewer, null, null))
                .Items.Single(item => item.Id == thread.CarolReplyId).ViewerDeleteAction;

        Assert.Null(await ActionFor(null));
        Assert.Equal("delete", await ActionFor(Carol));
        Assert.Equal("remove", await ActionFor(Alice));

        // Writing the parent Comment gives no say over other people's Replies.
        Assert.Null(await ActionFor(Bob));
        Assert.Null(await ActionFor(Erin));
    }

    [Fact]
    public async Task EveryUnreadableParentAnswersTheSameNotFound()
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);
        var otherMomentId = await harness.AddMomentAsync(Alice, Mochi, "Other", 20);
        var privateMomentId = await harness.AddMomentAsync(Alice, Mochi, "Private", 30, MemoryVisibility.Private);
        var privateParent = await SeedCommentAsync(harness, privateMomentId, null, Bob, "On a private Moment", 1);
        var deleted = await harness.Comments.CreateAsync(Frank, thread.MomentId, new CreateMomentCommentRequest("Soon gone"));
        await harness.Comments.DeleteAsync(Frank, thread.MomentId, deleted.Comment.Id);

        var attempts = new List<(Guid MomentId, Guid CommentId, Guid? Viewer)>
        {
            (thread.MomentId, Guid.NewGuid(), null),                  // nobody's
            (thread.MomentId, deleted.Comment.Id, null),              // deleted
            (thread.MomentId, thread.CarolReplyId, null),             // a Reply is never a parent
            (otherMomentId, thread.ParentId, null),                   // another Moment's route
            (privateMomentId, privateParent, null),                   // a Moment nobody else can open
        };

        await harness.Graph.BlockAsync(Bob, "erinhome", null);
        attempts.Add((thread.MomentId, thread.ParentId, Erin));      // blocked by the parent's author

        await harness.Graph.BlockAsync(Frank, "tanfamily", null);
        attempts.Add((thread.MomentId, thread.ParentId, Frank));     // blocks the Moment's author

        var errors = new List<string>();
        foreach (var (momentId, commentId, viewer) in attempts)
        {
            var error = await Assert.ThrowsAsync<ApiException>(() =>
                harness.Comments.GetRepliesAsync(momentId, commentId, viewer, null, null));
            errors.Add($"{error.StatusCode}|{error.Code}|{error.Message}");
        }

        Assert.All(errors, error =>
            Assert.Equal($"{StatusCodes.Status404NotFound}|comment_not_found|This comment is not available.", error));
    }

    // ---- block matrix -------------------------------------------------------------

    [Theory]
    [InlineData("parentBlocksReplier")]
    [InlineData("replierBlocksParent")]
    public async Task ABlockBetweenReplyAndParentAuthorsHidesTheReplyFromEveryone(string direction)
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);

        if (direction == "parentBlocksReplier")
        {
            await harness.Graph.BlockAsync(Bob, "carolpets", null);
        }
        else
        {
            await harness.Graph.BlockAsync(Carol, "limfamily", null);
        }

        foreach (var viewer in new Guid?[] { null, Erin, Alice, Frank })
        {
            var replies = await harness.Comments.GetRepliesAsync(thread.MomentId, thread.ParentId, viewer, null, null);
            Assert.Equal([thread.FrankReplyId], replies.Items.Select(item => item.Id));
            Assert.Equal(1, replies.ReplyCount);

            var page = await harness.Comments.GetAsync(thread.MomentId, viewer, null, null);
            Assert.Equal(1, Assert.Single(page.Items).ReplyCount);
            Assert.Equal(2, page.CommentCount);
        }

        // Nothing was changed to hide it: the row is intact and returns on unblock.
        Assert.Equal("Carol's reply", (await harness.Db.MomentComments.FindAsync(thread.CarolReplyId))!.Body);
        if (direction == "parentBlocksReplier")
        {
            await harness.Graph.UnblockAsync(Bob, "carolpets");
        }
        else
        {
            await harness.Graph.UnblockAsync(Carol, "limfamily");
        }

        Assert.Equal(2, (await harness.Comments.GetRepliesAsync(
            thread.MomentId, thread.ParentId, null, null, null)).ReplyCount);
    }

    [Fact]
    public async Task AViewerWhoBlocksAReplyAuthorLosesOnlyThoseReplies()
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);

        await harness.Graph.BlockAsync(Erin, "carolpets", null);

        var forErin = await harness.Comments.GetRepliesAsync(thread.MomentId, thread.ParentId, Erin, null, null);
        Assert.Equal([thread.FrankReplyId], forErin.Items.Select(item => item.Id));
        Assert.Equal(1, forErin.ReplyCount);
        Assert.Equal(1, Assert.Single((await harness.Comments.GetAsync(thread.MomentId, Erin, null, null)).Items).ReplyCount);

        var forEveryoneElse = await harness.Comments.GetRepliesAsync(thread.MomentId, thread.ParentId, null, null, null);
        Assert.Equal(2, forEveryoneElse.ReplyCount);
    }

    [Fact]
    public async Task AViewerWhoBlocksTheParentAuthorLosesTheWholeThread()
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);

        await harness.Graph.BlockAsync(Erin, "limfamily", null);

        var page = await harness.Comments.GetAsync(thread.MomentId, Erin, null, null);
        Assert.Empty(page.Items);
        Assert.Equal(0, page.CommentCount);
        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.GetRepliesAsync(thread.MomentId, thread.ParentId, Erin, null, null));

        // Only Erin's view changed.
        Assert.Equal(3, (await harness.Comments.GetAsync(thread.MomentId, null, null, null)).CommentCount);
    }

    [Fact]
    public async Task TheMomentAuthorsBlocksApplyToRepliesAndToWholeThreads()
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);

        // Against a Reply's author: that Reply goes, for everybody.
        await harness.Graph.BlockAsync(Alice, "carolpets", null);
        var replies = await harness.Comments.GetRepliesAsync(thread.MomentId, thread.ParentId, Erin, null, null);
        Assert.Equal([thread.FrankReplyId], replies.Items.Select(item => item.Id));
        Assert.Equal(2, (await harness.Comments.GetAsync(thread.MomentId, null, null, null)).CommentCount);

        // Against the parent's author: the parent goes, and its thread with it.
        await harness.Graph.BlockAsync(Alice, "limfamily", null);
        var page = await harness.Comments.GetAsync(thread.MomentId, null, null, null);
        Assert.Empty(page.Items);
        Assert.Equal(0, page.CommentCount);
    }

    [Fact]
    public async Task HouseholdsLeavingCommunityTakeTheirRepliesOrTheirThreadsWithThem()
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);

        // A restricted household is out of Community by the existing rule; no
        // second mechanism is involved.
        var carol = await harness.Db.OwnerSocialProfiles.SingleAsync(profile => profile.UserId == Carol);
        CommunityModeration.RestrictHousehold(carol, Alice, DateTimeOffset.UtcNow);
        await harness.Db.SaveChangesAsync();

        Assert.Equal(1, (await harness.Comments.GetRepliesAsync(
            thread.MomentId, thread.ParentId, null, null, null)).ReplyCount);

        await harness.SetOwnerSocialAsync(Bob, false);
        var page = await harness.Comments.GetAsync(thread.MomentId, null, null, null);
        Assert.Empty(page.Items);
        Assert.Equal(0, page.CommentCount);
    }

    // ---- deleting and removing ---------------------------------------------------------

    [Theory]
    [InlineData("author")]
    [InlineData("momentAuthor")]
    public async Task RemovingTheParentTakesTheThreadWithItAndLeavesReplyRowsAlone(string by)
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);

        await harness.Comments.DeleteAsync(by == "author" ? Bob : Alice, thread.MomentId, thread.ParentId);

        var page = await harness.Comments.GetAsync(thread.MomentId, null, null, null);
        Assert.Empty(page.Items);
        Assert.Equal(0, page.CommentCount);
        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.GetRepliesAsync(thread.MomentId, thread.ParentId, null, null, null));
        Assert.Equal(0, Assert.Single((await harness.Discovery.GetLatestMomentsAsync(
            null, null, null, null)).Items).CommentCount);

        // No cascade and no placeholder: the Replies are untouched rows that
        // simply have no thread to appear in.
        foreach (var replyId in new[] { thread.CarolReplyId, thread.FrankReplyId })
        {
            var row = await harness.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == replyId);
            Assert.NotEqual("", row.Body);
            Assert.Null(row.DeletedAt);
            Assert.Equal(thread.ParentId, row.ParentCommentId);
        }
    }

    [Fact]
    public async Task DeletingOrRemovingAReplyTombstonesOnlyThatReply()
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);

        var deleted = await harness.Comments.DeleteAsync(Carol, thread.MomentId, thread.CarolReplyId);
        Assert.Equal(2, deleted.CommentCount);
        await harness.Comments.DeleteAsync(Alice, thread.MomentId, thread.FrankReplyId);

        foreach (var (replyId, remover) in new[] { (thread.CarolReplyId, Carol), (thread.FrankReplyId, Alice) })
        {
            var row = await harness.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == replyId);
            Assert.Equal("", row.Body);
            Assert.Equal(remover, row.DeletedByUserId);
            Assert.Equal(thread.ParentId, row.ParentCommentId);
        }

        var parent = await harness.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == thread.ParentId);
        Assert.Equal("Bob's comment", parent.Body);
        Assert.Null(parent.DeletedAt);

        var page = await harness.Comments.GetAsync(thread.MomentId, null, null, null);
        Assert.Equal(0, Assert.Single(page.Items).ReplyCount);
        Assert.Equal(1, page.CommentCount);

        // The parent's author cannot remove somebody else's Reply.
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.DeleteAsync(Bob, thread.MomentId, thread.CarolReplyId));
        Assert.Equal("comment_not_found", error.Code);
    }

    // ---- malformed rows ------------------------------------------------------------

    [Fact]
    public async Task MalformedRepliesAreNeverShownCountedNestedOrPromoted()
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);
        var otherMomentId = await harness.AddMomentAsync(Alice, Mochi, "Other", 20);
        var elsewhere = await harness.Comments.CreateAsync(Bob, otherMomentId, new CreateMomentCommentRequest("Elsewhere"));
        var gone = await harness.Comments.CreateAsync(Frank, thread.MomentId, new CreateMomentCommentRequest("Gone"));
        await harness.Comments.DeleteAsync(Frank, thread.MomentId, gone.Comment.Id);

        var malformed = new[]
        {
            await SeedCommentAsync(harness, thread.MomentId, thread.CarolReplyId, Erin, "Reply to a Reply", 20),
            await SeedCommentAsync(harness, thread.MomentId, elsewhere.Comment.Id, Erin, "Parent on another Moment", 21),
            await SeedCommentAsync(harness, thread.MomentId, gone.Comment.Id, Erin, "Parent deleted", 22),
            await SeedCommentAsync(harness, thread.MomentId, Guid.NewGuid(), Erin, "Parent missing", 23),
            await SeedSelfParentAsync(harness, thread.MomentId, Erin, "Its own parent", 24)
        };

        var page = await harness.Comments.GetAsync(thread.MomentId, null, null, null);
        Assert.Equal([thread.ParentId], page.Items.Select(item => item.Id));
        Assert.Equal(2, page.Items.Single().ReplyCount);
        Assert.Equal(3, page.CommentCount);

        var replies = await harness.Comments.GetRepliesAsync(thread.MomentId, thread.ParentId, null, null, null);
        Assert.Equal([thread.CarolReplyId, thread.FrankReplyId], replies.Items.Select(item => item.Id));

        // Not on the other Moment's thread either.
        var other = await harness.Comments.GetAsync(otherMomentId, null, null, null);
        Assert.Equal(0, Assert.Single(other.Items).ReplyCount);
        Assert.Equal(1, other.CommentCount);

        // A Reply is never opened as a parent, and no malformed row is an anchor.
        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.GetRepliesAsync(thread.MomentId, thread.CarolReplyId, null, null, null));
        var baseline = Shape(page);
        foreach (var id in malformed)
        {
            Assert.Equal(baseline, Shape(await harness.Comments.GetAsync(thread.MomentId, null, null, null, default, id)));
            Assert.Equal(
                Shape(replies),
                Shape(await harness.Comments.GetRepliesAsync(thread.MomentId, thread.ParentId, null, null, null, default, id)));
            var report = await Assert.ThrowsAsync<ApiException>(() => harness.Reports.SubmitAsync(
                Frank, new CreateCommunityReportRequest("comment", id.ToString(), "SpamOrScam", null)));
            Assert.Equal("report_target_unavailable", report.Code);
        }
    }

    // ---- anchors ----------------------------------------------------------------

    [Fact]
    public async Task ATopLevelAnchorToAReplyOpensTheThreadAtItsParent()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var ids = await SeedTopLevelAsync(harness, momentId, 45);
        var parentId = ids[5]; // 39 newer Comments sit above it.
        var replyIds = await SeedRepliesAsync(harness, momentId, parentId, 3);

        var byParent = await harness.Comments.GetAsync(momentId, Erin, null, null, default, parentId);
        var byReply = await harness.Comments.GetAsync(momentId, Erin, null, null, default, replyIds[2]);

        Assert.Null(byParent.AnchorParentCommentId);
        Assert.Equal(parentId, byReply.AnchorParentCommentId);
        Assert.Equal(40, byReply.Items.Count);
        Assert.Equal(parentId, byReply.Items.Last().Id);
        Assert.Equal(byParent.Items.Select(item => item.Id), byReply.Items.Select(item => item.Id));
        Assert.Equal(byParent.NextCursor, byReply.NextCursor);
        Assert.Equal(3, byReply.Items.Last().ReplyCount);

        // The follow-up read the thread then makes.
        var thread = await harness.Comments.GetRepliesAsync(momentId, parentId, Erin, null, null, default, replyIds[2]);
        Assert.Equal(replyIds, thread.Items.Select(item => item.Id));
    }

    [Fact]
    public async Task UnreadableReplyAnchorsAnswerExactlyLikeNoAnchor()
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);
        await SeedTopLevelAsync(harness, thread.MomentId, 30);

        var deletedReply = await SeedCommentAsync(harness, thread.MomentId, thread.ParentId, Frank, "Deleted reply", 40);
        await harness.Comments.DeleteAsync(Frank, thread.MomentId, deletedReply);

        // A thread whose parent is gone, with a Reply still in the table.
        var goneParent = await harness.Comments.CreateAsync(Frank, thread.MomentId, new CreateMomentCommentRequest("Gone parent"));
        var orphan = await SeedCommentAsync(harness, thread.MomentId, goneParent.Comment.Id, Erin, "Orphaned reply", 41);
        await harness.Comments.DeleteAsync(Frank, thread.MomentId, goneParent.Comment.Id);

        // Carol's Reply hidden from everybody by R3.
        await harness.Graph.BlockAsync(Bob, "carolpets", null);

        var baseline = Shape(await harness.Comments.GetAsync(thread.MomentId, Erin, null, null));

        foreach (var anchor in new[] { deletedReply, orphan, thread.CarolReplyId, Guid.NewGuid() })
        {
            var anchored = await harness.Comments.GetAsync(thread.MomentId, Erin, null, null, default, anchor);
            Assert.Null(anchored.AnchorParentCommentId);
            Assert.Equal(baseline, Shape(anchored));
        }
    }

    [Fact]
    public async Task AReplyWhoseParentIsBeyondTheWindowOpensTheOrdinaryFirstPage()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var ids = await SeedTopLevelAsync(harness, momentId, MomentCommentService.AnchorWindow + 5);
        var deepReply = (await SeedRepliesAsync(harness, momentId, ids[0], 1)).Single();
        var edgeReply = (await SeedRepliesAsync(harness, momentId, ids[^MomentCommentService.AnchorWindow], 1)).Single();

        var baseline = Shape(await harness.Comments.GetAsync(momentId, null, null, null));
        var deep = await harness.Comments.GetAsync(momentId, null, null, null, default, deepReply);
        Assert.Null(deep.AnchorParentCommentId);
        Assert.Equal(baseline, Shape(deep));

        // The last thread that still fits.
        var edge = await harness.Comments.GetAsync(momentId, null, null, null, default, edgeReply);
        Assert.Equal(ids[^MomentCommentService.AnchorWindow], edge.AnchorParentCommentId);
        Assert.Equal(MomentCommentService.AnchorWindow, edge.Items.Count);
    }

    [Fact]
    public async Task ReplyPageAnchorsWidenOnlyWithinTheirOwnThreadAndWindow()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var parent = await harness.Comments.CreateAsync(Bob, momentId, new CreateMomentCommentRequest("Parent"));
        var sibling = await harness.Comments.CreateAsync(Carol, momentId, new CreateMomentCommentRequest("Sibling"));
        var replies = await SeedRepliesAsync(harness, momentId, parent.Comment.Id, MomentCommentService.ReplyAnchorWindow + 5);
        var siblingReply = (await SeedRepliesAsync(harness, momentId, sibling.Comment.Id, 1)).Single();

        var anchored = await harness.Comments.GetRepliesAsync(
            momentId, parent.Comment.Id, null, null, null, default, replies[25]);
        Assert.Equal(replies.Take(26), anchored.Items.Select(item => item.Id));
        var rest = await harness.Comments.GetRepliesAsync(momentId, parent.Comment.Id, null, anchored.NextCursor, 30);
        Assert.Equal(replies.Skip(26).Take(30), rest.Items.Select(item => item.Id));

        var edge = await harness.Comments.GetRepliesAsync(
            momentId, parent.Comment.Id, null, null, null, default, replies[MomentCommentService.ReplyAnchorWindow - 1]);
        Assert.Equal(MomentCommentService.ReplyAnchorWindow, edge.Items.Count);

        var baseline = Shape(await harness.Comments.GetRepliesAsync(momentId, parent.Comment.Id, null, null, null));
        await harness.Comments.DeleteAsync(Alice, momentId, replies[3]);
        baseline = Shape(await harness.Comments.GetRepliesAsync(momentId, parent.Comment.Id, null, null, null));
        foreach (var anchor in new[]
                 {
                     replies[MomentCommentService.ReplyAnchorWindow + 1], // beyond the window
                     replies[3],                                          // deleted
                     siblingReply,                                        // another thread's
                     sibling.Comment.Id,                                  // a top-level Comment
                     Guid.NewGuid()
                 })
        {
            Assert.Equal(baseline, Shape(await harness.Comments.GetRepliesAsync(
                momentId, parent.Comment.Id, null, null, null, default, anchor)));
        }

        // A cursor wins over an anchor, as on the thread.
        var first = await harness.Comments.GetRepliesAsync(momentId, parent.Comment.Id, null, null, null);
        Assert.Equal(
            Shape(await harness.Comments.GetRepliesAsync(momentId, parent.Comment.Id, null, first.NextCursor, null)),
            Shape(await harness.Comments.GetRepliesAsync(
                momentId, parent.Comment.Id, null, first.NextCursor, null, default, replies[50])));
    }

    // ---- mentions, reports, moderation ----------------------------------------------

    [Fact]
    public async Task ReplyMentionsLinkAndNotifyOnlyWhileTheThreadIsReadable()
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);
        var replyId = await SeedCommentAsync(harness, thread.MomentId, thread.ParentId, Carol, "@ErinHome look", 30);
        harness.Db.MomentCommentMentions.Add(new MomentCommentMention
        {
            CommentId = replyId,
            MentionedUserId = Erin,
            Start = 0,
            Length = "@ErinHome".Length
        });
        harness.Db.OwnerNotifications.Add(new OwnerNotification
        {
            RecipientUserId = Erin,
            ActorUserId = Carol,
            MomentId = thread.MomentId,
            CommentId = replyId,
            Type = OwnerNotificationType.MomentCommentMentioned
        });
        await harness.Db.SaveChangesAsync();

        var reply = (await harness.Comments.GetRepliesAsync(thread.MomentId, thread.ParentId, null, null, null))
            .Items.Single(item => item.Id == replyId);
        Assert.Equal("ErinHome", Assert.Single(reply.Mentions).Household.Handle);
        Assert.Equal(replyId, Assert.Single((await harness.Notifications.GetAsync(Erin, null, null)).Items).CommentId);

        // R3 hides the Reply, and its mention and Activity go with it.
        await harness.Graph.BlockAsync(Bob, "carolpets", null);
        Assert.Empty((await harness.Notifications.GetAsync(Erin, null, null)).Items);
        Assert.Equal(0, (await harness.Notifications.GetUnreadSummaryAsync(Erin)).UnreadCount);
        await harness.Graph.UnblockAsync(Bob, "carolpets");
        Assert.Single((await harness.Notifications.GetAsync(Erin, null, null)).Items);

        // So does removing the parent. The mention row itself is untouched.
        await harness.Comments.DeleteAsync(Bob, thread.MomentId, thread.ParentId);
        Assert.Empty((await harness.Notifications.GetAsync(Erin, null, null)).Items);
        Assert.Single(await harness.Db.MomentCommentMentions.Where(item => item.CommentId == replyId).ToListAsync());
    }

    [Fact]
    public async Task AReplyIsReportedAsACommentAgainstItsAuthorWithItsBody()
    {
        using var harness = await CreateAsync();
        var thread = await ThreadAsync(harness);

        await harness.Reports.SubmitAsync(
            Erin, new CreateCommunityReportRequest("comment", thread.CarolReplyId.ToString(), "SpamOrScam", null));

        var report = await harness.Db.CommunityReports.SingleAsync();
        Assert.Equal(CommunityReportTargetType.Comment, report.TargetType);
        Assert.Equal(thread.CarolReplyId, report.CommentId);
        Assert.Null(report.MomentId);
        Assert.Equal(Carol, report.ReportedUserId);
        Assert.Equal("Carol's reply", report.SnapshotText);
        Assert.Equal("CarolPets", report.SnapshotHandle);

        // Once its thread is gone it is not there to report.
        await harness.Comments.DeleteAsync(Bob, thread.MomentId, thread.ParentId);
        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Reports.SubmitAsync(
            Frank, new CreateCommunityReportRequest("comment", thread.CarolReplyId.ToString(), "SpamOrScam", null)));
        Assert.Equal("report_target_unavailable", error.Code);
    }

    [Fact]
    public async Task AdminSeesAReportedReplyWithItsParentAndRemovesOnlyTheReply()
    {
        using var world = await ModerationWorld.CreateAsync();
        var parentId = world.CommentId;
        var replyId = await SeedCommentAsync(world.Harness, world.MomentId, parentId, SocialSurfaceHarness.CarolId, "A reply worth reporting", 5);
        await world.Harness.Reports.SubmitAsync(
            SocialSurfaceHarness.AliceId, new CreateCommunityReportRequest("comment", replyId.ToString(), "SpamOrScam", null));
        world.Db.ChangeTracker.Clear();
        var report = await world.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.CommentId == replyId);

        var detail = await world.Queries.GetAsync(AdminCommunityModerationTests.ModeratorId, report.Id);
        var current = detail.CurrentComment!;
        Assert.Equal(replyId, current.Id);
        Assert.Equal(parentId, current.ParentCommentId);
        Assert.True(current.PubliclyVisible);
        var parent = current.ParentComment!;
        Assert.Equal(parentId, parent.Id);
        Assert.Equal(ModerationWorld.CommentBody, parent.Body);
        Assert.False(parent.Removed);
        Assert.True(parent.PubliclyVisible);
        Assert.Equal("LimFamily", parent.Author.Handle);
        Assert.Contains("RemoveComment", detail.AvailableActions);

        // A top-level Comment names no parent.
        var topLevelReport = await world.Db.CommunityReports.AsNoTracking()
            .FirstAsync(item => item.CommentId == parentId);
        var topLevel = (await world.Queries.GetAsync(AdminCommunityModerationTests.ModeratorId, topLevelReport.Id)).CurrentComment!;
        Assert.Null(topLevel.ParentCommentId);
        Assert.Null(topLevel.ParentComment);

        // The one Remove Comment action works on a Reply and touches nothing else.
        var result = await world.Moderation.RemoveCommentAsync(
            AdminCommunityModerationTests.ModeratorId, report.Id, world.Request(report));
        Assert.Equal(AdminCommunityModerationService.Applied, result.Outcome);
        world.Db.ChangeTracker.Clear();
        var reply = await world.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == replyId);
        Assert.Equal("", reply.Body);
        Assert.Equal(AdminCommunityModerationTests.ModeratorId, reply.DeletedByUserId);
        Assert.Equal(ModerationWorld.CommentBody,
            (await world.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == parentId)).Body);
    }

    [Fact]
    public async Task AdminSeesAReplyUnderARemovedParentAsNotPubliclyVisible()
    {
        using var world = await ModerationWorld.CreateAsync();
        var parentId = world.CommentId;
        var replyId = await SeedCommentAsync(world.Harness, world.MomentId, parentId, SocialSurfaceHarness.CarolId, "Still stored", 5);
        await world.Harness.Reports.SubmitAsync(
            SocialSurfaceHarness.AliceId, new CreateCommunityReportRequest("comment", replyId.ToString(), "SpamOrScam", null));
        await world.Harness.Comments.DeleteAsync(SocialSurfaceHarness.BobId, world.MomentId, parentId);
        world.Db.ChangeTracker.Clear();
        var report = await world.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.CommentId == replyId);

        var current = (await world.Queries.GetAsync(AdminCommunityModerationTests.ModeratorId, report.Id)).CurrentComment!;

        Assert.False(current.Removed);
        Assert.Equal("Still stored", current.Body);
        Assert.False(current.PubliclyVisible);
        Assert.True(current.ParentComment!.Removed);
        Assert.Null(current.ParentComment.Body);
        Assert.False(current.ParentComment.PubliclyVisible);
    }

    // ---- world --------------------------------------------------------------------

    private sealed record Thread(Guid MomentId, Guid ParentId, Guid CarolReplyId, Guid FrankReplyId);

    private static async Task<SocialSurfaceHarness> CreateAsync()
    {
        var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddHouseholdAsync(Erin, "ErinHome", "The Ong Home", Guid.NewGuid(), "Pip");
        await harness.AddHouseholdAsync(Frank, "FrankHome", "The Koh Home", Guid.NewGuid(), "Rex");
        return harness;
    }

    /// <summary>Alice's Moment, Bob's Comment, then Replies from Carol and Frank.</summary>
    private static async Task<Thread> ThreadAsync(SocialSurfaceHarness harness)
    {
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var parentId = await SeedCommentAsync(harness, momentId, null, Bob, "Bob's comment", 0);
        var carol = await SeedCommentAsync(harness, momentId, parentId, Carol, "Carol's reply", 1);
        var frank = await SeedCommentAsync(harness, momentId, parentId, Frank, "Frank's reply", 2);
        return new Thread(momentId, parentId, carol, frank);
    }

    /// <summary>
    /// Writes a Comment row directly — the only way a Reply can exist before
    /// the write path does.
    /// </summary>
    internal static async Task<Guid> SeedCommentAsync(
        SocialSurfaceHarness harness,
        Guid momentId,
        Guid? parentId,
        Guid authorId,
        string body,
        int minutes)
    {
        var comment = new MomentComment
        {
            MomentId = momentId,
            ParentCommentId = parentId,
            AuthorUserId = authorId,
            Body = body,
            CreatedAt = Start.AddMinutes(minutes)
        };
        harness.Db.MomentComments.Add(comment);
        await harness.Db.SaveChangesAsync();
        return comment.Id;
    }

    /// <summary>Only the in-memory store accepts this; SQL Server's CHECK refuses it.</summary>
    private static async Task<Guid> SeedSelfParentAsync(
        SocialSurfaceHarness harness,
        Guid momentId,
        Guid authorId,
        string body,
        int minutes)
    {
        var id = Guid.NewGuid();
        harness.Db.MomentComments.Add(new MomentComment
        {
            Id = id,
            MomentId = momentId,
            ParentCommentId = id,
            AuthorUserId = authorId,
            Body = body,
            CreatedAt = Start.AddMinutes(minutes)
        });
        await harness.Db.SaveChangesAsync();
        return id;
    }

    /// <summary>Top-level Comments by Bob, oldest first, a minute apart.</summary>
    private static async Task<List<Guid>> SeedTopLevelAsync(SocialSurfaceHarness harness, Guid momentId, int count)
    {
        var rows = Enumerable.Range(0, count)
            .Select(index => new MomentComment
            {
                MomentId = momentId,
                AuthorUserId = Bob,
                Body = $"Comment {index}",
                CreatedAt = Start.AddHours(1).AddMinutes(index)
            })
            .ToList();
        harness.Db.MomentComments.AddRange(rows);
        await harness.Db.SaveChangesAsync();
        return rows.OrderBy(row => row.CreatedAt).ThenBy(row => row.Id).Select(row => row.Id).ToList();
    }

    /// <summary>
    /// Replies by Carol, in the thread's own order (oldest first). Every third
    /// shares its predecessor's timestamp, so ties are decided by id.
    /// </summary>
    private static async Task<List<Guid>> SeedRepliesAsync(
        SocialSurfaceHarness harness,
        Guid momentId,
        Guid parentId,
        int count)
    {
        var rows = Enumerable.Range(0, count)
            .Select(index => new MomentComment
            {
                MomentId = momentId,
                ParentCommentId = parentId,
                AuthorUserId = Carol,
                Body = $"Reply {index}",
                CreatedAt = Start.AddHours(5).AddMinutes(index - (index % 3 == 2 ? 1 : 0))
            })
            .ToList();
        harness.Db.MomentComments.AddRange(rows);
        await harness.Db.SaveChangesAsync();
        return rows.OrderBy(row => row.CreatedAt).ThenBy(row => row.Id).Select(row => row.Id).ToList();
    }

    private static string Shape(MomentCommentPageResponse page) =>
        string.Join(",", page.Items.Select(item => $"{item.Id}:{item.ReplyCount}"))
        + "|" + page.NextCursor + "|" + page.CommentCount + "|" + page.AnchorParentCommentId;

    private static string Shape(MomentCommentReplyPageResponse page) =>
        string.Join(",", page.Items.Select(item => item.Id)) + "|" + page.NextCursor + "|" + page.ReplyCount;
}
