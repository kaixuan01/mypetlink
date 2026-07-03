using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/payment-proofs")]
public sealed class AdminPaymentProofsController : ApiControllerBase
{
    private readonly IAdminService _adminService;

    public AdminPaymentProofsController(IAdminService adminService)
    {
        _adminService = adminService;
    }

    // TODO: Return payment proof review queue with controlled file preview/download metadata.
    [HttpGet]
    public Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? status,
        [FromQuery] string? orderStatus,
        CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_adminService, "GET /api/v1/admin/payment-proofs", cancellationToken);
    }
}
