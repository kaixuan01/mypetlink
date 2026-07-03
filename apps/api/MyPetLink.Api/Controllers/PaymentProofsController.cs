using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1/payment-proofs")]
public sealed class PaymentProofsController : ApiControllerBase
{
    private readonly IPaymentProofService _paymentProofService;

    public PaymentProofsController(IPaymentProofService paymentProofService)
    {
        _paymentProofService = paymentProofService;
    }

    // TODO: Return controlled metadata/download information for authorized users.
    [HttpGet("{paymentProofId:guid}")]
    public Task<IActionResult> Get(Guid paymentProofId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_paymentProofService, "GET /api/v1/payment-proofs/{paymentProofId}", cancellationToken);
    }
}
