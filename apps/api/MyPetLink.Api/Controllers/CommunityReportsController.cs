using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

/// <summary>
/// Reporting a Comment, a Moment or a Community Profile to MyPetLink. Signed in
/// only; the reporter is always the session's account. The rate limit runs
/// before any target is looked up, so being limited says nothing about one.
/// </summary>
[Authorize]
[Route("api/v1/social/reports")]
public sealed class CommunityReportsController : ApiControllerBase
{
    private readonly ICommunityReportService _reports;
    private readonly ICurrentUserService _currentUserService;

    public CommunityReportsController(
        ICommunityReportService reports,
        ICurrentUserService currentUserService)
    {
        _reports = reports;
        _currentUserService = currentUserService;
    }

    [EnableRateLimiting(SocialRateLimitPolicies.Report)]
    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateCommunityReportRequest? request,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var response = await _reports.SubmitAsync(
            _currentUserService.Current.UserId,
            request,
            cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
