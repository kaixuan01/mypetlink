using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Route("api/v1/admin/tag-inventory/qa")]
public sealed class AdminPhysicalQaController(PhysicalQaService qa, ICurrentUserService user) : ApiControllerBase
{
    [HttpGet, Authorize(Policy = AdminCapabilities.InventoryView)]
    public async Task<IActionResult> List([FromQuery] PhysicalQaQuery query, CancellationToken ct)
    {
        var (items, total) = await qa.ListAsync(query, ct);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }
    [HttpGet("summary"), Authorize(Policy = AdminCapabilities.InventoryView)]
    public async Task<IActionResult> Summary([FromQuery] PhysicalQaQuery query, CancellationToken ct) => Ok(ApiEnvelope.Ok(await qa.SummaryAsync(query, ct), HttpContext));
    [HttpGet("lookup"), Authorize(Policy = AdminCapabilities.InventoryView)]
    public async Task<IActionResult> Lookup([FromQuery, System.ComponentModel.DataAnnotations.Required, System.ComponentModel.DataAnnotations.MaxLength(32)] string code, CancellationToken ct) => Ok(ApiEnvelope.Ok(await qa.LookupAsync(code, ct), HttpContext));
    [HttpGet("{tagId:guid}/history"), Authorize(Policy = AdminCapabilities.InventoryView)]
    public async Task<IActionResult> History(Guid tagId, CancellationToken ct) => Ok(ApiEnvelope.Ok(await qa.HistoryAsync(tagId, ct), HttpContext));
    [HttpGet("export"), Authorize(Policy = AdminCapabilities.InventoryExport)]
    public async Task<IActionResult> Export([FromQuery] PhysicalQaQuery query, CancellationToken ct)
    {
        var result = await qa.ExportAsync(user.Current.UserId, query, ct);
        return File(result.Content, result.ContentType, result.FileName);
    }
    [HttpPost("capture"), Authorize(Policy = AdminCapabilities.InventoryQaManage)]
    public async Task<IActionResult> Capture([FromBody] PhysicalQaCaptureRequest request, CancellationToken ct) => Ok(ApiEnvelope.Ok(await qa.CaptureAsync(user.Current.UserId, request, ct), HttpContext));
    [HttpPut("{tagId:guid}"), Authorize(Policy = AdminCapabilities.InventoryQaManage)]
    public async Task<IActionResult> Save(Guid tagId, [FromBody] SavePhysicalQaRequest request, CancellationToken ct) => Ok(ApiEnvelope.Ok(await qa.SaveAsync(user.Current.UserId, tagId, request, ct), HttpContext));
    [HttpPost("cohort/preview"), Authorize(Policy = AdminCapabilities.InventoryQaManage)]
    public async Task<IActionResult> Preview([FromBody] PhysicalQaCohortRequest request, CancellationToken ct) => Ok(ApiEnvelope.Ok(await qa.PreviewAsync(request, ct), HttpContext));
    [HttpPost("cohort/enroll"), Authorize(Policy = AdminCapabilities.InventoryQaManage)]
    public async Task<IActionResult> Enroll([FromBody] PhysicalQaCohortRequest request, CancellationToken ct) => Ok(ApiEnvelope.Ok(await qa.EnrollAsync(user.Current.UserId, request, ct), HttpContext));
}
