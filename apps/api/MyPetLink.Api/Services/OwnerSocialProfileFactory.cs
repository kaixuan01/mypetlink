using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// The one definition of "a social profile row that exists but has not joined
/// anything".
///
/// Every account gets a row so settings always have something to read, but the
/// row must never imply participation. Creating it here, in one place, is what
/// stops a second code path from quietly defaulting a switch to true or seeding
/// a name from the account.
/// </summary>
public static class OwnerSocialProfileFactory
{
    public static OwnerSocialProfile CreateDisabled(Guid userId)
    {
        return new OwnerSocialProfile
        {
            UserId = userId,

            // Deliberately empty. Never User.DisplayName, never
            // OwnerProfile.OwnerDisplayName, never the email local-part: those
            // are the account and finder identities, and reusing either would
            // publish a real name as a side effect of signing up.
            Handle = null,
            NormalizedHandle = null,
            DisplayName = null,
            NormalizedDisplayName = null,
            Bio = null,
            AvatarMediaFileId = null,
            GeneralArea = null,

            IsSocialEnabled = false,
            IsDiscoverable = false,
            AllowFollowers = true
        };
    }
}
