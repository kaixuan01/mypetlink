using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[Route("api/v1")]
public sealed class MomentCommentsController : ApiControllerBase
{
    private readonly IMomentCommentService _comments;
    private readonly ICurrentUserService _currentUserService;

    public MomentCommentsController(
        IMomentCommentService comments,
        ICurrentUserService currentUserService)
    {
        _comments = comments;
        _currentUserService = currentUserService;
    }

    [AllowAnonymous]
    [HttpGet("public/moments/{momentId:guid}/comments")]
    public async Task<IActionResult> Get(
        Guid momentId,
        [FromQuery] string? cursor,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var response = await _comments.GetAsync(
            momentId,
            _currentUserService.Current.UserId,
            cursor,
            limit,
            cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [Authorize]
    [EnableRateLimiting(SocialRateLimitPolicies.Comment)]
    [HttpPost("social/moments/{momentId:guid}/comments")]
    public async Task<IActionResult> Create(
        Guid momentId,
        [FromBody] CreateMomentCommentRequest? request,
        CancellationToken cancellationToken)
    {
        var response = await _comments.CreateAsync(
            _currentUserService.Current.UserId,
            momentId,
            request,
            cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [Authorize]
    [EnableRateLimiting(SocialRateLimitPolicies.Withdraw)]
    [HttpDelete("social/moments/{momentId:guid}/comments/{commentId:guid}")]
    public async Task<IActionResult> Delete(
        Guid momentId,
        Guid commentId,
        CancellationToken cancellationToken)
    {
        var response = await _comments.DeleteAsync(
            _currentUserService.Current.UserId,
            momentId,
            commentId,
            cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
