using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Common;

namespace MyPetLink.Api.DTOs;

/// <summary>
/// The owner's own view of their social identity.
///
/// This is the authenticated self-view, so it may carry setup state the public
/// projection must never include. Even here it carries nothing from the account
/// or finder identities: no email, no account display name, no
/// <c>OwnerProfile.OwnerDisplayName</c>, no phone.
/// </summary>
public sealed record OwnerSocialProfileResponse(
    string? Handle,
    string? DisplayName,
    string? Bio,
    Guid? AvatarMediaFileId,
    string? AvatarUrl,
    string? AvatarThumbnailUrl,
    string? GeneralArea,
    bool IsSocialEnabled,
    bool IsDiscoverable,
    bool AllowFollowers,

    /// <summary>
    /// Whether social can be switched on yet. A profile with no handle or no
    /// display name has nothing to show, so the API refuses to enable it and the
    /// UI can explain what is still needed instead of offering a switch that
    /// fails.
    /// </summary>
    bool CanEnableSocial,

    /// <summary>What still has to be filled in before social can be enabled.</summary>
    IReadOnlyCollection<string> MissingRequirements,

    /// <summary>
    /// When the handle may next be changed, if a cooldown is currently running.
    /// </summary>
    DateTimeOffset? HandleChangeAvailableAt,

    string RowVersion);

/// <summary>
/// Writes the owner's social identity. The handle is deliberately NOT here: it
/// has its own endpoint because it carries uniqueness, reservations and a
/// cooldown that the rest of the form does not.
/// </summary>
public sealed record UpdateOwnerSocialProfileRequest(
    [MaxLength(OwnerSocialDisplayNameRules.MaxLength)]
    string? DisplayName,

    [MaxLength(OwnerSocialBioRules.MaxLength)]
    string? Bio,

    [MaxLength(GeneralAreaRules.MaxLength)]
    string? GeneralArea,

    bool? IsSocialEnabled,
    bool? IsDiscoverable,
    bool? AllowFollowers,

    /// <summary>
    /// Optimistic concurrency token from the last read. Rejected with 409 when
    /// the profile changed in between, so two open tabs cannot silently
    /// overwrite one another's privacy switches.
    /// </summary>
    string? RowVersion);

public sealed record ClaimOwnerHandleRequest(
    [Required, MaxLength(OwnerHandleRules.MaxLength)]
    string Handle);

/// <summary>
/// Whether a handle can be claimed. Deliberately just a boolean.
///
/// This endpoint answers questions about names nobody has claimed, which makes
/// it the natural place to enumerate from. Taken, system-reserved, held after
/// release, and screened-out names all return exactly the same shape, so the
/// response cannot be used to map which handles exist or who holds them. Format
/// problems are computable on the client from the same published rules, so
/// withholding the reason here costs the owner nothing.
/// </summary>
public sealed record OwnerHandleAvailabilityResponse(
    string Handle,
    bool IsAvailable);
