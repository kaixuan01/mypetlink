namespace MyPetLink.Api.Entities;

public sealed class PetMemory : AuditableEntity
{
    /// <summary>
    /// The PRIMARY pet this Moment is about. Required, and the key that owns the
    /// pet's Moments tab, the Life Timeline and the plan allowance. Additional
    /// subjects live in <see cref="MomentPet"/>; they never consume an allowance.
    /// </summary>
    public Guid PetId { get; set; }

    /// <summary>
    /// The authenticated user who authored this Moment.
    ///
    /// This is a DOMAIN RELATIONSHIP, not a denormalisation of the pet's owner.
    /// It records who wrote the thing, and it is IMMUTABLE: if Alice creates a
    /// Moment about Mochi and Mochi is later transferred to Bob, the Moment was
    /// still authored by Alice and this column must still say Alice. Ownership
    /// transfer never rewrites authorship.
    ///
    /// That it also lets a later feed join straight from the follow graph to
    /// Moments, without a hop through Pets, is a secondary benefit — not the
    /// reason the column exists.
    /// </summary>
    public Guid AuthorUserId { get; set; }

    /// <summary>
    /// When this Moment first became public — its social publication time.
    ///
    /// Deliberately distinct from <see cref="MomentDate"/>, which is the date
    /// the memory is ABOUT and can be backdated years, and from
    /// <c>CreatedAt</c>, which is when the row was written and is set even for a
    /// Moment that is never made public. Set once, on the first transition to
    /// Public, and never bumped by an ordinary edit, so editing an old caption
    /// cannot push a Moment back to the top of a feed.
    /// </summary>
    public DateTimeOffset? PublishedAt { get; set; }

    // Like and comment counters are deliberately absent until the phases that
    // write them. MomentLike exists as schema only; nothing increments anything
    // yet, and a counter with no writer is a value that silently reads zero.
    // They land with the like endpoint, in the same SaveChanges as the like row,
    // covered by a relational concurrency test.

    public string Title { get; set; } = "";
    public DateOnly? MomentDate { get; set; }
    public string? Type { get; set; }
    public string? Caption { get; set; }
    public MemoryVisibility Visibility { get; set; } = MemoryVisibility.Private;
    /// <summary>
    /// COMPATIBILITY ONLY — do not read this to decide whether a Moment is
    /// public. <see cref="Visibility"/> is the authoritative field.
    ///
    /// Retained so a previously deployed client still finds the value it
    /// expects. It is derived from <see cref="Visibility"/> on every write by
    /// <c>MyPetLinkDbContext.DeriveMemoryVisibilityCompatibilityFlag</c>, so the
    /// two can never disagree in the database.
    /// </summary>
    public bool ShowOnPublicProfile { get; set; }
    public bool ShowInLifeTimeline { get; set; }
    public string? TimelineNote { get; set; }
    public Guid? CoverMediaFileId { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }

    public Pet Pet { get; set; } = null!;
    public User AuthorUser { get; set; } = null!;
    public MediaFile? CoverMediaFile { get; set; }
    public ICollection<MomentPet> MomentPets { get; set; } = new List<MomentPet>();
    public ICollection<MomentLike> Likes { get; set; } = new List<MomentLike>();
    public ICollection<MomentComment> Comments { get; set; } = new List<MomentComment>();
    public ICollection<MomentCollaboration> Collaborations { get; set; } = new List<MomentCollaboration>();
}

public sealed class CareRecord : AuditableEntity
{
    public Guid PetId { get; set; }
    public Guid? FulfillsCareRecordId { get; set; }
    public CareRecordType Type { get; set; } = CareRecordType.Other;
    public string Title { get; set; } = "";
    public string? CareName { get; set; }
    public DateOnly? RecordDate { get; set; }
    public DateOnly? DueDate { get; set; }
    public string? Provider { get; set; }
    public string? Notes { get; set; }
    public CareRecordPublicVisibility PublicVisibility { get; set; } = CareRecordPublicVisibility.Private;
    public DateTimeOffset? ArchivedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }

    public Pet Pet { get; set; } = null!;
    public CareRecord? FulfillsCareRecord { get; set; }
}

public sealed class MediaFile : Entity
{
    public Guid? OwnerUserId { get; set; }
    public Guid? PetId { get; set; }
    public string OriginalFileName { get; set; } = "";
    public string StorageFileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long FileSize { get; set; }
    public string StorageProvider { get; set; } = "Local";
    public string StoragePath { get; set; } = "";
    public string BucketName { get; set; } = "";
    public string ObjectKey { get; set; } = "";
    /// <summary>
    /// Object key of the resized derivative, when one exists. A reader must
    /// always tolerate this being null and fall back to the original: files
    /// uploaded before the derivative pipeline existed have no thumbnail, and
    /// generation is allowed to fail without failing the upload.
    /// </summary>
    public string? ThumbnailObjectKey { get; set; }

    /// <summary>
    /// Whether a derivative is expected, present, or was attempted and failed.
    /// Exists so a later retry or backfill can find the files still needing one;
    /// no read path depends on it.
    /// </summary>
    public MediaDerivativeStatus DerivativeStatus { get; set; } = MediaDerivativeStatus.NotApplicable;
    public MediaFileType MediaType { get; set; } = MediaFileType.Document;
    public MediaUploadCategory Category { get; set; } = MediaUploadCategory.Other;
    public bool IsPublic { get; set; }
    public MediaUploadStatus UploadStatus { get; set; } = MediaUploadStatus.Ready;
    public string Sha256 { get; set; } = "";
    public int? Width { get; set; }
    public int? Height { get; set; }
    public int? DurationSeconds { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }

    public User? OwnerUser { get; set; }
    public Pet? Pet { get; set; }
    public ICollection<MediaFileLink> Links { get; set; } = new List<MediaFileLink>();
}

public sealed class MediaFileLink : Entity
{
    public Guid MediaFileId { get; set; }
    public MediaOwnerType OwnerType { get; set; } = MediaOwnerType.Other;
    public Guid OwnerId { get; set; }
    public int SortOrder { get; set; }
    public string? Caption { get; set; }
    public string? AltText { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ArchivedAt { get; set; }

    public MediaFile MediaFile { get; set; } = null!;
}
