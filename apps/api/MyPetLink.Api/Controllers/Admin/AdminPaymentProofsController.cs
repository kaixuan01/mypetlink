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
    private readonly IAdminService _adminService;
    private readonly ICurrentUserService _currentUserService;

    public AdminPaymentProofsController(IAdminService adminService, ICurrentUserService currentUserService)
    {
        _adminService = adminService;
        _currentUserService = currentUserService;
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
}
