using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;
using static MyPetLink.Api.Tests.SocialSurfaceHarness;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Phase 1 Community moderation taken directly — without a report — through the
/// real services, read back through the real Community, Activity, Share and
/// Safety surfaces: removing content, warnings, timed and permanent Community
/// restrictions that end on their own, account suspension kept apart from
/// all of it, and the household's append-only moderation history.
///
/// Cast (on top of <see cref="SocialSurfaceHarness"/>):
///   Alice  @tanfamily  Moment author        Bob    @limfamily  the household moderated
///   Carol  @carolpets  another household    Moderator          an Admin with a household of their own
/// </summary>
public sealed class CommunityModerationPhase1Tests
{
    private static readonly Guid Moderator = Guid.Parse("c9111111-1111-1111-1111-111111111111");
    private static readonly Guid ModeratorPet = Guid.Parse("c9211111-1111-1111-1111-111111111111");
    private const string Remark = "INTERNAL-REMARK-4471";
    private const string RudeWords = "RUDE-WORDS-9902";

    // ---- removing content ---------------------------------------------------------

    [Fact]
    public async Task RemovingAMomentHidesItEverywhereKeepsItForAuditAndTellsOnlyItsAuthor()
    {
        using var scene = await Scene.CreateAsync();
        var moment = await scene.Harness.AddMomentAsync(AliceId, MochiId, "Sunset walk", 10);
        await scene.Harness.Likes.LikeAsync(BobId, moment);

        var result = await scene.Enforcement.RemoveMomentAsync(
            Moderator, moment, new AdminCommunityRemoveContentRequest("SpamOrAdvertising", Remark));

        Assert.Equal("MomentRemoved", result.Action);
        // Not deleted: the row, its likes and its owner's view of it remain.
        var stored = await scene.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == moment);
        Assert.Null(stored.DeletedAt);
        Assert.Equal(Moderator, stored.ModeratedByUserId);
        Assert.True(await scene.Db.MomentLikes.AnyAsync(item => item.MomentId == moment));
        // Gone from every public surface.
        Assert.False(await scene.Db.PetMemories.SociallyVisible().AnyAsync(item => item.Id == moment));
        var unavailable = await Assert.ThrowsAsync<ApiException>(() => scene.Harness.PublicProfiles.GetMomentAsync(moment, CarolId));
        Assert.Equal(StatusCodes.Status404NotFound, unavailable.StatusCode);
        Assert.DoesNotContain(
            (await scene.Harness.PublicProfiles.GetOwnerMomentsAsync("tanfamily", null, 50, CarolId)).Items,
            item => item.Id == moment);

        // Admin keeps the whole record.
        var detail = await scene.Queries.GetMomentAsync(Moderator, moment);
        Assert.True(detail.Moment.Hidden);
        Assert.Equal(["RestoreMoment"], detail.AvailableActions);
        var history = Assert.Single(detail.History);
        Assert.Equal(("MomentRemoved", "SpamOrAdvertising", Remark), (history.Action, history.Reason, history.InternalRemark));
        Assert.Equal("Sunset walk", history.ContentSnapshot);
        Assert.Contains((await scene.Queries.ListMomentsAsync(new AdminCommunityMomentQuery { Status = "Removed" })).Items,
            item => item.Id == moment && item.Status == "Removed");

