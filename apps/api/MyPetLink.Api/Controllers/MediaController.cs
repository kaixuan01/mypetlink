using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1/media")]
public sealed class MediaController : ApiControllerBase
{
    private readonly IMediaService _mediaService;
    private readonly ICurrentUserService _currentUserService;

    public MediaController(
        IMediaService mediaService,
        ICurrentUserService currentUserService)
    {
        _mediaService = mediaService;
        _currentUserService = currentUserService;
    }

    [HttpPost("uploads")]
    public async Task<IActionResult> InitializeUpload(
        [FromBody] InitializeMediaUploadRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _mediaService.InitializeUploadAsync(
            _currentUserService.Current.UserId,
            request,
            cancellationToken);

        return CreatedAtAction(
            nameof(GetPrivateDownloadUrl),
            new { mediaId = response.MediaId },
            ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("uploads/{mediaId:guid}/complete")]
    public async Task<IActionResult> CompleteUpload(Guid mediaId, CancellationToken cancellationToken)
    {
        var response = await _mediaService.CompleteUploadAsync(
            _currentUserService.Current.UserId,
            mediaId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpDelete("{mediaId:guid}")]
    public async Task<IActionResult> Delete(Guid mediaId, CancellationToken cancellationToken)
    {
        await _mediaService.DeleteAsync(
            _currentUserService.Current.UserId,
            mediaId,
            cancellationToken);

        return NoContent();
    }

    [HttpGet("{mediaId:guid}/download")]
    public async Task<IActionResult> GetPrivateDownloadUrl(Guid mediaId, CancellationToken cancellationToken)
    {
        var response = await _mediaService.CreatePrivateDownloadUrlAsync(
            _currentUserService.Current.UserId,
            mediaId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}

