using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[AllowAnonymous]
[Route("api/v1/public/safety")]
public sealed class QrSafetyController : ApiControllerBase
{
    private readonly IQrSafetyService _qrSafetyService;

    public QrSafetyController(IQrSafetyService qrSafetyService)
    {
        _qrSafetyService = qrSafetyService;
    }

    // TODO: Return finder-safe QR Safety data and hide emergency contact for inactive pets.
    [HttpGet("{safetyCode}")]
    public Task<IActionResult> Get(string safetyCode, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_qrSafetyService, "GET /api/v1/public/safety/{safetyCode}", cancellationToken);
    }
}
