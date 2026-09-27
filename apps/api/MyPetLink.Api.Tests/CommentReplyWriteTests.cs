using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Writing Replies through the one Comment write path: what a Reply may go
/// under, who may write one, what counts as a retry, and how deleting,
/// removing, reporting and moderating a Reply behave now that real Replies
/// exist.
///
/// The cast: Alice's Moment; Bob's top-level Comment; Carol replies. Erin and
/// Frank are other households.
/// </summary>
public sealed class CommentReplyWriteTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;
    private static readonly Guid Carol = SocialSurfaceHarness.CarolId;
    private static readonly Guid Dave = SocialSurfaceHarness.DaveId;
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;
    private static readonly Guid Erin = Guid.Parse("c7111111-1111-1111-1111-111111111111");
    private static readonly Guid Frank = Guid.Parse("c7222222-2222-2222-2222-222222222222");

    // ---- writing --------------------------------------------------------------------

    [Fact]
    public async Task ATopLevelCommentIsWrittenExactlyAsBefore()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        var created = await harness.Comments.CreateAsync(Bob, momentId, new CreateMomentCommentRequest("Hello"));
        var explicitNull = await harness.Comments.CreateAsync(
            Bob, momentId, new CreateMomentCommentRequest("Hello again", null));

        foreach (var response in new[] { created, explicitNull })
        {
            Assert.Null(response.Comment.ParentCommentId);
            Assert.Null(response.ParentCommentId);
            Assert.Null(response.ParentReplyCount);
            Assert.Equal(0, response.Comment.ReplyCount);
            Assert.Null((await harness.Db.MomentComments.FindAsync(response.Comment.Id))!.ParentCommentId);
        }

        Assert.Equal(2, explicitNull.CommentCount);
        Assert.Equal("MomentCommented", Assert.Single((await harness.Notifications.GetAsync(Alice, null, null)).Items).Type);
    }

    [Fact]
    public async Task AReplyIsWrittenUnderItsTopLevelCommentAndCounted()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness);

        var reply = await harness.Comments.CreateAsync(
            Carol, momentId, new CreateMomentCommentRequest("Thank you!", parentId));

        Assert.Equal(parentId, reply.Comment.ParentCommentId);
        Assert.Equal(0, reply.Comment.ReplyCount);
        Assert.Equal("delete", reply.Comment.ViewerDeleteAction);
        Assert.Equal("CarolPets", reply.Comment.Author.Handle);
        Assert.Equal(parentId, reply.ParentCommentId);
        Assert.Equal(1, reply.ParentReplyCount);
        Assert.Equal(2, reply.CommentCount);

        var row = await harness.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == reply.Comment.Id);
        Assert.Equal((momentId, parentId, Carol), (row.MomentId, row.ParentCommentId, row.AuthorUserId));

        var page = await harness.Comments.GetAsync(momentId, null, null, null);
        Assert.Equal(1, Assert.Single(page.Items).ReplyCount);
        Assert.Equal(2, page.CommentCount);
        Assert.Equal(
            reply.Comment.Id,
            Assert.Single((await harness.Comments.GetRepliesAsync(momentId, parentId, null, null, null)).Items).Id);

        // A second Reply, and the counts follow.
        var second = await harness.Comments.CreateAsync(
            Erin, momentId, new CreateMomentCommentRequest("Me too", parentId));
        Assert.Equal(2, second.ParentReplyCount);
        Assert.Equal(3, second.CommentCount);
    }

    [Fact]
    public async Task EveryUnavailableParentIsTheSameNotFoundAndWritesNothing()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness);
        var otherMomentId = await harness.AddMomentAsync(Alice, Mochi, "Other", 20);
        var elsewhere = (await harness.Comments.CreateAsync(
            Bob, otherMomentId, new CreateMomentCommentRequest("Elsewhere"))).Comment.Id;
        var deleted = (await harness.Comments.CreateAsync(
            Erin, momentId, new CreateMomentCommentRequest("Soon gone"))).Comment.Id;
        await harness.Comments.DeleteAsync(Erin, momentId, deleted);
        var hiddenAuthor = (await harness.Comments.CreateAsync(
            Frank, momentId, new CreateMomentCommentRequest("Frank's comment"))).Comment.Id;
        await harness.SetOwnerSocialAsync(Frank, false);

        // A Reply Carol cannot see: posting under it must look like nothing is
        // there at all, not like "that is a Reply".
        var unseenReply = (await harness.Comments.CreateAsync(
            Erin, momentId, new CreateMomentCommentRequest("Erin's reply", parentId))).Comment.Id;
        await harness.Graph.BlockAsync(Carol, "erinhome", null);

        var rowsBefore = await harness.Db.MomentComments.CountAsync();
        var activityBefore = await harness.Db.OwnerNotifications.CountAsync();

        var errors = new List<string>();
        foreach (var parent in new[] { Guid.NewGuid(), deleted, elsewhere, hiddenAuthor, unseenReply })
        {
            var error = await Assert.ThrowsAsync<ApiException>(() => harness.Comments.CreateAsync(
                Carol, momentId, new CreateMomentCommentRequest("Hi", parent)));
            errors.Add($"{error.StatusCode}|{error.Code}|{error.Message}");
        }

        // Blocked either way between the replier and the parent's author.
        await harness.Graph.BlockAsync(Bob, "carolpets", null);
        foreach (var replier in new[] { Carol })
        {
            var error = await Assert.ThrowsAsync<ApiException>(() => harness.Comments.CreateAsync(
                replier, momentId, new CreateMomentCommentRequest("Hi", parentId)));
            errors.Add($"{error.StatusCode}|{error.Code}|{error.Message}");
        }

        await harness.Graph.UnblockAsync(Bob, "carolpets");
        await harness.Graph.BlockAsync(Carol, "limfamily", null);
        var reverse = await Assert.ThrowsAsync<ApiException>(() => harness.Comments.CreateAsync(
            Carol, momentId, new CreateMomentCommentRequest("Hi", parentId)));
        errors.Add($"{reverse.StatusCode}|{reverse.Code}|{reverse.Message}");

        Assert.Equal(7, errors.Count);
        Assert.All(errors, error =>
            Assert.Equal($"{StatusCodes.Status404NotFound}|comment_not_found|This comment is not available.", error));
        Assert.Equal(rowsBefore, await harness.Db.MomentComments.CountAsync());
        Assert.Equal(activityBefore, await harness.Db.OwnerNotifications.CountAsync());
    }

    [Fact]
    public async Task AMomentTheReplierCannotOpenRefusesLikeATopLevelComment()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness);

        var moment = await harness.Db.PetMemories.SingleAsync(item => item.Id == momentId);
        CommunityModeration.HideMoment(moment, Alice, DateTimeOffset.UtcNow);
        await harness.Db.SaveChangesAsync();

        var reply = await Assert.ThrowsAsync<ApiException>(() => harness.Comments.CreateAsync(
            Carol, momentId, new CreateMomentCommentRequest("Hi", parentId)));
        var topLevel = await Assert.ThrowsAsync<ApiException>(() => harness.Comments.CreateAsync(
            Carol, momentId, new CreateMomentCommentRequest("Hi")));

        Assert.Equal((topLevel.StatusCode, topLevel.Code), (reply.StatusCode, reply.Code));
        Assert.Equal("social_moment_not_found", reply.Code);
    }

    [Fact]
    public async Task AReplyIsNeverAParentAndIsNotQuietlySwappedForOne()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness);
        var reply = await harness.Comments.CreateAsync(
            Carol, momentId, new CreateMomentCommentRequest("First reply", parentId));

        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Comments.CreateAsync(
            Erin, momentId, new CreateMomentCommentRequest("@CarolPets agreed", reply.Comment.Id)));

        Assert.Equal(StatusCodes.Status422UnprocessableEntity, error.StatusCode);
        Assert.Equal("comment_reply_parent_invalid", error.Code);
        Assert.DoesNotContain(await harness.Db.MomentComments.ToListAsync(), row => row.AuthorUserId == Erin);
        Assert.All(
            await harness.Db.MomentComments.Where(row => row.ParentCommentId != null).ToListAsync(),
            row => Assert.Equal(parentId, row.ParentCommentId));
    }

    [Fact]
    public async Task HouseholdsThatCannotCommentCannotReplyForTheSameReasons()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness);

        async Task<(string Comment, string Reply)> Codes(Guid? actor)
        {
            var comment = await Assert.ThrowsAsync<ApiException>(() => harness.Comments.CreateAsync(
                actor, momentId, new CreateMomentCommentRequest("Hello")));
            var reply = await Assert.ThrowsAsync<ApiException>(() => harness.Comments.CreateAsync(
                actor, momentId, new CreateMomentCommentRequest("Hello", parentId)));
            return ($"{comment.StatusCode}|{comment.Code}", $"{reply.StatusCode}|{reply.Code}");
        }

        var anonymous = await Codes(null);
        Assert.Equal("401|unauthorized", anonymous.Reply);

        var noProfile = await Codes(Dave);
        Assert.Equal("403|community_profile_required", noProfile.Reply);

        // Switched off by the household itself: turning it back on is theirs to do.
        (await harness.Db.OwnerSocialProfiles.SingleAsync(profile => profile.UserId == Bob)).IsSocialEnabled = false;
        await harness.Db.SaveChangesAsync();
        var communityOff = await Codes(Bob);
        Assert.Equal("403|community_profile_required", communityOff.Reply);

        // Paused by MyPetLink: never "set up your profile".
        var carol = await harness.Db.OwnerSocialProfiles.SingleAsync(profile => profile.UserId == Carol);
        CommunityModeration.RestrictHousehold(carol, Alice, DateTimeOffset.UtcNow);
        await harness.Db.SaveChangesAsync();
        var restricted = await Codes(Carol);
        Assert.Equal("403|community_restricted", restricted.Reply);

        (await harness.Db.Users.FindAsync(Erin))!.Status = UserStatus.Suspended;
        await harness.Db.SaveChangesAsync();
        var suspended = await Codes(Erin);
        Assert.Equal("403|account_inactive", suspended.Reply);

        foreach (var (comment, reply) in new[] { anonymous, noProfile, communityOff, restricted, suspended })
        {
            Assert.Equal(comment, reply);
        }

        Assert.Empty(await harness.Db.MomentComments.Where(row => row.ParentCommentId != null).ToListAsync());
    }

    // ---- retries ------------------------------------------------------------------

    [Fact]
    public async Task ARetryIsTheSameTextInTheSamePlaceAndNothingWider()
    {
        using var harness = await CreateAsync();
        var (momentId, first) = await ThreadAsync(harness);
        var second = (await harness.Comments.CreateAsync(
            Erin, momentId, new CreateMomentCommentRequest("Another comment"))).Comment.Id;

        var topLevel = await harness.Comments.CreateAsync(Carol, momentId, new CreateMomentCommentRequest("Same words"));
        var underFirst = await harness.Comments.CreateAsync(Carol, momentId, new CreateMomentCommentRequest("Same words", first));
        var underSecond = await harness.Comments.CreateAsync(Carol, momentId, new CreateMomentCommentRequest("Same words", second));
        var retry = await harness.Comments.CreateAsync(Carol, momentId, new CreateMomentCommentRequest("  Same words​ ", first));

        Assert.Equal(3, new[] { topLevel.Comment.Id, underFirst.Comment.Id, underSecond.Comment.Id }.Distinct().Count());
        Assert.Equal(underFirst.Comment.Id, retry.Comment.Id);
        Assert.Equal(1, retry.ParentReplyCount);
        Assert.Equal(3, await harness.Db.MomentComments.CountAsync(row => row.AuthorUserId == Carol));

        // The retry told nobody twice.
        Assert.Single(await harness.Db.OwnerNotifications
            .Where(item => item.Type == OwnerNotificationType.MomentCommentReplied && item.RecipientUserId == Bob)
            .ToListAsync());
    }

    // ---- mentions -----------------------------------------------------------------

    [Fact]
    public async Task RepliesMentionThroughTheSameRules()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness);
        await harness.Graph.BlockAsync(Frank, "carolpets", null);

        var reply = await harness.Comments.CreateAsync(
            Carol, momentId, new CreateMomentCommentRequest("@ErinHome and @FrankHome and @ErinHome 😂", parentId));

        // Erin once, at the first span; Frank blocked Carol, so plain text.
        var span = Assert.Single(reply.Comment.Mentions);
        Assert.Equal((0, "@ErinHome".Length, "ErinHome"), (span.Start, span.Length, span.Household.Handle));
        var row = Assert.Single(await harness.Db.MomentCommentMentions.ToListAsync());
        Assert.Equal((reply.Comment.Id, Erin), (row.CommentId, row.MentionedUserId));

        var read = Assert.Single((await harness.Comments.GetRepliesAsync(momentId, parentId, null, null, null)).Items);
        Assert.Equal("ErinHome", Assert.Single(read.Mentions).Household.Handle);
    }

    // ---- delete and remove -----------------------------------------------------------

    [Fact]
    public async Task OnlyTheReplysAuthorOrTheMomentsAuthorMayTakeItDown()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness);
        var carols = await harness.Comments.CreateAsync(Carol, momentId, new CreateMomentCommentRequest("Carol's", parentId));
        var erins = await harness.Comments.CreateAsync(Erin, momentId, new CreateMomentCommentRequest("Erin's", parentId));

        // Bob wrote the Comment they are under; that is not a say over them.
        foreach (var outsider in new[] { Bob, Frank })
        {
            var error = await Assert.ThrowsAsync<ApiException>(() =>
                harness.Comments.DeleteAsync(outsider, momentId, carols.Comment.Id));
            Assert.Equal("comment_not_found", error.Code);
        }

        var deleted = await harness.Comments.DeleteAsync(Carol, momentId, carols.Comment.Id);
        Assert.Equal((parentId, 1, 2), (deleted.ParentCommentId, deleted.ParentReplyCount, deleted.CommentCount));

        var removed = await harness.Comments.DeleteAsync(Alice, momentId, erins.Comment.Id);
        Assert.Equal((parentId, 0, 1), (removed.ParentCommentId, removed.ParentReplyCount, removed.CommentCount));
        Assert.Equal(Alice, (await harness.Db.MomentComments.FindAsync(erins.Comment.Id))!.DeletedByUserId);

        // A top-level Comment's delete names no thread.
        var topLevel = await harness.Comments.DeleteAsync(Bob, momentId, parentId);
        Assert.Null(topLevel.ParentCommentId);
        Assert.Null(topLevel.ParentReplyCount);
    }

    [Fact]
    public async Task WhenTheParentsAuthorIsTheMomentsAuthorTheyMayRemoveReplies()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var parent = await harness.Comments.CreateAsync(Alice, momentId, new CreateMomentCommentRequest("My own Moment"));
        var reply = await harness.Comments.CreateAsync(
            Carol, momentId, new CreateMomentCommentRequest("Lovely", parent.Comment.Id));

        Assert.Equal("remove", Assert.Single((await harness.Comments.GetRepliesAsync(
            momentId, parent.Comment.Id, Alice, null, null)).Items).ViewerDeleteAction);
        await harness.Comments.DeleteAsync(Alice, momentId, reply.Comment.Id);
        Assert.Equal("", (await harness.Db.MomentComments.FindAsync(reply.Comment.Id))!.Body);
    }

    [Fact]
    public async Task DeletingTheParentHidesItsThreadAndLeavesItsRepliesAsTheyWere()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness);
        var reply = await harness.Comments.CreateAsync(
            Carol, momentId, new CreateMomentCommentRequest("@ErinHome look", parentId));

        var deleted = await harness.Comments.DeleteAsync(Bob, momentId, parentId);
        Assert.Equal(0, deleted.CommentCount);

        var row = await harness.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == reply.Comment.Id);
        Assert.Equal(("@ErinHome look", null, parentId), (row.Body, row.DeletedAt, row.ParentCommentId));
        Assert.Single(await harness.Db.MomentCommentMentions.Where(item => item.CommentId == reply.Comment.Id).ToListAsync());

        Assert.Empty((await harness.Comments.GetAsync(momentId, null, null, null)).Items);
        foreach (var household in new[] { Alice, Bob, Erin })
        {
            Assert.Empty((await harness.Notifications.GetAsync(household, null, null)).Items);
            Assert.Equal(0, (await harness.Notifications.GetUnreadSummaryAsync(household)).UnreadCount);
        }
    }

    // ---- reports and moderation -------------------------------------------------------

    [Fact]
    public async Task AWrittenReplyIsReportedAsACommentAgainstItsAuthor()
    {
        using var harness = await CreateAsync();
        var (momentId, parentId) = await ThreadAsync(harness);
        var reply = await harness.Comments.CreateAsync(
            Carol, momentId, new CreateMomentCommentRequest("Rude reply", parentId));

        await harness.Reports.SubmitAsync(
            Erin, new CreateCommunityReportRequest("comment", reply.Comment.Id.ToString(), "HarassmentOrBullying", null));

        var report = await harness.Db.CommunityReports.SingleAsync();
        Assert.Equal(
            (CommunityReportTargetType.Comment, reply.Comment.Id, Carol, "Rude reply", "CarolPets"),
            (report.TargetType, report.CommentId!.Value, report.ReportedUserId, report.SnapshotText, report.SnapshotHandle));
    }

    [Fact]
    public async Task RemoveCommentTakesDownAWrittenReplyAndItsActivityAndKeepsTheEvidence()
    {
        using var world = await ModerationWorld.CreateAsync();
        var harness = world.Harness;
        var parentId = world.CommentId;
        var reply = await harness.Comments.CreateAsync(
            Carol, world.MomentId, new CreateMomentCommentRequest("Nasty reply for @TanFamily", parentId));
        Assert.Contains(await harness.Db.OwnerNotifications.ToListAsync(),
            item => item.Type == OwnerNotificationType.MomentCommentReplied && item.CommentId == reply.Comment.Id);
        Assert.Single(await harness.Db.MomentCommentMentions.Where(item => item.CommentId == reply.Comment.Id).ToListAsync());

        await harness.Reports.SubmitAsync(
            Alice, new CreateCommunityReportRequest("comment", reply.Comment.Id.ToString(), "HarassmentOrBullying", null));
        world.Db.ChangeTracker.Clear();
        var report = await world.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.CommentId == reply.Comment.Id);

        var detail = await world.Queries.GetAsync(AdminCommunityModerationTests.ModeratorId, report.Id);
        Assert.Equal(parentId, detail.CurrentComment!.ParentCommentId);
        Assert.Equal("LimFamily", detail.CurrentComment.ParentComment!.Author.Handle);

        var before = await harness.Comments.GetAsync(world.MomentId, null, null, null);
        var result = await world.Moderation.RemoveCommentAsync(
            AdminCommunityModerationTests.ModeratorId, report.Id, world.Request(report));
        Assert.Equal(AdminCommunityModerationService.Applied, result.Outcome);
        world.Db.ChangeTracker.Clear();

        var row = await world.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == reply.Comment.Id);
        Assert.Equal(("", AdminCommunityModerationTests.ModeratorId), (row.Body, row.DeletedByUserId!.Value));
        Assert.Equal(ModerationWorld.CommentBody,
            (await world.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == parentId)).Body);
        Assert.Empty(await world.Db.MomentCommentMentions.Where(item => item.CommentId == reply.Comment.Id).ToListAsync());
        Assert.DoesNotContain(await world.Db.OwnerNotifications.ToListAsync(), item => item.CommentId == reply.Comment.Id);

        var after = await harness.Comments.GetAsync(world.MomentId, null, null, null);
        Assert.Equal(before.CommentCount - 1, after.CommentCount);
        Assert.Equal(0, after.Items.Single(item => item.Id == parentId).ReplyCount);

        var evidence = await world.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.Id == report.Id);
        Assert.Equal("Nasty reply for @TanFamily", evidence.SnapshotText);
        Assert.Equal(CommunityReportResolution.CommentRemoved, evidence.Resolution);
    }

    // ---- world --------------------------------------------------------------------

    private static async Task<SocialSurfaceHarness> CreateAsync()
    {
        var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddHouseholdAsync(Erin, "ErinHome", "The Ong Home", Guid.NewGuid(), "Pip");
        await harness.AddHouseholdAsync(Frank, "FrankHome", "The Koh Home", Guid.NewGuid(), "Rex");
        return harness;
    }

    /// <summary>Alice's Moment with Bob's top-level Comment on it.</summary>
    private static async Task<(Guid MomentId, Guid ParentId)> ThreadAsync(SocialSurfaceHarness harness)
    {
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var parent = await harness.Comments.CreateAsync(Bob, momentId, new CreateMomentCommentRequest("Nice photo!"));
        return (momentId, parent.Comment.Id);
    }
}
