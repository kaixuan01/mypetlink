using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[AllowAnonymous]
[Route("api/v1/public/sample-experience")]
public sealed class SampleExperienceController : ApiControllerBase
{
    private readonly IPublicSampleExperienceService _service;

    public SampleExperienceController(IPublicSampleExperienceService service) => _service = service;

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(ApiEnvelope.Ok(await _service.GetAsync(cancellationToken), HttpContext));
    }
}
