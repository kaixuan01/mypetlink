namespace MyPetLink.Api.Common;

/// <summary>
/// Runtime settings for the social identity lifecycle, bound from the "Social"
/// configuration section.
///
/// These are deployment-owned values rather than admin-editable business
/// settings: they exist to protect links and to slow abuse, not to be tuned as
/// part of running the business. Per the configuration governance rules, a value
/// here has exactly one owner and no duplicate elsewhere.
/// </summary>
public sealed class SocialOptions
{
    public const string SectionName = "Social";

    /// <summary>
    /// How long an owner must wait between handle changes.
    ///
    /// A handle is an address people share. Without a cooldown, an account could
    /// cycle through names faster than anyone could report it, which is the
    /// shape impersonation takes.
    /// </summary>
    public int HandleRenameCooldownDays { get; init; } = 30;

    /// <summary>
    /// How long a released handle is held before anyone else may claim it.
    ///
    /// Without the hold, a link shared last week could start resolving to a
    /// stranger's profile the moment the original owner renames.
    /// </summary>
    public int ReleasedHandleHoldDays { get; init; } = 90;

    /// <summary>
    /// Longest edge, in pixels, of the generated image derivative. 640 covers a
    /// three-column grid on a 430px phone at 3x device pixel ratio, and a
    /// two-column one comfortably, while staying well under 150 KB as JPEG.
    /// </summary>
    public int ThumbnailMaxEdgePixels { get; init; } = 640;

    /// <summary>JPEG quality for the derivative. 80 is visually clean at this size.</summary>
    public int ThumbnailJpegQuality { get; init; } = 80;

    /// <summary>
    /// Whether image derivatives are generated at all. Off disables generation
    /// without changing any read path: readers already fall back to the original
    /// whenever a thumbnail is absent.
    /// </summary>
    public bool ThumbnailGenerationEnabled { get; init; } = true;

    public TimeSpan HandleRenameCooldown =>
        TimeSpan.FromDays(Math.Clamp(HandleRenameCooldownDays, 0, 365));

    public TimeSpan ReleasedHandleHold =>
        TimeSpan.FromDays(Math.Clamp(ReleasedHandleHoldDays, 0, 3650));
}
