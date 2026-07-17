using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/payment-proofs")]
public sealed class AdminPaymentProofsController : ApiControllerBase
{
    private const int MaxSelectedIds = 500;
    private readonly IAdminService _adminService;
    private readonly IAdminPaymentProofQueryService _queryService;
    private readonly IMediaService _mediaService;
    private readonly ICurrentUserService _currentUserService;

    public AdminPaymentProofsController(
        IAdminService adminService,
        IAdminPaymentProofQueryService queryService,
        IMediaService mediaService,
        ICurrentUserService currentUserService)
    {
        _adminService = adminService;
        _queryService = queryService;
        _mediaService = mediaService;
        _currentUserService = currentUserService;
    }

    [HttpGet("table")]
    public async Task<IActionResult> Table(
        [FromQuery] AdminPaymentProofQuery query,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _queryService.ListAsync(query, cancellationToken);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("counts")]
    public async Task<IActionResult> Counts(
        [FromQuery] AdminPaymentProofQuery query,
        CancellationToken cancellationToken)
    {
        var counts = await _queryService.CountByStatusAsync(query, cancellationToken);
        return Ok(ApiEnvelope.Ok(counts, HttpContext));
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] AdminPaymentProofQuery query,
        [FromQuery] string? format,
        [FromQuery] string? ids,
        CancellationToken cancellationToken)
    {
        var export = await _queryService.ExportAsync(
            _currentUserService.Current.UserId,
            query,
            format,
            ParseSelectedIds(ids),
            cancellationToken);
        return File(export.Content, export.ContentType, export.FileName);
    }

    [HttpGet("{paymentProofId:guid}/detail")]
    public async Task<IActionResult> Detail(Guid paymentProofId, CancellationToken cancellationToken)
    {
        var response = await _queryService.GetAsync(paymentProofId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("{paymentProofId:guid}/download")]
    public async Task<IActionResult> Download(
        Guid paymentProofId,
        CancellationToken cancellationToken)
    {
        var response = await _mediaService.CreateAdminPaymentProofDownloadUrlAsync(
            _currentUserService.Current.UserId,
            paymentProofId,
            cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? status,
        [FromQuery] string? orderStatus,
        [FromQuery] Guid? ownerId,
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _adminService.ListPaymentProofsAsync(
            query.Page,
            query.PageSize,
            status,
            orderStatus,
            ownerId,
            search,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{paymentProofId:guid}")]
    public async Task<IActionResult> Get(Guid paymentProofId, CancellationToken cancellationToken)
    {
        var response = await _adminService.GetPaymentProofAsync(paymentProofId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{paymentProofId:guid}/approve")]
    public async Task<IActionResult> Approve(Guid paymentProofId, CancellationToken cancellationToken)
    {
        var response = await _adminService.ApprovePaymentProofAsync(
            _currentUserService.Current.UserId,
            paymentProofId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{paymentProofId:guid}/reject")]
    public async Task<IActionResult> Reject(
        Guid paymentProofId,
        [FromBody] RejectPaymentProofRequest? request,
        CancellationToken cancellationToken)
    {
        var response = await _adminService.RejectPaymentProofByIdAsync(
            _currentUserService.Current.UserId,
            paymentProofId,
            request?.Reason,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    private static IReadOnlyCollection<Guid>? ParseSelectedIds(string? ids)
    {
        if (string.IsNullOrWhiteSpace(ids)) return null;

        var parts = ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length > MaxSelectedIds)
        {
            throw InvalidIds($"Select at most {MaxSelectedIds} rows for an export.");
        }

        var parsed = new List<Guid>(parts.Length);
        foreach (var part in parts)
        {
            if (!Guid.TryParse(part, out var id)) throw InvalidIds("The selected rows could not be read. Please reselect them.");
            parsed.Add(id);
        }
        return parsed;
    }

    private static ApiException InvalidIds(string message) => new(
        StatusCodes.Status400BadRequest,
        "validation_failed",
        "Please check the submitted fields.",
        new Dictionary<string, string[]> { ["ids"] = [message] });
}
