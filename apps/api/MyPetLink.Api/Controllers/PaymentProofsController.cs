using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1/payment-proofs")]
public sealed class PaymentProofsController : ApiControllerBase
{
    private readonly IPaymentProofService _paymentProofService;
    private readonly ICurrentUserService _currentUserService;

    public PaymentProofsController(
        IPaymentProofService paymentProofService,
        ICurrentUserService currentUserService)
    {
        _paymentProofService = paymentProofService;
        _currentUserService = currentUserService;
    }

    [HttpGet("{paymentProofId:guid}")]
    public async Task<IActionResult> Get(Guid paymentProofId, CancellationToken cancellationToken)
    {
        var response = await _paymentProofService.GetAsync(
            _currentUserService.Current.UserId,
            paymentProofId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
