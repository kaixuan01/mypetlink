using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1/pets")]
public sealed class PetsController : ApiControllerBase
{
    private readonly IPetService _petService;
    private readonly ICurrentUserService _currentUserService;

    public PetsController(IPetService petService, ICurrentUserService currentUserService)
    {
        _petService = petService;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? lifecycleStatus,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _petService.ListAsync(
            _currentUserService.Current.UserId,
            query.Page,
            query.PageSize,
            lifecycleStatus,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePetRequest request, CancellationToken cancellationToken)
    {
        var response = await _petService.CreateAsync(
            _currentUserService.Current.UserId,
            request,
            cancellationToken);

        return CreatedAtAction(
            nameof(Get),
            new { petId = response.Id },
            ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("{petId:guid}")]
    public async Task<IActionResult> Get(Guid petId, CancellationToken cancellationToken)
    {
        var response = await _petService.GetAsync(
            _currentUserService.Current.UserId,
            petId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPut("{petId:guid}")]
    public async Task<IActionResult> Update(Guid petId, [FromBody] UpdatePetRequest request, CancellationToken cancellationToken)
    {
        var response = await _petService.UpdateAsync(
            _currentUserService.Current.UserId,
            petId,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{petId:guid}/mark-memorial")]
    public async Task<IActionResult> MarkMemorial(
        Guid petId,
        [FromBody] MarkPetMemorialRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _petService.MarkMemorialAsync(
            _currentUserService.Current.UserId,
            petId,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{petId:guid}/restore-active")]
    public async Task<IActionResult> RestoreActive(Guid petId, CancellationToken cancellationToken)
    {
        var response = await _petService.RestoreActiveAsync(
            _currentUserService.Current.UserId,
            petId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{petId:guid}/archive")]
    public async Task<IActionResult> Archive(Guid petId, CancellationToken cancellationToken)
    {
        var response = await _petService.ArchiveAsync(
            _currentUserService.Current.UserId,
            petId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{petId:guid}/lost-mode")]
    public async Task<IActionResult> LostMode(
        Guid petId,
        [FromBody] UpdateLostModeRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _petService.UpdateLostModeAsync(
            _currentUserService.Current.UserId,
            petId,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
