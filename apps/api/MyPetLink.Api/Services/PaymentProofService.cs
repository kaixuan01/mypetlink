using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;

namespace MyPetLink.Api.Services;

public sealed class PaymentProofService : SkeletonService, IPaymentProofService
{
    private readonly MyPetLinkDbContext _dbContext;

    public PaymentProofService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<PaymentProofResponse> GetAsync(
        Guid? currentUserId,
        Guid paymentProofId,
        CancellationToken cancellationToken = default)
    {
        var userId = currentUserId ?? throw Unauthorized();
        var proof = await _dbContext.PaymentProofs
            .AsNoTracking()
            .Include(item => item.Order)
            .SingleOrDefaultAsync(
                item => item.Id == paymentProofId && item.Order.OwnerUserId == userId,
                cancellationToken);

        return proof is null
            ? throw NotFound()
            : TagDtoMapper.ToPaymentProofResponse(proof);
    }

    private static ApiException NotFound()
    {
        return new ApiException(
            StatusCodes.Status404NotFound,
            "not_found",
            "Payment proof was not found.");
    }

    private static ApiException Unauthorized()
    {
        return new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");
    }
}
