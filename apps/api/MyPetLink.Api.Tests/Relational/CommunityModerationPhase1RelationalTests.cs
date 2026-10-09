using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Phase 1 direct moderation on SQL Server: the queries translate (lists,
/// context, history, Activity with notices that have no actor), the
/// transactions and application locks run with the production retry strategy,
/// the new CHECK constraints hold the invariants on their own, and two expiry
/// workers ending the same restriction end it once.
/// </summary>
public sealed class CommunityModerationPhase1RelationalTests
{
    private static readonly Guid Author = Guid.Parse("eb111111-1111-1111-1111-111111111111");
    private static readonly Guid Member = Guid.Parse("eb211111-1111-1111-1111-111111111111");
    private static readonly Guid Moderator = Guid.Parse("eb311111-1111-1111-1111-111111111111");
    private static readonly Guid AuthorPet = Guid.Parse("eb411111-1111-1111-1111-111111111111");
    private const string Remark = "RELATIONAL-REMARK-2287";

    [RelationalFact]
    public async Task DirectModerationRunsEndToEndOnSqlServer()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var time = new FakeTimeProvider(DateTimeOffset.UtcNow);
        var (momentId, commentId, replyId) = await SeedAsync(scope);

        await using (var context = scope.NewContext())
        {
            await Enforcement(context, time).RemoveMomentAsync(Moderator, momentId, new("SpamOrAdvertising", Remark));
        }

        time.Advance(TimeSpan.FromMinutes(1));
        await using (var context = scope.NewContext())
        {
            await Enforcement(context, time).RemoveCommentAsync(Moderator, replyId, new("Harassment", null));
        }

        time.Advance(TimeSpan.FromMinutes(1));
        await using (var context = scope.NewContext())
        {
            await Enforcement(context, time).IssueWarningAsync(Moderator, Member, new("Harassment", Remark, null, commentId));
        }

        time.Advance(TimeSpan.FromMinutes(1));
        await using (var context = scope.NewContext())
        {
            await Enforcement(context, time).RestrictAsync(Moderator, Member, new("RepeatedViolations", "24h", null));
        }

        await using (var verify = scope.NewContext())
        {
            var queries = Queries(verify);
            var moments = await queries.ListMomentsAsync(new AdminCommunityMomentQuery { Status = "Removed" });
            Assert.Equal(("Removed", 1, 1), (Assert.Single(moments.Items).Status, moments.Items.Single().LikeCount, moments.Items.Single().CommentCount));
            var comments = await queries.ListCommentsAsync(new AdminCommunityCommentQuery { Kind = "Reply", Status = "Removed" });
            Assert.Equal(replyId, Assert.Single(comments.Items).Id);
            var context = await queries.GetCommentAsync(Moderator, commentId);
            Assert.Equal([replyId], context.ThreadReplies.Select(item => item.Id));
            Assert.True(context.ThreadReplies.Single().Removed);

            var household = await queries.GetHouseholdAsync(Moderator, Member);
            Assert.Equal(("Restricted", 1), (household.CommunityStatus, household.WarningCount));
            Assert.Equal(["CommunityRestricted", "WarningIssued", "ReplyRemoved"], household.History.Select(item => item.Action).Take(3));

            // Activity on SQL Server: notices without an actor alongside ordinary rows.
            var activity = await Notifications(verify).GetAsync(Member, null, 50);
            Assert.Equal(["CommunityRestricted", "WarningIssued", "ReplyRemoved"],
                activity.Items.Where(item => item.Moderation is not null).Select(item => item.Moderation!.Action));
            Assert.All(activity.Items.Where(item => item.Moderation is not null), item => Assert.Null(item.Actor));
            Assert.Equal(activity.Items.Count(item => !item.IsRead), activity.UnreadCount);
            Assert.DoesNotContain(Remark, System.Text.Json.JsonSerializer.Serialize(activity));
            Assert.Equal("MomentRemoved", Assert.Single(
                (await Notifications(verify).GetAsync(Author, null, 50)).Items, item => item.Moderation is not null).Moderation!.Action);
        }

        // Ends on its own, under the household lock, exactly once.
        time.Advance(TimeSpan.FromHours(24));
        await using (var context = scope.NewContext())
        {
            Assert.Equal(1, await Expiry(context, time).ExpireDueRestrictionsAsync(50));
        }

        await using var final = scope.NewContext();
        var profile = await final.OwnerSocialProfiles.SingleAsync(item => item.UserId == Member);
        Assert.Null(profile.CommunityRestrictedAt);
        Assert.True(profile.IsSocialEnabled);
        Assert.Equal(5, await final.CommunityModerationActions.CountAsync());
    }

    [RelationalFact]
    public async Task TwoExpiryWorkersEndOneRestrictionOnce()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var time = new FakeTimeProvider(DateTimeOffset.UtcNow);
        await SeedAsync(scope);
        await using (var context = scope.NewContext())
        {
            await Enforcement(context, time).RestrictAsync(Moderator, Member, new("Harassment", "24h", null));
        }

        time.Advance(TimeSpan.FromHours(25));
        await using var first = scope.NewContext();
        await using var second = scope.NewContext();
        var ended = await Task.WhenAll(
            Expiry(first, time).ExpireDueRestrictionsAsync(50),
            Expiry(second, time).ExpireDueRestrictionsAsync(50));

        Assert.Equal(1, ended.Sum());
        await using var verify = scope.NewContext();
        Assert.Equal(1, await verify.CommunityModerationActions.CountAsync(item =>
            item.ActionType == CommunityModerationActionType.CommunityRestrictionExpired));
        Assert.Equal(1, await verify.AuditLogs.CountAsync(item => item.Action == CommunityModerationAudit.HouseholdRestrictionExpired));
        Assert.True((await verify.OwnerSocialProfiles.SingleAsync(item => item.UserId == Member)).IsSocialEnabled);
    }

    [RelationalFact]
    public async Task TheDatabaseRefusesIncoherentModerationRows()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var (momentId, commentId, _) = await SeedAsync(scope);
        var now = DateTimeOffset.UtcNow;

        var invalid = new (string Name, Action<MyPetLinkDbContext> Write)[]
        {
            ("a removed comment that names no comment", context => context.CommunityModerationActions.Add(Action(CommunityModerationActionType.CommentRemoved, now))),
            ("a removed Moment that names a comment", context => context.CommunityModerationActions.Add(Action(CommunityModerationActionType.MomentRemoved, now, momentId: momentId, commentId: commentId))),
            ("an end date on a warning", context => context.CommunityModerationActions.Add(Action(CommunityModerationActionType.WarningIssued, now, until: now.AddDays(1)))),
            ("a moderator action by nobody", context => context.CommunityModerationActions.Add(Action(CommunityModerationActionType.WarningIssued, now, byNobody: true))),
            ("an expiry by a moderator", context => context.CommunityModerationActions.Add(Action(CommunityModerationActionType.CommunityRestrictionExpired, now))),
            ("an end with no restriction", context =>
            {
                var profile = context.OwnerSocialProfiles.Single(item => item.UserId == Member);
                profile.CommunityRestrictedUntil = now.AddDays(1);
            }),
            ("an end before the restriction began", context =>
            {
                var profile = context.OwnerSocialProfiles.Single(item => item.UserId == Member);
                CommunityModeration.RestrictHousehold(profile, Moderator, now, now.AddDays(-1));
            }),
        };

        foreach (var (name, write) in invalid)
        {
            await using var context = scope.NewContext();
            write(context);
            var refused = await Record.ExceptionAsync(() => context.SaveChangesAsync());
            Assert.True(refused is DbUpdateException, $"{name} was accepted");
        }

        await using (var context = scope.NewContext())
        {
            context.CommunityModerationActions.AddRange(
                Action(CommunityModerationActionType.CommentRemoved, now, commentId: commentId),
                Action(CommunityModerationActionType.MomentRemoved, now, momentId: momentId),
                Action(CommunityModerationActionType.CommunityRestricted, now, until: now.AddDays(1)),
                Action(CommunityModerationActionType.CommunityRestricted, now),
                Action(CommunityModerationActionType.CommunityRestrictionExpired, now, byNobody: true),
                Action(CommunityModerationActionType.AccountSuspended, now));
            await context.SaveChangesAsync();
        }

        await using var verify = scope.NewContext();
        Assert.Equal(6, await verify.CommunityModerationActions.CountAsync());
    }

    // ---- helpers ------------------------------------------------------------------

    private static CommunityModerationAction Action(
        CommunityModerationActionType type,
        DateTimeOffset now,
        Guid? momentId = null,
        Guid? commentId = null,
        DateTimeOffset? until = null,
        bool byNobody = false) => new()
    {
        TargetUserId = Member,
        ActionType = type,
        Reason = CommunityModerationReason.Other,
        PerformedByUserId = byNobody ? null : Moderator,
        CreatedAt = now,
        RestrictedUntil = until,
        MomentId = momentId,
        CommentId = commentId
    };

    private static async Task<(Guid MomentId, Guid CommentId, Guid ReplyId)> SeedAsync(RelationalScope scope)
    {
        Guid momentId;
        await using (var context = scope.NewContext())
        {
            SocialSurfaceHarness.AddOwner(context, Author, "author@example.com", "Author", "AuthorHome", "The Author Home", true, true);
            SocialSurfaceHarness.AddOwner(context, Member, "member@example.com", "Member", "MemberHome", "The Member Home", true, true);
            SocialSurfaceHarness.AddOwner(context, Moderator, "moderator@example.com", "Moderator", "ModHome", "Mod Home", false, false);
            await context.SaveChangesAsync();
            SocialSurfaceHarness.AddPet(context, AuthorPet, Author, "Topu", "Cat", true, true);
            await context.SaveChangesAsync();

            var moment = new PetMemory
            {
                PetId = AuthorPet,
                AuthorUserId = Author,
                Title = "Beach day",
                Caption = "Sand everywhere",
                Type = "Memory",
                Visibility = MemoryVisibility.Public,
                PublishedAt = DateTimeOffset.UtcNow.AddHours(-1)
            };
            context.PetMemories.Add(moment);
            context.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = AuthorPet });
            await context.SaveChangesAsync();
            momentId = moment.Id;
        }

        Guid commentId;
        await using (var context = scope.NewContext())
        {
            commentId = (await Comments(context).CreateAsync(Member, momentId, new CreateMomentCommentRequest("Nice"))).Comment.Id;
        }

        Guid replyId;
        await using (var context = scope.NewContext())
        {
            replyId = (await Comments(context).CreateAsync(Member, momentId, new CreateMomentCommentRequest("Rude reply", commentId))).Comment.Id;
        }

        await using (var context = scope.NewContext())
        {
            await new MomentLikeService(context, Notifications(context)).LikeAsync(Member, momentId);
        }

        return (momentId, commentId, replyId);
    }

    private static OwnerNotificationService Notifications(MyPetLinkDbContext context) =>
        new(context, Options.Create(new CloudflareR2Options()));

    private static MomentCommentService Comments(MyPetLinkDbContext context) =>
        new(context, Notifications(context), Options.Create(new CloudflareR2Options()));

    private static AdminCommunityEnforcementService Enforcement(MyPetLinkDbContext context, TimeProvider time) =>
        new(context, Notifications(context), new AuditLogService(context, new HttpContextAccessor()), time);

    private static AdminCommunityContentQueryService Queries(MyPetLinkDbContext context) =>
        new(context, Options.Create(new CloudflareR2Options()));

    private static CommunityRestrictionExpiryService Expiry(MyPetLinkDbContext context, TimeProvider time) =>
        new(context, new AuditLogService(context, new HttpContextAccessor()), time,
            NullLogger<CommunityRestrictionExpiryService>.Instance);
}
