using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

/// <summary>
/// Who a Moment card is being built for, which decides which of its subject
/// pets may be named on it.
/// </summary>
public enum MomentSubjectAudience
{
    /// <summary>
    /// Somebody who arrived at this content deliberately: a pet's page, a
    /// household's page, or a feed built from a follow they chose. Every
    /// socially-enabled subject is named, because discoverability is a
    /// discovery control and this is not discovery.
    /// </summary>
    Direct = 0,

    /// <summary>
    /// A stranger being shown content they did not go looking for — Explore.
    /// Only subjects that are themselves discoverable may be named.
    /// </summary>
    Discovery = 1
}

/// <summary>
/// How large the media on a card needs to be.
/// </summary>
public enum SocialMediaResolution
{
    /// <summary>
    /// A feed card or a grid tile: the generated derivative, which is a
    /// fraction of the original's weight and is all a 180px tile can show.
    /// </summary>
    Preview = 0,

    /// <summary>
    /// One Moment on its own page, where the picture is the point and a soft
    /// upscale of a thumbnail is visible. Only ever reached by loading a single
    /// Moment, so it never multiplies across a listing.
    /// </summary>
    Full = 1
}

/// <summary>
/// The one way a Moment becomes a social card.
///
/// An owner's profile, a pet's profile, the home feed and Explore all select
/// different Moments — that is their whole difference — but they must all
/// describe a Moment in exactly the same way. Four copies of this projection is
/// how one surface quietly starts showing a field the others decided not to, so
/// the selection stays with each caller and the card is built only here.
///
/// The caller hands in a query it has already narrowed. This class applies the
/// cursor, takes one row more than the page to learn whether another page
/// exists, and then loads subjects, media, authors and likes in one batched
/// query each — five round trips for a page of any size, never per Moment.
///
/// <b>What a card may carry is decided here, once.</b> Pet names, public slugs,
/// derivative image URLs, the author's social identity, and like state. There is
/// no code path from this class to a phone number, an email, an account or
/// finder name, a safety code, a tag code, a scan, an order, or a location.
/// </summary>
public sealed class SocialMomentProjection
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly CloudflareR2Options _r2Options;

    public SocialMomentProjection(
        MyPetLinkDbContext dbContext,
        IOptions<CloudflareR2Options> r2Options)
    {
        _dbContext = dbContext;
        _r2Options = r2Options.Value;
    }

    /// <summary>
    /// A page of social Moment cards from an already-narrowed query.
    /// </summary>
    /// <param name="viewerId">
    /// Read for one thing only: which of these Moments the caller has liked. It
    /// never widens or narrows which Moments are returned.
    /// </param>
    public async Task<PublicMomentPageResponse> PageAsync(
        IQueryable<PetMemory> query,
        string? cursor,
        int? pageSize,
        Guid? viewerId,
        CancellationToken cancellationToken = default,
        int? defaultPageSize = null,
        MomentSubjectAudience audience = MomentSubjectAudience.Direct,
        SocialMediaResolution resolution = SocialMediaResolution.Preview)
    {
        var take = SocialCursor.ClampPageSize(pageSize, defaultPageSize);
        var position = SocialCursor.TryDecode(cursor);

        if (position is not null)
        {
            // Strictly after the cursor in (PublishedAt DESC, Id DESC) order.
            query = query.Where(moment =>
                moment.PublishedAt < position.PublishedAt
                || (moment.PublishedAt == position.PublishedAt
                    && moment.Id.CompareTo(position.Id) < 0));
        }

        var rows = await query
            .OrderByDescending(moment => moment.PublishedAt)
            .ThenByDescending(moment => moment.Id)
            // One extra row answers "is there another page?" without a count.
            .Take(take + 1)
            .Select(moment => new
            {
                moment.Id,
                moment.Title,
                moment.MomentDate,
                moment.PublishedAt,
                moment.Type,
                moment.Caption,
                moment.AuthorUserId
            })
            .ToListAsync(cancellationToken);

        var hasMore = rows.Count > take;
        var page = hasMore ? rows.Take(take).ToList() : rows;
        var momentIds = page.Select(row => row.Id).ToArray();

        var subjects = await LoadSubjectsAsync(momentIds, audience, cancellationToken);
        var media = await LoadMediaAsync(momentIds, resolution, cancellationToken);
        var authors = await LoadAuthorsAsync(
            page.Select(row => row.AuthorUserId).Distinct().ToArray(),
            cancellationToken);
        var likeCounts = await LoadLikeCountsAsync(momentIds, cancellationToken);
        var commentCounts = await LoadCommentCountsAsync(momentIds, viewerId, cancellationToken);
        var viewerLikes = await LoadViewerLikesAsync(momentIds, viewerId, cancellationToken);

        var items = page
            .Select(row => new PublicMomentListItemResponse(
                row.Id,
                row.Title,
                row.MomentDate,
                row.PublishedAt,
                row.Type,
                row.Caption,
                authors.TryGetValue(row.AuthorUserId, out var author) ? author : null,
                subjects.TryGetValue(row.Id, out var petSubjects)
                    ? petSubjects
                    : Array.Empty<PublicMomentSubjectResponse>(),
                media.TryGetValue(row.Id, out var items)
                    ? items
                    : Array.Empty<MemoryMediaResponse>(),
                likeCounts.TryGetValue(row.Id, out var likeCount) ? likeCount : 0,
                commentCounts.TryGetValue(row.Id, out var commentCount) ? commentCount : 0,
                viewerLikes.Contains(row.Id)))
            .ToArray();

        var last = page.Count > 0 ? page[^1] : null;
        var nextCursor = hasMore && last?.PublishedAt is { } publishedAt
            ? new SocialCursor(publishedAt, last.Id).Encode()
            : null;

        return new PublicMomentPageResponse(items, nextCursor);
    }

    /// <summary>
    /// The pets each Moment is about, batched. A subject is listed only when it
    /// is itself socially visible — a Moment may feature a pet the owner has
    /// since taken out of social, and that pet's name should not appear.
    ///
    /// <b>In discovery, a subject must also be discoverable in its own right.</b>
    /// A Moment about two pets reaches Explore as soon as ONE of them is
    /// discoverable, and naming the other one on that card would put a pet in
    /// front of strangers whose owner said not to. Selecting the right Moment is
    /// not enough; this is the projection that would have leaked it. Hidden
    /// subjects are dropped from the list entirely rather than hinted at — a
    /// "+1 more pet" still tells a stranger the pet exists.
    ///
    /// The primary subject is the one whose pet matches the Moment's own
    /// <c>PetId</c>. It is derived, never stored: <c>MomentPets</c> has no
    /// primary flag precisely so the two can never disagree.
    /// </summary>
    /// <summary>
    /// One Moment, described exactly as a card describes it.
    ///
    /// The caller still hands in a query it has already narrowed to what this
    /// viewer may see, so a Moment's own page cannot show something its
    /// author's profile would not. Routed through the same paging code rather
    /// than a second projection: a detail page that built its own description
    /// of a Moment is free to disagree with the card that led to it.
    /// </summary>
    public async Task<PublicMomentListItemResponse?> SingleAsync(
        IQueryable<PetMemory> query,
        Guid? viewerId,
        CancellationToken cancellationToken = default,
        MomentSubjectAudience audience = MomentSubjectAudience.Direct,
        SocialMediaResolution resolution = SocialMediaResolution.Preview)
    {
        var page = await PageAsync(
            query,
            cursor: null,
            pageSize: 1,
            viewerId,
            cancellationToken,
            defaultPageSize: 1,
            audience,
            resolution);

        return page.Items.FirstOrDefault();
    }

    private async Task<Dictionary<Guid, PublicMomentSubjectResponse[]>> LoadSubjectsAsync(
        IReadOnlyCollection<Guid> momentIds,
        MomentSubjectAudience audience,
        CancellationToken cancellationToken)
    {
        if (momentIds.Count == 0)
        {
            return new Dictionary<Guid, PublicMomentSubjectResponse[]>();
        }

        var discoveryOnly = audience == MomentSubjectAudience.Discovery;

        var rows = await _dbContext.MomentPets
            .AsNoTracking()
            .Where(subject => momentIds.Contains(subject.MomentId))
            .Where(subject =>
                subject.Pet.DeletedAt == null
                && subject.Pet.LifecycleStatus == PetLifecycleStatus.Active
                && subject.Pet.PublicProfile != null
                && subject.Pet.PublicProfile.IsPublicProfileEnabled
                && subject.Pet.SocialProfile != null
                && subject.Pet.SocialProfile.IsSocialEnabled
                // Same consent rule as SocialVisibility.SociallyVisible: a pet
                // that has changed hands is not named on anybody's card until
                // its new owner opts in.
                && subject.Pet.SocialProfile.ConsentedByUserId == subject.Pet.OwnerUserId)
            .Where(subject =>
                !discoveryOnly
                || (subject.Pet.SocialProfile!.IsDiscoverable
                    && subject.Pet.OwnerUser.SocialProfile != null
                    && subject.Pet.OwnerUser.SocialProfile.IsDiscoverable))
            .OrderBy(subject => subject.CreatedAt)
            .Select(subject => new
            {
                subject.MomentId,
                subject.PetId,
                subject.Pet.Name,
                subject.Pet.Slug,
                subject.Pet.LostModeEnabled,
                Photo = subject.Pet.ProfileMediaFile,
                IsPrimarySubject = subject.Pet.Id == subject.Moment.PetId
            })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(row => row.MomentId)
            .ToDictionary(
                group => group.Key,
                group => group
                    // The Moment's own pet reads first; the rest keep the order
                    // they were added in.
                    .OrderByDescending(row => row.IsPrimarySubject)
                    .Select(row => new PublicMomentSubjectResponse(
                        row.Name,
                        row.Slug,
                        MediaDerivatives.ResolveThumbnailUrl(row.Photo, _r2Options.PublicBaseUrl),
                        row.IsPrimarySubject,
                        row.LostModeEnabled))
                    .ToArray());
    }

    /// <summary>
    /// The social identity of each Moment's author, batched by account.
    ///
    /// This is the SOCIAL identity and nothing else: a chosen handle, a chosen
    /// display name, an uploaded avatar. The account name, the email and the
    /// finder-facing owner name are different identities with different
    /// audiences and are not read here.
    /// </summary>
    private async Task<Dictionary<Guid, PublicOwnerAttributionResponse>> LoadAuthorsAsync(
        IReadOnlyCollection<Guid> authorUserIds,
        CancellationToken cancellationToken)
    {
        if (authorUserIds.Count == 0)
        {
            return new Dictionary<Guid, PublicOwnerAttributionResponse>();
        }

        var rows = await _dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(profile =>
                authorUserIds.Contains(profile.UserId)
                && profile.IsSocialEnabled
                && profile.Handle != null
                && profile.DisplayName != null)
            .Select(profile => new
            {
                profile.UserId,
                profile.Handle,
                profile.DisplayName,
                Avatar = profile.AvatarMediaFile
            })
            .ToListAsync(cancellationToken);

        return rows.ToDictionary(
            row => row.UserId,
            row => new PublicOwnerAttributionResponse(
                row.Handle!,
                row.DisplayName!,
                MediaDerivatives.ResolveOriginalUrl(row.Avatar, _r2Options.PublicBaseUrl),
                MediaDerivatives.ResolveThumbnailUrl(row.Avatar, _r2Options.PublicBaseUrl)));
    }

    /// <summary>
    /// Like counts for the page, in one grouped query rather than one per
    /// Moment. Counted from the rows: no counter column exists to drift.
    /// </summary>
    private async Task<Dictionary<Guid, int>> LoadLikeCountsAsync(
        IReadOnlyCollection<Guid> momentIds,
        CancellationToken cancellationToken)
    {
        if (momentIds.Count == 0)
        {
            return new Dictionary<Guid, int>();
        }

        var rows = await _dbContext.MomentLikes
            .AsNoTracking()
            .Where(like => momentIds.Contains(like.MomentId))
            .GroupBy(like => like.MomentId)
            .Select(group => new { MomentId = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        return rows.ToDictionary(row => row.MomentId, row => row.Count);
    }

    /// <summary>
    /// Viewer-specific Comment counts, batched for the whole page. This is the
    /// exact predicate the Comment list uses, so a card can never promise more
    /// rows than opening it will show.
    /// </summary>
    private async Task<Dictionary<Guid, int>> LoadCommentCountsAsync(
        IReadOnlyCollection<Guid> momentIds,
        Guid? viewerId,
        CancellationToken cancellationToken)
    {
        if (momentIds.Count == 0)
        {
            return new Dictionary<Guid, int>();
        }

        var rows = await _dbContext.MomentComments
            .VisibleComments(_dbContext, viewerId)
            .Where(comment => momentIds.Contains(comment.MomentId))
            .GroupBy(comment => comment.MomentId)
            .Select(group => new { MomentId = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        return rows.ToDictionary(row => row.MomentId, row => row.Count);
    }

    /// <summary>
    /// Which of the page's Moments this caller has already liked. An anonymous
    /// visitor has liked nothing, and is not asked about.
    /// </summary>
    private async Task<HashSet<Guid>> LoadViewerLikesAsync(
        IReadOnlyCollection<Guid> momentIds,
        Guid? viewerId,
        CancellationToken cancellationToken)
    {
        if (momentIds.Count == 0 || !viewerId.HasValue)
        {
            return new HashSet<Guid>();
        }

        var liked = await _dbContext.MomentLikes
            .AsNoTracking()
            .Where(like => like.UserId == viewerId.Value && momentIds.Contains(like.MomentId))
            .Select(like => like.MomentId)
            .ToListAsync(cancellationToken);

        return liked.ToHashSet();
    }

    private async Task<Dictionary<Guid, MemoryMediaResponse[]>> LoadMediaAsync(
        IReadOnlyCollection<Guid> momentIds,
        SocialMediaResolution resolution,
        CancellationToken cancellationToken)
    {
        if (momentIds.Count == 0)
        {
            return new Dictionary<Guid, MemoryMediaResponse[]>();
        }

        var links = await _dbContext.MediaFileLinks
            .AsNoTracking()
            .Where(link =>
                momentIds.Contains(link.OwnerId)
                && link.OwnerType == MediaOwnerType.PetMemory
                && link.ArchivedAt == null
                && link.MediaFile.UploadStatus == MediaUploadStatus.Ready
                && link.MediaFile.IsPublic
                && link.MediaFile.DeletedAt == null)
            .OrderBy(link => link.SortOrder)
            .Select(link => new
            {
                link.OwnerId,
                link.MediaFileId,
                link.Caption,
                link.AltText,
                link.SortOrder,
                MediaFile = link.MediaFile
            })
            .ToListAsync(cancellationToken);

        return links
            .GroupBy(link => link.OwnerId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .Select(link => new MemoryMediaResponse(
                        link.MediaFileId,
                        link.MediaFile.MediaType == MediaFileType.Video ? "video" : "image",
                        // Images resolve to their derivative; videos resolve to
                        // the video file itself. The type beside it says which
                        // one the client is being handed, so a card never has to
                        // guess from the file extension.
                        resolution == SocialMediaResolution.Full
                            ? MediaDerivatives.ResolveOriginalUrl(
                                link.MediaFile,
                                _r2Options.PublicBaseUrl)
                            : MediaDerivatives.ResolveListUrl(
                                link.MediaFile,
                                _r2Options.PublicBaseUrl),
                        link.Caption,
                        link.AltText,
                        link.SortOrder))
                    .ToArray());
    }
}
