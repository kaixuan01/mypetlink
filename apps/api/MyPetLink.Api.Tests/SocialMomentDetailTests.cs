using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// One Moment on its own page.
///
/// A Moment id is a public identifier — it already travels to anonymous
/// browsers inside every listing, and the Like button acts on it — so giving it
/// a URL exposes nothing new. What it does create is a second door, and a second
/// door is only safe if it asks exactly the questions the first one asks. Every
/// test here is that: something that is not visible in a listing must not become
/// visible by being addressed directly.
/// </summary>
public sealed class SocialMomentDetailTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;
    private static readonly Guid Dave = SocialSurfaceHarness.DaveId;
    private static readonly Guid Buddy = SocialSurfaceHarness.BuddyId;
    private static readonly Guid Hidden = SocialSurfaceHarness.HiddenId;
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;

    private static async Task<ApiException> Unavailable(Func<Task> act)
    {
        return await Assert.ThrowsAsync<ApiException>(act);
    }

    [Fact]
    public async Task MomentDetail_PublicEligibleMomentLoads()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 10);

        var moment = await harness.PublicProfiles.GetMomentAsync(momentId, Alice);

        Assert.Equal("Buddy at the park", moment.Title);
        Assert.Equal("LimFamily", moment.Author?.Handle);
        Assert.Contains(moment.Subjects, subject => subject.Name == "Buddy");
    }

    [Fact]
    public async Task MomentDetail_OpensWithoutAnAccount()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 10);

        // A shared Moment link has to work for somebody with no account, which
        // is most of the people who will ever open one.
        var moment = await harness.PublicProfiles.GetMomentAsync(momentId, viewerId: null);

        Assert.Equal("Buddy at the park", moment.Title);
        Assert.False(moment.ViewerHasLiked);
    }

    [Fact]
    public async Task MomentDetail_PrivateMomentUnavailable()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(
            Bob, Buddy, "Just for us", 10, visibility: MemoryVisibility.Private);

        var error = await Unavailable(() => harness.PublicProfiles.GetMomentAsync(momentId, Alice));

        Assert.Equal(StatusCodes.Status404NotFound, error.StatusCode);
    }

    [Fact]
    public async Task MomentDetail_UnpublishedMomentUnavailable()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(
            Bob, Buddy, "Draft", 10, published: false);

        await Unavailable(() => harness.PublicProfiles.GetMomentAsync(momentId, Alice));
    }

    [Fact]
    public async Task MomentDetail_ArchivedMomentUnavailable()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(
            Bob, Buddy, "Taken down", 10, archived: true);

        await Unavailable(() => harness.PublicProfiles.GetMomentAsync(momentId, Alice));
    }

    [Fact]
    public async Task MomentDetail_DeletedMomentUnavailable()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Bob, Buddy, "Gone", 10);

        var moment = await harness.Db.PetMemories.SingleAsync(item => item.Id == momentId);
        moment.DeletedAt = DateTimeOffset.UtcNow;
        await harness.Db.SaveChangesAsync();

        await Unavailable(() => harness.PublicProfiles.GetMomentAsync(momentId, Alice));
    }

    [Fact]
    public async Task MomentDetail_SocialDisabledOwnerUnavailable()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        // Dave's household is not in Social at all.
        var momentId = await harness.AddMomentAsync(Dave, Hidden, "Hidden at home", 10);

        await Unavailable(() => harness.PublicProfiles.GetMomentAsync(momentId, Alice));
    }

    [Fact]
    public async Task MomentDetail_StopsWorkingWhenItsHouseholdLeavesSocial()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 10);

        Assert.Equal("Buddy at the park", (await harness.PublicProfiles.GetMomentAsync(momentId, Alice)).Title);

        await harness.SetOwnerSocialAsync(Bob, false);

        // The URL was shared while it worked. Switching Social off has to take
        // it back, or the switch is decorative.
        await Unavailable(() => harness.PublicProfiles.GetMomentAsync(momentId, Alice));
    }

    [Fact]
    public async Task MomentDetail_BlockedViewerUnavailable()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 10);

        await harness.Graph.BlockAsync(Bob, "tanfamily", null);

        await Unavailable(() => harness.PublicProfiles.GetMomentAsync(momentId, Alice));
    }

    [Fact]
    public async Task MomentDetail_BlockIsEnforcedInBothDirections()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 10);

        // Alice blocked Bob; the block is stored one way and read both ways.
        await harness.Graph.BlockAsync(Alice, "limfamily", null);

        await Unavailable(() => harness.PublicProfiles.GetMomentAsync(momentId, Alice));
    }

    [Fact]
    public async Task MomentDetail_UnknownIdIsUnavailable()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        await Unavailable(() => harness.PublicProfiles.GetMomentAsync(Guid.NewGuid(), Alice));
        await Unavailable(() => harness.PublicProfiles.GetMomentAsync(Guid.Empty, Alice));
    }

    [Fact]
    public async Task MomentDetail_EveryReasonGivesTheSameAnswer()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var privateMoment = await harness.AddMomentAsync(
            Bob, Buddy, "Just for us", 10, visibility: MemoryVisibility.Private);

        var missing = await Unavailable(() =>
            harness.PublicProfiles.GetMomentAsync(Guid.NewGuid(), Alice));
        var hidden = await Unavailable(() =>
            harness.PublicProfiles.GetMomentAsync(privateMoment, Alice));

        // Distinguishing "no such Moment" from "you may not see this one" turns
        // a Moment id into a probe for what exists.
        Assert.Equal(missing.StatusCode, hidden.StatusCode);
        Assert.Equal(missing.Code, hidden.Code);
        Assert.Equal(missing.Message, hidden.Message);
    }

    [Fact]
    public async Task MomentDetail_RendersAllOrderedMedia()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Bob, Buddy, "Beach day", 10);

        await harness.AddMomentMediaAsync(
            momentId, Buddy, MediaFileType.Image, "pets/buddy/moments/c.jpg", sortOrder: 2);
        await harness.AddMomentMediaAsync(
            momentId, Buddy, MediaFileType.Video, "pets/buddy/moments/b.mp4",
            sortOrder: 1, contentType: "video/mp4");
        await harness.AddMomentMediaAsync(
            momentId, Buddy, MediaFileType.Image, "pets/buddy/moments/a.jpg", sortOrder: 0);

        var moment = await harness.PublicProfiles.GetMomentAsync(momentId, Alice);

        // Every item, in the order the owner arranged them. A viewer that
        // reordered media would be showing a different Moment.
        Assert.Equal(3, moment.Media.Count);
        Assert.Equal(
            new[] { "a.jpg", "b.mp4", "c.jpg" },
            moment.Media.OrderBy(item => item.SortOrder).Select(item => item.Url!.Split('/')[^1]));
        Assert.Equal(
            new[] { "image", "video", "image" },
            moment.Media.OrderBy(item => item.SortOrder).Select(item => item.Type));
    }

    [Fact]
    public async Task MomentDetail_ServesFullSizeImagesRatherThanGridThumbnails()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Bob, Buddy, "Beach day", 10);
        await harness.AddMomentMediaAsync(
            momentId,
            Buddy,
            MediaFileType.Image,
            "pets/buddy/moments/a.jpg",
            thumbnailObjectKey: "pets/buddy/moments/a_thumb.jpg");

        var detail = await harness.PublicProfiles.GetMomentAsync(momentId, Alice);
        var listed = Assert.Single((await harness.Feed.GetFeedAsync(Bob, null, null)).Items).Media;

        // One Moment filling a screen earns the larger file; a page of tiles
        // does not. This is the whole reason the two resolutions exist.
        Assert.EndsWith("a.jpg", Assert.Single(detail.Media).Url);
        Assert.EndsWith("a_thumb.jpg", Assert.Single(listed).Url);
    }

    [Fact]
    public async Task MomentDetail_VideoIsStillTheVideoFile()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Bob, Buddy, "Buddy swims", 10);
        await harness.AddMomentMediaAsync(
            momentId,
            Buddy,
            MediaFileType.Video,
            "pets/buddy/moments/clip.mp4",
            thumbnailObjectKey: "pets/buddy/moments/clip_thumb.jpg",
            contentType: "video/mp4");

        var moment = await harness.PublicProfiles.GetMomentAsync(momentId, Alice);
        var media = Assert.Single(moment.Media);

        Assert.Equal("video", media.Type);
        Assert.EndsWith("clip.mp4", media.Url!);
    }

    [Fact]
    public async Task MomentDetail_ReportsTheViewersOwnLike()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 10);

        await harness.Likes.LikeAsync(Alice, momentId);

        var forAlice = await harness.PublicProfiles.GetMomentAsync(momentId, Alice);
        var forStranger = await harness.PublicProfiles.GetMomentAsync(momentId, viewerId: null);

        Assert.True(forAlice.ViewerHasLiked);
        Assert.Equal(1, forAlice.LikeCount);

        // The count is everyone's; the heart is only the viewer's.
        Assert.False(forStranger.ViewerHasLiked);
        Assert.Equal(1, forStranger.LikeCount);
    }

    [Fact]
    public async Task MomentDetail_NamesEverySocialSubjectOfAMultiPetMoment()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(
            Alice, Mochi, "Mochi and Coco", 10, alsoAbout: [SocialSurfaceHarness.CocoId]);

        var moment = await harness.PublicProfiles.GetMomentAsync(momentId, Bob);

        Assert.Equal(
            new[] { "Coco", "Mochi" },
            moment.Subjects.Select(subject => subject.Name).OrderBy(name => name));
    }

    [Fact]
    public async Task MomentLikeNotification_CarriesTheMomentItIsAbout()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 10);

        await harness.Likes.LikeAsync(Alice, momentId);

        var activity = await harness.Notifications.GetAsync(Bob, null, null);
        var notification = Assert.Single(activity.Items);

        // The destination a like notification should open. It used to have to
        // settle for the pet's profile because a Moment had no page.
        Assert.Equal("MomentLiked", notification.Type);
        Assert.Equal(momentId, notification.MomentId);
    }

    [Fact]
    public async Task BlockedOrUnavailableMoment_DoesNotLeakThroughNotification()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Mochi in the sun", 10);

        // Bob likes Alice's Moment, so Alice holds a notification pointing at it.
        await harness.Likes.LikeAsync(Bob, momentId);
        await harness.SetOwnerSocialAsync(Alice, false);

        var notification = Assert.Single(
            (await harness.Notifications.GetAsync(Alice, null, null)).Items);

        // The pointer survives — it is a record of something that happened. What
        // it points at is re-checked, and refuses.
        Assert.Equal(momentId, notification.MomentId);
        await Unavailable(() => harness.PublicProfiles.GetMomentAsync(momentId, Bob));
    }
}
