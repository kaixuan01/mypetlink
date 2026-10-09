using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

/// <summary>
/// Community moderation without a report: the Moments and Comments lists, a
/// Comment in context, a household's moderation standing and history, and the
/// actions taken directly from them.
///
/// Reading anything here needs <c>community_reports.view</c>. Removing a Comment
/// or Reply and issuing a warning also need <c>community_reports.resolve</c>;
/// removing or restoring a Moment and restricting or lifting a household's
/// Community access also need <c>community_moderation.enforce</c>. Account
/// suspension is not here — it is an owner action (<see cref="AdminOwnersController"/>).
/// The moderator is always the session's account. Responses are never cached.
/// </summary>
[Authorize(Policy = AdminCapabilities.CommunityReportsView)]
[Route("api/v1/admin/community")]
public sealed class AdminCommunityModerationController : ApiControllerBase
{
    private readonly IAdminCommunityContentQueryService _queryService;
    private readonly IAdminCommunityEnforcementService _enforcementService;
    private readonly ICurrentUserService _currentUserService;

    public AdminCommunityModerationController(
        IAdminCommunityContentQueryService queryService,
        IAdminCommunityEnforcementService enforcementService,
        ICurrentUserService currentUserService)
    {
        _queryService = queryService;
        _enforcementService = enforcementService;
        _currentUserService = currentUserService;
    }

    private Guid? CurrentUserId => _currentUserService.Current.UserId;

    // ---- Moments ----------------------------------------------------------------

    [HttpGet("moments")]
    public async Task<IActionResult> ListMoments(
        [FromQuery] AdminCommunityMomentQuery query,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var (items, total) = await _queryService.ListMomentsAsync(query, cancellationToken);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("moments/{momentId:guid}")]
    public async Task<IActionResult> GetMoment(Guid momentId, CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(ApiEnvelope.Ok(
            await _queryService.GetMomentAsync(CurrentUserId, momentId, cancellationToken),
            HttpContext));
    }

    [HttpPost("moments/{momentId:guid}/remove")]
    [Authorize(Policy = AdminCapabilities.CommunityModerationEnforce)]
    public async Task<IActionResult> RemoveMoment(
        Guid momentId,
        [FromBody] AdminCommunityRemoveContentRequest? request,
        CancellationToken cancellationToken) =>
        Done(await _enforcementService.RemoveMomentAsync(CurrentUserId, momentId, request, cancellationToken));

    [HttpPost("moments/{momentId:guid}/restore")]
    [Authorize(Policy = AdminCapabilities.CommunityModerationEnforce)]
    public async Task<IActionResult> RestoreMoment(
        Guid momentId,
        [FromBody] AdminCommunityReversalRequest? request,
        CancellationToken cancellationToken) =>
        Done(await _enforcementService.RestoreMomentAsync(CurrentUserId, momentId, request, cancellationToken));

    // ---- Comments and Replies -----------------------------------------------------

    [HttpGet("comments")]
    public async Task<IActionResult> ListComments(
        [FromQuery] AdminCommunityCommentQuery query,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var (items, total) = await _queryService.ListCommentsAsync(query, cancellationToken);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("comments/{commentId:guid}")]
    public async Task<IActionResult> GetComment(Guid commentId, CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(ApiEnvelope.Ok(
            await _queryService.GetCommentAsync(CurrentUserId, commentId, cancellationToken),
            HttpContext));
    }

    [HttpPost("comments/{commentId:guid}/remove")]
    [Authorize(Policy = AdminCapabilities.CommunityReportsResolve)]
    public async Task<IActionResult> RemoveComment(
        Guid commentId,
        [FromBody] AdminCommunityRemoveContentRequest? request,
        CancellationToken cancellationToken) =>
        Done(await _enforcementService.RemoveCommentAsync(CurrentUserId, commentId, request, cancellationToken));

    // ---- Households -----------------------------------------------------------------

    [HttpGet("households/{ownerId:guid}")]
    public async Task<IActionResult> GetHousehold(Guid ownerId, CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(ApiEnvelope.Ok(
            await _queryService.GetHouseholdAsync(CurrentUserId, ownerId, cancellationToken),
            HttpContext));
    }

    [HttpPost("households/{ownerId:guid}/warnings")]
    [Authorize(Policy = AdminCapabilities.CommunityReportsResolve)]
    public async Task<IActionResult> IssueWarning(
        Guid ownerId,
        [FromBody] AdminCommunityWarningRequest? request,
        CancellationToken cancellationToken) =>
        Done(await _enforcementService.IssueWarningAsync(CurrentUserId, ownerId, request, cancellationToken));

    [HttpPost("households/{ownerId:guid}/restrict")]
    [Authorize(Policy = AdminCapabilities.CommunityModerationEnforce)]
    public async Task<IActionResult> Restrict(
        Guid ownerId,
        [FromBody] AdminCommunityRestrictRequest? request,
        CancellationToken cancellationToken) =>
        Done(await _enforcementService.RestrictAsync(CurrentUserId, ownerId, request, cancellationToken));

    [HttpPost("households/{ownerId:guid}/lift-restriction")]
    [Authorize(Policy = AdminCapabilities.CommunityModerationEnforce)]
    public async Task<IActionResult> LiftRestriction(
        Guid ownerId,
        [FromBody] AdminCommunityReversalRequest? request,
        CancellationToken cancellationToken) =>
        Done(await _enforcementService.LiftRestrictionAsync(CurrentUserId, ownerId, request, cancellationToken));

    private IActionResult Done(AdminCommunityActionResultResponse result)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(ApiEnvelope.Ok(result, HttpContext));
    }
}
