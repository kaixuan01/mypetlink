using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Common;

/// <summary>
/// The single definition of what may appear socially.
///
/// Every social surface — the public profile listings, the pet Moment feed, and
/// the like endpoints — asks the same question, and must get the same answer. A
/// second copy of these predicates is how a Moment ends up likeable on one route
/// after its owner has taken it out of social on another, so there is exactly
/// one copy and it lives here.
///
/// Each clause is a separate, deliberate consent. None of them is inferred from
/// another: a shareable link is not social participation, and social
/// participation does not override a pet's own visibility.
/// </summary>
public static class SocialVisibility
{
    /// <summary>
    /// Pets that may be shown socially at all: alive, not archived, share
    /// profile on, pet social on, consented by the current owner, and owner
    /// social on.
    /// </summary>
    public static IQueryable<Pet> SociallyVisible(this IQueryable<Pet> pets)
    {
        return pets
            .AsNoTracking()
            .Where(pet =>
                pet.DeletedAt == null
                && pet.LifecycleStatus == PetLifecycleStatus.Active
                && pet.PublicProfile != null
                && pet.PublicProfile.IsPublicProfileEnabled
                && pet.SocialProfile != null
                && pet.SocialProfile.IsSocialEnabled
                // Consent belongs to the person who gave it. If the pet has
                // changed hands since, the stamp no longer matches and the pet
                // is out of Social until its new owner opts in themselves.
                && pet.SocialProfile.ConsentedByUserId == pet.OwnerUserId
                && pet.OwnerUser.SocialProfile != null
                && pet.OwnerUser.SocialProfile.IsSocialEnabled
                && pet.OwnerUser.DeletedAt == null);
    }

    /// <summary>
    /// Moments that may appear in a social listing, or be liked: public, alive,
    /// published, and authored by an account that is still social.
    /// </summary>
    public static IQueryable<PetMemory> SociallyVisible(this IQueryable<PetMemory> moments)
    {
        return moments
            .AsNoTracking()
            .Where(moment =>
                moment.Visibility == MemoryVisibility.Public
                // Hidden by MyPetLink: absent from every social surface, and
                // nothing the owner does can bring it back.
                && moment.ModeratedAt == null
                && moment.DeletedAt == null
                && moment.ArchivedAt == null
                && moment.PublishedAt != null
                && moment.AuthorUser.SocialProfile != null
                && moment.AuthorUser.SocialProfile.IsSocialEnabled
                && moment.AuthorUser.DeletedAt == null
                && moment.AuthorUser.Status == UserStatus.Active);
    }

    /// <summary>
    /// Accounts that currently present a Community identity to this viewer: an
    /// Active, undeleted account whose Community Profile is on and complete,
    /// with no block either way between it and a signed-in viewer. A
    /// restricted household is excluded because restriction switches its
    /// Community Profile off.
    ///
    /// This is what a follower or following list can show, and so it is also
    /// what the counts above those lists count. A count that included a follow
    /// from an owner with no Community Profile announced "12 followers" over a
    /// list of 8, with no way to explain the other 4 without naming accounts
    /// that never chose to be named.
    /// </summary>
    public static IQueryable<Guid> VisibleCommunityAccountIds(
        MyPetLinkDbContext dbContext,
        Guid? viewerId)
    {
        var accounts = dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(profile =>
                profile.IsSocialEnabled
                && profile.Handle != null
                && profile.Handle != ""
                && profile.DisplayName != null
                && profile.DisplayName != ""
                && profile.User.DeletedAt == null
                && profile.User.Status == UserStatus.Active);

        if (viewerId.HasValue)
        {
            var blocked = SocialBlocks.BlockedAccountIds(dbContext, viewerId.Value);
            accounts = accounts.Where(profile => !blocked.Contains(profile.UserId));
        }

        return accounts.Select(profile => profile.UserId);
    }

    /// <summary>
    /// Social Moments visible to this viewer. Anonymous callers get the public
    /// set; a signed-in caller additionally loses Moments whose author is on
    /// either side of a block with them.
    /// </summary>
    public static IQueryable<PetMemory> VisibleTo(
        this IQueryable<PetMemory> moments,
        MyPetLinkDbContext dbContext,
        Guid? viewerId)
    {
        var visible = moments.SociallyVisible();

        if (!viewerId.HasValue)
        {
            return visible;
        }

        var blocked = SocialBlocks.BlockedAccountIds(dbContext, viewerId.Value);
        return visible.Where(moment => !blocked.Contains(moment.AuthorUserId));
    }

