using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Route("api/v1/admin/merchant-sales/merchants/{merchantId:guid}")]
public sealed class AdminMerchantListingController(MerchantDirectoryService service, ICurrentUserService currentUser) : ApiControllerBase
{
    [HttpGet("listing")]
    [Authorize(Policy = AdminCapabilities.SalesView)]
    public async Task<IActionResult> Get(Guid merchantId, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.GetListingAsync(merchantId, ct), HttpContext));

    [HttpPut("listing")]
    [Authorize(Policy = AdminCapabilities.SalesManage)]
    public async Task<IActionResult> Update(Guid merchantId, UpdateMerchantListingRequest request, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.UpdateListingAsync(currentUser.Current.UserId, merchantId, request, ct), HttpContext));

    [HttpPost("branches")]
    [Authorize(Policy = AdminCapabilities.SalesManage)]
    public async Task<IActionResult> CreateBranch(Guid merchantId, UpsertMerchantBranchRequest request, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, ApiEnvelope.Ok(
            await service.UpsertBranchAsync(currentUser.Current.UserId, merchantId, null, request, ct), HttpContext));

    [HttpPut("branches/{branchId:guid}")]
    [Authorize(Policy = AdminCapabilities.SalesManage)]
    public async Task<IActionResult> UpdateBranch(Guid merchantId, Guid branchId, UpsertMerchantBranchRequest request, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.UpsertBranchAsync(currentUser.Current.UserId, merchantId, branchId, request, ct), HttpContext));
}
