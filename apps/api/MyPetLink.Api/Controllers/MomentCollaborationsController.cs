using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

/// <summary>
/// Moment collaboration. Every route is signed-in, no response is cacheable,
/// and the actor is always the JWT subject: no request can act for another
/// household.
/// </summary>
[Authorize]
[Route("api/v1/social")]
public sealed class MomentCollaborationsController : ApiControllerBase
{
    private readonly IMomentCollaborationService _collaborations;
    private readonly ICurrentUserService _currentUserService;

    public MomentCollaborationsController(
        IMomentCollaborationService collaborations,
        ICurrentUserService currentUserService)
    {
        _collaborations = collaborations;
        _currentUserService = currentUserService;
    }

    [EnableRateLimiting(SocialRateLimitPolicies.Search)]
    [HttpGet("collaboration-candidates")]
    public async Task<IActionResult> GetCandidates(
        [FromQuery] string? q,
        [FromQuery] Guid? momentId,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var response = await _collaborations.GetCandidatesAsync(
            _currentUserService.Current.UserId, q, momentId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("moments/{momentId:guid}/collaborations")]
    public async Task<IActionResult> GetForMoment(Guid momentId, CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var response = await _collaborations.GetForMomentAsync(
            _currentUserService.Current.UserId, momentId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [EnableRateLimiting(SocialRateLimitPolicies.CollaborationInvite)]
    [HttpPost("moments/{momentId:guid}/collaborations")]
    public async Task<IActionResult> Invite(
        Guid momentId,
        [FromBody] CreateMomentCollaborationRequest? request,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var response = await _collaborations.InviteAsync(
            _currentUserService.Current.UserId, momentId, request, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [EnableRateLimiting(SocialRateLimitPolicies.Withdraw)]
    [HttpDelete("moments/{momentId:guid}/collaborations/{collaborationId:guid}")]
    public async Task<IActionResult> Revoke(
        Guid momentId,
        Guid collaborationId,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var response = await _collaborations.RevokeAsync(
            _currentUserService.Current.UserId, momentId, collaborationId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("collaborations/incoming")]
    public async Task<IActionResult> GetIncoming(CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var response = await _collaborations.GetIncomingAsync(
            _currentUserService.Current.UserId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [EnableRateLimiting(SocialRateLimitPolicies.ProfileMutation)]
    [HttpPost("collaborations/{collaborationId:guid}/accept")]
    public async Task<IActionResult> Accept(
        Guid collaborationId,
        [FromBody] AcceptMomentCollaborationRequest? request,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var response = await _collaborations.AcceptAsync(
            _currentUserService.Current.UserId, collaborationId, request, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [EnableRateLimiting(SocialRateLimitPolicies.ProfileMutation)]
    [HttpPost("collaborations/{collaborationId:guid}/decline")]
    public async Task<IActionResult> Decline(Guid collaborationId, CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var response = await _collaborations.DeclineAsync(
            _currentUserService.Current.UserId, collaborationId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [EnableRateLimiting(SocialRateLimitPolicies.Withdraw)]
    [HttpPost("collaborations/{collaborationId:guid}/leave")]
    public async Task<IActionResult> Leave(Guid collaborationId, CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var response = await _collaborations.LeaveAsync(
            _currentUserService.Current.UserId, collaborationId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
