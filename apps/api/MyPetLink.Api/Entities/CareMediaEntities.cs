namespace MyPetLink.Api.Entities;

public sealed class PetMemory : AuditableEntity
{
    public Guid PetId { get; set; }
    public string Title { get; set; } = "";
    public DateOnly? MomentDate { get; set; }
    public string? Type { get; set; }
    public string? Caption { get; set; }
    public MemoryVisibility Visibility { get; set; } = MemoryVisibility.Private;
    public bool ShowOnPublicProfile { get; set; }
    public bool ShowInLifeTimeline { get; set; }
    public string? TimelineNote { get; set; }
    public Guid? CoverMediaFileId { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }

    public Pet Pet { get; set; } = null!;
    public MediaFile? CoverMediaFile { get; set; }
}

public sealed class CareRecord : AuditableEntity
{
    public Guid PetId { get; set; }
    public CareRecordType Type { get; set; } = CareRecordType.Other;
    public string Title { get; set; } = "";
    public DateOnly? RecordDate { get; set; }
    public DateOnly? DueDate { get; set; }
    public string? Provider { get; set; }
    public string? Notes { get; set; }
    public CareRecordPublicVisibility PublicVisibility { get; set; } = CareRecordPublicVisibility.Private;
    public DateTimeOffset? ArchivedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }

    public Pet Pet { get; set; } = null!;
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
    public string? ThumbnailObjectKey { get; set; }
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
