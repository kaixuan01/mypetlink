using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Phase 2E E1: what "Hidden by MyPetLink" and a Community restriction mean on
/// every surface, that they stay Community-only, and the rules and role
/// defaults the later stages build on.
/// </summary>
public sealed class CommunityModerationTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;   // @TanFamily, the author
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;       // @LimFamily, follows Alice
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;
    private static readonly Guid Buddy = SocialSurfaceHarness.BuddyId;
    private static readonly Guid Moderator = Guid.Parse("a0d11111-1111-1111-1111-111111111111");

    // ---- Hidden by MyPetLink ---------------------------------------------------

    [Fact]
    public async Task AHiddenMomentLeavesEveryPublicSurfaceAndReadsLikeAMissingOne()
    {
        using var harness = await CreateAsync();
        await harness.FollowAsync(Bob, "tanfamily");
        var hidden = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 20);
        var kept = await harness.AddMomentAsync(Alice, Mochi, "Park", 10);
        await MarkForTimelineAsync(harness, hidden, kept);

        await HideAsync(harness, hidden);

        var missing = await Assert.ThrowsAsync<ApiException>(() => harness.PublicProfiles.GetMomentAsync(Guid.NewGuid()));
        var direct = await Assert.ThrowsAsync<ApiException>(() => harness.PublicProfiles.GetMomentAsync(hidden));
        Assert.Equal((missing.StatusCode, missing.Code), (direct.StatusCode, direct.Code));
        await Assert.ThrowsAsync<ApiException>(() => harness.PublicProfiles.GetMomentAsync(hidden, Alice));

        Assert.Equal([kept], (await harness.Feed.GetFeedAsync(Bob, null, 50)).Items.Select(item => item.Id).ToArray());
        Assert.DoesNotContain(hidden, (await harness.Discovery.GetLatestMomentsAsync(null, null, null, 50)).Items.Select(item => item.Id));
        Assert.Equal([kept], (await harness.PublicProfiles.GetOwnerMomentsAsync("tanfamily", null, 50)).Items.Select(item => item.Id).ToArray());
        Assert.Equal([kept], (await harness.PublicProfiles.GetPetMomentsAsync("mochi-pubmochi", null, 50)).Items.Select(item => item.Id).ToArray());

        // The Share Profile's Moments and Timeline come from their own query.
        var share = await harness.PetShareProfiles.GetByPublicSlugAsync("mochi-pubmochi");
        Assert.Equal(["Park"], share.Memories.Select(memory => memory.Title).ToArray());

        // Engagement follows the Moment.
        await Assert.ThrowsAsync<ApiException>(() => harness.Likes.LikeAsync(Bob, hidden));
        await Assert.ThrowsAsync<ApiException>(() => harness.Comments.GetAsync(hidden, null, null, null));
        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.CreateAsync(Bob, hidden, new CreateMomentCommentRequest("hello")));
    }

    [Fact]
    public async Task ItsCommentsCollaboratorsAndMentionsGoWithIt()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 20);
        var invited = await harness.Collaborations.InviteAsync(
            Alice, momentId, new CreateMomentCollaborationRequest("limfamily", ["buddy-pubbuddy"]));
        await harness.Collaborations.AcceptAsync(Bob, invited.Items.Single().Id, new AcceptMomentCollaborationRequest(["buddy-pubbuddy"]));
        await harness.Comments.CreateAsync(Bob, momentId, new CreateMomentCommentRequest("hi @TanFamily"));

        await HideAsync(harness, momentId);

        Assert.Equal(0, await harness.Db.MomentComments.VisibleComments(harness.Db, null).CountAsync());
        Assert.Equal(0, await harness.Db.MomentPets.VisibleCollaboratorSubjects(harness.Db, null).CountAsync());
        Assert.Equal(0, await harness.Db.MomentCommentMentions.VisibleCommentMentions(harness.Db, null).CountAsync());
        Assert.DoesNotContain(momentId, (await harness.PublicProfiles.GetPetMomentsAsync("buddy-pubbuddy", null, 50)).Items.Select(item => item.Id));

        // Nothing was deleted: unhiding brings all of it back.
        await UnhideAsync(harness, momentId);
        Assert.Equal(1, await harness.Db.MomentComments.VisibleComments(harness.Db, null).CountAsync());
        Assert.Equal(1, await harness.Db.MomentPets.VisibleCollaboratorSubjects(harness.Db, null).CountAsync());
        Assert.Equal(momentId, (await harness.PublicProfiles.GetMomentAsync(momentId)).Id);
    }

    [Fact]
    public async Task TheOwnerStillSeesItButCannotRepublishIt()
    {
        using var harness = await CreateAsync();
        var memories = new MemoryService(harness.Db, Options.Create(new CloudflareR2Options()));
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 20);
        await HideAsync(harness, momentId);

        var listed = Assert.Single((await memories.ListForPetAsync(Alice, Mochi, 1, 50, null, false)).Items);
        Assert.NotNull(listed.HiddenByMyPetLinkAt);

        // Private, then Public again: still hidden.
        await memories.UpdateAsync(Alice, momentId, Update(MemoryVisibility.Private));
        harness.Db.ChangeTracker.Clear();
        await memories.UpdateAsync(Alice, momentId, Update(MemoryVisibility.Public));
        harness.Db.ChangeTracker.Clear();
        Assert.NotNull((await memories.GetAsync(Alice, momentId)).HiddenByMyPetLinkAt);
        await Assert.ThrowsAsync<ApiException>(() => harness.PublicProfiles.GetMomentAsync(momentId));

        // Deleting it is still the owner's call.
        await memories.ArchiveAsync(Alice, momentId);
        harness.Db.ChangeTracker.Clear();
        Assert.NotNull((await harness.Db.PetMemories.SingleAsync(item => item.Id == momentId)).ArchivedAt);
    }

    [Fact]
    public async Task NoExistingMomentIsHiddenAndOthersAreUntouched()
    {
        using var harness = await CreateAsync();
        var first = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 20);
        var second = await harness.AddMomentAsync(Alice, Mochi, "Park", 10);

        Assert.False(await harness.Db.PetMemories.AnyAsync(item => item.ModeratedAt != null));
        await HideAsync(harness, first);
        Assert.Equal(second, (await harness.PublicProfiles.GetMomentAsync(second)).Id);
    }

    // ---- Community-only restriction --------------------------------------------

    [Fact]
    public async Task ARestrictedHouseholdCannotFollowOrLikeButCanStillTakeEitherBack()
    {
        using var harness = await CreateAsync();
        var aliceMoment = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 20);
        var otherMoment = await harness.AddMomentAsync(Alice, Mochi, "Park", 10);
        await harness.Likes.LikeAsync(Bob, otherMoment);
        var carolBefore = await harness.Graph.GetRelationshipAsync(Bob, "carolpets");
        Assert.True(carolBefore.CanFollow);
        await RestrictAsync(harness, Bob);

        // Following and liking are Community participation: refused, with the
        // same calm answer as turning Community back on, and nothing written.
        foreach (var attempt in new Func<Task>[]
                 {
                     () => harness.Graph.FollowAsync(Bob, "carolpets"),
                     () => harness.Likes.LikeAsync(Bob, aliceMoment)
                 })
        {
            var refused = await Assert.ThrowsAsync<ApiException>(attempt);
            Assert.Equal(StatusCodes.Status403Forbidden, refused.StatusCode);
            Assert.Equal("community_restricted", refused.Code);
            Assert.Equal(CommunityModeration.RestrictedMessage, refused.Message);
        }

        harness.Db.ChangeTracker.Clear();
        Assert.False(await harness.Db.OwnerFollows.AnyAsync(item => item.FollowerUserId == Bob && item.FollowedUserId == SocialSurfaceHarness.CarolId));
        Assert.False(await harness.Db.MomentLikes.AnyAsync(item => item.UserId == Bob && item.MomentId == aliceMoment));
        Assert.Equal(0, (await harness.Likes.GetAsync(Alice, aliceMoment)).LikeCount);
        Assert.False((await harness.Graph.GetRelationshipAsync(Bob, "carolpets")).CanFollow);

        // Withdrawing is never refused: Bob can still unfollow and unlike.
        await harness.Graph.UnfollowAsync(Bob, "tanfamily");
        await harness.Likes.UnlikeAsync(Bob, otherMoment);
        Assert.False(await harness.Db.OwnerFollows.AnyAsync(item => item.FollowerUserId == Bob));
        Assert.False(await harness.Db.MomentLikes.AnyAsync(item => item.UserId == Bob));
    }

    [Fact]
    public async Task OnlyARestrictionStopsFollowAndLikeNotCommunitySimplyOff()
    {
        // Dave has Community off by his own choice and is not restricted:
        // following and liking behave exactly as they did before Phase 2E.
        using var harness = await CreateAsync();
        var dave = SocialSurfaceHarness.DaveId;
        var aliceMoment = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 20);

        Assert.True((await harness.Graph.GetRelationshipAsync(dave, "tanfamily")).CanFollow);
        await harness.Graph.FollowAsync(dave, "tanfamily");
        await harness.Likes.LikeAsync(dave, aliceMoment);

        Assert.True(await harness.Db.OwnerFollows.AnyAsync(item => item.FollowerUserId == dave));
        Assert.True(await harness.Db.MomentLikes.AnyAsync(item => item.UserId == dave && item.MomentId == aliceMoment));
    }

    [Fact]
    public async Task ARestrictedHouseholdCannotTurnCommunityBackOn()
    {
        using var harness = await CreateAsync();
        var social = SocialProfiles(harness);
        await RestrictAsync(harness, Alice);

        var refused = await Assert.ThrowsAsync<ApiException>(() => social.UpdateAsync(Alice, Toggle(true)));
        Assert.Equal(StatusCodes.Status403Forbidden, refused.StatusCode);
        Assert.Equal("community_restricted", refused.Code);
        Assert.Equal("Your Community access is paused. Contact support.", refused.Message);

        harness.Db.ChangeTracker.Clear();
        var profile = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == Alice);
        Assert.False(profile.IsSocialEnabled);
        Assert.NotNull(profile.CommunityRestrictedAt);
    }

    [Fact]
    public async Task ARestrictionTakesTheHouseholdOutOfCommunityAndNothingElse()
    {
        using var harness = await CreateAsync();
        await harness.FollowAsync(Bob, "tanfamily");
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 20);
        await harness.Comments.CreateAsync(Alice, momentId, new CreateMomentCommentRequest("Our day out"));
        var safetyBefore = System.Text.Json.JsonSerializer.Serialize(await harness.QrSafety.GetBySafetyCodeAsync("s-pubmochi"));

        await RestrictAsync(harness, Alice);

        // Community: gone.
        await Assert.ThrowsAsync<ApiException>(() => harness.PublicProfiles.GetOwnerProfileAsync("tanfamily"));
        await Assert.ThrowsAsync<ApiException>(() => harness.PublicProfiles.GetMomentAsync(momentId));
        Assert.Empty((await harness.Feed.GetFeedAsync(Bob, null, 50)).Items);
        var comment = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.CreateAsync(Alice, momentId, new CreateMomentCommentRequest("again")));
        Assert.Equal(StatusCodes.Status403Forbidden, comment.StatusCode);

        // Everything else: exactly as it was.
        var account = await harness.Db.Users.SingleAsync(user => user.Id == Alice);
        Assert.Equal(UserStatus.Active, account.Status);
        Assert.Null(account.DeletedAt);
        var share = await harness.PetShareProfiles.GetByPublicSlugAsync("mochi-pubmochi");
        Assert.Equal("Mochi", share.Name);
        Assert.Contains(share.Memories, memory => memory.Title == "Beach day");
        Assert.Equal(safetyBefore, System.Text.Json.JsonSerializer.Serialize(await harness.QrSafety.GetBySafetyCodeAsync("s-pubmochi")));
        var memories = new MemoryService(harness.Db, Options.Create(new CloudflareR2Options()));
        Assert.Single((await memories.ListForPetAsync(Alice, Mochi, 1, 50, null, false)).Items);
    }

    [Theory]
    [InlineData(true, true)]
    [InlineData(false, false)]
    public async Task LiftingRestoresTheOwnersOwnChoice(bool wasOn, bool expectedAfterLift)
    {
        using var harness = await CreateAsync();
        var profile = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == Alice);
        profile.IsSocialEnabled = wasOn;
        profile.IsDiscoverable = wasOn;
        await harness.Db.SaveChangesAsync();

        await RestrictAsync(harness, Alice);
        // Restricting again never overwrites the kept choice.
        await RestrictAsync(harness, Alice);
        await LiftAsync(harness, Alice);

        profile = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == Alice);
        Assert.Equal(expectedAfterLift, profile.IsSocialEnabled);
        Assert.Equal(expectedAfterLift, profile.IsDiscoverable);
        Assert.Null(profile.CommunityRestrictedAt);
        Assert.Null(profile.CommunityRestrictedByUserId);
        Assert.Null(profile.CommunityEnabledBeforeRestriction);
    }

    [Fact]
    public async Task TurningCommunityOffWhileRestrictedIsRememberedForTheLift()
    {
        using var harness = await CreateAsync();
        var social = SocialProfiles(harness);
        await RestrictAsync(harness, Alice);

        await social.UpdateAsync(Alice, Toggle(false));
        harness.Db.ChangeTracker.Clear();
        await LiftAsync(harness, Alice);

        var profile = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == Alice);
        Assert.False(profile.IsSocialEnabled);
    }

    [Fact]
    public async Task EditingTheProfileWhileRestrictedKeepsTheDiscoverabilityChoice()
    {
        using var harness = await CreateAsync();
        var social = SocialProfiles(harness);
        await RestrictAsync(harness, Alice);

        await social.UpdateAsync(Alice, new UpdateOwnerSocialProfileRequest(null, "New bio", null, null, null, null, null));
        harness.Db.ChangeTracker.Clear();
        await LiftAsync(harness, Alice);

        var profile = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == Alice);
        Assert.True(profile.IsSocialEnabled);
        Assert.True(profile.IsDiscoverable);
        Assert.Equal("New bio", profile.Bio);
    }

    // ---- report details ---------------------------------------------------------

    [Fact]
    public void ReportDetailsAreOptionalPlainTextExceptForOther()
    {
        Assert.Null(CommunityReportDetailsRules.RequireValid(CommunityReportReason.SpamOrScam, null));
        Assert.Null(CommunityReportDetailsRules.RequireValid(CommunityReportReason.SpamOrScam, " ​‮ "));
        Assert.Equal("Looks like a scam 🐶", CommunityReportDetailsRules.RequireValid(
            CommunityReportReason.SpamOrScam, " ‮Looks like a scam 🐶\u0007 "));
        Assert.Equal(500, CommunityReportDetailsRules.RequireValid(CommunityReportReason.Other, new string('a', 500))!.Length);

        Assert.Equal("report_details_required", Assert.Throws<ApiException>(() =>
            CommunityReportDetailsRules.RequireValid(CommunityReportReason.Other, "  ")).Code);
        Assert.Equal("report_details_too_long", Assert.Throws<ApiException>(() =>
            CommunityReportDetailsRules.RequireValid(CommunityReportReason.Impersonation, new string('a', 501))).Code);
        Assert.Equal("report_reason_required", Assert.Throws<ApiException>(() =>
            CommunityReportDetailsRules.RequireValid(CommunityReportReason.Unknown, "x")).Code);
        Assert.Equal("report_reason_required", Assert.Throws<ApiException>(() =>
            CommunityReportDetailsRules.RequireValid((CommunityReportReason)99, "x")).Code);
    }

    [Fact]
    public void TheTaxonomyIsExactlyTheApprovedSet()
    {
        Assert.Equal(
            ["Unknown", "Comment", "Moment", "Household"],
            Enum.GetNames<CommunityReportTargetType>());
        Assert.Equal(
            ["Unknown", "SpamOrScam", "HarassmentOrBullying", "InappropriateContent", "AnimalWelfareConcern",
                "Impersonation", "PrivacyConcern", "Other"],
            Enum.GetNames<CommunityReportReason>());
        Assert.Equal(["Unknown", "Open", "Resolved"], Enum.GetNames<CommunityReportStatus>());
        Assert.Equal(
            ["Unknown", "Dismissed", "CommentRemoved", "MomentHidden", "HouseholdRestricted"],
            Enum.GetNames<CommunityReportResolution>());
    }

    // ---- role defaults ----------------------------------------------------------

    [Fact]
    public void OnlyTheIntendedBuiltInRolesReachCommunityModeration()
    {
        string[] all =
        [
            AdminCapabilities.CommunityReportsView,
            AdminCapabilities.CommunityReportsResolve,
            AdminCapabilities.CommunityModerationEnforce
        ];

        IEnumerable<string> Granted(string code) =>
            AdminRoleTemplates.Require(code).Capabilities.Intersect(all);

        Assert.True(AdminRoleTemplates.Require(AdminRoleTemplates.SuperAdminCode).GrantsAllCapabilities);
        Assert.Equal(all, Granted(AdminRoleTemplates.AdministratorCode));
        Assert.Equal(
            [AdminCapabilities.CommunityReportsView, AdminCapabilities.CommunityReportsResolve],
            Granted(AdminRoleTemplates.OwnerSupportCode));
        foreach (var code in new[]
                 {
                     AdminRoleTemplates.OperationsCode, AdminRoleTemplates.SalesCode, AdminRoleTemplates.MarketingCode,
                     AdminRoleTemplates.FinanceCode, AdminRoleTemplates.SupportCode, AdminRoleTemplates.AuditorCode
                 })
        {
            Assert.Empty(Granted(code));
        }
    }

    [Fact]
    public void ViewingReportsIsASensitiveReadTheAuditorNeverReceivesAutomatically()
    {
        var view = AdminCapabilityCatalog.Find(AdminCapabilities.CommunityReportsView)!;
        Assert.False(view.IsWriteAccess);
        Assert.True(view.IsSensitive);
        Assert.True(AdminCapabilityCatalog.Find(AdminCapabilities.CommunityModerationEnforce)!.IsSensitive);
        Assert.True(AdminCapabilityCatalog.Find(AdminCapabilities.CommunityReportsResolve)!.IsWriteAccess);

        Assert.DoesNotContain(AdminCapabilities.CommunityReportsView, AdminCapabilityCatalog.ReadOnlyKeys);
        Assert.DoesNotContain(AdminCapabilities.CommunityReportsView,
            AdminRoleTemplates.Require(AdminRoleTemplates.AuditorCode).Capabilities);
    }

    // ---- helpers ------------------------------------------------------------------

    private static async Task<SocialSurfaceHarness> CreateAsync()
    {
        var harness = await SocialSurfaceHarness.CreateAsync();
        SocialSurfaceHarness.AddOwner(harness.Db, Moderator, "moderator@example.com", "Moderator", "ModeratorHome",
            "The Moderator Home", social: false, discoverable: false);
        await harness.Db.SaveChangesAsync();
        return harness;
    }

    private static async Task HideAsync(SocialSurfaceHarness harness, Guid momentId)
    {
        var moment = await harness.Db.PetMemories.SingleAsync(item => item.Id == momentId);
        CommunityModeration.HideMoment(moment, Moderator, DateTimeOffset.UtcNow);
        await harness.Db.SaveChangesAsync();
        harness.Db.ChangeTracker.Clear();
    }

    private static async Task UnhideAsync(SocialSurfaceHarness harness, Guid momentId)
    {
        var moment = await harness.Db.PetMemories.SingleAsync(item => item.Id == momentId);
        CommunityModeration.UnhideMoment(moment);
        await harness.Db.SaveChangesAsync();
        harness.Db.ChangeTracker.Clear();
    }

    private static async Task RestrictAsync(SocialSurfaceHarness harness, Guid userId)
    {
        var profile = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == userId);
        CommunityModeration.RestrictHousehold(profile, Moderator, DateTimeOffset.UtcNow);
        await harness.Db.SaveChangesAsync();
        harness.Db.ChangeTracker.Clear();
    }

    private static async Task LiftAsync(SocialSurfaceHarness harness, Guid userId)
    {
        var profile = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == userId);
        CommunityModeration.LiftRestriction(profile);
        await harness.Db.SaveChangesAsync();
        harness.Db.ChangeTracker.Clear();
    }

    private static async Task MarkForTimelineAsync(SocialSurfaceHarness harness, params Guid[] momentIds)
    {
        foreach (var moment in await harness.Db.PetMemories.Where(item => momentIds.Contains(item.Id)).ToListAsync())
        {
            moment.ShowInLifeTimeline = true;
        }

        await harness.Db.SaveChangesAsync();
        harness.Db.ChangeTracker.Clear();
    }

    private static OwnerSocialProfileService SocialProfiles(SocialSurfaceHarness harness)
    {
        var auditLog = new AuditLogService(harness.Db, new HttpContextAccessor());
        return new OwnerSocialProfileService(
            harness.Db,
            new OwnerHandleService(harness.Db, Options.Create(new SocialOptions()), auditLog),
            Options.Create(new CloudflareR2Options()),
            Options.Create(new SocialOptions()),
            auditLog);
    }

    private static UpdateOwnerSocialProfileRequest Toggle(bool on) =>
        new(null, null, null, on, null, null, null);

    private static UpdateMemoryRequest Update(MemoryVisibility visibility) =>
        new(null, null, null, null, visibility, null, null, null, null);
}
