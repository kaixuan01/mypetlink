using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// How a moderator reads Community content and households, shared by the
/// report detail and the direct moderation screens so both show the same thing
/// the same way.
///
/// Every read here is privileged: blocks, Community switch-offs, removal,
/// hiding and restriction hide nothing from a moderator, and none of this
/// widens a public query. "Publicly visible" always means what an anonymous
/// reader would see now.
/// </summary>
internal sealed class AdminCommunityContentReader
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly string? _publicMediaBaseUrl;

    public AdminCommunityContentReader(MyPetLinkDbContext dbContext, string? publicMediaBaseUrl)
    {
        _dbContext = dbContext;
        _publicMediaBaseUrl = publicMediaBaseUrl;
    }

    public static string DescribeRemover(Guid? removedBy, Guid authorId, Guid momentAuthorId) =>
        removedBy == authorId ? "Author"
        : removedBy == momentAuthorId ? "MomentAuthor"
        : "MyPetLink";

    public sealed record CommentRow(
        Guid Id,
        Guid MomentId,
        Guid AuthorUserId,
        Guid MomentAuthorUserId,
        string Body,
        DateTimeOffset CreatedAt,
        DateTimeOffset? DeletedAt,
        Guid? DeletedByUserId,
        bool PubliclyVisible,
        Guid? ParentCommentId,
        int? ReplyCount);

    /// <summary>
    /// A Comment or Reply as it is now. Publicly visible means what an
    /// anonymous reader would see, so a Reply under a removed or hidden parent
    /// reads as not visible even while its own row is intact.
    /// </summary>
    public async Task<CommentRow?> LoadCommentAsync(Guid commentId, CancellationToken cancellationToken)
    {
        var publiclyVisible = _dbContext.MomentComments.VisibleComments(_dbContext, null);
        return await _dbContext.MomentComments
            .AsNoTracking()
            .Where(comment => comment.Id == commentId)
            .Select(comment => new CommentRow(
                comment.Id,
                comment.MomentId,
                comment.AuthorUserId,
                comment.Moment.AuthorUserId,
                comment.Body,
                comment.CreatedAt,
                comment.DeletedAt,
                comment.DeletedByUserId,
                publiclyVisible.Any(visible => visible.Id == comment.Id),
                comment.ParentCommentId,
                // The thread removing this Comment would hide, as readers see it now.
                comment.ParentCommentId == null
                    ? publiclyVisible.Count(visible => visible.ParentCommentId == comment.Id)
                    : (int?)null))
            .SingleOrDefaultAsync(cancellationToken);
    }

    public sealed record MomentRow(
        Guid Id,
        Guid AuthorUserId,
        string Title,
        string? Caption,
        MemoryVisibility Visibility,
        DateTimeOffset? PublishedAt,
        DateTimeOffset? ArchivedAt,
        DateTimeOffset? DeletedAt,
        DateTimeOffset? ModeratedAt,
        bool PubliclyVisible,
        IReadOnlyList<AdminCommunityMediaResponse> Media);

    public async Task<MomentRow?> LoadMomentAsync(Guid momentId, CancellationToken cancellationToken)
    {
        var publiclyVisible = _dbContext.PetMemories.SociallyVisible();
        var moment = await _dbContext.PetMemories
            .AsNoTracking()
            .Where(item => item.Id == momentId)
            .Select(item => new
            {
                item.Id,
                item.AuthorUserId,
                item.Title,
                item.Caption,
                item.Visibility,
                item.PublishedAt,
                item.ArchivedAt,
                item.DeletedAt,
                item.ModeratedAt,
                PubliclyVisible = publiclyVisible.Any(visible => visible.Id == item.Id)
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (moment is null)
        {
            return null;
        }

        // The media the Moment shows, by reference: the same files and URLs a
        // viewer would be handed, never storage keys or bucket details.
        var media = await _dbContext.MediaFileLinks
            .AsNoTracking()
            .Where(link =>
                link.OwnerId == momentId
                && link.OwnerType == MediaOwnerType.PetMemory
                && link.ArchivedAt == null
                && link.MediaFile.UploadStatus == MediaUploadStatus.Ready
                && link.MediaFile.IsPublic
                && link.MediaFile.DeletedAt == null)
            .OrderBy(link => link.SortOrder)
            .Select(link => new { link.MediaFileId, link.Caption, link.AltText, link.SortOrder, link.MediaFile })
            .ToListAsync(cancellationToken);

        return new MomentRow(
            moment.Id,
            moment.AuthorUserId,
            moment.Title,
            moment.Caption,
            moment.Visibility,
            moment.PublishedAt,
            moment.ArchivedAt,
            moment.DeletedAt,
            moment.ModeratedAt,
            moment.PubliclyVisible,
            media.Select(link => new AdminCommunityMediaResponse(
                    link.MediaFileId,
                    link.MediaFile.MediaType == MediaFileType.Video ? "video" : "image",
                    MediaDerivatives.ResolveListUrl(link.MediaFile, _publicMediaBaseUrl),
                    link.Caption,
                    link.AltText,
                    link.SortOrder))
                .ToArray());
    }

    /// <summary>
    /// Households by account, as a moderator sees them now. One query for any
    /// number of them, so a page of the queue never costs a query per row.
    /// </summary>
    public async Task<Dictionary<Guid, AdminCommunityHouseholdResponse>> LoadHouseholdsAsync(
        IEnumerable<Guid> userIds,
        CancellationToken cancellationToken)
    {
        var ids = userIds.Distinct().ToArray();
        var rows = await _dbContext.Users
            .AsNoTracking()
            .Where(user => ids.Contains(user.Id))
            .Select(user => new
            {
                user.Id,
                user.Status,
                user.DeletedAt,
                Handle = user.SocialProfile == null ? null : user.SocialProfile.Handle,
                DisplayName = user.SocialProfile == null ? null : user.SocialProfile.DisplayName,
                Enabled = user.SocialProfile != null && user.SocialProfile.IsSocialEnabled,
                RestrictedAt = user.SocialProfile == null ? null : user.SocialProfile.CommunityRestrictedAt,
                RestrictedUntil = user.SocialProfile == null ? null : user.SocialProfile.CommunityRestrictedUntil
            })
            .ToListAsync(cancellationToken);

        var households = rows.ToDictionary(
            row => row.Id,
            row => new AdminCommunityHouseholdResponse(
                row.Id,
                row.Handle,
                row.DisplayName,
                row.Enabled,
                row.RestrictedAt.HasValue,
                row.RestrictedAt,
                row.Status == UserStatus.Active && row.DeletedAt == null,
                row.RestrictedUntil));

        // Report foreign keys are Restrict, so every id resolves; this only
        // keeps a projection total if that ever stops being true.
        foreach (var id in ids.Where(id => !households.ContainsKey(id)))
        {
            households[id] = new AdminCommunityHouseholdResponse(id, null, null, false, false, null, false);
        }

        return households;
    }
}
