using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1")]
public sealed class MemoriesController : ApiControllerBase
{
    private readonly IMemoryService _memoryService;
    private readonly ICurrentUserService _currentUserService;

    public MemoriesController(
        IMemoryService memoryService,
        ICurrentUserService currentUserService)
    {
        _memoryService = memoryService;
        _currentUserService = currentUserService;
    }

    [HttpGet("pets/{petId:guid}/memories")]
    public async Task<IActionResult> List(
        Guid petId,
        [FromQuery] PagedQuery query,
        [FromQuery] string? visibility,
        [FromQuery] bool includeArchived,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _memoryService.ListForPetAsync(
            _currentUserService.Current.UserId,
            petId,
            query.Page,
            query.PageSize,
            visibility,
            includeArchived,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpPost("pets/{petId:guid}/memories")]
    public async Task<IActionResult> Create(
        Guid petId,
        [FromBody] CreateMemoryRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _memoryService.CreateAsync(
            _currentUserService.Current.UserId,
            petId,
            request,
            cancellationToken);

        return CreatedAtAction(
            nameof(Get),
            new { memoryId = response.Id },
            ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("memories/{memoryId:guid}")]
    public async Task<IActionResult> Get(Guid memoryId, CancellationToken cancellationToken)
    {
        var response = await _memoryService.GetAsync(
            _currentUserService.Current.UserId,
            memoryId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPut("memories/{memoryId:guid}")]
    public async Task<IActionResult> Update(
        Guid memoryId,
        [FromBody] UpdateMemoryRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _memoryService.UpdateAsync(
            _currentUserService.Current.UserId,
            memoryId,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPatch("pets/{petId:guid}/memories/{memoryId:guid}")]
    public Task<IActionResult> UpdateForPet(
        Guid petId,
        Guid memoryId,
        [FromBody] UpdateMemoryRequest request,
        CancellationToken cancellationToken)
    {
        return Update(memoryId, request, cancellationToken);
    }

    [HttpDelete("memories/{memoryId:guid}")]
    public async Task<IActionResult> Archive(Guid memoryId, CancellationToken cancellationToken)
    {
        await _memoryService.ArchiveAsync(
            _currentUserService.Current.UserId,
            memoryId,
            cancellationToken);

        return NoContent();
    }

    [HttpDelete("pets/{petId:guid}/memories/{memoryId:guid}")]
    public Task<IActionResult> ArchiveForPet(Guid petId, Guid memoryId, CancellationToken cancellationToken)
    {
        return Archive(memoryId, cancellationToken);
    }
}
