using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1/pets/{petId:guid}/care-records")]
public sealed class CareRecordsController : ApiControllerBase
{
    private readonly IPetService _petService;

    public CareRecordsController(IPetService petService)
    {
        _petService = petService;
    }

    // TODO: Derive care record status from record/due dates instead of persisting it.
    [HttpGet]
    public Task<IActionResult> List(Guid petId, [FromQuery] PagedQuery query, [FromQuery] string? type, [FromQuery] string? status, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "GET /api/v1/pets/{petId}/care-records", cancellationToken);
    }

    [HttpPost]
    public Task<IActionResult> Create(Guid petId, [FromBody] CreateCareRecordRequest request, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "POST /api/v1/pets/{petId}/care-records", cancellationToken);
    }

    [HttpPatch("{recordId:guid}")]
    public Task<IActionResult> Update(Guid petId, Guid recordId, [FromBody] UpdateCareRecordRequest request, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "PATCH /api/v1/pets/{petId}/care-records/{recordId}", cancellationToken);
    }

    [HttpDelete("{recordId:guid}")]
    public Task<IActionResult> Archive(Guid petId, Guid recordId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_petService, "DELETE /api/v1/pets/{petId}/care-records/{recordId}", cancellationToken);
    }
}
