using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

public sealed class MomentCommentTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;
    private static readonly Guid Carol = SocialSurfaceHarness.CarolId;
    private static readonly Guid Dave = SocialSurfaceHarness.DaveId;
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;

    [Fact]
    public void BodyRules_NormalizePlainTextAndPreserveEmojiJoiners()
    {
        var value = MomentCommentBodyRules.RequireValid(
            " \tHello\r\n\u202Eworld\u0007\n👩‍👩‍👧‍👦 ");

        Assert.Equal("Hello\nworld\n👩‍👩‍👧‍👦", value);
        Assert.Equal(500, MomentCommentBodyRules.RequireValid(new string('a', 500)).Length);
        Assert.Equal(
            StatusCodes.Status422UnprocessableEntity,
            Assert.Throws<ApiException>(() =>
                MomentCommentBodyRules.RequireValid(new string('a', 501))).StatusCode);
        Assert.Throws<ApiException>(() => MomentCommentBodyRules.RequireValid("\u200B\u2066"));
    }

    [Fact]
    public async Task AnonymousCanReadButNeedsSignInToComment()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await harness.Comments.CreateAsync(
            Bob, momentId, new CreateMomentCommentRequest("Lovely day!"));

        var page = await harness.Comments.GetAsync(momentId, null, null, null);

        Assert.Equal("Lovely day!", Assert.Single(page.Items).Body);
        Assert.Equal(1, page.CommentCount);
        Assert.False(page.Viewer.CanComment);
        Assert.Equal("signIn", page.Viewer.Requirement);
    }

    [Fact]
    public async Task CreateRequiresUsableCommunityIdentityAndVisibleMoment()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        var missing = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.CreateAsync(
                Dave, momentId, new CreateMomentCommentRequest("Hello")));
        Assert.Equal("community_profile_required", missing.Code);

        await harness.Graph.BlockAsync(Alice, "limfamily", null);
        var blocked = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.CreateAsync(
                Bob, momentId, new CreateMomentCommentRequest("Hello")));
        Assert.Equal(StatusCodes.Status404NotFound, blocked.StatusCode);
    }

    [Fact]
    public async Task AnonymousAndInactiveAccountsCannotCreateComments()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        var anonymous = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.CreateAsync(
                null, momentId, new CreateMomentCommentRequest("Hello")));
        Assert.Equal(StatusCodes.Status401Unauthorized, anonymous.StatusCode);

        (await harness.Db.Users.FindAsync(Bob))!.Status = UserStatus.Suspended;
        await harness.Db.SaveChangesAsync();
        var inactive = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.CreateAsync(
                Bob, momentId, new CreateMomentCommentRequest("Hello")));
        Assert.Equal(StatusCodes.Status403Forbidden, inactive.StatusCode);
        Assert.Equal("account_inactive", inactive.Code);
    }

    [Fact]
    public async Task HiddenMomentsAlwaysReturnTheSameSafeNotFound()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var privateId = await harness.AddMomentAsync(
            Alice, Mochi, "Private", 10, MemoryVisibility.Private);
        var archivedId = await harness.AddMomentAsync(
            Alice, Mochi, "Archived", 20, archived: true);

        foreach (var momentId in new[] { privateId, archivedId, Guid.NewGuid() })
        {
            var error = await Assert.ThrowsAsync<ApiException>(() =>
                harness.Comments.GetAsync(momentId, Bob, null, null));
            Assert.Equal(StatusCodes.Status404NotFound, error.StatusCode);
            Assert.Equal("social_moment_not_found", error.Code);
        }

        var publicId = await harness.AddMomentAsync(Alice, Mochi, "Public", 30);
        await harness.SetOwnerSocialAsync(Alice, false);
        var ownerOff = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.GetAsync(publicId, null, null, null));
        Assert.Equal("social_moment_not_found", ownerOff.Code);
    }

    [Fact]
    public async Task BlockedViewerGetsMomentNotFoundWithoutBlockDisclosure()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await harness.Comments.CreateAsync(
            Carol, momentId, new CreateMomentCommentRequest("Hello"));
        await harness.Graph.BlockAsync(Bob, "tanfamily", null);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.GetAsync(momentId, Bob, null, null));

        Assert.Equal(StatusCodes.Status404NotFound, error.StatusCode);
        Assert.Equal("social_moment_not_found", error.Code);
    }

    [Fact]
    public async Task RecentNormalizedRetryReusesTheComment()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        var first = await harness.Comments.CreateAsync(
            Bob, momentId, new CreateMomentCommentRequest(" Hello\r\nthere "));
        var retry = await harness.Comments.CreateAsync(
            Bob, momentId, new CreateMomentCommentRequest("Hello\nthere"));

        Assert.Equal(first.Comment.Id, retry.Comment.Id);
        Assert.Single(await harness.Db.MomentComments.ToListAsync());
        Assert.Single(await harness.Db.OwnerNotifications.ToListAsync());
    }

    [Fact]
    public async Task CommentsPageLoadsNewestAndUsesStableCursor()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        for (var index = 0; index < 5; index += 1)
        {
            harness.Db.MomentComments.Add(new MomentComment
            {
                MomentId = momentId,
                AuthorUserId = Bob,
                Body = $"Comment {index}",
                CreatedAt = new DateTimeOffset(2026, 9, 20, 12, 0, 0, TimeSpan.Zero)
            });
        }
        await harness.Db.SaveChangesAsync();

        var seen = new List<Guid>();
        string? cursor = null;
        do
        {
            var page = await harness.Comments.GetAsync(momentId, Carol, cursor, 2);
            seen.AddRange(page.Items.Select(item => item.Id));
            cursor = page.NextCursor;
        }
        while (cursor is not null);

        Assert.Equal(5, seen.Count);
        Assert.Equal(5, seen.Distinct().Count());
    }

    [Fact]
    public async Task BlockBetweenCommenterAndAuthorHidesStoredCommentFromEveryone()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var created = await harness.Comments.CreateAsync(
            Bob, momentId, new CreateMomentCommentRequest("Hello"));

        await harness.Graph.BlockAsync(Bob, "tanfamily", null);

        Assert.Empty((await harness.Comments.GetAsync(momentId, Carol, null, null)).Items);
        Assert.NotNull(await harness.Db.MomentComments.FindAsync(created.Comment.Id));

        await harness.Graph.UnblockAsync(Bob, "tanfamily");
        Assert.Single((await harness.Comments.GetAsync(momentId, Carol, null, null)).Items);
    }

    [Fact]
    public async Task CommentAuthorStateControlsVisibilityButDiscoverabilityDoesNot()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await harness.Comments.CreateAsync(
            Bob, momentId, new CreateMomentCommentRequest("Hello"));

        await harness.SetOwnerDiscoverableAsync(Bob, false);
        Assert.Single((await harness.Comments.GetAsync(momentId, null, null, null)).Items);

        await harness.SetOwnerSocialAsync(Bob, false);
        Assert.Empty((await harness.Comments.GetAsync(momentId, null, null, null)).Items);

        await harness.SetOwnerSocialAsync(Bob, true);
        var profile = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == Bob);
        profile.DisplayName = null;
        await harness.Db.SaveChangesAsync();
        Assert.Empty((await harness.Comments.GetAsync(momentId, null, null, null)).Items);
    }

    [Fact]
    public async Task AuthorDeleteAndMomentOwnerRemoveScrubBody()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var own = await harness.Comments.CreateAsync(
            Bob, momentId, new CreateMomentCommentRequest("Delete me"));
        var remove = await harness.Comments.CreateAsync(
            Carol, momentId, new CreateMomentCommentRequest("Remove me"));

        await harness.Comments.DeleteAsync(Bob, momentId, own.Comment.Id);
        await harness.Comments.DeleteAsync(Alice, momentId, remove.Comment.Id);
        await harness.Comments.DeleteAsync(Alice, momentId, remove.Comment.Id);

        var rows = await harness.Db.MomentComments.OrderBy(item => item.CreatedAt).ToListAsync();
        Assert.All(rows, row =>
        {
            Assert.Equal("", row.Body);
            Assert.NotNull(row.DeletedAt);
            Assert.NotNull(row.DeletedByUserId);
        });
        Assert.Empty((await harness.Comments.GetAsync(momentId, null, null, null)).Items);
    }

    [Fact]
    public async Task CommentActivityCoalescesAndDeleteRetargetsThenWithdraws()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var first = await harness.Comments.CreateAsync(
            Bob, momentId, new CreateMomentCommentRequest("First"));
        var second = await harness.Comments.CreateAsync(
            Bob, momentId, new CreateMomentCommentRequest("Second"));

        var notification = Assert.Single(
            (await harness.Notifications.GetAsync(Alice, null, null)).Items);
        Assert.Equal("MomentCommented", notification.Type);
        Assert.Equal(second.Comment.Id, notification.CommentId);

        await harness.Comments.DeleteAsync(Bob, momentId, second.Comment.Id);
        notification = Assert.Single(
            (await harness.Notifications.GetAsync(Alice, null, null)).Items);
        Assert.Equal(first.Comment.Id, notification.CommentId);

        await harness.Comments.DeleteAsync(Bob, momentId, first.Comment.Id);
        Assert.Empty((await harness.Notifications.GetAsync(Alice, null, null)).Items);
    }

    [Fact]
    public async Task CommentingOnYourOwnMomentCreatesNoActivity()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        await harness.Comments.CreateAsync(
            Alice, momentId, new CreateMomentCommentRequest("A note to myself"));

        Assert.Empty(await harness.Db.OwnerNotifications.ToListAsync());
    }

    [Fact]
    public async Task UnrelatedDeleteIsPrivacySafeNotFound()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var comment = await harness.Comments.CreateAsync(
            Bob, momentId, new CreateMomentCommentRequest("Hello"));

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.DeleteAsync(Carol, momentId, comment.Comment.Id));
        Assert.Equal(StatusCodes.Status404NotFound, error.StatusCode);
        Assert.Equal("comment_not_found", error.Code);
    }

    [Fact]
    public async Task AuthorCanWithdrawAfterMomentBecomesPrivateAndWrongMomentDoesNotLeak()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var otherMomentId = await harness.AddMomentAsync(Alice, Mochi, "Other", 20);
        var comment = await harness.Comments.CreateAsync(
            Bob, momentId, new CreateMomentCommentRequest("Hello"));
        (await harness.Db.PetMemories.FindAsync(momentId))!.Visibility = MemoryVisibility.Private;
        await harness.Graph.BlockAsync(Alice, "limfamily", null);
        await harness.Db.SaveChangesAsync();

        var wrongMoment = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.DeleteAsync(Bob, otherMomentId, comment.Comment.Id));
        Assert.Equal("comment_not_found", wrongMoment.Code);

        await harness.Comments.DeleteAsync(Bob, momentId, comment.Comment.Id);
        var row = await harness.Db.MomentComments.FindAsync(comment.Comment.Id);
        Assert.Equal("", row!.Body);
        Assert.Equal(Bob, row.DeletedByUserId);
    }

    [Fact]
    public async Task CommentCountsMatchTheViewerAcrossEveryMomentProjection()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await harness.Comments.CreateAsync(
            Bob, momentId, new CreateMomentCommentRequest("Hello"));
        await harness.FollowAsync(Carol, "tanfamily");

        async Task<int[]> Counts() =>
        [
            (await harness.PublicProfiles.GetMomentAsync(momentId, Carol)).CommentCount,
            Assert.Single((await harness.PublicProfiles.GetOwnerMomentsAsync(
                "tanfamily", null, null, Carol)).Items).CommentCount,
            Assert.Single((await harness.PublicProfiles.GetPetMomentsAsync(
                "mochi-pubmochi", null, null, Carol)).Items).CommentCount,
            Assert.Single((await harness.Feed.GetFeedAsync(Carol, null, null)).Items).CommentCount,
            Assert.Single((await harness.Discovery.GetLatestMomentsAsync(
                Carol, null, null, null)).Items).CommentCount
        ];

        Assert.All(await Counts(), count => Assert.Equal(1, count));

        await harness.Graph.BlockAsync(Carol, "limfamily", null);
        Assert.All(await Counts(), count => Assert.Equal(0, count));
    }

    [Fact]
    public void CreateRouteUsesTheDedicatedCommentRateLimit()
    {
        var attribute = typeof(MomentCommentsController)
            .GetMethod(nameof(MomentCommentsController.Create))!
            .GetCustomAttributes(typeof(EnableRateLimitingAttribute), inherit: true)
            .Cast<EnableRateLimitingAttribute>()
            .Single();

        Assert.Equal(SocialRateLimitPolicies.Comment, attribute.PolicyName);
    }

    [Fact]
    public async Task InactiveMomentAuthorMakesMomentAndCommentsUnavailable()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await harness.Comments.CreateAsync(
            Bob, momentId, new CreateMomentCommentRequest("Hello"));
        (await harness.Db.Users.FindAsync(Alice))!.Status = UserStatus.Suspended;
        await harness.Db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.GetAsync(momentId, null, null, null));
        Assert.Equal(StatusCodes.Status404NotFound, error.StatusCode);
        await Assert.ThrowsAsync<ApiException>(() =>
            harness.PublicProfiles.GetMomentAsync(momentId, null));
    }
}
