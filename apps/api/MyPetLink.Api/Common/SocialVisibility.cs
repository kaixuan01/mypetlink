using Microsoft.EntityFrameworkCore;
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
    /// profile on, pet social on, and owner social on.
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
