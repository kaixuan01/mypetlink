namespace MyPetLink.Api.DTOs;

/// <summary>Invite a household, naming which of its pets are asked about.</summary>
public sealed record CreateMomentCollaborationRequest(
    string? Handle,
    IReadOnlyCollection<string>? PetSlugs);

/// <summary>Accept: the non-empty subset of the requested pets that take part.</summary>
public sealed record AcceptMomentCollaborationRequest(IReadOnlyCollection<string>? PetSlugs);

/// <summary>A pet named in a collaboration. Public slug only; never an internal id.</summary>
public sealed record MomentCollaborationPetResponse(
    string Name,
    string PublicSlug,
    string? PhotoUrl,
    bool IsAccepted);

/// <summary>
/// One collaboration as its two parties see it. <see cref="Household"/> is the
/// invited household. Status is one of Pending, Accepted, Declined, Revoked,
/// Left or Expired — never shown to anybody but the author and the invitee.
/// </summary>
public sealed record MomentCollaborationResponse(
    Guid Id,
    string Status,
    PublicOwnerAttributionResponse Household,
    IReadOnlyCollection<MomentCollaborationPetResponse> Pets,
    DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? RespondedAt,
    DateTimeOffset? EndedAt);

/// <summary>
/// A Moment's collaborations for the signed-in viewer.
///
/// <c>author</c>: every collaboration the author may manage. <c>invitee</c>:
/// only the viewer's own live collaboration. <c>none</c>: an unrelated viewer
/// of a visible Moment, who sees nothing.
/// </summary>
public sealed record MomentCollaborationListResponse(
    string ViewerRole,
    PublicOwnerAttributionResponse? Author,
    int MaxHouseholds,
    int LiveHouseholds,
    bool CanInvite,
    /// <summary>"moment-not-public", "limit-reached", or null.</summary>
    string? InviteUnavailableReason,
    IReadOnlyCollection<MomentCollaborationResponse> Items);

public sealed record CollaborationCandidatePetResponse(
    string Name,
    string PublicSlug,
    string? PhotoUrl);

/// <summary>
/// A household that may be invited, with the pets that may be asked about.
/// Pets always belong to a household here; they are never standalone results.
/// </summary>
public sealed record CollaborationCandidateResponse(
    PublicOwnerAttributionResponse Household,
    bool IsFollowed,
    /// <summary>
    /// For the Moment being edited: null (can be invited), "Pending",
    /// "Accepted", or "Unavailable" (this Moment can't invite them again).
    /// </summary>
    string? InvitationState,
    IReadOnlyCollection<CollaborationCandidatePetResponse> Pets);

public sealed record CollaborationCandidatesResponse(
    string Query,
    IReadOnlyCollection<CollaborationCandidateResponse> Items);

public sealed record IncomingMomentCollaborationResponse(
    Guid Id,
    Guid MomentId,
    string MomentTitle,
    PublicOwnerAttributionResponse Author,
    IReadOnlyCollection<MomentCollaborationPetResponse> RequestedPets,
    DateTimeOffset ExpiresAt);

public sealed record IncomingMomentCollaborationsResponse(
    IReadOnlyCollection<IncomingMomentCollaborationResponse> Items);

/// <summary>
/// An accepted, currently visible collaborator on a public Moment: the
/// household and the pets it placed in the Moment. Kept apart from the
/// Moment's own <c>Subjects</c>, so a client that does not know this field
/// never shows another household's pet as the author's.
/// </summary>
public sealed record PublicMomentCollaborationResponse(
    PublicOwnerAttributionResponse Household,
    IReadOnlyCollection<PublicMomentSubjectResponse> Pets);
