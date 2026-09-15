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
                && moment.AuthorUser.DeletedAt == null);
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
