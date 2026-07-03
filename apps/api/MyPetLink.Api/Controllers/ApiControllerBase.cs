using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
    protected async Task<IActionResult> PlaceholderAsync(
        ISkeletonService service,
        string operation,
        CancellationToken cancellationToken)
    {
        var response = await service.NotImplementedAsync(operation, cancellationToken);
        return StatusCode(StatusCodes.Status501NotImplemented, ApiEnvelope.Ok(response, HttpContext));
    }
}
