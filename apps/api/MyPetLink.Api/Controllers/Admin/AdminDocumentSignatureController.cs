using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

/// <summary>
/// The signed-in administrator's own signature. Nothing here takes an account id: every request
/// is about the caller's signature, so no administrator can reach another's.
/// </summary>
[ApiController]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
[Authorize(Policy = AdminCapabilities.DocumentSignatureManage)]
[Route("api/v1/admin/document-signature")]
public sealed class AdminDocumentSignatureController(DocumentSignatureService service, ICurrentUserService current) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.GetOwnAsync(current.Current.UserId, ct), HttpContext));

    [HttpPut]
    [RequestSizeLimit(4 * 1024 * 1024)]
    public async Task<IActionResult> Save(SaveDocumentSignatureRequest r, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.SaveOwnAsync(current.Current.UserId, r, ct), HttpContext));

    [HttpPost("remove")]
    public async Task<IActionResult> Remove(RemoveDocumentSignatureRequest r, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.RemoveOwnAsync(current.Current.UserId, r, ct), HttpContext));

    [HttpGet("image")]
    public async Task<IActionResult> Image(CancellationToken ct)
    {
        var image = await service.OwnImageAsync(current.Current.UserId, ct);
        Response.Headers.CacheControl = "no-store, private";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(image, "image/png");
    }
}
