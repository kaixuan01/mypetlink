using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1/tags")]
public sealed class SmartTagsController : ApiControllerBase
{
    private readonly ISmartTagService _smartTagService;

    public SmartTagsController(ISmartTagService smartTagService)
    {
        _smartTagService = smartTagService;
    }

    // TODO: Enforce owner tag ownership and lifecycle transition rules.
    [HttpGet]
    public Task<IActionResult> List([FromQuery] PagedQuery query, [FromQuery] string? status, [FromQuery] Guid? petId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_smartTagService, "GET /api/v1/tags", cancellationToken);
    }

    [HttpGet("{tagId:guid}")]
    public Task<IActionResult> Get(Guid tagId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_smartTagService, "GET /api/v1/tags/{tagId}", cancellationToken);
    }

    [HttpPost("{tagCode}/activate")]
    public Task<IActionResult> Activate(string tagCode, [FromBody] ActivateTagRequest request, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_smartTagService, "POST /api/v1/tags/{tagCode}/activate", cancellationToken);
    }

    [HttpPost("{tagId:guid}/mark-lost")]
    public Task<IActionResult> MarkLost(Guid tagId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_smartTagService, "POST /api/v1/tags/{tagId}/mark-lost", cancellationToken);
    }

    [HttpPost("{tagId:guid}/disable")]
    public Task<IActionResult> Disable(Guid tagId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_smartTagService, "POST /api/v1/tags/{tagId}/disable", cancellationToken);
    }

    [HttpPost("{tagId:guid}/replace")]
    public Task<IActionResult> Replace(Guid tagId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_smartTagService, "POST /api/v1/tags/{tagId}/replace", cancellationToken);
    }

    [HttpPost("{tagId:guid}/archive")]
    public Task<IActionResult> Archive(Guid tagId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_smartTagService, "POST /api/v1/tags/{tagId}/archive", cancellationToken);
    }

    [HttpPost("{tagId:guid}/restore")]
    public Task<IActionResult> Restore(Guid tagId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_smartTagService, "POST /api/v1/tags/{tagId}/restore", cancellationToken);
    }
}