        // Alice is told, plainly, and only Alice.
        var notice = Assert.Single(await scene.NoticesAsync(AliceId));
        Assert.Equal(("MomentRemoved", "SpamOrAdvertising"), (notice.Moderation!.Action, notice.Moderation.Reason));
        Assert.Null(notice.Actor);
        Assert.Null(notice.MomentId);
        Assert.Null(notice.MomentTitle);
        Assert.Empty(await scene.NoticesAsync(BobId));
        await scene.AssertActivityNeverLeaksAsync(AliceId, "Sunset walk");
    }

    [Fact]
    public async Task RemovingACommentAndAReplyWipesTheirTextPubliclyAndKeepsItOnlyForModerators()
    {
        using var scene = await Scene.CreateAsync();
        var moment = await scene.Harness.AddMomentAsync(AliceId, MochiId, "Garden", 10);
        var comment = (await scene.Harness.Comments.CreateAsync(BobId, moment, new CreateMomentCommentRequest(RudeWords))).Comment.Id;
        var reply = (await scene.Harness.Comments.CreateAsync(CarolId, moment, new CreateMomentCommentRequest("REPLY-TEXT-1123", comment))).Comment.Id;

        var replyResult = await scene.Enforcement.RemoveCommentAsync(Moderator, reply, new("Harassment", Remark));
        var commentResult = await scene.Enforcement.RemoveCommentAsync(Moderator, comment, new("InappropriateContent", null));

        Assert.Equal(("ReplyRemoved", "CommentRemoved"), (replyResult.Action, commentResult.Action));
        foreach (var (id, author) in new[] { (comment, BobId), (reply, CarolId) })
        {
            // A soft removal: the row stays, the text is gone, MyPetLink removed it.
            var row = await scene.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == id);
            Assert.Equal("", row.Body);
            Assert.NotNull(row.DeletedAt);
            Assert.Equal(Moderator, row.DeletedByUserId);
            Assert.Equal(author, row.AuthorUserId);
            Assert.False(await scene.Db.MomentComments.VisibleComments(scene.Db, null).AnyAsync(item => item.Id == id));
        }

        var context = await scene.Queries.GetCommentAsync(Moderator, comment);
        Assert.True(context.Comment.Removed);
        Assert.Equal("MyPetLink", context.Comment.RemovedBy);
        Assert.Equal(RudeWords, Assert.Single(context.History).ContentSnapshot);
        Assert.Equal("REPLY-TEXT-1123",
            (await scene.Db.CommunityModerationActions.AsNoTracking().SingleAsync(item => item.CommentId == reply)).ContentSnapshot);
        Assert.Contains((await scene.Queries.ListCommentsAsync(new AdminCommunityCommentQuery { Status = "Removed" })).Items,
            item => item.Id == comment && item.Status == "RemovedByMyPetLink" && item.Body is null);

        Assert.Equal(("CommentRemoved", "InappropriateContent"),
            Assert.Single(await scene.NoticesAsync(BobId)).Moderation is { } bobNotice ? (bobNotice.Action, bobNotice.Reason) : default);
        Assert.Equal("ReplyRemoved", Assert.Single(await scene.NoticesAsync(CarolId)).Moderation!.Action);
        await scene.AssertActivityNeverLeaksAsync(BobId, RudeWords);
        await scene.AssertActivityNeverLeaksAsync(CarolId, "REPLY-TEXT-1123");

        // Never twice: no second record, no second notice.
        var again = await Assert.ThrowsAsync<ApiException>(() => scene.Enforcement.RemoveCommentAsync(Moderator, comment, new("Other", null)));
        Assert.Equal((StatusCodes.Status409Conflict, "content_already_removed"), (again.StatusCode, again.Code));
        Assert.Single(await scene.NoticesAsync(BobId));
        Assert.Equal(2, await scene.Db.CommunityModerationActions.CountAsync());
    }

    [Fact]
    public async Task ModeratorsSeeContentInContextWithoutPrivateMoments()
    {
        using var scene = await Scene.CreateAsync();
        var shared = await scene.Harness.AddMomentAsync(AliceId, MochiId, "Shared", 10);
        var privateMoment = await scene.Harness.AddMomentAsync(AliceId, MochiId, "Private diary", 11, MemoryVisibility.Private);
        var comment = (await scene.Harness.Comments.CreateAsync(BobId, shared, new CreateMomentCommentRequest("Lovely"))).Comment.Id;
        var reply = (await scene.Harness.Comments.CreateAsync(CarolId, shared, new CreateMomentCommentRequest("Agreed", comment))).Comment.Id;
        await scene.Harness.Likes.LikeAsync(CarolId, shared);

        var moments = await scene.Queries.ListMomentsAsync(new AdminCommunityMomentQuery());
        var listed = Assert.Single(moments.Items);
        Assert.Equal((shared, "Visible", 1, 2), (listed.Id, listed.Status, listed.LikeCount, listed.CommentCount));
        Assert.Equal("TanFamily", listed.Author.Handle);
        Assert.DoesNotContain(moments.Items, item => item.Id == privateMoment);
        var hiddenFromModerators = await Assert.ThrowsAsync<ApiException>(() => scene.Queries.GetMomentAsync(Moderator, privateMoment));
        Assert.Equal(StatusCodes.Status404NotFound, hiddenFromModerators.StatusCode);
        var notModeratable = await Assert.ThrowsAsync<ApiException>(() =>
            scene.Enforcement.RemoveMomentAsync(Moderator, privateMoment, new("Other", null)));
        Assert.Equal(StatusCodes.Status404NotFound, notModeratable.StatusCode);

        var replies = await scene.Queries.ListCommentsAsync(new AdminCommunityCommentQuery { Kind = "Reply" });
        Assert.Equal(reply, Assert.Single(replies.Items).Id);
        var context = await scene.Queries.GetCommentAsync(Moderator, reply);
        Assert.Equal(comment, context.Comment.ParentComment!.Id);
        Assert.Equal("Shared", context.Moment!.Title);
        Assert.Equal([reply], context.ThreadReplies.Select(item => item.Id));
        Assert.Equal(["RemoveComment"], context.AvailableActions);
    }

    // ---- warnings -------------------------------------------------------------------

    [Fact]
    public async Task WarningsAreIndividualRecordsWithACountAndANotice()
    {
        using var scene = await Scene.CreateAsync();
        var moment = await scene.Harness.AddMomentAsync(BobId, BuddyId, "Bob's walk", 10);
        var aliceMoment = await scene.Harness.AddMomentAsync(AliceId, MochiId, "Alice's day", 11);

        await scene.Enforcement.IssueWarningAsync(Moderator, BobId, new("Harassment", Remark, moment, null));
        scene.Time.Advance(TimeSpan.FromHours(1));
        await scene.Enforcement.IssueWarningAsync(Moderator, BobId, new("SpamOrAdvertising", null, null, null));

        var household = await scene.Queries.GetHouseholdAsync(Moderator, BobId);
        Assert.Equal(2, household.WarningCount);
        Assert.Equal(("Active", "On"), (household.AccountStatus, household.CommunityStatus));
        Assert.Equal(["WarningIssued", "WarningIssued"], household.History.Select(item => item.Action));
        var first = household.History.Last();
        Assert.Equal((moment, "Harassment", Remark, "Moderator One"), (first.MomentId!.Value, first.Reason, first.InternalRemark, first.PerformedByName));
        Assert.Equal(scene.Start, first.CreatedAt);

        var notices = await scene.NoticesAsync(BobId);
        Assert.Equal(2, notices.Length);
        Assert.All(notices, item => Assert.Equal("WarningIssued", item.Moderation!.Action));
        await scene.AssertActivityNeverLeaksAsync(BobId, "Bob's walk");

        // Never pinned to somebody else's content.
        var notTheirs = await Assert.ThrowsAsync<ApiException>(() =>
            scene.Enforcement.IssueWarningAsync(Moderator, BobId, new("Harassment", null, aliceMoment, null)));
        Assert.Equal((StatusCodes.Status422UnprocessableEntity, "warning_content_not_theirs"), (notTheirs.StatusCode, notTheirs.Code));
        var noReason = await Assert.ThrowsAsync<ApiException>(() =>
            scene.Enforcement.IssueWarningAsync(Moderator, BobId, new("3", null, null, null)));
        Assert.Equal(StatusCodes.Status400BadRequest, noReason.StatusCode);
        Assert.Equal(2, await scene.Db.CommunityModerationActions.CountAsync());
    }

    // ---- Community restriction ------------------------------------------------------

    [Fact]
    public async Task ARestrictedHouseholdCannotParticipateButCanStillTakeThingsBack()
    {
        using var scene = await Scene.CreateAsync();
        var aliceMoment = await scene.Harness.AddMomentAsync(AliceId, MochiId, "Beach", 10);
        var otherMoment = await scene.Harness.AddMomentAsync(AliceId, MochiId, "Park", 11);
        var bobMoment = await scene.Harness.AddMomentAsync(BobId, BuddyId, "Fetch", 12);
        var invitation = (await scene.Harness.Collaborations.InviteAsync(AliceId, aliceMoment, new("limfamily", ["buddy-pubbuddy"]))).Items.Single().Id;
        await scene.Harness.Likes.LikeAsync(BobId, otherMoment);
        await scene.Harness.Graph.FollowAsync(BobId, "carolpets");
        var ownComment = (await scene.Harness.Comments.CreateAsync(BobId, aliceMoment, new CreateMomentCommentRequest("Before"))).Comment.Id;
        var aliceComment = (await scene.Harness.Comments.CreateAsync(AliceId, aliceMoment, new CreateMomentCommentRequest("Hello"))).Comment.Id;

        var result = await scene.Enforcement.RestrictAsync(Moderator, BobId, new("Harassment", "7d", Remark));
        Assert.Equal(scene.Start.AddDays(7), result.RestrictedUntil);

        var attempts = new (string Name, Func<Task> Attempt)[]
        {
            ("comment", () => scene.Harness.Comments.CreateAsync(BobId, aliceMoment, new CreateMomentCommentRequest("Hi"))),
            ("reply", () => scene.Harness.Comments.CreateAsync(BobId, aliceMoment, new CreateMomentCommentRequest("Hi", aliceComment))),
            ("like", () => scene.Harness.Likes.LikeAsync(BobId, aliceMoment)),
            ("follow", () => scene.Harness.Graph.FollowAsync(BobId, "tanfamily")),
            ("invite", () => scene.Harness.Collaborations.InviteAsync(BobId, bobMoment, new("carolpets", ["shy-pubshy"]))),
            ("accept", () => scene.Harness.Collaborations.AcceptAsync(BobId, invitation, new(["buddy-pubbuddy"]))),
            ("report", () => scene.Harness.Reports.SubmitAsync(BobId, new CreateCommunityReportRequest("moment", aliceMoment.ToString(), "SpamOrScam", null))),
        };
        foreach (var (name, attempt) in attempts)
        {
            var refused = await Assert.ThrowsAsync<ApiException>(attempt);
            Assert.True(
                (StatusCodes.Status403Forbidden, "community_restricted") == (refused.StatusCode, refused.Code),
                $"{name}: {refused.StatusCode} {refused.Code}");
            Assert.Equal(CommunityModeration.TemporarilyRestrictedMessage, refused.Message);
            Assert.Equal(scene.Start.AddDays(7), DateTimeOffset.Parse(refused.Details![CommunityModeration.RestrictedUntilDetail].Single()));
            Assert.DoesNotContain(Remark, refused.Message);
        }

        // Reducing your own footprint is always allowed.
        await scene.Harness.Likes.UnlikeAsync(BobId, otherMoment);
        await scene.Harness.Graph.UnfollowAsync(BobId, "carolpets");
        await scene.Harness.Comments.DeleteAsync(BobId, aliceMoment, ownComment);
        await scene.Harness.Collaborations.DeclineAsync(BobId, invitation);
        // So is protecting yourself: blocking is not participation.
        await scene.Harness.Graph.BlockAsync(BobId, "carolpets", null);
        Assert.True(await scene.Db.OwnerBlocks.AnyAsync(item => item.BlockerUserId == BobId && item.BlockedUserId == CarolId));

        Assert.False(await scene.Db.MomentLikes.AnyAsync(item => item.UserId == BobId));
        Assert.False(await scene.Db.OwnerFollows.AnyAsync(item => item.FollowerUserId == BobId));
        Assert.Single(await scene.Db.MomentComments.Where(item => item.AuthorUserId == BobId).ToListAsync());

        // Their own Safety and Share Profiles never depend on Community.
        Assert.Equal("Buddy", (await scene.Harness.QrSafety.GetBySafetyCodeAsync("s-pubbuddy")).Name);
        Assert.Equal(UserStatus.Active, (await scene.Db.Users.AsNoTracking().SingleAsync(item => item.Id == BobId)).Status);

        var notice = Assert.Single(await scene.NoticesAsync(BobId));
        Assert.Equal(("CommunityRestricted", "Harassment", scene.Start.AddDays(7)),
            (notice.Moderation!.Action, notice.Moderation.Reason, notice.Moderation.RestrictedUntil));
    }

    [Fact]
    public async Task ATimedRestrictionEndsOnItsOwnAndRestoresTheOwnersChoice()
    {
        using var scene = await Scene.CreateAsync();
        var moment = await scene.Harness.AddMomentAsync(AliceId, MochiId, "Beach", 10);
        await scene.Enforcement.RestrictAsync(Moderator, BobId, new("SpamOrAdvertising", "24h", null));
        await scene.Enforcement.RestrictAsync(Moderator, CarolId, new("SpamOrAdvertising", "24h", null));
        // Carol switches Community off while restricted; that choice is kept.
        var carol = await scene.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == CarolId);
        carol.CommunityEnabledBeforeRestriction = false;
        await scene.Db.SaveChangesAsync();
        scene.Db.ChangeTracker.Clear();

        scene.Time.Advance(TimeSpan.FromHours(23));
        Assert.Equal(0, await scene.Expiry.ExpireDueRestrictionsAsync(50));
        await Assert.ThrowsAsync<ApiException>(() => scene.Harness.Likes.LikeAsync(BobId, moment));

        scene.Time.Advance(TimeSpan.FromHours(1));
        Assert.Equal(2, await scene.Expiry.ExpireDueRestrictionsAsync(50));
        Assert.Equal(0, await scene.Expiry.ExpireDueRestrictionsAsync(50));

        var bob = await scene.Db.OwnerSocialProfiles.AsNoTracking().SingleAsync(item => item.UserId == BobId);
        Assert.Null(bob.CommunityRestrictedAt);
        Assert.Null(bob.CommunityRestrictedUntil);
        Assert.True(bob.IsSocialEnabled);
        Assert.False((await scene.Db.OwnerSocialProfiles.AsNoTracking().SingleAsync(item => item.UserId == CarolId)).IsSocialEnabled);
        await scene.Harness.Likes.LikeAsync(BobId, moment);

        // Ended by nobody, and on the record that way.
        var expired = await scene.Db.CommunityModerationActions.AsNoTracking()
            .SingleAsync(item => item.TargetUserId == BobId && item.ActionType == CommunityModerationActionType.CommunityRestrictionExpired);
        Assert.Null(expired.PerformedByUserId);
        Assert.Equal(scene.Start.AddHours(24), expired.CreatedAt);
        Assert.Equal(2, await scene.Db.AuditLogs.CountAsync(item =>
            item.Action == CommunityModerationAudit.HouseholdRestrictionExpired && item.ActorType == ActorType.System && item.ActorId == null));
        Assert.Equal("On", (await scene.Queries.GetHouseholdAsync(Moderator, BobId)).CommunityStatus);
    }

    [Fact]
    public async Task ARestrictionGivenANewEndIsNotEndedEarlyAndAPermanentOneNeverEndsOnItsOwn()
    {
        using var scene = await Scene.CreateAsync();
        var first = await scene.Enforcement.RestrictAsync(Moderator, BobId, new("Harassment", "24h", null));
        scene.Time.Advance(TimeSpan.FromHours(12));
        var escalated = await scene.Enforcement.RestrictAsync(Moderator, BobId, new("RepeatedViolations", "permanent", null));

        Assert.Equal(scene.Start.AddHours(24), first.RestrictedUntil);
        Assert.Null(escalated.RestrictedUntil);
        var profile = await scene.Db.OwnerSocialProfiles.AsNoTracking().SingleAsync(item => item.UserId == BobId);
        Assert.Equal(scene.Start, profile.CommunityRestrictedAt);
        Assert.Null(profile.CommunityRestrictedUntil);
        Assert.True(profile.CommunityEnabledBeforeRestriction);

        scene.Time.Advance(TimeSpan.FromDays(400));
        Assert.Equal(0, await scene.Expiry.ExpireDueRestrictionsAsync(50));
        var refused = await Assert.ThrowsAsync<ApiException>(() => scene.Harness.Graph.FollowAsync(BobId, "tanfamily"));
        Assert.Equal(CommunityModeration.RestrictedMessage, refused.Message);
        Assert.Null(refused.Details);

        var household = await scene.Queries.GetHouseholdAsync(Moderator, BobId);
        Assert.Equal("Suspended", household.CommunityStatus);
        Assert.Equal("Active", household.AccountStatus);
        Assert.Contains("LiftCommunityRestriction", household.AvailableActions);
        var notices = await scene.NoticesAsync(BobId);
        Assert.Equal(2, notices.Length);
        Assert.Contains(notices, item => item.Moderation!.RestrictedUntil is null);

        await scene.Enforcement.LiftRestrictionAsync(Moderator, BobId, new(Remark));
        Assert.True((await scene.Db.OwnerSocialProfiles.AsNoTracking().SingleAsync(item => item.UserId == BobId)).IsSocialEnabled);
        await scene.Harness.Graph.FollowAsync(BobId, "tanfamily");
        var notRestricted = await Assert.ThrowsAsync<ApiException>(() => scene.Enforcement.LiftRestrictionAsync(Moderator, BobId, null));
        Assert.Equal("household_not_restricted", notRestricted.Code);
        // Lifting is history too, but the household is not sent anything for it.
        Assert.Equal(
            ["CommunityRestrictionLifted", "CommunityRestricted", "CommunityRestricted"],
            (await scene.Queries.GetHouseholdAsync(Moderator, BobId)).History.Select(item => item.Action));
        Assert.Equal(2, (await scene.NoticesAsync(BobId)).Length);
    }

    // ---- Moments while restricted -----------------------------------------------------

    [Fact]
    public async Task ARestrictedHouseholdKeepsPrivateMomentsButCannotPublishAnything()
    {
        using var scene = await Scene.CreateAsync();
        var memories = scene.Memories;
        var alreadyPublic = (await memories.CreateAsync(BobId, BuddyId, Moment("Walk", MemoryVisibility.Public))).Id;
        await scene.Enforcement.RestrictAsync(Moderator, BobId, new("Harassment", "7d", null));

        // Private use is untouched.
        var diary = (await memories.CreateAsync(BobId, BuddyId, Moment("Diary", MemoryVisibility.Private))).Id;
        await memories.UpdateAsync(BobId, diary, Edit(caption: "Still private"));
        Assert.Equal("Still private", (await scene.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == diary)).Caption);

        // Anything that would be public is refused, by every route that writes one.
        foreach (var (name, attempt) in new (string, Func<Task>)[]
                 {
                     ("create public", () => memories.CreateAsync(BobId, BuddyId, Moment("Shout", MemoryVisibility.Public))),
                     ("private to public", () => memories.UpdateAsync(BobId, diary, Edit(visibility: MemoryVisibility.Public))),
                     ("edit a public Moment", () => memories.UpdateAsync(BobId, alreadyPublic, Edit(caption: "Rude words"))),
                 })
        {
            var refused = await Assert.ThrowsAsync<ApiException>(attempt);
            Assert.True(refused.Code == "community_restricted", $"{name}: {refused.Code}");
        }

        Assert.Equal(1, await scene.Db.PetMemories.CountAsync(item => item.AuthorUserId == BobId && item.Visibility == MemoryVisibility.Private));
        Assert.Equal(MemoryVisibility.Private, (await scene.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == diary)).Visibility);
        Assert.Equal("Walk", (await scene.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == alreadyPublic)).Title);
        Assert.Null((await scene.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == alreadyPublic)).Caption);

        // Reducing exposure is always allowed: make the public one private, then archive (delete) it.
        await memories.UpdateAsync(BobId, alreadyPublic, Edit(visibility: MemoryVisibility.Private));
        await memories.ArchiveAsync(BobId, alreadyPublic);
        await memories.ArchiveAsync(BobId, diary);
        Assert.NotNull((await scene.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == alreadyPublic)).ArchivedAt);
        Assert.NotNull((await scene.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == diary)).ArchivedAt);
    }

    [Fact]
    public async Task PublishingReturnsWhenTheRestrictionEndsOrIsLifted()
    {
        using var scene = await Scene.CreateAsync();
        await scene.Enforcement.RestrictAsync(Moderator, BobId, new("Harassment", "24h", null));
        await scene.Enforcement.RestrictAsync(Moderator, CarolId, new("Harassment", "permanent", null));
        var bobDraft = (await scene.Memories.CreateAsync(BobId, BuddyId, Moment("Draft", MemoryVisibility.Private))).Id;

        scene.Time.Advance(TimeSpan.FromHours(24));
        await scene.Expiry.ExpireDueRestrictionsAsync(50);
        await scene.Enforcement.LiftRestrictionAsync(Moderator, CarolId, null);

        await scene.Memories.UpdateAsync(BobId, bobDraft, Edit(visibility: MemoryVisibility.Public));
        await scene.Memories.CreateAsync(CarolId, ShyId, Moment("Hop", MemoryVisibility.Public));
        Assert.Equal(2, await scene.Db.PetMemories.CountAsync(item => item.Visibility == MemoryVisibility.Public));
    }

    private static CreateMemoryRequest Moment(string title, MemoryVisibility visibility) =>
        new(title, new DateOnly(2026, 10, 1), "Memory", null, visibility, null, null, null, null);

    private static UpdateMemoryRequest Edit(MemoryVisibility? visibility = null, string? caption = null) =>
        new(null, null, null, caption, visibility, null, null, null, null);

    // ---- account suspension -----------------------------------------------------------

    [Fact]
    public async Task SuspendingAnAccountIsSeparateFromCommunityRestriction()
    {
        using var scene = await Scene.CreateAsync();
        scene.Db.RefreshTokens.AddRange(
            new RefreshToken { UserId = BobId, TokenHash = "bob-session", ExpiresAt = scene.Start.AddDays(10) },
            new RefreshToken { UserId = CarolId, TokenHash = "carol-session", ExpiresAt = scene.Start.AddDays(10) });
        await scene.Db.SaveChangesAsync();

        await scene.Enforcement.RestrictAsync(Moderator, CarolId, new("Harassment", "7d", null));
        var suspended = await scene.Enforcement.SuspendAccountAsync(Moderator, BobId, new AdminAccountSuspensionRequest("ScamOrFraud", Remark));

        Assert.Equal("AccountSuspended", suspended.Action);
        var bob = await scene.Db.Users.AsNoTracking().SingleAsync(item => item.Id == BobId);
        var carol = await scene.Db.Users.AsNoTracking().SingleAsync(item => item.Id == CarolId);
        Assert.Equal((UserStatus.Suspended, UserStatus.Active), (bob.Status, carol.Status));
        // Suspension is not a Community restriction, and a restriction is not a suspension.
        Assert.Null((await scene.Db.OwnerSocialProfiles.AsNoTracking().SingleAsync(item => item.UserId == BobId)).CommunityRestrictedAt);
        Assert.NotNull((await scene.Db.OwnerSocialProfiles.AsNoTracking().SingleAsync(item => item.UserId == CarolId)).CommunityRestrictedAt);
        Assert.NotNull((await scene.Db.RefreshTokens.AsNoTracking().SingleAsync(item => item.TokenHash == "bob-session")).RevokedAt);
        Assert.Null((await scene.Db.RefreshTokens.AsNoTracking().SingleAsync(item => item.TokenHash == "carol-session")).RevokedAt);

        // A finder can still reach a suspended owner's pet; nobody is sent a notice they cannot read.
        Assert.Equal("Buddy", (await scene.Harness.QrSafety.GetBySafetyCodeAsync("s-pubbuddy")).Name);
        Assert.Empty(await scene.NoticesAsync(BobId));
        var household = await scene.Queries.GetHouseholdAsync(Moderator, BobId);
        Assert.Equal(("Suspended", "On"), (household.AccountStatus, household.CommunityStatus));
        Assert.Contains("ReinstateAccount", household.AvailableActions);
        Assert.DoesNotContain("SuspendAccount", household.AvailableActions);

        var twice = await Assert.ThrowsAsync<ApiException>(() => scene.Enforcement.SuspendAccountAsync(Moderator, BobId, new("ScamOrFraud", null)));
        Assert.Equal("account_already_suspended", twice.Code);
        await scene.Enforcement.ReinstateAccountAsync(Moderator, BobId, null);
        Assert.Equal(UserStatus.Active, (await scene.Db.Users.AsNoTracking().SingleAsync(item => item.Id == BobId)).Status);
        Assert.Equal(
            [CommunityModerationAudit.AccountReinstated, CommunityModerationAudit.AccountSuspended],
            await scene.Db.AuditLogs.Where(item => item.EntityId == BobId).OrderByDescending(item => item.CreatedAt).Select(item => item.Action).ToListAsync());
    }

    [Fact]
    public async Task AdminAccountsAreNeverSuspendedHere()
    {
        using var scene = await Scene.CreateAsync();
        scene.Db.AdminUsers.Add(new AdminUser { UserId = CarolId, Role = AdminRole.OwnerSupport, IsActive = true });
        await scene.Db.SaveChangesAsync();

        var refused = await Assert.ThrowsAsync<ApiException>(() => scene.Enforcement.SuspendAccountAsync(Moderator, CarolId, new("SecurityAbuse", null)));

        Assert.Equal((StatusCodes.Status403Forbidden, "account_is_admin"), (refused.StatusCode, refused.Code));
        Assert.Equal(UserStatus.Active, (await scene.Db.Users.AsNoTracking().SingleAsync(item => item.Id == CarolId)).Status);
        Assert.DoesNotContain("SuspendAccount", (await scene.Queries.GetHouseholdAsync(Moderator, CarolId)).AvailableActions);
    }

    // ---- boundaries -------------------------------------------------------------------

    [Fact]
    public async Task AModeratorNeverActsOnTheirOwnHousehold()
    {
        using var scene = await Scene.CreateAsync();
        var own = await scene.Harness.AddMomentAsync(Moderator, ModeratorPet, "Mine", 10);
        var onOwn = (await scene.Harness.Comments.CreateAsync(BobId, own, new CreateMomentCommentRequest("Hi"))).Comment.Id;

        foreach (var attempt in new Func<Task>[]
                 {
                     () => scene.Enforcement.RemoveMomentAsync(Moderator, own, new("Other", null)),
                     () => scene.Enforcement.RemoveCommentAsync(Moderator, onOwn, new("Other", null)),
                     () => scene.Enforcement.IssueWarningAsync(Moderator, Moderator, new("Other", null, null, null)),
                     () => scene.Enforcement.RestrictAsync(Moderator, Moderator, new("Other", "24h", null)),
                     () => scene.Enforcement.SuspendAccountAsync(Moderator, Moderator, new("Other", null)),
                     () => scene.Queries.GetHouseholdAsync(Moderator, Moderator),
                 })
        {
            var refused = await Assert.ThrowsAsync<ApiException>(attempt);
            Assert.Equal("moderation_conflict_of_interest", refused.Code);
        }

        Assert.Empty(await scene.Db.CommunityModerationActions.ToListAsync());
    }

    [Fact]
    public async Task GuessedOrMismatchedIdsRevealNothingAndChangeNothing()
    {
        using var scene = await Scene.CreateAsync();
        var stranger = Guid.NewGuid();

        foreach (var (attempt, code) in new (Func<Task>, string)[]
                 {
                     (() => scene.Enforcement.RemoveMomentAsync(Moderator, stranger, new("Other", null)), "community_content_not_found"),
                     (() => scene.Enforcement.RemoveCommentAsync(Moderator, stranger, new("Other", null)), "community_content_not_found"),
                     (() => scene.Queries.GetMomentAsync(Moderator, stranger), "community_content_not_found"),
                     (() => scene.Queries.GetCommentAsync(Moderator, stranger), "community_content_not_found"),
                     (() => scene.Enforcement.IssueWarningAsync(Moderator, stranger, new("Other", null, null, null)), "owner_not_found"),
                     (() => scene.Enforcement.RestrictAsync(Moderator, stranger, new("Other", "24h", null)), "owner_not_found"),
                     (() => scene.Enforcement.SuspendAccountAsync(Moderator, stranger, new("Other", null)), "owner_not_found"),
                     (() => scene.Queries.GetHouseholdAsync(Moderator, stranger), "owner_not_found"),
                 })
        {
            var refused = await Assert.ThrowsAsync<ApiException>(attempt);
            Assert.Equal((StatusCodes.Status404NotFound, code), (refused.StatusCode, refused.Code));
        }

        var badDuration = await Assert.ThrowsAsync<ApiException>(() => scene.Enforcement.RestrictAsync(Moderator, BobId, new("Other", "forever-ish", null)));
        Assert.Equal(StatusCodes.Status400BadRequest, badDuration.StatusCode);
        Assert.Empty(await scene.Db.CommunityModerationActions.ToListAsync());
        Assert.Null((await scene.Db.OwnerSocialProfiles.AsNoTracking().SingleAsync(item => item.UserId == BobId)).CommunityRestrictedAt);
    }

    [Fact]
    public async Task HistoryIsAppendOnlyAcrossEveryKindOfAction()
    {
        using var scene = await Scene.CreateAsync();
        var moment = await scene.Harness.AddMomentAsync(BobId, BuddyId, "Fetch", 10);

        await scene.Enforcement.IssueWarningAsync(Moderator, BobId, new("Harassment", null, null, null));
        scene.Time.Advance(TimeSpan.FromMinutes(1));
        await scene.Enforcement.RemoveMomentAsync(Moderator, moment, new("SpamOrAdvertising", null));
        scene.Time.Advance(TimeSpan.FromMinutes(1));
        await scene.Enforcement.RestoreMomentAsync(Moderator, moment, null);
        scene.Time.Advance(TimeSpan.FromMinutes(1));
        await scene.Enforcement.RestrictAsync(Moderator, BobId, new("Harassment", "24h", null));
        var snapshot = await scene.Db.CommunityModerationActions.AsNoTracking().OrderBy(item => item.CreatedAt).ToListAsync();
        scene.Time.Advance(TimeSpan.FromDays(1));
        await scene.Expiry.ExpireDueRestrictionsAsync(50);
        scene.Time.Advance(TimeSpan.FromMinutes(1));
        await scene.Enforcement.SuspendAccountAsync(Moderator, BobId, new("ScamOrFraud", null));

        var all = await scene.Db.CommunityModerationActions.AsNoTracking().ToListAsync();
        Assert.Equal(6, all.Count);
        foreach (var before in snapshot)
        {
            var now = all.Single(item => item.Id == before.Id);
            Assert.Equal(
                (before.ActionType, before.Reason, before.InternalRemark, before.PerformedByUserId, before.CreatedAt, before.RestrictedUntil),
                (now.ActionType, now.Reason, now.InternalRemark, now.PerformedByUserId, now.CreatedAt, now.RestrictedUntil));
        }

        Assert.Equal(
            ["AccountSuspended", "CommunityRestrictionExpired", "CommunityRestricted", "MomentRestored", "MomentRemoved", "WarningIssued"],
            (await scene.Queries.GetHouseholdAsync(Moderator, BobId)).History.Select(item => item.Action));
    }

    [Fact]
    public async Task ModerationNoticesAreReadLikeAnyOtherActivity()
    {
        using var scene = await Scene.CreateAsync();
        var moment = await scene.Harness.AddMomentAsync(BobId, BuddyId, "Fetch", 10);
        await scene.Harness.Likes.LikeAsync(AliceId, moment);
        await scene.Enforcement.IssueWarningAsync(Moderator, BobId, new("Harassment", null, null, null));

        var page = await scene.Harness.Notifications.GetAsync(BobId, null, 50);
        Assert.Equal(2, page.UnreadCount);
        Assert.Contains(page.Items, item => item.Type == "MomentLiked" && item.Actor!.Handle == "TanFamily");
        Assert.Contains(page.Items, item => item.Type == "CommunityModerationNotice" && item.Actor is null);

        var summary = await scene.Harness.Notifications.MarkReadAsync(BobId, new MarkNotificationsReadRequest(null));
        Assert.Equal(0, summary.UnreadCount);
        // Somebody else's notice can never be read or marked by id.
        var aliceView = await scene.Harness.Notifications.GetAsync(AliceId, null, 50);
        Assert.DoesNotContain(aliceView.Items, item => item.Type == "CommunityModerationNotice");
    }

    // ---- harness ----------------------------------------------------------------------

    private sealed class Scene : IDisposable
    {
        private Scene(SocialSurfaceHarness harness, FakeTimeProvider time)
        {
            Harness = harness;
            Time = time;
            Start = time.GetUtcNow();
            var audit = new AuditLogService(harness.Db, new HttpContextAccessor());
            Enforcement = new AdminCommunityEnforcementService(harness.Db, harness.Notifications, audit, time);
            Queries = new AdminCommunityContentQueryService(harness.Db, Options.Create(new CloudflareR2Options()));
            Expiry = new CommunityRestrictionExpiryService(
                harness.Db, audit, time, NullLogger<CommunityRestrictionExpiryService>.Instance);
            Memories = new MemoryService(harness.Db, Options.Create(new CloudflareR2Options()));
        }

        public MemoryService Memories { get; }

        public SocialSurfaceHarness Harness { get; }
        public Data.MyPetLinkDbContext Db => Harness.Db;
        public FakeTimeProvider Time { get; }
        public DateTimeOffset Start { get; }
        public AdminCommunityEnforcementService Enforcement { get; }
        public AdminCommunityContentQueryService Queries { get; }
        public CommunityRestrictionExpiryService Expiry { get; }

        public static async Task<Scene> CreateAsync()
        {
            var harness = await SocialSurfaceHarness.CreateAsync();
            AddOwner(harness.Db, Moderator, "moderator@example.com", "Moderator One", "ModOne", "Mod One", true, false);
            await harness.Db.SaveChangesAsync();
            AddPet(harness.Db, ModeratorPet, Moderator, "Pebble", "Dog", true, false);
            await harness.Db.SaveChangesAsync();
            harness.Db.ChangeTracker.Clear();
            var time = new FakeTimeProvider(new DateTimeOffset(2026, 10, 8, 2, 0, 0, TimeSpan.Zero));
            return new Scene(harness, time);
        }

        public async Task<OwnerNotificationResponse[]> NoticesAsync(Guid recipientId) =>
            (await Harness.Notifications.GetAsync(recipientId, null, 50)).Items
                .Where(item => item.Type == "CommunityModerationNotice")
                .ToArray();

        /// <summary>
        /// Everything the household's Activity hands them, serialized: never the
        /// moderator's remark, who decided, or the removed content.
        /// </summary>
        public async Task AssertActivityNeverLeaksAsync(Guid recipientId, string removedContent)
        {
            var json = JsonSerializer.Serialize(await Harness.Notifications.GetAsync(recipientId, null, 50));
            Assert.DoesNotContain(Remark, json);
            Assert.DoesNotContain(removedContent, json);
            Assert.DoesNotContain("Moderator One", json);
            Assert.DoesNotContain("ModOne", json);
            Assert.DoesNotContain(Moderator.ToString(), json, StringComparison.OrdinalIgnoreCase);
        }

        public void Dispose() => Harness.Dispose();
    }
}
