using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Where an accepted collaboration shows, where a pending one never does, and
/// how blocks and later changes to either household take it back out.
/// </summary>
public sealed class MomentCollaborationVisibilityTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;
    private static readonly Guid Carol = SocialSurfaceHarness.CarolId;
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;
    private static readonly Guid Coco = SocialSurfaceHarness.CocoId;
    private static readonly Guid Buddy = SocialSurfaceHarness.BuddyId;

    private static readonly Guid Eve = Guid.Parse("c7111111-1111-1111-1111-111111111111");
    private static readonly Guid Pip = Guid.Parse("c7222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task AnAcceptedCollaboratorIsShownApartFromTheAuthorsPets()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10, alsoAbout: [Coco]);
        await CollaborateAsync(harness, momentId);

        var moment = await harness.PublicProfiles.GetMomentAsync(momentId, Carol);

        Assert.Equal(new[] { "Mochi", "Coco" }, moment.Subjects.Select(subject => subject.Name));
        var collaborator = Assert.Single(moment.Collaborations);
        Assert.Equal("LimFamily", collaborator.Household.Handle);
        Assert.Equal("Buddy", Assert.Single(collaborator.Pets).Name);
        Assert.Equal("TanFamily", moment.Author!.Handle);
    }

    [Fact]
    public async Task APendingInvitationIsNeverPublic()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await harness.Collaborations.InviteAsync(Alice, momentId, new("limfamily", ["buddy-pubbuddy"]));

        Assert.Empty((await harness.PublicProfiles.GetMomentAsync(momentId, null)).Collaborations);
        Assert.Empty((await harness.PublicProfiles.GetMomentAsync(momentId, Bob)).Collaborations);
        Assert.DoesNotContain(
            (await harness.PublicProfiles.GetPetMomentsAsync("buddy-pubbuddy", null, null)).Items,
            item => item.Id == momentId);
        Assert.Empty(await ShareProfileMomentsAsync(harness, "pubbuddy"));
    }

    [Fact]
    public async Task TheCollaboratorsPetShowsTheMomentWithItsAuthorOnBothPetSurfaces()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        (await harness.Db.PetMemories.FindAsync(momentId))!.ShowInLifeTimeline = true;
        await harness.Db.SaveChangesAsync();
        await CollaborateAsync(harness, momentId);

        var petMoments = await harness.PublicProfiles.GetPetMomentsAsync("buddy-pubbuddy", null, null);
        var card = Assert.Single(petMoments.Items, item => item.Id == momentId);
        Assert.Equal("TanFamily", card.Author!.Handle);

        var share = Assert.Single(await ShareProfileMomentsAsync(harness, "pubbuddy"));
        Assert.Equal("Beach day", share.Title);
        Assert.Equal("TanFamily", share.MomentBy!.Handle);
        // Another household's Moment never joins this pet's Life Timeline.
        Assert.False(share.ShowInLifeTimeline);

        // The author's own pet still shows it as its own, unattributed.
        Assert.Null(Assert.Single(await ShareProfileMomentsAsync(harness, "pubmochi")).MomentBy);
    }

    [Fact]
    public async Task ThePetsShareProfileMomentsSettingStillDecides()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await CollaborateAsync(harness, momentId);
        var profile = await harness.Db.PetPublicProfiles.SingleAsync(item => item.PetId == Buddy);
        profile.ShowMoments = false;
        profile.ShowTimeline = true;
        await harness.Db.SaveChangesAsync();

        Assert.Empty(await ShareProfileMomentsAsync(harness, "pubbuddy"));
        Assert.DoesNotContain(
            (await harness.PublicProfiles.GetPetMomentsAsync("buddy-pubbuddy", null, null)).Items,
            item => item.Id == momentId);
    }

    [Fact]
    public async Task FeedFollowsTheAuthorOnlyAndNeverDuplicates()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await CollaborateAsync(harness, momentId);

        await harness.FollowAsync(Carol, "limfamily");
        Assert.DoesNotContain((await harness.Feed.GetFeedAsync(Carol, null, null)).Items, item => item.Id == momentId);

        await harness.FollowAsync(Carol, "tanfamily");
        Assert.Single((await harness.Feed.GetFeedAsync(Carol, null, null)).Items, item => item.Id == momentId);
    }

    [Fact]
    public async Task ACollaboratorsPetNeverMakesAMomentDiscoverable()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetPetDiscoverableAsync(Mochi, false);
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await CollaborateAsync(harness, momentId);

        Assert.DoesNotContain(
            (await harness.Discovery.GetLatestMomentsAsync(Carol, null, null, null)).Items,
            item => item.Id == momentId);

        await harness.SetPetDiscoverableAsync(Mochi, true);
        var explore = await harness.Discovery.GetLatestMomentsAsync(Carol, null, null, null);
        var card = Assert.Single(explore.Items, item => item.Id == momentId);
        Assert.Equal("LimFamily", Assert.Single(card.Collaborations).Household.Handle);
    }

    [Fact]
    public async Task TheCollaboratorsHouseholdProfileListsOnlyWhatItAuthored()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await CollaborateAsync(harness, momentId);

        Assert.DoesNotContain(
            (await harness.PublicProfiles.GetOwnerMomentsAsync("limfamily", null, null, null)).Items,
            item => item.Id == momentId);
        Assert.Contains(
            (await harness.PublicProfiles.GetOwnerMomentsAsync("tanfamily", null, null, null)).Items,
            item => item.Id == momentId);
    }

    [Fact]
    public async Task ABlockDissolvesEveryCollaborationBetweenThePairAndUnblockRestoresNone()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddHouseholdAsync(Eve, "EveHome", "Eve's Home", Pip, "Pip");
        var accepted = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var pending = await harness.AddMomentAsync(Alice, Mochi, "Park", 11);
        var bobsMoment = await harness.AddMomentAsync(Bob, Buddy, "Bob's walk", 12);
        await CollaborateAsync(harness, accepted);
        var eves = await InviteAsync(harness, Alice, accepted, "evehome", "pubpip");
        await harness.Collaborations.AcceptAsync(Eve, eves, new(["pubpip"]));
        await InviteAsync(harness, Alice, pending, "limfamily", "buddy-pubbuddy");
        // The other direction too: Bob invited Alice.
        await InviteAsync(harness, Bob, bobsMoment, "tanfamily", "mochi-pubmochi");

        await harness.Graph.BlockAsync(Bob, "tanfamily", null);

        var pair = await harness.Db.MomentCollaborations
            .Where(item => item.InviteeUserId == Bob || item.InviterUserId == Bob)
            .ToListAsync();
        Assert.Equal(3, pair.Count);
        Assert.All(pair, item =>
        {
            Assert.Equal(MomentCollaborationStatus.Dissolved, item.Status);
            Assert.NotNull(item.EndedAt);
        });
        Assert.False(await harness.Db.MomentPets.AnyAsync(item => item.PetId == Buddy && item.CollaborationId != null));
        Assert.False(await harness.Db.MomentPets.AnyAsync(item => item.PetId == Mochi && item.CollaborationId != null));
        // Eve is unrelated to the block and stays.
        Assert.Equal(MomentCollaborationStatus.Accepted, (await harness.Db.MomentCollaborations.FindAsync(eves))!.Status);
        Assert.True(await harness.Db.MomentPets.AnyAsync(item => item.PetId == Pip));

        await harness.Graph.UnblockAsync(Bob, "tanfamily");

        Assert.Equal("EveHome", Assert.Single(
            (await harness.PublicProfiles.GetMomentAsync(accepted, Carol)).Collaborations).Household.Handle);
        Assert.All(
            await harness.Db.MomentCollaborations.Where(item => item.InviteeUserId == Bob || item.InviterUserId == Bob).ToListAsync(),
            item => Assert.Equal(MomentCollaborationStatus.Dissolved, item.Status));
        var again = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.InviteAsync(Alice, accepted, new("limfamily", ["buddy-pubbuddy"])));
        Assert.Equal("collaboration_reinvite_unavailable", again.Code);
    }

    [Fact]
    public async Task TheAuthorsListNeverRevealsABlock()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await CollaborateAsync(harness, momentId);

        await harness.Graph.BlockAsync(Bob, "tanfamily", null);

        Assert.Empty((await harness.Collaborations.GetForMomentAsync(Alice, momentId)).Items);
        Assert.Empty((await harness.Collaborations.GetCandidatesAsync(Alice, "lim", momentId)).Items);
    }

    [Fact]
    public async Task LaterChangesToTheCollaboratorHideItAtReadTime()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await CollaborateAsync(harness, momentId);

        async Task<int> Shown() => (await harness.PublicProfiles.GetMomentAsync(momentId, null)).Collaborations.Count;
        Assert.Equal(1, await Shown());

        (await harness.Db.Users.FindAsync(Bob))!.Status = UserStatus.Suspended;
        await harness.Db.SaveChangesAsync();
        Assert.Equal(0, await Shown());
        (await harness.Db.Users.FindAsync(Bob))!.Status = UserStatus.Active;
        await harness.Db.SaveChangesAsync();
        Assert.Equal(1, await Shown());

        await harness.SetOwnerSocialAsync(Bob, false);
        Assert.Equal(0, await Shown());
        await harness.SetOwnerSocialAsync(Bob, true);
        Assert.Equal(1, await Shown());

        (await harness.Db.PetSocialProfiles.SingleAsync(item => item.PetId == Buddy)).IsSocialEnabled = false;
        await harness.Db.SaveChangesAsync();
        Assert.Equal(0, await Shown());
        (await harness.Db.PetSocialProfiles.SingleAsync(item => item.PetId == Buddy)).IsSocialEnabled = true;
        await harness.Db.SaveChangesAsync();
        Assert.Equal(1, await Shown());

        // A new owner is not the household that consented.
        (await harness.Db.Pets.FindAsync(Buddy))!.OwnerUserId = Carol;
        await harness.Db.SaveChangesAsync();
        Assert.Equal(0, await Shown());
        Assert.Equal(MomentCollaborationStatus.Accepted, (await harness.Db.MomentCollaborations.SingleAsync()).Status);
    }

    [Fact]
    public async Task AViewerBlockedWithTheCollaboratorSeesTheMomentWithoutThem()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await CollaborateAsync(harness, momentId);
        await harness.Graph.BlockAsync(Carol, "limfamily", null);

        Assert.Empty((await harness.PublicProfiles.GetMomentAsync(momentId, Carol)).Collaborations);
        Assert.Single((await harness.PublicProfiles.GetMomentAsync(momentId, null)).Collaborations);
    }

    [Fact]
    public async Task APrivateMomentHidesItsCollaboratorsUntilItIsPublicAgain()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await CollaborateAsync(harness, momentId);

        (await harness.Db.PetMemories.FindAsync(momentId))!.Visibility = MemoryVisibility.Private;
        await harness.Db.SaveChangesAsync();
        Assert.Empty(await ShareProfileMomentsAsync(harness, "pubbuddy"));
        Assert.DoesNotContain(
            (await harness.PublicProfiles.GetPetMomentsAsync("buddy-pubbuddy", null, null)).Items,
            item => item.Id == momentId);

        (await harness.Db.PetMemories.FindAsync(momentId))!.Visibility = MemoryVisibility.Public;
        await harness.Db.SaveChangesAsync();
        Assert.Single((await harness.PublicProfiles.GetMomentAsync(momentId, null)).Collaborations);
        Assert.Single(await ShareProfileMomentsAsync(harness, "pubbuddy"));
    }

    [Fact]
    public async Task EngagementStaysWithTheOneCanonicalMomentAndItsAuthor()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await CollaborateAsync(harness, momentId);
        await harness.Db.OwnerNotifications.ExecuteDeleteSafeAsync(harness.Db);

        await harness.Likes.LikeAsync(Carol, momentId);
        var comment = await harness.Comments.CreateAsync(Carol, momentId, new CreateMomentCommentRequest("Lovely"));

        var moment = await harness.PublicProfiles.GetMomentAsync(momentId, null);
        Assert.Equal(1, moment.LikeCount);
        Assert.Equal(1, moment.CommentCount);
        Assert.Empty((await harness.Notifications.GetAsync(Bob, null, null)).Items);
        Assert.Equal(2, (await harness.Notifications.GetAsync(Alice, null, null)).Items
            .Count(item => item.Type is "MomentLiked" or "MomentCommented"));

        // A collaborator has no Comment moderation rights.
        var remove = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.DeleteAsync(Bob, momentId, comment.Comment.Id));
        Assert.Equal("comment_not_found", remove.Code);
    }

    // ---- helpers -----------------------------------------------------------

    private static async Task CollaborateAsync(SocialSurfaceHarness harness, Guid momentId)
    {
        var collaborationId = await InviteAsync(harness, Alice, momentId, "limfamily", "buddy-pubbuddy");
        await harness.Collaborations.AcceptAsync(Bob, collaborationId, new(["buddy-pubbuddy"]));
    }

    private static async Task<Guid> InviteAsync(
        SocialSurfaceHarness harness,
        Guid authorId,
        Guid momentId,
        string handle,
        string petSlug)
    {
        var list = await harness.Collaborations.InviteAsync(authorId, momentId, new(handle, [petSlug]));
        return list.Items.Single(item =>
            item.Household.Handle.Equals(handle, StringComparison.OrdinalIgnoreCase)
            && item.Status == "Pending").Id;
    }

    private static async Task<IReadOnlyCollection<PublicMemorySummaryResponse>> ShareProfileMomentsAsync(
        SocialSurfaceHarness harness,
        string publicCode)
    {
        var profile = await harness.PetShareProfiles.GetByPublicSlugAsync(publicCode);
        return profile.Memories;
    }
}

internal static class OwnerNotificationTestExtensions
{
    /// <summary>Clears activity in the in-memory store, which has no bulk delete.</summary>
    public static async Task ExecuteDeleteSafeAsync(
        this DbSet<OwnerNotification> notifications,
        MyPetLink.Api.Data.MyPetLinkDbContext db)
    {
        notifications.RemoveRange(await notifications.ToListAsync());
        await db.SaveChangesAsync();
    }
}
