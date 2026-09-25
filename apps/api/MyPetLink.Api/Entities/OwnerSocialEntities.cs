namespace MyPetLink.Api.Entities;

/// <summary>
/// An owner's PUBLIC social identity.
///
/// MyPetLink keeps three owner identities apart, and they must never be
/// collapsed into one another:
///
/// <list type="bullet">
/// <item><b>Account identity</b> — <see cref="User.Email"/> and
/// <see cref="User.DisplayName"/>. Sign-in and support. Never public.</item>
/// <item><b>Finder identity</b> — <c>OwnerProfile.OwnerDisplayName</c>, seeded
/// from the Google account name and shown to a person who found a lost pet when
/// the owner enables <c>PetPublicProfile.ShowOwnerName</c>. Using a real name
/// there is the right choice, which is exactly why it cannot be reused
/// here.</item>
/// <item><b>Social identity</b> — this row. A handle, a chosen display name, a
/// bio and an avatar, consented to separately from both of the above.</item>
/// </list>
///
/// Nothing populates <see cref="Handle"/> or <see cref="DisplayName"/>
/// automatically. A row exists for every account so settings always have
/// something to read, but it is created switched off and empty: enrolling in a
/// social network is an act the owner performs, never a side effect of having
/// signed up or of having shared a pet profile.
/// </summary>
public sealed class OwnerSocialProfile : AuditableEntity
{
    public Guid UserId { get; set; }

    /// <summary>The handle as the owner typed it, preserving their casing for display.</summary>
    public string? Handle { get; set; }

    /// <summary>
    /// Lower-cased <see cref="Handle"/>. This is the uniqueness key and the
    /// lookup key, so two handles differing only in case can never both exist.
    /// </summary>
    public string? NormalizedHandle { get; set; }

    /// <summary>
    /// The owner's chosen public name — typically a household name such as
    /// "Mochi &amp; Coco's Family". Never seeded from the account or the
    /// finder-facing name.
    /// </summary>
    public string? DisplayName { get; set; }

    /// <summary>Lower-cased <see cref="DisplayName"/> for prefix search in a later phase.</summary>
    public string? NormalizedDisplayName { get; set; }

    public string? Bio { get; set; }

    public Guid? AvatarMediaFileId { get; set; }

    /// <summary>
    /// A broad area such as a city. Held to the same rules as a pet's general
    /// area (see <c>GeneralAreaRules</c>): never a street address, never
    /// precise, and never populated from any automatic location source.
    /// </summary>
    public string? GeneralArea { get; set; }

    /// <summary>Participation in the social network. Off until the owner turns it on.</summary>
    public bool IsSocialEnabled { get; set; }

    /// <summary>
    /// A Community-only restriction by MyPetLink. While set, Community is
    /// forced off (<see cref="IsSocialEnabled"/> is false, which every Community
    /// visibility rule already requires) and the owner cannot turn it back on.
    /// Sign-in, the Owner Portal, pets, Share and Safety Profiles, Smart Tags,
    /// Lost Mode and orders are untouched: this is never an account suspension.
    /// </summary>
    public DateTimeOffset? CommunityRestrictedAt { get; set; }

    /// <summary>The Admin Portal user who applied the restriction.</summary>
    public Guid? CommunityRestrictedByUserId { get; set; }
    public User? CommunityRestrictedByUser { get; set; }

    /// <summary>
    /// The owner's own Community choice, kept while restricted, so lifting the
    /// restriction restores exactly that choice rather than switching Community
    /// on for somebody who had turned it off. Turning Community off while
    /// restricted updates it. Null exactly when not restricted.
    /// </summary>
    public bool? CommunityEnabledBeforeRestriction { get; set; }

    /// <summary>
    /// Appearing in discovery surfaces to people who were not given a link.
    /// Independent of <see cref="IsSocialEnabled"/>, so an owner can be
    /// followable without being browsable.
    /// </summary>
    public bool IsDiscoverable { get; set; }

    public bool AllowFollowers { get; set; } = true;

    // No follower/following counters here yet, on purpose. A denormalised count
    // is only correct if something updates it in the same transaction as the row
    // it counts, and nothing follows anyone until Phase 1G. They arrive with
    // OwnerFollow's write path and its concurrency test, not before.

    public byte[] RowVersion { get; set; } = [];

    public User User { get; set; } = null!;
    public MediaFile? AvatarMediaFile { get; set; }
}

/// <summary>
/// A handle that cannot be claimed, and why.
///
/// Two jobs in one table. <see cref="OwnerHandleReservationReason.System"/> rows
/// are seeded permanently and cover application routes, brand terms and support
/// identities, so nobody can present themselves as MyPetLink.
/// <see cref="OwnerHandleReservationReason.Released"/> rows are written when an
/// account gives a handle up, and expire: without the hold, a link someone
/// shared last week could start resolving to a stranger's profile.
/// </summary>
public sealed class OwnerHandleReservation : AuditableEntity
{
    public string NormalizedHandle { get; set; } = "";

    public OwnerHandleReservationReason Reason { get; set; } = OwnerHandleReservationReason.System;

    /// <summary>When the hold lapses. <c>null</c> means permanent.</summary>
    public DateTimeOffset? HeldUntil { get; set; }

    /// <summary>The account that released it, for support lookups. Never public.</summary>
    public Guid? PreviousUserId { get; set; }

    public User? PreviousUser { get; set; }
}

/// <summary>
/// Every handle an account has previously held.
///
/// Two purposes: a later phase can answer a request for an old handle with a
/// redirect instead of a dead link, and moderation can see whether an account
/// has been cycling through names that impersonate someone.
/// </summary>
public sealed class OwnerHandleHistory : Entity
{
    public Guid UserId { get; set; }

    public string Handle { get; set; } = "";
    public string NormalizedHandle { get; set; } = "";

    /// <summary>When this handle stopped being the account's current one.</summary>
    public DateTimeOffset ChangedAt { get; set; } = DateTimeOffset.UtcNow;

    public User User { get; set; } = null!;
}
