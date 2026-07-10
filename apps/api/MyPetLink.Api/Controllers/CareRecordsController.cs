using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1")]
public sealed class CareRecordsController : ApiControllerBase
{
    private readonly ICareRecordService _careRecordService;
    private readonly ICurrentUserService _currentUserService;

    public CareRecordsController(
        ICareRecordService careRecordService,
        ICurrentUserService currentUserService)
    {
        _careRecordService = careRecordService;
        _currentUserService = currentUserService;
    }

    [HttpGet("pets/{petId:guid}/care-records")]
    public async Task<IActionResult> List(
        Guid petId,
        [FromQuery] PagedQuery query,
        [FromQuery] string? type,
        [FromQuery] string? category,
        [FromQuery] DateOnly? fromDate,
        [FromQuery] DateOnly? toDate,
        [FromQuery] bool includeArchived,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _careRecordService.ListForPetAsync(
            _currentUserService.Current.UserId,
            petId,
            query.Page,
            query.PageSize,
            type ?? category,
            fromDate,
            toDate,
            includeArchived,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpPost("pets/{petId:guid}/care-records")]
    public async Task<IActionResult> Create(
        Guid petId,
        [FromBody] CreateCareRecordRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _careRecordService.CreateAsync(
            _currentUserService.Current.UserId,
            petId,
            request,
            cancellationToken);

        return CreatedAtAction(
            nameof(Get),
            new { recordId = response.Id },
            ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("care-records/{recordId:guid}")]
    public async Task<IActionResult> Get(Guid recordId, CancellationToken cancellationToken)
    {
        var response = await _careRecordService.GetAsync(
            _currentUserService.Current.UserId,
            recordId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPut("care-records/{recordId:guid}")]
    public async Task<IActionResult> Update(
        Guid recordId,
        [FromBody] UpdateCareRecordRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _careRecordService.UpdateAsync(
            _currentUserService.Current.UserId,
            recordId,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPatch("pets/{petId:guid}/care-records/{recordId:guid}")]
    public Task<IActionResult> UpdateForPet(
        Guid petId,
        Guid recordId,
        [FromBody] UpdateCareRecordRequest request,
        CancellationToken cancellationToken)
    {
        return Update(recordId, request, cancellationToken);
    }

    [HttpDelete("care-records/{recordId:guid}")]
    public async Task<IActionResult> Archive(Guid recordId, CancellationToken cancellationToken)
    {
        await _careRecordService.ArchiveAsync(
            _currentUserService.Current.UserId,
            recordId,
            cancellationToken);

        return NoContent();
    }

    [HttpDelete("pets/{petId:guid}/care-records/{recordId:guid}")]
    public Task<IActionResult> ArchiveForPet(Guid petId, Guid recordId, CancellationToken cancellationToken)
    {
        return Archive(recordId, cancellationToken);
    }
}
