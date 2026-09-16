using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Common;

/// <summary>
/// Where an image derivative lives, and which URL a caller should load.
///
/// Both halves are here rather than inside a service because two callers need
/// them — the upload path that writes the derivative and the projection path
/// that serves it — and a second copy of "how do I find the thumbnail" is
/// exactly how the two drift apart.
/// </summary>
public static class MediaDerivatives
{
    /// <summary>
    /// The derivative's key, beside its original, so a prefix listing shows the
    /// pair together and an object lifecycle rule can treat them as one unit.
    /// </summary>
    public static string BuildThumbnailObjectKey(string objectKey)
    {
        var extensionIndex = objectKey.LastIndexOf('.');
        var stem = extensionIndex > objectKey.LastIndexOf('/')
            ? objectKey[..extensionIndex]
            : objectKey;

        return $"{stem}_thumb.jpg";
    }

    /// <summary>
    /// The URL a grid or card should load: the generated derivative when there
    /// is one, otherwise the original.
    ///
    /// Falling back is the normal path, not a degraded one. Media uploaded
    /// before this pipeline existed has no derivative, an image already small
    /// enough never gets one, and generation is allowed to fail without failing
    /// the upload. Callers never have to check.
    /// </summary>
    public static string? ResolveThumbnailUrl(MediaFile? mediaFile, string? publicBaseUrl)
    {
        if (mediaFile is null)
        {
            return null;
        }

        var originalUrl = ResolveOriginalUrl(mediaFile, publicBaseUrl);

        // A private object must never acquire a public URL by way of its
        // thumbnail.
        if (!mediaFile.IsPublic
            || mediaFile.DerivativeStatus != MediaDerivativeStatus.Ready
            || string.IsNullOrWhiteSpace(mediaFile.ThumbnailObjectKey))
        {
            return originalUrl;
        }

        return MediaUrlBuilder.BuildPublicUrl(publicBaseUrl ?? "", mediaFile.ThumbnailObjectKey);
    }

    /// <summary>
    /// The URL a list, grid or card should load for one media item.
    ///
    /// An image gets its derivative when one exists. A video always gets its
    /// own file, because a video has no image derivative and never should: a
    /// thumbnail key on a video row would be a still frame, and handing a still
    /// frame to a &lt;video&gt; element produces a player that cannot play.
    /// Today that key is always absent, so <see cref="ResolveThumbnailUrl"/>
    /// happens to fall through to the original anyway — this makes the rule
    /// explicit rather than incidental, so a later poster-frame pipeline
    /// cannot silently break every video on the feed.
    /// </summary>
    public static string? ResolveListUrl(MediaFile? mediaFile, string? publicBaseUrl)
    {
        return mediaFile?.MediaType == MediaFileType.Video
            ? ResolveOriginalUrl(mediaFile, publicBaseUrl)
            : ResolveThumbnailUrl(mediaFile, publicBaseUrl);
    }

    /// <summary>
    /// The original's public URL, under the same availability rules the rest of
    /// the public projections use.
    /// </summary>
    public static string? ResolveOriginalUrl(MediaFile? mediaFile, string? publicBaseUrl)
    {
        if (mediaFile is null
            || !mediaFile.IsPublic
            || mediaFile.UploadStatus != MediaUploadStatus.Ready
            || mediaFile.DeletedAt.HasValue)
        {
            return null;
        }

        var url = MediaUrlBuilder.BuildPublicUrl(publicBaseUrl, mediaFile.ObjectKey);
        return string.IsNullOrWhiteSpace(url) ? null : url;
    }
}
