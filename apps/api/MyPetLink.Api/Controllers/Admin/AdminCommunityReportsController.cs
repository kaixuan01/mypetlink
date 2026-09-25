using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

/// <summary>
/// Community reports and the moderation decided from them.
///
/// Reading anything here needs <c>community_reports.view</c>, a sensitive read
/// (reporter identity and reported content). Deciding a report — Dismiss or
/// Remove Comment — also needs <c>community_reports.resolve</c>; hiding or
/// unhiding a Moment and restricting a household or lifting it also need
/// <c>community_moderation.enforce</c>. Responses are never cached.
/// </summary>
[Authorize(Policy = AdminCapabilities.CommunityReportsView)]
[Route("api/v1/admin/community-reports")]
public sealed class AdminCommunityReportsController : ApiControllerBase
{
    private readonly IAdminCommunityReportQueryService _queryService;
    private readonly IAdminCommunityModerationService _moderationService;
    private readonly ICurrentUserService _currentUserService;

    public AdminCommunityReportsController(
        IAdminCommunityReportQueryService queryService,
        IAdminCommunityModerationService moderationService,
        ICurrentUserService currentUserService)
    {
        _queryService = queryService;
        _moderationService = moderationService;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] AdminCommunityReportQuery query,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var (items, total) = await _queryService.ListAsync(
            _currentUserService.Current.UserId,
            query,
            cancellationToken);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{reportId:guid}")]
    public async Task<IActionResult> Get(Guid reportId, CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var response = await _queryService.GetAsync(
            _currentUserService.Current.UserId,
            reportId,
            cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{reportId:guid}/dismiss")]
    [Authorize(Policy = AdminCapabilities.CommunityReportsResolve)]
    public Task<IActionResult> Dismiss(
        Guid reportId,
        [FromBody] AdminCommunityModerationRequest? request,
        CancellationToken cancellationToken) =>
        Act(_moderationService.DismissAsync, reportId, request, cancellationToken);

    [HttpPost("{reportId:guid}/remove-comment")]
    [Authorize(Policy = AdminCapabilities.CommunityReportsResolve)]
    public Task<IActionResult> RemoveComment(
        Guid reportId,
        [FromBody] AdminCommunityModerationRequest? request,
        CancellationToken cancellationToken) =>
        Act(_moderationService.RemoveCommentAsync, reportId, request, cancellationToken);

    [HttpPost("{reportId:guid}/hide-moment")]
    [Authorize(Policy = AdminCapabilities.CommunityModerationEnforce)]
    public Task<IActionResult> HideMoment(
        Guid reportId,
        [FromBody] AdminCommunityModerationRequest? request,
        CancellationToken cancellationToken) =>
        Act(_moderationService.HideMomentAsync, reportId, request, cancellationToken);

    [HttpPost("{reportId:guid}/unhide-moment")]
    [Authorize(Policy = AdminCapabilities.CommunityModerationEnforce)]
    public Task<IActionResult> UnhideMoment(
        Guid reportId,
        [FromBody] AdminCommunityModerationRequest? request,
        CancellationToken cancellationToken) =>
        Act(_moderationService.UnhideMomentAsync, reportId, request, cancellationToken);

    [HttpPost("{reportId:guid}/restrict-household")]
    [Authorize(Policy = AdminCapabilities.CommunityModerationEnforce)]
    public Task<IActionResult> RestrictHousehold(
        Guid reportId,
        [FromBody] AdminCommunityModerationRequest? request,
        CancellationToken cancellationToken) =>
        Act(_moderationService.RestrictHouseholdAsync, reportId, request, cancellationToken);

    [HttpPost("{reportId:guid}/lift-restriction")]
    [Authorize(Policy = AdminCapabilities.CommunityModerationEnforce)]
    public Task<IActionResult> LiftRestriction(
        Guid reportId,
        [FromBody] AdminCommunityModerationRequest? request,
        CancellationToken cancellationToken) =>
        Act(_moderationService.LiftRestrictionAsync, reportId, request, cancellationToken);

    private async Task<IActionResult> Act(
        Func<Guid?, Guid, AdminCommunityModerationRequest?, CancellationToken, Task<AdminCommunityModerationResultResponse>> action,
        Guid reportId,
        AdminCommunityModerationRequest? request,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var response = await action(
            _currentUserService.Current.UserId,
            reportId,
            request,
            cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
