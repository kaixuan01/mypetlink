namespace MyPetLink.Api.DTOs;

/// <summary>
/// A household's report about a Comment, a Moment or a Community Profile.
///
/// Only what the reporter chooses is accepted. Who is reporting comes from the
/// session; who is being reported, and the evidence, are resolved on the
/// server from the target itself. There is deliberately nowhere to send a user
/// id, a snapshot, a status or a decision.
/// </summary>
/// <param name="TargetType">"comment", "moment" or "household".</param>
/// <param name="Target">
/// The Comment's id, the Moment's id, or the household's @handle — the same
/// public identifiers the reporter already sees.
/// </param>
/// <param name="Reason">
/// One of SpamOrScam, HarassmentOrBullying, InappropriateContent,
/// AnimalWelfareConcern, Impersonation, PrivacyConcern, Other.
/// </param>
/// <param name="Details">Optional plain text, up to 500 characters; required for Other.</param>
public sealed record CreateCommunityReportRequest(
    string? TargetType,
    string? Target,
    string? Reason,
    string? Details);

/// <summary>
/// The whole answer to a report. Identical for a first report and for a
/// repeat of one still open, and it carries nothing about the report itself —
/// no id, status, reporter, reported household or evidence.
/// </summary>
public sealed record CommunityReportReceivedResponse(bool Accepted);