    /// <summary>
    /// Comments and Replies readable by a viewer — the one definition every
    /// Comment read uses: threads, Reply pages, counts, anchors, mentions,
    /// reports and moderation context.
    ///
    /// The author/Moment-author block is global: while either has blocked the
    /// other, their comments on that Moment disappear for everybody. A signed-
    /// in viewer also cannot see comments by an account on either side of a
    /// block with them. Rows are never mutated by these relationships.
    ///
    /// A Reply is shown only under its thread. Its parent must be a top-level
    /// Comment on the same Moment that this viewer can read by the same row
    /// rules, and no block may stand, either way, between the Reply's author
    /// and the parent's author — a global rule, like the Moment-author one. So
    /// a deleted, hidden or blocked parent takes its whole thread with it, and
    /// a malformed row (a Reply to a Reply, or to another Moment's Comment, or
    /// to nothing) is never shown, never counted and never nested.
    ///
    /// The parent is reached through its navigation — a join on its primary
    /// key — rather than a correlated EXISTS. With EXISTS inside the OR, SQL
    /// Server abandoned the index seek for batched card counts and scanned every
    /// Comment; the join keeps each read a seek. The row rules are written once
    /// and applied to the parent by substitution, so the two cannot drift.
    /// </summary>
    public static IQueryable<MomentComment> VisibleComments(
        this IQueryable<MomentComment> comments,
        MyPetLinkDbContext dbContext,
        Guid? viewerId)
    {
        var readable = ReadableCommentRow(dbContext, viewerId);

        return comments
            .AsNoTracking()
            .Where(comment =>
                comment.Moment.Visibility == MemoryVisibility.Public
                && comment.Moment.ModeratedAt == null
                && comment.Moment.DeletedAt == null
                && comment.Moment.ArchivedAt == null
                && comment.Moment.PublishedAt != null
                && comment.Moment.AuthorUser.DeletedAt == null
                && comment.Moment.AuthorUser.Status == UserStatus.Active
                && comment.Moment.AuthorUser.SocialProfile != null
                && comment.Moment.AuthorUser.SocialProfile.IsSocialEnabled)
            .Where(readable)
            .Where(InReadableThread(readable, dbContext));
    }

    /// <summary>
    /// The rules one Comment row must meet on its own, whatever its place in a
    /// thread: not deleted, a complete and active author, no block between its
    /// author and the Moment's author, and — for a signed-in viewer — no block
    /// between its author and the viewer.
    /// </summary>
    private static Expression<Func<MomentComment, bool>> ReadableCommentRow(
        MyPetLinkDbContext dbContext,
        Guid? viewerId)
    {
        Expression<Func<MomentComment, bool>> readable = comment =>
            comment.DeletedAt == null
            && comment.AuthorUser.DeletedAt == null
            && comment.AuthorUser.Status == UserStatus.Active
            && comment.AuthorUser.SocialProfile != null
            && comment.AuthorUser.SocialProfile.IsSocialEnabled
            && comment.AuthorUser.SocialProfile.Handle != null
            && comment.AuthorUser.SocialProfile.Handle != ""
            && comment.AuthorUser.SocialProfile.DisplayName != null
            && comment.AuthorUser.SocialProfile.DisplayName != ""
            && !dbContext.OwnerBlocks.Any(block =>
                (block.BlockerUserId == comment.AuthorUserId
                    && block.BlockedUserId == comment.Moment.AuthorUserId)
                || (block.BlockedUserId == comment.AuthorUserId
                    && block.BlockerUserId == comment.Moment.AuthorUserId));

        if (!viewerId.HasValue)
        {
            return readable;
        }

        var blocked = SocialBlocks.BlockedAccountIds(dbContext, viewerId.Value);
        return CommentPredicate.And(readable, comment => !blocked.Contains(comment.AuthorUserId));
    }

    /// <summary>
    /// A top-level Comment, or a Reply whose parent is a readable top-level
    /// Comment on the same Moment with no block between the two authors (R3).
    /// </summary>
    private static Expression<Func<MomentComment, bool>> InReadableThread(
        Expression<Func<MomentComment, bool>> readable,
        MyPetLinkDbContext dbContext)
    {
        Expression<Func<MomentComment, bool>> underTopLevelParent = comment =>
            comment.ParentComment!.ParentCommentId == null
            && comment.ParentComment.MomentId == comment.MomentId
            && !dbContext.OwnerBlocks.Any(block =>
                (block.BlockerUserId == comment.AuthorUserId
                    && block.BlockedUserId == comment.ParentComment.AuthorUserId)
                || (block.BlockedUserId == comment.AuthorUserId
                    && block.BlockerUserId == comment.ParentComment.AuthorUserId));

        return CommentPredicate.Or(
            comment => comment.ParentCommentId == null,
            CommentPredicate.And(
                underTopLevelParent,
                CommentPredicate.OnParent(readable)));
    }

