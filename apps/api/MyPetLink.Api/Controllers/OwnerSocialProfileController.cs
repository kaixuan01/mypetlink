using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

/// <summary>
/// The signed-in owner's own social identity.
///
/// Every route here is "me": the subject is the JWT subject, and there is no
/// user id, owner id or actor id anywhere in a path, query or body. A handle in
/// a URL is an address, never a grant — nothing on this controller acts on an
/// account other than the caller's own.
/// </summary>
[Authorize]
[Route("api/v1/social/me")]
public sealed class OwnerSocialProfileController : ApiControllerBase
{
    private readonly IOwnerSocialProfileService _socialProfileService;
    private readonly ISocialGraphService _socialGraph;
    private readonly ICurrentUserService _currentUserService;

    public OwnerSocialProfileController(
        IOwnerSocialProfileService socialProfileService,
        ISocialGraphService socialGraph,
        ICurrentUserService currentUserService)
    {
        _socialProfileService = socialProfileService;
        _socialGraph = socialGraph;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// The accounts the caller has blocked, so a block stays reversible.
    ///
    /// "Me" in both directions: it answers who I have blocked, never who has
    /// blocked me. There is no route anywhere that answers the second question.
    /// </summary>
    [HttpGet("blocks")]
    public async Task<IActionResult> GetBlockedAccounts(
        [FromQuery] string? cursor,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        var response = await _socialGraph.GetBlockedAccountsAsync(
            _currentUserService.Current.UserId,
            cursor,
            limit,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile(CancellationToken cancellationToken)
    {
        var response = await _socialProfileService.GetAsync(
            _currentUserService.Current.UserId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPut("profile")]
    [EnableRateLimiting(SocialRateLimitPolicies.ProfileMutation)]
    public async Task<IActionResult> UpdateProfile(
        [FromBody] UpdateOwnerSocialProfileRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _socialProfileService.UpdateAsync(
            _currentUserService.Current.UserId,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("handle")]
    [EnableRateLimiting(SocialRateLimitPolicies.ProfileMutation)]
    public async Task<IActionResult> ClaimHandle(
        [FromBody] ClaimOwnerHandleRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _socialProfileService.ClaimHandleAsync(
            _currentUserService.Current.UserId,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}

/// <summary>
/// The signed-in owner's pets, and whether each one is in Social.
///
/// Separate from the "me" profile routes above because it addresses a pet, and
/// separate from <c>PetsController</c> because Social consent should not travel
/// inside a general pet edit: a request that renames a pet must not be able to
/// publish it as a side effect, and an ordinary pet edit must not consume a
/// Social rate-limit budget.
///
/// A pet id in the route is an address, never a grant. The subject is still the
/// JWT subject, and the service resolves every pet through the caller's own
/// ownership before it reads or writes anything.
/// </summary>
[Authorize]
[Route("api/v1/social/me/pets")]
public sealed class OwnerPetSocialSettingsController : ApiControllerBase
{
    private readonly IPetSocialSettingsService _petSocialSettings;
    private readonly ICurrentUserService _currentUserService;

    public OwnerPetSocialSettingsController(
        IPetSocialSettingsService petSocialSettings,
        ICurrentUserService currentUserService)
    {
        _petSocialSettings = petSocialSettings;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Every pet the caller manages, with its Social settings and the reason it
    /// cannot join yet when it cannot. One call, because the settings screen
    /// shows the whole list at once.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        // A privacy state that a stale cache could show as "off" after the
        // owner turned it on is worse than a refetch.
        Response.Headers.CacheControl = "no-store";

        var response = await _petSocialSettings.ListAsync(
            _currentUserService.Current.UserId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    /// <summary>
    /// Sets one pet's Social consent.
    ///
    /// Rate-limited under <see cref="SocialRateLimitPolicies.Withdraw"/> rather
    /// than the tighter profile-mutation budget, on purpose. One route carries
    /// both directions, and the generous budget is the only one that cannot
    /// trap a withdrawal behind an exhausted enable budget — the exact failure
    /// the withdraw policy exists to prevent. Nothing is opened up by it: this
    /// route only ever moves two switches on the caller's own pets, so it is
    /// neither an enumeration surface nor a spam vector, and the number of pets
    /// an owner has is itself bounded by their plan.
    /// </summary>
    [HttpPut("{petId:guid}")]
    [EnableRateLimiting(SocialRateLimitPolicies.Withdraw)]
    public async Task<IActionResult> Update(
        Guid petId,
        [FromBody] UpdatePetSocialSettingsRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _petSocialSettings.UpdateAsync(
            _currentUserService.Current.UserId,
            petId,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}

/// <summary>
/// Handle availability.
///
/// Separate from the "me" routes above because it asks about a name rather than
/// about the caller, and because it needs its own, tighter limit: it is the one
/// endpoint that answers questions about handles nobody has claimed, which makes
/// it the natural place to enumerate from.
/// </summary>
[Authorize]
[Route("api/v1/social/handles")]
public sealed class OwnerHandleAvailabilityController : ApiControllerBase
{
    private readonly IOwnerSocialProfileService _socialProfileService;
    private readonly ICurrentUserService _currentUserService;

    public OwnerHandleAvailabilityController(
        IOwnerSocialProfileService socialProfileService,
        ICurrentUserService currentUserService)
    {
        _socialProfileService = socialProfileService;
        _currentUserService = currentUserService;
    }

    [HttpGet("{handle}/available")]
    [EnableRateLimiting(SocialRateLimitPolicies.HandleAvailability)]
    public async Task<IActionResult> CheckAvailability(
        string handle,
        CancellationToken cancellationToken)
    {
        // Never cached anywhere: an availability answer goes stale the moment
        // somebody claims the name, and a cached "available" would send a person
        // into a claim that then fails.
        Response.Headers.CacheControl = "no-store";

        var response = await _socialProfileService.CheckHandleAvailabilityAsync(
            _currentUserService.Current.UserId,
            handle,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
