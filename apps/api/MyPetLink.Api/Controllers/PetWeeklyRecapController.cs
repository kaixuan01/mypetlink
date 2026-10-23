using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

// Private to this owner, success and failure alike: never kept by a browser,
// a proxy or the edge.
[Authorize]
[PrivateNoStore]
[Route("api/v1")]
public sealed class PetWeeklyRecapController : ApiControllerBase
{
    private readonly IPetWeeklyRecapService _weeklyRecapService;
    private readonly ICurrentUserService _currentUserService;

    public PetWeeklyRecapController(
        IPetWeeklyRecapService weeklyRecapService,
        ICurrentUserService currentUserService)
    {
        _weeklyRecapService = weeklyRecapService;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// One owned pet's week. <paramref name="weekStart"/> is a Monday on
    /// Malaysia's calendar; without it, the last complete week (or, for a pet
    /// added this week, this week). The actor is always the signed-in owner.
    /// </summary>
    [HttpGet("pets/{petId:guid}/weekly-recap")]
    public async Task<IActionResult> Get(
        Guid petId,
        [FromQuery] DateOnly? weekStart,
        CancellationToken cancellationToken)
    {
        var response = await _weeklyRecapService.GetAsync(
            _currentUserService.Current.UserId,
            petId,
            weekStart,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