    /// <summary>
    /// Composes Comment predicates into one expression EF can translate — the
    /// only way to state a row rule once and apply it to a row's parent too.
    /// </summary>
    private static class CommentPredicate
    {
        public static Expression<Func<MomentComment, bool>> And(
            Expression<Func<MomentComment, bool>> left,
            Expression<Func<MomentComment, bool>> right) =>
            Combine(left, right, Expression.AndAlso);

        public static Expression<Func<MomentComment, bool>> Or(
            Expression<Func<MomentComment, bool>> left,
            Expression<Func<MomentComment, bool>> right) =>
            Combine(left, right, Expression.OrElse);

        /// <summary>The same predicate, asked of <c>comment.ParentComment</c>.</summary>
        public static Expression<Func<MomentComment, bool>> OnParent(
            Expression<Func<MomentComment, bool>> predicate)
        {
            var comment = Expression.Parameter(typeof(MomentComment), "comment");
            var parent = Expression.Property(comment, nameof(MomentComment.ParentComment));
            return Expression.Lambda<Func<MomentComment, bool>>(
                Replace(predicate.Body, predicate.Parameters[0], parent),
                comment);
        }

        private static Expression<Func<MomentComment, bool>> Combine(
            Expression<Func<MomentComment, bool>> left,
            Expression<Func<MomentComment, bool>> right,
            Func<Expression, Expression, BinaryExpression> join)
        {
            var comment = left.Parameters[0];
            return Expression.Lambda<Func<MomentComment, bool>>(
                join(left.Body, Replace(right.Body, right.Parameters[0], comment)),
                comment);
        }

        private static Expression Replace(Expression body, ParameterExpression from, Expression to) =>
            new ParameterReplacer(from, to).Visit(body);

        private sealed class ParameterReplacer(ParameterExpression from, Expression to) : ExpressionVisitor
        {
            protected override Expression VisitParameter(ParameterExpression node) =>
                node == from ? to : base.VisitParameter(node);
        }
    }
    /// <summary>
    /// Mentions that may be shown to this viewer right now: as a link inside a
    /// Comment, or as "mentioned you" Activity.
    ///
    /// The one definition both surfaces use. A mention shows only while its
    /// Comment is readable by the viewer, the mentioned household is an Active
    /// account with a complete Community identity, and no block stands between
    /// that household and the commenter or the Moment's author — the same
    /// people a mention was checked against when it was written. A signed-in
    /// viewer on either side of a block with the mentioned household, or with
    /// the Moment's author, sees none. Nothing here deletes a row: when a
    /// block lifts or a household comes back to Community, the mention links
    /// again, always to the account it was written for.
    /// </summary>
    public static IQueryable<MomentCommentMention> VisibleCommentMentions(
        this IQueryable<MomentCommentMention> mentions,
        MyPetLinkDbContext dbContext,
        Guid? viewerId)
    {
        var visibleComments = dbContext.MomentComments.VisibleComments(dbContext, viewerId);
        var visible = mentions
            .AsNoTracking()
            .Where(mention =>
                visibleComments.Any(comment => comment.Id == mention.CommentId)
                && mention.MentionedUser.DeletedAt == null
                && mention.MentionedUser.Status == UserStatus.Active
                && mention.MentionedUser.SocialProfile != null
                && mention.MentionedUser.SocialProfile.IsSocialEnabled
                && mention.MentionedUser.SocialProfile.Handle != null
                && mention.MentionedUser.SocialProfile.Handle != ""
                && mention.MentionedUser.SocialProfile.DisplayName != null
                && mention.MentionedUser.SocialProfile.DisplayName != ""
                && !dbContext.OwnerBlocks.Any(block =>
                    (block.BlockerUserId == mention.MentionedUserId
                        && (block.BlockedUserId == mention.Comment.AuthorUserId
                            || block.BlockedUserId == mention.Comment.Moment.AuthorUserId))
                    || (block.BlockedUserId == mention.MentionedUserId
                        && (block.BlockerUserId == mention.Comment.AuthorUserId
                            || block.BlockerUserId == mention.Comment.Moment.AuthorUserId))));

        if (!viewerId.HasValue)
        {
            return visible;
        }

        var blocked = SocialBlocks.BlockedAccountIds(dbContext, viewerId.Value);
        return visible.Where(mention =>
            !blocked.Contains(mention.MentionedUserId)
            && !blocked.Contains(mention.Comment.Moment.AuthorUserId));
    }

