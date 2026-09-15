using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

/// <summary>
/// The signed-in owner's activity.
///
/// The recipient is the JWT subject on every route here. There is no path,
/// query or body field naming whose activity to read or whose to mark read —
/// ids belonging to another account simply match nothing.
/// </summary>
[Authorize]
[Route("api/v1/social/notifications")]
public sealed class SocialNotificationsController : ApiControllerBase
{
    private readonly IOwnerNotificationService _notifications;
    private readonly ICurrentUserService _currentUserService;

    public SocialNotificationsController(
        IOwnerNotificationService notifications,
        ICurrentUserService currentUserService)
    {
        _notifications = notifications;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// A page of activity, newest first, with the unread count alongside it so
    /// a client opening this screen does not then ask for the badge separately.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetNotifications(
        [FromQuery] string? cursor,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        var response = await _notifications.GetAsync(
            _currentUserService.Current.UserId,
            cursor,
            limit,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    /// <summary>Just the badge, for the shell.</summary>
    [HttpGet("unread")]
    public async Task<IActionResult> GetUnreadCount(CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        var response = await _notifications.GetUnreadSummaryAsync(
            _currentUserService.Current.UserId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    /// <summary>
    /// Marks activity read. With no ids in the body, marks everything currently
    /// unread — which is what opening the screen means.
    /// </summary>
    [HttpPost("read")]
    public async Task<IActionResult> MarkRead(
        [FromBody] MarkNotificationsReadRequest? request,
        CancellationToken cancellationToken)
    {
        var response = await _notifications.MarkReadAsync(
            _currentUserService.Current.UserId,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
