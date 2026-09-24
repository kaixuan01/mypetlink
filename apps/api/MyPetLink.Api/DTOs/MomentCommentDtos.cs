namespace MyPetLink.Api.DTOs;

public sealed record CreateMomentCommentRequest(string? Body);

/// <summary>A household-authored Comment. No account or finder identity.</summary>
public sealed record MomentCommentResponse(
    Guid Id,
    string Body,
    DateTimeOffset CreatedAt,
    PublicOwnerAttributionResponse Author,
    /// <summary>"delete", "remove", or null.</summary>
    string? ViewerDeleteAction);

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
