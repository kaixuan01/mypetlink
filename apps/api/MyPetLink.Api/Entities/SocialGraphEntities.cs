namespace MyPetLink.Api.Entities;

/// <summary>
/// One account following another.
///
/// The follower and the followed are both accounts, never pets. A pet is the
/// subject of the content and the identity on a Smart Tag; the household is who
/// you subscribe to. Following households also means one Moment is one feed row
/// however many pets it is about — following two pets of the same home cannot
/// show you the same beach photo twice.
///
/// Unfollowing deletes the row. There is no soft delete: a tombstone would only
/// serve analytics, and it would complicate both the uniqueness guarantee and
/// the counters that depend on it.
/// </summary>
public sealed class OwnerFollow : Entity
{
    public Guid FollowerUserId { get; set; }
    public Guid FollowedUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User FollowerUser { get; set; } = null!;
    public User FollowedUser { get; set; } = null!;
}

/// <summary>
/// One account blocking another.
///
/// Blocking is account level, not pet level, because that is what a person
/// actually wants: blocking a household blocks every pet in it, which a
/// pet-only graph cannot express.
///
/// The row is stored one-directional and must be ENFORCED SYMMETRICALLY. A
/// blocked pair must be invisible to each other in every read — feed, discovery,
/// search, follower and following lists, like lists and profile views — not
/// merely prevented from writing.
/// </summary>
public sealed class OwnerBlock : Entity
{
    public Guid BlockerUserId { get; set; }
    public Guid BlockedUserId { get; set; }

    /// <summary>
    /// The blocker's own note. Private to them and to support; never returned
    /// to the blocked account and never part of any public projection.
    /// </summary>
    public string? Reason { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User BlockerUser { get; set; } = null!;
    public User BlockedUser { get; set; } = null!;
}

/// <summary>
/// One pet's participation in the social network.
///
/// Deliberately NOT part of <see cref="PetPublicProfile"/>.
/// <c>PetPublicProfile.IsPublicProfileEnabled</c> means "I am happy to hand this
/// link to friends and family". Being browsable by strangers in a discovery
/// surface is a different thing to agree to, and reusing the existing flag would
/// enrol every already-public pet into a network its owner never joined.
///
/// Both switches start off, for existing pets and new ones alike.
/// </summary>
public sealed class PetSocialProfile : AuditableEntity
{
    public Guid PetId { get; set; }

    /// <summary>Whether this pet appears as a social subject at all.</summary>
    public bool IsSocialEnabled { get; set; }

    /// <summary>
    /// Whether this pet may surface in discovery to someone who was not given a
    /// link. Independent of <see cref="IsSocialEnabled"/>.
    /// </summary>
    public bool IsDiscoverable { get; set; }

    // No PublicMomentCount here yet. Nothing maintains it, and a count that is
    // never written reads zero forever — which the first screen to bind to it
    // would display as fact. It arrives with the surface that needs it.

    public byte[] RowVersion { get; set; } = [];

    public Pet Pet { get; set; } = null!;
}

/// <summary>
/// Membership: a pet that a Moment is about.
///
/// <b>This table carries no notion of "primary".</b>
/// <see cref="PetMemory.PetId"/> is the single authoritative primary subject —
/// it owns the pet's Moments tab, the Life Timeline and the plan allowance. The
/// primary pet is simply the membership row whose <see cref="PetId"/> equals
/// <see cref="PetMemory.PetId"/>; it needs no stored flag to say so.
///
/// An earlier draft of this table had an <c>IsPrimary</c> column. It was removed
/// because it created a second source of truth that the database could not keep
/// honest: nothing at the schema level could stop
/// <c>PetMemory.PetId = Mochi</c> coexisting with
/// <c>MomentPet(Coco, IsPrimary = true)</c>, and application-only
/// synchronisation is not a guarantee. Deriving the primary from the one column
/// that already owns it makes that state unrepresentable.
///
/// Every Moment must have a membership row for its primary pet. That invariant
/// is maintained by <c>MemoryService</c> and covered by relational tests. Note
/// its failure mode is weak by construction: a membership row can only ever be
/// *missing*, never *contradictory*, and the next write repairs it.
///
/// Only the primary pet consumes a plan allowance. A Moment about three pets is
/// one Moment, not three.
/// </summary>
public sealed class MomentPet : Entity
{
    public Guid MomentId { get; set; }
    public Guid PetId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public PetMemory Moment { get; set; } = null!;
    public Pet Pet { get; set; } = null!;
}

/// <summary>
/// One account's like on one Moment.
///
/// The account likes, never a pet. One like per account per Moment is enforced
/// by a unique index rather than by a read-then-write in the service, so
/// concurrent requests resolve in the database: a duplicate-key violation is
/// caught and reported as success, which makes the endpoint idempotent by
/// construction.
/// </summary>
public sealed class MomentLike : Entity
{
    public Guid MomentId { get; set; }
    public Guid UserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public PetMemory Moment { get; set; } = null!;
    public User User { get; set; } = null!;
}

/// <summary>
/// An in-app activity notification addressed to a human owner.
///
/// In-app only. Social email is not modelled: every existing
/// <see cref="EmailMessageType"/> is transactional or commercial behind the
/// two-level template gate, and social email is both a new consent category and
/// an abuse amplifier — a mass-follow script would become a mass-email script.
///
/// The copy is about pets even though the recipient is a person: "The Lim Family
/// liked your Moment of Mochi".
/// </summary>
public sealed class OwnerNotification : Entity
{
    public Guid RecipientUserId { get; set; }

    /// <summary>Who caused it. Null for a system or moderation notice.</summary>
    public Guid? ActorUserId { get; set; }

    /// <summary>The recipient's pet this is about, when there is one.</summary>
    public Guid? SubjectPetId { get; set; }

    public Guid? MomentId { get; set; }

    public OwnerNotificationType Type { get; set; } = OwnerNotificationType.Unknown;

    public DateTimeOffset? ReadAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User RecipientUser { get; set; } = null!;
    public User? ActorUser { get; set; }
    public Pet? SubjectPet { get; set; }
    public PetMemory? Moment { get; set; }
}
