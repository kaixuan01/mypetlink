using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

/// <summary>
/// What a Community surface is told about a Moment's media.
///
/// A card cannot draw a video correctly unless the response says it is one, and
/// it cannot play a video whose URL points at a picture. Both halves are the
/// server's responsibility, and both are pinned here — the bug that prompted
/// them showed an `.mp4` as a broken image on Explore, and a client cannot
/// recover from being handed the wrong thing.
/// </summary>
public sealed class SocialMomentMediaTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;
    private static readonly Guid Buddy = SocialSurfaceHarness.BuddyId;

    private static async Task<SocialSurfaceHarness> FeedWithFollowerAsync()
    {
        var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Alice, "limfamily");
        return harness;
    }

    [Fact]
    public async Task SocialMoment_Mp4_IsTypedAsVideo()
    {
        using var harness = await FeedWithFollowerAsync();
        var moment = await harness.AddMomentAsync(Bob, Buddy, "Buddy swims", 10);
        await harness.AddMomentMediaAsync(
            moment,
            Buddy,
            MediaFileType.Video,
            "pets/buddy/moments/KyCatVideo1.mp4",
            contentType: "video/mp4");

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);

        var media = Assert.Single(Assert.Single(feed.Items).Media);

        // The client must never have to read the extension off the URL. The
        // extension is a naming convention, not a fact about the bytes.
        Assert.Equal("video", media.Type);
    }

    [Fact]
    public async Task VideoMedia_DoesNotUseImageDerivative()
    {
        using var harness = await FeedWithFollowerAsync();
        var moment = await harness.AddMomentAsync(Bob, Buddy, "Buddy swims", 10);
        await harness.AddMomentMediaAsync(
            moment,
            Buddy,
            MediaFileType.Video,
            "pets/buddy/moments/clip.mp4",
            thumbnailObjectKey: "pets/buddy/moments/clip_thumb.jpg",
            contentType: "video/mp4");

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);

        var media = Assert.Single(Assert.Single(feed.Items).Media);

        // Even with a derivative sitting right beside it, a video resolves to
        // the video. Handing a still frame to a player produces a thing that
        // looks playable and is not.
        Assert.EndsWith("clip.mp4", media.Url!);
        Assert.DoesNotContain("_thumb", media.Url!);
    }

    [Fact]
    public async Task ImageMedia_StillUsesItsDerivative()
    {
        using var harness = await FeedWithFollowerAsync();
        var moment = await harness.AddMomentAsync(Bob, Buddy, "Buddy naps", 10);
        await harness.AddMomentMediaAsync(
            moment,
            Buddy,
            MediaFileType.Image,
            "pets/buddy/moments/nap.jpg",
            thumbnailObjectKey: "pets/buddy/moments/nap_thumb.jpg");

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);

        var media = Assert.Single(Assert.Single(feed.Items).Media);

        // The reason this fix is narrow: grids and cards still pay for the
        // small file, not the original.
        Assert.EndsWith("nap_thumb.jpg", media.Url!);
    }

    [Fact]
    public async Task MixedMoment_ReportsEachItemsOwnType()
    {
        using var harness = await FeedWithFollowerAsync();
        var moment = await harness.AddMomentAsync(Bob, Buddy, "Beach day", 10);
        await harness.AddMomentMediaAsync(
            moment, Buddy, MediaFileType.Image, "pets/buddy/moments/a.jpg", sortOrder: 0);
        await harness.AddMomentMediaAsync(
            moment, Buddy, MediaFileType.Video, "pets/buddy/moments/b.mp4",
            sortOrder: 1, contentType: "video/mp4");

        var feed = await harness.Feed.GetFeedAsync(Alice, null, null);

        var media = Assert.Single(feed.Items).Media.OrderBy(item => item.SortOrder).ToArray();

        Assert.Equal(new[] { "image", "video" }, media.Select(item => item.Type));
    }

    /// <summary>
    /// The resolver itself, without a database in the way.
    /// </summary>
    public sealed class ListUrlResolution
    {
        private const string Base = "https://media.mypetlink.com.my";

        private static MediaFile File(MediaFileType type, string? thumbnailKey) => new()
        {
            ObjectKey = "pets/p/moments/item.bin",
            ThumbnailObjectKey = thumbnailKey,
            DerivativeStatus = thumbnailKey is null
                ? MediaDerivativeStatus.NotApplicable
                : MediaDerivativeStatus.Ready,
            MediaType = type,
            IsPublic = true,
            UploadStatus = MediaUploadStatus.Ready
        };

        [Fact]
        public void VideoResolvesToItsOwnFile()
        {
            var url = MediaDerivatives.ResolveListUrl(
                File(MediaFileType.Video, "pets/p/moments/item_thumb.jpg"), Base);

            Assert.Equal($"{Base}/pets/p/moments/item.bin", url);
        }

        [Fact]
        public void ImageResolvesToItsDerivative()
        {
            var url = MediaDerivatives.ResolveListUrl(
                File(MediaFileType.Image, "pets/p/moments/item_thumb.jpg"), Base);

            Assert.Equal($"{Base}/pets/p/moments/item_thumb.jpg", url);
        }

        [Fact]
        public void APrivateVideoResolvesToNothing()
        {
            var media = File(MediaFileType.Video, null);
            media.IsPublic = false;

            // A video is not an exception to the public-media rule. Kind decides
            // which URL; availability still decides whether there is one.
            Assert.Null(MediaDerivatives.ResolveListUrl(media, Base));
        }
    }
}
