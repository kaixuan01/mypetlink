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

/// <summary>
/// One pet, as its owner sees it on the Social settings screen.
///
/// The owner's self-view, so it may carry setup state a stranger must never
/// see. It still carries nothing from the finder identity — no contact number,
/// no safety code, no tag code — because this screen is about who may see the
/// pet socially, and those belong to the person who finds it.
/// </summary>
public sealed record PetSocialSettingsResponse(
    Guid PetId,
    string Name,
    string? PhotoUrl,
    string? PhotoThumbnailUrl,

    /// <summary>This pet appears as a social subject.</summary>
    bool IsSocialEnabled,

    /// <summary>Strangers may find this pet through Explore and Search.</summary>
    bool IsDiscoverable,

    /// <summary>
    /// Whether participation can be switched on yet. A pet whose Public Share
    /// Profile is off, or that is archived or memorial, has nothing Social can
    /// show, so the API refuses rather than storing a switch that does nothing.
    /// </summary>
    bool CanEnableSocial,

    /// <summary>
    /// What stands in the way, as stable keys the UI turns into its own words:
    /// <c>publicProfile</c>, <c>lifecycle</c>.
    /// </summary>
    IReadOnlyCollection<string> MissingRequirements,

    string RowVersion);

/// <summary>
/// The owner's pets and their Social settings, plus the master switch they all
/// sit under.
///
/// <see cref="OwnerSocialEnabled"/> is repeated here so the settings screen can
/// render the pet list correctly from one response. It is a read of the owner's
/// own profile, never a second place to change it.
/// </summary>
public sealed record PetSocialSettingsListResponse(
    bool OwnerSocialEnabled,
    IReadOnlyCollection<PetSocialSettingsResponse> Pets);

/// <summary>
/// Writes one pet's Social consent.
///
/// Both switches are optional so a screen can move one without restating the
/// other. Omitting a field leaves it as it was.
/// </summary>
public sealed record UpdatePetSocialSettingsRequest(
    bool? IsSocialEnabled,
    bool? IsDiscoverable,

    /// <summary>
    /// Optimistic concurrency token from the last read. Rejected with 409 when
    /// the pet's settings changed in between, so a stale tab cannot reinstate a
    /// consent the owner has just withdrawn somewhere else.
    /// </summary>
    string? RowVersion);
