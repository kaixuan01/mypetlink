namespace MyPetLink.Api.Entities;

/// <summary>
/// One household's report about a Comment, a Moment or another household's
/// Community Profile.
///
/// <b>A report is not a finding.</b> Creating one hides nothing, blocks nobody
/// and tells the reported household nothing; only a moderator's decision
/// changes what anybody sees.
///
/// <b>Real targets, real keys.</b> The target is a typed, nullable foreign key
/// per target type rather than a bare id, so the database knows what is being
/// reported. <see cref="ReportedUserId"/> is always the household responsible
/// for the target — the Comment's author, the Moment's author, or the profile's
/// owner — resolved on the server, never taken from a client.
///
/// <b>Evidence.</b> The snapshot fields hold the minimum public evidence, taken
/// when the report is made, because the content itself may not survive review:
/// removing a Comment wipes its body, and a Moment or profile can be edited or
/// deleted afterwards. Only what was public goes in — never an email address,
/// phone number, finder or Safety Profile detail, or media bytes (media is
/// referenced, not copied).
///
/// Reporter identity is for moderators only and is never shown to the reported
/// household.
/// </summary>
public sealed class CommunityReport : Entity
{
    public Guid ReporterUserId { get; set; }
    public CommunityReportTargetType TargetType { get; set; } = CommunityReportTargetType.Unknown;

    /// <summary>Set exactly when <see cref="TargetType"/> is Comment.</summary>
    public Guid? CommentId { get; set; }

    /// <summary>Set exactly when <see cref="TargetType"/> is Moment.</summary>
    public Guid? MomentId { get; set; }

    /// <summary>The household responsible for the reported content or profile.</summary>
    public Guid ReportedUserId { get; set; }

    public CommunityReportReason Reason { get; set; } = CommunityReportReason.Unknown;

    /// <summary>Optional plain text; required when the reason is Other.</summary>
    public string? Details { get; set; }

    // ---- evidence, as it was when reported ----------------------------------

    public string SnapshotHandle { get; set; } = "";
    public string SnapshotDisplayName { get; set; } = "";

    /// <summary>A reported Moment's title. Null for other targets.</summary>
    public string? SnapshotTitle { get; set; }

    /// <summary>
    /// The Comment body, the Moment caption, or the profile bio — whichever the
    /// target has. May be null when a Moment has no caption or a profile no bio.
    /// </summary>
    public string? SnapshotText { get; set; }

    /// <summary>The profile avatar a Household report was about, by reference.</summary>
    public Guid? SnapshotAvatarMediaFileId { get; set; }

    // ---- review ---------------------------------------------------------------

    public CommunityReportStatus Status { get; set; } = CommunityReportStatus.Open;

    /// <summary>Set exactly when the report is Resolved.</summary>
    public CommunityReportResolution? Resolution { get; set; }

    /// <summary>A moderator's internal note. Never shown outside the Admin Portal.</summary>
    public string? ReviewNote { get; set; }

    public DateTimeOffset? ReviewedAt { get; set; }
    public Guid? ReviewedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];

    public User ReporterUser { get; set; } = null!;
    public User ReportedUser { get; set; } = null!;
    public User? ReviewedByUser { get; set; }
    public MomentComment? Comment { get; set; }
    public PetMemory? Moment { get; set; }
    public MediaFile? SnapshotAvatarMediaFile { get; set; }
}
