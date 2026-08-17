using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[AllowAnonymous]
[Route("api/v1/public/safety")]
public sealed class QrSafetyController : ApiControllerBase
{
    private readonly IQrSafetyService _qrSafetyService;

    public QrSafetyController(IQrSafetyService qrSafetyService)
    {
        _qrSafetyService = qrSafetyService;
    }

    [HttpGet("{safetyCode}")]
    public async Task<IActionResult> Get(string safetyCode, CancellationToken cancellationToken)
    {
        var response = await _qrSafetyService.GetBySafetyCodeAsync(safetyCode, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    /// <summary>
    /// Restricted projection used by the edge to build the Safety Profile's link
    /// preview. Contains no contact details and never reaches a browser directly.
    /// </summary>
    [HttpGet("{safetyCode}/social")]
    public async Task<IActionResult> GetSocial(string safetyCode, CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var response = await _qrSafetyService.GetSocialBySafetyCodeAsync(safetyCode, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
