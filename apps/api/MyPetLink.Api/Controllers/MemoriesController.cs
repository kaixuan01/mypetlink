using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1/pets/{petId:guid}/memories")]
public sealed class MemoriesController : ApiControllerBase
{
    private readonly IPetService _petService;

    public MemoriesController(IPetService petService)
    {
        _petService = petService;
    }

    // TODO: Enforce plan memory/media limits and media ownership.
    [HttpGet]
    public Task<IActionResult> List(Guid petId, [FromQuery] PagedQuery query, [FromQuery] string? visibility, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "GET /api/v1/pets/{petId}/memories", cancellationToken);
    }

    [HttpPost]
    public Task<IActionResult> Create(Guid petId, [FromBody] CreateMemoryRequest request, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "POST /api/v1/pets/{petId}/memories", cancellationToken);
    }

    [HttpPatch("{memoryId:guid}")]
    public Task<IActionResult> Update(Guid petId, Guid memoryId, [FromBody] UpdateMemoryRequest request, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "PATCH /api/v1/pets/{petId}/memories/{memoryId}", cancellationToken);
    }

    [HttpDelete("{memoryId:guid}")]
    public Task<IActionResult> Archive(Guid petId, Guid memoryId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "DELETE /api/v1/pets/{petId}/memories/{memoryId}", cancellationToken);
    }
}
