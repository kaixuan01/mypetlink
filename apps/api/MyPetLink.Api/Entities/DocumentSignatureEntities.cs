namespace MyPetLink.Api.Entities;

/// <summary>Why a signature stopped being the one on file.</summary>
public enum DocumentSignatureEndReason
{
    Replaced,
    Removed,
}

// One administrator's own signature, kept on file so they can sign the documents they issue.
// The image is private: stored here, never in public media storage, and served only to its owner.
// A saved version is never edited. Changing the image, name or position saves a new version and
// retires the old one; retiring erases the image and keeps only its fingerprint. A document
// already signed carries its own copy of the image inside its frozen PDF, so nothing done here
// can change it.
public sealed class DocumentSignature : Entity
{
    /// <summary>Whose signature this is. Only this administrator may manage or apply it.</summary>
    public Guid SignatoryAdminUserId { get; set; }
    public string SignatoryName { get; set; } = "";
    public string SignatoryPosition { get; set; } = "";

    /// <summary>A freshly encoded PNG, cropped to the ink. Null once the version is retired.</summary>
    public byte[]? Image { get; set; }
    public string ImageSha256 { get; set; } = "";
    public int ImageWidth { get; set; }
    public int ImageHeight { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public DocumentSignatureEndReason? EndReason { get; set; }
    public Guid? EndedByAdminUserId { get; set; }
}