    /// <summary>
    /// Collaborator pets that may be shown on a Moment right now.
    ///
    /// The one definition every surface uses — cards, Moment detail, a pet's
    /// Moments and its Share Profile — so a collaboration can never be visible
    /// on one surface after it has stopped being eligible on another. It reads
    /// only rows an accepted collaboration created (Pending never has any) and
    /// re-checks everything that could have changed since the invitee accepted:
    /// the Moment is still socially visible, the pet is still the invitee's and
    /// still shared with their consent, the invitee's household is still an
    /// active, complete Community identity, and no block stands between the
    /// invitee and the author — or, for a signed-in viewer, between the viewer
    /// and the invitee.
    /// </summary>
    public static IQueryable<MomentPet> VisibleCollaboratorSubjects(
        this IQueryable<MomentPet> subjects,
        MyPetLinkDbContext dbContext,
        Guid? viewerId)
    {
        var visible = subjects
            .AsNoTracking()
            .Where(subject =>
                subject.CollaborationId != null
                && subject.Collaboration!.Status == MomentCollaborationStatus.Accepted
                && subject.Collaboration.MomentId == subject.MomentId
                && subject.Collaboration.InviteeUserId == subject.Pet.OwnerUserId
                && subject.Moment.Visibility == MemoryVisibility.Public
                && subject.Moment.ModeratedAt == null
                && subject.Moment.DeletedAt == null
                && subject.Moment.ArchivedAt == null
                && subject.Moment.PublishedAt != null
                && subject.Moment.AuthorUser.DeletedAt == null
                && subject.Moment.AuthorUser.Status == UserStatus.Active
                && subject.Moment.AuthorUser.SocialProfile != null
                && subject.Moment.AuthorUser.SocialProfile.IsSocialEnabled
                && subject.Pet.DeletedAt == null
                && subject.Pet.LifecycleStatus == PetLifecycleStatus.Active
                && subject.Pet.PublicProfile != null
                && subject.Pet.PublicProfile.IsPublicProfileEnabled
                && subject.Pet.SocialProfile != null
                && subject.Pet.SocialProfile.IsSocialEnabled
                && subject.Pet.SocialProfile.ConsentedByUserId == subject.Pet.OwnerUserId
                && subject.Collaboration.InviteeUser.DeletedAt == null
                && subject.Collaboration.InviteeUser.Status == UserStatus.Active
                && subject.Collaboration.InviteeUser.SocialProfile != null
                && subject.Collaboration.InviteeUser.SocialProfile.IsSocialEnabled
                && subject.Collaboration.InviteeUser.SocialProfile.Handle != null
                && subject.Collaboration.InviteeUser.SocialProfile.Handle != ""
                && subject.Collaboration.InviteeUser.SocialProfile.DisplayName != null
                && subject.Collaboration.InviteeUser.SocialProfile.DisplayName != ""
                && !dbContext.OwnerBlocks.Any(block =>
                    (block.BlockerUserId == subject.Collaboration.InviteeUserId
                        && block.BlockedUserId == subject.Moment.AuthorUserId)
                    || (block.BlockedUserId == subject.Collaboration.InviteeUserId
                        && block.BlockerUserId == subject.Moment.AuthorUserId)));

        if (!viewerId.HasValue)
        {
            return visible;
        }

        var blocked = SocialBlocks.BlockedAccountIds(dbContext, viewerId.Value);
        return visible.Where(subject => !blocked.Contains(subject.Collaboration!.InviteeUserId));
    }
}

/// <summary>
/// The one interpretation of blocking.
///
/// A block is stored in one direction and enforced in both. Every surface that
/// has to exclude somebody — the feed, Explore, search, follower lists, likes —
/// asks this the same way, because two readings of "blocked" is how content
/// disappears from one screen and not another.
/// </summary>
public static class SocialBlocks
{
    /// <summary>
    /// Every account on either side of a block with this viewer, as a subquery.
    ///
    /// Composable into a larger query rather than materialised: a caller writes
    /// <c>!BlockedAccountIds(db, viewer).Contains(x.AuthorUserId)</c> and the
    /// database evaluates it as a NOT EXISTS against
    /// <c>IX_OwnerBlocks_BlockerUserId_BlockedUserId</c> and
    /// <c>IX_OwnerBlocks_BlockedUserId</c>.
    /// </summary>
    public static IQueryable<Guid> BlockedAccountIds(
        MyPetLinkDbContext dbContext,
        Guid viewerId)
    {
        return dbContext.OwnerBlocks
            .AsNoTracking()
            .Where(block =>
                block.BlockerUserId == viewerId || block.BlockedUserId == viewerId)
            .Select(block =>
                block.BlockerUserId == viewerId
                    ? block.BlockedUserId
                    : block.BlockerUserId);
    }
}
