using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// One answer to one question: may this pet's Safety Profile offer its Share
/// Profile, and where is it?
///
/// <b>Why this is not written inline in each service.</b> A Smart Tag is an
/// access method, not a different profile — <c>/q/{tagCode}</c>,
/// <c>/n/{tagCode}</c> and legacy <c>/t/{tagCode}</c> resolve the same Safety
/// Profile a finder reaches directly at <c>/q/{safetyCode}</c>. That promise held
/// for the contact actions, the notes and the general area, and quietly did not
/// hold for the Share Profile link: the rule lived in <c>QrSafetyService</c>
/// only, so the same pet offered the link to a finder who typed the safety code
/// and withheld it from a finder who scanned the collar.
///
/// Nothing about the rule differs by entry point, so it lives in exactly one
/// place and both services ask it.
///
/// <b>The rule.</b> Two conditions, both about the Share Profile itself:
/// the owner has switched it on, and the pet's lifecycle still serves that page.
///
/// <b>Community participation is deliberately not among them.</b> The bridge
/// briefly required the pet and its household to be in Community, which withheld
/// an owner's own share link from every household that had not joined — the
/// default state for every existing account. A share link never implies social
/// participation, so it must never require it either.
///
/// Discoverability is not among them for a separate reason: a finder scanned the
/// animal in front of them, which is the opposite of discovery. Treating it as
/// discovery would turn <c>IsDiscoverable</c> into a private-profile switch.
///
/// See docs/architecture/product-model.md.
/// </summary>
public static class ShareProfileBridge
{
    /// <summary>
    /// The pet's public slug when a finder may be offered it, otherwise null.
    ///
    /// Fails closed: a pet whose <c>PublicProfile</c> was not loaded reads as
    /// "not shareable" rather than throwing or guessing, because a caller that
    /// forgot the <c>Include</c> must not be rewarded with a link. Every caller
    /// loads it today — both services need <c>ShowOwnerName</c> from the same
    /// row — so this is a guard, not a supported mode.
    ///
    /// Callers must have already established that the Safety Profile itself is
    /// available (<c>QrSafetyEnabled</c>, and for a tag that the tag is active).
    /// This answers only the Share Profile half of the question.
    /// </summary>
    public static string? ResolveSlug(Pet? pet)
    {
        if (pet is null
            || pet.DeletedAt.HasValue
            || pet.PublicProfile is not { IsPublicProfileEnabled: true }
            || pet.LifecycleStatus != PetLifecycleStatus.Active)
        {
            return null;
        }

        return PetDtoMapper.ResolvePublicSlug(pet);
    }
}
