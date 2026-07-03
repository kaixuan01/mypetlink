using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1/pets")]
public sealed class PetsController : ApiControllerBase
{
    private readonly IPetService _petService;

    public PetsController(IPetService petService)
    {
        _petService = petService;
    }

    // TODO: Scope every pet operation to the authenticated owner.
    [HttpGet]
    public Task<IActionResult> List([FromQuery] PagedQuery query, [FromQuery] string? lifecycleStatus, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "GET /api/v1/pets", cancellationToken);
    }

    [HttpPost]
    public Task<IActionResult> Create([FromBody] CreatePetRequest request, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "POST /api/v1/pets", cancellationToken);
    }

    [HttpGet("{petId:guid}")]
    public Task<IActionResult> Get(Guid petId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "GET /api/v1/pets/{petId}", cancellationToken);
    }

    [HttpPatch("{petId:guid}")]
    public Task<IActionResult> Update(Guid petId, [FromBody] UpdatePetRequest request, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "PATCH /api/v1/pets/{petId}", cancellationToken);
    }

    [HttpPost("{petId:guid}/mark-memorial")]
    public Task<IActionResult> MarkMemorial(Guid petId, [FromBody] MarkPetMemorialRequest request, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "POST /api/v1/pets/{petId}/mark-memorial", cancellationToken);
    }

    [HttpPost("{petId:guid}/restore-active")]
    public Task<IActionResult> RestoreActive(Guid petId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "POST /api/v1/pets/{petId}/restore-active", cancellationToken);
    }

    [HttpPost("{petId:guid}/archive")]
    public Task<IActionResult> Archive(Guid petId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "POST /api/v1/pets/{petId}/archive", cancellationToken);
    }

    [HttpPost("{petId:guid}/lost-mode")]
    public Task<IActionResult> LostMode(Guid petId, [FromBody] UpdateLostModeRequest request, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "POST /api/v1/pets/{petId}/lost-mode", cancellationToken);
    }
}
