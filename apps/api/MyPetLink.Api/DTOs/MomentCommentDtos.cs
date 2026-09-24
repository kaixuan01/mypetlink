namespace MyPetLink.Api.DTOs;

public sealed record CreateMomentCommentRequest(string? Body);

/// <summary>A household-authored Comment. No account or finder identity.</summary>
public sealed record MomentCommentResponse(
    Guid Id,
    string Body,
    DateTimeOffset CreatedAt,
    PublicOwnerAttributionResponse Author,
    /// <summary>"delete", "remove", or null.</summary>
    string? ViewerDeleteAction,
    /// <summary>
    /// The "@handle" spans in <see cref="Body"/> that link to a household for
    /// this viewer, in body order. A mention that may not be shown is simply
    /// absent, so its text reads as plain text.
    /// </summary>
    IReadOnlyCollection<MomentCommentMentionResponse> Mentions);

/// <summary>
/// One linked mention: where it sits in the Comment body (UTF-16 offsets,
/// including the "@") and the household it links to — by that household's
/// current handle, which may differ from the text as written.
/// </summary>
public sealed record MomentCommentMentionResponse(
    int Start,
    int Length,
    PublicOwnerAttributionResponse Household);

/// <summary>
/// Households the signed-in commenter might mean by "@", for one Moment.
/// <see cref="CommentMentionSuggestionResponse.Context"/> is "author",
/// "collaborator", "commenter", "following" or "discoverable".
/// </summary>
public sealed record CommentMentionSuggestionsResponse(
    string Query,
    IReadOnlyCollection<CommentMentionSuggestionResponse> Items);

public sealed record CommentMentionSuggestionResponse(
    PublicOwnerAttributionResponse Household,
    string Context);

public sealed record MomentCommentViewerResponse(
    bool CanComment,
    /// <summary>"signIn", "communityProfile", or null.</summary>
    string? Requirement,
    PublicOwnerAttributionResponse? Identity);

public sealed record MomentCommentPageResponse(
    IReadOnlyCollection<MomentCommentResponse> Items,
    string? NextCursor,
    int CommentCount,
    MomentCommentViewerResponse Viewer);

public sealed record CreateMomentCommentResponse(
    MomentCommentResponse Comment,
    int CommentCount);

public sealed record DeleteMomentCommentResponse(
    Guid CommentId,
    int CommentCount);
