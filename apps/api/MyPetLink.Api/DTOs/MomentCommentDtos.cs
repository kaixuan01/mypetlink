namespace MyPetLink.Api.DTOs;

/// <summary>
/// Everything a client may say when writing a Comment. The author is the
/// signed-in account and the Moment is the route's; nothing else is taken from
/// the request. <see cref="ParentCommentId"/> absent or null writes a
/// top-level Comment; set, it writes a Reply under that top-level Comment.
/// </summary>
public sealed record CreateMomentCommentRequest(string? Body, Guid? ParentCommentId = null);

/// <summary>
/// A household-authored Comment or Reply. No account or finder identity, and
/// never any nested Replies: a thread's Replies are read page by page on their
/// own route.
/// </summary>
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
    IReadOnlyCollection<MomentCommentMentionResponse> Mentions,
    /// <summary>Null for a top-level Comment; the Comment a Reply belongs under.</summary>
    Guid? ParentCommentId,
    /// <summary>
    /// The Replies this viewer can read under a top-level Comment. Always 0 for
    /// a Reply, which is never a parent.
    /// </summary>
    int ReplyCount);

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
    /// <summary>
    /// "signIn", "communityProfile", "communityRestricted" (Community access is
    /// paused by MyPetLink — never "set up your profile"), or null.
    /// </summary>
    string? Requirement,
    PublicOwnerAttributionResponse? Identity);

/// <summary>
/// One page of a Moment's top-level Comments, newest first.
/// <see cref="CommentCount"/> is every Comment and Reply this viewer can read
/// on the Moment. <see cref="AnchorParentCommentId"/> is set only when the
/// requested anchor is a Reply this viewer can read and its parent is on this
/// page; the Reply itself is then read from that parent's Replies.
/// </summary>
public sealed record MomentCommentPageResponse(
    IReadOnlyCollection<MomentCommentResponse> Items,
    string? NextCursor,
    int CommentCount,
    MomentCommentViewerResponse Viewer,
    Guid? AnchorParentCommentId);

/// <summary>
/// One page of a top-level Comment's Replies, oldest first.
/// <see cref="ReplyCount"/> is every Reply this viewer can read in the thread.
/// </summary>
public sealed record MomentCommentReplyPageResponse(
    Guid ParentCommentId,
    IReadOnlyCollection<MomentCommentResponse> Items,
    string? NextCursor,
    int ReplyCount);

/// <summary>
/// The written Comment and the counts it changed, as this author now sees them.
/// For a Reply, <see cref="ParentCommentId"/> names its thread and
/// <see cref="ParentReplyCount"/> is that thread's readable Replies; both are
/// null for a top-level Comment.
/// </summary>
public sealed record CreateMomentCommentResponse(
    MomentCommentResponse Comment,
    int CommentCount,
    Guid? ParentCommentId,
    int? ParentReplyCount);

/// <summary>
/// The removed Comment and the counts it changed, as the remover now sees them.
/// For a Reply, <see cref="ParentCommentId"/> and <see cref="ParentReplyCount"/>
/// describe its thread; both are null for a top-level Comment.
/// </summary>
public sealed record DeleteMomentCommentResponse(
    Guid CommentId,
    int CommentCount,
    Guid? ParentCommentId,
    int? ParentReplyCount);
