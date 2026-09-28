using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Common;

/// <summary>
/// What a pet's Share Profile (<c>/p/{slug}</c>) may show — a different
/// question from <see cref="SocialVisibility"/>, and deliberately a different
/// class.
///
/// The Share Profile is the page an owner hands to people. It depends on its
/// own switch, <c>PetPublicProfiles.IsPublicProfileEnabled</c>, and never on
/// Community (product-model.md: "Share Profile must never require
/// Community"). A Moment shared publicly appears on it whether or not the
/// household or the pet takes part in Community; Community decides only where
/// else the Moment is seen — the Community Profile, Home, Explore, its own
/// page — and whether it can be liked and commented on.
///
/// This is not a weaker rule. Only a Moment shared publicly, published, and not
/// deleted, archived or hidden by MyPetLink ever passes; "Only me" never does.
/// Both the profile payload and the paged Moments listing ask these questions,
/// so the page never offers Moments its own listing would refuse.
/// </summary>
public static class ShareProfileVisibility
{
    /// <summary>
    /// Pets whose Share Profile is open: switched on, not deleted, not archived,
    /// and a memorial only when the owner chose to keep it on the Share Profile.
    /// The same rule <c>PublicProfileService.GetByPublicSlugAsync</c> applies
    /// to the page itself.
    /// </summary>
    public static IQueryable<Pet> WithOpenShareProfile(this IQueryable<Pet> pets)
    {
        return pets.Where(pet =>
            pet.DeletedAt == null
            && pet.PublicProfile != null
            && pet.PublicProfile.IsPublicProfileEnabled
            && pet.LifecycleStatus != PetLifecycleStatus.Archived
            && (pet.LifecycleStatus != PetLifecycleStatus.Memorial
                || pet.ShowMemorialOnPublicProfile));
    }

    /// <summary>
    /// Moments that may appear on a Share Profile: shared publicly, published,
    /// and not deleted, archived or hidden by MyPetLink. Which pet's profile,
    /// and whether its Moments or Timeline setting admits it, is the caller's
    /// narrowing.
    /// </summary>
    public static IQueryable<PetMemory> SharedOnShareProfile(this IQueryable<PetMemory> moments)
    {
        return moments.Where(moment =>
            moment.Visibility == MemoryVisibility.Public
            && moment.PublishedAt != null
            && moment.DeletedAt == null
            && moment.ArchivedAt == null
            && moment.ModeratedAt == null);
    }
}
