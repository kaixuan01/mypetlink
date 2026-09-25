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
                && moment.DeletedAt == null
                && moment.ArchivedAt == null
                && moment.PublishedAt != null
                && moment.AuthorUser.SocialProfile != null
                && moment.AuthorUser.SocialProfile.IsSocialEnabled
                && moment.AuthorUser.DeletedAt == null
                && moment.AuthorUser.Status == UserStatus.Active);
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
    /// Comments readable by a viewer.
    ///
    /// The author/Moment-author block is global: while either has blocked the
    /// other, their comments on that Moment disappear for everybody. A signed-
    /// in viewer also cannot see comments by an account on either side of a
    /// block with them. Rows are never mutated by these relationships.
    /// </summary>
    public static IQueryable<MomentComment> VisibleComments(
        this IQueryable<MomentComment> comments,
        MyPetLinkDbContext dbContext,
        Guid? viewerId)
    {
        var visible = comments
            .AsNoTracking()
            .Where(comment =>
                comment.DeletedAt == null
                && comment.Moment.Visibility == MemoryVisibility.Public
                && comment.Moment.DeletedAt == null
                && comment.Moment.ArchivedAt == null
                && comment.Moment.PublishedAt != null
                && comment.Moment.AuthorUser.DeletedAt == null
                && comment.Moment.AuthorUser.Status == UserStatus.Active
                && comment.Moment.AuthorUser.SocialProfile != null
                && comment.Moment.AuthorUser.SocialProfile.IsSocialEnabled
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
                        && block.BlockerUserId == comment.Moment.AuthorUserId)));

        if (!viewerId.HasValue)
        {
            return visible;
        }

        var blocked = SocialBlocks.BlockedAccountIds(dbContext, viewerId.Value);
        return visible.Where(comment => !blocked.Contains(comment.AuthorUserId));
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
