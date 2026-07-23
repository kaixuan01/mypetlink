using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1")]
public sealed class SmartTagsController : ApiControllerBase
{
    private readonly ISmartTagService _smartTagService;
    private readonly ICurrentUserService _currentUserService;

    public SmartTagsController(
        ISmartTagService smartTagService,
        ICurrentUserService currentUserService)
    {
        _smartTagService = smartTagService;
        _currentUserService = currentUserService;
    }

    [HttpGet("tags")]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? status,
        [FromQuery] string? type,
        [FromQuery] Guid? petId,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _smartTagService.ListAsync(
            _currentUserService.Current.UserId,
            query.Page,
            query.PageSize,
            petId,
            status,
            type,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("pets/{petId:guid}/tags")]
    public async Task<IActionResult> ListForPet(
        Guid petId,
        [FromQuery] PagedQuery query,
        [FromQuery] string? status,
        [FromQuery] string? type,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _smartTagService.ListForPetAsync(
            _currentUserService.Current.UserId,
            petId,
            query.Page,
            query.PageSize,
            status,
            type,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("tags/{tagId:guid}")]
    public async Task<IActionResult> Get(Guid tagId, CancellationToken cancellationToken)
    {
        var response = await _smartTagService.GetAsync(
            _currentUserService.Current.UserId,
            tagId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("tags/{tagId:guid}/scans")]
    public async Task<IActionResult> ListScans(
        Guid tagId,
        [FromQuery] string? source,
        CancellationToken cancellationToken)
    {
        var response = await _smartTagService.ListScansAsync(
            _currentUserService.Current.UserId,
            tagId,
            source,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("tags/{tagCode}/activate")]
    public async Task<IActionResult> Activate(
        string tagCode,
        [FromBody] ActivateTagRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _smartTagService.ActivateAsync(
            _currentUserService.Current.UserId,
            tagCode,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("tags/{tagId:guid}/mark-lost")]
    public async Task<IActionResult> MarkLost(Guid tagId, CancellationToken cancellationToken)
    {
        var response = await _smartTagService.MarkLostAsync(
            _currentUserService.Current.UserId,
            tagId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("tags/{tagId:guid}/disable")]
    public async Task<IActionResult> Disable(Guid tagId, CancellationToken cancellationToken)
    {
        var response = await _smartTagService.DisableAsync(
            _currentUserService.Current.UserId,
            tagId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("tags/{tagId:guid}/replace")]
    public Task<IActionResult> Replace(Guid tagId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_smartTagService, "POST /api/v1/tags/{tagId}/replace", cancellationToken);
    }

    [HttpPost("tags/{tagId:guid}/archive")]
    public async Task<IActionResult> Archive(Guid tagId, CancellationToken cancellationToken)
    {
        var response = await _smartTagService.ArchiveAsync(
            _currentUserService.Current.UserId,
            tagId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("tags/{tagId:guid}/restore")]
    public async Task<IActionResult> Restore(Guid tagId, CancellationToken cancellationToken)
    {
        var response = await _smartTagService.RestoreAsync(
            _currentUserService.Current.UserId,
            tagId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
